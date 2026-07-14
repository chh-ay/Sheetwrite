---
title: Svelte
description: Integrate Sheetwrite with Svelte bindings, callbacks, and reset ownership.
---

`@sheetwrite/svelte` initializes WASM in the browser. Bind `grid` when the host needs imperative access and pass `onGridChange` or `onReady` callbacks using the adapter's camel-case props.

The binding is populated before `onReady` and cleared before reset or unmount. A reset publishes a new generation and reason; coordinators attached to the previous grid must be destroyed and recreated.

```svelte partial="requires component-owned columns and rows" title="Svelte adapter"
<script lang="ts">
  import { Sheetwrite } from "@sheetwrite/svelte";
  import "@sheetwrite/svelte/styles.css";

  let grid;
</script>

<Sheetwrite
  {columns}
  defaultRows={rows}
  bind:grid
  onGridChange={(event) => save(event.transaction)}
  onReady={({ generation, reason }) => console.log(generation, reason)}
/>
```

Use a client-only boundary in SvelteKit when the surrounding route is server rendered.

- [Run the Svelte shell example](/svelte/)
- [Lifecycle and reset semantics](/docs/frameworks/lifecycle/)
- [`@sheetwrite/svelte` API](/docs/api/svelte/)
