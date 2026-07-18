---
title: "MutationIssue | @sheetwrite/core"
description: "Structured warning or rejection produced while applying an operation."
---
<!-- api-export:@sheetwrite/core|.|MutationIssue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Structured warning or rejection produced while applying an operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L204</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "validation";
  severity: "error" | "warning";
  ruleId: string;
  addr: CellAddress;
  value: CellValue;
  message: string;
  operationIndex: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "protection";
  severity: "error";
  protectedRangeId: string;
  range: Range;
  operationIndex: number;
  message: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "resource-limit";
  severity: "error";
  resource:
    | "operations"
    | "encoded-bytes"
    | "pending-commits"
    | "pending-operations"
    | "pending-encoded-bytes";
  actual: number;
  max: number;
  message: string;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type MutationIssue =
  | {
      kind: "validation";
      severity: "error" | "warning";
      ruleId: string;
      addr: CellAddress;
      value: CellValue;
      message: string;
      operationIndex: number;
    }
  | {
      kind: "protection";
      severity: "error";
      protectedRangeId: string;
      range: Range;
      operationIndex: number;
      message: string;
    }
  | {
      kind: "resource-limit";
      severity: "error";
      resource:
        | "operations"
        | "encoded-bytes"
        | "pending-commits"
        | "pending-operations"
        | "pending-encoded-bytes";
      actual: number;
      max: number;
      message: string;
    };
```

</details>
