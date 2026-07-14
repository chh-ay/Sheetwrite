import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseControlledBaseline } from "../src/controlled-baseline.js";
import { generateBaseline } from "../src/generate-baseline.js";
import { makeRenderArtifact, TEST_RUNNER } from "./gate-fixtures.js";

describe("reviewed controlled baseline generation", () => {
  let directory = "";
  let rawPath = "";
  let approvedPath = "";

  beforeAll(() => {
    directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-baseline-"));
    rawPath = resolve(directory, "raw.json");
    approvedPath = resolve(directory, "approved.json");
    writeFileSync(rawPath, `${JSON.stringify(makeRenderArtifact({ rounds: 10 }), null, 2)}\n`);
    writeFileSync(approvedPath, "approved sentinel\n");
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  test("is byte-stable for fixed raw input and preserves all raw rounds", async () => {
    const firstPath = resolve(directory, "candidate-a.json");
    const secondPath = resolve(directory, "candidate-b.json");
    const common = [
      "--input",
      rawPath,
      "--approved",
      approvedPath,
      "--power-mode",
      TEST_RUNNER.powerMode,
      "--concurrency",
      String(TEST_RUNNER.concurrency),
      "--diagnostic",
    ];
    await generateBaseline([...common, "--output", firstPath]);
    await generateBaseline([...common, "--output", secondPath]);
    expect(readFileSync(firstPath, "utf8")).toBe(readFileSync(secondPath, "utf8"));
    const candidate = parseControlledBaseline(
      JSON.parse(readFileSync(firstPath, "utf8")) as unknown,
    );
    expect(candidate.source.rounds).toBe(10);
    expect(candidate.source.rawArtifact).toBe(rawPath);
    expect(candidate.cells.every((cell) => cell.samplesMs.length === 30)).toBe(true);
  });

  test("never overwrites the approved baseline without explicit write intent", async () => {
    const candidatePath = resolve(directory, "candidate.json");
    await generateBaseline([
      "--input",
      rawPath,
      "--output",
      candidatePath,
      "--approved",
      approvedPath,
      "--power-mode",
      TEST_RUNNER.powerMode,
      "--concurrency",
      String(TEST_RUNNER.concurrency),
      "--diagnostic",
    ]);
    expect(readFileSync(approvedPath, "utf8")).toBe("approved sentinel\n");
    await expect(
      generateBaseline([
        "--input",
        rawPath,
        "--output",
        approvedPath,
        "--approved",
        approvedPath,
        "--power-mode",
        TEST_RUNNER.powerMode,
        "--concurrency",
        "1",
        "--diagnostic",
      ]),
    ).rejects.toThrow("without --write-baseline");
    await expect(generateBaseline(["--diagnostic", "--write-baseline"])).rejects.toThrow(
      "review candidates only",
    );
  });
});
