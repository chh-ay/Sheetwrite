<script lang="ts">
  import type { Grid } from "@sheetwrite/core";
  import { untrack } from "svelte";
  import type { SheetwriteGridProps } from "../src/props.js";
  import SheetwriteGrid from "../src/Grid.svelte";

  type HarnessProps = Omit<SheetwriteGridProps, "fallback" | "grid"> & {
    fallbackLabel: string;
  };

  let { initialProps }: { initialProps: HarnessProps } = $props();
  let currentProps = $state.raw(initialProps);
  let publishedGrid: Grid | undefined;
  const publishedAtReady: Array<Grid | null | undefined> = [];
  let gridProps = $derived.by(() => {
    const { fallbackLabel: _fallbackLabel, ...props } = currentProps;
    return props;
  });

  export function update(nextProps: HarnessProps): void {
    currentProps = nextProps;
  }

  export function getGrid(): Grid | undefined {
    return publishedGrid;
  }

  export function getPublishedAtReady(): Array<Grid | null | undefined> {
    return publishedAtReady;
  }

  function setGrid(value: Grid | undefined): void {
    publishedGrid = value;
  }

  function handleReady(event: Parameters<NonNullable<typeof gridProps.onReady>>[0]): void {
    publishedAtReady.push(untrack(() => publishedGrid));
    gridProps.onReady?.(event);
  }
</script>

{#snippet fallback()}
  <span data-lifecycle-fallback>{currentProps.fallbackLabel}</span>
{/snippet}

<SheetwriteGrid {...gridProps} bind:grid={getGrid, setGrid} {fallback} onReady={handleReady} />
