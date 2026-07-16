import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  entrySlug,
  expectedGeneratedFiles,
  MIGRATION_MATRIX,
  parseFences,
  renderEntryPage,
  renderSymbolPage,
} from "./docs.js";
import type { ApiEntryPoint, ApiPackage, PublicApiManifest } from "./public-api.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

const coreEntry: ApiEntryPoint = {
  subpath: ".",
  target: "./dist/index.d.ts",
  source: "src/index.ts",
  kind: "typescript",
  classification: "supported",
  exports: [
    {
      name: "Grid",
      kind: "interface",
      signature:
        'interface Grid { applyTransaction(tx: unknown): unknown; rendererKind(): "canvas" | "worker"; }',
      owners: ["src/types/grid.ts"],
      source: "src/types/grid.ts#L10",
      jsDocTags: [],
      documentation: "Imperative grid handle.",
      memberDocs: [
        {
          name: "applyTransaction",
          documentation: "Applies a committed transaction to the {@link Grid}. Bypasses history.",
        },
      ],
    },
  ],
};
const corePackage: ApiPackage = {
  name: "@sheetwrite/core",
  entryPoints: [coreEntry],
};
const manifest: PublicApiManifest = {
  formatVersion: 2,
  packages: [corePackage],
};

describe("documentation generation", () => {
  it("uses stable slugs for root, subpath, and asset entry points", () => {
    expect(entrySlug("@sheetwrite/core", ".")).toBe("core");
    expect(entrySlug("@sheetwrite/core", "./shell")).toBe("core-shell");
    expect(entrySlug("@sheetwrite/core", "./styles.css")).toBe("core-styles-css");
  });

  it("separates entry indexes from focused, structured symbol pages", () => {
    const entryPage = renderEntryPage(corePackage, coreEntry);
    const first = renderSymbolPage(corePackage, coreEntry, coreEntry.exports[0]!);
    const second = renderSymbolPage(corePackage, coreEntry, coreEntry.exports[0]!);
    expect(first).toBe(second);
    expect(entryPage).toContain('href="/docs/api/core/grid/"');
    expect(entryPage).not.toContain("TypeScript declaration");
    expect(first).toContain("Imperative grid handle.");
    expect(first).toContain("packages/core/src/types/grid.ts#L10");
    expect(first).toContain('id="rendererkind"');
    expect(first).toContain('id="applytransaction"');
    expect(first).toContain('class="api-member"');
    expect(first).toContain("interface Grid {\n");
    expect(first).toContain(
      '<summary><code>applyTransaction</code> <span class="api-member-summary">Applies a committed transaction to the <a href="/docs/api/core/grid/"><code>Grid</code></a>.</span></summary>',
    );
    expect(first).toContain(
      '<p class="api-member-doc">Applies a committed transaction to the <a href="/docs/api/core/grid/"><code>Grid</code></a>. Bypasses history.</p>',
    );
  });

  it("generates an index and focused page for every classified symbol", async () => {
    const files = await expectedGeneratedFiles(manifest);
    expect(files.some((file) => file.path.endsWith("/api/core.md"))).toBe(true);
    expect(files.some((file) => file.path.endsWith("/api/index.md"))).toBe(true);
    expect(files.some((file) => file.path.endsWith("/api/core/grid.md"))).toBe(true);
    const inventory = files.find((file) => file.path.endsWith("package-entry-points.md"));
    expect(inventory?.content).toContain("supported");
  });

  it("keeps the old-guide migration matrix exhaustive with one intentional landing consolidation", () => {
    expect(Object.keys(MIGRATION_MATRIX)).toHaveLength(12);
    const routes = Object.values(MIGRATION_MATRIX);
    expect(new Set(routes).size).toBe(11);
    expect(routes.filter((route) => route === "/docs/start/installation/")).toHaveLength(2);
    for (const [source, route] of Object.entries(MIGRATION_MATRIX)) {
      expect(source).toMatch(/^docs\/.+\.md$/);
      expect(route).toMatch(/^\/docs\/.+\/$|^\/docs\/$/);
    }
  });

  it("extracts compile and explicit partial fence metadata", () => {
    const fences = parseFences(
      '```ts compile title="Checked"\nconst value: number = 1;\n```\n\n```sql partial="host schema"\nselect 1;\n```\n',
    );
    expect(fences).toEqual([
      {
        language: "ts",
        meta: 'compile title="Checked"',
        code: "const value: number = 1;",
        line: 1,
      },
      {
        language: "sql",
        meta: 'partial="host schema"',
        code: "select 1;",
        line: 5,
      },
    ]);
  });

  it("keeps published package README links valid outside the monorepo", async () => {
    const root = resolve(import.meta.dir, "..");
    for (const name of PUBLISHABLE_PACKAGE_ORDER) {
      const directory = name.slice("@sheetwrite/".length);
      const readme = await readFile(resolve(root, "packages", directory, "README.md"), "utf8");
      const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]!);
      for (const link of links) {
        expect(link).toMatch(
          /^https:\/\/(?:chh-ay\.github\.io\/Sheetwrite\/|github\.com\/chh-ay\/Sheetwrite\/)/,
        );
      }
    }
  });
});
