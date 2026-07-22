import {
  type CellScalar,
  type Grid,
  type GridOptions,
  type SheetwriteError,
  initSheetwrite,
  isSheetwriteReady,
} from "@sheetwrite/core";
import {
  createGridController,
  createSimpleGridInput,
  createSimpleRowBridge,
  type GridAdapterEventHandlers,
  type GridController,
  type GridReadyReason,
  type GridSizeProps,
  getGridResetReason,
  gridSizeStyle,
  type RowBridge,
  type RowBridgeHandler,
  type RowBridgeId,
  type SheetwriteInitializationProps,
  type SimpleColumn,
} from "@sheetwrite/core/adapter";
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const useCommitLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function publishGrid(ref: ForwardedRef<Grid>, grid: Grid | null): void {
  if (typeof ref === "function") ref(grid);
  else if (ref) ref.current = grid;
}

type GridAdapterEventHandlerName =
  | "onGridChange"
  | "onRowDelta"
  | "onSelectionChange"
  | "onViewportChange"
  | "onEditBegin"
  | "onEditCommit"
  | "onSearch"
  | "onCommandStateChange"
  | "onActiveSheetChange"
  | "onMutationRejected"
  | "onRendererFallback"
  | "onDatasourceError"
  | "onExportError"
  | "onReady"
  | "onInitializationError";
type AssertNever<Value extends never> = Value;
type GridAdapterEventHandlerParity = AssertNever<
  | Exclude<keyof GridAdapterEventHandlers, GridAdapterEventHandlerName>
  | Exclude<GridAdapterEventHandlerName, keyof GridAdapterEventHandlers>
>;
type SheetwriteGridHostAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  GridAdapterEventHandlerName | GridAdapterEventHandlerParity | "children"
>;

/** Advanced framework adapter props for workbook data or datasource ownership. */
export interface SheetwriteGridProps<Id extends RowBridgeId = RowBridgeId>
  extends GridOptions,
    GridAdapterEventHandlers<Id>,
    SheetwriteInitializationProps,
    SheetwriteGridHostAttributes {
  /** Projects canonical changes to host-owned row identities. */
  rowBridge?: RowBridge<Id>;
  /** Receives one accepted or reconciled row projection. */
  onRowDelta?: RowBridgeHandler<Id>;
  /** Receives structured issues when a Grid mutation is rejected. */
  onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
  /** Fires when worker rendering falls back to the main-thread canvas renderer. */
  onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
  /** Receives failed datasource requests and their errors. */
  onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
  /** Receives failures from built-in XLSX export actions. */
  onExportError?: GridAdapterEventHandlers["onExportError"];
  /** Fires after the adapter publishes a ready Grid generation. */
  onReady?: GridAdapterEventHandlers["onReady"];
  /** Additional class appended to the required `sheetwrite` host class. */
  className?: string;
  /** Host styles merged before adapter sizing styles. */
  style?: CSSProperties;
  /** Content shown while WASM is loading or after initialization fails. */
  fallback?: ReactNode;
  /** Host height in CSS pixels for numbers or any CSS length string. */
  height?: number | string;
  /** Fills the parent's available width and height, taking precedence over `height`. */
  fill?: true;
}

