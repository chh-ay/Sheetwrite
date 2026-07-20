import { describe, expect, it } from "bun:test";
import type {
  GridAdapterEventHandlers,
  GridReadyEvent,
  GridReadyReason,
} from "../packages/core/src/adapter.js";
import type {
  ColumnarData,
  DataSource,
  DataSourcePage,
  Grid,
  GridEvents,
  GridOptions,
  Workbook,
} from "../packages/core/src/index.js";

export interface AdapterLifecycleCase {
  id:
    | "single-live-grid"
    | "loading-fallback"
    | "current-initialization-error"
    | "retry-after-corrected-input"
    | "stale-initialization-cancellation"
    | "current-callbacks"
    | "live-options"
    | "construction-reset"
    | "exact-cleanup"
    | "publication-agreement"
    | "operational-events"
    | "generation-safe-events";
  observable: string;
}

export const ADAPTER_LIFECYCLE_CONTRACT = [
  { id: "single-live-grid", observable: "one grid is live after readiness" },
  { id: "loading-fallback", observable: "fallback is rendered before readiness" },
  {
    id: "current-initialization-error",
    observable: "the current initialization-error callback runs once per failed generation",
  },
  {
    id: "retry-after-corrected-input",
    observable: "corrected initialization input reaches readiness",
  },
  {
    id: "stale-initialization-cancellation",
    observable: "replaced and unmounted initialization work cannot publish",
  },
  { id: "current-callbacks", observable: "callback replacement does not recreate the grid" },
  { id: "live-options", observable: "live options update without recreation" },
  {
    id: "construction-reset",
    observable: "construction-bound options recreate once with the shared reason",
  },
  {
    id: "exact-cleanup",
    observable: "listeners, observers, and each created grid are cleaned once",
  },
  {
    id: "publication-agreement",
    observable: "published grid and readiness generation refer to the same live grid",
  },
  {
    id: "operational-events",
    observable: "all operational Grid events retain typed declarative payloads",
  },
  {
    id: "generation-safe-events",
    observable: "replaced and unmounted grids cannot deliver stale adapter events",
  },
] as const satisfies readonly AdapterLifecycleCase[];

type GridOptionConformance =
  | { policy: "live"; reason: null }
  | { policy: "reset"; reason: Exclude<GridReadyReason, "initial"> };

export const GRID_OPTION_CONFORMANCE = {
  workbook: { policy: "reset", reason: "input-reset" },
  data: { policy: "reset", reason: "input-reset" },
  datasource: { policy: "reset", reason: "input-reset" },
  datasourceStorage: { policy: "reset", reason: "input-reset" },
  renderer: { policy: "reset", reason: "renderer-reset" },
  workerUrl: { policy: "reset", reason: "renderer-reset" },
  theme: { policy: "live", reason: null },
  readOnly: { policy: "live", reason: null },
  protectionResolver: { policy: "reset", reason: "input-reset" },
  mutationPolicy: { policy: "reset", reason: "input-reset" },
  transactionResourceLimits: { policy: "reset", reason: "input-reset" },
  renderers: { policy: "reset", reason: "renderer-reset" },
  overscan: { policy: "live", reason: null },
  minColumns: { policy: "live", reason: null },
  config: { policy: "live", reason: null },
} as const satisfies Record<keyof GridOptions, GridOptionConformance>;

export function makeConformanceWorkbook(label = "Lifecycle"): Workbook {
  return {
    activeSheet: "lifecycle",
    sheets: [
      {
        id: "lifecycle",
        name: label,
        rowCount: 3,
        columns: [{ key: "name", header: "Name", width: 140, type: "text" }],
      },
    ],
  };
}

export function makeConformanceData(label = "Row"): ColumnarData {
  return { rowCount: 3, columns: { name: [`${label} 1`, `${label} 2`, `${label} 3`] } };
}

export function makeConformanceDatasource(label: string): DataSource {
  return {
    getRows: async ({ start, end }) => ({
      start,
      rows: Array.from({ length: end - start }, (_, offset) => ({
        name: `${label} ${start + offset + 1}`,
      })),
    }),
  };
}

