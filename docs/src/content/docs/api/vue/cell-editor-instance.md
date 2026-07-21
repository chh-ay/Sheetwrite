---
title: "CellEditorInstance | @sheetwrite/vue"
description: "Retained lifecycle returned by a custom editor's mount method."
---
<!-- api-export:@sheetwrite/vue|.|CellEditorInstance -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Retained lifecycle returned by a custom editor's `mount` method.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/editor.d.ts#L36</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-instance-update" data-pagefind-weight="1">
<summary><code>update</code> <span class="api-member-summary">Refresh external value/context while the same cell remains owned.</span></summary>

```ts generated
update(context: CellEditorContext): void;
```

</details>

<details class="api-member" id="cell-editor-instance-reposition" data-pagefind-weight="1">
<summary><code>reposition</code> <span class="api-member-summary">Reposition editor-owned popovers after the core wrapper has moved.</span></summary>

```ts generated
reposition(rect: CellEditorRect): void;
```

</details>

<details class="api-member" id="cell-editor-instance-commit" data-pagefind-weight="1">
<summary><code>commit</code> <span class="api-member-summary">Called for Enter/Tab. Return text (or a promise for it) to use the canonical commit path.</span></summary>

```ts generated
commit(navigation: CellEditorNavigation): string | void | Promise<string | void>;
```

</details>

<details class="api-member" id="cell-editor-instance-cancel" data-pagefind-weight="1">
<summary><code>cancel</code> <span class="api-member-summary">Called for Escape or replacement before teardown.</span></summary>

```ts generated
cancel(): void;
```

</details>

<details class="api-member" id="cell-editor-instance-destroy" data-pagefind-weight="1">
<summary><code>destroy</code> <span class="api-member-summary">Release every DOM node, listener, subscription, and framework subtree.</span></summary>

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
