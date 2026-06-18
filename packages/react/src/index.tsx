import {
  type ChangeEvent,
  createGrid,
  type Grid,
  type GridOptions,
  type Selection,
} from "@sheetwrite/core";
import { type CSSProperties, type ReactElement, useEffect, useRef } from "react";

export interface SheetwriteGridProps extends GridOptions {
  className?: string;
  style?: CSSProperties;
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

/**
 * Thin React wrapper: it owns a host `<div>`, creates the imperative core grid
 * in an effect, forwards events, and tears down on unmount. It renders no cells.
 * Call `await initSheetwrite(wasmUrl)` once before mounting (WASM must be ready).
 */
export function SheetwriteGrid(props: SheetwriteGridProps): ReactElement {
  const { className, style, onChange, onSelectionChange, ...options } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const callbacks = useRef({ onChange, onSelectionChange });
  callbacks.current = { onChange, onSelectionChange };

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild only on workbook identity; live callbacks are read via ref.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const grid = createGrid(host, options);
    gridRef.current = grid;
    const offs = [
      grid.on("change", (e) => callbacks.current.onChange?.(e)),
      grid.on("selection", (e) => callbacks.current.onSelectionChange?.(e.selection)),
    ];

    return () => {
      for (const off of offs) off();
      grid.destroy();
      gridRef.current = null;
    };
  }, [options.workbook]);

  useEffect(() => {
    if (options.theme) gridRef.current?.setTheme(options.theme);
  }, [options.theme]);

  return <div ref={hostRef} className={className} style={style} />;
}
