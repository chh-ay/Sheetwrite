import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  contentPathForRoute,
  entrySlug,
  expectedGeneratedFiles,
  MIGRATION_ROUTES,
  parseFences,
  renderEntryPage,
  renderSymbolPage,
  unresolvedCssTokens,
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

  it("links entry indexes to documented symbols with unique member anchors", () => {
    const entryPage = renderEntryPage(corePackage, coreEntry);
    const symbolPage = renderSymbolPage(corePackage, coreEntry, coreEntry.exports[0]!);
    expect(entryPage).toContain('href="/docs/api/core/grid/"');

    const anchors = [...symbolPage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]!);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toEqual(expect.arrayContaining(["applytransaction", "rendererkind"]));
    expect(symbolPage).toContain("Imperative grid handle.");
    expect(symbolPage).toContain("Applies a committed transaction to the");
    expect(symbolPage).toContain("Bypasses history.");
    expect(symbolPage).toContain('<a href="/docs/api/core/grid/"><code>Grid</code></a>');
  });

  it("generates an index and focused page for every classified symbol", async () => {
    const files = await expectedGeneratedFiles(manifest);
    expect(files.some((file) => file.path.endsWith("/api/core.md"))).toBe(true);
    expect(files.some((file) => file.path.endsWith("/api/index.md"))).toBe(true);
    expect(files.some((file) => file.path.endsWith("/api/core/grid.md"))).toBe(true);
    const inventory = files.find((file) => file.path.endsWith("package-entry-points.md"));
    expect(inventory?.content).toContain("supported");
  });

  it("resolves every moved guide to generated content with one named installation consolidation", async () => {
    const contentRoot = resolve(import.meta.dir, "../docs/src/content/docs");
    const generatedContent = (await expectedGeneratedFiles(manifest)).filter(
      (file) => file.path.startsWith(contentRoot) && /\.mdx?$/u.test(file.path),
    );
    const pages = new Bun.Glob("**/*.{md,mdx}");
    for await (const path of pages.scan({ cwd: contentRoot, onlyFiles: true })) {
      const absolutePath = join(contentRoot, path);
      generatedContent.push({ path: absolutePath, content: await readFile(absolutePath, "utf8") });
    }
    for (const route of Object.values(MIGRATION_ROUTES)) {
      expect(contentPathForRoute(route, generatedContent)).toBeDefined();
    }
    expect(MIGRATION_ROUTES["docs/README.md"]).toBe("/docs/start/installation/");
    expect(MIGRATION_ROUTES["docs/getting-started.md"]).toBe("/docs/start/installation/");
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
          /^https:\/\/(?:sheetwrite\.vercel\.app\/|github\.com\/chh-ay\/Sheetwrite\/)/,
        );
      }
    }
  });

  it("rejects referenced Sheetwrite CSS tokens without a definition", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-css-tokens-"));
    try {
      await writeFile(
        join(root, "tokens.css"),
        ":root { --sw-defined: #fff; color: var(--sw-defined); }\n",
      );
      await writeFile(
        join(root, "component.tsx"),
        'export const style = "border-color: var(--sw-missing)";\n',
      );
      expect(await unresolvedCssTokens(root)).toEqual([
        "undefined Sheetwrite CSS token --sw-missing: component.tsx",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
