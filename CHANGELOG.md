# Changelog

Published releases and user-visible changes to Sheetwrite are recorded here. Package-specific dependency and API histories live beside each package:

- [`@sheetwrite/core`](packages/core/CHANGELOG.md)
- [`@sheetwrite/wasm`](packages/wasm/CHANGELOG.md)
- [`@sheetwrite/xlsx`](packages/xlsx/CHANGELOG.md)
- [`@sheetwrite/react`](packages/react/CHANGELOG.md)
- [`@sheetwrite/vue`](packages/vue/CHANGELOG.md)
- [`@sheetwrite/svelte`](packages/svelte/CHANGELOG.md)

## 0.2.0

- Hardened collaboration recovery, persistence queues, paged datasources, snapshots, and spreadsheet interchange resource boundaries.
- Replaced the optional spreadsheet implementation with a bounded OOXML codec and broadened workbook fidelity across LibreOffice, Microsoft Excel, and Google Sheets fixtures.
- Improved wide-page loading, cache eviction, large-dataset performance, and browser rendering behavior.
- Added complete framework, database lifecycle, collaboration, interoperability, and million-row performance showcases.
- Added deterministic performance, delivery-size, cross-browser, package-consumer, and release verification gates.
