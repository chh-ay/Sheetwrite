---
title: "GRID_OPTION_POLICY | @sheetwrite/core/adapter"
description: "Classification of adapter options as live-updatable or reset-sensitive."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|GRID_OPTION_POLICY -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">variable</span>

Classification of adapter options as live-updatable or reset-sensitive.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L23</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
const GRID_OPTION_POLICY: {
    readonly workbook: "reset";
    readonly data: "reset";
    readonly datasource: "reset";
    readonly datasourceStorage: "reset";
    readonly renderer: "reset";
    readonly workerUrl: "reset";
    readonly renderers: "reset";
    readonly protectionResolver: "reset";
    readonly mutationPolicy: "reset";
    readonly theme: "live";
    readonly readOnly: "live";
    readonly config: "live";
    readonly overscan: "live";
    readonly minColumns: "live";
};
```

</details>
