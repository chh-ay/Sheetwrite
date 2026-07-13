import { beforeEach, describe, expect, it } from "bun:test";
import { neutralizeInjection, parseTsv, toTsv } from "../src/clipboard.js";
import { ClipboardController, SHEETWRITE_CLIPBOARD_MIME } from "../src/clipboard-controller.js";
import { SelectionModel } from "../src/selection.js";
import type { CellAddress, CellScalar, CellStyle, CellValue, Patch, Store } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

describe("clipboard TSV", () => {
  it("neutralizes formula-injection prefixes", () => {
    for (const p of ["=cmd", "+1", "-1", "@x", "\tx", "\rx"]) {
      expect(neutralizeInjection(p)).toBe(`'${p}`);
    }
    expect(neutralizeInjection("safe")).toBe("safe");
    expect(neutralizeInjection("12.5")).toBe("12.5");
  });

  it("serializes a block, quoting fields with tabs/newlines/quotes", () => {
    expect(toTsv([["a", 1, null]])).toBe("a\t1\t");
    expect(toTsv([['q"x', "b\tc", "d\ne"]])).toBe('"q""x"\t"b\tc"\t"d\ne"');
    expect(toTsv([[true, false]])).toBe("TRUE\tFALSE");
  });

  it("round-trips quoted TSV including embedded tabs/newlines", () => {
    expect(parseTsv("a\t1\r\nb\t2")).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(parseTsv('"b\tc"\t"d\ne"')).toEqual([["b\tc", "d\ne"]]);
    expect(parseTsv('"q""x"')).toEqual([['q"x']]);
  });
});

// ── Rich clipboard (copy/cut/paste/pasteValues) ──────────────────────────────

/**
 * In-memory {@link Store} stand-in exercising exactly the reads the controller
 * makes (`getCell`, `getFormula`, `viewRowCount`) plus a patch sink standing in
 * for `commit`. Formula patches are stored verbatim (never evaluated); literal
 * patches resolve to their own value. Enough to prove the controller's shift,
 * verbatim, values-only, and external-TSV behaviors without the WASM engine.
 */
class FakeStore {
  private readonly cells = new Map<
    string,
    { value: CellValue; resolved: CellScalar; style: CellStyle }
  >();
  readonly rowCount = 100;

  private key(addr: CellAddress): string {
    return `${addr.sheet}:${addr.row}:${addr.col}`;
  }

  seed(
    row: number,
    col: number,
    value: CellValue,
    resolved: CellScalar,
    style: CellStyle = {},
  ): void {
    this.cells.set(this.key({ sheet: "s1", row, col }), { value, resolved, style });
  }

  getCell(addr: CellAddress): { resolved: CellScalar; style: CellStyle } {
    const cell = this.cells.get(this.key(addr));
    return { resolved: cell?.resolved ?? null, style: cell?.style ?? {} };
  }

  getFormula(addr: CellAddress): string | null {
    const cell = this.cells.get(this.key(addr));
    return cell?.value.kind === "formula" ? cell.value.src : null;
  }

  viewRowCount(): number {
    return this.rowCount;
  }

  apply(patches: Patch[]): void {
    for (const patch of patches) {
      if (patch.op === "set") {
        const resolved = patch.value.kind === "literal" ? patch.value.value : null;
        this.cells.set(this.key(patch.addr), {
          value: patch.value,
          resolved,
          style: patch.style ?? {},
        });
        continue;
      }
      if (patch.op === "setBlock") {
        const formulas = new Map(patch.block.formulas ?? []);
        const refs = new Map(patch.block.refs ?? []);
        const styles = patch.block.styleTable ?? [];
        const styleIds = patch.block.styleIds;
        for (let row = 0; row < patch.block.rowCount; row++) {
          for (let col = 0; col < patch.block.colCount; col++) {
            const offset = row * patch.block.colCount + col;
            const value: CellValue = formulas.has(offset)
              ? { kind: "formula", src: formulas.get(offset)! }
              : refs.has(offset)
                ? { kind: "ref", target: refs.get(offset)! }
                : { kind: "literal", value: patch.block.values[offset]! };
            const addr = {
              sheet: patch.range.sheet,
              row: Math.min(patch.range.start.row, patch.range.end.row) + row,
              col: Math.min(patch.range.start.col, patch.range.end.col) + col,
            };
            this.cells.set(this.key(addr), {
              value,
              resolved: value.kind === "literal" ? value.value : null,
              style: styleIds ? (styles[styleIds[offset]!] ?? {}) : {},
            });
          }
        }
        continue;
      }
      if (patch.op === "clearRange") {
        const r0 = Math.min(patch.range.start.row, patch.range.end.row);
        const r1 = Math.max(patch.range.start.row, patch.range.end.row);
        const c0 = Math.min(patch.range.start.col, patch.range.end.col);
        const c1 = Math.max(patch.range.start.col, patch.range.end.col);
        for (let row = r0; row <= r1; row++) {
          for (let col = c0; col <= c1; col++) {
            const addr = { sheet: patch.range.sheet, row, col };
            const existing = this.cells.get(this.key(addr));
            this.cells.set(this.key(addr), {
              value:
                patch.contents === false
                  ? (existing?.value ?? { kind: "literal", value: null })
                  : { kind: "literal", value: null },
              resolved: patch.contents === false ? (existing?.resolved ?? null) : null,
              style: patch.style === false ? (existing?.style ?? {}) : {},
            });
          }
        }
      }
    }
  }
}

