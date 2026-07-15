---
title: Svelte
description: Integrate Sheetwrite with Svelte bindings, callbacks, and reset ownership.
---

`@sheetwrite/svelte` initializes WASM in the browser. Bind `grid` when the host needs imperative access and pass `onGridChange` or `onReady` callbacks using the adapter's camel-case props.

The binding is populated before `onReady` and cleared before reset or unmount. A reset publishes a new generation and reason; coordinators attached to the previous grid must be destroyed and recreated.

```svelte title="Svelte adapter"
<script lang="ts">
  import {
    Sheetwrite,
    type Grid,
    type GridReadyEvent,
    type SimpleColumn,
  } from "@sheetwrite/svelte";
  import type { ChangeEvent, Transaction } from "@sheetwrite/core";
  import "@sheetwrite/svelte/styles.css";

  type Row = { name: string; amount: number };
  interface Props {
    columns: readonly SimpleColumn<Row>[];
    rows: readonly Row[];
    save: (transaction: Transaction) => void;
    onReady: (event: GridReadyEvent) => void;
  }

  let { columns, rows, save, onReady }: Props = $props();
  let grid: Grid | undefined;
  const handleGridChange = (event: ChangeEvent) => save(event.transaction);
</script>

<Sheetwrite
  {columns}
  defaultRows={rows}
  bind:grid
  onGridChange={handleGridChange}
  {onReady}
/>
```

Use a client-only boundary in SvelteKit when the surrounding route is server rendered.

- [Run the Svelte shell example](/svelte/)
- [Lifecycle and reset semantics](/docs/frameworks/lifecycle/)
- [`@sheetwrite/svelte` API](/docs/api/svelte/)
