---
title: Compatibility and limits
description: Explicit boundaries for data loading, formulas, protection, collaboration, Worker rendering, and XLSX.
---

| Area | Supported contract | Boundary |
| --- | --- | --- |
| Data | Eager columnar data or cancellable datasource pages; dense and allocation-lazy paged storage | Full-sheet queries and exports are incomplete until required pages load |
| Formulas | Persisted formula source, A1/range references, named ranges, supported deterministic functions | No dynamic arrays/spills, external `IMPORT*`, custom JavaScript, random functions, charts, or pivots |
| Protection | Serializable client interaction policy with atomic/partial local mutation behavior | Never server authorization; remote operations bypass local UX policy |
| Collaboration | Host sequencing, stable mutation IDs, durable optimistic edits, ordered remote operations, presence/comments/revisions, conservative rebase | No bundled server, CRDT, or general OT; ambiguous structural/formula conflicts require host UX |
| Worker | OffscreenCanvas rendering with capability/startup fallback | Custom function renderers cannot transfer to the worker |
| XLSX | Table interchange plus supported workbook formulas/styles/merges/dimensions/frozen panes/names and Sheetwrite metadata | Unsupported workbook features are warned, flattened, or dropped; not full Excel fidelity |
| Accessibility | ARIA grid mirror for the visible virtualized window with keyboard-driven updates | The full document is not duplicated into hidden DOM |

Compatibility statements are feature contracts, not claims of Excel or Google Sheets parity.

- [Supported formulas](/docs/guides/formulas/#supported-formulas)
- [XLSX compatibility](/docs/guides/data-operations/#xlsx-compatibility)
- [Accessibility limits](/docs/guides/accessibility/)
- [Worker fallback](/docs/guides/worker-rendering/)
