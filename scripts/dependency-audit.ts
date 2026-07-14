import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type AuditSeverity = "low" | "moderate" | "high" | "critical";

export interface AuditFinding {
  readonly package: string;
  readonly advisory: string;
  readonly severity: AuditSeverity;
  readonly title: string;
  readonly url: string;
}

export interface AuditAllowance {
  readonly advisory: string;
  readonly package: string;
  readonly owner: string;
  readonly reason: string;
  readonly expires: string;
}

export interface AuditCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface AuditPolicyFile {
  readonly allowlist?: readonly AuditAllowance[];
}

export interface AuditPolicyResult {
  readonly findings: readonly AuditFinding[];
  readonly allowedBlockingFindings: readonly AuditFinding[];
  readonly nonBlockingFindings: readonly AuditFinding[];
}

const BLOCKING_SEVERITIES: Readonly<Record<AuditSeverity, boolean>> = {
  low: false,
  moderate: false,
  high: true,
  critical: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function advisoryIdentity(url: string, id: unknown): string {
  const slug = url.match(/\/(GHSA-[A-Za-z0-9-]+|CVE-[A-Za-z0-9-]+)$/i)?.[1];
  if (slug) return slug.toUpperCase();
  if (typeof id === "number" || typeof id === "string") return String(id);
  throw new Error("Audit advisory is missing an identity");
}

export function parseAuditOutput(stdout: string): readonly AuditFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Bun audit returned malformed JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (!isRecord(parsed)) throw new Error("Bun audit JSON must be an object keyed by package");

  const findings: AuditFinding[] = [];
  for (const [packageName, advisories] of Object.entries(parsed)) {
    if (!Array.isArray(advisories)) {
      throw new Error(`Bun audit entry for ${packageName} must be an array`);
    }
    for (const advisory of advisories) {
      if (!isRecord(advisory))
        throw new Error(`Bun audit advisory for ${packageName} must be an object`);
      const severity = advisory.severity;
      const title = advisory.title;
      const url = advisory.url;
      if (
        (severity !== "low" &&
          severity !== "moderate" &&
          severity !== "high" &&
          severity !== "critical") ||
        typeof title !== "string" ||
        typeof url !== "string"
      ) {
        throw new Error(`Bun audit advisory for ${packageName} has an invalid schema`);
      }
      findings.push({
        package: packageName,
        advisory: advisoryIdentity(url, advisory.id),
        severity,
        title,
        url,
      });
    }
  }
  return findings.sort((left, right) =>
    `${left.package}:${left.advisory}`.localeCompare(`${right.package}:${right.advisory}`),
  );
}

function validateAllowance(allowance: AuditAllowance, today: string): void {
  for (const field of ["advisory", "package", "owner", "reason", "expires"] as const) {
    if (typeof allowance[field] !== "string" || allowance[field].trim() === "") {
      throw new Error(`Audit allowance has an empty ${field}`);
    }
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(allowance.expires) ||
    Number.isNaN(Date.parse(allowance.expires))
  ) {
    throw new Error(`Audit allowance ${allowance.advisory} has an invalid expiry`);
  }
  if (allowance.expires < today) {
    throw new Error(`Audit allowance ${allowance.advisory} expired on ${allowance.expires}`);
  }
}

export function evaluateAuditPolicy(
  command: AuditCommandResult,
  allowlist: readonly AuditAllowance[],
  today = new Date().toISOString().slice(0, 10),
): AuditPolicyResult {
  if (command.stdout.trim() === "") {
    throw new Error(
      `Bun audit produced no JSON${command.stderr ? `: ${command.stderr.trim()}` : ""}`,
    );
  }
  const findings = parseAuditOutput(command.stdout);
  if (command.exitCode !== 0 && command.exitCode !== 1) {
    throw new Error(
      `Bun audit failed with exit code ${command.exitCode}: ${command.stderr.trim()}`,
    );
  }
  if (command.exitCode === 0 && findings.length > 0) {
    throw new Error("Bun audit returned findings with a success exit code");
  }
  if (command.exitCode === 1 && findings.length === 0) {
    throw new Error(`Bun audit failed without findings: ${command.stderr.trim()}`);
  }

  const allowanceKeys = new Set<string>();
  for (const allowance of allowlist) {
    validateAllowance(allowance, today);
    const key = `${allowance.package}:${allowance.advisory.toUpperCase()}`;
    if (allowanceKeys.has(key)) throw new Error(`Duplicate audit allowance for ${key}`);
    allowanceKeys.add(key);
  }

  const blocking = findings.filter((finding) => BLOCKING_SEVERITIES[finding.severity]);
  const allowedBlockingFindings: AuditFinding[] = [];
  const unowned: AuditFinding[] = [];
  for (const finding of blocking) {
    if (allowanceKeys.has(`${finding.package}:${finding.advisory}`))
      allowedBlockingFindings.push(finding);
    else unowned.push(finding);
  }
  if (unowned.length > 0) {
    throw new Error(
      `Unallowlisted high/critical production dependency findings: ${unowned
        .map((finding) => `${finding.package}/${finding.advisory}`)
        .join(", ")}`,
    );
  }
  return {
    findings,
    allowedBlockingFindings,
    nonBlockingFindings: findings.filter((finding) => !BLOCKING_SEVERITIES[finding.severity]),
  };
}

export async function runDependencyAudit(root = resolve(import.meta.dir, "..")): Promise<void> {
  const child = Bun.spawn(["bun", "audit", "--json"], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const artifactRoot = resolve(root, "test-results/dependency-audit");
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(resolve(artifactRoot, "bun-audit.json"), stdout);
  await writeFile(resolve(artifactRoot, "bun-audit.stderr.txt"), stderr);

  const policyPath = resolve(root, "scripts/dependency-audit-allowlist.json");
  const policyFile = JSON.parse(await readFile(policyPath, "utf8")) as AuditPolicyFile;
  if (!Array.isArray(policyFile.allowlist))
    throw new Error("Audit policy must contain an allowlist array");
  const result = evaluateAuditPolicy({ stdout, stderr, exitCode }, policyFile.allowlist);
  const reportPath = resolve(artifactRoot, "policy-result.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `JavaScript dependency audit passed: ${result.findings.length} finding(s), ${result.allowedBlockingFindings.length} reviewed high/critical allowance(s)`,
  );
}

if (import.meta.main) {
  runDependencyAudit().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
