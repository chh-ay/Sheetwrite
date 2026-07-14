---
title: Persistence and recovery
description: Persist versioned snapshots and durable pending mutations without confusing session state with document state.
---

Sheetwrite supplies contracts, not a database or endpoint. A `PersistenceAdapter` loads a schema-versioned `WorkbookSnapshot` and commits immutable `PendingCommit` records carrying a stable `clientMutationId` and `baseVersion`.

A commit response is `applied`, `duplicate`, or `conflict`. Applied and duplicate acknowledgements advance the server version. A conflict may provide ordered operations since the base or a current snapshot; ambiguous structural or formula conflicts require host UX rather than silent merge.

`IndexedDbPendingCommitStorage` from `@sheetwrite/core/browser` can retain optimistic work across reloads. Its typed errors report blocked upgrades, unsupported schemas, quota, transaction, and abort failures. The core continues without durable browser storage when no pending-storage adapter is supplied.

Document snapshots include workbook/sheet data, formula source, formatting, validation, protection metadata, notes, names, filters, and related document state. Selection, scroll position, caret state, search overlays, host read-only policy, and local zoom remain session state.

- [Collaboration and conservative rebase](/docs/guides/collaboration/)
- [Document operations reference](/docs/reference/document-operations/)
- [`PersistenceAdapter` and sync API](/docs/api/core/persistence-adapter/)
- [`@sheetwrite/core/browser`](/docs/api/core-browser/)
