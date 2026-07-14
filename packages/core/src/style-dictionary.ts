import type { CellStyle } from "./types/cell.js";

const EMPTY: CellStyle = {};

/**
 * Interns `CellStyle` objects to dense `u32` ids. The store keeps only the id
 * per cell (in WASM memory); this small dictionary holds the actual objects on
 * the JS side. Id `0` is always the empty/default style.
 */
export class StyleDictionary {
  private readonly styles: CellStyle[] = [EMPTY];
  private readonly lookup = new Map<string, number>();

  intern(style: CellStyle | undefined): number {
    if (!style) return 0;
    const border = style.border ? JSON.stringify(style.border) : "";
    const key = `${style.bold ? 1 : 0}|${style.italic ? 1 : 0}|${style.underline ? 1 : 0}|${
      style.strikethrough ? 1 : 0
    }|${style.fontSize ?? ""}|${style.color ?? ""}|${style.backgroundColor ?? ""}|${
      style.align ?? ""
    }|${style.wrap ? 1 : 0}|${border}`;
    if (key === "0|0|0|0|||||0|") return 0;
    const existing = this.lookup.get(key);
    if (existing !== undefined) return existing;
    const id = this.styles.length;
    this.styles.push(style);
    this.lookup.set(key, id);
    return id;
  }

  get(id: number): CellStyle {
    return this.styles[id] ?? EMPTY;
  }

  get table(): readonly CellStyle[] {
    return this.styles;
  }
}
