---
title: "MutationIssue | @sheetwrite/core"
description: "Structured warning or rejection produced while applying an operation."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|MutationIssue -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Structured warning or rejection produced while applying an operation.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L165</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;validation&quot;; severity: &quot;error&quot; | &quot;warning&quot;; ruleId: string; addr: CellAddress; value: CellValue; message: string; operationIndex: number; }</code></div>
<div class="api-variant"><code>{ kind: &quot;protection&quot;; severity: &quot;error&quot;; protectedRangeId: string; range: Range; operationIndex: number; message: string; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type MutationIssue = {
    kind: "validation";
    severity: "error" | "warning";
    ruleId: string;
    addr: CellAddress;
    value: CellValue;
    message: string;
    operationIndex: number;
} | {
    kind: "protection";
    severity: "error";
    protectedRangeId: string;
    range: Range;
    operationIndex: number;
    message: string;
};
```

</details>
