---
title: "XlsxResourceLimits | @sheetwrite/core"
description: "Resource dimensions bounded by every XLSX import and export path."
---
<!-- api-export:@sheetwrite/core|.|XlsxResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource dimensions bounded by every XLSX import and export path.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L211</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>17</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-resource-limits-max-input-bytes" data-pagefind-weight="1">
<summary><code>maxInputBytes</code> <span class="api-member-summary">Compressed workbook input bytes; defaults to 32 MiB.</span></summary>

```ts generated
maxInputBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-output-bytes" data-pagefind-weight="1">
<summary><code>maxOutputBytes</code> <span class="api-member-summary">Encoded workbook output bytes; defaults to 128 MiB.</span></summary>

```ts generated
maxOutputBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-archive-entries" data-pagefind-weight="1">
<summary><code>maxArchiveEntries</code> <span class="api-member-summary">ZIP archive entries; defaults to 1,024.</span></summary>

```ts generated
maxArchiveEntries: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-entry-uncompressed-bytes" data-pagefind-weight="1">
<summary><code>maxEntryUncompressedBytes</code> <span class="api-member-summary">Uncompressed bytes in any one ZIP entry; defaults to 64 MiB.</span></summary>

```ts generated
maxEntryUncompressedBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-total-uncompressed-bytes" data-pagefind-weight="1">
<summary><code>maxTotalUncompressedBytes</code> <span class="api-member-summary">Aggregate uncompressed ZIP entry bytes; defaults to 256 MiB.</span></summary>

```ts generated
maxTotalUncompressedBytes: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-compression-ratio" data-pagefind-weight="1">
<summary><code>maxCompressionRatio</code> <span class="api-member-summary">Uncompressed-to-compressed ratio for one ZIP entry; defaults to 100.</span></summary>

```ts generated
maxCompressionRatio: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-sheets" data-pagefind-weight="1">
<summary><code>maxSheets</code> <span class="api-member-summary">Workbook worksheets; defaults to 256.</span></summary>

```ts generated
maxSheets: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-rows-per-sheet" data-pagefind-weight="1">
<summary><code>maxRowsPerSheet</code> <span class="api-member-summary">Rows in any worksheet; defaults to 1,048,576.</span></summary>

```ts generated
maxRowsPerSheet: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-columns-per-sheet" data-pagefind-weight="1">
<summary><code>maxColumnsPerSheet</code> <span class="api-member-summary">Columns in any worksheet; defaults to 16,384.</span></summary>

```ts generated
maxColumnsPerSheet: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code> <span class="api-member-summary">Cells accounted by the active conversion path; defaults to 1,000,000.</span></summary>

```ts generated
maxCells: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-merges" data-pagefind-weight="1">
<summary><code>maxMerges</code> <span class="api-member-summary">Aggregate merged ranges; defaults to 100,000.</span></summary>

```ts generated
maxMerges: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-shared-strings" data-pagefind-weight="1">
<summary><code>maxSharedStrings</code> <span class="api-member-summary">Shared-string table entries; defaults to 1,000,000.</span></summary>

```ts generated
maxSharedStrings: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-styles" data-pagefind-weight="1">
<summary><code>maxStyles</code> <span class="api-member-summary">Style-related records; defaults to 65,536.</span></summary>

```ts generated
maxStyles: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-elements" data-pagefind-weight="1">
<summary><code>maxXmlElements</code> <span class="api-member-summary">Elements in any one XML part; defaults to 2,000,000.</span></summary>

```ts generated
maxXmlElements: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-depth" data-pagefind-weight="1">
<summary><code>maxXmlDepth</code> <span class="api-member-summary">Element nesting depth in any one XML part; defaults to 64.</span></summary>

```ts generated
maxXmlDepth: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-attributes-per-element" data-pagefind-weight="1">
<summary><code>maxXmlAttributesPerElement</code> <span class="api-member-summary">Attributes on any one XML element; defaults to 128.</span></summary>

```ts generated
maxXmlAttributesPerElement: number;
```

</details>

<details class="api-member" id="xlsx-resource-limits-max-xml-text-bytes" data-pagefind-weight="1">
<summary><code>maxXmlTextBytes</code> <span class="api-member-summary">UTF-8 text bytes in one XML element or attribute; defaults to 16 MiB.</span></summary>

```ts generated
maxXmlTextBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxResourceLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxArchiveEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCells: number;
  maxMerges: number;
  maxSharedStrings: number;
  maxStyles: number;
  maxXmlElements: number;
  maxXmlDepth: number;
  maxXmlAttributesPerElement: number;
  maxXmlTextBytes: number;
}
```

</details>
