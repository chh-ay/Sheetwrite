import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type SheetTabRecord, SheetTabs, type SheetTabsOptions } from "../src/sheet-tabs.js";
import type { SheetLifecycleResult } from "../src/types/grid.js";

const SHEETS: readonly SheetTabRecord[] = [
  { id: "a", name: "Sales" },
  { id: "b", name: "Sales" }, // duplicate display text proves identity remains ID-based
  { id: "c", name: "Summary" },
];

function applied(sheet: string): SheetLifecycleResult {
  return {
    status: "applied",
    epoch: 1,
    transaction: { patches: [] },
    sheet,
  };
}

function rejected(
  sheet: string,
  message: string,
  code: "blank" | "duplicate" | "last-visible-sheet" = "duplicate",
): SheetLifecycleResult {
  return {
    status: "rejected",
    epoch: 1,
    sheet,
    issues: [
      {
        kind: "sheet-lifecycle",
        severity: "error",
        code,
        sheet,
        operationIndex: 0,
        message,
      },
    ],
  };
}

function tabButtons(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function inputText(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(target: EventTarget, value: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, ...init }));
}

describe("SheetTabs", () => {
  let host: HTMLDivElement;
  let tabs: SheetTabs;
  let activated: string[];
  let scrolled: string[];
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    host.style.width = "390px";
    host.style.overflowX = "auto";
    document.body.appendChild(host);
    activated = [];
    scrolled = [];
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.dataset.sheetId ?? this.getAttribute("aria-label") ?? "unknown");
      },
    });
    tabs = new SheetTabs(host, { onActivate: (id) => activated.push(id) });
    tabs.update(SHEETS, "b");
  });

  afterEach(() => {
    tabs.destroy();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    document.body.replaceChildren();
  });

  it("renders visible sheets as an ID-controlled tablist and never reveals veryHidden", () => {
    tabs.update(
      [
        ...SHEETS,
        { id: "hidden", name: "Hidden", visibility: "hidden" },
        { id: "secret", name: "Secret", visibility: "veryHidden" },
      ],
      "b",
    );

    const buttons = tabButtons(host);
    expect(buttons.map((button) => button.textContent)).toEqual(["Sales", "Sales", "Summary"]);
    expect(buttons.map((button) => button.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    buttons[0]!.click();
    expect(activated).toEqual(["a"]);
    expect(host.textContent).not.toContain("Secret");
  });

  it("keeps one roving tab stop and scrolls active, focused, and edited tabs in a narrow 12-sheet host", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `sheet-${index}`,
      name: `Sheet ${index + 1}`,
    }));
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id) => applied(id),
    });
    tabs.update(many, "sheet-10");

    let buttons = tabButtons(host);
    expect(buttons).toHaveLength(12);
    expect(buttons.map((button) => button.tabIndex).filter((index) => index === 0)).toHaveLength(1);
    expect(scrolled).toContain("sheet-10");

    buttons[10]!.focus();
    key(host, "Home");
    expect(document.activeElement).toBe(buttons[0]!);
    expect(buttons[0]!.tabIndex).toBe(0);
    expect(scrolled).toContain("sheet-0");

    key(host, "End");
    buttons = tabButtons(host);
    expect(document.activeElement).toBe(buttons[11]!);
    key(host, "F2");
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input");
    expect(input?.dataset.sheetId).toBe("sheet-11");
    expect(document.activeElement).toBe(input);
    expect(scrolled).toContain("sheet-11");
  });

  it("renames inline by double-click and F2, committing Enter or changed blur and cancelling Escape", () => {
    const renames: Array<[string, string]> = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id, name) => {
        renames.push([id, name]);
        return applied(id);
      },
    });
    tabs.update(SHEETS, "b");

    tabButtons(host)[1]!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    expect(input.closest('[role="tablist"]')).toBeNull();
    const placeholder = host.querySelector<HTMLButtonElement>('[data-rename-placeholder="b"]')!;
    expect(placeholder.closest('[role="tablist"]')).toBe(host.querySelector('[role="tablist"]'));
    expect(placeholder.getAttribute("role")).toBe("tab");
    expect(placeholder.getAttribute("aria-selected")).toBe("true");
    inputText(input, "Revenue");
    key(input, "Enter");
    expect(renames).toEqual([["b", "Revenue"]]);
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Forecast");
    input.blur();
    expect(renames.at(-1)).toEqual(["b", "Forecast"]);
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Cancelled");
    key(input, "Escape");
    expect(renames).toHaveLength(2);
    expect(document.activeElement).toBe(tabButtons(host)[1]!);

    key(host, "F2");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    input.blur();
    expect(renames).toHaveLength(2);
  });

  it("does not commit Enter during IME composition", () => {
    const renames: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id, name) => {
        renames.push(`${id}:${name}`);
        return applied(id);
      },
    });
    tabs.update(SHEETS, "b");
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    const input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    inputText(input, "売上");
    key(input, "Enter");
    expect(renames).toEqual([]);
    expect(host.querySelector(".sheetwrite-tab-input")).toBe(input);

    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "売上" }));
    key(input, "Enter");
    expect(renames).toEqual(["b:売上"]);
  });

  it("keeps invalid Enter and blur edits focused with their structured lifecycle error associated", () => {
    const attempts: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id, name) => {
        attempts.push(name);
        return rejected(
          id,
          name.length === 0 ? "Sheet name cannot be blank" : "Sheet name already exists",
          name.length === 0 ? "blank" : "duplicate",
        );
      },
    });
    tabs.update(SHEETS, "b");
    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    const rename = host.querySelector<HTMLButtonElement>('[aria-label="Rename Sales sheet"]')!;
    expect(document.activeElement).toBe(rename);
    rename.click();

    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Summary");
    key(input, "Enter");
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    const error = host.querySelector<HTMLElement>('[role="alert"]')!;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.textContent).toBe("Sheet name already exists");
    expect(error.dataset.code).toBe("duplicate");

    inputText(input, "");
    input.blur();
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Sheet name cannot be blank");
    expect(attempts).toEqual(["Summary", ""]);
  });

  it("exposes lifecycle actions through an accessible active-sheet menu and keyboard shortcuts", () => {
    const actions: string[] = [];
    const options: SheetTabsOptions = {
      onActivate: () => {},
      onAdd: () => {
        actions.push("add");
        return applied("new");
      },
      onRemove: (id) => {
        actions.push(`remove:${id}`);
        return applied(id);
      },
      onRename: (id) => applied(id),
      onMove: (id, to) => {
        actions.push(`move:${id}:${to}`);
        return applied(id);
      },
      onHide: (id) => {
        actions.push(`hide:${id}`);
        return applied(id);
      },
      onUnhide: (id) => {
        actions.push(`unhide:${id}`);
        return applied(id);
      },
    };
    tabs.destroy();
    tabs = new SheetTabs(host, options);
    const workbook = [
      ...SHEETS,
      { id: "hidden", name: "Hidden", visibility: "hidden" as const },
      { id: "secret", name: "Secret", visibility: "veryHidden" as const },
    ];
    tabs.update(workbook, "b");

    expect(host.querySelector(".sheetwrite-tab-actions")).toBeNull();
    expect(host.textContent).not.toContain("+");
    let trigger = host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const tablist = host.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(tablist.getAttribute("aria-label")).toBe("Sheets");
    expect(
      [...tablist.children].every((child) => child.getAttribute("role") === "presentation"),
    ).toBe(true);
    expect(tablist.querySelectorAll(':scope > [role="presentation"] > [role="tab"]')).toHaveLength(
      3,
    );
    expect(trigger.closest('[role="tablist"]')).toBeNull();
    trigger.focus();
    key(trigger, "ArrowDown");

    const menu = host.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.getAttribute("aria-label")).toBe("Sales sheet options");
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(["Rename", "Hide", "Remove"]);
    expect(document.activeElement).toBe(items[0]!);
    key(items[0]!, "End");
    expect(document.activeElement).toBe(items[2]!);
    key(items[2]!, "Home");
    expect(document.activeElement).toBe(items[0]!);
    key(items[0]!, "Escape");
    trigger = host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!;
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(host.querySelector('[role="menu"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    tabs.update(workbook, "b");
    expect(host.querySelector('[role="menu"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Hide Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Options for Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Remove Sales sheet"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Add sheet"]')!.click();
    const unhide = host.querySelector<HTMLElement>('[aria-label="Unhide sheet"]')!;
    expect(unhide.textContent).toBe("Unhide…");
    const hiddenChoices = host.querySelector<HTMLElement>(
      '[role="group"][aria-label="Hidden sheets"]',
    )!;
    expect(
      [...hiddenChoices.querySelectorAll("button")].map((button) => button.textContent),
    ).toEqual(["Hidden"]);
    expect(hiddenChoices.hidden).toBe(true);
    unhide.click();
    expect(unhide.getAttribute("aria-expanded")).toBe("true");
    expect(hiddenChoices.hidden).toBe(false);
    key(hiddenChoices.querySelector("button")!, "Escape");
    expect(unhide.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenChoices.hidden).toBe(true);
    expect(document.activeElement).toBe(unhide);
    unhide.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(unhide.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenChoices.hidden).toBe(true);
    expect(document.activeElement).toBe(unhide);
    unhide.click();
    expect(host.textContent).not.toContain("Secret");
    hiddenChoices.querySelector("button")!.click();

    let active = tabButtons(host)[1]!;
    active.focus();
    key(host, "ArrowLeft", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "ArrowRight", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "h", { ctrlKey: true, shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "Delete");
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "F11", { shiftKey: true });
    active = tabButtons(host)[1]!;
    active.focus();
    key(host, "u", { ctrlKey: true, shiftKey: true });

    expect(actions).toEqual([
      "hide:b",
      "remove:b",
      "add",
      "unhide:hidden",
      "move:b:0",
      "move:b:2",
      "hide:b",
      "remove:b",
      "add",
      "unhide:hidden",
    ]);
  });

  it("supports pointer drag reorder and maps drops to workbook indexes through hidden sheets", () => {
    const moves: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onMove: (id, to) => {
        moves.push(`${id}:${to}`);
        return applied(id);
      },
    });
    tabs.update(
      [
        { id: "a", name: "A" },
        { id: "h", name: "H", visibility: "hidden" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      "a",
    );
    const buttons = tabButtons(host);
    expect(buttons.every((button) => button.draggable)).toBe(true);
    buttons[0]!.dispatchEvent(new Event("dragstart", { bubbles: true }));
    buttons[1]!.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    buttons[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(moves).toEqual(["a:2"]);
  });

  it("reconciles remote rename, reorder, and removal while editing by stable ID", () => {
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id) => applied(id),
    });
    tabs.update(SHEETS, "b");
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    let input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    inputText(input, "Local draft");

    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "b", name: "Remote Sales" },
        { id: "a", name: "Sales" },
      ],
      "b",
    );
    input = host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")!;
    expect(input.value).toBe("Local draft");
    expect(input.dataset.sheetId).toBe("b");
    expect(document.activeElement).toBe(input);
    key(input, "Escape");
    expect(tabButtons(host).map((button) => button.textContent)).toEqual([
      "Summary",
      "Remote Sales",
      "Sales",
    ]);

    tabButtons(host)[1]!.focus();
    key(host, "F2");
    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "b", name: "Server final" },
        { id: "a", name: "Sales" },
      ],
      "b",
    );
    expect(host.querySelector<HTMLInputElement>(".sheetwrite-tab-input")?.value).toBe(
      "Server final",
    );

    tabs.update(
      [
        { id: "c", name: "Summary" },
        { id: "a", name: "Sales" },
      ],
      "c",
    );
    expect(host.querySelector(".sheetwrite-tab-input")).toBeNull();
    expect(document.activeElement).toBe(tabButtons(host)[1]!);
    expect(tabButtons(host).map((button) => button.tabIndex)).toEqual([-1, 0]);
  });

  it("suppresses mutation affordances in read-only mode while preserving navigation", () => {
    const actions: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      readOnly: true,
      onActivate: () => {},
      onAdd: () => {
        actions.push("add");
        return applied("new");
      },
      onRename: (id) => {
        actions.push("rename");
        return applied(id);
      },
      onHide: (id) => applied(id),
      onUnhide: (id) => applied(id),
    });
    tabs.update([...SHEETS, { id: "hidden", name: "Hidden", visibility: "hidden" }], "b");
    expect(host.querySelector('[aria-label="Add sheet"]')).toBeNull();
    expect(host.querySelector('[aria-label="Unhide sheet"]')).toBeNull();
    expect(host.querySelector(".sheetwrite-tab-options-button")).toBeNull();
    const buttons = tabButtons(host);
    expect(buttons.every((button) => !button.draggable)).toBe(true);
    buttons[1]!.focus();
    key(host, "F2");
    expect(host.querySelector("input")).toBeNull();
    key(host, "ArrowRight");
    expect(document.activeElement).toBe(buttons[2]!);

    tabs.setReadOnly(false);
    expect(host.querySelector('[aria-label="Add sheet"]')).not.toBeNull();
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    expect(host.querySelector("input")).not.toBeNull();
    tabs.setReadOnly(true);
    expect(host.querySelector("input")).toBeNull();
    expect(actions).toEqual([]);
  });

  it("surfaces a forbidden final-sheet hide outcome on the associated active tab", () => {
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onAdd: () => applied("new"),
      onRename: (id) => applied(id),
      onHide: (id) => rejected(id, "A workbook must keep one visible sheet", "last-visible-sheet"),
    });
    tabs.update([{ id: "only", name: "Only" }], "only");
    expect(tabButtons(host)).toHaveLength(1);
    expect(host.querySelector('[aria-label="Add sheet"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="Options for Only sheet"]')!.click();
    expect(host.querySelector('[aria-label="Rename Only sheet"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="Hide Only sheet"]')!.click();
    const tab = tabButtons(host)[0]!;
    const error = host.querySelector<HTMLElement>('[role="alert"]')!;
    expect(error.dataset.code).toBe("last-visible-sheet");
    expect(tab.getAttribute("aria-describedby")).toBe(error.id);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(
      host.querySelector<HTMLButtonElement>('[aria-label="Options for Only sheet"]'),
    );
  });

  it("associates applied lifecycle rejections with the ordinary Unhide control", () => {
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onUnhide: (id) => ({
        status: "applied",
        epoch: 2,
        transaction: { patches: [] },
        sheet: id,
        rejections: [
          {
            kind: "sheet-lifecycle",
            severity: "error",
            code: "sheet-not-found",
            sheet: id,
            operationIndex: 0,
            message: "The hidden sheet no longer exists",
          },
        ],
      }),
    });
    tabs.update(
      [
        { id: "visible", name: "Visible" },
        { id: "hidden", name: "Hidden", visibility: "hidden" },
      ],
      "visible",
    );
    let unhide = host.querySelector<HTMLElement>('[aria-label="Unhide sheet"]')!;
    host
      .querySelector<HTMLButtonElement>('[role="group"][aria-label="Hidden sheets"] button')!
      .click();

    unhide = host.querySelector<HTMLElement>('[aria-label="Unhide sheet"]')!;
    const error = host.querySelector<HTMLElement>('[role="alert"]')!;
    expect(unhide.getAttribute("aria-invalid")).toBe("true");
    expect(unhide.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.textContent).toBe("The hidden sheet no longer exists");
  });

  it("tears down deterministically during editing and ignores later controlled updates", () => {
    const renames: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onRename: (id, name) => {
        renames.push(`${id}:${name}`);
        return applied(id);
      },
    });
    tabs.update(SHEETS, "b");
    tabButtons(host)[1]!.focus();
    key(host, "F2");
    const detachedInput = host.querySelector<HTMLInputElement>("input")!;
    inputText(detachedInput, "Detached");

    tabs.destroy();
    tabs.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute("role")).toBe(false);
    expect(host.hasAttribute("aria-label")).toBe(false);
    key(detachedInput, "Enter");
    key(host, "F2");
    tabs.update(SHEETS, "b");
    expect(host.childElementCount).toBe(0);
    expect(renames).toEqual([]);
  });
});
