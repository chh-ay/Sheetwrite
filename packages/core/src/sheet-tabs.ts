import type { SheetId } from "./types/coordinates.js";
import type { SheetLifecycleResult } from "./types/grid.js";

/** One selectable sheet record; activation is by `id`, never by display name. */
export interface SheetTabRecord {
  id: SheetId;
  name: string;
  visibility?: "visible" | "hidden" | "veryHidden";
}

export interface SheetTabsOptions {
  onActivate: (id: SheetId) => void;
  onAdd?: () => SheetLifecycleResult;
  onRemove?: (id: SheetId) => SheetLifecycleResult;
  onRename?: (id: SheetId, name: string) => SheetLifecycleResult;
  onMove?: (id: SheetId, toIndex: number) => SheetLifecycleResult;
  onHide?: (id: SheetId) => SheetLifecycleResult;
  onUnhide?: (id: SheetId) => SheetLifecycleResult;
  /** Accessible tablist label (default "Sheets"). */
  label?: string;
  /** Suppresses document lifecycle affordances while retaining navigation. */
  readOnly?: boolean;
}

interface VisibleSheet {
  readonly sheet: SheetTabRecord;
  readonly workbookIndex: number;
}

interface RenameState {
  readonly id: SheetId;
  draft: string;
  sourceName: string;
  composing: boolean;
}

interface LifecycleFeedback {
  readonly sheet: SheetId;
  readonly message: string;
  readonly code?: string;
}

let nextErrorId = 0;

function feedbackFrom(result: SheetLifecycleResult): Omit<LifecycleFeedback, "sheet"> | null {
  const issues =
    result.status === "rejected"
      ? result.issues
      : result.status === "applied"
        ? result.rejections
        : undefined;
  const issue = issues?.find((candidate) => candidate.kind === "sheet-lifecycle");
  if (!issue) return null;
  return {
    message: issue.message,
    ...(typeof issue.code === "string" ? { code: issue.code } : {}),
  };
}

/**
 * Controlled worksheet tab strip shared by Grid and the spreadsheet shell.
 * Document lifecycle callbacks are synchronous so rejected operations can keep
 * inline rename focused and expose their structured error without a prompt.
 */
export class SheetTabs {
  private readonly host: HTMLElement;
  private readonly onActivate: (id: SheetId) => void;
  private readonly onAdd?: () => SheetLifecycleResult;
  private readonly onRemove?: (id: SheetId) => SheetLifecycleResult;
  private readonly onRename?: (id: SheetId, name: string) => SheetLifecycleResult;
  private readonly onMove?: (id: SheetId, toIndex: number) => SheetLifecycleResult;
  private readonly onHide?: (id: SheetId) => SheetLifecycleResult;
  private readonly onUnhide?: (id: SheetId) => SheetLifecycleResult;
  private readonly errorId = `sheetwrite-sheet-error-${++nextErrorId}`;

  private sheets: readonly SheetTabRecord[] = [];
  private activeId: SheetId = "";
  private focusedId: SheetId | null = null;
  private editing: RenameState | null = null;
  private feedback: LifecycleFeedback | null = null;
  private buttons: HTMLButtonElement[] = [];
  private buttonIds: SheetId[] = [];
  private moveIndexes: number[] = [];
  private draggedId: SheetId | null = null;
  private readOnly: boolean;
  private rendering = false;
  private destroyed = false;

  constructor(host: HTMLElement, options: SheetTabsOptions) {
    this.host = host;
    this.onActivate = options.onActivate;
    this.onAdd = options.onAdd;
    this.onRemove = options.onRemove;
    this.onRename = options.onRename;
    this.onMove = options.onMove;
    this.onHide = options.onHide;
    this.onUnhide = options.onUnhide;
    this.readOnly = options.readOnly ?? false;
    host.setAttribute("role", "tablist");
    host.setAttribute("aria-label", options.label ?? "Sheets");
    host.addEventListener("keydown", this.onKeydown);
  }

