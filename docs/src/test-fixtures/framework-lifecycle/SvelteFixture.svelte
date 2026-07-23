<script lang="ts">
  import type { GridReadyEvent } from "@sheetwrite/core/adapter";
  import { SheetwriteGrid } from "@sheetwrite/svelte";
  import "@sheetwrite/svelte/styles.css";
  import {
    INVALID_WASM_SOURCE,
    LIFECYCLE_DATA,
    LIFECYCLE_RESET_DATA,
    LIFECYCLE_WORKBOOK,
  } from "./fixture.js";

  let wasmSource = $state.raw<Uint8Array | undefined>(INVALID_WASM_SOURCE);
  let data = $state.raw(LIFECYCLE_DATA);
  let mounted = $state(true);
  let status = $state<"loading" | "error" | "ready">("loading");
  let errors = $state(0);
  let ready = $state("");

  function retry(): void {
    status = "loading";
    wasmSource = undefined;
  }

  function resetInput(): void {
    data = LIFECYCLE_RESET_DATA;
  }

  function handleInitializationError(): void {
    errors += 1;
    status = "error";
  }

  function handleReady(event: GridReadyEvent): void {
    ready = `${event.generation}:${event.reason}`;
    status = "ready";
  }
</script>

{#snippet fallback()}
  <span data-lifecycle-fallback>Svelte fallback</span>
{/snippet}

<main data-framework-lifecycle="svelte">
  <button type="button" data-lifecycle-retry onclick={retry}>Retry Svelte</button>
  <button type="button" data-lifecycle-reset onclick={resetInput}>Reset Svelte input</button>
  <button type="button" data-lifecycle-unmount onclick={() => (mounted = false)}
    >Unmount Svelte</button
  >
  <output data-lifecycle-status>{status}</output>
  <output data-lifecycle-errors>{errors}</output>
  <output data-lifecycle-ready>{ready}</output>
  {#if mounted}
    <SheetwriteGrid
      workbook={LIFECYCLE_WORKBOOK}
      {data}
      height={320}
      {wasmSource}
      {fallback}
      onInitializationError={handleInitializationError}
      onReady={handleReady}
    />
  {/if}
</main>
