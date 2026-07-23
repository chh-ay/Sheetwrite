---
"@sheetwrite/core": minor
"@sheetwrite/react": minor
"@sheetwrite/vue": minor
"@sheetwrite/svelte": minor
"@sheetwrite/xlsx": minor
---

Add the canonical `SheetwriteError` envelope and stable error codes across initialization, Grid events, persistence, synchronization, collaboration, delimited text, and optional XLSX boundaries. Framework initialization callbacks now receive the same typed error class, and XLSX cancellation preserves the original abort reason as `cause`.