/** Advanced framework component for workbook data or datasource input. */
const SheetwriteGridComponent = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const {
      className,
      style,
      fallback,
      wasmSource,
      onInitializationError,
      onGridChange,
      onRowDelta,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onCommandStateChange,
      onActiveSheetChange,
      onMutationRejected,
      onRendererFallback,
      onDatasourceError,
      onExportError,
      onReady,
      rowBridge,
      workbook,
      data,
      datasource,
      datasourceStorage,
      renderer,
      workerUrl,
      presentation,
      theme,
      readOnly,
      protectionResolver,
      mutationPolicy,
      transactionResourceLimits,
      hyperlinkActivation,
      renderers,
      editors,
      overscan,
      minColumns,
      config,
      height,
      fill,
      ...hostAttributes
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<GridController | null>(null);
    const publishedRef = useRef<ForwardedRef<Grid> | null>(null);
    const generationRef = useRef(0);
    const initializedRef = useRef(isSheetwriteReady());
    const mountedRef = useRef(false);
    const [initializationState, setInitializationState] = useState<"loading" | "ready" | "error">(
      initializedRef.current ? "ready" : "loading",
    );
    const previousOptionsRef = useRef<GridOptions | null>(null);
    const liveOptionsRef = useRef({
      theme,
      readOnly,
      overscan,
      minColumns,
      config,
    });
    liveOptionsRef.current = { theme, readOnly, overscan, minColumns, config };

    const handlers = useRef<GridAdapterEventHandlers | null>(null);
    useCommitLayoutEffect(() => {
      const committedHandlers: GridAdapterEventHandlers = {
        onGridChange,
        onRowDelta,
        onSelectionChange,
        onViewportChange,
        onEditBegin,
        onEditCommit,
        onSearch,
        onCommandStateChange,
        onActiveSheetChange,
        onMutationRejected,
        onRendererFallback,
        onDatasourceError,
        onExportError,
        onReady,
        onInitializationError,
      };
      handlers.current = committedHandlers;
      return () => {
        if (handlers.current === committedHandlers) handlers.current = null;
      };
    }, [
      onGridChange,
      onRowDelta,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onCommandStateChange,
      onActiveSheetChange,
      onMutationRejected,
      onRendererFallback,
      onDatasourceError,
      onExportError,
      onReady,
      onInitializationError,
    ]);

    useCommitLayoutEffect(() => {
      const previous = publishedRef.current;
      if (previous && previous !== ref) publishGrid(previous, null);
      publishedRef.current = ref;
      publishGrid(ref, controllerRef.current?.grid ?? null);
      return () => {
        if (publishedRef.current !== ref) return;
        publishGrid(ref, null);
        publishedRef.current = null;
      };
    }, [ref]);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    useEffect(() => {
      let current = true;
      if (isSheetwriteReady()) {
        initializedRef.current = true;
        setInitializationState("ready");
        return;
      }
      setInitializationState("loading");
      void initSheetwrite(wasmSource).then(
        () => {
          if (!mountedRef.current || !isSheetwriteReady()) return;
          initializedRef.current = true;
          setInitializationState("ready");
        },
        (error: SheetwriteError) => {
          if (!current || !mountedRef.current) return;
          initializedRef.current = false;
          setInitializationState("error");
          handlers.current?.onInitializationError?.(error);
        },
      );
      return () => {
        current = false;
      };
    }, [wasmSource]);

    useEffect(() => {
      if (initializationState !== "ready") return;
      const host = hostRef.current;
      if (!host) return;
      const options: GridOptions = {
        workbook,
        data,
        datasource,
        datasourceStorage,
        renderer,
        workerUrl,
        presentation,
        renderers,
        editors,
        protectionResolver,
        mutationPolicy,
        transactionResourceLimits,
        hyperlinkActivation,
        ...liveOptionsRef.current,
      };
      const previousOptions = previousOptionsRef.current;
      const reason: GridReadyReason =
        generationRef.current === 0
          ? "initial"
          : ((previousOptions && getGridResetReason(previousOptions, options)) ?? "input-reset");
      const controller = createGridController(
        host,
        options,
        {
          onGridChange: (event) => handlers.current?.onGridChange?.(event),
          onRowDelta: (projection) => handlers.current?.onRowDelta?.(projection),
          onSelectionChange: (selection) => handlers.current?.onSelectionChange?.(selection),
          onViewportChange: (event) => handlers.current?.onViewportChange?.(event),
          onEditBegin: (event) => handlers.current?.onEditBegin?.(event),
          onEditCommit: (event) => handlers.current?.onEditCommit?.(event),
          onSearch: (result) => handlers.current?.onSearch?.(result),
          onCommandStateChange: (event) => handlers.current?.onCommandStateChange?.(event),
          onActiveSheetChange: (event) => handlers.current?.onActiveSheetChange?.(event),
          onMutationRejected: (event) => handlers.current?.onMutationRejected?.(event),
          onRendererFallback: (event) => handlers.current?.onRendererFallback?.(event),
          onDatasourceError: (event) => handlers.current?.onDatasourceError?.(event),
          onExportError: (event) => handlers.current?.onExportError?.(event),
        },
        rowBridge,
      );
      controllerRef.current = controller;
      generationRef.current += 1;
      let destroyed = false;
      const teardown = (detachPublishedRef = false): void => {
        if (destroyed) return;
        destroyed = true;
        if (controllerRef.current === controller) controllerRef.current = null;

        const published = publishedRef.current;
        let cleanupError: unknown;
        let cleanupFailed = false;
        try {
          publishGrid(published, null);
        } catch (error) {
          cleanupError = error;
          cleanupFailed = true;
        }
        if (detachPublishedRef && publishedRef.current === published) publishedRef.current = null;

        try {
          controller.destroy();
        } catch (error) {
          cleanupError = cleanupFailed
            ? new AggregateError(
                [cleanupError, error],
                "Sheetwrite React controller cleanup failed",
              )
            : error;
          cleanupFailed = true;
        }
        if (cleanupFailed) throw cleanupError;
      };

      try {
        publishGrid(publishedRef.current, controller.grid);
        handlers.current?.onReady?.({
          grid: controller.grid,
          generation: generationRef.current,
          reason,
        });
        previousOptionsRef.current = options;
      } catch (error) {
        try {
          teardown(true);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Sheetwrite React controller creation and cleanup failed",
          );
        }
        throw error;
      }

      return teardown;
    }, [
      initializationState,
      workbook,
      data,
      datasource,
      datasourceStorage,
      renderer,
      workerUrl,
      presentation,
      protectionResolver,
      mutationPolicy,
      transactionResourceLimits,
      hyperlinkActivation,
      renderers,
      editors,
      rowBridge,
    ]);

    useEffect(() => controllerRef.current?.setReadOnly(readOnly ?? false), [readOnly]);
    useEffect(() => controllerRef.current?.setConfig(config), [config]);
    useEffect(() => controllerRef.current?.setTheme(theme), [theme]);
    useEffect(() => controllerRef.current?.setOverscan(overscan), [overscan]);
    useEffect(() => controllerRef.current?.setMinColumns(minColumns), [minColumns]);

    const hostClassName = className ? `sheetwrite ${className}` : "sheetwrite";
    const sizing = gridSizeStyle({ height, fill });
    const hostStyle = { ...style, ...sizing };
    return (
      <div {...hostAttributes} ref={hostRef} className={hostClassName} style={hostStyle}>
        {initializationState === "ready" ? null : fallback}
      </div>
    );
  },
);

