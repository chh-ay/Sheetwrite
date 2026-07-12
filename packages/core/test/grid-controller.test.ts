import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid.js";
import type { GridControllerHandlers } from "../src/grid-controller.js";
import { createGridController } from "../src/grid-controller.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridEvents, Workbook } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function multiSheetWorkbook(): Workbook {
  const base = makeWorkbook(10);
  base.sheets.push({
    id: "sheet2",
    name: "Summary",
    rowCount: 5,
    columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
  });
  return base;
}

describe("createGridController onReady exception safety", () => {
  it("rethrows the same error and leaves no leaked grid DOM when onReady throws", () => {
    const host = mountHost();
    const boom = new Error("consumer mount bug");

    let thrown: unknown;
    try {
      createGridController(
        host,
        { workbook: makeWorkbook(10), data: makeColumnarData(10) },
        {
          onReady: () => {
            throw boom;
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    // The original error object is preserved (no wrapping), and destroy ran:
    // the fully mounted grid was torn out of the host.
    expect(thrown).toBe(boom);
    expect(host.childElementCount).toBe(0);
  });

  it("allows a second create on the same host after a throwing onReady", () => {
    const host = mountHost();

    expect(() =>
      createGridController(
        host,
        { workbook: makeWorkbook(10), data: makeColumnarData(10) },
        {
          onReady: () => {
            throw new Error("first mount fails");
          },
        },
      ),
    ).toThrow("first mount fails");

    const controller = createGridController(
      host,
      { workbook: makeWorkbook(10), data: makeColumnarData(10) },
      {},
    );
    expect(host.childElementCount).toBeGreaterThan(0);

    controller.destroy();
  });
});

describe("createGridController active-sheet forwarding", () => {
  it("forwards active-sheet with the sheet id payload", () => {
    const host = mountHost();
    const seen: Array<GridEvents["active-sheet"]> = [];

    const controller = createGridController(
      host,
      { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
      { onActiveSheetChange: (event) => seen.push(event) },
    );

    controller.grid.setActiveSheet("sheet2");
    expect(seen).toEqual([{ sheet: "sheet2" }]);

    controller.destroy();
  });

  it("reads a swapped onActiveSheetChange handler live", () => {
    const host = mountHost();
    const first: string[] = [];
    const second: string[] = [];

    const handlers: GridControllerHandlers = {
      onActiveSheetChange: (event) => first.push(event.sheet),
    };
    const controller = createGridController(
      host,
      { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
      handlers,
    );

    controller.grid.setActiveSheet("sheet2");
    handlers.onActiveSheetChange = (event) => second.push(event.sheet);
    controller.grid.setActiveSheet("s1");

    expect(first).toEqual(["sheet2"]);
    expect(second).toEqual(["s1"]);

    controller.destroy();
  });
});