  /** Reconciles the controlled workbook records while preserving transient focus/editor state by ID. */
  update(sheets: readonly SheetTabRecord[], activeId: SheetId): void {
    if (this.destroyed) return;

    const oldVisible = this.visibleSheets();
    const oldFocusIndex = oldVisible.findIndex(({ sheet }) => sheet.id === this.focusedId);
    const oldEditIndex = oldVisible.findIndex(({ sheet }) => sheet.id === this.editing?.id);
    const hadFocus = this.host.contains(document.activeElement);
    const focusedElementId = this.sheetIdOf(document.activeElement);
    if (focusedElementId) this.focusedId = focusedElementId;

    this.sheets = sheets;
    this.activeId = activeId;
    const visible = this.visibleSheets();

    if (this.editing) {
      const current = visible.find(({ sheet }) => sheet.id === this.editing?.id)?.sheet;
      if (!current) {
        this.editing = null;
        this.feedback = null;
        this.focusedId = this.neighborAt(visible, oldEditIndex);
      } else {
        if (this.editing.draft === this.editing.sourceName) this.editing.draft = current.name;
        this.editing.sourceName = current.name;
      }
    }

    if (this.feedback && !sheets.some((sheet) => sheet.id === this.feedback?.sheet)) {
      this.feedback = null;
    }
    if (!visible.some(({ sheet }) => sheet.id === this.focusedId)) {
      this.focusedId = this.neighborAt(visible, oldFocusIndex);
    }
    if (!this.focusedId) {
      this.focusedId = visible.some(({ sheet }) => sheet.id === activeId)
        ? activeId
        : (visible[0]?.sheet.id ?? null);
    }

    this.render(hadFocus || this.editing !== null);
  }

  /** Changes mutation availability without rebuilding the owner or losing controlled sheet state. */
  setReadOnly(readOnly: boolean): void {
    if (this.destroyed || this.readOnly === readOnly) return;
    const hadFocus = this.host.contains(document.activeElement);
    this.readOnly = readOnly;
    if (readOnly) {
      this.editing = null;
      this.feedback = null;
    }
    this.render(hadFocus);
  }

