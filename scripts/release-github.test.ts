import { describe, expect, it } from "bun:test";
import {
  type CommandResult,
  ensurePackageReleases,
  packageReleaseTag,
  parsePackageReleaseIdentities,
  provenanceCommitFromAttestations,
} from "./release-github.js";

const sha = "a".repeat(40);

function result(exitCode: number, stdout = "", stderr = ""): CommandResult {
  return { exitCode, stdout, stderr };
}

describe("independent package GitHub releases", () => {
  it("accepts an ordered mixed-version subset", () => {
    const packages = parsePackageReleaseIdentities(
      JSON.stringify([
        { name: "@sheetwrite/core", version: "0.3.0" },
        { name: "@sheetwrite/react", version: "0.2.1" },
      ]),
    );
    expect(packages).toEqual([
      { name: "@sheetwrite/core", version: "0.3.0" },
      { name: "@sheetwrite/react", version: "0.2.1" },
    ]);
    expect(packageReleaseTag(packages[0]!)).toBe("@sheetwrite/core@0.3.0");
    expect(() =>
      parsePackageReleaseIdentities(
        JSON.stringify([
          { name: "@sheetwrite/react", version: "0.2.1" },
          { name: "@sheetwrite/core", version: "0.3.0" },
        ]),
      ),
    ).toThrow("dependency order");
  });
  it("reads the immutable source commit from npm provenance", () => {
    const payload = Buffer.from(
      JSON.stringify({
        predicate: {
          buildDefinition: { resolvedDependencies: [{ digest: { gitCommit: sha } }] },
        },
      }),
    ).toString("base64");
    expect(
      provenanceCommitFromAttestations({
        attestations: [
          {
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: { dsseEnvelope: { payload } },
          },
        ],
      }),
    ).toBe(sha);
  });

  it("creates missing tags and releases while verifying completed ones", async () => {
    const commands: string[][] = [];
    const packages = [
      { name: "@sheetwrite/wasm", version: "0.2.0" },
      { name: "@sheetwrite/core", version: "0.3.0" },
    ];
    await ensurePackageReleases(
      packages,
      packages,
      sha,
      async (command) => {
        commands.push([...command]);
        const rendered = command.join(" ");
        if (rendered.includes("rev-parse") && rendered.includes("wasm")) return result(1);
        if (rendered.includes("rev-parse") && rendered.includes("core")) return result(0, sha);
        if (rendered.includes("release view") && rendered.includes("wasm")) return result(1);
        if (rendered.includes("release view") && rendered.includes("core")) {
          return result(
            0,
            JSON.stringify({
              tagName: "@sheetwrite/core@0.3.0",
              isDraft: false,
              isPrerelease: false,
            }),
          );
        }
        return result(0);
      },
      async () => sha,
    );

    const rendered = commands.map((command) => command.join("\n"));
    expect(rendered).toContain(`git\ntag\n@sheetwrite/wasm@0.2.0\n${sha}`);
    expect(rendered).toContain("git\npush\norigin\nrefs/tags/@sheetwrite/wasm@0.2.0");
    expect(rendered.some((command) => command.includes("release\ncreate\n@sheetwrite/wasm"))).toBe(
      true,
    );
    expect(rendered.some((command) => command.includes("release\ncreate\n@sheetwrite/core"))).toBe(
      false,
    );
  });

  it("accepts an older attested commit for a previously published package", async () => {
    const previousCommit = "b".repeat(40);
    const identity = { name: "@sheetwrite/core", version: "0.2.0" };
    await ensurePackageReleases(
      [identity],
      [],
      sha,
      async (command) => {
        if (command.includes("rev-parse")) return result(0, previousCommit);
        if (command.includes("view")) {
          return result(
            0,
            JSON.stringify({
              tagName: "@sheetwrite/core@0.2.0",
              isDraft: false,
              isPrerelease: false,
            }),
          );
        }
        throw new Error(`Unexpected command ${command.join(" ")}`);
      },
      async () => previousCommit,
    );
  });

  it("fails closed when an existing package tag targets another commit", async () => {
    const identity = { name: "@sheetwrite/xlsx", version: "0.2.0" };
    await expect(
      ensurePackageReleases(
        [identity],
        [identity],
        sha,
        async () => result(0, "b".repeat(40)),
        async () => sha,
      ),
    ).rejects.toThrow("expected");
  });
});
