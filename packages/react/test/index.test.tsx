import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Grid, GridOptions, Workbook } from "@sheetwrite/core";
import type { GridController, GridControllerHandlers } from "@sheetwrite/core/adapter";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

interface FakeCreation {
  options: GridOptions;
  handlers: GridControllerHandlers;
  controller: GridController;
}

const creations: FakeCreation[] = [];

mock.module("@sheetwrite/core/adapter", () => ({
  createGridController: (
    _host: HTMLElement,
    options: GridOptions,
    handlers: GridControllerHandlers,
  ): GridController => {
    const grid = {
      marker: creations.length + 1,
      // Mirrors the real grid's active-sheet emission so ref-driven tests can
      // exercise the controller's forwarding path.
      setActiveSheet: (sheet: string) => {
        handlers.onActiveSheetChange?.({ sheet });
      },
    } as unknown as Grid;
    const controller: GridController = {
      grid,
      setTheme: mock(() => {}),
      setReadOnly: mock(() => {}),
      setConfig: mock(() => {}),
      destroy: mock(() => {}),
    };
    creations.push({ options, handlers, controller });
    handlers.onReady?.(grid);
    return controller;
  },
}));

// The adapter is loaded after installing its package-boundary controller mock.
const { SheetwriteGrid } = await import("../src/index.js");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workbook: Workbook = {
  activeSheet: "sheet",
  sheets: [
    {
      id: "sheet",
      name: "Sheet",
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
    },
  ],
};

beforeEach(() => {
  creations.length = 0;
  document.body.replaceChildren();
});

describe("SheetwriteGrid React lifecycle", () => {
  it("publishes, replaces, transfers, and clears the forwarded Grid ref", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const firstValues: Array<Grid | null> = [];
    const secondValues: Array<Grid | null> = [];
    const firstRef = (grid: Grid | null): void => {
      firstValues.push(grid);
    };
    const secondRef = (grid: Grid | null): void => {
      secondValues.push(grid);
    };
    const firstWorker = new URL("https://example.test/first-worker.js");
    const secondWorker = new URL("https://example.test/second-worker.js");

    await act(async () => {
      root.render(<SheetwriteGrid ref={firstRef} workbook={workbook} workerUrl={firstWorker} />);
    });
    const firstGrid = creations[0]!.controller.grid;
    expect(firstValues.at(-1)).toBe(firstGrid);

    await act(async () => {
      root.render(<SheetwriteGrid ref={secondRef} workbook={workbook} workerUrl={firstWorker} />);
    });
    expect(creations).toHaveLength(1);
    expect(firstValues.at(-1)).toBeNull();
    expect(secondValues.at(-1)).toBe(firstGrid);

    await act(async () => {
      root.render(<SheetwriteGrid ref={secondRef} workbook={workbook} workerUrl={secondWorker} />);
    });
    expect(creations).toHaveLength(2);
    expect(creations[0]!.controller.destroy).toHaveBeenCalledTimes(1);
    expect(secondValues).toContain(null);
    expect(secondValues.at(-1)).toBe(creations[1]!.controller.grid);

    await act(async () => root.unmount());
    expect(secondValues.at(-1)).toBeNull();
    expect(creations[1]!.controller.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the Grid while updating live options, host props, and event callbacks", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const initialConfig = { find: true };
    const nextConfig = { find: false, toolbar: false };
    const calls: string[] = [];
    const renderers = {};

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          renderer="worker"
          workerUrl="worker.js"
          renderers={renderers}
          overscan={9}
          minColumns={12}
          readOnly={false}
          config={initialConfig}
          className="initial"
          style={{ height: 200 }}
          onScroll={() => calls.push("old-scroll")}
        />,
      );
    });

    expect(creations).toHaveLength(1);
    expect(creations[0]!.options).toMatchObject({
      workbook,
      renderer: "worker",
      workerUrl: "worker.js",
      overscan: 9,
      minColumns: 12,
      readOnly: false,
      config: initialConfig,
    });
    expect(gridRef.current).toBe(creations[0]!.controller.grid);

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          renderer="worker"
          workerUrl="worker.js"
          renderers={renderers}
          overscan={9}
          minColumns={12}
          readOnly
          config={nextConfig}
          className="updated"
          style={{ height: 240 }}
          onScroll={() => calls.push("new-scroll")}
          onEditBegin={() => calls.push("edit-begin")}
          onEditCommit={() => calls.push("edit-commit")}
          onSearch={() => calls.push("search")}
        />,
      );
    });

    expect(creations).toHaveLength(1);
    const active = creations[0]!;
    expect(active.controller.setReadOnly).toHaveBeenLastCalledWith(true);
    expect(active.controller.setConfig).toHaveBeenLastCalledWith(nextConfig);
    active.handlers.onScroll?.({ scrollTop: 1, firstRow: 2, lastRow: 3 });
    active.handlers.onEditBegin?.({ addr: { sheet: "sheet", row: 0, col: 0 } });
    active.handlers.onEditCommit?.({
      addr: { sheet: "sheet", row: 0, col: 0 },
      value: { kind: "literal", value: "x" },
    });
    active.handlers.onSearch?.({ query: "x", matches: [], active: -1 });
    expect(calls).toEqual(["new-scroll", "edit-begin", "edit-commit", "search"]);
    expect(host.firstElementChild?.className).toBe("updated");

    await act(async () => root.unmount());
  });

  it("forwards active-sheet through onActiveSheetChange, reading the live callback", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const events: Array<{ sheet: string }> = [];

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => events.push(event)}
        />,
      );
    });

    expect(creations).toHaveLength(1);
    gridRef.current!.setActiveSheet("sheet2");
    expect(events).toEqual([{ sheet: "sheet2" }]);

    // A re-render swaps the live callback without recreating the grid.
    const swapped: Array<{ sheet: string }> = [];
    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => swapped.push(event)}
        />,
      );
    });

    expect(creations).toHaveLength(1);
    gridRef.current!.setActiveSheet("sheet");
    expect(events).toEqual([{ sheet: "sheet2" }]);
    expect(swapped).toEqual([{ sheet: "sheet" }]);

    await act(async () => root.unmount());
  });
});
