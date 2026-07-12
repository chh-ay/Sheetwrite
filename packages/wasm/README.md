# @sheetwrite/wasm

Sheetwrite's Rust/WASM columnar store and calculation engine. Most consumers receive it transitively through `@sheetwrite/core` or a framework adapter.

```ts
import { load } from "@sheetwrite/wasm";

await load();
```

The package boundary selects a browser loader with no Node imports or a Node loader that reads the co-located binary. `load(source?)` accepts `BufferSource | URL | string | Request | WebAssembly.Module`, shares concurrent same-source initialization, rejects conflicting concurrent sources, retries after failure, and no-ops after success. `isLoaded()` is the authoritative readiness check.

`@sheetwrite/wasm/wasm` remains the explicit raw-asset escape hatch for unsupported or custom bundlers; ordinary consumers should use zero-argument initialization.

## Build

```sh
bun run build
```
