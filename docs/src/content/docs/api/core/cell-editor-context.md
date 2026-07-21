---
title: "CellEditorContext | @sheetwrite/core"
description: "Immutable state and guarded completion callbacks for one mounted editor."
---
<!-- api-export:@sheetwrite/core|.|CellEditorContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable state and guarded completion callbacks for one mounted editor.
`address` is the canonical data address; `viewAddress` is the current visual
row/column. Async work must use `signal` so reset, cancel, and unmount abort it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/editor.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>12</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-context-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>

```ts generated
readonly grid: Grid;
```

</details>

<details class="api-member" id="cell-editor-context-address" data-pagefind-weight="1">
<summary><code>address</code></summary>

```ts generated
readonly address: CellAddress;
```

</details>

<details class="api-member" id="cell-editor-context-view-address" data-pagefind-weight="1">
<summary><code>viewAddress</code></summary>

```ts generated
readonly viewAddress: CellAddress;
```

</details>

<details class="api-member" id="cell-editor-context-column" data-pagefind-weight="1">
<summary><code>column</code></summary>

```ts generated
readonly column: Readonly<Column>;
```

</details>

<details class="api-member" id="cell-editor-context-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
readonly value: CellScalar;
```

</details>

<details class="api-member" id="cell-editor-context-text" data-pagefind-weight="1">
<summary><code>text</code></summary>

```ts generated
readonly text: string;
```

</details>

<details class="api-member" id="cell-editor-context-initial-input" data-pagefind-weight="1">
<summary><code>initialInput</code></summary>

```ts generated
readonly initialInput: string | undefined;
```

</details>

<details class="api-member" id="cell-editor-context-select-all" data-pagefind-weight="1">
<summary><code>selectAll</code></summary>

```ts generated
readonly selectAll: boolean;
```

</details>

<details class="api-member" id="cell-editor-context-label" data-pagefind-weight="1">
<summary><code>label</code></summary>

```ts generated
readonly label: string;
```

</details>

<details class="api-member" id="cell-editor-context-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
readonly signal: AbortSignal;
```

</details>

<details class="api-member" id="cell-editor-context-commit" data-pagefind-weight="1">
<summary><code>commit</code> <span class="api-member-summary">Commit text through the Grid parser, policy, history, and collaboration path.</span></summary>

```ts generated
commit(value: string, navigation?: CellEditorNavigation): void;
```

</details>

<details class="api-member" id="cell-editor-context-cancel" data-pagefind-weight="1">
<summary><code>cancel</code> <span class="api-member-summary">Cancel without mutating and return focus to the Grid.</span></summary>

```ts generated
cancel(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellEditorContext {
  readonly grid: Grid;
  readonly address: CellAddress;
  readonly viewAddress: CellAddress;
  readonly column: Readonly<Column>;
  readonly value: CellScalar;
  readonly text: string;
  readonly initialInput: string | undefined;
  readonly selectAll: boolean;
  readonly label: string;
  readonly signal: AbortSignal;
  commit(value: string, navigation?: CellEditorNavigation): void;
  cancel(): void;
}
```

</details>
