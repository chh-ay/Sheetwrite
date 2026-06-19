# @sheetwrite/wasm

The Sheetwrite columnar store and calculation engine, written in Rust and
compiled to WebAssembly. It is consumed by `@sheetwrite/core`; most users never
import it directly.

## What it provides

- A columnar cell store (value kinds: `EMPTY=0`, `NUMBER=1`, `STRING=2`, `FORMULA=4`).
- The formula calc DAG (A1 references and ranges, arithmetic and comparisons, `SUM`/`AVG`/`MIN`/`MAX`/`COUNT`/`IF`/`ABS`/`ROUND`/`SQRT`/`MOD`/`POW`/`AND`/`OR`/`NOT`, with cycle detection).

## Install

```sh
bun add @sheetwrite/wasm
```

This usually arrives transitively as a dependency of `@sheetwrite/core`.

## Loading

`@sheetwrite/core`'s `initSheetwrite()` calls this package's `load()` for you, so
in app code you normally only call `initSheetwrite`. To use the loader directly:

```ts
import { load } from "@sheetwrite/wasm";
// In a browser bundle, resolve the binary as an asset URL and pass it in.
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

await load(wasmUrl);
```

`load(source?)` is idempotent and accepts
`BufferSource | URL | string | Request | WebAssembly.Module`. When called with no
argument it picks the right strategy for the runtime: it fetches the co-located
binary in the browser and reads it from disk in Node. The `@sheetwrite/wasm/wasm`
subpath resolves to the compiled `.wasm` binary.

## Build

```sh
bun run build   # wasm-pack build --target web --out-dir pkg
```

Requires `wasm-pack` and the Rust toolchain pinned in `rust-toolchain.toml`.

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
