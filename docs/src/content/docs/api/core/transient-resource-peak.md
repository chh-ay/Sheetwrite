---
title: "TransientResourcePeak | @sheetwrite/core"
description: "Operation-scoped transient peak, excluded from retained owner totals."
---
<!-- api-export:@sheetwrite/core|.|TransientResourcePeak -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Operation-scoped transient peak, excluded from retained owner totals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L90</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="transient-resource-peak-owner" data-pagefind-weight="1">
<summary><code>owner</code></summary>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="transient-resource-peak-peak-bytes" data-pagefind-weight="1">
<summary><code>peakBytes</code></summary>

```ts generated
readonly peakBytes: number;
```

</details>

<details class="api-member" id="transient-resource-peak-allocations" data-pagefind-weight="1">
<summary><code>allocations</code></summary>

```ts generated
readonly allocations: number;
```

</details>

<details class="api-member" id="transient-resource-peak-measurement" data-pagefind-weight="1">
<summary><code>measurement</code></summary>

```ts generated
readonly measurement: "instrumented-operation-peak";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TransientResourcePeak {
  readonly owner: string;
  readonly peakBytes: number;
  readonly allocations: number;
  readonly measurement: "instrumented-operation-peak";
}
```

</details>
