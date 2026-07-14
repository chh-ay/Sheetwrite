import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
import { h } from "vue";

const grid = h(Sheetwrite, { data: {} as never, workbook: {} as never });
console.log(grid.type);
