---
title: Vue
description: Integrate Sheetwrite with Vue events, exposed Grid state, and resets.
---

`@sheetwrite/vue` initializes WASM after client mount. The simple component accepts `columns` and `defaultRows`; Vue templates use kebab-case event listeners such as `@grid-change` and `@ready`.

The component exposes `grid` before emitting `ready`. A reset clears the old exposed handle, creates a new generation, and then publishes the replacement. Reattach any coordinator that subscribed to the old grid.

```vue partial="requires component-owned columns and rows" title="Vue adapter"
<script setup lang="ts">
import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
</script>

<template>
  <Sheetwrite
    :columns="columns"
    :default-rows="rows"
    @grid-change="save"
    @ready="({ grid, generation, reason }) => observe(grid, generation, reason)"
  />
</template>
```

Use a client-only boundary in Nuxt or another server-rendered host; importing or rendering the component on the server does not start WASM.

- [Run the Vue datasource example](/vue/)
- [Lifecycle and reset semantics](/docs/frameworks/lifecycle/)
- [`@sheetwrite/vue` API](/docs/api/vue/)
