---
title: "SyncPendingCapacityError | @sheetwrite/core"
description: "Typed local transaction rejection produced when the durable queue cannot reserve capacity."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingCapacityError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Typed local transaction rejection produced when the durable queue cannot reserve capacity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L188</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-pending-capacity-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(issue: Extract<MutationIssue, { kind: "resource-limit"; }>);
```

</details>

<details class="api-member" id="sync-pending-capacity-error-issue" data-pagefind-weight="1">
<summary><code>issue</code></summary>

```ts generated
issue: { kind: "resource-limit"; severity: "error"; resource: "operations" | "encoded-bytes" | "pending-commits" | "pending-operations" | "pending-encoded-bytes" | "paged-dirty-cells" | "paged-reference-simulation"; actual: number; max: number; message: string; };
```

</details>

<details class="api-member" id="sync-pending-capacity-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "SyncPendingCapacityError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SyncPendingCapacityError extends SheetwriteError {
  constructor(
    issue: Extract<
      MutationIssue,
      {
        kind: "resource-limit";
      }
    >,
  );
  issue: {
    kind: "resource-limit";
    severity: "error";
    resource:
      | "operations"
      | "encoded-bytes"
      | "pending-commits"
      | "pending-operations"
      | "pending-encoded-bytes"
      | "paged-dirty-cells"
      | "paged-reference-simulation";
    actual: number;
    max: number;
    message: string;
  };
  name: "SyncPendingCapacityError";
}
```

</details>
