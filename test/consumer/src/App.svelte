<script lang="ts">
import type { Grid } from "@sheetwrite/core";
import type { GridReadyEvent } from "@sheetwrite/core/adapter";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import {
  assertReadyAndEdit,
  initialData,
  replacementData,
  workbook,
} from "./lifecycle.js";

let { onComplete }: { onComplete: (getGrid: () => Grid | undefined) => void } = $props();
let data = $state(initialData);
let grid = $state<Grid>();
let readyCount = 0;

function handleReady(event: GridReadyEvent): void {
  readyCount += 1;
  if (readyCount !== 1 && readyCount !== 2) {
    throw new Error(`Packed Svelte consumer published ${readyCount} generations`);
  }
  assertReadyAndEdit(event, readyCount);
  if (readyCount === 1) {
    data = replacementData;
    return;
  }
  onComplete(() => grid);
}
</script>

<SheetwriteGrid
  {workbook}
  {data}
  wasmSource={wasmUrl}
  bind:grid
  height={240}
  onReady={handleReady}
/>
