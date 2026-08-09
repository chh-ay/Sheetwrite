---
"@sheetwrite/wasm": patch
---

Reuse each visible formula entry while decoding render windows, avoiding redundant formula-map probes without changing resolved values or error precedence.