class FakeClipboardItem {
  readonly types: string[];

  constructor(private readonly entries: Record<string, Blob>) {
    this.types = Object.keys(entries);
  }

  getType(type: string): Promise<Blob> {
    const value = this.entries[type];
    return value ? Promise.resolve(value) : Promise.reject(new Error(`Missing type ${type}`));
  }
}

interface Harness {
  controller: ClipboardController;
  store: FakeStore;
  selection: SelectionModel;
  /** CommitReasons the controller passed to `deps.commit`, in order. */
  commitReasons: string[];
  select: (row: number, col: number) => void;
  setSystemClipboard: (text: string) => void;
  setReadOnly: (value: boolean) => void;
}

function makeHarness(): Harness {
  const clip = { text: "" };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        clip.text = text;
        return Promise.resolve();
      },
      readText: () => Promise.resolve(clip.text),
    },
  });

  const store = new FakeStore();
  const sheet = makeWorkbook(100).sheets[0]!; // columns: name(text), amount(number), city(text)
  const selection = new SelectionModel(100, 0, 2);
  let readOnly = false;

  const commitReasons: string[] = [];
  const controller = new ClipboardController({
    store: store as unknown as Store,
    selection: () => selection,
    activeSheet: () => "s1",
    sheet: () => sheet,
    colIndices: () => [0, 1, 2],
    readOnly: () => readOnly,
    mergeAnchorAt: () => null,
    toDataRow: (viewRow) => viewRow,
    commit: (patches, reason) => {
      commitReasons.push(reason);
      store.apply(patches);
    },
  });

  return {
    controller,
    store,
    selection,
    commitReasons,
    select: (row, col) => selection.selectCell(row, col),
    setReadOnly: (value) => {
      readOnly = value;
    },
    setSystemClipboard: (text) => {
      clip.text = text;
    },
  };
}

