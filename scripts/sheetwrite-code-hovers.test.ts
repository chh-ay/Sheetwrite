import { describe, expect, it } from "bun:test";
import { formatHoverSignature } from "../docs/src/lib/sheetwrite-code-hovers.js";
import { SheetwriteTypeEngine } from "../docs/src/lib/sheetwrite-type-engine.js";

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
