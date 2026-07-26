# Repository scripts

`package.json` has ~55 root scripts. **You need four.** Everything else belongs to
CI or the release process. This file is a guide, not an inventory — for the full
list, read `package.json`.

## Contributing a change

```sh
bun install --frozen-lockfile     # once
bun scripts/install-wasm-pack.ts  # once — pinned, checksum-verified wasm-pack

bun test path/to/focused.test.ts  # while editing
bun run verify:ci                 # before you push
```

That is the whole path. `verify:ci` is the broadest gate you can run locally, and
passing it means a pull request will usually be green.

Two kinds of change need one more command:

| If you changed | Also run |
|---|---|
| Anything rendered in a browser | `bun run test:browser` (first time: `bun run browser:install`) |
| Rust under `packages/wasm` | `cargo test`, from `packages/wasm` |

## What `verify:ci` covers, and what it does not

It is composed as `VERIFY_CI_NODES` in `scripts/workspace-tooling.ts` and runs, in
order:

1. Tooling contract tests, JavaScript dependency audit, `cargo test`, `cargo audit`
2. Package builds
3. Clean-export check, typechecks, lint, unit tests, example builds, Node ESM resolution
4. Packed-consumer and bundler-consumer installs
5. Public API check and benchmark smoke
6. Delivery-size report

**It is not a complete mirror of CI.** The pipeline additionally runs the full
browser matrix, coverage thresholds, and the production docs build. Matched
timing comparisons run deliberately through the local protocol in
`bench/README.md`, not as a required CI job. A green `verify:ci` is strong
evidence, not a guarantee.

When it fails, it prints `::workspace-node::<id>` before each step. Node ids are
not always script names — `audit:javascript` is `bun scripts/dependency-audit.ts`,
`test:rust` is `cargo test` in `packages/wasm`. To map an id to the exact command:

```sh
bun scripts/workspace-tooling.ts verify-ci --dry-run
```

That lists every node with its command, so you can re-run only the step that
failed instead of the whole gate.

## Naming, so you can find things

Scripts are grouped by prefix. Knowing the prefix is usually enough to find what
you want without reading all of them:

| Prefix | What lives there |
|---|---|
| `build:` | Compiling packages, examples, the WASM engine, the docs site |
| `test:` | Test suites — unit, browser, coverage, tooling contracts |
| `typecheck:` | TypeScript, whole workspace or narrowed to one part |
| `verify:` | Composite gates that prove a real consumer scenario works |
| `api:` | Public API surface: report it, gate it, re-baseline it |
| `size:` | Delivery-size measurement and history |
| `docs:` | Generating and checking the documentation site |
| `compatibility:` | The Excel/Sheets conformance lab |
| `release:`, `changeset:` | Release machinery — maintainers only |

Add a new script under the prefix that owns it. A script nobody can categorise is
a script nobody will run.

## Things worth knowing before you touch them

- **`docs:generate` owns `docs/src/generated/*`** and the API pages. Never
  hand-edit its output.
- **Benchmarks live in the `bench` workspace**, not here:
  `bun run --filter '@sheetwrite/bench' bench:verify`. Baselines under
  `bench/results/` and the delivery-size budgets are reviewed evidence — changing
  one to make a regression pass defeats the gate's only purpose.
- **`compatibility:capture:*` and `compatibility:roundtrip:libreoffice`** need
  external applications or credentials. They are run deliberately, when refreshing
  the oracle corpus, not as part of a normal change.
- **`release:*` assumes a clean tree and specific artifact layouts.** Running it
  casually produces confusing local state. Contributors only ever need
  `bunx changeset` to add a changelog entry.
