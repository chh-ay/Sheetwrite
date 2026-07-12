import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Grid, GridEvents, Workbook } from "@sheetwrite/core";
import { DEFAULT_THEME, initSheetwrite } from "@sheetwrite/core";
import { act, createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SheetwriteGrid } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// happy-dom has no 2D canvas or layout; stub both like the core suites do.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  document.body.replaceChildren();
  const noop = (): void => {};
  const recording = new Proxy(
    { canvas: null, fillStyle: "", strokeStyle: "", font: "", lineWidth: 1 },
    {
      get(target, prop) {
        if (prop in target) return Reflect.get(target, prop);
        return noop;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value);
        return true;
      },
    },
  );
  const stub = (): CanvasRenderingContext2D => recording as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 400,
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", origClientWidth);
  if (origClientHeight)
    Object.defineProperty(HTMLElement.prototype, "clientHeight", origClientHeight);
});

function makeWorkbook(extraSheet = false): Workbook {
  const workbook: Workbook = {
    activeSheet: "sheet",
    sheets: [
      {
        id: "sheet",
        name: "Sheet",
        rowCount: 3,
        columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
      },
    ],
  };
  if (extraSheet) {
    workbook.sheets.push({
      id: "sheet2",
      name: "Summary",
      rowCount: 2,
      columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
    });
  }
  return workbook;
}

describe("SheetwriteGrid React lifecycle", () => {
  it("publishes, replaces, transfers, and clears the forwarded Grid ref", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const created: Grid[] = [];
    const firstValues: Array<Grid | null> = [];
    const secondValues: Array<Grid | null> = [];
    const firstRef = (grid: Grid | null): void => {
      firstValues.push(grid);
    };
    const secondRef = (grid: Grid | null): void => {
      secondValues.push(grid);
    };
    const firstData = { rowCount: 3, columns: { value: ["a", "b", "c"] } };
    const secondData = { rowCount: 3, columns: { value: ["x", "y", "z"] } };
    const onReady = (grid: Grid): void => {
      created.push(grid);
    };

    await act(async () => {
      root.render(
        <SheetwriteGrid ref={firstRef} workbook={workbook} data={firstData} onReady={onReady} />,
      );
    });
    expect(created).toHaveLength(1);
    expect(firstValues.at(-1)).toBe(created[0]!);

    // Swapping only the ref transfers the SAME grid: no recreate.
    await act(async () => {
      root.render(
        <SheetwriteGrid ref={secondRef} workbook={workbook} data={firstData} onReady={onReady} />,
      );
    });
    expect(created).toHaveLength(1);
    expect(firstValues.at(-1)).toBeNull();
    expect(secondValues.at(-1)).toBe(created[0]!);

    // A construction-bound option (data identity) recreates the grid.
    await act(async () => {
      root.render(
        <SheetwriteGrid ref={secondRef} workbook={workbook} data={secondData} onReady={onReady} />,
      );
    });
    expect(created).toHaveLength(2);
    expect(secondValues).toContain(null);
    expect(secondValues.at(-1)).toBe(created[1]!);

    await act(async () => root.unmount());
    expect(secondValues.at(-1)).toBeNull();
    expect(host.childElementCount).toBe(0);
  });

  it("keeps the Grid while updating live options, host props, and event callbacks", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const calls: string[] = [];

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          readOnly={false}
          config={{ toolbar: true }}
          className="initial"
          style={{ height: 200 }}
          onScroll={() => calls.push("old-scroll")}
        />,
      );
    });

    const first = gridRef.current;
    expect(first).not.toBeNull();
    expect(host.firstElementChild?.classList.contains("initial")).toBe(true);
    expect(host.querySelector(".sheetwrite-toolbar")).not.toBeNull();

    // The initial mount may repaint (theme effect) and emit scroll to the
    // still-current callback; the swap contract concerns post-rerender events.
    calls.length = 0;

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          readOnly
          config={{ toolbar: false }}
          className="updated"
          style={{ height: 240 }}
          onScroll={() => calls.push("new-scroll")}
        />,
      );
    });

    // Live options applied on the SAME grid instance — no recreate.
    expect(gridRef.current).toBe(first);
    expect(host.firstElementChild?.classList.contains("updated")).toBe(true);
    expect(host.querySelector(".sheetwrite-toolbar")).toBeNull();

    // The swapped callback is read live: a refresh emits scroll to the NEW one.
    gridRef.current!.refresh();
    expect(calls).toContain("new-scroll");
    expect(calls).not.toContain("old-scroll");

    await act(async () => root.unmount());
  });

  it("forwards active-sheet through onActiveSheetChange, reading the live callback", async () => {
    const workbook = makeWorkbook(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const events: Array<GridEvents["active-sheet"]> = [];

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => events.push(event)}
        />,
      );
    });

    gridRef.current!.setActiveSheet("sheet2");
    expect(events).toEqual([{ sheet: "sheet2" }]);

    // A re-render swaps the live callback without recreating the grid.
    const swapped: Array<GridEvents["active-sheet"]> = [];
    const first = gridRef.current;
    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => swapped.push(event)}
        />,
      );
    });

    expect(gridRef.current).toBe(first);
    gridRef.current!.setActiveSheet("sheet");
    expect(events).toEqual([{ sheet: "sheet2" }]);
    expect(swapped).toEqual([{ sheet: "sheet" }]);

    await act(async () => root.unmount());
  });

  it("StrictMode replay creates twice, keeps a live grid, and leaks nothing", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const ready: Grid[] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <SheetwriteGrid ref={gridRef} workbook={workbook} onReady={(grid) => ready.push(grid)} />
        </StrictMode>,
      );
    });

    // StrictMode replays the mount effect: create → destroy → create.
    expect(ready).toHaveLength(2);
    expect(gridRef.current).toBe(ready[1]!);
    expect(gridRef.current).not.toBe(ready[0]!);

    // The replayed-away first grid is fully torn down: exactly one live grid
    // remains inside the host.
    expect(host.querySelectorAll(".sheetwrite").length).toBe(1);

    await act(async () => root.unmount());
    expect(gridRef.current).toBeNull();
    expect(host.childElementCount).toBe(0);
  });
  it("treats the theme prop as authoritative: removing it restores defaults", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();

    await act(async () => {
      root.render(<SheetwriteGrid ref={gridRef} workbook={workbook} theme={{ bg: "#ff0000" }} />);
    });
    expect(gridRef.current!.getEffectiveTheme().bg).toBe("#ff0000");
    const first = gridRef.current;

    await act(async () => {
      root.render(<SheetwriteGrid ref={gridRef} workbook={workbook} />);
    });

    // Same grid (no recreate); theme back to default resolution.
    expect(gridRef.current).toBe(first);
    expect(gridRef.current!.getEffectiveTheme().bg).toBe(DEFAULT_THEME.bg);

    await act(async () => root.unmount());
  });
});
