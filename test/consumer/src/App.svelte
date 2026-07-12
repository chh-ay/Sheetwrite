<script lang="ts">
import type { Workbook } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/svelte";

// A real component mount (not just an export probe): the Vite build must
// compile Grid.svelte from the packed tarball and link the core adapter.
const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: 3,
      columns: [{ key: "a", header: "A", width: 120, type: "text" }],
    },
  ],
};
</script>

<div style="height: 300px">
  <SheetwriteGrid {workbook} />
</div>
