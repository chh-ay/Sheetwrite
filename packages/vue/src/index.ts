import {
  type CellRenderer,
  type CellScalar,
  type ChangeEvent,
  type ColumnarData,
  type DataSource,
  type DataSourceStorageOptions,
  type Grid,
  type GridEvents,
  type GridOptions,
  initSheetwrite,
  isSheetwriteReady,
  type Selection,
  type Theme,
  type Workbook,
} from "@sheetwrite/core";
import {
  createGridController,
  createSimpleGridInput,
  type GridController,
  type GridControllerHandlers,
  type GridReadyEvent,
  type GridReadyReason,
  getGridResetReason,
  gridSizeStyle,
  type SheetwriteInitializationProps,
  type SimpleGridInput,
} from "@sheetwrite/core/adapter";
import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  shallowRef,
  watch,
} from "vue";

/** Imperative Grid handle exposed by the Vue advanced component. */
export interface SheetwriteGridExpose {
  /** Live Grid after readiness, or `null` before initialization and during teardown. */
  grid: Grid | null;
}

const gridProps = {
  /** Live workbook schema adopted by the Grid. */
  workbook: { type: Object as PropType<Workbook>, required: true as const },
  /** Eager column-major values for the active sheet. */
  data: { type: Object as PropType<ColumnarData>, default: undefined },
  /** Lazy row provider requested for visible windows. */
  datasource: { type: Object as PropType<DataSource>, default: undefined },
  /** Allocation and cache policy for datasource storage. */
  datasourceStorage: {
    type: Object as PropType<DataSourceStorageOptions>,
    default: undefined,
  },
  /** Paint backend; defaults to main-thread canvas. */
  renderer: { type: String as PropType<GridOptions["renderer"]>, default: undefined },
  /** Browser-fetchable worker module URL. */
  workerUrl: {
    type: [String, URL] as unknown as PropType<GridOptions["workerUrl"]>,
    default: undefined,
  },
  /** Live overrides merged into the resolved Grid theme. */
  theme: { type: Object as PropType<Partial<Theme>>, default: undefined },
  /** Disables mutation while preserving navigation and selection. */
  readOnly: { type: Boolean, default: undefined },
  /** Host-owned client permission check for protected ranges. */
  protectionResolver: {
    type: Function as PropType<GridOptions["protectionResolver"]>,
    default: undefined,
  },
  /** Atomic or partial handling for denied local operations. */
  mutationPolicy: {
    type: String as PropType<GridOptions["mutationPolicy"]>,
    default: undefined,
  },
  /** Named custom renderers registered when the Grid is created. */
  renderers: { type: Object as PropType<Record<string, CellRenderer>>, default: undefined },
  /** Extra rows painted above and below the viewport. */
  overscan: { type: Number, default: undefined },
  /** Minimum rendered column count, including empty padding columns. */
  minColumns: { type: Number, default: undefined },
  /** Built-in toolbar, menu, keyboard, find, and tab controls. */
  config: { type: Object as PropType<GridOptions["config"]>, default: undefined },
  /** Explicit source passed to process-wide WASM initialization. */
  wasmSource: {
    type: [Object, String] as PropType<SheetwriteInitializationProps["wasmSource"]>,
    default: undefined,
  },
  /** Host height in CSS pixels for numbers or any CSS length string. */
  height: { type: [Number, String], default: undefined },
  /** Fills the parent's available width and height. */
  fill: { type: Boolean, default: undefined },
};

const gridEmits = {
  "grid-change": (_event: ChangeEvent) => true,
  "selection-change": (_selection: Selection | null) => true,
  "viewport-change": (_event: GridEvents["scroll"]) => true,
  "edit-begin": (_event: GridEvents["edit-begin"]) => true,
  "edit-commit": (_event: GridEvents["edit-commit"]) => true,
  search: (_result: GridEvents["search"]) => true,
  "active-sheet-change": (_event: GridEvents["active-sheet"]) => true,
  ready: (_event: GridReadyEvent) => true,
  "initialization-error": (_error: unknown) => true,
};

