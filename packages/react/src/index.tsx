import {
  type ChangeEvent,
  createGridController,
  type Grid,
  type GridController,
  type GridControllerHandlers,
  type GridOptions,
  type Selection,
} from "@sheetwrite/core";
import {
  type CSSProperties,
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface SheetwriteGridProps extends GridOptions {
  className?: string;
  style?: CSSProperties;
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  /** Fired once with the imperative core grid after it is created. */
  onReady?: (grid: Grid) => void;
}

/**
 * Thin React wrapper: it owns a host `<div>`, drives the imperative core grid
 * through a {@link createGridController}, forwards events, recreates the grid
 * when the `workbook` identity changes, and tears down on unmount. It renders
 * no cells. Call `await initSheetwrite(wasmUrl)` once before mounting (WASM
 * must be ready).
 *
 * The created grid is exposed through `ref` and the `onReady` callback so
 * consumers can drive it imperatively — `grid.actions.*`, `grid.search(...)`.
 */
export const SheetwriteGrid = forwardRef<Grid, SheetwriteGridProps>(
  function SheetwriteGrid(props, ref): ReactElement {
    const { className, style, onChange, onSelectionChange, onReady, ...options } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<Grid | null>(null);
    const controllerRef = useRef<GridController | null>(null);

    // Live-callback bag: the controller reads these fields on every event, so we
    // mutate the SAME object each render instead of recreating the grid.
    const handlers = useRef<GridControllerHandlers>({});
    handlers.current.onChange = onChange;
    handlers.current.onSelectionChange = onSelectionChange;
    handlers.current.onReady = onReady;

    useImperativeHandle(ref, () => gridRef.current!, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild only on workbook identity; live callbacks are read via the handlers ref.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const controller = createGridController(host, options, handlers.current);
      controllerRef.current = controller;
      gridRef.current = controller.grid;

      return () => {
        controller.destroy();
        controllerRef.current = null;
        gridRef.current = null;
      };
    }, [options.workbook]);

    useEffect(() => {
      if (options.theme) controllerRef.current?.setTheme(options.theme);
    }, [options.theme]);

    return <div ref={hostRef} className={className} style={style} />;
  },
);
