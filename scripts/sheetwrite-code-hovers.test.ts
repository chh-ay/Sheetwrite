import { describe, expect, it } from "bun:test";
import { injectHoverPrelude } from "../docs/src/lib/hover-preludes.js";
import {
  collectFenceHovers,
  collectReferenceLinks,
  formatHoverSignature,
  hoverPopoverId,
  isHighQualityHover,
} from "../docs/src/lib/sheetwrite-code-hovers.js";
import {
  SheetwriteTypeEngine,
  type SheetwriteTypeHover,
} from "../docs/src/lib/sheetwrite-type-engine.js";

describe("Sheetwrite code hover signatures", () => {
  it("formats generic function parameters at semantic boundaries", async () => {
    const signature = await formatHoverSignature(
      `(alias) const Sheetwrite: <Row extends Record<string, CellScalar>>(props: SheetwriteProps<Row> & { ref?: ForwardedRef<Grid> }) => ReactElement\nimport Sheetwrite`,
      68,
    );

    expect(signature).toContain(
      "const Sheetwrite: <Row extends Record<string, CellScalar>>(\n  props:",
    );
    expect(signature).toContain("ref?: ForwardedRef<Grid>");
    expect(signature).toEndWith(") => ReactElement");
  });

  it("formats interfaces and object members as complete declarations", async () => {
    const signature = await formatHoverSignature(
      "interface GridConfig { toolbar?: boolean | ToolbarItem[]; bold?: boolean; italic?: boolean; readOnly?: boolean }",
      44,
    );

    expect(signature).toContain("interface GridConfig {");
    expect(signature).toContain("toolbar?: boolean | ToolbarItem[];");
    expect(signature).toContain("readOnly?: boolean;");
    expect(signature).toEndWith("}");
  });

  it("formats unions and object variants without hiding members", async () => {
    const signature = await formatHoverSignature(
      'type ColumnFilter = { kind: "values"; values: readonly CellScalar[] } | { kind: "contains"; text: string; matchCase?: boolean } | { kind: "empty" }',
      42,
    );

    expect(signature.match(/\|/g)?.length).toBeGreaterThanOrEqual(2);
    expect(signature).toContain('kind: "contains";');
    expect(signature).toContain("matchCase?: boolean;");
    expect(signature).toContain('kind: "empty"');
  });

  it("keeps overloads structurally separate", async () => {
    const signature = await formatHoverSignature(
      "interface Formatter { (value: string): string; (value: number, precision?: number): string }",
      42,
    );

    expect(signature).toContain("(value: string): string;");
    expect(signature).toContain("precision?: number");
    expect(signature.match(/\): string;/g)?.length).toBe(2);
  });
  it("derives stable popover ids from document position instead of render order", () => {
    const block = {
      code: "grid.destroy();",
      language: "ts",
      meta: "",
      parentDocument: { positionInDocument: { groupIndex: 3 } },
    };
    const hover = {
      target: "grid",
      line: 0,
      character: 0,
      length: 4,
    };

    expect(hoverPopoverId(block, hover, 0)).toBe(hoverPopoverId(block, hover, 0));
    expect(hoverPopoverId(block, hover, 0)).not.toBe(
      hoverPopoverId(
        { ...block, parentDocument: { positionInDocument: { groupIndex: 4 } } },
        hover,
        0,
      ),
    );
  });
});

describe("Sheetwrite type engine", () => {
  it("owns TypeScript quick info with workspace module resolution", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const hovers = engine.analyze(
      `import type { ChangeEvent } from "@sheetwrite/core";
export function persist(event: ChangeEvent): void {
  void event.transaction;
}`,
      "ts",
    );

    expect(hovers.length).toBeGreaterThanOrEqual(5);
    expect(hovers.find((hover) => hover.target === "persist")?.text).toContain(
      "event: ChangeEvent",
    );
    expect(hovers.find((hover) => hover.target === "transaction")?.text).toContain(
      "ChangeEvent.transaction: Transaction",
    );
  });

  it("repairs framework bindings only through explicit source relationships", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const source = `<script lang="ts">
const handleGridChange = (event: ChangeEvent): void => {};
let { columns }: Props = $props();
</script>
<Sheetwrite @grid-change="handleGridChange" />`;
    const eventStart = source.indexOf("grid-change");
    const handlerStart = source.indexOf("handleGridChange");
    const propsStart = source.indexOf("$props");
    const repaired = engine.resolveFrameworkTypes(
      [
        {
          type: "hover",
          text: ["onGridChange:", "any"].join(" "),
          start: eventStart,
          length: "grid-change".length,
          target: "grid-change",
          line: 4,
          character: 13,
        },
        {
          type: "hover",
          text: "const handleGridChange: (event: ChangeEvent) => void",
          start: handlerStart,
          length: "handleGridChange".length,
          target: "handleGridChange",
          line: 1,
          character: 6,
        },
        {
          type: "hover",
          text: ["function $props():", "any"].join(" "),
          start: propsStart,
          length: "$props".length,
          target: "$props",
          line: 2,
          character: 25,
        },
        {
          type: "hover",
          text: "type Mixed = Container<__VLS_Internal, ChangeEvent>",
          start: 0,
          length: 5,
          target: "mixed",
          line: 0,
          character: 0,
        },
      ],
      source,
    );

    expect(repaired.find((hover) => hover.target === "grid-change")?.text).toBe(
      "onGridChange: (event: ChangeEvent) => void",
    );
    expect(repaired.find((hover) => hover.target === "$props")?.text).toBe(
      "function $props(): Props",
    );
    expect(repaired.find((hover) => hover.target === "mixed")?.text).toBe(
      "type Mixed = Container<__VLS_Internal, ChangeEvent>",
    );
  });
});