const SheetwriteGridComponent = defineComponent({
  name: "SheetwriteGrid",
  inheritAttrs: false,
  props: gridProps,
  emits: gridEmits,
  setup(props, { attrs, emit, expose, slots }) {
    const host = ref<HTMLDivElement | null>(null);
    const exposedGrid = shallowRef<Grid | null>(null);
    let controller: GridController | null = null;
    let generation = 0;
    let previousOptions: GridOptions | null = null;
    let mounted = false;
    let initializationToken = 0;

    const handlers: GridControllerHandlers = {
      onGridChange: (event) => emit("grid-change", event),
      onSelectionChange: (selection) => emit("selection-change", selection),
      onViewportChange: (event) => emit("viewport-change", event),
      onEditBegin: (event) => emit("edit-begin", event),
      onEditCommit: (event) => emit("edit-commit", event),
      onSearch: (result) => emit("search", result),
      onActiveSheetChange: (event) => emit("active-sheet-change", event),
    };

    function currentOptions(): GridOptions {
      return {
        workbook: props.workbook!,
        data: props.data,
        datasource: props.datasource,
        datasourceStorage: props.datasourceStorage,
        renderer: props.renderer,
        workerUrl: props.workerUrl,
        theme: props.theme,
        readOnly: props.readOnly,
        protectionResolver: props.protectionResolver,
        mutationPolicy: props.mutationPolicy,
        renderers: props.renderers,
        overscan: props.overscan,
        minColumns: props.minColumns,
        config: props.config,
      };
    }

    function teardownGrid(): void {
      exposedGrid.value = null;
      controller?.destroy();
      controller = null;
    }

    async function createCurrentGrid(): Promise<void> {
      if (!mounted || !host.value) return;
      const options = currentOptions();
      const reason: GridReadyReason =
        generation === 0
          ? "initial"
          : ((previousOptions && getGridResetReason(previousOptions, options)) ?? "input-reset");
      teardownGrid();
      const created = createGridController(host.value, options, handlers);
      controller = created;
      generation += 1;
      previousOptions = options;
      exposedGrid.value = created.grid;
      await nextTick();
      if (controller !== created) return;
      emit("ready", { grid: created.grid, generation, reason });
    }

    async function initialize(): Promise<void> {
      const token = ++initializationToken;
      const alreadyReady = isSheetwriteReady();
      try {
        const initialization = initSheetwrite(props.wasmSource);
        if (alreadyReady && mounted && !controller) await createCurrentGrid();
        await initialization;
        if (!alreadyReady && mounted && isSheetwriteReady() && !controller) {
          await createCurrentGrid();
        }
      } catch (error) {
        if (mounted && token === initializationToken) emit("initialization-error", error);
      }
    }

    onMounted(() => {
      mounted = true;
      void initialize();
    });
    onBeforeUnmount(() => {
      mounted = false;
      initializationToken += 1;
      teardownGrid();
    });

    watch(
      () => props.wasmSource,
      () => {
        void initialize();
      },
    );
    watch(
      () => [
        props.workbook,
        props.data,
        props.datasource,
        props.datasourceStorage,
        props.renderer,
        props.workerUrl,
        props.protectionResolver,
        props.mutationPolicy,
        props.renderers,
      ],
      () => {
        if (isSheetwriteReady()) void createCurrentGrid();
      },
    );
    watch(
      () => props.readOnly,
      (value) => controller?.setReadOnly(value ?? false),
    );
    watch(
      () => props.config,
      (value) => controller?.setConfig(value),
    );
    watch(
      () => props.theme,
      (value) => controller?.setTheme(value),
    );
    watch(
      () => props.overscan,
      (value) => controller?.setOverscan(value),
    );
    watch(
      () => props.minColumns,
      (value) => controller?.setMinColumns(value),
    );

    expose({ grid: exposedGrid });

    return () => {
      const style = [
        attrs.style,
        gridSizeStyle({ height: props.height, fill: props.fill || undefined }),
      ];
      return h(
        "div",
        { ...attrs, ref: host, class: ["sheetwrite", attrs.class], style },
        exposedGrid.value ? undefined : slots.fallback?.(),
      );
    };
  },
});

/** Advanced framework component for workbook data or datasource input. */
export const SheetwriteGrid = SheetwriteGridComponent as typeof SheetwriteGridComponent & {
  new (): InstanceType<typeof SheetwriteGridComponent> & SheetwriteGridExpose;
};

/** Convenience component for local object rows with live option updates. */
export const Sheetwrite = defineComponent({
  name: "SheetwriteComponent",
  inheritAttrs: false,
  props: {
    /** Ordered schema used to derive the component-owned sheet. */
    columns: { type: Array as PropType<readonly { key: string; title: string }[]>, required: true },
    /** Rows converted to initial columnar data; missing keys become `null`. */
    defaultRows: { type: Array as PropType<readonly Record<string, CellScalar>[]>, required: true },
    /** Generated sheet name; defaults to `Sheet 1`. */
    sheetName: { type: String, default: undefined },
    /** Host height in CSS pixels for numbers or any CSS length string. */
    height: { type: [Number, String], default: undefined },
    /** Fills the parent; exactly one of `fill` or `height` is required. */
    fill: { type: Boolean, default: undefined },
  },
  setup(props, { attrs, slots }) {
    let input: SimpleGridInput | null = null;
    let inputColumns: typeof props.columns | null = null;
    let inputRows: typeof props.defaultRows | null = null;
    let inputSheetName: string | undefined;

    return () => {
      if (
        (props.height === undefined && !props.fill) ||
        (props.height !== undefined && props.fill)
      ) {
        throw new Error("Sheetwrite: provide exactly one of height or fill");
      }
      if (
        input === null ||
        inputColumns !== props.columns ||
        inputRows !== props.defaultRows ||
        inputSheetName !== props.sheetName
      ) {
        input = createSimpleGridInput({
          columns: props.columns,
          defaultRows: props.defaultRows,
          sheetName: props.sheetName,
        });
        inputColumns = props.columns;
        inputRows = props.defaultRows;
        inputSheetName = props.sheetName;
      }
      return h(SheetwriteGrid, { ...attrs, ...props, ...input }, slots);
    };
  },
});

export type { CellScalar, Grid } from "@sheetwrite/core";
export type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";
