---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

Extract the concrete table and workbook XLSX implementations into the optional `@sheetwrite/xlsx` package. Core and framework installs no longer include Excel libraries; applications that use XLSX install the optional package and import `@sheetwrite/xlsx/register` explicitly.
