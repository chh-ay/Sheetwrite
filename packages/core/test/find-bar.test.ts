import { describe, expect, it } from "bun:test";
import { FindBar } from "../src/find-bar.js";
import { DEFAULT_THEME } from "../src/grid.js";
import type { Grid, SearchResult } from "../src/types.js";

function result(query: string, active = 0, count = 2): SearchResult {
  return {
    query,
    active,
    matches: Array.from({ length: count }, (_, row) => ({ sheet: "s1", row, col: 0 })),
  };
}

describe("FindBar", () => {
  it("searches, navigates, replaces, switches fields, and closes without leaking keystrokes", () => {
    const calls: string[] = [];
    const grid = {
      search: (query: string) => {
        calls.push(`search:${query}`);
        return result(query);
      },
      findPrev: () => {
        calls.push("previous");
        return result("Ada", 1);
      },
      findNext: () => {
        calls.push("next");
        return result("Ada", 0);
      },
      replaceCurrent: (replacement: string) => {
        calls.push(`replace:${replacement}`);
        return result("Ada", 0, 1);
      },
      replaceAll: (replacement: string) => {
        calls.push(`all:${replacement}`);
        return { count: 2, result: result("Ada", 0, 0) };
      },
      clearSearch: () => calls.push("clear"),
    } as unknown as Grid;
    const host = document.createElement("div");
    host.tabIndex = 0;
    document.body.appendChild(host);
    const bar = new FindBar(host, DEFAULT_THEME, grid);
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-find-input")!;
    const replacement = host.querySelector<HTMLInputElement>(".sheetwrite-find-replace-input")!;
    const count = host.querySelector<HTMLElement>(".sheetwrite-find-count")!;

    bar.open();
    expect(bar.isOpen).toBe(true);
    expect(document.activeElement).toBe(input);
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(count.textContent).toBe("1 of 2");

    host.querySelector<HTMLButtonElement>(".sheetwrite-find-prev")!.click();
    expect(count.textContent).toBe("2 of 2");
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-next")!.click();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
    );
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "h", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(replacement);
    replacement.value = "Grace";
    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace")!.click();
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-replace-all")!.click();
    expect(count.textContent).toBe("No results");

    replacement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(input);
    host.querySelector<HTMLButtonElement>(".sheetwrite-find-close")!.click();
    expect(bar.isOpen).toBe(false);
    expect(document.activeElement).toBe(host);

    bar.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    bar.open({ replace: true });
    replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(calls).toEqual([
      "search:Ada",
      "previous",
      "next",
      "previous",
      "next",
      "search:Ada",
      "replace:Grace",
      "replace:Grace",
      "all:Grace",
      "search:Ada",
      "clear",
      "search:Ada",
      "clear",
      "search:Ada",
      "clear",
    ]);

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    expect(host.querySelector("button")!.dispatchEvent(mouseDown)).toBe(false);
    bar.destroy();
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
