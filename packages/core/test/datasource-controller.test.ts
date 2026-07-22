import { beforeAll, describe, expect, it } from "bun:test";
import {
  DATASOURCE_MAX_ACTIVE_REQUESTS,
  DATASOURCE_PREFETCH_MAX_BYTES,
  DATASOURCE_PREFETCH_MAX_ROWS,
  DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT,
  DatasourceController,
  type DatasourceControllerOptions,
} from "../src/datasource-controller.js";
import {
  legacyFullWidthDataSource,
  type LegacyRowLoader,
  type LegacyRowPage,
} from "../src/legacy-full-width-datasource.js";
import { initSheetwrite } from "../src/grid.js";
import { MutationRevisionIndex } from "../src/mutation-revision-index.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  Column,
  DataSource,
  DataSourceColumnBand,
  DataSourcePage as ProtocolPage,
  DataSourceRequest,
  DocumentOp,
  RowData,
} from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

type DataSourcePage = LegacyRowPage;

beforeAll(async () => {
  await initSheetwrite();
});

async function flushRequest(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

type LegacyControllerOptions = Omit<DatasourceControllerOptions, "columns" | "datasource"> & {
  datasource?: LegacyRowLoader;
  columns?: DatasourceControllerOptions["columns"];
};

function newTestController(
  options: LegacyControllerOptions,
  rowCount: number,
): DatasourceController {
  const { datasource, columns, ...rest } = options;
  const schema =
    columns ??
    ((sheet: string) => {
      const workbook = rest.loadable?.getWorkbook();
      const stored = workbook?.sheets.find((candidate) => candidate.id === sheet)?.columns;
      if (Array.isArray(stored)) return stored;
      const length = (stored as { length?: number } | undefined)?.length ?? 1;
      return Array.from({ length }, (_, index) => ({ key: index === 0 ? "name" : `c${index}` }));
    });
  const adapted = datasource ? legacyFullWidthDataSource(datasource) : undefined;
  const windowed = adapted
    ? {
        capabilities: { protocol: 2 as const, columns: "windowed" as const },
        getRows(request: Parameters<typeof adapted.getRows>[0]) {
          const current = schema(request.sheet);
          const keys = current.map((column) => column.key);
          const columns = keys.length === 0 ? [] : [{ start: 0, end: keys.length, keys }];
          return adapted.getRows({ ...request, columns }).then((page) => ({
            ...page,
            columns: request.columns,
            rows: page.rows.map((row) => {
              const normalized: typeof row = Object.create(null) as typeof row;
              for (const band of request.columns) {
                for (const key of band.keys) normalized[key] = row[key]!;
              }
              return normalized;
            }),
          }));
        },
      }
    : undefined;
  return new DatasourceController(
    {
      ...rest,
      columns: schema,
      datasource: windowed,
    },
    rowCount,
  );
}

function makeProtocolColumns(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `k${index}`,
    header: `K${index}`,
    width: 100,
    type: "text" as const,
  }));
}

function protocolRows(
  columns: readonly DataSourceColumnBand[],
  start: number,
  end: number,
): RowData[] {
  const keys = columns.flatMap((band) => [...band.keys]);
  return Array.from({ length: end - start }, (_, offset) => {
    const row: RowData = Object.create(null) as RowData;
    for (const key of keys) row[key] = `${key}:${start + offset}`;
    return row;
  });
}

function newProtocolController(options: {
  store: SheetwriteStore;
  datasource: DataSource;
  columns: readonly Column[];
  rowCount: number;
  errors?: unknown[];
  onRowsLoaded?: () => void;
  revision?: () => number;
  isCellNewerThan?: DatasourceControllerOptions["isCellNewerThan"];
  retainRevision?: DatasourceControllerOptions["retainRevision"];
}): DatasourceController {
  return new DatasourceController(
    {
      datasource: options.datasource,
      loadable: options.store,
      activeSheet: () => "s1",
      rowCount: () => options.rowCount,
      columns: () => options.columns,
      revision: options.revision ?? (() => 0),
      isCellNewerThan: options.isCellNewerThan ?? (() => false),
      retainRevision: options.retainRevision ?? (() => () => {}),
      onRowsLoaded: options.onRowsLoaded ?? (() => {}),
      onError: (_request, error) => options.errors?.push(error),
    },
    options.rowCount,
  );
}

