import { describe, expect, it } from "bun:test";
import { paintFrame } from "../src/canvas-paint.js";
import type { CellStyle, RenderLayout, Theme, Viewport, VisibleWindowView } from "../src/types.js";

// jsdom/happy-dom has no 2D canvas context, so paint against a recording stub
// (modelled on the one in grid.test.ts, extended to capture the geometry of each
// draw call) and read back the rectangles/text/lines `paintFrame` emitted.
interface FillRectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

interface FillTextCall {
  text: string;
  x: number;
  y: number;
  fillStyle: string;
  font: string;
  maxWidth?: number;
}

interface MoveToCall {
  x: number;
  y: number;
}
interface LineSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ClipRectCall {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecordingCtx {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  fillRects: FillRectCall[];
  fillTexts: FillTextCall[];
  moveTos: MoveToCall[];
  clipRects: ClipRectCall[];
  segments: LineSegment[];
  [op: string]: unknown;
}

function makeRecordingCtx(): RecordingCtx {
  const ctx: RecordingCtx = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
    fillRects: [],
    fillTexts: [],
    clipRects: [],
    moveTos: [],
    segments: [],
  };

  // Capture the live `fillStyle` at call time, since it mutates between draws.
  ctx.fillRect = (x: number, y: number, w: number, h: number) => {
    ctx.fillRects.push({ x, y, w, h, fillStyle: ctx.fillStyle });
  };
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    ctx.fillTexts.push({ text, x, y, maxWidth, fillStyle: ctx.fillStyle, font: ctx.font });
  };
  let segmentStart: MoveToCall | undefined;
  ctx.moveTo = (x: number, y: number) => {
    segmentStart = { x, y };
    ctx.moveTos.push(segmentStart);
  };
  ctx.lineTo = (x: number, y: number) => {
    if (segmentStart) {
      ctx.segments.push({ x0: segmentStart.x, y0: segmentStart.y, x1: x, y1: y });
      segmentStart = { x, y };
    }
  };
  // paintFrame measures the drawn run to size text decorations; approximate a
  // monospace-ish width so the recording ctx has a deterministic run length.
  ctx.measureText = (text: string) => ({ width: text.length * 7 });

  let pendingRect: ClipRectCall | undefined;
  ctx.rect = (x: number, y: number, w: number, h: number) => {
    pendingRect = { x, y, w, h };
  };
  ctx.clip = () => {
    if (pendingRect) ctx.clipRects.push(pendingRect);
  };

  for (const op of ["setTransform", "beginPath", "save", "restore", "stroke", "setLineDash"]) {
    ctx[op] = () => {};
  }

  return ctx;
}

// Custom (function) renderers are never exercised here; `paintFrame` takes a
// `ReadonlyMap`, so an empty map (not a lookup record) is the right shape.
const NO_RENDERERS = new Map<string, never>();

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 20;

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    font: "12px sans-serif",
    bg: "#ffffff",
    fg: "#000000",
    gridLine: "#dddddd",
    headerBg: "#f0f0f0",
    headerFg: "#333333",
    selection: "#cceeff",
    selectionBorder: "#3388ff",
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    rowHeaderWidth: 0,
    searchMatch: "#ffff00",
    searchActiveMatch: "#ffaa00",
    highlight: "#ccffcc",
    ...overrides,
  };
}

function makeLayout(
  columns: RenderLayout["columns"],
  merges?: RenderLayout["merges"],
): RenderLayout {
  return { columns, rowHeight: ROW_HEIGHT, headerHeight: HEADER_HEIGHT, totalRows: 3, merges };
}

function makeView(
  styleIds: Uint32Array,
  styles: readonly CellStyle[],
  cols: readonly number[] = [0, 1],
): VisibleWindowView {
  const rows = { start: 0, end: 3 };
  const cellCount = (rows.end - rows.start) * cols.length;
  const values = new Array<string>(cellCount).fill("x");
  return { sheet: "s1", rows, cols, values, styleIds, styles };
}

