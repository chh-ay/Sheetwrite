import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import { createElement } from "react";

const grid = createElement(Sheetwrite, { data: {} as never, workbook: {} as never });
console.log(grid.type);