function makeProtectedWorkbook(label = "Protected"): Workbook {
  const workbook = makeConformanceWorkbook(label);
  workbook.sheets[0]!.protectedRanges = [
    {
      id: "locked",
      range: {
        sheet: "lifecycle",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      },
    },
  ];
  return workbook;
}

function rejectProtectedEdit(grid: Grid): void {
  const result = grid.applyTransaction({
    patches: [
      {
        op: "set",
        addr: { sheet: "lifecycle", row: 0, col: 0 },
        value: { kind: "literal", value: "rejected" },
      },
    ],
  });
  expect(result.status).toBe("rejected");
}

async function nextTask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await promise;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await nextTask();
  }
  throw new Error("Timed out waiting for adapter event");
}

export interface AdapterConformanceProps extends GridOptions, GridAdapterEventHandlers {
  fallbackLabel: string;
}

export interface MountedAdapter {
  readonly host: HTMLElement;
  readonly publishedAtReady: Array<Grid | null | undefined>;
  getPublishedGrid(): Grid | null | undefined;
  render(props: AdapterConformanceProps): Promise<void>;
  unmount(): Promise<void>;
}

export type MountAdapter = (props: AdapterConformanceProps) => Promise<MountedAdapter>;

interface LifecycleRecorder {
  ready: GridReadyEvent[];
  destroyCalls: Map<Grid, number>;
  onReady(event: GridReadyEvent): void;
}

function createLifecycleRecorder(): LifecycleRecorder {
  const ready: GridReadyEvent[] = [];
  const destroyCalls = new Map<Grid, number>();
  return {
    ready,
    destroyCalls,
    onReady(event) {
      const originalDestroy = event.grid.destroy.bind(event.grid);
      destroyCalls.set(event.grid, 0);
      event.grid.destroy = () => {
        destroyCalls.set(event.grid, (destroyCalls.get(event.grid) ?? 0) + 1);
        originalDestroy();
      };
      ready.push(event);
    },
  };
}

function initialProps(recorder: LifecycleRecorder): AdapterConformanceProps {
  return {
    workbook: makeConformanceWorkbook(),
    data: makeConformanceData(),
    fallbackLabel: "lifecycle fallback",
    onReady: (event) => recorder.onReady(event),
  };
}

interface InitializationProbeResult {
  adapter: string;
  staleReady: number;
  staleErrors: number;
  currentErrors: number;
  generation: number;
  reason: GridReadyReason;
  publishedBeforeReady: boolean;
  readyCount: number;
  sameGrid: boolean;
  selectionPreserved: boolean;
  editPreserved: boolean;
}

