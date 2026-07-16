import { beforeAll, describe, expect, it } from "bun:test";
import { analyzeImportGraph, readTypeScriptSources } from "../../../scripts/check-import-cycles.js";

let coreSources: Map<string, string>;

beforeAll(async () => {
  coreSources = await readTypeScriptSources("packages/core/src");
});

describe("core import ownership", () => {
  it("keeps the live core graph acyclic and store collaborators behind the facade", () => {
    expect(analyzeImportGraph(coreSources)).toEqual([]);
  });

  it("rejects an import cycle", () => {
    const fixture = new Map([
      ["fixture/a.ts", 'import "./b.js";'],
      ["fixture/b.ts", 'import "./c.js";'],
      ["fixture/c.ts", 'import "./a.js";'],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(expect.objectContaining({ kind: "cycle" }));
  });

  it("rejects a store leaf importing the public facade", () => {
    const fixture = new Map([
      ["packages/core/src/store.ts", "export class SheetwriteStore {}"],
      ["packages/core/src/store/ranges.ts", 'import type { SheetwriteStore } from "../store.js";'],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(
      expect.objectContaining({ kind: "leaf-facade" }),
    );
  });
  it("rejects internal imports from the broad public type facade", () => {
    const fixture = new Map([
      ["packages/core/src/internal.ts", 'import type { CellAddress } from "./types.js";'],
      ["packages/core/src/types.ts", 'export type * from "./types/coordinates.js";'],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(
      expect.objectContaining({ kind: "type-barrel" }),
    );
  });

  it("rejects a reverse type-domain dependency", () => {
    const fixture = new Map([
      [
        "packages/core/src/types/coordinates.ts",
        'import type { Grid } from "./grid.js"; export type SheetId = string;',
      ],
      ["packages/core/src/types/grid.ts", "export interface Grid {}"],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(
      expect.objectContaining({ kind: "type-edge" }),
    );
  });

  it("rejects duplicate public type ownership", () => {
    const fixture = new Map(coreSources);
    const cellPath = "packages/core/src/types/cell.ts";
    fixture.set(
      cellPath,
      `${fixture.get(cellPath)}\nexport interface CellAddress { duplicate: true }\n`,
    );
    expect(analyzeImportGraph(fixture)).toContainEqual(
      expect.objectContaining({
        kind: "type-owner",
        message: expect.stringContaining("CellAddress"),
      }),
    );
  });
});
