import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPOSITORY_ROOT = resolve(import.meta.dir, "..");

export function releaseVersionFromHeadRef(headRef: string | undefined): string | undefined {
  return headRef !== undefined && STABLE_VERSION.test(headRef) ? headRef : undefined;
}

export function validateReleasePackageVersions(version: string, root = REPOSITORY_ROOT): void {
  for (const name of PUBLISHABLE_PACKAGE_ORDER) {
    const directory = name.slice("@sheetwrite/".length);
    const manifest = JSON.parse(
      readFileSync(resolve(root, "packages", directory, "package.json"), "utf8"),
    ) as { readonly name?: unknown; readonly version?: unknown };
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(
        `Release branch ${version} requires ${name}@${version}, observed ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const releaseVersion = releaseVersionFromHeadRef(process.env.GITHUB_HEAD_REF);
  if (releaseVersion !== undefined) {
    validateReleasePackageVersions(releaseVersion);
    console.log(`Release package versions match branch ${releaseVersion}`);
    return;
  }
  const child = Bun.spawn(["bun", "run", "changeset:status", "--", "--since=origin/develop"], {
    cwd: REPOSITORY_ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

if (import.meta.main) await main();