describe("DatasourceController revision retention", () => {
  it("protects acknowledged edits made after overlapping requests start and releases all records", async () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const revisions = new MutationRevisionIndex();
    const pending: Array<PromiseWithResolvers<DataSourcePage>> = [];
    let revision = 0;
    const controller = newTestController(
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

    controller.ensureLoaded(0, 1, [0]);
    controller.ensureLoaded(1, 2, [0]);
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
    const controller = newTestController(
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

    controller.ensureLoaded(2, 4, [0]);
    controller.ensureLoaded(0, 7, [0]);
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
    controller.ensureLoaded(0, 7, [0]);
    expect(pending.at(-1)!.request).toMatchObject({ start: 2, end: 4 });

    const staleBeforeReset = [pending[1]!, pending.at(-1)!];
    controller.reset(8);
    expect(staleBeforeReset.every(({ request }) => request.signal.aborted)).toBe(true);
    controller.ensureLoaded(0, 7, [0]);
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
    controller.ensureLoaded(0, 7, [0]);
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

    const controller = newTestController(
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

    controller.ensureLoaded(0, 1, [0]);
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
    const controller = newTestController(
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

    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(0);
    controller.reset(4);
    await flushRequest();
    expect(errors).toHaveLength(0);

    controller.ensureLoaded(0, 1, [0]);
    await flushRequest();
    expect(errors).toHaveLength(1);

    mode = "reject";
    controller.ensureLoaded(0, 1, [0]);
    await flushRequest();
    expect(revisions.stats().retainedRequests).toBe(0);
    expect(errors).toHaveLength(2);

    mode = "pending";
    controller.ensureLoaded(0, 1, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    const resetSignal = pending[0]!.promise;
    controller.reset(4);
    expect(revisions.stats().retainedRequests).toBe(0);
    pending[0]!.resolve({ start: 0, rows: [{ name: "late reset" }] });
    await resetSignal;
    await flushRequest();
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();

    controller.ensureLoaded(1, 2, [0]);
    expect(revisions.stats().retainedRequests).toBe(1);
    mode = "throw";
    controller.ensureLoaded(2, 3, [0]);
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
    const controller = newTestController(
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
      controller.ensureLoaded(row, row + 1, [0, 1, 2]);
      await flushRequest();
    }
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("unloaded");

    controller.ensureLoaded(0, 1, [0, 1, 2]);
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
    const controller = newTestController(
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

    controller.updateViewport(0, 10, [0]);
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
    controller.updateViewport(5, 15, [0]);
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
    const controller = newTestController(
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

    controller.updateViewport(0, 10, [0]);
    now = 16.7;
    controller.updateViewport(5, 15, [0]);
    now = 33.4;
    controller.updateViewport(0, 10, [0]);
    expect(requests.find(({ start }) => start === 20)?.signal.aborted).toBe(true);
    expect(controller.getTelemetry().direction).toBe(-1);
    expect(controller.getTelemetry().reversalAborts).toBeGreaterThan(0);

    now = 50.1;
    controller.updateViewport(20, 30, [0]);
    const beforeJump = requests.filter(({ start }) => start >= 30 && start < 50);
    expect(beforeJump.length).toBeGreaterThan(0);
    now = 66.8;
    controller.updateViewport(100, 110, [0]);
    expect(beforeJump.every(({ signal }) => signal.aborted)).toBe(true);
    expect(controller.getTelemetry().jumpAborts).toBeGreaterThan(0);

    controller.destroy();
    store.dispose();
  });

  it("preserves resident rows while refreshing a paged overlap and stays within cache budget", async () => {
    const cacheBytes = 63;
    const workbook = makeWorkbook(20);
    workbook.sheets[0]!.columns = workbook.sheets[0]!.columns.slice(0, 1);
    const store = new SheetwriteStore(workbook, undefined, {
      storage: "paged",
      chunkRows: 1,
      cacheBytes,
    });
    const requested: Array<[number, number]> = [];
    const controller = newTestController(
      {
        datasource: async (request) => {
          requested.push([request.start, request.end]);
          return {
            start: request.start,
            rows: Array.from({ length: request.end - request.start }, (_, offset) => ({
              name: `row-${request.start + offset}`,
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

    controller.ensureLoaded(0, 2, [0]);
    await flushRequest();
    controller.ensureLoaded(2, 4, [0]);
    await flushRequest();
    expect(
      store.isRangeFullyLoaded({
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 1, col: 0 },
      }),
    ).toBe(true);

    controller.ensureLoaded(0, 2, [0]);
    await flushRequest();
    expect(requested.at(-1)).toEqual([0, 1]);
    expect(store.getPagedStats("s1").allocatedBytes).toBeLessThanOrEqual(cacheBytes);

    controller.destroy();
    store.dispose();
  });
  it("bounds visible-wait samples without per-row trace growth", async () => {
    const rowCount = DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT + 17;
    const store = new SheetwriteStore(makeWorkbook(rowCount));
    let now = 0;
    const controller = newTestController(
      {
        datasource: async (request) => {
          now = 10;
          return {
            start: request.start,
            rows: Array.from({ length: request.end - request.start }, (_, row) => ({
              name: `row-${row}`,
            })),
          };
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => rowCount,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => now,
      },
      rowCount,
    );

    controller.updateViewport(0, rowCount, [0]);
    await flushRequest();
    expect(controller.getTelemetry().visibleWaitSamples).toBe(rowCount);
    expect(
      controller.getResourceOwners().find((owner) => owner.owner === "js.datasource.wait-samples"),
    ).toMatchObject({
      logicalBytes: 16,
      allocatedBytes: 16,
      entries: 1,
      measurement: "exact-capacity",
    });

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
    const controller = newTestController(
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
    const allColumns = Array.from({ length: 200 }, (_, column) => column);
    const assertBounded = () => {
      const telemetry = controller.getTelemetry();
      expect(telemetry.activeSpeculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
      expect(telemetry.activeSpeculativeRows * 200 * 16).toBeLessThanOrEqual(
        DATASOURCE_PREFETCH_MAX_BYTES,
      );
    };

    controller.updateViewport(0, 600, allColumns);
    assertBounded();
    now = 16.7;
    controller.updateViewport(600, 1_200, allColumns);
    assertBounded();
    now = 33.4;
    controller.updateViewport(1_900, 2_000, allColumns);
    assertBounded();
    now = 50.1;
    controller.updateViewport(1_200, 1_800, allColumns);
    assertBounded();

    expect(
      controller.getResourceOwners().find((owner) => owner.owner === "js.datasource.tile-state"),
    ).toMatchObject({
      measurement: "hash-capacity-v1",
      entries: expect.any(Number),
      allocatedBytes: expect.any(Number),
    });
    expect(
      controller.getResourceOwners().find((owner) => owner.owner === "js.datasource.tile-state")!
        .entries,
    ).toBeLessThan(200 * (DATASOURCE_MAX_ACTIVE_REQUESTS + 2));
    expect(
      controller
        .getResourceOwners()
        .find((owner) => owner.owner === "js.datasource.pending-requests")!.entries,
    ).toBeGreaterThan(0);

    controller.destroy();
    expect(
      controller
        .getResourceOwners()
        .every((owner) => owner.logicalBytes === 0 && owner.entries === 0),
    ).toBe(true);
    // Destroy above proves every datasource owner releases its retained state.
    store.dispose();
  });
  it("caps the full retained speculative union after partial-overlap viewport shifts", () => {
    const columnCount = 100;
    const rowBytes = columnCount * 16;
    const rowHorizon = Math.floor(DATASOURCE_PREFETCH_MAX_BYTES / rowBytes);
    const assertShiftBounded = (
      initial: readonly [number, number],
      shifted: readonly [number, number],
      expectAbort = true,
    ) => {
      const workbook = makeWorkbook(3_000);
      workbook.sheets[0]!.columns = Array.from({ length: columnCount }, (_, column) => ({
        key: `c${column}`,
        header: `C${column}`,
        width: 100,
        type: "text" as const,
      }));
      const store = new SheetwriteStore(workbook);
      const requests: Array<{ signal: AbortSignal }> = [];
      let now = 0;
      const controller = newTestController(
        {
          datasource: (request) => {
            requests.push(request);
            return Promise.withResolvers<DataSourcePage>().promise;
          },
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
      const allColumns = Array.from({ length: columnCount }, (_, column) => column);

      controller.updateViewport(initial[0], initial[1], allColumns);
      now = 16.7;
      controller.updateViewport(shifted[0], shifted[1], allColumns);
      const activeSpeculativeRows = controller.getTelemetry().activeSpeculativeRows;
      expect(activeSpeculativeRows).toBeLessThanOrEqual(rowHorizon);
      expect(activeSpeculativeRows * rowBytes).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_BYTES);
      expect(requests.some(({ signal }) => signal.aborted)).toBe(expectAbort);
      controller.destroy();
      store.dispose();
    };

    assertShiftBounded([0, 1_000], [900, 1_000]);
    assertShiftBounded([0, 1_000], [900, 1_900], false);
    assertShiftBounded([1_000, 2_000], [100, 1_100]);
  });

  it("clamps unaligned tall-view speculation to the advertised row and byte horizon", () => {
    const workbook = makeWorkbook(3_000);
    workbook.sheets[0]!.columns = [{ key: "name", header: "Name", width: 100, type: "text" }];
    const store = new SheetwriteStore(workbook);
    let now = 0;
    const controller = newTestController(
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

    controller.updateViewport(1, 1_001, [0]);
    assertBounded();
    now = 16.7;
    controller.updateViewport(1_500, 2_500, [0]);
    now = 33.4;
    controller.updateViewport(1, 1_001, [0]);
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
    const controller = newTestController(
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
      controller.updateViewport(row, row + 10, [0]);
      sampleResources();
      now += 16.7;
    }
    controller.updateViewport(700, 710, [0]);
    sampleResources();

    expect(peakActiveRequests).toBeLessThanOrEqual(5);
    expect(peakRetainedRevisions).toBeLessThanOrEqual(5);
    expect(peakActiveSpeculativeRows).toBeLessThanOrEqual(DATASOURCE_PREFETCH_MAX_ROWS);
    expect(controller.getTelemetry().jumpAborts).toBeGreaterThan(0);
    controller.destroy();
    expect(retainedRevisions).toBe(0);
    store.dispose();
  });

  it("merges loaded gaps, retries partial tails, and ignores stale reset responses", async () => {
    const store = new SheetwriteStore(makeWorkbook(40));
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    const controller = newTestController(
      {
        datasource: (request) => {
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 40,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      40,
    );

    controller.ensureLoaded(10, 20, [0]);
    pending[0]!.result.resolve({
      start: 10,
      rows: [{ name: "ten" }, { name: "eleven" }, { name: "twelve" }],
    });
    await flushRequest();
    expect(controller.getTelemetry()).toMatchObject({
      loadedBands: 1,
      ownedBands: 1,
      activeRequests: 1,
    });
    expect(pending[1]!.request).toMatchObject({ start: 13, end: 20 });

    controller.ensureLoaded(10, 25, [0]);
    expect(pending[2]!.request).toMatchObject({ start: 20, end: 25 });
    for (const entry of pending.slice(1, 3)) {
      entry.result.resolve({
        start: entry.request.start,
        rows: Array.from({ length: entry.request.end - entry.request.start }, (_, offset) => ({
          name: `row-${entry.request.start + offset}`,
        })),
      });
    }
    await flushRequest();

    controller.ensureLoaded(0, 5, [0]);
    controller.ensureLoaded(5, 10, [0]);
    expect(pending.slice(3).map(({ request }) => [request.start, request.end])).toEqual([
      [0, 5],
      [5, 10],
    ]);
    for (const entry of pending.slice(3)) {
      entry.result.resolve({
        start: entry.request.start,
        rows: Array.from({ length: entry.request.end - entry.request.start }, (_, offset) => ({
          name: `row-${entry.request.start + offset}`,
        })),
      });
    }
    await flushRequest();
    expect(controller.getTelemetry()).toMatchObject({ loadedBands: 1, ownedBands: 0 });
    controller.ensureLoaded(3, 22, [0]);
    expect(pending).toHaveLength(5);

    controller.ensureLoaded(30, 35, [0]);
    const stale = pending[5]!;
    controller.reset(40);
    expect(stale.request.signal.aborted).toBe(true);
    stale.result.resolve({
      start: 30,
      rows: Array.from({ length: 5 }, (_, offset) => ({ name: `stale-${offset}` })),
    });
    await flushRequest();
    expect(controller.getTelemetry()).toMatchObject({
      loadedBands: 0,
      ownedBands: 0,
      visibleWaitingBands: 0,
    });
    expect(store.getCell({ sheet: "s1", row: 30, col: 0 }).resolved).toBeNull();

    controller.destroy();
    store.dispose();
  });

  it("keeps billion-row construction, waits, ownership, reset, and destroy sparse", () => {
    const logicalRows = 1_000_000_000;
    const inert = newTestController(
      {
        loadable: null,
        activeSheet: () => "s1",
        rowCount: () => logicalRows,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      logicalRows,
    );
    expect(inert.getTelemetry()).toMatchObject({
      loadedBands: 0,
      ownedBands: 0,
      visibleWaitingRows: 0,
      visibleWaitingBands: 0,
    });
    inert.updateViewport(0, logicalRows, [0]);
    expect(inert.getTelemetry()).toMatchObject({
      loadedBands: 0,
      ownedBands: 0,
      visibleWaitingRows: logicalRows,
      visibleWaitingBands: 1,
    });
    inert.reset(logicalRows);
    expect(inert.getTelemetry()).toMatchObject({
      loadedBands: 0,
      ownedBands: 0,
      visibleWaitingRows: 0,
      visibleWaitingBands: 0,
    });
    inert.destroy();

    const probes: Array<[number, number]> = [];
    const requests: Array<{ start: number; end: number; signal: AbortSignal }> = [];
    const partiallyResident = {
      isPaged: () => true,
      getWorkbook: () => ({
        activeSheet: "s1",
        sheets: [{ id: "s1", columns: [{ key: "name" }] }],
      }),
      areColumnsFullyLoaded: (
        _sheet: string,
        start: number,
        end: number,
        _columns: readonly number[],
      ) => {
        probes.push([start, end]);
        return start === 42 && end === 43;
      },
      getPagedStats: () => ({
        chunks: 1,
        loadedCells: 1,
        dirtyCells: 0,
        allocatedBytes: 1,
        dirtyAllocatedBytes: 0,
        fullyLoaded: false,
      }),
    } as unknown as SheetwriteStore;
    const controller = newTestController(
      {
        datasource: (request) => {
          requests.push(request);
          return Promise.withResolvers<DataSourcePage>().promise;
        },
        loadable: partiallyResident,
        activeSheet: () => "s1",
        rowCount: () => logicalRows,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      logicalRows,
    );

    controller.ensureLoaded(0, logicalRows, [0]);
    expect(probes).toEqual([[0, logicalRows]]);
    expect(requests.map(({ start, end }) => [start, end])).toEqual([[0, logicalRows]]);
    expect(controller.getTelemetry()).toMatchObject({
      loadedBands: 0,
      ownedBands: 1,
      activeRequests: 1,
    });
    controller.reset(logicalRows);
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(controller.getTelemetry()).toMatchObject({ loadedBands: 0, ownedBands: 0 });
    controller.destroy();
  });

  it("automatically continues a valid short page tail without another viewport update", async () => {
    const store = new SheetwriteStore(makeWorkbook(12));
    const requests: Array<{ start: number; end: number }> = [];
    const tail = Promise.withResolvers<DataSourcePage>();
    const controller = newTestController(
      {
        datasource: (request) => {
          requests.push(request);
          if (requests.length === 1) {
            return Promise.resolve({
              start: request.start,
              rows: [{ name: "zero" }, { name: "one" }, { name: "two" }],
            });
          }
          return tail.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 12,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
      },
      12,
    );

    controller.ensureLoaded(0, 10, [0]);
    await flushRequest();
    expect(requests.map(({ start, end }) => [start, end])).toEqual([
      [0, 10],
      [3, 10],
    ]);
    expect(controller.getTelemetry()).toMatchObject({ activeRequests: 1, ownedBands: 1 });

    tail.resolve({
      start: 3,
      rows: Array.from({ length: 7 }, (_, offset) => ({ name: `row-${3 + offset}` })),
    });
    await flushRequest();
    expect(controller.getTelemetry()).toMatchObject({
      activeRequests: 0,
      ownedBands: 0,
      loadedBands: 1,
    });
    expect(store.getCell({ sheet: "s1", row: 9, col: 0 }).resolved).toBe("row-9");

    controller.destroy();
    store.dispose();
  });

  it("caps highly fragmented visible gaps and continues them as requests settle", async () => {
    const store = new SheetwriteStore(makeWorkbook(24));
    let retainCount = 0;
    let fragmented = false;
    const pending: Array<{
      request: { start: number; end: number };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    const controller = newTestController(
      {
        datasource: (request) => {
          if (!fragmented) {
            return Promise.resolve({
              start: request.start,
              rows: [{ name: `row-${request.start}` }],
            });
          }
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 24,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => {
          retainCount += 1;
          return () => {
            retainCount -= 1;
          };
        },
        onRowsLoaded: () => {},
        onError: () => {},
      },
      24,
    );

    for (let row = 0; row < 24; row += 2) {
      controller.ensureLoaded(row, row + 1, [0]);
      await flushRequest();
    }
    expect(controller.getTelemetry()).toMatchObject({ loadedBands: 12, activeRequests: 0 });

    fragmented = true;
    controller.ensureLoaded(0, 24, [0]);
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(controller.getTelemetry()).toMatchObject({
      activeRequests: DATASOURCE_MAX_ACTIVE_REQUESTS,
      ownedBands: DATASOURCE_MAX_ACTIVE_REQUESTS,
    });
    expect(retainCount).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    let settled = 0;
    let peakActive = 0;
    while (settled < pending.length) {
      const entry = pending[settled]!;
      entry.result.resolve({
        start: entry.request.start,
        rows: [{ name: `row-${entry.request.start}` }],
      });
      settled += 1;
      await flushRequest();
      peakActive = Math.max(peakActive, controller.getTelemetry().activeRequests);
      expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
        DATASOURCE_MAX_ACTIVE_REQUESTS,
      );
      expect(retainCount).toBe(controller.getTelemetry().activeRequests);
    }
    expect(pending).toHaveLength(12);
    expect(peakActive).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(controller.getTelemetry()).toMatchObject({
      activeRequests: 0,
      ownedBands: 0,
      loadedBands: 1,
    });
    expect(retainCount).toBe(0);

    controller.destroy();
    store.dispose();
  });

  it("serves the body viewport immediately while saturated durable gaps keep progressing", async () => {
    const store = new SheetwriteStore(makeWorkbook(40));
    let fragmented = false;
    let retained = 0;
    const pending: Array<{
      request: { start: number; end: number; signal: AbortSignal };
      result: PromiseWithResolvers<DataSourcePage>;
    }> = [];
    const controller = newTestController(
      {
        datasource: (request) => {
          if (!fragmented) {
            return Promise.resolve({
              start: request.start,
              rows: [{ name: `row-${request.start}` }],
            });
          }
          const result = Promise.withResolvers<DataSourcePage>();
          pending.push({ request, result });
          return result.promise;
        },
        loadable: store,
        activeSheet: () => "s1",
        rowCount: () => 40,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => {
          retained += 1;
          return () => {
            retained -= 1;
          };
        },
        onRowsLoaded: () => {},
        onError: () => {},
      },
      40,
    );

    for (let row = 0; row < 24; row += 2) {
      controller.ensureLoaded(row, row + 1, [0]);
      await flushRequest();
    }
    fragmented = true;
    controller.ensureLoaded(0, 24, [0]);
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.updateViewport(30, 31, [0]);
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS + 1);
    expect(
      pending
        .slice(0, DATASOURCE_MAX_ACTIVE_REQUESTS)
        .some(({ request }) => request.signal.aborted),
    ).toBe(true);
    const body = pending.at(-1)!;
    expect(body.request).toMatchObject({ start: 30, end: 31 });
    expect(body.request.signal.aborted).toBe(false);
    expect(controller.getTelemetry().activeRequests).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    body.result.resolve({ start: 30, rows: [{ name: "body" }] });
    await flushRequest();
    expect(pending).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS + 2);
    expect(pending.at(-1)!.request.start).toBeLessThan(24);
    expect(controller.getTelemetry().activeRequests).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.destroy();
    expect(retained).toBe(0);
    store.dispose();
  });

  it("cancels a stuck full-span viewport owner before serving a narrow inner viewport", () => {
    const logicalRows = 1_000_000_000;
    const requests: Array<{ start: number; end: number; signal: AbortSignal }> = [];
    const loadable = {
      isPaged: () => false,
      getWorkbook: () => ({
        activeSheet: "s1",
        sheets: [{ id: "s1", columns: [{ key: "name" }] }],
      }),
    } as unknown as SheetwriteStore;
    const controller = newTestController(
      {
        datasource: (request) => {
          requests.push(request);
          return Promise.withResolvers<DataSourcePage>().promise;
        },
        loadable,
        activeSheet: () => "s1",
        rowCount: () => logicalRows,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => 0,
      },
      logicalRows,
    );

    controller.updateViewport(0, logicalRows, [0]);
    expect(requests.map(({ start, end }) => [start, end])).toEqual([[0, logicalRows]]);
    const stale = requests[0]!;
    const narrowStart = 700_000_000;
    controller.updateViewport(narrowStart, narrowStart + 10, [0]);

    expect(stale.signal.aborted).toBe(true);
    expect(requests[1]).toMatchObject({ start: narrowStart, end: narrowStart + 10 });
    expect(requests[1]!.signal.aborted).toBe(false);
    expect(controller.getTelemetry()).toMatchObject({
      visibleWaitingRows: 10,
      visibleWaitingBands: 1,
    });
    expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS,
    );

    controller.destroy();
    expect(requests.slice(1).every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("detaches a saturated set of abort-ignoring owners before a visible jump", () => {
    const requests: Array<{ start: number; end: number; signal: AbortSignal }> = [];
    let retained = 0;
    const loadable = {
      isPaged: () => false,
      getWorkbook: () => ({
        activeSheet: "s1",
        sheets: [
          {
            id: "s1",
            columns: Array.from({ length: 1_000 }, (_, index) => ({ key: `c${index}` })),
          },
        ],
      }),
    } as unknown as SheetwriteStore;
    const wideColumns = Array.from({ length: 1_000 }, (_, index) => index);
    const controller = newTestController(
      {
        datasource: (request) => {
          requests.push(request);
          return Promise.withResolvers<DataSourcePage>().promise;
        },
        loadable,
        activeSheet: () => "s1",
        rowCount: () => 1_000,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => {
          retained += 1;
          return () => {
            retained -= 1;
          };
        },
        onRowsLoaded: () => {},
        onError: () => {},
        now: () => 0,
      },
      1_000,
    );

    for (const [start, end] of [
      [0, 100],
      [25, 125],
      [50, 150],
      [75, 175],
      [99, 199],
      [99, 225],
    ] as const) {
      controller.updateViewport(start, end, wideColumns);
    }
    expect(requests).toHaveLength(DATASOURCE_MAX_ACTIVE_REQUESTS);
    expect(controller.getTelemetry()).toMatchObject({
      activeRequests: DATASOURCE_MAX_ACTIVE_REQUESTS,
      ownedBands: DATASOURCE_MAX_ACTIVE_REQUESTS * wideColumns.length,
    });
    expect(retained).toBe(DATASOURCE_MAX_ACTIVE_REQUESTS);

    controller.updateViewport(900, 910, wideColumns);
    expect(
      requests.slice(0, DATASOURCE_MAX_ACTIVE_REQUESTS).every(({ signal }) => signal.aborted),
    ).toBe(true);
    const replacement = requests.find(
      (request, index) => index >= DATASOURCE_MAX_ACTIVE_REQUESTS && request.start === 900,
    );
    expect(replacement).toMatchObject({ start: 900, end: 910 });
    expect(replacement!.signal.aborted).toBe(false);
    expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS,
    );
    expect(controller.getTelemetry().ownedBands).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS * wideColumns.length,
    );
    expect(retained).toBe(controller.getTelemetry().activeRequests);
    controller.destroy();
    expect(retained).toBe(0);
  });
});

it("canonicalizes sparse physical bands and isolates disjoint same-row ownership", async () => {
  const columns = makeProtocolColumns(10);
  const workbook = makeWorkbook(12);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook);
  const pending: Array<{
    request: DataSourceRequest;
    result: PromiseWithResolvers<ProtocolPage>;
  }> = [];
  const datasource: DataSource = {
    capabilities: { protocol: 2, columns: "windowed" },
    getRows(request) {
      const result = Promise.withResolvers<ProtocolPage>();
      pending.push({ request, result });
      return result.promise;
    },
  };
  const controller = newProtocolController({
    store,
    datasource,
    columns,
    rowCount: 12,
  });

  controller.ensureLoaded(0, 4, []);
  expect(pending).toHaveLength(0);
  controller.ensureLoaded(0, 4, [7, 2, 3, 7, 5]);
  expect(pending[0]!.request).toMatchObject({
    protocol: 2,
    start: 0,
    end: 4,
    columns: [
      { start: 2, end: 4, keys: ["k2", "k3"] },
      { start: 5, end: 6, keys: ["k5"] },
      { start: 7, end: 8, keys: ["k7"] },
    ],
  });

  controller.ensureLoaded(0, 4, [3, 4, 8]);
  expect(pending).toHaveLength(2);
  expect(pending[1]!.request.columns).toEqual([
    { start: 4, end: 5, keys: ["k4"] },
    { start: 8, end: 9, keys: ["k8"] },
  ]);
  const ownedTiles = new Set<string>();
  for (const { request } of pending) {
    for (const band of request.columns) {
      for (let column = band.start; column < band.end; column += 1) {
        for (let row = request.start; row < request.end; row += 1) {
          const tile = `${row}:${column}`;
          expect(ownedTiles.has(tile)).toBe(false);
          ownedTiles.add(tile);
        }
      }
    }
  }

  for (const entry of pending) {
    entry.result.resolve({
      protocol: 2,
      start: entry.request.start,
      columns: entry.request.columns,
      rows: protocolRows(entry.request.columns, entry.request.start, entry.request.end),
    });
  }
  await flushRequest();
  expect(controller.getTelemetry()).toMatchObject({ activeRequests: 0, ownedBands: 0 });
  expect(store.getCell({ sheet: "s1", row: 2, col: 8 }).resolved).toBe("k8:2");

  controller.destroy();
  store.dispose();
});

it("hydrates only declared partial row and column coverage and continues every gap", async () => {
  const columns = makeProtocolColumns(6);
  const workbook = makeWorkbook(8);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
  const pending: Array<{
    request: DataSourceRequest;
    result: PromiseWithResolvers<ProtocolPage>;
  }> = [];
  const datasource: DataSource = {
    capabilities: { protocol: 2, columns: "windowed" },
    getRows(request) {
      const result = Promise.withResolvers<ProtocolPage>();
      pending.push({ request, result });
      return result.promise;
    },
  };
  const controller = newProtocolController({
    store,
    datasource,
    columns,
    rowCount: 8,
  });

  controller.ensureLoaded(0, 6, [0, 1, 4, 5]);
  pending[0]!.result.resolve({
    protocol: 2,
    start: 1,
    columns: [{ start: 1, end: 2, keys: ["k1"] }],
    rows: [{ k1: "partial-1" }, { k1: "partial-2" }],
  });
  await flushRequest();
  expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).resolved).toBe("partial-1");
  expect(store.areColumnsFullyLoaded("s1", 1, 2, [0])).toBe(false);
  expect(pending.length).toBeGreaterThan(1);

  for (const entry of pending.slice(1)) {
    entry.result.resolve({
      protocol: 2,
      start: entry.request.start,
      columns: entry.request.columns,
      rows: protocolRows(entry.request.columns, entry.request.start, entry.request.end),
    });
  }
  await flushRequest();
  expect(store.areColumnsFullyLoaded("s1", 0, 6, [0, 1, 4, 5])).toBe(true);
  expect(store.getCell({ sheet: "s1", row: 5, col: 5 }).resolved).toBe("k5:5");
  expect(controller.getTelemetry()).toMatchObject({ activeRequests: 0, ownedBands: 0 });

  controller.destroy();
  store.dispose();
});

it("rejects malformed protocol, coverage, bands, and row shapes before hydration", async () => {
  const cases: Array<{
    name: string;
    page: (request: DataSourceRequest) => ProtocolPage;
  }> = [
    {
      name: "protocol",
      page: (request) =>
        ({
          protocol: 1,
          start: request.start,
          columns: request.columns,
          rows: protocolRows(request.columns, request.start, request.start + 1),
        }) as unknown as ProtocolPage,
    },
    {
      name: "reordered bands",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [request.columns[1]!, request.columns[0]!],
        rows: [{ k0: "zero", k2: "two" }],
      }),
    },
    {
      name: "mismatched keys",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [{ ...request.columns[0]!, keys: ["k1"] }, request.columns[1]!],
        rows: [{ k1: "wrong", k2: "two" }],
      }),
    },
    {
      name: "missing row key",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: request.columns,
        rows: [{ k0: "zero" }],
      }),
    },
    {
      name: "extra row key",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: request.columns,
        rows: [{ k0: "zero", k2: "two", extra: "no" }],
      }),
    },
    {
      name: "row bounds",
      page: (request) => ({
        protocol: 2,
        start: request.end,
        columns: request.columns,
        rows: protocolRows(request.columns, request.end, request.end + 1),
      }),
    },
    {
      name: "overlapping bands",
      page: (request) => ({
        protocol: 2,
        start: request.start,
        columns: [request.columns[0]!, request.columns[0]!],
        rows: [{ k0: "zero" }],
      }),
    },
  ];

  for (const testCase of cases) {
    const columns = makeProtocolColumns(3);
    const workbook = makeWorkbook(4);
    workbook.sheets[0]!.columns = columns;
    const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
    const errors: unknown[] = [];
    let loaded = 0;
    const controller = newProtocolController({
      store,
      columns,
      rowCount: 4,
      errors,
      onRowsLoaded: () => {
        loaded += 1;
      },
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows: (request) => Promise.resolve(testCase.page(request)),
      },
    });

    controller.ensureLoaded(0, 1, [0, 2]);
    await flushRequest();
    expect(errors, testCase.name).toHaveLength(1);
    expect(loaded, testCase.name).toBe(0);
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 }), testCase.name).toBe("unloaded");
    expect(controller.getTelemetry(), testCase.name).toMatchObject({
      activeRequests: 0,
      ownedBands: 0,
    });
    controller.destroy();
    store.dispose();
  }
});

it("bounds empty-page retries and releases no-progress ownership", async () => {
  const columns = makeProtocolColumns(2);
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, { storage: "paged" });
  const errors: unknown[] = [];
  let calls = 0;
  const controller = newProtocolController({
    store,
    columns,
    rowCount: 4,
    errors,
    datasource: {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows(request) {
        calls += 1;
        return Promise.resolve({
          protocol: 2,
          start: request.start,
          columns: [],
          rows: [Object.create(null) as RowData],
        });
      },
    },
  });

  controller.ensureLoaded(0, 2, [0, 1]);
  await flushRequest();
  expect(calls).toBe(2);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(RangeError);
  expect(controller.getTelemetry()).toMatchObject({ activeRequests: 0, ownedBands: 0 });
  expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("unloaded");

  controller.destroy();
  store.dispose();
});

it("preempts obsolete same-row horizontal owners before loading a far viewport", async () => {
  const columns = makeProtocolColumns(9);
  const workbook = makeWorkbook(30);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook);
  const pending: Array<{
    request: DataSourceRequest;
    result: PromiseWithResolvers<ProtocolPage>;
  }> = [];
  const controller = newProtocolController({
    store,
    columns,
    rowCount: 30,
    datasource: {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows(request) {
        const result = Promise.withResolvers<ProtocolPage>();
        pending.push({ request, result });
        return result.promise;
      },
    },
  });

  controller.updateViewport(0, 5, [0, 1, 2, 3, 4, 5]);
  const initial = pending.slice();
  controller.updateViewport(0, 5, [0, 6, 7, 8]);
  expect(initial.every(({ request }) => request.signal.aborted)).toBe(true);
  const replacement = pending
    .slice(initial.length)
    .find(({ request }) => request.start === 0 && request.end === 5);
  expect(replacement?.request.columns).toEqual([
    { start: 0, end: 1, keys: ["k0"] },
    { start: 6, end: 9, keys: ["k6", "k7", "k8"] },
  ]);

  initial[0]!.result.resolve({
    protocol: 2,
    start: initial[0]!.request.start,
    columns: initial[0]!.request.columns,
    rows: protocolRows(
      initial[0]!.request.columns,
      initial[0]!.request.start,
      initial[0]!.request.end,
    ),
  });
  replacement!.result.resolve({
    protocol: 2,
    start: replacement!.request.start,
    columns: replacement!.request.columns,
    rows: protocolRows(
      replacement!.request.columns,
      replacement!.request.start,
      replacement!.request.end,
    ),
  });
  await flushRequest();
  expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).not.toBe("k1:0");
  expect(store.getCell({ sheet: "s1", row: 0, col: 7 }).resolved).toBe("k7:0");

  controller.destroy();
  store.dispose();
});

it("adapts legacy rows through full-width protocol 2 with explicit blank keys", async () => {
  const columns = makeProtocolColumns(3);
  const workbook = makeWorkbook(3);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook);
  let captured: DataSourceRequest | undefined;
  let returned: ProtocolPage | undefined;
  const adapted = legacyFullWidthDataSource((request) => {
    captured = request;
    return { start: request.start, rows: [{ k0: "legacy" }] };
  });
  const datasource: DataSource = {
    ...adapted,
    getRows(request) {
      return adapted.getRows(request).then((page) => {
        returned = page;
        return page;
      });
    },
  };
  const controller = newProtocolController({
    store,
    datasource,
    columns,
    rowCount: 3,
  });

  controller.ensureLoaded(0, 1, [1]);
  await flushRequest();
  expect(captured?.columns).toEqual([{ start: 0, end: 3, keys: ["k0", "k1", "k2"] }]);
  expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("legacy");
  expect(Reflect.ownKeys(returned!.rows[0]!)).toEqual(["k0", "k1", "k2"]);
  expect(returned!.rows[0]).toMatchObject({ k0: "legacy", k1: null, k2: null });
  expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe("");
  expect(store.getCell({ sheet: "s1", row: 0, col: 2 }).resolved).toBe("");

  const invalid = legacyFullWidthDataSource((request) => ({
    start: request.start,
    rows: [{ unexpected: "value" }],
  }));
  await expect(
    invalid.getRows({
      protocol: 2,
      sheet: "s1",
      start: 0,
      end: 1,
      columns: [{ start: 0, end: 1, keys: ["k0"] }],
      signal: new AbortController().signal,
      revision: 0,
    }),
  ).rejects.toThrow("undeclared key");

  controller.destroy();
  store.dispose();
});

it("bounds metadata across deterministic million-row by thousand-column scroll/reset traces", () => {
  const rowCount = 1_000_000;
  const columns = makeProtocolColumns(1_000);
  const workbook = makeWorkbook(rowCount);
  workbook.sheets[0]!.columns = columns;
  const store = new SheetwriteStore(workbook, undefined, {
    storage: "paged",
    chunkRows: 64,
    cacheBytes: 64 * 1024,
  });
  const controller = newProtocolController({
    store,
    columns,
    rowCount,
    datasource: {
      capabilities: { protocol: 2, columns: "windowed" },
      getRows: () => new Promise<ProtocolPage>(() => {}),
    },
  });
  let random = 0x7f4a_7c15;
  const next = () => {
    random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
    return random;
  };

  for (let step = 0; step < 240; step += 1) {
    const start = next() % (rowCount - 40);
    const requested = new Set<number>();
    while (requested.size < 12) requested.add(next() % columns.length);
    controller.updateViewport(start, start + 40, [...requested]);
    expect(controller.getTelemetry().activeRequests).toBeLessThanOrEqual(
      DATASOURCE_MAX_ACTIVE_REQUESTS,
    );
    const owners = controller.getResourceOwners();
    const nonSchemaBytes = owners
      .filter((owner) => owner.owner !== "js.datasource.schema-index")
      .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
    expect(nonSchemaBytes).toBeLessThanOrEqual(128 * 1024);
    expect(
      owners.find((owner) => owner.owner === "js.datasource.tile-state")!.entries,
    ).toBeLessThanOrEqual(128);
    if (step > 0 && step % 19 === 0) {
      controller.reset(rowCount);
      expect(controller.getTelemetry()).toMatchObject({ loadedBands: 0, ownedBands: 0 });
    }
  }

  const totalBytes = controller
    .getResourceOwners()
    .reduce((bytes, owner) => bytes + owner.allocatedBytes, 0);
  expect(totalBytes).toBeLessThanOrEqual(1024 * 1024);
  controller.destroy();
  expect(
    controller
      .getResourceOwners()
      .every((owner) => owner.entries === 0 && owner.allocatedBytes === 0),
  ).toBe(true);
  store.dispose();
});
