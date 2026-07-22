---
title: "CellEditorInstance | @sheetwrite/core"
description: "Retained lifecycle returned by a custom editor's mount method."
---
<!-- api-export:@sheetwrite/core|.|CellEditorInstance -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Retained lifecycle returned by a custom editor's mount method.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L90</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-instance-update" data-pagefind-weight="1">
<summary><code>update</code></summary>

```ts generated
update(context: CellEditorContext): void;
```

</details>

<details class="api-member" id="cell-editor-instance-reposition" data-pagefind-weight="1">
<summary><code>reposition</code></summary>

```ts generated
reposition(rect: CellEditorRect): void;
```

</details>

<details class="api-member" id="cell-editor-instance-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit(navigation: CellEditorNavigation): string | void | Promise<string | void>;
```

</details>

<details class="api-member" id="cell-editor-instance-cancel" data-pagefind-weight="1">
<summary><code>cancel</code></summary>

```ts generated
cancel(): void;
```

</details>

<details class="api-member" id="cell-editor-instance-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellEditorInstance {
  update(context: CellEditorContext): void;
  reposition(rect: CellEditorRect): void;
  commit(
    navigation: CellEditorNavigation,
  ): string | void | Promise<string | void>;
  cancel(): void;
  destroy(): void;
}
```

</details>
