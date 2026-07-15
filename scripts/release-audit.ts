import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyReleaseArtifacts } from "./release-artifacts.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const evidenceRoot = join(repositoryRoot, "test-results/dependency-audit");

interface NpmAuditMetadata {
  readonly vulnerabilities?: Readonly<Record<string, number>>;
}

interface NpmAuditReport {
  readonly metadata?: NpmAuditMetadata;
}

async function audit(
  name: string,
  cwd: string,
  options: readonly string[],
  blocking: boolean,
): Promise<NpmAuditReport> {
  const child = Bun.spawn(
    ["npm", "audit", "--package-lock-only", "--json", "--audit-level=high", ...options],
    { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await Promise.all([
    writeFile(join(evidenceRoot, `${name}.json`), stdout),
    writeFile(join(evidenceRoot, `${name}.stderr.txt`), stderr),
  ]);
  let report: NpmAuditReport;
  try {
    report = JSON.parse(stdout) as NpmAuditReport;
  } catch (error) {
    throw new Error(
      `${name} npm audit returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (exitCode !== 0 && (blocking || exitCode !== 1)) {
    throw new Error(`${name} npm audit failed with exit code ${exitCode}: ${stderr.trim()}`);
  }
  return report;
}

function findingCount(report: NpmAuditReport): number {
  return Object.entries(report.metadata?.vulnerabilities ?? {})
    .filter(([severity]) => severity !== "total")
    .reduce((total, [, count]) => total + count, 0);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function cli(): Promise<void> {
  const artifactDirectory = optionValue("--artifacts");
  if (artifactDirectory === undefined) throw new Error("Release audit requires --artifacts");
  await verifyReleaseArtifacts(resolve(artifactDirectory));
  await mkdir(evidenceRoot, { recursive: true });

  const production = await audit(
    "npm-runtime",
    join(repositoryRoot, "test/release-locks/core-xlsx"),
    ["--omit=dev"],
    true,
  );
  const fixtureDirectories = [
    ["npm-fixture-consumer", "test/consumer"],
    ["npm-fixture-vite", "test/bundler-fixtures/vite"],
    ["npm-fixture-webpack", "test/bundler-fixtures/webpack"],
    ["npm-fixture-next", "test/bundler-fixtures/next"],
  ] as const;
  const fixtures = await Promise.all(
    fixtureDirectories.map(([name, path]) =>
      audit(name, join(repositoryRoot, path), ["--include=dev"], false),
    ),
  );
  console.log(
    `Locked npm runtime audit passed: ${findingCount(production)} low/moderate finding(s); fixture/dev audits recorded ${fixtures.reduce((total, report) => total + findingCount(report), 0)} finding(s)`,
  );
}

if (import.meta.main) await cli();
