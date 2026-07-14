import { beforeAll, describe, expect, it } from "bun:test";
import type { AriaMirror } from "../src/aria-mirror.js";
import { DatasourceController } from "../src/datasource-controller.js";
import { DocumentController } from "../src/document-controller.js";
import { GeometryLayoutController } from "../src/geometry-layout-controller.js";
import { DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import type { OverlayPainter } from "../src/overlay-painter.js";
import { RenderCoordinator } from "../src/render-coordinator.js";
import { SheetwriteStore } from "../src/store.js";
import type { Renderer, Viewport, VisibleWindowView } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("DocumentController", () => {
  it("owns commit history and applies undo/redo through the store", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    let historyApplications = 0;
    const controller = new DocumentController({
      store,
      loadable: store,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {
        historyApplications += 1;
      },
    });
    const address = { sheet: "s1", row: 1, col: 0 };

    expect(
      controller.applyTransaction({
        patches: [{ op: "set", addr: address, value: { kind: "literal", value: "Ada" } }],
      }).status,
    ).toBe("applied");
    expect(store.getCell(address).resolved).toBe("Ada");

    controller.undo();
    expect(store.getCell(address).resolved).toBeNull();
    controller.redo();
    expect(store.getCell(address).resolved).toBe("Ada");
    expect(historyApplications).toBe(2);

    controller.destroy();
    store.dispose();
  });
  it("captures structural and range inverses for Store implementations without compact history", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: "row-one" },
          style: { bold: true },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "formula", src: "=A2" },
        },
      ],
    });
    const controller = new DocumentController({
      store,
      // A custom Store has no compact SheetwriteStore range snapshots. The
      // controller must still construct complete serializable inverses.
      loadable: null,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {},
    });

    expect(
      controller.commit([{ op: "removeRows", sheet: "s1", at: 1, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 })).toMatchObject({
      resolved: "row-one",
      style: { bold: true },
    });
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    expect(
      controller.commit([{ op: "removeColumns", sheet: "s1", at: 0, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(
      store
        .getWorkbook()
        .sheets[0]!.columns.slice(0, 2)
        .map(({ key }) => key),
    ).toEqual(["name", "amount"]);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");

    const range = {
      sheet: "s1",
      start: { row: 2, col: 1 },
      end: { row: 1, col: 0 },
    };
    expect(controller.commit([{ op: "clearRange", range }], "api").status).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    const namedRange = {
      name: "Selection",
      scope: "s1",
      range: { ...range, start: range.end, end: range.start },
    };
    expect(controller.commit([{ op: "setNamedRange", namedRange }], "api").status).toBe("applied");
    expect(
      controller.commit(
        [{ op: "setNamedRange", namedRange: { ...namedRange, name: "selection" } }],
        "api",
      ).status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);
    expect(
      controller.commit([{ op: "removeNamedRange", name: "SELECTION", scope: "s1" }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);

    controller.destroy();
    store.dispose();
  });
});

describe("DatasourceController", () => {
  it("deduplicates loaded bands and publishes a resolved page once", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    let requests = 0;
    let rowsLoaded = 0;
    const controller = new DatasourceController(
      {
        datasource: async (request) => {
          requests += 1;
          return { start: request.start, rows: [{ name: "Loaded" }] };
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {
          rowsLoaded += 1;
        },
        onError: () => {},
      },
      4,
    );

    controller.ensureLoaded(0, 1);
    controller.ensureLoaded(0, 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toBe(1);
    expect(rowsLoaded).toBe(1);
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Loaded");
    controller.ensureLoaded(0, 1);
    expect(requests).toBe(1);

    controller.destroy();
    store.dispose();
  });
});

describe("GeometryLayoutController", () => {
  it("owns zoomed indexes, frozen bands, windows, and cell rectangles", () => {
    const workbook = makeWorkbook(10);
    const sheet = workbook.sheets[0]!;
    sheet.frozenRows = 2;
    sheet.frozenCols = 1;
    sheet.rowHeights = new Map([[1, 40]]);
    const controller = new GeometryLayoutController(
      {
        sheet: () => sheet,
        activeSheet: () => "s1",
        loadable: null,
        theme: () => DEFAULT_THEME,
        zoom: () => 1,
        maxElementHeight: 33_000_000,
      },
      160,
    );

    expect(controller.rowHeight(1)).toBe(40);
    expect(controller.frozenHeight()).toBe(DEFAULT_THEME.rowHeight + 40);
    expect(controller.frozenWidth()).toBe(160);
    expect(controller.paintWindow(0, 0, 132, 360, 0)).toMatchObject({
      frozenRows: 2,
      frozenColumns: 1,
      frozenWidth: 160,
    });
    expect(
      controller.rangeRect(
        {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: 1, col: 1 },
        },
        0,
        0,
      ),
    ).toEqual({
      x: DEFAULT_THEME.rowHeaderWidth,
      y: DEFAULT_THEME.headerHeight,
      w: 280,
      h: DEFAULT_THEME.rowHeight + 40,
    });
  });
});

describe("RenderCoordinator", () => {
  it("coalesces animation frames and invalidates cached paints", () => {
    const store = new SheetwriteStore(makeWorkbook(8));
    const sheet = store.getWorkbook().sheets[0]!;
    const geometry = new GeometryLayoutController(
      {
        sheet: () => sheet,
        activeSheet: () => "s1",
        loadable: null,
        theme: () => DEFAULT_THEME,
        zoom: () => 1,
        maxElementHeight: 33_000_000,
      },
      180,
    );
    const datasource = new DatasourceController(
      {
        loadable: null,
        activeSheet: () => "s1",
        rowCount: () => sheet.rowCount,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      sheet.rowCount,
    );
    const viewports: Viewport[] = [];
    const paints: VisibleWindowView[] = [];
    let overlayPaints = 0;
    let ariaUpdates = 0;
    const renderer: Renderer = {
      mount: () => {},
      setLayout: () => {},
      setViewport: (viewport) => viewports.push(viewport),
      paint: (view) => paints.push(view),
      setTheme: () => {},
      setRenderers: () => {},
      destroy: () => {},
    };
    const overlay = {
      paint: () => {
        overlayPaints += 1;
      },
    } as unknown as OverlayPainter;
    const aria = {
      bumpVersion: () => {},
      update: () => {
        ariaUpdates += 1;
      },
    } as unknown as AriaMirror;
    const scheduled: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    const coordinator = new RenderCoordinator({
      renderer: () => renderer,
      overlayPainter: overlay,
      ariaMirror: aria,
      geometry,
      datasource,
      store,
      activeSheet: () => "s1",
      theme: () => DEFAULT_THEME,
      overscan: () => 0,
      zoom: () => 1,
      storeEpoch: () => 0,
      viewportHeight: () => 180,
      viewportWidth: () => 420,
      scrollTop: () => 0,
      scrollLeft: () => 0,
      repositionEditor: () => {},
      emitScroll: () => {},
    });

    try {
      coordinator.schedule();
      coordinator.schedule();
      expect(scheduled).toHaveLength(1);
      scheduled[0]!(0);
      expect(paints).toHaveLength(1);
      expect(viewports).toHaveLength(1);
      expect(overlayPaints).toBe(1);
      expect(ariaUpdates).toBe(1);

      coordinator.invalidate();
      coordinator.renderNow();
      expect(paints).toHaveLength(2);
      expect(viewports[1]?.contentRevision).toBe(1);
    } finally {
      coordinator.destroy();
      datasource.destroy();
      store.dispose();
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
