---
title: "DelimitedTextOptions | @sheetwrite/core"
description: "Optional resource ceilings for an in-memory delimited-text operation."
---
<!-- api-export:@sheetwrite/core|.|DelimitedTextOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional resource ceilings for an in-memory delimited-text operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/delimited-text.ts#L20</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="delimited-text-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code> <span class="api-member-summary">Positive safe-integer overrides merged over DEFAULTDELIMITEDTEXTRESOURCELIMITS.</span></summary>

```ts generated
resourceLimits?: Partial<DelimitedTextResourceLimits>;
```

<p class="api-member-doc">Positive safe-integer overrides merged over `DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DelimitedTextOptions {
  resourceLimits?: Partial<DelimitedTextResourceLimits>;
}
```

</details>
