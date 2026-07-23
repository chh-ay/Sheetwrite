import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadFormulaContractInventory,
  renderFormulaFunctionContract,
} from "../../scripts/formula-docs.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");

type FormulaInventory = {
  functions: Array<{
    canonical: string;
    aliases: string[];
    contractStatus: "required-supported" | "supported";
  }>;
  unsupportedCategories: Array<{ id: string }>;
};

describe("generated formula documentation contract", () => {
  it("projects every contracted function and unsupported category from the inventory", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const rendered = renderFormulaFunctionContract(inventory);
    const checked = await readFile(
      join(REPO_ROOT, "docs/src/content/docs/reference/formula-functions.md"),
      "utf8",
    );
    expect(checked).toBe(rendered);
    const canonicalRows = [...rendered.matchAll(/^\| `([A-Z][A-Z0-9.]*)`/gmu)].map(
      ([, name]) => name,
    );

    expect(new Set(canonicalRows)).toEqual(
      new Set(inventory.functions.map(({ canonical }) => canonical)),
    );
    expect(canonicalRows).toHaveLength(154);
    expect(rendered.match(/\| required target \|/gu)).toHaveLength(100);
    expect(rendered.match(/\| incumbent \|/gu)).toHaveLength(54);
    for (const formula of inventory.functions) {
      for (const alias of formula.aliases) expect(rendered).toContain(`\`${alias}\``);
    }
    for (const category of inventory.unsupportedCategories) {
      expect(rendered).toContain(`(\`${category.id}\`)`);
    }
  });

  it("publishes the exact bounded and dialect limitations without unvalidated timings", async () => {
    const inventory = await loadFormulaContractInventory(REPO_ROOT);
    const rendered = renderFormulaFunctionContract(inventory);

    for (const statement of [
      "at most 126 bindings and 16,384 expanded AST nodes",
      "1,000,000 cells",
      "64 MiB",
      "2,000,000 cell operations",
      "14 bracket steps",
      "at most 100 solve steps",
      "Google Sheets and OpenFormula behavior is unverified",
      "No formula throughput or latency number is published",
      "network/external-data functions",
      "database functions",
      "cube/OLAP functions",
      "`LAMBDA`/higher-order execution",
    ]) {
      expect(rendered).toContain(statement);
    }
    expect(rendered).not.toMatch(/\b53(?:-name| names?| functions?)\b/iu);
    expect(rendered).not.toMatch(/\b\d+(?:\.\d+)?% compatible\b/iu);
    expect(rendered).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|ops\/s)\b/iu);
  });

  it("fails generation when the required-supported target set is incomplete", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const incomplete = structuredClone(inventory);
    const index = incomplete.functions.findIndex(
      ({ contractStatus }) => contractStatus === "required-supported",
    );
    incomplete.functions.splice(index, 1);

    expect(() => renderFormulaFunctionContract(incomplete)).toThrow(
      "requires 100 required-supported functions; found 99",
    );
  });

  it("keeps the authored guide explicit about high-risk semantic boundaries", async () => {
    const guide = await readFile(
      join(REPO_ROOT, "docs/src/content/docs/guides/formulas.md"),
      "utf8",
    );

    for (const statement of [
      "Shapes are exact row-by-column dimensions",
      "same exact row-by-column shape",
      "Codes `101`–`111` are deliberately unsupported",
      "pending hidden-row provenance",
      "Bindings are lazy",
      "serial `60`",
      "host-locale neutral",
      "No formula throughput or latency number is published",
    ]) {
      expect(guide).toContain(statement);
    }
    expect(guide).not.toMatch(/\b53(?:-name| names?| functions?)\b/iu);
    expect(guide).not.toMatch(/\b\d+(?:\.\d+)?% compatible\b/iu);
  });
});
