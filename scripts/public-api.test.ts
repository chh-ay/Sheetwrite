import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzePublicApi,
  checkManifestBaseline,
  publicApiDigest,
  validateManifest,
} from "./public-api.js";

const roots: string[] = [];

const canonicalDeclarations = `
/** Canonical document operation. */
export type DocumentOp = { op: "set" };
/** Cancellable host datasource contract. */
export interface DataSource { getRows(request: unknown): Promise<unknown>; }
/** Committed grid change payload. */
export interface ChangeEvent {
  /** Committed transaction body. */
  transaction: { patches: DocumentOp[] };
}
/** Low-level transaction store. */
export interface Store {
  /** Applies one transaction. */
  applyTransaction(tx: { patches: DocumentOp[] }): void;
}
/** Optional table export backend. */
export interface XlsxTableExportBackend { toXlsxTable(): Promise<Uint8Array>; }
/** Optional table import backend. */
export interface XlsxTableImportBackend { fromXlsxTable(): Promise<unknown>; }
/** Optional workbook backend. */
export interface XlsxWorkbookBackend { toXlsxWorkbook(): Promise<Uint8Array>; }
/** Exports a table through the registered backend. */
export declare function toXlsxTable(): Promise<Uint8Array>;
/** Imports a table through the registered backend. */
export declare function fromXlsxTable(): Promise<unknown>;
/** Registers table export. */
export declare function setXlsxTableExportBackend(backend: XlsxTableExportBackend): void;
/** Registers table import. */
export declare function setXlsxTableImportBackend(backend: XlsxTableImportBackend): void;
/** Exports a workbook through the registered backend. */
export declare function toXlsxWorkbook(): Promise<Uint8Array>;
/** Imports a workbook through the registered backend. */
export declare function fromXlsxWorkbook(): Promise<unknown>;
/** Registers workbook interchange. */
export declare function setXlsxWorkbookBackend(backend: XlsxWorkbookBackend): void;
/** Generic public fixture type. */
export interface Box<T extends string = string> { value: T; }
`;

async function fixture(
  index = canonicalDeclarations,
  extraFiles?: Record<string, string>,
): Promise<string> {
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
  for (const [name, content] of Object.entries(extraFiles ?? {})) {
    await writeFile(join(packageRoot, name), content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("re-export documentation", () => {
  it("reads JSDoc from named re-export statements", async () => {
    const root = await fixture(
      `${canonicalDeclarations}\nexport * from "./generated.js";\n/** Generated init source union. */\nexport type { GeneratedInput } from "./generated.js";\n`,
      { "generated.d.ts": "export type GeneratedInput = string | URL;\n" },
    );
    const { manifest } = await analyzePublicApi(root);
    const entry = manifest.packages[0]?.entryPoints[0];
    const generated = entry?.exports.find((candidate) => candidate.name === "GeneratedInput");
    expect(generated?.kind).toBe("type");
    expect(generated?.documentation).toBe("Generated init source union.");
  });

  it("keeps interface kind, signature, and member docs through re-exports", async () => {
    const root = await fixture(
      `${canonicalDeclarations}\nexport * from "./generated.js";\n/** Instantiated module exports. */\nexport type { GeneratedOutput } from "./generated.js";\n`,
      {
        "generated.d.ts":
          "export interface GeneratedOutput {\n  /** Shared linear memory. */\n  readonly memory: object;\n}\n",
      },
    );
    const { manifest } = await analyzePublicApi(root);
    const entry = manifest.packages[0]?.entryPoints[0];
    const generated = entry?.exports.find((candidate) => candidate.name === "GeneratedOutput");
    expect(generated?.kind).toBe("interface");
    expect(generated?.documentation).toBe("Instantiated module exports.");
    expect(generated?.signature).toContain("readonly memory: object;");
    expect(generated?.memberDocs).toEqual([
      { name: "memory", documentation: "Shared linear memory." },
    ]);
  });
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

  it("captures member-level documentation for structured exports", async () => {
    const root = await fixture();
    const { manifest } = await analyzePublicApi(root);
    const entry = manifest.packages[0]?.entryPoints[0];
    const changeEvent = entry?.exports.find((candidate) => candidate.name === "ChangeEvent");
    expect(changeEvent?.memberDocs).toEqual([
      { name: "transaction", documentation: "Committed transaction body." },
    ]);
    const store = entry?.exports.find((candidate) => candidate.name === "Store");
    expect(store?.memberDocs).toEqual([
      { name: "applyTransaction", documentation: "Applies one transaction." },
    ]);
  });

  it("rejects declaration merging that would join structural signatures", async () => {
    const root = await fixture(
      `${canonicalDeclarations}\n/** Merged augmentation. */\nexport interface DataSource { extra?: string; }\n`,
    );
    const { issues } = await analyzePublicApi(root);
    expect(
      issues.some(
        (issue) =>
          issue.code === "duplicate-export" &&
          issue.symbol === "DataSource" &&
          issue.message.includes("merges multiple structural declarations"),
      ),
    ).toBe(true);
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

  it("reports an exact unclassified package entry point", async () => {
    const root = await fixture();
    const packageRoot = join(root, "packages/unknown");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@sheetwrite/unknown",
        exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      }),
    );
    await writeFile(
      join(packageRoot, "index.d.ts"),
      "/** Unknown fixture. */\nexport type Unknown = true;\n",
    );
    const result = await analyzePublicApi(root);
    expect(result.issues).toContainEqual({
      code: "unclassified-entry",
      message: "@sheetwrite/unknown . (./index.d.ts) has no public API classification",
      package: "@sheetwrite/unknown",
      entryPoint: ".",
    });
  });

  it("rejects malformed or partial reports", () => {
    expect(validateManifest({ formatVersion: 2, packages: [{ name: "partial" }] })).toContainEqual(
      expect.objectContaining({ code: "malformed-report" }),
    );
  });

  it("detects optionality, union, generic-constraint, export-name, and JSDoc drift", async () => {
    const baselineRoot = await fixture();
    const baseline = await analyzePublicApi(baselineRoot);
    const expectedDigest = publicApiDigest(baseline.manifest);
    const mutations = [
      canonicalDeclarations.replace("getRows(request: unknown)", "getRows?(request: unknown)"),
      canonicalDeclarations.replace(
        'export type DocumentOp = { op: "set" };',
        'export type DocumentOp = { op: "set" } | { op: "clear" };',
      ),
      canonicalDeclarations.replace(
        "Box<T extends string = string>",
        "Box<T extends string | number = string>",
      ),
      canonicalDeclarations.replace("interface DataSource", "interface DataProvider"),
      canonicalDeclarations.replace(
        "/** Canonical document operation. */",
        "/** Changed document operation. */",
      ),
    ];

    const results = await Promise.all(
      mutations.map(async (mutation) => analyzePublicApi(await fixture(mutation))),
    );
    for (const result of results) {
      expect(checkManifestBaseline(result.manifest, expectedDigest)).toContainEqual(
        expect.objectContaining({ code: "manifest-drift" }),
      );
    }
  }, 20_000);
});
