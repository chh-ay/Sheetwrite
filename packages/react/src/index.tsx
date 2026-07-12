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

export interface SheetwriteGridProps
  extends GridOptions,
    GridAdapterEventHandlers,
    SheetwriteInitializationProps,
    Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children"> {
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  height?: number | string;
  fill?: true;
}

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
      renderer,
      workerUrl,
      theme,
      readOnly,
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
      let current = true;
      if (isSheetwriteReady()) {
        initializedRef.current = true;
        setInitializationState("ready");
        return;
      }
      setInitializationState("loading");
      void initSheetwrite(wasmSource).then(
        () => {
          if (!current) return;
          initializedRef.current = true;
          setInitializationState("ready");
        },
        (error: unknown) => {
          if (!current) return;
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
        renderer,
        workerUrl,
        renderers,
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
    }, [initializationState, workbook, data, datasource, renderer, workerUrl, renderers]);

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

export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource" | "height" | "fill"
> &
  GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
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

export const Sheetwrite = SheetwriteComponent as <Row extends Record<string, CellScalar>>(
  props: SheetwriteProps<Row> & { ref?: ForwardedRef<Grid> },
) => ReactElement;

export type { CellScalar, Grid } from "@sheetwrite/core";
export type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";
