import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePublicApi, validateManifest } from "./public-api.js";

const roots: string[] = [];

const canonicalDeclarations = `
export type DocumentOp = { op: "set" };
export interface DataSource { getRows(request: unknown): Promise<unknown>; }
export interface ChangeEvent { transaction: { patches: DocumentOp[] }; }
export interface Store { applyTransaction(tx: { patches: DocumentOp[] }): void; }
export interface XlsxTableExportBackend { toXlsxTable(): Promise<Uint8Array>; }
export interface XlsxTableImportBackend { fromXlsxTable(): Promise<unknown>; }
export interface XlsxWorkbookBackend { toXlsxWorkbook(): Promise<Uint8Array>; }
export declare function toXlsxTable(): Promise<Uint8Array>;
export declare function fromXlsxTable(): Promise<unknown>;
export declare function setXlsxTableExportBackend(backend: XlsxTableExportBackend): void;
export declare function setXlsxTableImportBackend(backend: XlsxTableImportBackend): void;
export declare function toXlsxWorkbook(): Promise<Uint8Array>;
export declare function fromXlsxWorkbook(): Promise<unknown>;
export declare function setXlsxWorkbookBackend(backend: XlsxWorkbookBackend): void;
`;

async function fixture(index = canonicalDeclarations): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-api-policy-"));
  roots.push(root);
  const packageRoot = join(root, "packages/core");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@sheetwrite/core",
      types: "./index.d.ts",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    }),
  );
  await writeFile(join(packageRoot, "index.d.ts"), index);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("public API policy", () => {
  it("accepts the canonical surface and emits byte-stable normalized JSON", async () => {
    const root = await fixture();
    const first = await analyzePublicApi(root);
    const second = await analyzePublicApi(root);
    expect(first.issues).toEqual([]);
    expect(`${JSON.stringify(first.manifest, null, 2)}\n`).toBe(
      `${JSON.stringify(second.manifest, null, 2)}\n`,
    );
  });

  it("rejects a forbidden compatibility alias", async () => {
    const root = await fixture(`${canonicalDeclarations}\nexport type Patch = DocumentOp;\n`);
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "forbidden-export", symbol: "Patch" }),
    );
  });

  it("rejects a public symbol with the forbidden JSDoc tag", async () => {
    const marker = `${"/** @"}deprecated old name */`;
    const root = await fixture(
      canonicalDeclarations.replace("export type DocumentOp", `${marker}\nexport type DocumentOp`),
    );
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "deprecated-symbol", symbol: "DocumentOp" }),
    );
  });

  it("rejects a missing canonical symbol", async () => {
    const root = await fixture(
      canonicalDeclarations.replace(
        "export interface DataSource { getRows(request: unknown): Promise<unknown>; }",
        "",
      ),
    );
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-export", symbol: "DataSource" }),
    );
  });

  it("rejects ambiguous duplicate re-exports", async () => {
    const root = await fixture(
      `${canonicalDeclarations}\nexport * from "./left.js";\nexport * from "./right.js";\n`,
    );
    await writeFile(
      join(root, "packages/core/left.d.ts"),
      "export interface Duplicate { left: true }\n",
    );
    await writeFile(
      join(root, "packages/core/right.d.ts"),
      "export interface Duplicate { right: true }\n",
    );
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "duplicate-export" }));
  });

  it("rejects an unresolved public declaration entry", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "packages/core/package.json"),
      JSON.stringify({ name: "@sheetwrite/core", exports: { ".": { types: "./missing.d.ts" } } }),
    );
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unresolved-entry" }));
  });

  it("rejects malformed or partial reports", () => {
    expect(validateManifest({ formatVersion: 1, packages: [{ name: "partial" }] })).toContainEqual(
      expect.objectContaining({ code: "malformed-report" }),
    );
  });
});
