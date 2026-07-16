import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { ContextMenu } from "../src/context-menu.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellAddress, Grid, GridActions, Selection } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;
let clipboardDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  restoreCanvasStubs();
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("ContextMenu", () => {
  it("executes representative built-ins against a live grid", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: makeColumnarData(3),
      config: { contextMenu: false, find: false, toolbar: false },
    });
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          { id: "copy", action: "copy" },
          { id: "insert-row", action: "insertRowBelow" },
          { id: "hide-column", action: "hideColumn" },
          { id: "merge", action: "merge" },
        ],
      },
      DEFAULT_THEME,
      grid.actions,
      grid,
    );
    const click = (id: string, selection: Selection, cell: CellAddress): void => {
      grid.setSelection(selection);
      menu.open({ cell, clientX: 0, clientY: 0 });
      host.querySelector<HTMLElement>(`[data-context-menu-item="${id}"]`)!.click();
    };

    const first = { sheet: "s1", row: 0, col: 0 };
    click("copy", { kind: "cell", addr: first }, first);
    await Promise.resolve();
    expect(copied).toEqual(["Customer 0"]);

    click("insert-row", { kind: "cell", addr: first }, first);
    expect(grid.store.getWorkbook().sheets[0]!.rowCount).toBe(4);

    const thirdColumn = { sheet: "s1", row: 0, col: 2 };
    click("hide-column", { kind: "cell", addr: thirdColumn }, thirdColumn);
    expect(grid.store.getWorkbook().sheets[0]!.columns[2]!.visible).toBe(false);

    click(
      "merge",
      {
        kind: "range",
        range: {
          sheet: "s1",
          start: { row: 0, col: 0 },
          end: { row: 1, col: 1 },
        },
      },
      first,
    );
    expect(grid.store.getWorkbook().sheets[0]!.merges).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 1 }]);

    menu.destroy();
    grid.destroy();
  });

  it("passes the opened cell to custom actions and dismisses on outside input", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const cell: CellAddress = { sheet: "s1", row: 4, col: 2 };
    const received: Array<CellAddress | null> = [];
    const grid = {} as Grid;
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          {
            label: "Inspect",
            onClick: (receivedGrid, address) => {
              expect(receivedGrid).toBe(grid);
              received.push(address);
            },
          },
        ],
      },
      DEFAULT_THEME,
      {} as GridActions,
      grid,
    );
    const element = host.querySelector<HTMLElement>(".sheetwrite-context-menu")!;

    const open = (x: number, y: number, address: CellAddress | null): void => {
      menu.open({
        cell: address,
        clientX: x,
        clientY: y,
      });
    };
    open(-10, -20, cell);
    expect(element.style.left).toBe("0px");
    expect(element.style.top).toBe("0px");
    host.querySelector<HTMLElement>(".sheetwrite-context-menu-item")!.click();
    expect(received).toEqual([cell]);

    open(20, 20, null);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    window.dispatchEvent(new Event("resize"));
    expect(element.style.display).toBe("none");
    open(20, 20, null);
    window.dispatchEvent(new Event("scroll"));
    expect(element.style.display).toBe("none");

    menu.destroy();
    expect(host.querySelector(".sheetwrite-context-menu")).toBeNull();
  });

  it("resolves dynamic visibility, disabled state, shortcuts, and separators per request", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = {} as Grid;
    const selected: CellAddress[] = [];
    const menu = new ContextMenu(
      host,
      {
        contextMenu: (request) => [
          { action: "separator" },
          { label: "Hidden", visible: false },
          { action: "separator" },
          {
            id: "inspect",
            label: `Inspect row ${request.cell?.row ?? "none"}`,
            shortcut: "Ctrl+I",
            disabled: request.cell?.row === 4,
            onClick: (_grid, address) => {
              if (address) selected.push(address);
            },
          },
          { action: "separator" },
          { action: "separator" },
        ],
      },
      DEFAULT_THEME,
      {} as GridActions,
      grid,
    );

    menu.open({
      cell: { sheet: "s1", row: 4, col: 2 },
      clientX: 10,
      clientY: 20,
    });
    expect(host.querySelectorAll(".sheetwrite-context-menu-sep")).toHaveLength(0);
    const disabled = host.querySelector<HTMLElement>("[data-context-menu-item=inspect]")!;
    expect(disabled.textContent).toBe("Inspect row 4Ctrl+I");
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    disabled.click();
    expect(selected).toHaveLength(0);

    menu.open({
      cell: { sheet: "s1", row: 3, col: 1 },
      clientX: 10,
      clientY: 20,
    });
    const enabled = host.querySelector<HTMLElement>("[data-context-menu-item=inspect]")!;
    expect(enabled.hasAttribute("aria-disabled")).toBe(false);
    enabled.click();
    expect(selected).toEqual([{ sheet: "s1", row: 3, col: 1 }]);

    menu.destroy();
  });
});
