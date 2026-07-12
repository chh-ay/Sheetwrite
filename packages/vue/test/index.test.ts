import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { ColumnarData, Grid, GridEvents, Workbook } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { SheetwriteGrid, type SheetwriteGridExpose } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

// happy-dom has no 2D canvas or layout; stub both like the core suites do.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
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

function makeWorkbook(rowCount = 5, extraSheet = false): Workbook {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number" },
        ],
      },
    ],
  };
  if (extraSheet) {
    workbook.sheets.push({
      id: "s2",
      name: "Summary",
      rowCount: 2,
      columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
    });
  }
  return workbook;
}

function makeData(rowCount = 5): ColumnarData {
  const name: string[] = new Array(rowCount);
  const amount = new Float64Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    name[r] = `Row ${r}`;
    amount[r] = r;
  }
  return { rowCount, columns: { name, amount } };
}

interface Harness {
  host: HTMLDivElement;
  state: { data: ColumnarData; theme: Record<string, string> | undefined };
  getGrid: () => Grid | null;
  unmount: () => void;
}

/** Mount the adapter under a reactive parent so prop changes flow like an app's. */
function mountGrid(
  workbook: Workbook,
  listeners: Record<string, (...args: never[]) => void> = {},
): Harness {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const state = reactive({
    data: makeData(workbook.sheets[0]?.rowCount ?? 5) as ColumnarData,
    theme: undefined as Record<string, string> | undefined,
    overscan: undefined as number | undefined,
    minColumns: undefined as number | undefined,
  });
  const cmp = ref<SheetwriteGridExpose | null>(null);

  const Parent = defineComponent({
    setup() {
      return () =>
        h(SheetwriteGrid, {
          ref: cmp,
          workbook,
          data: state.data,
          theme: state.theme,
          overscan: state.overscan,
          minColumns: state.minColumns,
          ...listeners,
        });
    },
  });

  const app = createApp(Parent);
  app.mount(host);

  return {
    host,
    state,
    getGrid: () => cmp.value?.grid ?? null,
    unmount: () => app.unmount(),
  };
}

describe("SheetwriteGrid Vue lifecycle", () => {
  it("mounts a grid reachable through the exposed grid handle", () => {
    const harness = mountGrid(makeWorkbook());

    const grid = harness.getGrid();
    expect(grid).not.toBeNull();
    expect(grid?.store).toBeDefined();
    expect(harness.host.querySelector(".sheetwrite")).not.toBeNull();

    harness.unmount();
  });

  it("emits ready once after publishing generation one", async () => {
    const probe = new URL("./ready-probe.ts", import.meta.url).pathname;
    const process = Bun.spawn(["bun", probe], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout.trim())).toEqual({
      emitted: true,
      publishedBeforeReady: true,
      generation: 1,
      reason: "initial",
    });
  });

  it("emits change after a scripted store transaction", () => {
    const changes: unknown[] = [];
    const harness = mountGrid(makeWorkbook(), {
      onGridChange: (event: unknown) => changes.push(event),
    });

    harness.getGrid()!.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "x" },
        },
      ],
    });

    expect(changes).toHaveLength(1);
    harness.unmount();
  });

  it("emits selection after setSelection", () => {
    const selections: unknown[] = [];
    const harness = mountGrid(makeWorkbook(), {
      onSelectionChange: (selection: unknown) => selections.push(selection),
    });

    harness.getGrid()!.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });

    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ kind: "cell", addr: { row: 1, col: 0 } });
    harness.unmount();
  });

  it("emits active-sheet with the sheet id on setActiveSheet", () => {
    const events: Array<GridEvents["active-sheet"]> = [];
    const harness = mountGrid(makeWorkbook(5, true), {
      onActiveSheetChange: (event: GridEvents["active-sheet"]) => events.push(event),
    });

    harness.getGrid()!.setActiveSheet("s2");

    expect(events).toEqual([{ sheet: "s2" }]);
    harness.unmount();
  });

  it("recreates the grid when data identity changes", async () => {
    const harness = mountGrid(makeWorkbook());
    const first = harness.getGrid();

    harness.state.data = makeData(5);
    await nextTick();

    const second = harness.getGrid();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    harness.unmount();
  });

  it("does NOT recreate on a mutation inside data (shallow watch contract)", async () => {
    const harness = mountGrid(makeWorkbook());
    const first = harness.getGrid();

    const names = harness.state.data.columns.name as string[];
    names[0] = "mutated";
    await nextTick();

    expect(harness.getGrid()).toBe(first);
    harness.unmount();
  });

  it("applies a theme change live without recreating", async () => {
    const harness = mountGrid(makeWorkbook());
    const first = harness.getGrid();

    harness.state.theme = { bg: "#000000" };
    await nextTick();

    expect(harness.getGrid()).toBe(first);
    harness.unmount();
  });

  it("destroys the grid on unmount, leaving the host empty", () => {
    const harness = mountGrid(makeWorkbook());
    expect(harness.host.childElementCount).toBeGreaterThan(0);

    harness.unmount();

    expect(harness.host.childElementCount).toBe(0);
  });

  it("keeps the grid and committed edits when overscan/minColumns change live", async () => {
    const harness = mountGrid(makeWorkbook());
    const first = harness.getGrid()!;

    // Commit a user edit that lives only in the grid's store.
    first.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "edited" },
        },
      ],
    });

    harness.state.overscan = 9;
    harness.state.minColumns = 12;
    await nextTick();

    // No recreate: same grid, and the committed edit survived.
    expect(harness.getGrid()).toBe(first);
    expect(first.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("edited");
    expect(harness.host.querySelector("[role=grid]")?.getAttribute("aria-colcount")).toBe("12");

    harness.unmount();
  });
});
