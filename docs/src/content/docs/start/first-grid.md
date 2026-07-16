---
title: Your first grid
description: Initialize Sheetwrite, create a workbook, and observe committed changes.
---

This complete TypeScript example uses the imperative core. [Install Sheetwrite](/docs/start/installation/) first; the framework adapters expose the same `Grid` after their client-only initialization completes.

```ts compile title="Complete first grid"
import {
  createGrid,
  initSheetwrite,
  type ColumnarData,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "420px";

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: 3,
      columns: [
        { key: "product", header: "Product", width: 180, type: "text" },
        { key: "amount", header: "Amount", width: 100, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 3,
  columns: {
    product: ["Notebook", "Pen", "Folder"],
    amount: new Float64Array([12, 4, 9]),
  },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });
grid.on("change", ({ transaction }) => {
  console.log(transaction.patches);
});
```

`initSheetwrite()` is re-entrant. Call it before `createGrid`; concurrent calls share initialization and a failed call can be retried. Destroy the returned grid when its host is permanently removed.

## Next steps

- Open the [Vanilla example](/vanilla/) to exercise the same lifecycle in a production build.
- Choose a [framework integration](/docs/frameworks/lifecycle/).
- Learn when the [`Grid` and `Store` own state](/docs/concepts/runtime-ownership/).
- Browse the generated [`@sheetwrite/core` API](/docs/api/core/).
