---
title: Public API contract
description: How Sheetwrite defines supported entry points, declaration stability, and generated reference pages.
---

Sheetwrite treats each package `exports` map as the public boundary. The release gate builds the packages first, analyzes the emitted declarations with TypeScript, and rejects undocumented, ambiguous, or accidentally exposed symbols before any package can publish.

## Entry-point classifications

Every exported subpath has one explicit classification:

| Classification | Contract |
| --- | --- |
| `supported` | Public application API. Semver and the generated reference apply. |
| `internal` | Required runtime plumbing, such as the WASM loader. Published intentionally but not a general extension surface. |
| `testing-only` | Deterministic harnesses for consumers' tests; never production code. |
| `asset` | CSS, Worker, or WASM bytes rather than a TypeScript symbol surface. |

The [generated API index](/docs/api/) lists every package entry point, its classification, and every compiler-visible export. There is no manually maintained symbol inventory beside it.

## What the gate records

For every TypeScript export, the canonical manifest records:

- symbol name and declaration kind;
- normalized primary signature;
- owning declaration files and source location;
- source JSDoc and JSDoc tags;
- documented interface and class members.

Named re-exports preserve documentation from both the export statement and the declaration target. Framework-generated declarations are analyzed from the bytes that packages actually ship.

## Stability and changes

`bun run api:check` hashes the normalized manifest. A changed digest must be reviewed with the declaration diff and accepted explicitly; rebuilding alone cannot rewrite the baseline. This catches additions, removals, signature drift, duplicate declaration merges, missing documentation, and dependency types that leak into the public surface.

The API manifest describes type compatibility. Runtime behavior remains protected by package tests, adapter lifecycle contracts, browser scenarios, canonical tarball checks, and delivery-size budgets.