/** Paint `view` against a fresh recording context and return it for inspection. */
function render(
  view: VisibleWindowView,
  layout: RenderLayout,
  viewport: Viewport,
  theme: Theme = makeTheme(),
  damage?: { x: number; y: number; w: number; h: number },
): RecordingCtx {
  const ctx = makeRecordingCtx();
  paintFrame(
    ctx as unknown as CanvasRenderingContext2D,
    view,
    layout,
    theme,
    viewport,
    1,
    NO_RENDERERS,
    damage,
  );
  return ctx;
}

// Shared viewports. `paintFrame` only reads them, so the constants are reusable.
const UNIFORM_VIEWPORT: Viewport = { scrollTop: 0, scrollLeft: 0, width: 400, height: 300 };

// Non-uniform window geometry: row 0 is tall, row 1 short, row 2 medium.
const GEOMETRY_VIEWPORT: Viewport = {
  ...UNIFORM_VIEWPORT,
  rowTops: Float64Array.from([0, 40, 50]),
  rowHeights: Float64Array.from([40, 10, 25]),
};

describe("paintFrame variable row heights", () => {
  it("positions a cell using the supplied per-row geometry", () => {
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      { key: "b", header: "B", width: 80, type: "text" },
    ]);

    // Target cell at view-row 1, column 0 (i = 1 * 2 + 0) gets a unique fill.
    const CELL_FILL = "#abcdef";
    const styleIds = new Uint32Array(6);
    styleIds[2] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: CELL_FILL }]);

    const ctx = render(view, layout, GEOMETRY_VIEWPORT);

    const rect = ctx.fillRects.find((r) => r.fillStyle === CELL_FILL);
    expect(rect).toBeDefined();
    // y = headerHeight(20) + rowTops[1](40) - scrollTop(0); h = rowHeights[1](10).
    expect(rect?.y).toBe(60);
    expect(rect?.h).toBe(10);
    // The uniform layout would have produced y = 44, h = 24 instead.
    expect(rect?.y).not.toBe(44);
    expect(rect?.h).not.toBe(24);
  });

  it("falls back to uniform row geometry when none is supplied", () => {
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      { key: "b", header: "B", width: 80, type: "text" },
    ]);

    const CELL_FILL = "#abcdef";
    const styleIds = new Uint32Array(6);
    styleIds[2] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: CELL_FILL }]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    const rect = ctx.fillRects.find((r) => r.fillStyle === CELL_FILL);
    expect(rect).toBeDefined();
    // Uniform: y = headerHeight(20) + row(1) * rowHeight(24) = 44; h = rowHeight(24).
    expect(rect?.y).toBe(44);
    expect(rect?.h).toBe(24);
    expect(rect?.x).toBe(0);
    expect(rect?.w).toBe(100);
  });

  it("sums per-row heights across a merged region", () => {
    const layout = makeLayout(
      [
        { key: "a", header: "A", width: 100, type: "text" },
        { key: "b", header: "B", width: 80, type: "text" },
      ],
      [{ r0: 0, c0: 0, r1: 1, c1: 0 }],
    );

    // Fill the merge origin (row 0, col 0) so its painted height is observable.
    const MERGE_FILL = "#fe01dc";
    const styleIds = new Uint32Array(6);
    styleIds[0] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: MERGE_FILL }]);

    const ctx = render(view, layout, GEOMETRY_VIEWPORT);

    const rect = ctx.fillRects.find((r) => r.fillStyle === MERGE_FILL);
    expect(rect).toBeDefined();
    // Spanned rows 0..1 → rowHeights[0] + rowHeights[1] = 40 + 10 = 50.
    expect(rect?.h).toBe(50);
    // Uniform would have summed to (2) * 24 = 48.
    expect(rect?.h).not.toBe(48);
  });

  it("removes internal gridlines from a merged rectangle", () => {
    const layout = makeLayout(
      [
        { key: "a", header: "A", width: 100, type: "text" },
        { key: "b", header: "B", width: 100, type: "text" },
      ],
      [{ r0: 0, c0: 0, r1: 1, c1: 1 }],
    );
    const view = makeView(new Uint32Array(6), [{}]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);
    const internalRowY = HEADER_HEIGHT + ROW_HEIGHT - 0.5;
    const internalColX = 100 - 0.5;

    expect(
      ctx.segments.some(
        (line) => line.y0 === internalRowY && line.y1 === internalRowY && line.x0 < 200,
      ),
    ).toBe(false);
    expect(
      ctx.segments.some(
        (line) =>
          line.x0 === internalColX &&
          line.x1 === internalColX &&
          line.y0 < HEADER_HEIGHT + ROW_HEIGHT * 2 &&
          line.y1 > HEADER_HEIGHT,
      ),
    ).toBe(false);
  });

  it("draws the horizontal gridline at each row's geometric bottom", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);

    const ctx = render(view, layout, GEOMETRY_VIEWPORT);

    // Row 0's bottom: headerHeight(20) + rowTops[0](0) + rowHeights[0](40) = 60,
    // snapped to a crisp half-pixel line → round(60) - 0.5 = 59.5.
    expect(ctx.moveTos.some((m) => m.y === 59.5)).toBe(true);
    // Uniform would have placed it at round(20 + 24) - 0.5 = 43.5.
    expect(ctx.moveTos.some((m) => m.y === 43.5)).toBe(false);
  });

  it("skips cells outside a damage strip", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT, makeTheme(), {
      x: 0,
      y: HEADER_HEIGHT + ROW_HEIGHT * 2,
      w: 400,
      h: ROW_HEIGHT,
    });

    const bodyTexts = ctx.fillTexts.filter((call) => call.text === "x");
    expect(bodyTexts).toHaveLength(1);
    expect(bodyTexts[0]?.y).toBe(HEADER_HEIGHT + ROW_HEIGHT * 2 + ROW_HEIGHT / 2);
  });
});

