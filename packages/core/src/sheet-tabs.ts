// ── Sheet tab strip (internal shared primitive) ──────────────────────────────
//
// One controlled tablist implementation shared by the grid's built-in bottom
// bar and the spreadsheet shell, so the repo never grows a second tab
// convention. Controlled: the owner passes sheet records and the active id and
// receives `onActivate(id)`; the primitive never reads grid state or tab text.

/** One selectable sheet record; activation is by `id`, never by display name. */
export interface SheetTabRecord {
  id: string;
  name: string;
}

export interface SheetTabsOptions {
  onActivate: (id: string) => void;
  /** Accessible tablist label (default "Sheets"). */
  label?: string;
}

/**
 * Renders `role="tab"` buttons with `aria-selected` and a roving tabindex
 * (Left/Right/Home/End move focus) into the given host. `update` re-renders
 * from the latest records; unknown active ids simply select nothing.
 */
export class SheetTabs {
  private readonly host: HTMLElement;
  private readonly onActivate: (id: string) => void;
  private buttons: HTMLButtonElement[] = [];
  private ids: string[] = [];

  constructor(host: HTMLElement, options: SheetTabsOptions) {
    this.host = host;
    this.onActivate = options.onActivate;
    host.setAttribute("role", "tablist");
    host.setAttribute("aria-label", options.label ?? "Sheets");
    host.addEventListener("keydown", this.onKeydown);
  }

  update(sheets: readonly SheetTabRecord[], activeId: string): void {
    this.host.replaceChildren();
    this.buttons = [];
    this.ids = [];

    const focusIndex = Math.max(
      0,
      sheets.findIndex((sheet) => sheet.id === activeId),
    );

    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i]!;
      const active = sheet.id === activeId;

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = active ? "sheetwrite-tab sheetwrite-tab-active" : "sheetwrite-tab";
      tab.textContent = sheet.name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = i === focusIndex ? 0 : -1;

      const id = sheet.id;
      tab.addEventListener("click", () => this.onActivate(id));

      this.host.appendChild(tab);
      this.buttons.push(tab);
      this.ids.push(id);
    }
  }

  destroy(): void {
    this.host.removeEventListener("keydown", this.onKeydown);
    this.host.replaceChildren();
    this.buttons = [];
    this.ids = [];
  }

  /** Roving focus: Left/Right step, Home/End jump; Enter/Space use the button default. */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (this.buttons.length === 0) return;

    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement)) return;
    const current = this.buttons.indexOf(active);
    if (current === -1) return;

    let next: number;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(this.buttons.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = this.buttons.length - 1;
    else return;

    event.preventDefault();
    const target = this.buttons[next];
    if (!target || next === current) return;

    for (const button of this.buttons) button.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  };
}
