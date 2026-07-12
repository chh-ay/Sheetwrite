import { beforeAll, describe, expect, it } from "bun:test";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("installCanvasTestStubs", () => {
  it("lets createGrid mount under happy-dom and restores every patch", () => {
    const canvasPrototype = HTMLCanvasElement.prototype;
    const originalGetContext = canvasPrototype.getContext;
    const restore = installCanvasTestStubs();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const workbook = makeWorkbook(5);
    const grid = createGrid(host, { workbook, data: makeColumnarData(5) });
    expect(host.querySelector("canvas")).not.toBeNull();
    grid.destroy();

    restore();
    expect(canvasPrototype.getContext).toBe(originalGetContext);
    // Layout stubs removed: elements report their real (0) happy-dom size again.
    expect(document.createElement("div").clientWidth).toBe(0);
  });
});
