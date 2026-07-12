import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Drift tripwire between the component's `Props` interface (Grid.svelte) and
// the hand-maintained public declaration (Grid.svelte.d.ts): the two must
// declare the SAME property names. Name-level only — svelte-check owns types.

const srcDir = join(import.meta.dir, "../src");

function propNames(source: string, interfaceName: string, fileLabel: string): Set<string> {
  const file = ts.createSourceFile(fileLabel, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if (
          (ts.isPropertySignature(member) || ts.isMethodSignature(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          names.add(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (names.size === 0) {
    throw new Error(`no interface '${interfaceName}' with members found in ${fileLabel}`);
  }
  return names;
}

describe("Grid.svelte / Grid.svelte.d.ts props parity", () => {
  it("declares the same property names in the component and the shipped d.ts", () => {
    const component = readFileSync(join(srcDir, "Grid.svelte"), "utf8");
    const script = /<script lang="ts">([\s\S]*?)<\/script>/.exec(component)?.[1];
    if (!script) throw new Error('Grid.svelte has no <script lang="ts"> block');

    const componentProps = propNames(script, "Props", "Grid.svelte");
    const declared = propNames(
      readFileSync(join(srcDir, "Grid.svelte.d.ts"), "utf8"),
      "SheetwriteGridProps",
      "Grid.svelte.d.ts",
    );

    expect([...componentProps].sort()).toEqual([...declared].sort());
  });
});