  /** Idempotently removes DOM and every listener owned by the primitive. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rendering = true;
    this.host.removeEventListener("keydown", this.onKeydown);
    this.host.replaceChildren();
    this.host.removeAttribute("role");
    this.host.removeAttribute("aria-label");
    this.rendering = false;
    this.sheets = [];
    this.buttons = [];
    this.buttonIds = [];
    this.moveIndexes = [];
    this.editing = null;
    this.feedback = null;
    this.focusedId = null;
    this.draggedId = null;
  }

  private visibleSheets(): VisibleSheet[] {
    const visible: VisibleSheet[] = [];
    for (let workbookIndex = 0; workbookIndex < this.sheets.length; workbookIndex++) {
      const sheet = this.sheets[workbookIndex]!;
      if (sheet.visibility === "hidden" || sheet.visibility === "veryHidden") continue;
      visible.push({ sheet, workbookIndex });
    }
    return visible;
  }

  private hiddenSheets(): readonly SheetTabRecord[] {
    return this.sheets.filter((sheet) => sheet.visibility === "hidden");
  }

  private neighborAt(visible: readonly VisibleSheet[], previousIndex: number): SheetId | null {
    if (visible.length === 0) return null;
    const index = previousIndex < 0 ? 0 : Math.min(previousIndex, visible.length - 1);
    return visible[index]!.sheet.id;
  }

  private sheetIdOf(element: Element | null): SheetId | null {
    if (!(element instanceof HTMLElement) || !this.host.contains(element)) return null;
    return element.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId ?? null;
  }

  private render(forceFocus = false): void {
    if (this.destroyed) return;
    const restoreFocus = forceFocus || this.host.contains(document.activeElement);
    const visible = this.visibleSheets();
    const hidden = this.hiddenSheets();
    const fragment = document.createDocumentFragment();
    this.rendering = true;
    this.buttons = [];
    this.buttonIds = [];
    this.moveIndexes = [];

    for (let visibleIndex = 0; visibleIndex < visible.length; visibleIndex++) {
      const { sheet, workbookIndex } = visible[visibleIndex]!;
      const active = sheet.id === this.activeId;
      const editing = this.editing?.id === sheet.id;

      if (editing) {
        fragment.appendChild(this.createRenameInput(sheet, active));
      } else {
        fragment.appendChild(this.createTab(sheet, active, workbookIndex));
      }

      if (active && !editing && !this.readOnly) {
        const actions = this.createActions(sheet, visible, visibleIndex);
        if (actions.childElementCount > 0) fragment.appendChild(actions);
      }
    }

    if (!this.readOnly && this.onAdd) fragment.appendChild(this.createAddButton());
    if (!this.readOnly && this.onUnhide && hidden.length > 0) {
      fragment.appendChild(this.createUnhideSelect(hidden));
    }
    if (this.feedback) fragment.appendChild(this.createError(this.feedback));

    this.host.replaceChildren(fragment);
    this.rendering = false;

    const editedInput = this.host.querySelector<HTMLInputElement>(".sheetwrite-tab-input");
    const focusButton =
      this.buttonFor(this.focusedId) ?? this.buttonFor(this.activeId) ?? this.buttons[0];
    if (editedInput) {
      editedInput.focus();
      editedInput.setSelectionRange(0, editedInput.value.length);
      this.scrollIntoView(editedInput);
    } else if (restoreFocus && focusButton) {
      this.setRovingFocus(focusButton);
      focusButton.focus();
      this.scrollIntoView(focusButton);
    }

    const activeButton = this.buttonFor(this.activeId);
    if (activeButton && activeButton !== focusButton) this.scrollIntoView(activeButton);
    if (!editedInput && focusButton) this.scrollIntoView(focusButton);
  }

  private createTab(
    sheet: SheetTabRecord,
    active: boolean,
    workbookIndex: number,
  ): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = active ? "sheetwrite-tab sheetwrite-tab-active" : "sheetwrite-tab";
    tab.textContent = sheet.name;
    tab.dataset.sheetId = sheet.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-label", `${sheet.name} sheet`);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    if (this.feedback?.sheet === sheet.id) tab.setAttribute("aria-describedby", this.errorId);
    tab.tabIndex = sheet.id === this.focusedId ? 0 : -1;
    tab.draggable = !this.readOnly && this.onMove !== undefined;

    tab.addEventListener("focus", () => {
      this.focusedId = sheet.id;
      this.setRovingFocus(tab);
      this.scrollIntoView(tab);
    });
    tab.addEventListener("click", () => {
      this.focusedId = sheet.id;
      this.feedback = null;
      this.onActivate(sheet.id);
    });
    if (!this.readOnly && this.onRename) {
      tab.addEventListener("dblclick", (event) => {
        event.preventDefault();
        this.startRename(sheet.id);
      });
    }
    if (tab.draggable) {
      tab.addEventListener("dragstart", (event) => {
        this.draggedId = sheet.id;
        event.dataTransfer?.setData("text/plain", sheet.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      tab.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      tab.addEventListener("drop", (event) => {
        event.preventDefault();
        const dragged = this.draggedId ?? event.dataTransfer?.getData("text/plain") ?? null;
        this.draggedId = null;
        if (!dragged || dragged === sheet.id) return;
        this.focusedId = dragged;
        this.performLifecycle(dragged, () => this.onMove!(dragged, workbookIndex));
      });
      tab.addEventListener("dragend", () => {
        this.draggedId = null;
      });
    }

    this.buttons.push(tab);
    this.buttonIds.push(sheet.id);
    this.moveIndexes.push(workbookIndex);
    return tab;
  }

  private createRenameInput(sheet: SheetTabRecord, active: boolean): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = active
      ? "sheetwrite-tab sheetwrite-tab-active sheetwrite-tab-input"
      : "sheetwrite-tab sheetwrite-tab-input";
    input.value = this.editing?.draft ?? sheet.name;
    input.dataset.sheetId = sheet.id;
    input.setAttribute("aria-label", `Rename ${sheet.name} sheet`);
    if (this.feedback?.sheet === sheet.id) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", this.errorId);
    }
    input.addEventListener("input", () => {
      if (this.editing?.id === sheet.id) this.editing.draft = input.value;
    });
    input.addEventListener("compositionstart", () => {
      if (this.editing?.id === sheet.id) this.editing.composing = true;
    });
    input.addEventListener("compositionend", () => {
      if (this.editing?.id === sheet.id) {
        this.editing.composing = false;
        this.editing.draft = input.value;
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (event.isComposing || this.editing?.composing) return;
        event.preventDefault();
        event.stopPropagation();
        this.commitRename();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelRename();
      }
    });
    input.addEventListener("blur", () => {
      if (this.rendering || this.destroyed || this.editing?.composing) return;
      this.commitRename();
    });
    return input;
  }

  private createActions(
    sheet: SheetTabRecord,
    visible: readonly VisibleSheet[],
    visibleIndex: number,
  ): HTMLElement {
    const actions = document.createElement("span");
    actions.className = "sheetwrite-tab-actions";
    actions.dataset.sheetId = sheet.id;
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", `${sheet.name} sheet actions`);

    if (this.onRename) {
      actions.appendChild(
        this.actionButton("Rename", `Rename ${sheet.name} sheet`, "F2", () =>
          this.startRename(sheet.id),
        ),
      );
    }
    if (this.onMove && visibleIndex > 0) {
      const to = visible[visibleIndex - 1]!.workbookIndex;
      actions.appendChild(
        this.actionButton("←", `Move ${sheet.name} sheet left`, "Control+Shift+ArrowLeft", () => {
          this.focusedId = sheet.id;
          this.performLifecycle(sheet.id, () => this.onMove!(sheet.id, to));
        }),
      );
    }
    if (this.onMove && visibleIndex + 1 < visible.length) {
      const to = visible[visibleIndex + 1]!.workbookIndex;
      actions.appendChild(
        this.actionButton("→", `Move ${sheet.name} sheet right`, "Control+Shift+ArrowRight", () => {
          this.focusedId = sheet.id;
          this.performLifecycle(sheet.id, () => this.onMove!(sheet.id, to));
        }),
      );
    }
    if (this.onHide) {
      actions.appendChild(
        this.actionButton("Hide", `Hide ${sheet.name} sheet`, "Control+Shift+H", () => {
          this.focusedId = sheet.id;
          this.performLifecycle(sheet.id, () => this.onHide!(sheet.id));
        }),
      );
    }
    if (this.onRemove && visible.length > 1) {
      actions.appendChild(
        this.actionButton("×", `Remove ${sheet.name} sheet`, "Delete", () => {
          this.focusedId = sheet.id;
          this.performLifecycle(sheet.id, () => this.onRemove!(sheet.id));
        }),
      );
    }
    return actions;
  }

  private actionButton(
    text: string,
    label: string,
    shortcut: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-tab-close";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-keyshortcuts", shortcut);
    button.addEventListener("click", action);
    return button;
  }

  private createAddButton(): HTMLButtonElement {
    return this.actionButton("+", "Add sheet", "Shift+F11", () =>
      this.performLifecycle(this.activeId, this.onAdd!),
    );
  }

  private createUnhideSelect(hidden: readonly SheetTabRecord[]): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "sheetwrite-tab-unhide";
    select.setAttribute("aria-label", "Unhide sheet");
    select.setAttribute("aria-keyshortcuts", "Control+Shift+U");
    if (this.feedback && hidden.some((sheet) => sheet.id === this.feedback?.sheet)) {
      select.setAttribute("aria-invalid", "true");
      select.setAttribute("aria-describedby", this.errorId);
    }
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Unhide…";
    select.appendChild(placeholder);
    for (const sheet of hidden) {
      const option = document.createElement("option");
      option.value = sheet.id;
      option.textContent = sheet.name;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const id = select.value;
      if (!id) return;
      this.focusedId = id;
      this.performLifecycle(id, () => this.onUnhide!(id));
    });
    return select;
  }

  private createError(feedback: LifecycleFeedback): HTMLElement {
    const error = document.createElement("span");
    error.id = this.errorId;
    error.className = "sheetwrite-tab-error";
    error.dataset.code = feedback.code ?? "sheet-lifecycle";
    error.setAttribute("role", "alert");
    error.textContent = feedback.message;
    return error;
  }

  private startRename(id: SheetId): void {
    if (this.destroyed || this.readOnly || !this.onRename) return;
    const sheet = this.sheets.find((candidate) => candidate.id === id);
    if (!sheet || sheet.visibility === "hidden" || sheet.visibility === "veryHidden") return;
    this.focusedId = id;
    this.feedback = null;
    this.editing = { id, draft: sheet.name, sourceName: sheet.name, composing: false };
    this.render(true);
  }

  private cancelRename(): void {
    if (!this.editing) return;
    const id = this.editing.id;
    this.editing = null;
    this.feedback = null;
    this.focusedId = id;
    this.render(true);
  }

  private commitRename(): void {
    const editing = this.editing;
    if (!editing || this.readOnly || !this.onRename) return;
    if (editing.draft === editing.sourceName) {
      this.cancelRename();
      return;
    }

    const result = this.onRename(editing.id, editing.draft);
    const feedback = feedbackFrom(result);
    if (feedback) {
      this.feedback = { sheet: editing.id, ...feedback };
    } else {
      this.feedback = null;
    }
    if (!feedback && (result.status === "applied" || result.status === "noop")) this.editing = null;
    this.focusedId = editing.id;
    this.render(true);
  }

  private performLifecycle(id: SheetId, operation: () => SheetLifecycleResult): void {
    if (this.destroyed || this.readOnly) return;
    const result = operation();
    const feedback = feedbackFrom(result);
    this.feedback = feedback ? { sheet: id || result.sheet, ...feedback } : null;
    this.render(this.host.contains(document.activeElement));
  }

  private buttonFor(id: SheetId | null): HTMLButtonElement | undefined {
    if (id === null) return undefined;
    const index = this.buttonIds.indexOf(id);
    return index < 0 ? undefined : this.buttons[index];
  }

  private setRovingFocus(target: HTMLButtonElement): void {
    for (const button of this.buttons) button.tabIndex = button === target ? 0 : -1;
  }

  private scrollIntoView(element: HTMLElement): void {
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.host.contains(document.activeElement)) return;

    if (!this.readOnly && event.shiftKey && event.key === "F11" && this.onAdd) {
      event.preventDefault();
      this.performLifecycle(this.activeId, this.onAdd);
      return;
    }
    if (
      !this.readOnly &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "u" &&
      this.onUnhide
    ) {
      const hidden = this.hiddenSheets();
      if (hidden.length === 1) {
        event.preventDefault();
        this.performLifecycle(hidden[0]!.id, () => this.onUnhide!(hidden[0]!.id));
      } else if (hidden.length > 1) {
        event.preventDefault();
        this.host.querySelector<HTMLSelectElement>(".sheetwrite-tab-unhide")?.focus();
      }
      return;
    }

    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement) || active.getAttribute("role") !== "tab") return;
    const current = this.buttons.indexOf(active);
    if (current < 0) return;
    const id = this.buttonIds[current]!;

    if (!this.readOnly) {
      if (event.key === "F2" && this.onRename) {
        event.preventDefault();
        this.startRename(id);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && this.onRemove) {
        event.preventDefault();
        this.performLifecycle(id, () => this.onRemove!(id));
        return;
      }
      if (
        event.shiftKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "h" &&
        this.onHide
      ) {
        event.preventDefault();
        this.performLifecycle(id, () => this.onHide!(id));
        return;
      }
      if (event.shiftKey && (event.ctrlKey || event.metaKey) && this.onMove) {
        const targetVisibleIndex =
          event.key === "ArrowLeft"
            ? Math.max(0, current - 1)
            : event.key === "ArrowRight"
              ? Math.min(this.buttons.length - 1, current + 1)
              : null;
        const to =
          targetVisibleIndex === null ? null : (this.moveIndexes[targetVisibleIndex] ?? null);
        if (to !== null && to !== this.moveIndexes[current]) {
          event.preventDefault();
          this.performLifecycle(id, () => this.onMove!(id, to));
          return;
        }
      }
    }

    let next: number;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(this.buttons.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = this.buttons.length - 1;
    else return;

    event.preventDefault();
    const target = this.buttons[next];
    if (!target || target === active) return;
    this.focusedId = this.buttonIds[next]!;
    this.setRovingFocus(target);
    target.focus();
    this.scrollIntoView(target);
  };
}