describe("paintFrame column styles", () => {
  it("applies Column.cellStyle as the cell background base", () => {
    const COL_FILL = "#00ff00";
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      { key: "b", header: "B", width: 80, type: "text", cellStyle: { backgroundColor: COL_FILL } },
    ]);

    // Every cell uses the default (empty) per-cell style.
    const view = makeView(new Uint32Array(6), [{}]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    const colFills = ctx.fillRects.filter((r) => r.fillStyle === COL_FILL);
    // Column B's cellStyle paints behind all three visible rows.
    expect(colFills.length).toBe(3);
    // Column B starts at x = 100 (column A's width) and is 80 wide.
    expect(colFills.every((r) => r.x === 100 && r.w === 80)).toBe(true);
  });

  it("lets a per-cell style override the column cellStyle", () => {
    const COL_FILL = "#ff0000";
    const CELL_FILL = "#0000ff";
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text", cellStyle: { backgroundColor: COL_FILL } },
    ]);

    // View-row 0 overrides the column fill with its own background.
    const styleIds = new Uint32Array(3);
    styleIds[0] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: CELL_FILL }], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    // Row 0 (y = 20) wins with its per-cell blue; rows 1-2 keep the column red.
    const row0 = ctx.fillRects.find((r) => r.y === 20);
    expect(row0?.fillStyle).toBe(CELL_FILL);
    expect(ctx.fillRects.filter((r) => r.fillStyle === COL_FILL).length).toBe(2);
  });

  it("applies Column.headerStyle over the header defaults", () => {
    const HEADER_BG = "#112233";
    const HEADER_FG = "#ffcc00";
    const theme = makeTheme();
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      {
        key: "b",
        header: "B",
        width: 80,
        type: "text",
        headerStyle: { backgroundColor: HEADER_BG, color: HEADER_FG },
      },
    ]);

    const view = makeView(new Uint32Array(6), [{}]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT, theme);

    // Column B's header gets its own background fill at the column's position.
    const bg = ctx.fillRects.find((r) => r.fillStyle === HEADER_BG);
    expect(bg).toBeDefined();
    expect(bg?.x).toBe(100);
    expect(bg?.w).toBe(80);
    expect(bg?.h).toBe(theme.headerHeight);

    // Column B's label uses the headerStyle foreground; column A keeps the theme's.
    expect(ctx.fillTexts.find((t) => t.text === "B")?.fillStyle).toBe(HEADER_FG);
    expect(ctx.fillTexts.find((t) => t.text === "A")?.fillStyle).toBe(theme.headerFg);
  });
  it("does not horizontally distort text when a column is narrower than its label", () => {
    const layout = makeLayout([{ key: "a", header: "Long header", width: 8, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);
    (view.values as string[])[0] = "Long cell value";

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.fillTexts.find((call) => call.text === "Long header")?.maxWidth).toBeUndefined();
    expect(ctx.fillTexts.find((call) => call.text === "Long cell value")?.maxWidth).toBeUndefined();
  });

  it("clips narrow headers and cell text to their own row and column", () => {
    const layout = makeLayout([
      { key: "a", header: "Long header", width: 18, type: "text" },
      { key: "b", header: "B", width: 22, type: "text" },
    ]);
    const view = makeView(new Uint32Array(6), [{}]);
    (view.values as string[])[0] = "Long cell value";
    const viewport: Viewport = {
      ...UNIFORM_VIEWPORT,
      rowTops: Float64Array.from([0, 9, 33]),
      rowHeights: Float64Array.from([9, 24, 24]),
    };

    const ctx = render(view, layout, viewport);

    expect(ctx.clipRects).toContainEqual({ x: 0, y: 0, w: 18, h: HEADER_HEIGHT });
    expect(ctx.clipRects).toContainEqual({ x: 0, y: HEADER_HEIGHT, w: 18, h: 9 });
    expect(ctx.fillTexts.find((call) => call.text === "Long cell value")?.maxWidth).toBeUndefined();
  });

  it("lets text spill through empty cells but stops before occupied neighbours", () => {
    const layout = makeLayout([
      { key: "a", header: "A", width: 20, type: "text" },
      { key: "b", header: "B", width: 24, type: "text" },
      { key: "c", header: "C", width: 30, type: "text" },
    ]);
    const view = makeView(new Uint32Array(9), [{}], [0, 1, 2]);
    (view.values as string[]).splice(0, 3, "Long label", "", "occupied");

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.clipRects).toContainEqual({
      x: 0,
      y: HEADER_HEIGHT,
      w: 44,
      h: ROW_HEIGHT,
    });
  });

  it("renders hashes instead of a misleading truncated number", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 18, type: "number" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);
    (view.values as Array<string | number>)[0] = 12345;

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.fillTexts.some((call) => call.text === "#")).toBe(true);
    expect(ctx.fillTexts.some((call) => call.text === "12345")).toBe(false);
  });
});

