import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const WASM_PACK_VERSION = "0.15.0";

interface WasmPackRelease {
  readonly target: string;
  readonly sha256: string;
}

export const WASM_PACK_RELEASES: Readonly<Record<string, WasmPackRelease>> = {
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    sha256: "0abff4a03d670b6c00ea31d0e1608a72407e355f3d3765e9c30eb45cd5b7e318",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    sha256: "d3f1a4a33e95f8f0d7801b024e08624c479999ac96aa150908b2394015cd0363",
  },
  "linux-arm64": {
    target: "aarch64-unknown-linux-musl",
    sha256: "e17ef0806381c3a0acb9c9ddad643a49facaa5a2ecf657a421d4d8f3357a24b7",
  },
  "linux-x64": {
    target: "x86_64-unknown-linux-musl",
    sha256: "c09f971ecaed9a2efc80fdcea7a00ef6b53c7fadc8c57d1f61b53a6aa66b668a",
  },
  "win32-x64": {
    target: "x86_64-pc-windows-msvc",
    sha256: "518dc51180c7bc864699c9279b3bc99025bc109123e0249a34ba34d130a509bf",
  },
};

async function run(command: readonly [string, ...string[]], cwd?: string): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

export async function installWasmPack(): Promise<void> {
  const release = WASM_PACK_RELEASES[`${process.platform}-${process.arch}`];
  if (!release) {
    throw new Error(`No reviewed wasm-pack binary for ${process.platform}-${process.arch}`);
  }
  const archiveName = `wasm-pack-v${WASM_PACK_VERSION}-${release.target}.tar.gz`;
  const url = `https://github.com/wasm-bindgen/wasm-pack/releases/download/v${WASM_PACK_VERSION}/${archiveName}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const digest = new Bun.CryptoHasher("sha256").update(archive).digest("hex");
  if (digest !== release.sha256) {
    throw new Error(
      `Checksum mismatch for ${archiveName}: expected ${release.sha256}, received ${digest}`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "sheetwrite-wasm-pack-"));
  try {
    const archivePath = join(temporaryRoot, archiveName);
    await writeFile(archivePath, archive);
    await run(["tar", "-xzf", archivePath, "-C", temporaryRoot]);
    const executableName = process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack";
    const source = join(
      temporaryRoot,
      `wasm-pack-v${WASM_PACK_VERSION}-${release.target}`,
      executableName,
    );
    const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin");
    const destination = join(cargoBin, executableName);
    await mkdir(cargoBin, { recursive: true });
    await copyFile(source, destination);
    if (process.platform !== "win32") await chmod(destination, 0o755);
    await run([destination, "--version"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  installWasmPack().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
