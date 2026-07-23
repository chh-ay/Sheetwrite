import { describe, expect, it } from "bun:test";
import type { ChangeEvent, Grid } from "@sheetwrite/core";
import {
  bindEngineEvents,
  createEngineLiveDataSource,
  createEngineTrace,
  ENGINE_LIVE_SHEET,
  type EngineEventInput,
  engineLiveRow,
} from "../src/showcases/scenarios/engine-live.js";

function fakeGrid(onListener: (event: string, listener: (payload: never) => void) => void): Grid {
  const store = {
    getFormula: () => "=D8-C8",
    getCell: () => ({ resolved: 25 }),
    acknowledgeOperations: () => {},
  };
  return {
    store,
    rendererKind: () => "canvas",
    getRuntimeResourceSnapshot: (operation: string) => ({
      operation,
      wasm: { allocatedCapacityBytes: 4096 },
    }),
    on: (event: string, listener: (payload: never) => void) => {
      onListener(event, listener);
      return () => {};
    },
  } as unknown as Grid;
}

describe("live engine event story", () => {
  it("records the exact deterministic request, Grid, drawing, and host order", async () => {
    const trace = createEngineTrace(20);
    const emit = (event: EngineEventInput) => trace.push(event);
    const columns = [{ start: 2, end: 5, keys: ["actual", "forecast", "variance"] }] as const;
    const source = createEngineLiveDataSource(emit);
    const page = await source.getRows({
      protocol: 2,
      sheet: ENGINE_LIVE_SHEET,
      start: 7,
      end: 9,
      columns,
      signal: new AbortController().signal,
      revision: 3,
    });

    expect(page.columns).toBe(columns);
    expect(Object.keys(page.rows[0] ?? {})).toEqual(["actual", "forecast", "variance"]);

    const listeners = new Map<string, (payload: never) => void>();
    const grid = fakeGrid((event, listener) => listeners.set(event, listener));
    const bindings = bindEngineEvents(grid, emit);
    listeners.get("change")?.({
      transaction: {
        patches: [
          {
            op: "set",
            addr: { sheet: ENGINE_LIVE_SHEET, row: 7, col: 3 },
            value: { kind: "literal", value: 1025 },
          },
        ],
      },
      changes: [
        {
          addr: { sheet: ENGINE_LIVE_SHEET, row: 7, col: 3 },
          oldValue: { kind: "literal", value: 1000 },
          newValue: { kind: "literal", value: 1025 },
        },
      ],
      commitReason: "api",
      source: "local",
      epoch: 4,
    } satisfies ChangeEvent as never);
    listeners.get("scroll")?.({ firstRow: 7, lastRow: 28, scrollTop: 210 } as never);
    bindings.announceRenderer("canvas");
    const operations = bindings.pendingOperations();
    bindings.acknowledgeHost(
      { status: "applied", version: 1, clientMutationId: "engine-save-1" },
      operations,
    );

    expect(trace.snapshot().map((event) => event.type)).toEqual([
      "datasource-request",
      "datasource-result",
      "transaction-result",
      "page-resource",
      "renderer",
      "host-save",
      "page-resource",
    ]);
    expect(trace.snapshot().map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    bindings.dispose();
  });

  it("keeps the trace bounded across one hundred updates", () => {
    const trace = createEngineTrace(8);
    for (let index = 0; index < 100; index += 1) {
      trace.push({
        type: "visible-window",
        firstRow: index,
        lastRow: index + 20,
        scrollTop: index * 30,
      });
    }
    expect(trace.size).toBe(8);
    expect(trace.snapshot().map((event) => event.sequence)).toEqual([
      93, 94, 95, 96, 97, 98, 99, 100,
    ]);
  });

  it("builds formulas from the same paged row returned to the Grid", () => {
    expect(engineLiveRow(7)).toMatchObject({
      period: "FY26 W07",
      variance: { kind: "formula", src: "=C8-D8" },
      attainment: { kind: "formula", src: "=IF(D8=0,0,C8/D8)" },
    });
  });
});