describe("ClipboardController", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("copy + paste re-anchors relative refs by the paste displacement", async () => {
    // Formula at B2 (row 1, col 1); copy, paste two rows down to B4 (row 3).
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    await h.controller.copy();

    h.select(3, 1);
    await h.controller.paste();

    // Relative A1 shifts +2 rows -> A3; absolute-row B$2 keeps its row, same column.
    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 1 })).toBe("=A3+B$2");
  });

  it("cut + paste preserves the formula verbatim and clears the source", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    await h.controller.cut();

    // Source clearing commits only after the system clipboard accepts the payload.
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBeNull();

    h.select(3, 1);
    await h.controller.paste();

    // Cut-paste does NOT shift refs (Sheets shifts on copy, not cut).
    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 1 })).toBe("=A1+B$2");
    // Cut-clear committed as "cut"; the paste block as "paste".
    expect(h.commitReasons).toEqual(["cut", "paste"]);
  });

  it("keeps the source intact when the clipboard rejects a cut", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied")),
        readText: () => Promise.resolve(""),
      },
    });

    await h.controller.cut();

    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
  });

  it("clears the captured source when selection changes during the clipboard write", async () => {
    const { promise: pendingWrite, resolve: finishWrite } = Promise.withResolvers<void>();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => pendingWrite,
        readText: () => Promise.resolve(""),
      },
    });
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.store.seed(3, 1, { kind: "literal", value: "keep" }, "keep");
    h.select(1, 1);

    const cut = h.controller.cut();
    h.select(3, 1);
    finishWrite();
    await cut;

    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 3, col: 1 }).resolved).toBe("keep");
  });

  it("does not clear a read-only cut source", async () => {
    h.store.seed(1, 1, { kind: "formula", src: "=A1+B$2" }, 0);
    h.select(1, 1);
    h.setReadOnly(true);

    await h.controller.cut();

    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBe("=A1+B$2");
  });

  it("pasteValues writes the resolved literal and no formula", async () => {
    // Formula resolving to 15 at C1 (row 0, col 2).
    h.store.seed(0, 2, { kind: "formula", src: "=A1+B$2" }, 15);
    h.select(0, 2);
    await h.controller.copy();

    h.select(2, 2);
    await h.controller.pasteValues();

    const target = { sheet: "s1", row: 2, col: 2 };
    expect(h.store.getCell(target).resolved).toBe(15);
    expect(h.store.getFormula(target)).toBeNull();
  });

  it("copy carries styles; pasteValues drops them", async () => {
    h.store.seed(0, 0, { kind: "literal", value: "x" }, "x", { bold: true });
    h.select(0, 0);
    await h.controller.copy();

    h.select(5, 0);
    await h.controller.paste();
    expect(h.store.getCell({ sheet: "s1", row: 5, col: 0 }).style).toEqual({ bold: true });

    h.select(6, 0);
    await h.controller.pasteValues();
    expect(h.store.getCell({ sheet: "s1", row: 6, col: 0 }).style).toEqual({});
  });

  it("external TSV paste parses literals per column type", async () => {
    // No copy/cut: the system clipboard holds foreign TSV, so paste falls back.
    h.setSystemClipboard("hello\t42\tworld");
    h.select(0, 0);
    await h.controller.paste();

    expect(h.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("hello");
    expect(h.store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(42); // number column
    expect(h.store.getCell({ sheet: "s1", row: 0, col: 2 }).resolved).toBe("world");
  });

  it("neutralizes injection prefixes in external text, never producing a formula", async () => {
    h.setSystemClipboard("=SUM(A1)\tsafe");
    h.select(0, 0);
    await h.controller.paste();

    const target = { sheet: "s1", row: 0, col: 0 };
    expect(h.store.getCell(target).resolved).toBe("'=SUM(A1)");
    expect(h.store.getFormula(target)).toBeNull();
  });

  it("pasteValues on external text is identical to paste (neutralized literals)", async () => {
    h.setSystemClipboard("=SUM(A1)\t7");
    h.select(0, 0);
    await h.controller.pasteValues();

    expect(h.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("'=SUM(A1)");
    expect(h.store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(7);
    expect(h.store.getFormula({ sheet: "s1", row: 0, col: 0 })).toBeNull();
  });

  it("copy of a multi-cell block shifts every cell's refs by one rigid delta", async () => {
    // Two stacked formulas at A1 and A2; copy A1:A2, paste at A3.
    h.store.seed(0, 0, { kind: "formula", src: "=B1" }, 0);
    h.store.seed(1, 0, { kind: "formula", src: "=B2" }, 0);
    h.selection.selectCell(0, 0);
    h.selection.extendTo(1, 0);
    await h.controller.copy();

    h.select(2, 0);
    await h.controller.paste();

    // Both shift +2 rows uniformly: A3 <- =B3, A4 <- =B4.
    expect(h.store.getFormula({ sheet: "s1", row: 2, col: 0 })).toBe("=B3");
    expect(h.store.getFormula({ sheet: "s1", row: 3, col: 0 })).toBe("=B4");
  });

  it("resolves 'blocked' when writeText rejects, without an unhandled rejection", async () => {
    h.store.seed(1, 1, { kind: "literal", value: "x" }, "x");
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied")),
        readText: () => Promise.resolve(""),
      },
    });

    await expect(h.controller.copy()).resolves.toBe("blocked");
  });

  it("resolves 'unsupported' when the Clipboard API is absent", async () => {
    h.store.seed(1, 1, { kind: "literal", value: "x" }, "x");
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });

    await expect(h.controller.copy()).resolves.toBe("unsupported");
    await expect(h.controller.paste()).resolves.toBe("unsupported");
  });

  it("resolves 'blocked' on a rejected readText and leaves the store unchanged", async () => {
    h.store.seed(1, 1, { kind: "literal", value: "keep" }, "keep");
    h.select(1, 1);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.reject(new Error("read denied")),
      },
    });

    await expect(h.controller.paste()).resolves.toBe("blocked");
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe("keep");
  });

  it("resolves 'empty' with no focused selection and 'done' on a round-trip", async () => {
    await expect(h.controller.copy()).resolves.toBe("empty");

    h.store.seed(1, 1, { kind: "literal", value: "hello" }, "hello");
    h.select(1, 1);
    await expect(h.controller.copy()).resolves.toBe("done");

    h.select(3, 1);
    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getCell({ sheet: "s1", row: 3, col: 1 }).resolved).toBe("hello");
    expect(h.commitReasons).toEqual(["paste"]);
  });

  it("resolves 'unsupported' when the navigator global itself is absent (SSR)", async () => {
    h.store.seed(1, 1, { kind: "literal", value: "x" }, "x");
    h.select(1, 1);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    // @ts-expect-error — deliberately removing the global for the SSR branch
    delete globalThis.navigator;

    try {
      await expect(h.controller.copy()).resolves.toBe("unsupported");
      await expect(h.controller.paste()).resolves.toBe("unsupported");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    }
  });
  it("round-trips formulas and styles through the browser custom clipboard format", async () => {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    let written: FakeClipboardItem | null = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: (items: FakeClipboardItem[]) => {
          written = items[0] ?? null;
          return Promise.resolve();
        },
        read: () => Promise.resolve(written ? [written] : []),
        writeText: () => Promise.reject(new Error("text fallback should not run")),
        readText: () => Promise.reject(new Error("text fallback should not run")),
      },
    });
    h.store.seed(0, 0, { kind: "formula", src: "=B1" }, 7, {
      bold: true,
      backgroundColor: "#abcdef",
    });
    h.select(0, 0);

    await expect(h.controller.copy()).resolves.toBe("done");
    // Assigned by the awaited clipboard.write callback; TS cannot follow that async side effect.
    const captured = written as unknown as FakeClipboardItem;
    const types = captured.types;
    expect(types).toContain("text/plain");
    expect(types).toContain("text/html");
    expect(types).toContain(`web ${SHEETWRITE_CLIPBOARD_MIME}`);

    h.select(2, 0);
    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getFormula({ sheet: "s1", row: 2, col: 0 })).toBe("=B3");
    expect(h.store.getCell({ sheet: "s1", row: 2, col: 0 }).style).toEqual({
      bold: true,
      backgroundColor: "#abcdef",
    });
  });

  it("falls back from an unavailable web custom format to safe HTML plus text", async () => {
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });
    const writes: FakeClipboardItem[] = [];
    let textWrites = 0;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: ([item]: FakeClipboardItem[]) => {
          writes.push(item!);
          return item!.types.some((type) => type.startsWith("web "))
            ? Promise.reject(new Error("custom format unavailable"))
            : Promise.resolve();
        },
        writeText: () => {
          textWrites++;
          return Promise.resolve();
        },
      },
    });
    h.store.seed(0, 0, { kind: "literal", value: "<safe>" }, "<safe>");
    h.select(0, 0);

    await expect(h.controller.copy()).resolves.toBe("done");
    expect(writes).toHaveLength(2);
    expect(writes[1]!.types.sort()).toEqual(["text/html", "text/plain"]);
    expect(textWrites).toBe(0);
  });

  it("parses spreadsheet HTML as inert data and rejects executable formula families", async () => {
    const html =
      '<table><tbody><tr><td data-formula="=A1+1" style="font-weight:bold;color:#123456">2</td>' +
      '<td data-formula="=WEBSERVICE(&quot;https://example.test&quot;)">' +
      '<img src=x onerror="globalThis.__clipboardExecuted=true">=WEBSERVICE()</td></tr></tbody></table>';
    const item = new FakeClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: () => Promise.resolve([item]),
        readText: () => Promise.reject(new Error("HTML should be handled first")),
      },
    });
    h.select(1, 0);

    await expect(h.controller.paste()).resolves.toBe("done");
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 0 })).toBe("=A1+1");
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 0 }).style).toMatchObject({
      bold: true,
      color: "#123456",
    });
    expect(h.store.getFormula({ sheet: "s1", row: 1, col: 1 })).toBeNull();
    expect(h.store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toStartWith("'=WEBSERVICE()");
    expect((globalThis as Record<string, unknown>).__clipboardExecuted).toBeUndefined();
  });
});
