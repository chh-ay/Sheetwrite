import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyReleaseArtifacts } from "./release-artifacts.js";

const artifactRoot = resolve(process.argv[2] ?? "test-results/release-artifacts");
const repositoryRoot = resolve(import.meta.dir, "..");
const manifest = await verifyReleaseArtifacts(artifactRoot);

for (const artifact of manifest.packages) {
  const directory = artifact.name.slice("@sheetwrite/".length);
  const packageRoot = join(repositoryRoot, "packages", directory);
  const generatedFiles = artifact.files.filter(
    (file) =>
      file === "dist" || file.startsWith("dist/") || file === "pkg" || file.startsWith("pkg/"),
  );
  if (generatedFiles.length === 0) {
    throw new Error(`${artifact.name} has no generated runtime files to hydrate`);
  }
  await rm(join(packageRoot, "dist"), { recursive: true, force: true });
  await rm(join(packageRoot, "pkg"), { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  const child = Bun.spawn(
    [
      "tar",
      "-xzf",
      join(artifactRoot, artifact.path),
      "-C",
      packageRoot,
      "--strip-components=1",
      ...generatedFiles.map((file) => `package/${file}`),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error(`Could not hydrate ${artifact.name}: ${stderr}`);
}

console.log(`Hydrated generated outputs from ${manifest.packages.length} canonical tarballs`);
