import { beforeAll, describe, expect, it } from "bun:test";
import {
  DATASOURCE_PREFETCH_MAX_BYTES,
  DATASOURCE_PREFETCH_MAX_ROWS,
  DatasourceController,
} from "../src/datasource-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { MutationRevisionIndex } from "../src/mutation-revision-index.js";
import { SheetwriteStore } from "../src/store.js";
import type { DataSourcePage, DocumentOp } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

async function flushRequest(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("DatasourceController revision retention", () => {
  it("protects acknowledged edits made after overlapping requests start and releases all records", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    const pending: Array<PromiseWithResolvers<DataSourcePage>> = [];
    let revision = 0;
    const controller = new DatasourceController(
      {
        datasource: () => {
          const request = Promise.withResolvers<DataSourcePage>();
          pending.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => revision,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: () => {},
      },
      4,
    );

    controller.ensureLoaded(0, 1);
    controller.ensureLoaded(1, 2);
    expect(revisions.stats()).toMatchObject({ retainedRequests: 2, retainedRevisions: 1 });

    const local: DocumentOp = {
      op: "set",
      addr: { sheet: "s1", row: 1, col: 0 },
      value: { kind: "literal", value: "local" },
    };
    revision = 1;
    store.applyTransaction({ patches: [local] });
    revisions.record([local], revision);
    store.acknowledgeOperations([local]);

    pending[1]!.resolve({ start: 1, rows: [{ name: "stale server" }] });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("local");
    expect(revisions.stats()).toMatchObject({ points: 1, retainedRequests: 1 });

    pending[0]!.resolve({ start: 0, rows: [{ name: "fresh server" }] });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("fresh server");
    expect(revisions.stats()).toEqual({
      points: 0,
      rectangles: 0,
      retainedRequests: 0,
      retainedRevisions: 0,
    });

    controller.destroy();
    store.dispose();
  });

  it("schedules every maximal missing band and keeps ownership isolated across retry and reset", async () => {
    const store = new SheetwriteStore(makeWorkbook(8));
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    const errors: unknown[] = [];
    const controller = new DatasourceController(
      {
        datasource: (request) => {
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 8,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: (_request, error) => errors.push(error),
      },
      8,
    );

    controller.ensureLoaded(2, 4);
    controller.ensureLoaded(0, 7);
    expect(pending.map(({ request }) => [request.start, request.end])).toEqual([
      [2, 4],
      [0, 2],
      [4, 7],
    ]);
    for (let left = 0; left < pending.length; left++) {
      for (let right = left + 1; right < pending.length; right++) {
        const a = pending[left]!.request;
        const b = pending[right]!.request;
        expect(Math.max(a.start, b.start)).toBeGreaterThanOrEqual(Math.min(a.end, b.end));
      }
    }

    pending[2]!.result.resolve({
      start: 4,
      rows: [{ name: "four" }, { name: "five" }, { name: "six" }],
    });
    pending[0]!.result.reject(new Error("retry"));
    await flushRequest();
    controller.ensureLoaded(0, 7);
    expect(pending.at(-1)!.request).toMatchObject({ start: 2, end: 4 });

    const staleBeforeReset = [pending[1]!, pending.at(-1)!];
    controller.reset(8);
    expect(staleBeforeReset.every(({ request }) => request.signal.aborted)).toBe(true);
    controller.ensureLoaded(0, 7);
    const replacement = pending.at(-1)!;
    expect(replacement.request).toMatchObject({ start: 0, end: 7 });

    staleBeforeReset[0]!.result.resolve({
      start: 0,
      rows: [{ name: "stale zero" }, { name: "stale one" }],
    });
    staleBeforeReset.at(-1)!.result.resolve({
      start: 2,
      rows: [{ name: "stale two" }, { name: "stale three" }],
    });
    await flushRequest();
    controller.ensureLoaded(0, 7);
    expect(pending.at(-1)).toBe(replacement);

    replacement.result.resolve({
      start: 0,
      rows: Array.from({ length: 7 }, (_, row) => ({ name: `fresh ${row}` })),
    });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("fresh 2");
    expect(errors).toHaveLength(1);

    controller.destroy();
    store.dispose();
  });

  it("treats edits before a request as part of its revision and still protects later dense clears", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    const requests: Array<PromiseWithResolvers<DataSourcePage>> = [];
    let revision = 1;
    const before: DocumentOp = {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 0 },
      value: { kind: "literal", value: "before request" },
    };
    store.applyTransaction({ patches: [before] });
    revisions.record([before], revision);

    const controller = new DatasourceController(
      {
        datasource: () => {
          const request = Promise.withResolvers<DataSourcePage>();
          requests.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => revision,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: () => {},
      },
      4,
    );

    controller.ensureLoaded(0, 1);
    const clear: DocumentOp = {
      op: "clearRange",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
      contents: true,
      style: false,
    };
    revision = 2;
    store.applyTransaction({ patches: [clear] });
    revisions.record([clear], revision);
    expect(revisions.stats()).toMatchObject({ points: 0, rectangles: 1 });

    requests[0]!.resolve({ start: 0, rows: [{ name: "stale", amount: 4, city: "old" }] });
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBeNull();
    expect(revisions.stats().rectangles).toBe(0);

    controller.destroy();
    store.dispose();
  });

  it("releases retained revisions on rejection, synchronous failure, reset, destroy, and abort", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    let mode: "reject" | "throw" | "pending" = "throw";
    const pending: Array<PromiseWithResolvers<DataSourcePage>> = [];
    const errors: unknown[] = [];
    const controller = new DatasourceController(
      {
        datasource: () => {
          if (mode === "throw") throw new Error("sync");
          if (mode === "reject") return Promise.reject(new Error("async"));
          const request = Promise.withResolvers<DataSourcePage>();
          pending.push(request);
          return request.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 4,
        revision: () => 0,
        isCellNewerThan: (address, requestRevision) =>
          revisions.isNewerThan(address, requestRevision),
        retainRevision: (requestRevision) => revisions.retainRevision(requestRevision),
        onRowsLoaded: () => {},
        onError: (_request, error) => errors.push(error),
      },
      4,
    );

    controller.ensureLoaded(0, 1);
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(0);
    controller.reset(4);
    await flushRequest();
    expect(errors).toHaveLength(0);

    controller.ensureLoaded(0, 1);
    await flushRequest();
    expect(errors).toHaveLength(1);

    mode = "reject";
    controller.ensureLoaded(0, 1);
    await flushRequest();
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(2);

    mode = "pending";
    controller.ensureLoaded(0, 1);
    expect(revisions.stats().retainedRequests).toBe(1);
    const resetSignal = pending[0]!.promise;
    controller.reset(4);
    expect(revisions.stats().retainedRequests).toBe(0);
    pending[0]!.resolve({ start: 0, rows: [{ name: "late reset" }] });
    await resetSignal;
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();

    controller.ensureLoaded(1, 2);
    expect(revisions.stats().retainedRequests).toBe(1);
    mode = "throw";
    controller.ensureLoaded(2, 3);
    controller.destroy();
    expect(revisions.stats().retainedRequests).toBe(0);
    await flushRequest();
    expect(errors).toHaveLength(2);
    store.dispose();
  });

  it("reloads rows after the paged cache evicts their clean chunks", async () => {
    const store = new SheetwriteStore(makeWorkbook(100), undefined, {
      storage: "paged",
      chunkRows: 4,
      cacheBytes: 300,
    });
    const starts: number[] = [];
    const controller = new DatasourceController(
      {
        datasource: async (request) => {
          starts.push(request.start);
          return {
            start: request.start,
            rows: Array.from({ length: request.end - request.start }, (_, offset) => ({
              name: `row-${request.start + offset}`,
              amount: request.start + offset,
              city: "A",
            })),
          };
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 100,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      100,
    );

    for (const row of [0, 4, 8, 12]) {
      controller.ensureLoaded(row, row + 1);
      await flushRequest();
    }
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("unloaded");

    controller.ensureLoaded(0, 1);
    await flushRequest();
    expect(starts).toEqual([0, 4, 8, 12, 0]);
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("row-0");

    controller.destroy();
    store.dispose();
  });

  it("starts visible demand before bounded aligned speculation and promotes overlap", async () => {
    const store = new SheetwriteStore(makeWorkbook(100));
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    let now = 0;
    const controller = new DatasourceController(
      {
        datasource: (request) => {
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 100,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      100,
    );

    controller.updateViewport(0, 10);
    expect(pending.map(({ request }) => [request.start, request.end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
    ]);
    expect(controller.getTelemetry()).toMatchObject({
      visibleRequests: 1,
      speculativeRequests: 2,
      visibleRequestedRows: 10,
      speculativeRequestedRows: 20,
    });

    now = 16.7;
    controller.updateViewport(5, 15);
    expect(pending).toHaveLength(4);
    expect(controller.getTelemetry().promotions).toBe(1);
    for (let left = 0; left < pending.length; left++) {
      for (let right = left + 1; right < pending.length; right++) {
        const a = pending[left]!.request;
        const b = pending[right]!.request;
        expect(Math.max(a.start, b.start)).toBeGreaterThanOrEqual(Math.min(a.end, b.end));
      }
    }

    for (const entry of pending) {
      entry.result.resolve({
        start: entry.request.start,
        rows: Array.from({ length: entry.request.end - entry.request.start }, (_, offset) => ({
          name: `row-${entry.request.start + offset}`,
        })),
      });
    }
    await flushRequest();
    expect(controller.getTelemetry()).toMatchObject({
      measuredFrames: 2,
      residentFrames: 0,
      visibleWaitSamples: 15,
      p95VisibleWaitMs: 16.7,
    });

    controller.destroy();
    store.dispose();
  });

  it("aborts obsolete speculative requests on reversal and distant jumps", () => {
    const store = new SheetwriteStore(makeWorkbook(200));
    const requests: Array<{ start: number; end: number; signal: AbortSignal }> = [];
    let now = 0;
    const controller = new DatasourceController(
      {
        datasource: (request) => {
          requests.push(request);
          return new Promise<DataSourcePage>(() => {});
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 200,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      200,
    );

    controller.updateViewport(0, 10);
    now = 16.7;
    controller.updateViewport(5, 15);
    now = 33.4;
    controller.updateViewport(0, 10);
    expect(requests.find(({ start }) => start === 20)?.signal.aborted).toBe(true);
    expect(controller.getTelemetry().direction).toBe(-1);
    expect(controller.getTelemetry().reversalAborts).toBeGreaterThan(0);

    now = 50.1;
    controller.updateViewport(20, 30);
    const beforeJump = requests.filter(({ start }) => start >= 30 && start < 50);
    expect(beforeJump.length).toBeGreaterThan(0);
    now = 66.8;
    controller.updateViewport(100, 110);
    expect(beforeJump.every(({ signal }) => signal.aborted)).toBe(true);
    expect(controller.getTelemetry().jumpAborts).toBeGreaterThan(0);

    controller.destroy();
    store.dispose();
  });

  it("preserves resident rows while refreshing a paged overlap and stays within cache budget", async () => {
    const cacheBytes = 87;
    const workbook = makeWorkbook(20);
    workbook.sheets[0]!.columns = workbook.sheets[0]!.columns.slice(0, 1);
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 1,
      cacheBytes,
    });
    const requested: Array<[number, number]> = [];
    const controller = new DatasourceController(
      {
        datasource: async (request) => {
          requested.push([request.start, request.end]);
          return {
            start: request.start,
            rows: Array.from({ length: request.end - request.start }, (_, offset) => ({
              name: `row-${request.start + offset}`,
              amount: request.start + offset,
              city: "A",
            })),
          };
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 20,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      20,
    );

    controller.ensureLoaded(0, 2);
    await flushRequest();
    controller.ensureLoaded(2, 4);
    await flushRequest();
    expect(
      store.isRangeFullyLoaded({
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 1, col: 0 },
      }),
    ).toBe(true);

    controller.ensureLoaded(0, 2);
    await flushRequest();
    expect(requested.at(-1)).toEqual([0, 1]);
    expect(store.getPagedStats("s1").allocatedBytes).toBeLessThanOrEqual(cacheBytes);

    controller.destroy();
    store.dispose();
  });

  it("bounds combined ahead and behind ownership for wide large viewports and sheet edges", () => {
    const workbook = makeWorkbook(2_000);
    workbook.sheets[0]!.columns = Array.from({ length: 200 }, (_, column) => ({
      key: `c${column}`,
      header: `C${column}`,
      width: 100,
      type: "text" as const,
    }));
    const store = new SheetwriteStore(workbook);
    let now = 0;
    const controller = new DatasourceController(
      {
        datasource: () => Promise.withResolvers<DataSourcePage>().promise,
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 2_000,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      2_000,
    );
    const assertBounded = () => {
      const telemetry = controller.getTelemetry();
      expect(telemetry.activeSpeculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
      expect(telemetry.activeSpeculativeRows * 200 * 16).toBeLessThanOrEqual(
        DATASOURCE_PREFETCH_MAX_BYTES,
      );
    };

    controller.updateViewport(0, 600);
    assertBounded();
    now = 16.7;
    controller.updateViewport(600, 1_200);
    assertBounded();
    now = 33.4;
    controller.updateViewport(1_900, 2_000);
    assertBounded();
    now = 50.1;
    controller.updateViewport(1_200, 1_800);
    assertBounded();

    controller.destroy();
    store.dispose();
  });
  it("clamps unaligned tall-view speculation to the advertised row and byte horizon", () => {
    const workbook = makeWorkbook(3_000);
    workbook.sheets[0]!.columns = [{ key: "name", header: "Name", width: 100, type: "text" }];
    const store = new SheetwriteStore(workbook);
    let now = 0;
    const controller = new DatasourceController(
      {
        datasource: () => Promise.withResolvers<DataSourcePage>().promise,
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 3_000,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      3_000,
    );
    const assertBounded = () => {
      const speculativeRows = controller.getTelemetry().activeSpeculativeRows;
      expect(speculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
      expect(speculativeRows * 16).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_BYTES);
    };

    controller.updateViewport(1, 1_001);
    assertBounded();
    now = 16.7;
    controller.updateViewport(1_500, 2_500);
    now = 33.4;
    controller.updateViewport(1, 1_001);
    assertBounded();

    controller.destroy();
    store.dispose();
  });

  it("bounds requests and retained revisions across one-row pending scrolls and a jump", () => {
    const store = new SheetwriteStore(makeWorkbook(1_000));
    let now = 0;
    let retainedRevisions = 0;
    let peakRetainedRevisions = 0;
    let peakActiveRequests = 0;
    let peakActiveSpeculativeRows = 0;
    const controller = new DatasourceController(
      {
        datasource: () => Promise.withResolvers<DataSourcePage>().promise,
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 1_000,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => {
          retainedRevisions += 1;
          peakRetainedRevisions = Math.max(peakRetainedRevisions, retainedRevisions);
          return () => {
            retainedRevisions -= 1;
          };
        },
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      1_000,
    );
    const sampleResources = () => {
      const telemetry = controller.getTelemetry();
      peakActiveRequests = Math.max(peakActiveRequests, telemetry.activeRequests);
      peakActiveSpeculativeRows = Math.max(
        peakActiveSpeculativeRows,
        telemetry.activeSpeculativeRows,
      );
      expect(retainedRevisions).toBe(telemetry.activeRequests);
    };

    for (let row = 0; row < 200; row++) {
      controller.updateViewport(row, row + 10);
      sampleResources();
      now += 16.7;
    }
    controller.updateViewport(700, 710);
    sampleResources();

    expect(peakActiveRequests).toBeLessThanOrEqual(5);
    expect(peakRetainedRevisions).toBeLessThanOrEqual(5);
    expect(peakActiveSpeculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
    expect(controller.getTelemetry().jumpAborts).toBeGreaterThan(0);
    controller.destroy();
    expect(retainedRevisions).toBe(0);
    store.dispose();
  });
});
