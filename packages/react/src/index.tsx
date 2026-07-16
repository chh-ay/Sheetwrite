import {
  type CellScalar,
  type Grid,
  type GridOptions,
  initSheetwrite,
  isSheetwriteReady,
} from "@sheetwrite/core";
import {
  createGridController,
  createSimpleGridInput,
  type GridAdapterEventHandlers,
  type GridController,
  type GridReadyReason,
  type GridSizeProps,
  getGridResetReason,
  gridSizeStyle,
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

function publishGrid(ref: ForwardedRef<Grid>, grid: Grid | null): void {
  if (typeof ref === "function") ref(grid);
  else if (ref) ref.current = grid;
}

/** Advanced framework adapter props for workbook data or datasource ownership. */
export interface SheetwriteGridProps
  extends GridOptions,
    GridAdapterEventHandlers,
    SheetwriteInitializationProps,
    Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children"> {
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
export const SheetwriteGrid = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const {
      className,
      style,
      fallback,
      wasmSource,
      onInitializationError,
      onGridChange,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onActiveSheetChange,
      onReady,
      workbook,
      data,
      datasource,
      datasourceStorage,
      renderer,
      workerUrl,
      theme,
      readOnly,
      protectionResolver,
      mutationPolicy,
      renderers,
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

    const handlers = useRef<GridAdapterEventHandlers>({});
    Object.assign(handlers.current, {
      onGridChange,
      onSelectionChange,
      onViewportChange,
      onEditBegin,
      onEditCommit,
      onSearch,
      onActiveSheetChange,
      onReady,
      onInitializationError,
    });

    useLayoutEffect(() => {
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
        (error: unknown) => {
          if (!current || !mountedRef.current) return;
          initializedRef.current = false;
          setInitializationState("error");
          handlers.current.onInitializationError?.(error);
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
        renderers,
        protectionResolver,
        mutationPolicy,
        ...liveOptionsRef.current,
      };
      const previousOptions = previousOptionsRef.current;
      const reason: GridReadyReason =
        generationRef.current === 0
          ? "initial"
          : ((previousOptions && getGridResetReason(previousOptions, options)) ?? "input-reset");
      const controller = createGridController(host, options, {
        onGridChange: (event) => handlers.current.onGridChange?.(event),
        onSelectionChange: (selection) => handlers.current.onSelectionChange?.(selection),
        onViewportChange: (event) => handlers.current.onViewportChange?.(event),
        onEditBegin: (event) => handlers.current.onEditBegin?.(event),
        onEditCommit: (event) => handlers.current.onEditCommit?.(event),
        onSearch: (result) => handlers.current.onSearch?.(result),
        onActiveSheetChange: (event) => handlers.current.onActiveSheetChange?.(event),
      });
      controllerRef.current = controller;
      generationRef.current += 1;
      publishGrid(publishedRef.current, controller.grid);
      handlers.current.onReady?.({
        grid: controller.grid,
        generation: generationRef.current,
        reason,
      });
      previousOptionsRef.current = options;

      return () => {
        publishGrid(publishedRef.current, null);
        if (controllerRef.current === controller) controllerRef.current = null;
        controller.destroy();
      };
    }, [
      initializationState,
      workbook,
      data,
      datasource,
      datasourceStorage,
      renderer,
      workerUrl,
      protectionResolver,
      mutationPolicy,
      renderers,
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

/** Simple framework adapter props for columns and default row objects. */
export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource" | "height" | "fill"
> &
  GridSizeProps & {
    /** Ordered schema used to derive the component-owned sheet. */
    columns: readonly SimpleColumn<Row>[];
    /** Rows converted to initial columnar data; missing column keys become `null`. */
    defaultRows: readonly Row[];
    /** Name of the generated sheet; defaults to `Sheet 1`. */
    sheetName?: string;
  };

const SheetwriteComponent = forwardRef<Grid, SheetwriteProps<Record<string, CellScalar>>>(
  function Sheetwrite({ columns, defaultRows, sheetName, ...props }, ref): ReactElement {
    const input = useMemo(
      () => createSimpleGridInput({ columns, defaultRows, sheetName }),
      [columns, defaultRows, sheetName],
    );
    return <SheetwriteGrid {...props} {...input} ref={ref} />;
  },
);

/**
 * Convenience component for local object rows. It derives a single-sheet workbook from
 * `columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns the `Grid`
 * through prop-driven resets and unmount cleanup. Pass a `ref` to access the live `Grid`;
 * use `SheetwriteGrid` when the host already owns a workbook or datasource.
 */
export const Sheetwrite = SheetwriteComponent as <Row extends Record<string, CellScalar>>(
  props: SheetwriteProps<Row> & {
    /** Receives the live Grid after readiness and `null` on reset or unmount. */
    ref?: ForwardedRef<Grid>;
  },
) => ReactElement;

export type { CellScalar, Grid } from "@sheetwrite/core";
export type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";