async function runInitializationProbe(adapter: string): Promise<InitializationProbeResult> {
  const repositoryRoot = new URL("../", import.meta.url).pathname;
  const probe = new URL("./adapter-initialization-probe.ts", import.meta.url).pathname;
  const domSetup = new URL("../test-setup.ts", import.meta.url).pathname;
  const svelteSetup = new URL("../test-setup-svelte.ts", import.meta.url).pathname;
  const process = Bun.spawn(
    ["bun", "--preload", domSetup, "--preload", svelteSetup, probe, adapter],
    {
      cwd: repositoryRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  expect(exitCode, stderr).toBe(0);
  return JSON.parse(stdout.trim()) as InitializationProbeResult;
}

export function runSharedAdapterLifecycleContract(adapter: string, mount: MountAdapter): void {
  describe(`${adapter} shared lifecycle contract`, () => {
    it("shares fallback, current-error, retry, and stale-generation semantics", async () => {
      expect(await runInitializationProbe(adapter.toLowerCase())).toEqual({
        adapter: adapter.toLowerCase(),
        staleReady: 0,
        staleErrors: 0,
        currentErrors: 2,
        generation: 1,
        reason: "initial",
        readyCount: 1,
        publishedBeforeReady: true,
        sameGrid: true,
        selectionPreserved: true,
        editPreserved: true,
      });
    });

    it("publishes exactly one live grid before generation-one readiness and clears it once", async () => {
      const recorder = createLifecycleRecorder();
      const props = initialProps(recorder);
      const mounted = await mount(props);

      expect(recorder.ready).toHaveLength(1);
      expect(recorder.ready[0]).toMatchObject({ generation: 1, reason: "initial" });
      expect(mounted.getPublishedGrid()).toBe(recorder.ready[0]!.grid);
      expect(mounted.publishedAtReady).toEqual([recorder.ready[0]!.grid]);
      expect(mounted.host.querySelectorAll('[role="grid"]')).toHaveLength(1);

      await mounted.unmount();
      expect(mounted.getPublishedGrid() ?? null).toBeNull();
      expect(recorder.destroyCalls.get(recorder.ready[0]!.grid)).toBe(1);
      expect(mounted.host.childElementCount).toBe(0);
    });

    it("uses current callbacks and applies theme, overscan, and minColumns live", async () => {
      const recorder = createLifecycleRecorder();
      const oldCalls: string[] = [];
      const newCalls: string[] = [];
      const props: AdapterConformanceProps = {
        ...initialProps(recorder),
        onViewportChange: () => oldCalls.push("old"),
      };
      const mounted = await mount(props);
      const first = mounted.getPublishedGrid()!;
      oldCalls.length = 0;

      const updated: AdapterConformanceProps = {
        ...props,
        theme: { bg: "#102030" },
        overscan: 9,
        minColumns: 12,
        onViewportChange: () => newCalls.push("new"),
      };
      await mounted.render(updated);
      oldCalls.length = 0;
      newCalls.length = 0;
      mounted.getPublishedGrid()!.refresh();

      expect(mounted.getPublishedGrid()).toBe(first);
      expect(recorder.ready).toHaveLength(1);
      expect(first.getEffectiveTheme().bg).toBe("#102030");
      expect(mounted.host.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("12");
      expect(newCalls.length).toBeGreaterThan(0);
      expect(oldCalls).toHaveLength(0);

      await mounted.unmount();
      expect(recorder.destroyCalls.get(first)).toBe(1);
    });

    it("forwards every operational event with typed payloads and current callbacks", async () => {
      const recorder = createLifecycleRecorder();
      const mutationEvents: Array<GridEvents["mutation-rejected"]> = [];
      const fallbackEvents: Array<GridEvents["renderer-fallback"]> = [];
      const datasourceEvents: Array<GridEvents["datasource-error"]> = [];
      const exportEvents: Array<GridEvents["export-error"]> = [];
      const datasourceFailure = new Error("adapter datasource failure");
      const datasource: DataSource = {
        async getRows() {
          throw datasourceFailure;
        },
      };
      const props: AdapterConformanceProps = {
        ...initialProps(recorder),
        workbook: makeProtectedWorkbook(),
        data: undefined,
        datasource,
        renderer: "worker",
        onMutationRejected: (event) => mutationEvents.push(event),
        onRendererFallback: (event) => fallbackEvents.push(event),
        onDatasourceError: (event) => datasourceEvents.push(event),
        onExportError: (event) => exportEvents.push(event),
      };
      const mounted = await mount(props);
      const grid = mounted.getPublishedGrid()!;

      rejectProtectedEdit(grid);
      grid.actions.exportXlsx();
      await waitFor(
        () =>
          fallbackEvents.length === 1 && datasourceEvents.length === 1 && exportEvents.length === 1,
      );

      expect(mutationEvents).toHaveLength(1);
      expect(mutationEvents[0]!.issues.map((issue) => issue.kind)).toEqual(["protection"]);
      expect(fallbackEvents[0]!.requested).toBe("worker");
      expect(fallbackEvents[0]!.error).toBeDefined();
      expect(datasourceEvents[0]).toMatchObject({
        request: { sheet: "lifecycle", start: 0 },
        error: datasourceFailure,
      });
      expect("signal" in datasourceEvents[0]!.request).toBe(false);
      expect(exportEvents[0]!.format).toBe("xlsx");
      expect(exportEvents[0]!.error).toBeInstanceOf(Error);

      const swapped: Array<GridEvents["mutation-rejected"]> = [];
      await mounted.render({ ...props, onMutationRejected: (event) => swapped.push(event) });
      expect(mounted.getPublishedGrid()).toBe(grid);
      rejectProtectedEdit(grid);
      expect(mutationEvents).toHaveLength(1);
      expect(swapped).toHaveLength(1);

      await mounted.unmount();
    });

    it("drops stale datasource delivery after replacement and unmount", async () => {
      const recorder = createLifecycleRecorder();
      const staleEvents: Array<GridEvents["datasource-error"]> = [];
      const currentEvents: Array<GridEvents["datasource-error"]> = [];
      const staleRequest = Promise.withResolvers<DataSourcePage>();
      const currentRequest = Promise.withResolvers<DataSourcePage>();
      let staleRequests = 0;
      let currentRequests = 0;
      const staleDatasource: DataSource = {
        getRows() {
          staleRequests += 1;
          return staleRequest.promise;
        },
      };
      const currentDatasource: DataSource = {
        getRows() {
          currentRequests += 1;
          return currentRequest.promise;
        },
      };
      const props: AdapterConformanceProps = {
        ...initialProps(recorder),
        data: undefined,
        datasource: staleDatasource,
        onDatasourceError: (event) => staleEvents.push(event),
      };
      const mounted = await mount(props);
      await waitFor(() => staleRequests > 0);
      const staleGrid = mounted.getPublishedGrid()!;

      await mounted.render({
        ...props,
        datasource: currentDatasource,
        onDatasourceError: (event) => currentEvents.push(event),
      });
      await waitFor(() => currentRequests > 0);
      expect(mounted.getPublishedGrid()).not.toBe(staleGrid);

      staleRequest.reject(new Error("stale generation"));
      await nextTask();
      expect(staleEvents).toHaveLength(0);
      expect(currentEvents).toHaveLength(0);

      const currentFailure = new Error("current generation");
      currentRequest.reject(currentFailure);
      await waitFor(() => currentEvents.length === 1);
      expect(currentEvents[0]!.error).toBe(currentFailure);

      const unmountedRequest = Promise.withResolvers<DataSourcePage>();
      let unmountedRequests = 0;
      await mounted.render({
        ...props,
        datasource: {
          getRows() {
            unmountedRequests += 1;
            return unmountedRequest.promise;
          },
        },
        onDatasourceError: (event) => currentEvents.push(event),
      });
      await waitFor(() => unmountedRequests > 0);
      await mounted.unmount();
      unmountedRequest.reject(new Error("unmounted generation"));
      await nextTask();
      expect(currentEvents).toHaveLength(1);
    });

    for (const resetCase of ["workbook", "data", "datasource", "renderer"] as const) {
      it(`recreates once with the shared reason when ${resetCase} changes`, async () => {
        const recorder = createLifecycleRecorder();
        const props = initialProps(recorder);
        if (resetCase === "datasource") {
          props.data = undefined;
          props.datasource = makeConformanceDatasource("First");
        }
        const mounted = await mount(props);
        const first = mounted.getPublishedGrid()!;
        const updated: AdapterConformanceProps = { ...props };

        if (resetCase === "workbook") updated.workbook = makeConformanceWorkbook("Replacement");
        if (resetCase === "data") updated.data = makeConformanceData("Replacement");
        if (resetCase === "datasource") {
          updated.datasource = makeConformanceDatasource("Replacement");
        }
        if (resetCase === "renderer") updated.renderer = "worker";

        await mounted.render(updated);
        const second = mounted.getPublishedGrid()!;
        const expectedReason = resetCase === "renderer" ? "renderer-reset" : "input-reset";

        expect(second).not.toBe(first);
        expect(recorder.ready).toHaveLength(2);
        expect(recorder.ready[1]).toMatchObject({
          grid: second,
          generation: 2,
          reason: expectedReason,
        });
        expect(mounted.publishedAtReady.at(-1)).toBe(second);
        expect(recorder.destroyCalls.get(first)).toBe(1);
        expect(mounted.host.querySelectorAll('[role="grid"]')).toHaveLength(1);

        await mounted.unmount();
        expect(recorder.destroyCalls.get(second)).toBe(1);
      });
    }
  });
}
