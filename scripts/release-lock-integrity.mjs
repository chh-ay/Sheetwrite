import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Rebind only local canonical tarball entries in a copied npm lockfile.
 * Registry entries and the rest of the resolved graph remain byte-for-byte equivalent.
 *
 * @param {string} lockPath
 * @param {ReadonlyMap<string, string>} tarballs package name to canonical tarball path
 */
export async function bindCanonicalTarballIntegrities(lockPath, tarballs) {
  const source = await readFile(lockPath, "utf8");
  const lock = JSON.parse(source);
  if (
    lock === null ||
    typeof lock !== "object" ||
    lock.packages === null ||
    typeof lock.packages !== "object"
  ) {
    throw new Error(`${lockPath} has no npm package graph`);
  }

  const byFilename = new Map();
  for (const [packageName, tarballPath] of tarballs) {
    const bytes = await readFile(tarballPath);
    byFilename.set(basename(tarballPath), {
      packageName,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }

  const bound = new Set();
  for (const entry of Object.values(lock.packages)) {
    if (entry === null || typeof entry !== "object" || typeof entry.resolved !== "string") continue;
    if (!entry.resolved.startsWith("file:")) continue;
    const canonical = byFilename.get(basename(entry.resolved));
    if (canonical === undefined) continue;
    entry.integrity = canonical.integrity;
    bound.add(canonical.packageName);
  }

  for (const packageName of tarballs.keys()) {
    if (!bound.has(packageName)) {
      throw new Error(`${lockPath} does not bind canonical tarball ${packageName}`);
    }
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