describe("paintFrame typography and wrapping", () => {
  it("uses per-cell font size with valid italic-bold ordering", () => {
    const layout = {
      ...makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]),
      zoom: 1,
    };
    const styleIds = Uint32Array.from([1, 0, 0]);
    const view = makeView(styleIds, [{}, { fontSize: 18, bold: true, italic: true }], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.fillTexts.find((call) => call.text === "x")?.font).toBe(
      "italic bold 18px sans-serif",
    );
  });

  it("scales a base font size exactly once with layout zoom", () => {
    const layout = {
      ...makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]),
      zoom: 2,
    };
    const styleIds = Uint32Array.from([1, 0, 0]);
    const view = makeView(styleIds, [{}, { fontSize: 18 }], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT, makeTheme({ font: "24px sans-serif" }));

    expect(ctx.fillTexts.find((call) => call.text === "x")?.font).toBe("36px sans-serif");
  });

  it("wraps explicit and measured lines inside the owning cell", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 47, type: "text" }]);
    const styleIds = Uint32Array.from([1, 0, 0]);
    const view = makeView(styleIds, [{}, { wrap: true, align: "center" }], [0]);
    (view.values as string[])[0] = "one two\nthree";
    const viewport = {
      ...UNIFORM_VIEWPORT,
      rowTops: Float64Array.from([0, 48, 72]),
      rowHeights: Float64Array.from([48, 24, 24]),
    };

    const ctx = render(view, layout, viewport);
    const cellLines = ctx.fillTexts.filter((call) => ["one ", "two", "three"].includes(call.text));

    expect(cellLines.map((call) => call.text)).toEqual(["one ", "two", "three"]);
    expect(ctx.clipRects).toContainEqual({ x: 0, y: HEADER_HEIGHT, w: 47, h: 48 });
    expect(cellLines.every((call) => call.x === 23.5)).toBe(true);
  });

  it("breaks an overlong token at character boundaries", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 26, type: "text" }]);
    const styleIds = Uint32Array.from([1, 0, 0]);
    const view = makeView(styleIds, [{}, { wrap: true }], [0]);
    (view.values as string[])[0] = "abcdef";
    const viewport = {
      ...UNIFORM_VIEWPORT,
      rowTops: Float64Array.from([0, 48, 72]),
      rowHeights: Float64Array.from([48, 24, 24]),
    };

    const ctx = render(view, layout, viewport);
    const painted = ctx.fillTexts
      .filter((call) => call.y >= HEADER_HEIGHT && call.y < HEADER_HEIGHT + 48 && call.x === 6)
      .map((call) => call.text);
    expect(painted).toEqual(["ab", "cd", "ef"]);
  });
});

