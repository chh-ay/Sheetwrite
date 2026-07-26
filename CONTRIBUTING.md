# Contributing

## Prerequisites

Use Bun 1.3.14, Rust 1.96.0 with `wasm32-unknown-unknown`, Node 24.3.0, and npm 11.18.0. Install dependencies with:

```sh
bun install --frozen-lockfile
bun scripts/install-wasm-pack.ts
```

## Development checks

Run the narrowest relevant test while editing, then run the full repository gate before submitting:

```sh
bun test path/to/focused.test.ts
bun run verify:ci
```

Browser changes also require `bun run test:browser`; Rust changes require `cargo test` from `packages/wasm`.

`verify:ci` is the broadest local pre-submit gate, though not a complete mirror of the pipeline — CI additionally runs the full browser matrix, coverage, and the production docs build. Matched timing comparisons run deliberately through the local protocol in `bench/README.md`, not as a required CI job. `verify:ci` prints `::workspace-node::<id>` before each step; `bun scripts/workspace-tooling.ts verify-ci --dry-run` lists every id with the exact command it runs, so you can re-run just the step that failed. [`scripts/README.md`](scripts/README.md) explains how the repository's scripts are organised and which handful you actually need.

Generated API pages and `docs/src/generated/*` are owned by `bun run docs:generate`. Do not hand-edit generated files. Build output, benchmark evidence, and release artifacts remain uncommitted.

After the initial 0.1.0 release, user-visible package changes require a Changeset created with `bunx changeset`. Private workspaces are excluded.

Benchmark baselines and delivery-size budgets are reviewed evidence, not knobs for making a regression pass. Change a baseline only in a standalone, measured review that records the reason; never weaken correctness sentinels or coverage thresholds.

See [SUPPORT.md](SUPPORT.md) for issue routing and [SECURITY.md](SECURITY.md) for private vulnerability reports.
