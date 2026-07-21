import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress } from "./types/coordinates.js";
import type {
  CellEditor,
  CellEditorContext,
  CellEditorInstance,
  CellEditorNavigation,
  CellEditorRect,
} from "./types/editor.js";
import type { Grid } from "./types/grid.js";

const NO_EDITOR_ERROR = Symbol("no-editor-error");

function reportCustomEditorError(error: unknown): void {
  const reporter = "reportError" in globalThis ? globalThis.reportError : undefined;
  if (typeof reporter === "function") {
    reporter(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

export interface CustomEditorState {
  grid: Grid;
  address: Readonly<CellAddress>;
  viewAddress: Readonly<CellAddress>;
  column: Readonly<Column>;
  value: CellScalar;
  text: string;
  initialInput: string | undefined;
  selectAll: boolean;
  label: string;
}

export interface BeginCustomEditorOptions extends CustomEditorState {
  editor: CellEditor;
  rect: CellEditorRect;
  onCommit: (value: string, navigation: CellEditorNavigation) => void;
  onCancel: () => void;
}

interface ActiveEditor {
  generation: number;
  abort: AbortController;
  wrapper: HTMLDivElement;
  instance: CellEditorInstance | null;
  state: CustomEditorState;
  rect: CellEditorRect;
  onCommit: BeginCustomEditorOptions["onCommit"];
  onCancel: BeginCustomEditorOptions["onCancel"];
  composing: boolean;
  tearingDown: boolean;
  commitPending: boolean;
}

/** Owns exactly one host-supplied editor instance and guards all late callbacks. */
export class CustomEditorController {
  private active: ActiveEditor | null = null;
  private generation = 0;

  constructor(private readonly host: HTMLElement) {}

  get isEditing(): boolean {
    return this.active !== null;
  }

  get editingCell(): { row: number; col: number } | null {
    const address = this.active?.state.viewAddress;
    return address ? { row: address.row, col: address.col } : null;
  }

  get editingAddress(): Readonly<CellAddress> | null {
    return this.active?.state.address ?? null;
  }

  begin(options: BeginCustomEditorOptions): void {
    this.cancel(false);

    const wrapper = document.createElement("div");
    wrapper.className = "sheetwrite-custom-editor";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", options.label);
    wrapper.style.position = "absolute";
    wrapper.style.zIndex = "6";
    wrapper.style.pointerEvents = "auto";

    const active: ActiveEditor = {
      generation: ++this.generation,
      abort: new AbortController(),
      wrapper,
      instance: null,
      state: {
        ...options,
        address: { ...options.address },
        viewAddress: { ...options.viewAddress },
      },
      rect: options.rect,
      onCommit: options.onCommit,
      onCancel: options.onCancel,
      composing: false,
      tearingDown: false,
      commitPending: false,
    };
    this.active = active;
    this.host.appendChild(wrapper);
    this.position(options.rect);

    wrapper.addEventListener("compositionstart", this.onCompositionStart);
    wrapper.addEventListener("compositionend", this.onCompositionEnd);
    wrapper.addEventListener("keydown", this.onKeyDown);
    wrapper.addEventListener("focusout", this.onFocusOut);

    const context = this.context(active);
    try {
      const instance = options.editor.mount(wrapper, context);
      if (this.active !== active) {
        try {
          instance.destroy();
        } catch (error) {
          reportCustomEditorError(error);
        }
        return;
      }
      active.instance = instance;
      instance.reposition(options.rect);
      this.focusEditor(active);
    } catch (error) {
      const teardownError = this.teardown(active);
      if (teardownError !== NO_EDITOR_ERROR) reportCustomEditorError(teardownError);
      throw error;
    }
  }

  /** Refresh external state after a transaction without replacing ownership. */
  update(
    state: Partial<Omit<CustomEditorState, "grid" | "address" | "initialInput" | "selectAll">>,
  ): void {
    const active = this.active;
    if (!active?.instance) return;
    active.state = { ...active.state, ...state };
    active.wrapper.setAttribute("aria-label", active.state.label);
    active.instance.update(this.context(active));
  }

  position(rect: CellEditorRect): void {
    const active = this.active;
    if (!active) return;
    active.rect = rect;
    active.wrapper.style.left = `${rect.x}px`;
    active.wrapper.style.top = `${rect.y}px`;
    active.wrapper.style.width = `${rect.width}px`;
    active.wrapper.style.minHeight = `${rect.height}px`;
    active.instance?.reposition(rect);
  }

  cancel(notify = true): void {
    const active = this.active;
    if (!active) return;
    active.abort.abort();
    let cancelError: unknown = NO_EDITOR_ERROR;
    try {
      active.instance?.cancel();
    } catch (error) {
      cancelError = error;
    }
    const teardownError = this.teardown(active);
    try {
      if (notify) active.onCancel();
    } finally {
      if (cancelError !== NO_EDITOR_ERROR) reportCustomEditorError(cancelError);
      if (teardownError !== NO_EDITOR_ERROR) reportCustomEditorError(teardownError);
    }
  }

  destroy(): void {
    this.cancel(false);
  }

  private context(active: ActiveEditor): CellEditorContext {
    const generation = active.generation;
    return {
      ...active.state,
      address: { ...active.state.address },
      viewAddress: { ...active.state.viewAddress },
      signal: active.abort.signal,
      commit: (value, navigation = "none") => {
        if (this.active?.generation !== generation || active.abort.signal.aborted) return;
        if (typeof value !== "string") {
          this.cancel();
          return;
        }
        this.finishCommit(active, value, navigation);
      },
      cancel: () => {
        if (this.active?.generation !== generation || active.abort.signal.aborted) return;
        this.cancel();
      },
    };
  }

  private focusEditor(active: ActiveEditor): void {
    const target = active.wrapper.querySelector<HTMLElement>(
      "input,textarea,select,button,[contenteditable=true],[tabindex]",
    );
    const focusTarget = target ?? active.wrapper;
    if (!target) active.wrapper.tabIndex = -1;
    if (!focusTarget.hasAttribute("aria-label") && !focusTarget.hasAttribute("aria-labelledby")) {
      focusTarget.setAttribute("aria-label", active.state.label);
    }
    focusTarget.focus({ preventScroll: true });
  }

  private requestCommit(active: ActiveEditor, navigation: CellEditorNavigation): void {
    if (
      this.active !== active ||
      active.abort.signal.aborted ||
      active.commitPending ||
      !active.instance
    ) {
      return;
    }

    let result: string | void | Promise<string | void>;
    try {
      result = active.instance.commit(navigation);
    } catch {
      this.cancel();
      return;
    }
    if (typeof result === "string") {
      this.finishCommit(active, result, navigation);
      return;
    }
    if (result === undefined) {
      this.cancel();
      return;
    }

    active.commitPending = true;
    active.wrapper.setAttribute("aria-busy", "true");
    void Promise.resolve(result).then(
      (value) => {
        if (this.active !== active || active.abort.signal.aborted) return;
        active.commitPending = false;
        active.wrapper.removeAttribute("aria-busy");
        if (typeof value === "string") this.finishCommit(active, value, navigation);
        else this.cancel();
      },
      () => {
        if (this.active !== active || active.abort.signal.aborted) return;
        active.commitPending = false;
        active.wrapper.removeAttribute("aria-busy");
        this.cancel();
      },
    );
  }

  private finishCommit(
    active: ActiveEditor,
    value: string,
    navigation: CellEditorNavigation,
  ): void {
    if (this.active !== active || active.abort.signal.aborted) return;
    const teardownError = this.teardown(active);
    try {
      active.onCommit(value, navigation);
    } finally {
      if (teardownError !== NO_EDITOR_ERROR) reportCustomEditorError(teardownError);
    }
  }

  private teardown(active: ActiveEditor): unknown {
    if (this.active !== active || active.tearingDown) return NO_EDITOR_ERROR;
    active.tearingDown = true;
    this.active = null;
    active.abort.abort();
    active.wrapper.removeEventListener("compositionstart", this.onCompositionStart);
    active.wrapper.removeEventListener("compositionend", this.onCompositionEnd);
    active.wrapper.removeEventListener("keydown", this.onKeyDown);
    active.wrapper.removeEventListener("focusout", this.onFocusOut);
    let error: unknown = NO_EDITOR_ERROR;
    try {
      active.instance?.destroy();
    } catch (caught) {
      error = caught;
    } finally {
      active.wrapper.remove();
      active.instance = null;
      active.tearingDown = false;
    }
    return error;
  }

  private readonly onCompositionStart = (): void => {
    if (this.active) this.active.composing = true;
  };

  private readonly onCompositionEnd = (): void => {
    if (this.active) this.active.composing = false;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const active = this.active;
    if (!active || active.composing || event.isComposing || event.defaultPrevented) return;
    let navigation: CellEditorNavigation | null = null;
    if (event.key === "Enter" && !event.shiftKey) navigation = "down";
    else if (event.key === "Tab") navigation = event.shiftKey ? "left" : "right";
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }
    if (!navigation || !active.instance) return;
    event.preventDefault();
    event.stopPropagation();
    this.requestCommit(active, navigation);
  };

  private readonly onFocusOut = (event: FocusEvent): void => {
    const active = this.active;
    if (!active || active.tearingDown || active.commitPending) return;
    if (event.relatedTarget instanceof Node && active.wrapper.contains(event.relatedTarget)) return;
    this.requestCommit(active, "none");
  };
}
