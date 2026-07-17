import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bindCanonicalTarballIntegrities } from "./release-lock-integrity.mjs";

const repositoryRoot = resolve(import.meta.dir, "..");
const fixtureDirectories = [
  "test/consumer",
  "test/release-locks/core",
  "test/release-locks/react",
  "test/release-locks/vue",
  "test/release-locks/svelte",
  "test/release-locks/core-xlsx",
  "test/bundler-fixtures/vite",
  "test/bundler-fixtures/webpack",
  "test/bundler-fixtures/next",
] as const;

interface FixtureManifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface LockedPackage {
  readonly version?: string;
  readonly resolved?: string;
  readonly integrity?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface FixtureLock {
  readonly lockfileVersion?: number;
  readonly packages?: Readonly<Record<string, LockedPackage>>;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as T;
}

function dependencies(manifest: FixtureManifest): Readonly<Record<string, string>> {
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

describe("immutable release consumer locks", () => {
  it("commits a lockfile matching every release consumer manifest", () => {
    for (const directory of fixtureDirectories) {
      const manifest = json<FixtureManifest>(`${directory}/package.json`);
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      expect(lock.lockfileVersion).toBe(3);
      expect(lock.packages?.[""]?.dependencies ?? {}).toEqual(manifest.dependencies ?? {});
      expect(lock.packages?.[""]?.devDependencies ?? {}).toEqual(manifest.devDependencies ?? {});
      for (const [name, range] of Object.entries(dependencies(manifest))) {
        expect(range).toMatch(
          /^(?:file:(?:artifacts|\.\.\/\.packed)\/sheetwrite-[a-z]+-0\.1\.0\.tgz|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/,
        );
        if (name.startsWith("@sheetwrite/")) expect(range).toStartWith("file:");
      }
    }
  });

  it("locks registry and canonical tarball bytes with integrity hashes", () => {
    const internalIntegrities = new Map<string, string>();
    for (const directory of fixtureDirectories) {
      const lock = json<FixtureLock>(`${directory}/package-lock.json`);
      for (const [path, entry] of Object.entries(lock.packages ?? {})) {
        if (path === "") continue;
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
        if (entry.resolved?.startsWith("https://")) expect(entry.integrity).toMatch(/^sha512-/);
        if (!path.startsWith("node_modules/@sheetwrite/")) continue;
        expect(entry.resolved).toMatch(
          /^file:(?:artifacts|\.\.\/\.packed)\/sheetwrite-[a-z]+-0\.1\.0\.tgz$/,
        );
        expect(entry.integrity).toMatch(/^sha512-/);
        const packageName = path.slice("node_modules/".length);
        const existing = internalIntegrities.get(packageName);
        if (existing === undefined) internalIntegrities.set(packageName, entry.integrity!);
        else expect(entry.integrity).toBe(existing);
      }
    }
    expect([...internalIntegrities].map(([name]) => name).sort()).toEqual([
      "@sheetwrite/core",
      "@sheetwrite/react",
      "@sheetwrite/svelte",
      "@sheetwrite/vue",
      "@sheetwrite/wasm",
      "@sheetwrite/xlsx",
    ]);
  });

  it("uses npm ci for every bundler fixture install", () => {
    for (const directory of [
      "test/bundler-fixtures/vite",
      "test/bundler-fixtures/webpack",
      "test/bundler-fixtures/next",
    ]) {
      const build = json<FixtureManifest>(`${directory}/package.json`).scripts?.build;
      expect(build).toStartWith("npm ci --ignore-scripts");
      expect(build).not.toContain("npm install");
    }
  });

  it("rebinds only copied canonical tarball integrities", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-release-lock-"));
    const lockPath = join(root, "package-lock.json");
    const tarballPath = join(root, "sheetwrite-core-0.1.0.tgz");
    await writeFile(tarballPath, "canonical bytes");
    await writeFile(
      lockPath,
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/@sheetwrite/core": {
            resolved: "file:artifacts/sheetwrite-core-0.1.0.tgz",
            integrity: "sha512-stale",
          },
          "node_modules/react": {
            resolved: "https://registry.npmjs.org/react/-/react-19.1.0.tgz",
            integrity: "sha512-registry",
          },
        },
      })}\n`,
    );

    await bindCanonicalTarballIntegrities(lockPath, new Map([["@sheetwrite/core", tarballPath]]));
    const rebound = JSON.parse(await readFile(lockPath, "utf8")) as FixtureLock;
    expect(rebound.packages?.["node_modules/@sheetwrite/core"]?.integrity).toMatch(/^sha512-/);
    expect(rebound.packages?.["node_modules/@sheetwrite/core"]?.integrity).not.toBe("sha512-stale");
    expect(rebound.packages?.["node_modules/react"]?.integrity).toBe("sha512-registry");
  });
});
