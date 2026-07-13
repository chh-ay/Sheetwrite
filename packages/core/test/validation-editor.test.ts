import { afterEach, describe, expect, it } from "bun:test";
import { DEFAULT_THEME } from "../src/grid.js";
import type { CellScalar, DataValidationRule } from "../src/types.js";
import { ValidationEditor } from "../src/validation-editor.js";

const rect = { x: 20, y: 30, w: 120, h: 28 };
const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } };

function listRule(): DataValidationRule {
  return {
    id: "status",
    range,
    condition: { kind: "list", values: ["Alpha", "Beta", "Gamma"] },
    policy: "reject",
    helpText: "Choose a status",
  };
}

function host(): HTMLDivElement {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ValidationEditor", () => {
  it("exposes an ARIA listbox and commits arrow-key selection with Enter", () => {
    const editor = new ValidationEditor(host());
    const commits: Array<{ value: CellScalar; navigate: string }> = [];
    editor.begin({
      row: 0,
      col: 0,
      rule: listRule(),
      current: "Alpha",
      rect,
      theme: DEFAULT_THEME,
      onCommit: (value, navigate) => commits.push({ value, navigate }),
      onCancel: () => {},
    });

    const list = document.querySelector<HTMLElement>('[role="listbox"]');
    expect(list?.getAttribute("aria-label")).toBe("Choose a status");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(commits).toEqual([{ value: "Beta", navigate: "down" }]);
    expect(editor.isEditing).toBe(false);
    editor.destroy();
  });

  it("supports typeahead, Tab commit, and Escape cancellation", () => {
    const editor = new ValidationEditor(host());
    const commits: Array<{ value: CellScalar; navigate: string }> = [];
    let cancels = 0;
    const begin = () =>
      editor.begin({
        row: 0,
        col: 0,
        rule: listRule(),
        current: "Alpha",
        rect,
        theme: DEFAULT_THEME,
        onCommit: (value, navigate) => commits.push({ value, navigate }),
        onCancel: () => {
          cancels++;
        },
      });

    begin();
    let list = document.querySelector<HTMLElement>('[role="listbox"]');
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(commits).toEqual([{ value: "Gamma", navigate: "right" }]);

    begin();
    list = document.querySelector<HTMLElement>('[role="listbox"]');
    list?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(commits).toHaveLength(1);
    expect(cancels).toBe(1);
    editor.destroy();
  });

  it("renders a keyboard-toggleable checkbox with checked state", () => {
    const editor = new ValidationEditor(host());
    const commits: CellScalar[] = [];
    editor.begin({
      row: 1,
      col: 0,
      rule: {
        id: "done",
        range,
        condition: { kind: "checkbox", checkedValue: "yes", uncheckedValue: "no" },
        policy: "reject",
      },
      current: "no",
      rect,
      theme: DEFAULT_THEME,
      onCommit: (value) => commits.push(value),
      onCancel: () => {},
    });

    const checkbox = document.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute("aria-checked")).toBe("false");
    checkbox?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(commits).toEqual(["yes"]);
    editor.destroy();
  });
});
