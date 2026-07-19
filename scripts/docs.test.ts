import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ADAPTER_DOC_CONTRACT,
  adapterContractIssues,
  contentPathForRoute,
  entrySlug,
  expectedGeneratedFiles,
  landingBenchPayload,
  MIGRATION_ROUTES,
  parseFences,
  renderEntryPage,
  renderSymbolPage,
  runCompletionSummary,
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

  it("links entry indexes to documented symbols with unique member anchors", async () => {
    const entryPage = renderEntryPage(corePackage, coreEntry);
    const symbolPage = await renderSymbolPage(corePackage, coreEntry, coreEntry.exports[0]!);
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
          /^https:\/\/(?:sheetwrite\.vercel\.app\/|github\.com\/chh-ay\/sheetwrite\/)/,
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

  it("never double-counts failed runs in the completion summary", () => {
    const results = [
      ...Array.from({ length: 5 }, () => ({ status: "success" })),
      { status: "failed" },
      { status: "failed" },
    ];
    // results[] already contains the failures; adding failedKeys on top
    // published 1120/1140 for a 1120-cell matrix.
    expect(runCompletionSummary(results)).toEqual({ successes: 5, total: 7, failures: 2 });
    expect(runCompletionSummary([])).toEqual({ successes: 0, total: 0, failures: 0 });
  });

  const benchResult = (
    engine: string,
    scenarioId: string,
    round: number,
    rows: number,
    medianMs: number,
    status = "success",
  ) => ({
    engine,
    scenarioId,
    round,
    rows,
    status,
    medianMs,
    p95Ms: medianMs * 1.1,
    madMs: 0.01,
    memory: { beforeBytes: 1_000_000, afterBytes: 2_000_000, deltaBytes: 1_000_000 },
    validation: [],
  });
  const benchEvidence = (results: ReturnType<typeof benchResult>[]) => ({
    protocolVersion: 1,
    metadata: {
      commit: "c".repeat(40),
      dirty: false,
      timestamp: "2026-07-17T00:00:00.000Z",
      bunVersion: "1",
      nodeVersion: "1",
      browserVersion: "149",
      os: "linux",
      arch: "x64",
      cpu: "test",
      rounds: 2,
      launchAttempts: [],
    },
    config: {
      engines: ["sheetwrite", "handsontable"],
      rows: [1_000, 1_000_000],
      scenarios: ["a", "b"],
    },
    results,
  });

  it("pairs landing bench ratios per scenario from full-round buckets", () => {
    const results: ReturnType<typeof benchResult>[] = [];
    for (const rows of [1_000, 1_000_000]) {
      for (const scenario of ["a", "b"]) {
        for (const round of [1, 2]) {
          results.push(benchResult("sheetwrite", scenario, round, rows, 1));
          results.push(benchResult("handsontable", scenario, round, rows, 10));
        }
      }
    }
    const payload = JSON.parse(
      landingBenchPayload({ evidence: benchEvidence(results), source: "x" }),
    );
    expect(payload.available).toBe(true);
    expect(payload.sizes).toHaveLength(2);
    expect(payload.sizes[0]).toMatchObject({
      size: 1_000,
      comparedScenarios: 2,
      medianRatio: 10,
      bestRatio: 10,
      handsontableIncomplete: 0,
    });
    expect(payload.heroStats).toMatchObject({ millionRowScenarios: 2, millionRowMedianMs: 1 });
  });

  it("omits partial-round pairs and never publishes non-finite landing values", () => {
    const results = [
      // scenario a at 1k: Handsontable completes only 1 of 2 rounds.
      benchResult("sheetwrite", "a", 1, 1_000, 1),
      benchResult("sheetwrite", "a", 2, 1_000, 1),
      benchResult("handsontable", "a", 1, 1_000, 10),
      benchResult("handsontable", "a", 2, 1_000, 10, "failed"),
      // scenario b at 1k: full-round pair with a 5x gap.
      benchResult("sheetwrite", "b", 1, 1_000, 1),
      benchResult("sheetwrite", "b", 2, 1_000, 1),
      benchResult("handsontable", "b", 1, 1_000, 5),
      benchResult("handsontable", "b", 2, 1_000, 5),
      // 1M: Sheetwrite full rounds, no Handsontable at all.
      benchResult("sheetwrite", "a", 1, 1_000_000, 2),
      benchResult("sheetwrite", "a", 2, 1_000_000, 2),
      benchResult("sheetwrite", "b", 1, 1_000_000, 2),
      benchResult("sheetwrite", "b", 2, 1_000_000, 2),
    ];
    const payload = JSON.parse(
      landingBenchPayload({ evidence: benchEvidence(results), source: "x" }),
    );
    expect(payload.available).toBe(true);
    // The 1M size has zero full-round pairs and must be omitted, not NaN.
    expect(payload.sizes).toHaveLength(1);
    expect(payload.sizes[0]).toMatchObject({
      size: 1_000,
      comparedScenarios: 1,
      medianRatio: 5,
      handsontableIncomplete: 1,
    });
    expect(payload.heroStats).toMatchObject({ millionRowScenarios: 2, millionRowMedianMs: 2 });

    // A structurally valid artifact with no comparable pairs downgrades to the
    // placeholder payload - null must never reach the landing.
    const none = landingBenchPayload({
      evidence: benchEvidence(results.slice(0, 4)),
      source: "x",
    });
    expect(JSON.parse(none).available).toBe(false);
    expect(none).not.toContain("null");
  });

  it("downgrades to placeholder when 1M hero buckets lack full rounds", () => {
    const results = [
      // Valid, comparable full-round pair at 1k - sizes[] stays non-empty.
      benchResult("sheetwrite", "a", 1, 1_000, 1),
      benchResult("sheetwrite", "a", 2, 1_000, 1),
      benchResult("handsontable", "a", 1, 1_000, 10),
      benchResult("handsontable", "a", 2, 1_000, 10),
      // 1M: Sheetwrite completes only 1 of 2 rounds per scenario, so hero
      // stats have no full-round bucket and must not publish NaN-as-null.
      benchResult("sheetwrite", "a", 1, 1_000_000, 2),
      benchResult("sheetwrite", "a", 2, 1_000_000, 2, "failed"),
      benchResult("sheetwrite", "b", 1, 1_000_000, 2),
      benchResult("sheetwrite", "b", 2, 1_000_000, 2, "failed"),
    ];
    const payload = landingBenchPayload({ evidence: benchEvidence(results), source: "x" });
    expect(JSON.parse(payload).available).toBe(false);
    expect(payload).not.toContain("null");
  });
});
describe("adapter documentation contract", () => {
  const memberDocs = (names: readonly string[]) =>
    names.map((name) => ({ name, documentation: `${name} documentation.` }));

  const apiExport = (
    name: string,
    kind: string,
    signature: string,
    documented: readonly string[] = [],
  ) => ({
    name,
    kind,
    signature,
    owners: ["src/index.ts"],
    source: "src/index.ts#L1",
    jsDocTags: [],
    documentation: `${name} summary.`,
    memberDocs: memberDocs(documented),
  });

  const entry = (subpath: string, exports: ReturnType<typeof apiExport>[]): ApiEntryPoint => ({
    subpath,
    target: "./dist/index.d.ts",
    source: "src/index.ts",
    kind: "typescript",
    classification: "supported",
    exports,
  });

  const propsSignature = (members: readonly string[]) =>
    `export interface SheetwriteGridProps { ${members
      .map((name) => (name.includes("-") ? `"${name}"?: unknown;` : `${name}?: unknown;`))
      .join(" ")} }`;

  const readyEvent = () =>
    apiExport(
      "GridReadyEvent",
      "interface",
      "export interface GridReadyEvent { grid: Grid; generation: number; reason: GridReadyReason; }",
      ["grid", "generation", "reason"],
    );

  const conformingManifest = (): PublicApiManifest => ({
    formatVersion: 2,
    packages: [
      {
        name: "@sheetwrite/core",
        entryPoints: [
          entry(".", [
            apiExport(
              "GridOptions",
              "interface",
              propsSignature(ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource")),
              ADAPTER_DOC_CONTRACT.inputs.filter((name) => name !== "wasmSource"),
            ),
          ]),
          entry("./adapter", [
            apiExport(
              "GridReadyReason",
              "type",
              'export type GridReadyReason = "initial" | GridResetReason;',
            ),
            apiExport(
              "GridResetReason",
              "type",
              'export type GridResetReason = "input-reset" | "renderer-reset";',
            ),
          ]),
        ],
      },
      ...(["@sheetwrite/react", "@sheetwrite/svelte"] as const).map((name) => ({
        name,
        entryPoints: [
          entry(".", [
            apiExport(
              "SheetwriteGridProps",
              "interface",
              propsSignature([
                ...ADAPTER_DOC_CONTRACT.inputs,
                ...ADAPTER_DOC_CONTRACT.handlerEvents,
              ]),
              [...ADAPTER_DOC_CONTRACT.inputs, ...ADAPTER_DOC_CONTRACT.handlerEvents],
            ),
            readyEvent(),
          ]),
        ],
      })),
      {
        name: "@sheetwrite/vue",
        entryPoints: [
          entry(".", [
            apiExport(
              "SheetwriteGridProps",
              "interface",
              propsSignature([...ADAPTER_DOC_CONTRACT.inputs]),
              [...ADAPTER_DOC_CONTRACT.inputs],
            ),
            apiExport(
              "SheetwriteGridEmits",
              "interface",
              `export interface SheetwriteGridEmits { ${ADAPTER_DOC_CONTRACT.vueEvents
                .map((name) => `"${name}": unknown;`)
                .join(" ")} }`,
              [...ADAPTER_DOC_CONTRACT.vueEvents],
            ),
            readyEvent(),
          ]),
        ],
      },
    ],
  });

  it("mirrors canonical event casing", () => {
    const kebabOf = (handler: string) =>
      handler
        .replace(/^on/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase();
    expect([...ADAPTER_DOC_CONTRACT.vueEvents] as string[]).toEqual(
      ADAPTER_DOC_CONTRACT.handlerEvents.map(kebabOf),
    );
  });

  it("accepts a manifest documenting every canonical input, event, and reason", () => {
    expect(adapterContractIssues(conformingManifest())).toEqual([]);
  });

  it("fails when GridOptions and the adapter input contract drift", () => {
    const manifest = conformingManifest();
    const options = manifest.packages[0]?.entryPoints
      .find((entry) => entry.subpath === ".")
      ?.exports.find((item) => item.name === "GridOptions");
    if (options === undefined) throw new Error("fixture shape changed");
    options.memberDocs.push({ name: "uncoveredInput", documentation: "Uncovered input." });
    expect(adapterContractIssues(manifest)).toContain(
      "GridOptions member uncoveredInput is not covered by the adapter documentation contract",
    );
  });

  it("fails when an adapter input or readiness event disappears", () => {
    const manifest = conformingManifest();
    const react = manifest.packages[1]?.entryPoints[0]?.exports[0];
    if (react === undefined) throw new Error("fixture shape changed");
    react.signature = react.signature.replace("onReady?: unknown;", "");
    react.memberDocs = react.memberDocs.filter((member) => member.name !== "onReady");
    expect(adapterContractIssues(manifest)).toContain(
      "@sheetwrite/react SheetwriteGridProps does not declare onReady",
    );
  });

  it("fails when a documented member loses its JSDoc", () => {
    const manifest = conformingManifest();
    const svelte = manifest.packages[2]?.entryPoints[0]?.exports[0];
    if (svelte === undefined) throw new Error("fixture shape changed");
    svelte.memberDocs = svelte.memberDocs.filter((member) => member.name !== "datasource");
    expect(adapterContractIssues(manifest)).toContain(
      "@sheetwrite/svelte SheetwriteGridProps member datasource has no documentation",
    );
  });

  it("fails when the Vue emits contract is missing", () => {
    const manifest = conformingManifest();
    const vue = manifest.packages[3];
    if (vue === undefined) throw new Error("fixture shape changed");
    vue.entryPoints[0]!.exports = vue.entryPoints[0]!.exports.filter(
      (item) => item.name !== "SheetwriteGridEmits",
    );
    expect(adapterContractIssues(manifest)).toContain(
      "@sheetwrite/vue does not export SheetwriteGridEmits",
    );
  });

  it("fails when documented readiness reasons drift from the implementation", () => {
    const manifest = conformingManifest();
    const reason = manifest.packages[0]?.entryPoints
      .find((entry) => entry.subpath === "./adapter")
      ?.exports.find((item) => item.name === "GridReadyReason");
    if (reason === undefined) throw new Error("fixture shape changed");
    reason.signature = 'export type GridReadyReason = "initial" | "reset";';
    const issues = adapterContractIssues(manifest);
    expect(issues.some((issue) => issue.startsWith("GridReadyReason documents"))).toBe(true);
  });
});
