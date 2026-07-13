import { beforeEach, describe, expect, it } from "bun:test";
import { SheetTabs } from "../src/sheet-tabs.js";

const SHEETS = [
  { id: "a", name: "Sales" },
  { id: "b", name: "Sales" }, // duplicate display name on purpose
  { id: "c", name: "Summary" },
];

function tabsOf(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll("button")];
}

describe("SheetTabs", () => {
  let host: HTMLDivElement;
  let activated: string[];
  let tabs: SheetTabs;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    activated = [];
    tabs = new SheetTabs(host, { onActivate: (id) => activated.push(id) });
    tabs.update(SHEETS, "b");
  });

  it("renders a tablist and activates by id, not display text", () => {
    expect(host.getAttribute("role")).toBe("tablist");
    const buttons = tabsOf(host);
    expect(buttons.map((b) => b.textContent)).toEqual(["Sales", "Sales", "Summary"]);
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);

    // Clicking the FIRST "Sales" activates sheet "a", despite the shared name.
    buttons[0]!.click();
    expect(activated).toEqual(["a"]);
  });

  it("gives only the active tab a tab stop and roves focus with arrows", () => {
    const buttons = tabsOf(host);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);

    buttons[1]!.focus();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]!);
    expect(buttons[2]!.tabIndex).toBe(0);

    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]!);
  });

  it("re-renders from updated records and clears on destroy", () => {
    tabs.update([{ id: "only", name: "Only" }], "only");
    expect(tabsOf(host)).toHaveLength(1);
    expect(tabsOf(host)[0]!.getAttribute("aria-selected")).toBe("true");

    tabs.destroy();
    expect(tabsOf(host)).toHaveLength(0);
  });

  it("exposes accessible add, rename, remove, and reorder hooks", () => {
    const actions: string[] = [];
    tabs.destroy();
    tabs = new SheetTabs(host, {
      onActivate: () => {},
      onAdd: () => actions.push("add"),
      onRename: (id) => actions.push(`rename:${id}`),
      onRemove: (id) => actions.push(`remove:${id}`),
      onMove: (id, to) => actions.push(`move:${id}:${to}`),
    });
    tabs.update(SHEETS, "b");
    const buttons = tabsOf(host);
    expect(buttons.at(-1)?.getAttribute("aria-label")).toBe("Add sheet");
    buttons.at(-1)?.click();

    buttons[1]!.focus();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    host.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(actions).toEqual(["add", "rename:b", "remove:b", "move:b:2"]);
  });
});
