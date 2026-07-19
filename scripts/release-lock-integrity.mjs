import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Rebind local canonical tarball entries in a copied npm manifest and lockfile.
 * Registry entries and the rest of the resolved graph remain byte-for-byte equivalent.
 *
 * @param {string} lockPath
 * @param {ReadonlyMap<string, string>} tarballs package name to canonical tarball path
 */
export async function bindCanonicalTarballIntegrities(lockPath, tarballs) {
  const manifestPath = join(dirname(lockPath), "package.json");
  const [lockSource, manifestSource] = await Promise.all([
    readFile(lockPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const lock = JSON.parse(lockSource);
  const manifest = JSON.parse(manifestSource);
  if (
    lock === null ||
    typeof lock !== "object" ||
    lock.packages === null ||
    typeof lock.packages !== "object"
  ) {
    throw new Error(`${lockPath} has no npm package graph`);
  }
  if (manifest === null || typeof manifest !== "object") {
    throw new Error(`${manifestPath} has no npm package manifest`);
  }

  const canonicalPackages = new Map();
  for (const [packageName, tarballPath] of tarballs) {
    const filename = basename(tarballPath);
    const prefix = `${packageName.replace(/^@/, "").replaceAll("/", "-")}-`;
    const version =
      filename.startsWith(prefix) && filename.endsWith(".tgz")
        ? filename.slice(prefix.length, -".tgz".length)
        : "";
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new Error(`${tarballPath} has no canonical stable package version`);
    }
    const bytes = await readFile(tarballPath);
    canonicalPackages.set(packageName, {
      filename,
      version,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }

  const rebindFileReference = (value, filename, label) => {
    if (typeof value !== "string" || !value.startsWith("file:")) {
      throw new Error(`${label} is not a local tarball reference`);
    }
    const separator = value.lastIndexOf("/");
    return `${separator < 0 ? "file:" : value.slice(0, separator + 1)}${filename}`;
  };

  for (const [packageName, canonical] of canonicalPackages) {
    const packagePath = `node_modules/${packageName}`;
    const locked = lock.packages[packagePath];
    if (locked === null || typeof locked !== "object" || typeof locked.resolved !== "string") {
      throw new Error(`${lockPath} does not bind canonical tarball ${packageName}`);
    }
    locked.version = canonical.version;
    locked.resolved = rebindFileReference(
      locked.resolved,
      canonical.filename,
      `${packagePath} resolved`,
    );
    locked.integrity = canonical.integrity;

    for (const field of ["dependencies", "devDependencies"]) {
      const manifestDependencies = manifest[field];
      if (
        manifestDependencies !== null &&
        typeof manifestDependencies === "object" &&
        packageName in manifestDependencies
      ) {
        manifestDependencies[packageName] = rebindFileReference(
          manifestDependencies[packageName],
          canonical.filename,
          `${manifestPath} ${field}.${packageName}`,
        );
      }
      const rootDependencies = lock.packages[""]?.[field];
      if (
        rootDependencies !== null &&
        typeof rootDependencies === "object" &&
        packageName in rootDependencies
      ) {
        rootDependencies[packageName] = rebindFileReference(
          rootDependencies[packageName],
          canonical.filename,
          `${lockPath} ${field}.${packageName}`,
        );
      }
    }
  }

  for (const [packagePath, locked] of Object.entries(lock.packages)) {
    if (packagePath === "" || locked === null || typeof locked !== "object") continue;
    for (const field of ["dependencies", "optionalDependencies"]) {
      const dependencies = locked[field];
      if (dependencies === null || typeof dependencies !== "object") continue;
      for (const [packageName, canonical] of canonicalPackages) {
        if (packageName in dependencies) dependencies[packageName] = canonical.version;
      }
    }
  }

  await Promise.all([
    writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
}
