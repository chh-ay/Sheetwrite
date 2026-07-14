import type { EditNavigate, EditRect } from "./editor.js";
import type { CellScalar } from "./types/cell.js";
import type { DataValidationRule } from "./types/document.js";
import type { Theme } from "./types/render.js";

export interface BeginValidationEditOptions {
  row: number;
  col: number;
  rule: DataValidationRule;
  current: CellScalar;
  rect: EditRect;
  theme: Theme;
  onCommit: (value: CellScalar, navigate: EditNavigate) => void;
  onCancel: () => void;
}

function validationLabel(value: CellScalar): string {
  if (value === null) return "(blank)";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/** Accessible DOM overlay for list and checkbox validation rules. */
export class ValidationEditor {
  private readonly host: HTMLElement;
  private root: HTMLElement | null = null;
  private cell: { row: number; col: number } | null = null;
  private options: BeginValidationEditOptions | null = null;
  private values: readonly CellScalar[] = [];
  private activeIndex = 0;
  private checkboxValue: CellScalar = false;
  private typeahead = "";
  private typeaheadAt = 0;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get isEditing(): boolean {
    return this.root !== null;
  }

  get editingCell(): { row: number; col: number } | null {
    return this.cell;
  }

  begin(options: BeginValidationEditOptions): void {
    this.cancel(false);
    const condition = options.rule.condition;
    if (condition.kind !== "list" && condition.kind !== "checkbox") return;

    this.options = options;
    this.cell = { row: options.row, col: options.col };
    if (condition.kind === "list") this.beginList(options, condition.values);
    else this.beginCheckbox(options);
    this.position(options.rect);
    this.root?.focus();
  }

  position(rect: EditRect): void {
    const root = this.root;
    if (!root) return;
    root.style.left = `${rect.x}px`;
    root.style.top = `${rect.y + rect.h}px`;
    root.style.minWidth = `${Math.max(120, rect.w)}px`;
  }

  cancel(notify = true): void {
    const options = this.options;
    const root = this.root;
    this.root = null;
    this.cell = null;
    this.options = null;
    this.values = [];
    this.activeIndex = 0;
    this.typeahead = "";
    root?.remove();
    if (notify) options?.onCancel();
  }

  destroy(): void {
    this.cancel(false);
  }

  private beginList(options: BeginValidationEditOptions, values: readonly CellScalar[]): void {
    const root = document.createElement("div");
    root.className = "sheetwrite-validation-list";
    root.tabIndex = 0;
    root.setAttribute("role", "listbox");
    root.setAttribute("aria-label", options.rule.helpText || "Choose a value");
    root.style.setProperty("--sheetwrite-bg", options.theme.bg);
    root.style.setProperty("--sheetwrite-fg", options.theme.fg);
    root.style.setProperty("--sheetwrite-selection-border", options.theme.selectionBorder);

    this.values = values;
    const selected = values.findIndex((value) => Object.is(value, options.current));
    this.activeIndex = selected >= 0 ? selected : 0;
    for (let index = 0; index < values.length; index++) {
      const option = document.createElement("div");
      option.className = "sheetwrite-validation-option";
      option.id = `sheetwrite-validation-${options.row}-${options.col}-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this.activeIndex));
      option.textContent = validationLabel(values[index] ?? null);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => this.commitList(index, "none"));
      root.appendChild(option);
    }
    root.setAttribute(
      "aria-activedescendant",
      `sheetwrite-validation-${options.row}-${options.col}-${this.activeIndex}`,
    );
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("keydown", this.onListKeyDown);
    root.addEventListener("blur", this.onBlur);
    this.host.appendChild(root);
    this.root = root;
  }

  private beginCheckbox(options: BeginValidationEditOptions): void {
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkboxValue = Object.is(options.current, checked) ? checked : unchecked;

    const root = document.createElement("button");
    root.type = "button";
    root.className = "sheetwrite-validation-checkbox";
    root.setAttribute("role", "checkbox");
    root.setAttribute("aria-label", options.rule.helpText || "Toggle checkbox");
    root.style.setProperty("--sheetwrite-bg", options.theme.bg);
    root.style.setProperty("--sheetwrite-fg", options.theme.fg);
    root.style.setProperty("--sheetwrite-selection-border", options.theme.selectionBorder);
    this.renderCheckbox(root);
    root.addEventListener("click", () => {
      this.toggleCheckbox();
      this.commitCheckbox("none");
    });
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("keydown", this.onCheckboxKeyDown);
    root.addEventListener("blur", this.onBlur);
    this.host.appendChild(root);
    this.root = root;
  }

  private readonly onListKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") this.setActive(this.activeIndex + 1);
    else if (event.key === "ArrowUp") this.setActive(this.activeIndex - 1);
    else if (event.key === "Home") this.setActive(0);
    else if (event.key === "End") this.setActive(this.values.length - 1);
    else if (event.key === "Enter") this.commitList(this.activeIndex, "down");
    else if (event.key === "Tab")
      this.commitList(this.activeIndex, event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      this.typeahead = now - this.typeaheadAt > 700 ? event.key : this.typeahead + event.key;
      this.typeaheadAt = now;
      const needle = this.typeahead.toLocaleLowerCase();
      const index = this.values.findIndex((value) =>
        validationLabel(value).toLocaleLowerCase().startsWith(needle),
      );
      if (index >= 0) this.setActive(index);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onCheckboxKeyDown = (event: KeyboardEvent): void => {
    if (event.key === " " || event.key === "Spacebar") {
      this.toggleCheckbox();
      this.commitCheckbox("none");
    } else if (event.key === "Enter") this.commitCheckbox("down");
    else if (event.key === "Tab") this.commitCheckbox(event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onBlur = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && this.root?.contains(event.relatedTarget)) return;
    this.cancel();
  };

  private setActive(index: number): void {
    if (this.values.length === 0 || !this.root) return;
    this.activeIndex = (index + this.values.length) % this.values.length;
    const children = this.root.querySelectorAll<HTMLElement>("[role=option]");
    for (let current = 0; current < children.length; current++) {
      children[current]!.setAttribute("aria-selected", String(current === this.activeIndex));
    }
    const active = children[this.activeIndex];
    if (active) {
      this.root.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private commitList(index: number, navigate: EditNavigate): void {
    const value = this.values[index];
    const options = this.options;
    if (value === undefined || !options) return;
    this.cancel(false);
    options.onCommit(value, navigate);
  }

  private toggleCheckbox(): void {
    const options = this.options;
    const root = this.root;
    if (!options || !(root instanceof HTMLButtonElement)) return;
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkboxValue = Object.is(this.checkboxValue, checked) ? unchecked : checked;
    this.renderCheckbox(root);
  }

  private renderCheckbox(root: HTMLButtonElement): void {
    const options = this.options;
    if (options?.rule.condition.kind !== "checkbox") return;
    const checked = options.rule.condition.checkedValue ?? true;
    const isChecked = Object.is(this.checkboxValue, checked);
    root.setAttribute("aria-checked", String(isChecked));
    root.textContent = isChecked ? "✓" : "";
  }

  private commitCheckbox(navigate: EditNavigate): void {
    const options = this.options;
    if (!options) return;
    const value = this.checkboxValue;
    this.cancel(false);
    options.onCommit(value, navigate);
  }
}
