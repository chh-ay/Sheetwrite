---
title: "SpreadsheetShell | @sheetwrite/core/shell"
description: "Disposable controller for the framework-neutral spreadsheet shell."
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Disposable controller for the framework-neutral spreadsheet shell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L34</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="spreadsheet-shell-grid" data-pagefind-weight="1">
<summary><code>grid</code> <span class="api-member-summary">The single grid the shell owns; use it for data, search, and actions.</span></summary>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="spreadsheet-shell-element" data-pagefind-weight="1">
<summary><code>element</code> <span class="api-member-summary">The shell's root element (already appended to the mount host).</span></summary>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code></summary>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-grid-config" data-pagefind-weight="1">
<summary><code>setGridConfig</code> <span class="api-member-summary">Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed.</span></summary>

```ts generated
setGridConfig(config: GridConfig | undefined): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-set-active-sheet" data-pagefind-weight="1">
<summary><code>setActiveSheet</code></summary>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="spreadsheet-shell-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SpreadsheetShell {
  readonly grid: Grid;
  readonly element: HTMLElement;
  setTheme(theme: Partial<Theme>): void;
  setReadOnly(readOnly: boolean): void;
  setGridConfig(config: GridConfig | undefined): void;
  setActiveSheet(id: SheetId): void;
  destroy(): void;
}
```

</details>
