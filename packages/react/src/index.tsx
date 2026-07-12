import type { ChangeEvent, Grid, GridEvents, GridOptions, Selection } from "@sheetwrite/core";
import {
  createGridController,
  type GridController,
  type GridControllerHandlers,
} from "@sheetwrite/core/adapter";
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

function publishGrid(ref: ForwardedRef<Grid>, grid: Grid | null): void {
  if (typeof ref === "function") ref(grid);
  else if (ref) ref.current = grid;
}

export interface SheetwriteGridProps extends GridOptions {
  className?: string;
  style?: CSSProperties;
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onScroll?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  /** Fired once with the imperative core grid after it is created. */
  onReady?: (grid: Grid) => void;
}

/**
 * Thin React wrapper: it owns a host `<div>`, drives the imperative core grid
 * through a {@link createGridController}, forwards events, replaces the grid
 * only when a construction-bound option changes, and tears down on unmount.
 * Theme, read-only, and UI configuration update the existing grid. It renders
 * no cells. Call `await initSheetwrite(wasmUrl)` once before mounting (WASM
 * must be ready).
 *
 * The created grid is exposed through `ref` and the `onReady` callback so
 * consumers can drive it imperatively — `grid.actions.*`, `grid.search(...)`.
 */
export const SheetwriteGrid = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const {
      className,
      style,
      onChange,
      onSelectionChange,
      onScroll,
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
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<Grid | null>(null);
    const controllerRef = useRef<GridController | null>(null);
    const publishedRef = useRef<ForwardedRef<Grid> | null>(null);
    const themeRef = useRef<GridOptions["theme"]>(theme);
    themeRef.current = theme;
    const readOnlyRef = useRef<GridOptions["readOnly"]>(readOnly);
    const configRef = useRef<GridOptions["config"]>(config);
    readOnlyRef.current = readOnly;
    configRef.current = config;

    // Live-callback bag: the controller reads these fields on every event, so we
    // mutate the SAME object each render instead of recreating the grid.
    const handlers = useRef<GridControllerHandlers>({});
    handlers.current.onChange = onChange;
    handlers.current.onSelectionChange = onSelectionChange;
    handlers.current.onScroll = onScroll;
    handlers.current.onEditBegin = onEditBegin;
    handlers.current.onEditCommit = onEditCommit;
    handlers.current.onSearch = onSearch;
    handlers.current.onActiveSheetChange = onActiveSheetChange;
    handlers.current.onReady = onReady;

    useLayoutEffect(() => {
      const previous = publishedRef.current;
      if (previous && previous !== ref) publishGrid(previous, null);

      publishedRef.current = ref;
      publishGrid(ref, gridRef.current);

      return () => {
        if (publishedRef.current !== ref) return;
        publishGrid(ref, null);
        publishedRef.current = null;
      };
    }, [ref]);

    // Rebuild only when a construction-bound option changes. Live options and
    // callbacks are read through refs/the stable handler bag.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const controller = createGridController(
        host,
        {
          workbook,
          data,
          datasource,
          renderer,
          workerUrl,
          theme: themeRef.current,
          readOnly: readOnlyRef.current,
          renderers,
          overscan,
          minColumns,
          config: configRef.current,
        },
        handlers.current,
      );
      controllerRef.current = controller;
      gridRef.current = controller.grid;
      publishGrid(publishedRef.current, controller.grid);

      return () => {
        controller.destroy();
        if (controllerRef.current === controller) controllerRef.current = null;
        if (gridRef.current === controller.grid) {
          gridRef.current = null;
          publishGrid(publishedRef.current, null);
        }
      };
    }, [workbook, data, datasource, renderer, workerUrl, renderers, overscan, minColumns]);

    useEffect(() => {
      controllerRef.current?.setReadOnly(readOnly ?? false);
    }, [readOnly]);

    useEffect(() => {
      controllerRef.current?.setConfig(config);
    }, [config]);
    useEffect(() => {
      controllerRef.current?.setTheme(theme);
    }, [theme]);

    return <div ref={hostRef} className={className} style={style} />;
  },
);