describe("paintFrame text decorations", () => {
  const TEXT_COLOR = "#123456";
  // Left-aligned text row 0, col 0 origin: cy = headerHeight + rowHeight/2.
  const ROW_CY = HEADER_HEIGHT + ROW_HEIGHT / 2;

  function renderDecorated(style: CellStyle): RecordingCtx {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const styleIds = new Uint32Array(3);
    styleIds[0] = 1; // view-row 0 gets the decorated style; rows 1-2 stay default.
    const view = makeView(styleIds, [{}, style], [0]);
    return render(view, layout, UNIFORM_VIEWPORT);
  }

  /** 1px-high fill rects in the text color are the decoration lines. */
  const decorationLines = (ctx: RecordingCtx): FillRectCall[] =>
    ctx.fillRects.filter((r) => r.h === 1 && r.fillStyle === TEXT_COLOR);

  it("draws an underline line below the text run, in the text color", () => {
    const ctx = renderDecorated({ underline: true, color: TEXT_COLOR });

    const lines = decorationLines(ctx);
    expect(lines).toHaveLength(1);
    const underline = lines[0]!;
    // Below the "middle" baseline origin, still inside the row (20..44).
    expect(underline.y).toBeGreaterThan(ROW_CY);
    expect(underline.y).toBeLessThan(HEADER_HEIGHT + ROW_HEIGHT);
    // Left-aligned run starts at x + CELL_PAD (0 + 6) and spans the measured "x".
    expect(underline.x).toBe(6);
    expect(underline.w).toBe(7);
  });

  it("draws a strikethrough line through the middle of the text run", () => {
    const ctx = renderDecorated({ strikethrough: true, color: TEXT_COLOR });

    const lines = decorationLines(ctx);
    expect(lines).toHaveLength(1);
    // Mid x-height ≈ the "middle" baseline origin at cy, rounded to a pixel.
    expect(lines[0]?.y).toBe(Math.round(ROW_CY));
  });

  it("draws both lines when underline and strikethrough are set", () => {
    const ctx = renderDecorated({ underline: true, strikethrough: true, color: TEXT_COLOR });

    const lines = decorationLines(ctx);
    expect(lines).toHaveLength(2);
    // The two lines sit at distinct rows (underline below the strikethrough).
    const ys = lines.map((l) => l.y).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(ys[1]!);
  });

  it("draws no decoration line for a plain cell", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    // Backgrounds/headers are full-height fills; a 1px-high rect would be a
    // stray decoration. None should exist.
    expect(ctx.fillRects.every((r) => r.h !== 1)).toBe(true);
  });
});
