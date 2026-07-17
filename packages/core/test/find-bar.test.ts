import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { FindBar } from "../src/find-bar.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, SearchResult } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

function result(query: string, active = 0, count = 2): SearchResult {
  return {
    query,
    active,
    matches: Array.from({ length: count }, (_, row) => ({ sheet: "s1", row, col: 0 })),
  };
}

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

describe("FindBar", () => {
  it("searches and replaces live cells without leaking field keystrokes", () => {
    const host = mountHost();
    const grid = createGrid(host, {
      workbook: makeWorkbook(3),
      data: {
        rowCount: 3,
        columns: {
          name: ["Ada", "Bob", "Ada"],
          amount: [1, 2, 3],
          city: ["London", "Paris", "Rome"],
        },
      },
      config: { find: false, contextMenu: false, toolbar: false },
    });
    const searchEvents: SearchResult[] = [];
    let changes = 0;
    grid.on("search", (event) => searchEvents.push(event));
    grid.on("change", () => {
      changes += 1;
    });
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const replacement = host.querySelector<HTMLInputElement>(".sheetwrite-find-replace-input")!;
    const count = host.querySelector<HTMLElement>(".sheetwrite-find-count")!;

    bar.open();
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(count.textContent).toBe("1 of 2");
    let latest = searchEvents.at(-1)!;
    expect(latest.matches[latest.active]).toEqual({ sheet: "s1", row: 0, col: 0 });

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.click();
    expect(count.textContent).toBe("2 of 2");
    latest = searchEvents.at(-1)!;
    expect(latest.matches[latest.active]).toEqual({ sheet: "s1", row: 2, col: 0 });

    const buttonMouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.dispatchEvent(buttonMouseDown);
    expect(buttonMouseDown.defaultPrevented).toBe(true);

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-prev")!.click();
    expect(count.textContent).toBe("1 of 2");
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.click();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Ada");
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Ada");

    replacement.value = "Grace";
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace")!.click();
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("Grace");
    expect(changes).toBe(1);
    expect(count.textContent).toBe("1 of 1");

    replacement.value = "Lovelace";
    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Lovelace");

    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    replacement.value = "All";
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace-all")!.click();
    expect(grid.store.getCell({ sheet: "s1", row: 2, col: 0 }).resolved).toBe("All");

    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(bar.isOpen).toBe(false);
    bar.open();
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-close")!.click();
    expect(bar.isOpen).toBe(false);
    bar.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(bar.isOpen).toBe(false);
    expect(document.activeElement).toBe(host);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("Lovelace");

    bar.destroy();
    grid.destroy();
  });

  it("omits replacement controls in read-only mode and reports idle/no-match states", () => {
    const searches: string[] = [];
    const grid = {
      search: (query: string) => {
        searches.push(query);
        return result(query, 0, 0);
      },
      clearSearch: () => {},
    } as unknown as Grid;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const bar = new FindBar(host, DEFAULT_THEME, grid, true);
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const count = host.querySelector<HTMLElement>(".sheetwrite-find-count")!;

    expect(host.querySelector(".sheetwrite-find-replace-row")).toBeNull();
    bar.open({ replace: true });
    expect(document.activeElement).toBe(input);
    input.value = "missing";
    input.dispatchEvent(new Event("input"));
    expect(count.textContent).toBe("No results");
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(count.textContent).toBe("");
    expect(searches).toEqual(["missing", ""]);
    bar.destroy();
  });
});
