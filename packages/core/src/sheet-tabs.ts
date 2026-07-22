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

function createTabIcon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("sheetwrite-tab-icon");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-width", "2");
  svg.appendChild(path);
  return svg;
}

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
  private readonly label: string;
  private readonly errorId = `sheetwrite-sheet-error-${++nextErrorId}`;
  private readonly menuId = `${this.errorId}-options`;

  private sheets: readonly SheetTabRecord[] = [];
  private activeId: SheetId = "";
  private focusedId: SheetId | null = null;
  private editing: RenameState | null = null;
  private menuSheetId: SheetId | null = null;
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
    this.label = options.label ?? "Sheets";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", `${this.label} controls`);
    host.addEventListener("keydown", this.onKeydown);
    host.addEventListener("focusout", this.onFocusOut);
  }

  /** Reconciles the controlled workbook records while preserving transient focus/editor state by ID. */
  update(sheets: readonly SheetTabRecord[], activeId: SheetId): void {
    if (this.destroyed) return;
    this.removeMenuDismissListeners();
    this.menuSheetId = null;

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
      this.removeMenuDismissListeners();
      this.menuSheetId = null;
    }
    this.render(hadFocus);
  }

  /** Idempotently removes DOM and every listener owned by the primitive. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rendering = true;
    this.host.removeEventListener("keydown", this.onKeydown);
    this.host.removeEventListener("focusout", this.onFocusOut);
    this.removeMenuDismissListeners();
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
    this.menuSheetId = null;
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
    const tabstrip = document.createElement("div");
    tabstrip.className = "sheetwrite-tabstrip";
    const tablist = document.createElement("div");
    tablist.className = "sheetwrite-tablist";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", this.label);
    let renameInput: HTMLInputElement | null = null;
    let activeOptions: HTMLElement | null = null;
    this.rendering = true;
    this.buttons = [];
    this.buttonIds = [];
    this.moveIndexes = [];

    for (let visibleIndex = 0; visibleIndex < visible.length; visibleIndex++) {
      const { sheet, workbookIndex } = visible[visibleIndex]!;
      const active = sheet.id === this.activeId;
      const editing = this.editing?.id === sheet.id;
      const item = document.createElement("div");
      item.className = "sheetwrite-tab-item";
      item.setAttribute("role", "presentation");
      if (editing) {
        renameInput = this.createRenameInput(sheet, active);
        const placeholder = this.createTab(sheet, active, workbookIndex);
        placeholder.classList.add("sheetwrite-tab-placeholder");
        placeholder.dataset.renamePlaceholder = sheet.id;
        placeholder.tabIndex = -1;
        item.appendChild(placeholder);
      } else {
        item.appendChild(this.createTab(sheet, active, workbookIndex));
        if (active && !this.readOnly && this.hasSheetOptions(visible.length)) {
          item.classList.add("sheetwrite-tab-item-with-options");
          activeOptions = this.createOptions(sheet, visible.length);
        }
      }
      tablist.appendChild(item);
    }

    tabstrip.appendChild(tablist);
    if (renameInput) tabstrip.appendChild(renameInput);
    if (activeOptions) tabstrip.appendChild(activeOptions);
    fragment.appendChild(tabstrip);

    if (!this.readOnly && this.onAdd) fragment.appendChild(this.createAddButton());
    if (!this.readOnly && this.onUnhide && hidden.length > 0) {
      fragment.appendChild(this.createUnhideSelect(hidden));
    }
    if (this.feedback) fragment.appendChild(this.createError(this.feedback));

    this.host.replaceChildren(fragment);
    if (renameInput) {
      const placeholder = this.host.querySelector<HTMLElement>(
        `[data-rename-placeholder="${CSS.escape(renameInput.dataset.sheetId ?? "")}"]`,
      );
      if (placeholder) {
        const stripRect = tabstrip.getBoundingClientRect();
        const placeholderRect = placeholder.getBoundingClientRect();
        renameInput.style.left = `${placeholderRect.left - stripRect.left}px`;
        renameInput.style.top = `${placeholderRect.top - stripRect.top}px`;
        renameInput.style.width = `${placeholderRect.width}px`;
        renameInput.style.height = `${placeholderRect.height}px`;
      }
    }
    if (activeOptions) {
      const activeTab = this.buttonFor(this.activeId);
      if (activeTab) {
        const stripRect = tabstrip.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        activeOptions.style.left = `${tabRect.right - stripRect.left - 28}px`;
        activeOptions.style.top = `${tabRect.top - stripRect.top}px`;
        activeOptions.style.width = "28px";
        activeOptions.style.height = `${tabRect.height}px`;
      }
    }
    this.rendering = false;

    const editedInput = this.host.querySelector<HTMLInputElement>(".sheetwrite-tab-input");
    const menu = this.host.querySelector<HTMLElement>(`#${this.menuId}`);
    const focusButton =
      this.buttonFor(this.focusedId) ?? this.buttonFor(this.activeId) ?? this.buttons[0];
    if (editedInput) {
      editedInput.focus();
      editedInput.setSelectionRange(0, editedInput.value.length);
      this.scrollIntoView(editedInput);
    } else if (menu) {
      this.positionMenu(menu);
      this.focusMenuItem(0);
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

  private hasSheetOptions(visibleCount: number): boolean {
    return (
      this.onRename !== undefined ||
      this.onHide !== undefined ||
      (this.onRemove !== undefined && visibleCount > 1)
    );
  }

  private createOptions(sheet: SheetTabRecord, visibleCount: number): HTMLElement {
    const options = document.createElement("span");
    options.className = "sheetwrite-tab-options";
    options.dataset.sheetId = sheet.id;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = `${this.menuId}-trigger`;
    trigger.className = "sheetwrite-tab-options-button";
    trigger.setAttribute("aria-label", `Options for ${sheet.name} sheet`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", String(this.menuSheetId === sheet.id));
    trigger.setAttribute("aria-controls", this.menuId);
    trigger.appendChild(createTabIcon("M4 10h.01M10 10h.01M16 10h.01"));
    trigger.addEventListener("click", () => {
      if (this.menuSheetId === sheet.id) this.closeMenu(true);
      else this.openMenu(sheet.id);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      event.stopPropagation();
      this.openMenu(sheet.id, event.key === "ArrowUp");
    });
    options.appendChild(trigger);

    if (this.menuSheetId === sheet.id) {
      const menu = document.createElement("div");
      menu.id = this.menuId;
      menu.className = "sheetwrite-tab-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `${sheet.name} sheet options`);

      if (this.onRename) {
        menu.appendChild(
          this.createMenuItem("Rename", `Rename ${sheet.name} sheet`, "F2", () => {
            this.clearMenuState();
            this.startRename(sheet.id);
          }),
        );
      }
      if (this.onHide) {
        menu.appendChild(
          this.createMenuItem("Hide", `Hide ${sheet.name} sheet`, "Control+Shift+H", () => {
            this.clearMenuState();
            this.focusedId = sheet.id;
            this.performLifecycle(sheet.id, () => this.onHide!(sheet.id), true);
          }),
        );
      }
      if (this.onRemove && visibleCount > 1) {
        menu.appendChild(
          this.createMenuItem(
            "Remove",
            `Remove ${sheet.name} sheet`,
            "Delete",
            () => {
              this.clearMenuState();
              this.focusedId = sheet.id;
              this.performLifecycle(sheet.id, () => this.onRemove!(sheet.id), true);
            },
            true,
          ),
        );
      }
      options.appendChild(menu);
    }
    return options;
  }

  private createMenuItem(
    text: string,
    label: string,
    shortcut: string,
    action: () => void,
    destructive = false,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = destructive
      ? "sheetwrite-tab-menu-item sheetwrite-tab-menu-item-destructive"
      : "sheetwrite-tab-menu-item";
    button.textContent = text;
    button.tabIndex = -1;
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-keyshortcuts", shortcut);
    button.addEventListener("click", action);
    return button;
  }

  private createAddButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-tab-add";
    button.appendChild(createTabIcon("M10 4v12M4 10h12"));
    button.setAttribute("aria-label", "Add sheet");
    button.title = "Add sheet";
    button.setAttribute("aria-keyshortcuts", "Shift+F11");
    button.addEventListener("click", () => this.performLifecycle(this.activeId, this.onAdd!));
    return button;
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

  private openMenu(id: SheetId, focusLast = false): void {
    if (this.destroyed || this.readOnly || id !== this.activeId) return;
    if (!this.visibleSheets().some(({ sheet }) => sheet.id === id)) return;
    this.menuSheetId = id;
    this.render();
    if (focusLast) this.focusMenuItem(-1);
    this.addMenuDismissListeners();
  }

  private clearMenuState(): SheetId | null {
    const id = this.menuSheetId;
    this.menuSheetId = null;
    this.removeMenuDismissListeners();
    return id;
  }

  private closeMenu(restoreFocus: boolean): void {
    const id = this.clearMenuState();
    if (!id) return;
    this.host.querySelector<HTMLElement>(`#${this.menuId}`)?.remove();
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus && trigger?.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId === id) {
      trigger.focus();
    }
  }

  private focusMenuItem(index: number): void {
    const menu = this.host.querySelector<HTMLElement>(`#${this.menuId}`);
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    if (items.length === 0) return;
    const targetIndex = (index + items.length) % items.length;
    for (let current = 0; current < items.length; current++) {
      items[current]!.tabIndex = current === targetIndex ? 0 : -1;
    }
    items[targetIndex]!.focus();
  }

  private positionMenu(menu: HTMLElement): void {
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(0, Math.min(triggerRect.left, window.innerWidth - menuRect.width));
    const below = triggerRect.bottom + menuRect.height <= window.innerHeight;
    const top = below ? triggerRect.bottom : Math.max(0, triggerRect.top - menuRect.height);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  private addMenuDismissListeners(): void {
    document.addEventListener("pointerdown", this.onOutsideInteraction, true);
    document.addEventListener("focusin", this.onOutsideInteraction, true);
    window.addEventListener("scroll", this.onMenuViewportChange, true);
    window.addEventListener("resize", this.onMenuViewportChange);
  }

  private removeMenuDismissListeners(): void {
    document.removeEventListener("pointerdown", this.onOutsideInteraction, true);
    document.removeEventListener("focusin", this.onOutsideInteraction, true);
    window.removeEventListener("scroll", this.onMenuViewportChange, true);
    window.removeEventListener("resize", this.onMenuViewportChange);
  }

  private readonly onOutsideInteraction = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    const options = this.host.querySelector<HTMLElement>(".sheetwrite-tab-options");
    if (!options?.contains(target)) this.closeMenu(false);
  };

  private readonly onMenuViewportChange = (): void => {
    this.closeMenu(false);
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    if (this.rendering || !this.menuSheetId) return;
    const next = event.relatedTarget;
    const options = this.host.querySelector<HTMLElement>(".sheetwrite-tab-options");
    if (!(next instanceof Node) || !options?.contains(next)) this.closeMenu(false);
  };

  private performLifecycle(
    id: SheetId,
    operation: () => SheetLifecycleResult,
    restoreOptions = false,
  ): void {
    if (this.destroyed || this.readOnly) return;
    this.clearMenuState();
    const result = operation();
    const feedback = feedbackFrom(result);
    this.feedback = feedback ? { sheet: id || result.sheet, ...feedback } : null;
    this.render(restoreOptions || this.host.contains(document.activeElement));
    if (!restoreOptions) return;
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    if (trigger?.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId === id) trigger.focus();
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
    const active = document.activeElement;
    if (this.menuSheetId) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
        return;
      }
      if (active instanceof HTMLButtonElement && active.getAttribute("role") === "menuitem") {
        const items = [
          ...this.host.querySelectorAll<HTMLButtonElement>(`#${this.menuId} [role="menuitem"]`),
        ];
        const current = items.indexOf(active);
        let next: number | null = null;
        if (event.key === "ArrowDown") next = current + 1;
        else if (event.key === "ArrowUp") next = current - 1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          this.focusMenuItem(next);
          return;
        }
      }
    }

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
