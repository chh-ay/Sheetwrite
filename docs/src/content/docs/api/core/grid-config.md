---
title: "GridConfig | @sheetwrite/core"
description: "Toolbar / feature configuration."
---
<!-- api-export:@sheetwrite/core|.|GridConfig -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Toolbar / feature configuration. When `config` is set the built-in toolbar is
shown; control flags default to `true` except the opt-in `export` flag.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L227</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>17</span>

<div class="api-member-list">

<details class="api-member" id="grid-config-toolbar" data-pagefind-weight="1">
<summary><code>toolbar</code> <span class="api-member-summary">Show the built-in toolbar (true), hide it (false), or supply a custom item list.</span></summary>

```ts generated
toolbar?: boolean | ToolbarItem[];
```

</details>

<details class="api-member" id="grid-config-bold" data-pagefind-weight="1">
<summary><code>bold</code> <span class="api-member-summary">Show the bold control in the default toolbar (default true).</span></summary>

```ts generated
bold?: boolean;
```

</details>

<details class="api-member" id="grid-config-italic" data-pagefind-weight="1">
<summary><code>italic</code> <span class="api-member-summary">Show the italic control in the default toolbar (default true).</span></summary>

```ts generated
italic?: boolean;
```

</details>

<details class="api-member" id="grid-config-align" data-pagefind-weight="1">
<summary><code>align</code> <span class="api-member-summary">Show left, center, and right alignment controls (default true).</span></summary>

```ts generated
align?: boolean;
```

</details>

<details class="api-member" id="grid-config-text-color" data-pagefind-weight="1">
<summary><code>textColor</code> <span class="api-member-summary">Show the text-color control in the default toolbar (default true).</span></summary>

```ts generated
textColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-fill-color" data-pagefind-weight="1">
<summary><code>fillColor</code> <span class="api-member-summary">Show the fill-color control in the default toolbar (default true).</span></summary>

```ts generated
fillColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-border" data-pagefind-weight="1">
<summary><code>border</code> <span class="api-member-summary">Show the border control in the default toolbar (default true).</span></summary>

```ts generated
border?: boolean;
```

</details>

<details class="api-member" id="grid-config-clear-format" data-pagefind-weight="1">
<summary><code>clearFormat</code> <span class="api-member-summary">Show the clear-format control in the default toolbar (default true).</span></summary>

```ts generated
clearFormat?: boolean;
```

</details>

<details class="api-member" id="grid-config-merge" data-pagefind-weight="1">
<summary><code>merge</code> <span class="api-member-summary">Show merge and unmerge controls in the default toolbar (default true).</span></summary>

```ts generated
merge?: boolean;
```

</details>

<details class="api-member" id="grid-config-sort" data-pagefind-weight="1">
<summary><code>sort</code> <span class="api-member-summary">Show ascending and descending sort controls in the default toolbar (default true).</span></summary>

```ts generated
sort?: boolean;
```

</details>

<details class="api-member" id="grid-config-export" data-pagefind-weight="1">
<summary><code>export</code> <span class="api-member-summary">Show CSV/XLSX export controls in the default toolbar (default false).</span></summary>

```ts generated
export?: boolean;
```

</details>

<details class="api-member" id="grid-config-icons" data-pagefind-weight="1">
<summary><code>icons</code> <span class="api-member-summary">Override built-in toolbar icons by action name.</span></summary>

```ts generated
icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
```

<p class="api-member-doc">Override built-in toolbar icons by action name. Strings render as plain text; DOM nodes/factories support SVG/HTML icons.</p>
</details>

<details class="api-member" id="grid-config-context-menu" data-pagefind-weight="1">
<summary><code>contextMenu</code> <span class="api-member-summary">Built-in menu, disabled menu, static rows, or a request-aware row factory.</span></summary>

```ts generated
contextMenu?: boolean | ContextMenuItems;
```

</details>

<details class="api-member" id="grid-config-undo" data-pagefind-weight="1">
<summary><code>undo</code> <span class="api-member-summary">Show undo/redo controls in the built-in toolbar (default true).</span></summary>

```ts generated
undo?: boolean;
```

</details>

<details class="api-member" id="grid-config-find" data-pagefind-weight="1">
<summary><code>find</code> <span class="api-member-summary">Built-in Ctrl+F find widget: enabled (true, default) or disabled (false).</span></summary>

```ts generated
find?: boolean;
```

</details>

<details class="api-member" id="grid-config-tabs" data-pagefind-weight="1">
<summary><code>tabs</code> <span class="api-member-summary">Bottom sheet-tab bar for multi-sheet workbooks (default true).</span></summary>

```ts generated
tabs?: boolean;
```

</details>

<details class="api-member" id="grid-config-keyboard" data-pagefind-weight="1">
<summary><code>keyboard</code> <span class="api-member-summary">Built-in keyboard handling.</span></summary>

```ts generated
keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
```

<p class="api-member-doc">Built-in keyboard handling. `true` (default) keeps the stock Sheets-style
bindings (navigation, type-to-edit, clipboard, undo/redo, find). `false`
disables ALL of them — the host owns key events and drives `grid.actions`,
selection, editing, and search primitives itself. A function is consulted
first and consumes the event by returning `true`; returning `false` falls
through to the stock bindings.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridConfig {
  toolbar?: boolean | ToolbarItem[];
  bold?: boolean;
  italic?: boolean;
  align?: boolean;
  textColor?: boolean;
  fillColor?: boolean;
  border?: boolean;
  clearFormat?: boolean;
  merge?: boolean;
  sort?: boolean;
  export?: boolean;
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
  contextMenu?: boolean | ContextMenuItems;
  undo?: boolean;
  find?: boolean;
  tabs?: boolean;
  keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
}
```

</details>
