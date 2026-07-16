---
"@sheetwrite/core": patch
---

Very tall documents no longer lose their tail rows: the virtual-scroll sizer cap
is measured from the layout engine (and re-measured when browser zoom changes
`devicePixelRatio`) instead of assuming a constant 33,000,000px, so scaled
scrolling engages exactly when the real clamp requires it.