/** Advanced framework component with inferred row-bridge identity. */
export const SheetwriteGrid = SheetwriteGridComponent as <Id extends RowBridgeId = RowBridgeId>(
  props: SheetwriteGridProps<Id> & { ref?: ForwardedRef<Grid> },
) => ReactElement;

/** Simple framework adapter props for columns and default row objects. */
export type SheetwriteProps<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> = Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "height" | "fill" | "rowBridge"
> &
  GridSizeProps & {
    /** Ordered schema used to derive the component-owned sheet. */
    columns: readonly SimpleColumn<Row>[];
    /** Rows converted to initial columnar data; missing column keys become `null`. */
    defaultRows: readonly Row[];
    /** Name of the generated sheet; defaults to `Sheet 1`. */
    sheetName?: string;
    /** Opt-in stable identity for each host row. */
    getRowId?: (row: Row, index: number) => Id;
    /** Creates stable identities for Grid-inserted rows. */
    createRowId?: Parameters<typeof createSimpleRowBridge<Row, Id>>[0]["createRowId"];
  };

const SheetwriteComponent = forwardRef<
  Grid,
  SheetwriteProps<Record<string, CellScalar>, RowBridgeId>
>(function Sheetwrite(
  { columns, defaultRows, sheetName, getRowId, createRowId, ...props },
  ref,
): ReactElement {
  const input = useMemo(
    () => createSimpleGridInput({ columns, defaultRows, sheetName }),
    [columns, defaultRows, sheetName],
  );
  const rowBridge = useMemo(
    () =>
      createSimpleRowBridge({
        columns,
        defaultRows,
        ...(getRowId === undefined ? {} : { getRowId }),
        ...(createRowId === undefined ? {} : { createRowId }),
      }),
    [columns, defaultRows, getRowId, createRowId],
  );
  return <SheetwriteGrid {...props} {...input} rowBridge={rowBridge} ref={ref} />;
});

/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
 * through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
 * use `SheetwriteGrid` when the host already owns a workbook or datasource.
 */
export const Sheetwrite = SheetwriteComponent as <
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(
  props: SheetwriteProps<Row, Id> & {
    /** Receives the live Grid after readiness and `null` on reset or unmount. */
    ref?: ForwardedRef<Grid>;
  },
) => ReactElement;

export type {
  CellEditor,
  CellEditorContext,
  CellEditorInstance,
  CellEditorNavigation,
  CellScalar,
  Grid,
  GridCommandName,
  GridCommandState,
} from "@sheetwrite/core";
export type {
  GridReadyEvent,
  RowBridge,
  RowBridgeDelta,
  RowBridgeHandler,
  RowBridgeId,
  RowBridgeProjection,
  SimpleColumn,
} from "@sheetwrite/core/adapter";