describe("Sheetwrite hover preludes", () => {
  const engine = new SheetwriteTypeEngine({
    cwd: new URL("../docs/", import.meta.url).pathname,
  });

  it("maps single-line script positions around an injected prelude", () => {
    const source = '<script lang="ts">grid.destroy();</script>';
    const injection = injectHoverPrelude(
      source,
      "svelte",
      "declare const grid: { destroy(): void };",
    );
    expect(injection.analysisSource.split("\n")[2]).toBe("grid.destroy();</script>");
    expect(injection.toOriginal({ line: 1, character: 3 })).toBeNull();
    expect(injection.toOriginal({ line: 2, character: 0 })).toEqual({
      line: 0,
      character: 18,
      start: 18,
    });
  });

  it("types template-only snippets through a synthetic script block", () => {
    const source = "<button onclick={() => grid.destroy()}>Reset</button>";
    const injection = injectHoverPrelude(
      source,
      "svelte",
      "declare const grid: { destroy(): void };",
    );
    expect(injection.analysisSource.startsWith('<script lang="ts">\n')).toBe(true);
    expect(injection.toOriginal({ line: 0, character: 0 })).toBeNull();
    expect(injection.toOriginal({ line: 2, character: 0 })).toBeNull();
    expect(injection.toOriginal({ line: 3, character: 5 })).toEqual({
      line: 0,
      character: 5,
      start: 5,
    });
  });

  it("resolves prelude-backed host state in partial ts snippets", () => {
    const hovers = collectFenceHovers(
      "grid.destroy();\nworkbook.sheets.length;\n",
      "ts",
      engine,
      "core",
    );
    expect(hovers.every((hover) => hover.line >= 0)).toBe(true);
    const grid = hovers.find((hover) => hover.target === "grid");
    expect(grid?.line).toBe(0);
    expect(grid?.character).toBe(0);
    expect(grid?.text).toContain("Grid");
    const workbook = hovers.find((hover) => hover.target === "workbook");
    expect(workbook?.line).toBe(1);
    expect(workbook?.text).toContain("Workbook");
    for (const hover of hovers) {
      expect(isHighQualityHover(hover, "ts")).toBe(true);
    }
  });

  it("maps svelte prelude hovers back to original coordinates", () => {
    const source = '<script lang="ts">grid.destroy();</script>';
    const hovers = collectFenceHovers(source, "svelte", engine, "core");
    const grid = hovers.find((hover) => hover.target === "grid");
    expect(grid?.line).toBe(0);
    expect(grid?.character).toBe(18);
    expect(grid?.text).toContain("Grid");
  });
});

describe("Sheetwrite hover quality", () => {
  const hover = (text: string, origin: SheetwriteTypeHover["origin"]): SheetwriteTypeHover => ({
    type: "hover",
    text,
    start: 0,
    length: 5,
    target: "value",
    line: 0,
    character: 0,
    origin,
  });

  it("rejects unresolved application hovers but keeps lib signatures", () => {
    expect(isHighQualityHover(hover("const value: any", "snippet"))).toBe(false);
    expect(isHighQualityHover(hover("type Value = /*unresolved*/ any", "workspace"))).toBe(false);
    expect(isHighQualityHover(hover("Console.log(...data: any[]): void", "lib"))).toBe(true);
    expect(isHighQualityHover(hover("const grid: Grid", "workspace"))).toBe(true);
  });

  it("evaluates framework hovers after language-specific normalization", () => {
    const component = hover("const Sheetwrite: DefineComponent<any, any, any>", "workspace");
    component.target = "Sheetwrite";

    expect(isHighQualityHover(component, "vue")).toBe(true);
    expect(isHighQualityHover(component, "ts")).toBe(false);
  });
});

describe("Sheetwrite hover preludes end to end", () => {
  it("resolves template-only svelte snippets through the synthetic script", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const source = "<button onclick={() => grid.destroy()}>Reset</button>";
    const hovers = collectFenceHovers(source, "svelte", engine, "core");
    const grid = hovers.find((hover) => hover.target === "grid");
    expect(grid?.line).toBe(0);
    expect(grid?.character).toBe(source.indexOf("grid"));
    expect(grid?.text).toContain("Grid");
  });
});

describe("Generated fence reference links", () => {
  const routes = new Map([
    ["Theme", "/docs/api/core/theme/"],
    ["SheetId", "/docs/api/core/sheet-id/"],
    ["DEFAULT_THEME", "/docs/api/core/default-theme/"],
  ]);

  it("links referenced API types but never the declared symbol itself", () => {
    const links = collectReferenceLinks("const DEFAULT_THEME: Theme;", routes);
    expect(links).toEqual([
      { line: 0, columnStart: 21, columnEnd: 26, route: "/docs/api/core/theme/" },
    ]);
  });

  it("resolves multi-line declarations with positions per line", () => {
    const links = collectReferenceLinks(
      "class Grid {\n    setTheme(theme: Theme): void;\n    sheet(id: SheetId): Theme;\n}",
      routes,
    );
    expect(links.map((link) => [link.line, link.route])).toEqual([
      [1, "/docs/api/core/theme/"],
      [2, "/docs/api/core/sheet-id/"],
      [2, "/docs/api/core/theme/"],
    ]);
  });

  it("ignores member accesses, string openers, and unknown names", () => {
    expect(collectReferenceLinks('const x: options.Theme = "Theme";', routes)).toEqual([]);
    expect(collectReferenceLinks("const y: Unknown;", routes)).toEqual([]);
    expect(collectReferenceLinks("const z: Theme;", new Map())).toEqual([]);
  });
});
