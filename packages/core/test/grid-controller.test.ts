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

  it("unsubscribes controller listeners and tears down the grid and observer exactly once", () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    let observations = 0;
    let disconnects = 0;
    class CountingResizeObserver {
      observe(): void {
        observations += 1;
      }
      unobserve(): void {}
      disconnect(): void {
        disconnects += 1;
      }
      takeRecords(): ResizeObserverEntry[] {
        return [];
      }
    }
    globalThis.ResizeObserver = CountingResizeObserver as unknown as typeof ResizeObserver;

    try {
      const host = mountHost();
      const controller = createGridController(
        host,
        { workbook: multiSheetWorkbook(), data: makeColumnarData(10) },
        {},
      );
      const listenerEvents = [
        "change",
        "selection",
        "scroll",
        "edit-begin",
        "edit-commit",
        "search",
        "active-sheet",
      ] as const satisfies readonly (keyof GridEvents)[];
      // GridController intentionally owns one subscription for each forwarded
      // event; the private sets are inspected only at this common test seam.
      const instrumentedGrid = controller.grid as typeof controller.grid & {
        listeners: { [Event in keyof GridEvents]: Set<unknown> };
      };
      for (const event of listenerEvents) {
        expect(instrumentedGrid.listeners[event].size, event).toBe(1);
      }

      let gridDestroyCalls = 0;
      const originalDestroy = controller.grid.destroy.bind(controller.grid);
      controller.grid.destroy = () => {
        gridDestroyCalls += 1;
        originalDestroy();
      };
      controller.destroy();
      controller.destroy();

      for (const event of listenerEvents) {
        expect(instrumentedGrid.listeners[event].size, event).toBe(0);
      }
      expect(observations).toBe(1);
      expect(disconnects).toBe(1);
      expect(gridDestroyCalls).toBe(1);
      expect(host.childElementCount).toBe(0);
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });
});
