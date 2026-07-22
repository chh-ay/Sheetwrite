import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { validateWorkbookSnapshot } from "../src/document-protocol.js";
import { SheetwriteError } from "../src/errors.js";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import {
  hyperlinkAt,
  isSafeExternalHyperlink,
  resolveHyperlinkTarget,
  sanitizeCellHyperlink,
  sanitizeHyperlinkStyle,
} from "../src/hyperlink.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellHyperlink, Workbook } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function externalLink(url = "https://example.com/report?q=1"): CellHyperlink {
  return {
    id: "link-external",
    range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    target: { kind: "external", url },
    display: "Open report",
    style: { color: "#123456", underline: true },
  };
}

let restoreCanvas: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
  document.body.replaceChildren();
});

describe("hyperlink policy", () => {
  it("admits only bounded absolute HTTPS and mailto targets", () => {
    expect(isSafeExternalHyperlink("https://example.com/path#section")).toBe(true);
    expect(isSafeExternalHyperlink("mailto:owner@example.com?subject=Sheet")).toBe(true);
    expect(isSafeExternalHyperlink("HTTPS://example.com/path")).toBe(true);
    for (const unsafe of [
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,boom",
      "file:///etc/passwd",
      "https:example.com",
      " https://example.com",
      "https://user:secret@example.com",
      "not a URL",
      "mailto:owner@example.com?subject=x%0d%0aBcc:attacker@example.com",
    ]) {
      expect(isSafeExternalHyperlink(unsafe)).toBe(false);
    }
  });

  it("sanitizes hyperlink styles without invoking accessors or cloning hostile graphs", () => {
    expect(
      sanitizeHyperlinkStyle({
        color: "#123456",
        bold: true,
        fontSize: 16,
        border: { bottom: { color: "#654321", width: 2, style: "solid" } },
      }),
    ).toEqual({
      color: "#123456",
      bold: true,
      fontSize: 16,
      border: { bottom: { color: "#654321", width: 2, style: "solid" } },
    });
    expect(sanitizeHyperlinkStyle({ fontSize: Number.POSITIVE_INFINITY })).toBeNull();
    expect(sanitizeHyperlinkStyle({ fontSize: 1_025 })).toBeNull();
    expect(sanitizeHyperlinkStyle({ color: "x".repeat(1_000_000) })).toBeNull();
    expect(sanitizeHyperlinkStyle({ unknown: { deep: { graph: new Array(10_000) } } })).toBeNull();

    let getterCalls = 0;
    const getterStyle = Object.defineProperty({}, "color", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "#123456";
      },
    });
    expect(sanitizeHyperlinkStyle(getterStyle)).toBeNull();
    expect(getterCalls).toBe(0);
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
      },
    );
    expect(sanitizeHyperlinkStyle(throwingProxy)).toBeNull();
    expect(sanitizeCellHyperlink({ ...externalLink(), style: getterStyle })).toBeNull();
  });

  it("keeps internal targets on stable sheet IDs across rename and rejects removal", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets.push({
      id: "destination",
      name: "Before",
      rowCount: 2,
      columns: workbook.sheets[0]!.columns.map((column) => ({ ...column })),
    });
    const target = {
      kind: "internal" as const,
      range: {
        sheet: "destination",
        start: { row: 1, col: 1 },
        end: { row: 1, col: 1 },
      },
    };
    workbook.sheets[1]!.name = "After";
    expect(resolveHyperlinkTarget(workbook, target)).toEqual({
      kind: "internal",
      address: { sheet: "destination", row: 1, col: 1 },
    });
    workbook.sheets.splice(1, 1);
    expect(() => resolveHyperlinkTarget(workbook, target)).toThrow(SheetwriteError);
    try {
      resolveHyperlinkTarget(workbook, target);
    } catch (error) {
      expect((error as SheetwriteError).code).toBe("unsafe-hyperlink");
      expect((error as SheetwriteError).operation).toBe("hyperlink-activate");
    }
  });

  it("fails closed with a public error for malformed runtime targets and range ends", () => {
    const workbook = makeWorkbook(2);
    expect(() =>
      resolveHyperlinkTarget(workbook, { kind: "internal", range: null } as never),
    ).toThrow(SheetwriteError);
    expect(() =>
      resolveHyperlinkTarget(workbook, {
        kind: "internal",
        range: {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: workbook.sheets[0]!.rowCount, col: 0 },
        },
      }),
    ).toThrow(SheetwriteError);
  });

  it("rejects unsafe mutations before document state changes", () => {
    const workbook = makeWorkbook(2);
    const store = new SheetwriteStore(workbook);
    const grid = new GridImpl(mountHost(), { workbook }, store);
    expect(grid.setHyperlink(externalLink("javascript:alert(1)")).status).toBe("rejected");
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toBeUndefined();
    grid.destroy();
  });

  it("rejects overlong/control-character IDs at the snapshot boundary", () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    const snapshot = store.exportSnapshot();
    snapshot.sheets[0]!.hyperlinks = [{ ...externalLink(), id: `${"x".repeat(129)}\u0001` }];
    const validation = validateWorkbookSnapshot(snapshot);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors).toContainEqual(
        expect.objectContaining({ path: "sheets[0].hyperlinks[0].id" }),
      );
    }
    store.dispose();
  });

  it("persists hyperlink operations through history, snapshots, structure, and sheet removal", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets.push({
      id: "destination",
      name: "Destination",
      rowCount: 3,
      columns: workbook.sheets[0]!.columns.map((column) => ({ ...column })),
    });
    const store = new SheetwriteStore(workbook);
    const grid = new GridImpl(mountHost(), { workbook }, store);
    const hyperlink: CellHyperlink = {
      id: "internal",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      target: {
        kind: "internal",
        range: {
          sheet: "destination",
          start: { row: 1, col: 1 },
          end: { row: 1, col: 1 },
        },
      },
    };
    expect(grid.setHyperlink(hyperlink).status).toBe("applied");
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toEqual([]);
    grid.redo();
    expect(store.exportSnapshot().sheets[0]!.hyperlinks).toEqual([hyperlink]);

    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "destination", at: 0, count: 1 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } },
    });
    store.applyTransaction({
      patches: [{ op: "moveRows", sheet: "destination", from: 2, count: 1, to: 0 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
    });
    store.applyTransaction({
      patches: [
        {
          op: "addColumns",
          sheet: "destination",
          at: 0,
          columns: [{ key: "inserted", header: "Inserted", width: 100, type: "text" }],
        },
      ],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 2 }, end: { row: 0, col: 2 } },
    });
    store.applyTransaction({
      patches: [{ op: "moveColumns", sheet: "destination", from: 2, count: 1, to: 0 }],
    });
    expect(store.getWorkbook().sheets[0]!.hyperlinks![0]!.target).toMatchObject({
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    });
    expect(grid.removeSheet("destination").status).toBe("applied");
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toEqual([]);
    grid.undo();
    expect(store.getWorkbook().sheets[0]!.hyperlinks).toHaveLength(1);
    grid.destroy();
  });

  it("rebases pending source and internal target ranges through server structure", () => {
    const hyperlink: CellHyperlink = {
      id: "pending",
      range: { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 2, col: 0 } },
      target: {
        kind: "internal",
        range: {
          sheet: "destination",
          start: { row: 4, col: 1 },
          end: { row: 4, col: 1 },
        },
      },
    };
    const result = rebaseDocumentOperations(
      [{ op: "setHyperlink", sheet: "s1", hyperlink }],
      [
        { op: "addRows", sheet: "s1", at: 1, count: 2 },
        { op: "addRows", sheet: "destination", at: 3, count: 1 },
      ],
    );
    expect(result).toMatchObject({
      status: "rebased",
      operations: [
        {
          hyperlink: {
            range: { start: { row: 4, col: 0 }, end: { row: 4, col: 0 } },
            target: {
              range: { start: { row: 5, col: 1 }, end: { row: 5, col: 1 } },
            },
          },
        },
      ],
    });
  });

  it("emits a validated host event without opening external URLs", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [externalLink()];
    const store = new SheetwriteStore(workbook);
    const grid = new GridImpl(mountHost(), { workbook, hyperlinkActivation: "event-only" }, store);
    const events: unknown[] = [];
    grid.on("hyperlink-activate", (event) => events.push(event));

    expect(grid.activateHyperlink({ sheet: "s1", row: 0, col: 0 })).toBe(true);
    expect(events).toEqual([
      {
        address: { sheet: "s1", row: 0, col: 0 },
        hyperlink: externalLink(),
        target: { kind: "external", href: "https://example.com/report?q=1" },
      },
    ]);
    grid.destroy();
  });

  it("revalidates after host mutation and emits nothing for an unsafe target", () => {
    const workbook: Workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [externalLink()];
    const store = new SheetwriteStore(workbook);
    const grid = new GridImpl(mountHost(), { workbook }, store);
    let emitted = false;
    grid.on("hyperlink-activate", () => {
      emitted = true;
    });
    workbook.sheets[0]!.hyperlinks![0]!.target = {
      kind: "external",
      url: "javascript:alert(1)",
    };

    expect(grid.activateHyperlink({ sheet: "s1", row: 0, col: 0 })).toBe(false);
    expect(emitted).toBe(false);
    grid.destroy();
  });

  it("returns cloned metadata from range lookup", () => {
    const workbook = makeWorkbook(2);
    workbook.sheets[0]!.hyperlinks = [
      {
        ...externalLink(),
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      },
    ];
    const found = hyperlinkAt(workbook, { sheet: "s1", row: 1, col: 1 });
    expect(found?.id).toBe("link-external");
    found!.style!.color = "#000000";
    expect(workbook.sheets[0]!.hyperlinks![0]!.style!.color).toBe("#123456");
  });
});
