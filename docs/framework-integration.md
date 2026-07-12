# Framework integration

React, Vue, and Svelte packages expose two components:

- `Sheetwrite`: data-first, uncontrolled `columns + defaultRows` API.
- `SheetwriteGrid`: advanced `workbook + data/datasource` API.

Each adapter initializes WASM automatically on client mount and exports its canonical stylesheet at `./styles.css`.

## React

```tsx
import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<Sheetwrite
  columns={columns}
  defaultRows={rows}
  height={500}
  onGridChange={save}
  onReady={({ grid, generation, reason }) => console.log(grid, generation, reason)}
/>;
```

The imperative `Grid` is exposed through the forwarded ref. The ref is assigned before `onReady` and cleared on reset/unmount.

## Vue

```vue
<script setup lang="ts">
import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
</script>

<template>
  <Sheetwrite
    ref="component"
    :columns="columns"
    :default-rows="rows"
    height="500px"
    @grid-change="save"
    @ready="onReady"
  />
</template>
```

The component exposes `grid` directly. The handle is populated before `ready` and cleared on reset/unmount.

## Svelte

```svelte
<script lang="ts">
import { Sheetwrite } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
</script>

<Sheetwrite
  bind:grid
  {columns}
  defaultRows={rows}
  height="500px"
  onGridChange={save}
  onReady={onReady}
/>
```

The bindable `grid` is populated before `onReady` and cleared on reset/unmount.

## Ownership and resets

`defaultRows` is an uncontrolled seed. Conversion to columnar data happens once per reset generation, does not mutate consumer rows, and fills missing values with `null`. Column keys must be non-empty and unique. `title` maps to the core column `header`; default width is 120 pixels.

| Inputs | Policy |
|---|---|
| `workbook`, `data`, `datasource` | input reset |
| `renderer`, `workerUrl`, `renderers` | renderer reset |
| `theme`, `readOnly`, `config`, `overscan`, `minColumns` | live update |

Readiness events include a component-local monotonically increasing `generation` and `reason`: `initial`, `input-reset`, or `renderer-reset`.

## Initialization

Mounting before WASM readiness is supported. Concurrent adapters share core's re-entrant initializer. A stale or unmounted generation never creates a grid after initialization resolves. No adapter starts WASM during module import or server rendering.

React accepts `fallback`; Vue and Svelte use fallback content/slots. Failures reach `onInitializationError` or Vue's `initialization-error`. Pass `wasmSource` only for explicit asset control.

## Sizing

`Sheetwrite` requires exactly one sizing mode:

- `height={500}` / `height="500px"`: width 100% and fixed height.
- `fill`: width and height 100%, plus `min-height: 0`.

`fill` cannot create ancestor height; size the containing layout. `SheetwriteGrid` keeps sizing optional for advanced existing layouts. Adapter sizing overrides conflicting host style values; other classes and styles remain supported.

## Events

| Meaning | React/Svelte | Vue |
|---|---|---|
| Store mutation | `onGridChange` | `grid-change` |
| Visible window | `onViewportChange` | `viewport-change` |
| Selection | `onSelectionChange` | `selection-change` |
| Edit begin | `onEditBegin` | `edit-begin` |
| Edit commit | `onEditCommit` | `edit-commit` |
| Search | `onSearch` | `search` |
| Active sheet | `onActiveSheetChange` | `active-sheet-change` |
| Ready generation | `onReady` | `ready` |
| Initialization failure | `onInitializationError` | `initialization-error` |

Native host change and scroll handlers are not occupied by grid semantics. There are no compatibility aliases for the removed `onChange`, `onScroll`, `change`, `scroll`, `selection`, or `active-sheet` names.

## Advanced features

`SheetwriteGrid` keeps renderer, worker URL, custom renderer, datasource, and workbook control. Worker and XLSX assets remain explicit `@sheetwrite/core` feature imports. The adapter packages re-export ordinary core types needed by quick starts, but do not expose WASM internals.
