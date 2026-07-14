import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Grid, GridEvents, Workbook } from "@sheetwrite/core";
import { DEFAULT_THEME, initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { act, createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  type AdapterConformanceProps,
  type MountedAdapter,
  runSharedAdapterLifecycleContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { Sheetwrite, SheetwriteGrid } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let restoreStubs: () => void;

beforeEach(() => {
  document.body.replaceChildren();
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
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

async function mountConformanceGrid(props: AdapterConformanceProps): Promise<MountedAdapter> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const gridRef = createRef<Grid>();
  const publishedAtReady: Array<Grid | null | undefined> = [];

  const render = async (nextProps: AdapterConformanceProps): Promise<void> => {
    const { fallbackLabel, ...gridProps } = nextProps;
    await act(async () => {
      root.render(
        <SheetwriteGrid
          {...gridProps}
          ref={gridRef}
          fallback={<span data-lifecycle-fallback>{fallbackLabel}</span>}
          onReady={(event) => {
            publishedAtReady.push(gridRef.current);
            gridProps.onReady?.(event);
          }}
        />,
      );
    });
  };

  await render(props);
  return {
    host,
    publishedAtReady,
    getPublishedGrid: () => gridRef.current,
    render,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

runSharedAdapterLifecycleContract("React", mountConformanceGrid);

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
    const onReady = ({ grid }: { grid: Grid }): void => {
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
          onViewportChange={() => calls.push("old-scroll")}
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
          onViewportChange={() => calls.push("new-scroll")}
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
          <SheetwriteGrid
            ref={gridRef}
            workbook={workbook}
            onReady={({ grid }) => ready.push(grid)}
          />
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

  it("forwards ordinary div attributes to the host and keeps .sheetwrite through className churn", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <SheetwriteGrid
          workbook={workbook}
          data-testid="grid"
          id="g1"
          tabIndex={0}
          className="p-2 initial"
        />,
      );
    });

    const div = host.firstElementChild as HTMLDivElement;
    expect(div.getAttribute("data-testid")).toBe("grid");
    expect(div.id).toBe("g1");
    expect(div.tabIndex).toBe(0);
    expect(div.classList.contains("sheetwrite")).toBe(true);
    expect(div.classList.contains("initial")).toBe(true);

    // Tailwind-style cn() churn: a changed className must not reconcile the
    // grid's own .sheetwrite (CSS-variable chrome) away.
    await act(async () => {
      root.render(
        <SheetwriteGrid workbook={workbook} data-testid="grid" className="p-4 updated" />,
      );
    });
    expect(div.classList.contains("sheetwrite")).toBe(true);
    expect(div.classList.contains("updated")).toBe(true);
    expect(div.classList.contains("initial")).toBe(false);

    await act(async () => root.unmount());
  });

  it("keeps native scroll available while grid changes use onGridChange", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const changes: unknown[] = [];
    const nativeScrolls: unknown[] = [];

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onGridChange={(event) => changes.push(event)}
          onScroll={(event) => nativeScrolls.push(event)}
        />,
      );
    });

    const div = host.firstElementChild as HTMLDivElement;
    div.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(nativeScrolls).toHaveLength(1);
    expect(changes).toHaveLength(0);

    // The grid `change` event still reaches the callback (grid semantics).
    gridRef.current!.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "sheet", row: 0, col: 0 },
          value: { kind: "literal", value: "x" },
        },
      ],
    });
    expect(changes).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it("never leaks GridOptions members to the DOM and triggers no unknown-prop warning", async () => {
    const workbook = makeWorkbook();
    const data = { rowCount: 3, columns: { value: ["a", "b", "c"] } };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const warnings: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      warnings.push(args);
    };

    try {
      await act(async () => {
        root.render(<SheetwriteGrid workbook={workbook} data={data} overscan={4} />);
      });

      const div = host.firstElementChild as HTMLDivElement;
      expect(div.getAttribute("workbook")).toBeNull();
      expect(div.getAttribute("data")).toBeNull();
      expect(div.getAttribute("overscan")).toBeNull();

      // No React unknown-prop warnings surfaced.
      expect(warnings).toHaveLength(0);

      await act(async () => root.unmount());
    } finally {
      console.error = originalError;
    }
  });

  it("keeps the grid and committed edits when overscan/minColumns change live", async () => {
    const workbook = makeWorkbook();
    const data = { rowCount: 3, columns: { value: ["a", "b", "c"] } };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();

    await act(async () => {
      root.render(<SheetwriteGrid ref={gridRef} workbook={workbook} data={data} overscan={2} />);
    });
    const first = gridRef.current!;

    // Commit a user edit that lives only in the grid's store.
    first.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "sheet", row: 0, col: 0 },
          value: { kind: "literal", value: "edited" },
        },
      ],
    });

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          data={data}
          overscan={9}
          minColumns={12}
        />,
      );
    });

    // No recreate: same grid, and the committed edit survived.
    expect(gridRef.current).toBe(first);
    expect(first.store.getCell({ sheet: "sheet", row: 0, col: 0 }).resolved).toBe("edited");
    expect(host.querySelector("[role=grid]")?.getAttribute("aria-colcount")).toBe("12");

    await act(async () => root.unmount());
  });
  it("builds an uncontrolled data-first grid and resets on defaultRows identity", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const columns = [
      { key: "name", title: "Name" },
      { key: "price", title: "Price", type: "currency" as const },
    ] as const;
    const firstRows = [{ name: "Notebook", price: 12.5 }];
    const ready: Array<{ generation: number; reason: string }> = [];

    await act(async () => {
      root.render(
        <Sheetwrite
          ref={gridRef}
          columns={columns}
          defaultRows={firstRows}
          height={200}
          onReady={({ generation, reason }) => ready.push({ generation, reason })}
        />,
      );
    });
    const first = gridRef.current!;
    first.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "sheet1", row: 0, col: 0 },
          value: { kind: "literal", value: "Edited" },
        },
      ],
    });
    expect(firstRows[0]?.name).toBe("Notebook");

    await act(async () => {
      root.render(
        <Sheetwrite
          ref={gridRef}
          columns={columns}
          defaultRows={[{ name: "Pen", price: 2.25 }]}
          height={200}
          onReady={({ generation, reason }) => ready.push({ generation, reason })}
        />,
      );
    });
    expect(gridRef.current).not.toBe(first);
    expect(gridRef.current?.store.getCell({ sheet: "sheet1", row: 0, col: 0 }).resolved).toBe(
      "Pen",
    );
    expect(ready).toEqual([
      { generation: 1, reason: "initial" },
      { generation: 2, reason: "input-reset" },
    ]);
    await act(async () => root.unmount());
  });
});
