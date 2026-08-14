import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid.js";
import {
  KIND_BOOL,
  KIND_EMPTY,
  KIND_NUMBER,
  KIND_STRING,
  NO_STRING,
} from "../src/store/wire-tags.js";
import { SheetwriteStore } from "../src/store.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("cell-kind wire tags", () => {
  it("matches the tags and string sentinel produced by the WASM store", () => {
    const store = new SheetwriteStore(makeWorkbook(1));
    try {
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "literal", value: 42 },
          },
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 1 },
            value: { kind: "literal", value: "alpha" },
          },
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 2 },
            value: { kind: "literal", value: true },
          },
        ],
      });

      const view = store.getVisibleWindow("s1", { start: 0, end: 1 }, [0, 1, 2, 3]);
      expect(Array.from(view.valueKinds ?? [])).toEqual([
        KIND_NUMBER,
        KIND_STRING,
        KIND_BOOL,
        KIND_EMPTY,
      ]);
      expect(view.stringPoolIds?.[0]).toBe(NO_STRING);
    } finally {
      store.dispose();
    }
  });
});
