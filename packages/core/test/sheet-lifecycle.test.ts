import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GridImpl, initSheetwrite } from "../src/grid.js";
import { createGridFromSnapshot } from "../src/persistence.js";
import { rebaseDocumentOperations } from "../src/rebase.js";
import type { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { SheetLifecycleResult, Workbook } from "../src/types.js";

const column = { key: "value", header: "Value", width: 100, type: "text" as const };

function workbook(
  sheets: Array<{
    id: string;
    name: string;
    visibility?: "visible" | "hidden" | "veryHidden";
  }>,
  activeSheet = sheets[0]!.id,
): Workbook {
  return {
    activeSheet,
    sheets: sheets.map((sheet) => ({ ...sheet, rowCount: 2, columns: [{ ...column }] })),
  };
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

function lifecycleCode(result: SheetLifecycleResult): string | undefined {
  if (result.status !== "rejected") return undefined;
  return result.issues.find((issue) => issue.kind === "sheet-lifecycle")?.code;
}

let restoreCanvas: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvas();
  document.body.replaceChildren();
});

describe("Grid worksheet lifecycle", () => {
  it("returns stable targets and structured canonical-name outcomes", () => {
    const model = workbook([
      { id: "one", name: "Sheet 1" },
      { id: "two", name: "Sheet 2" },
    ]);
    const grid = new GridImpl(mountHost(), { workbook: model });

    const renamed = grid.renameSheet("one", "Cafe\u0301");
    expect(renamed.status).toBe("applied");
    expect(renamed.sheet).toBe("one");
    expect(model.sheets[0]!.name).toBe("Café");

    const duplicate = grid.renameSheet("two", "CAFÉ");
    expect(duplicate.sheet).toBe("two");
    expect(lifecycleCode(duplicate)).toBe("duplicate");
    expect(model.sheets[1]!.name).toBe("Sheet 2");

    const invalidAdd = grid.addSheet({ id: "invalid", name: "Bad/Name" });
    expect(invalidAdd.sheet).toBe("invalid");
    expect(lifecycleCode(invalidAdd)).toBe("forbidden-character");
    expect(model.sheets.map((sheet) => sheet.id)).toEqual(["one", "two"]);

    grid.setReadOnly(true);
    const readOnly = grid.setSheetVisibility("one", "hidden");
    expect(readOnly).toMatchObject({ status: "noop", reason: "read-only", sheet: "one" });
    expect(model.sheets[0]!.visibility).toBeUndefined();

    grid.destroy();
  });

  it("enforces one visible sheet, deterministic fallback, history, and veryHidden preservation", () => {
    const model = workbook(
      [
        { id: "left", name: "Left" },
        { id: "active", name: "Active" },
        { id: "hidden", name: "Hidden", visibility: "hidden" },
        { id: "right", name: "Right" },
        { id: "secret", name: "Secret", visibility: "veryHidden" },
      ],
      "active",
    );
    const grid = new GridImpl(mountHost(), { workbook: model });

    expect(grid.setSheetVisibility("active", "hidden").status).toBe("applied");
    expect(grid.getActiveSheet()).toBe("right");
    expect(model.activeSheet).toBe("right");
    grid.undo();
    expect(model.sheets.find((sheet) => sheet.id === "active")!.visibility).toBe("visible");
    grid.redo();
    expect(model.sheets.find((sheet) => sheet.id === "active")!.visibility).toBe("hidden");

    expect(grid.setSheetVisibility("left", "veryHidden").status).toBe("applied");
    const rejectedHide = grid.setSheetVisibility("right", "hidden");
    expect(lifecycleCode(rejectedHide)).toBe("last-visible-sheet");
    expect(model.sheets.find((sheet) => sheet.id === "right")!.visibility).toBeUndefined();
    expect(lifecycleCode(grid.removeSheet("right"))).toBe("last-visible-sheet");

    expect(grid.setSheetVisibility("hidden", "visible").status).toBe("applied");
    expect(grid.removeSheet("right").status).toBe("applied");
    expect(grid.getActiveSheet()).toBe("hidden");
    const snapshot = grid.exportSnapshot();
    expect(snapshot.sheets.find((sheet) => sheet.id === "secret")!.visibility).toBe("veryHidden");
    expect(snapshot.sheets.find((sheet) => sheet.id === "left")!.visibility).toBe("veryHidden");

    const hydrated = createGridFromSnapshot(mountHost(), snapshot);
    expect(hydrated.getActiveSheet()).toBe("hidden");
    expect(
      hydrated.exportSnapshot().sheets.find((sheet) => sheet.id === "secret")!.visibility,
    ).toBe("veryHidden");
    hydrated.destroy();
    grid.destroy();
  });

  it("overlays session activation on export without mutation, history, or change traffic", () => {
    const model = workbook([
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ]);
    const grid = new GridImpl(mountHost(), { workbook: model });
    const changes: unknown[] = [];
    const active: string[] = [];
    grid.on("change", (event) => changes.push(event));
    grid.on("active-sheet", (event) => active.push(event.sheet));

    expect(grid.getCommandState("undo").disabled).toBe(true);
    grid.setActiveSheet("two");
    expect(model.activeSheet).toBe("one");
    expect(changes).toEqual([]);
    expect(active).toEqual(["two"]);
    expect(grid.getCommandState("undo").disabled).toBe(true);
    expect((grid.store as SheetwriteStore).exportSnapshot().workbook.activeSheet).toBe("one");

    const snapshot = grid.exportSnapshot();
    expect(snapshot.workbook.activeSheet).toBe("two");
    const hydrated = createGridFromSnapshot(mountHost(), snapshot);
    expect(hydrated.getActiveSheet()).toBe("two");
    hydrated.destroy();
    grid.destroy();
  });

  it("reconciles the session active sheet after remote remove and hide", () => {
    const model = workbook([
      { id: "left", name: "Left" },
      { id: "hidden", name: "Hidden", visibility: "hidden" },
      { id: "middle", name: "Middle" },
      { id: "right", name: "Right" },
    ]);
    const grid = new GridImpl(mountHost(), { workbook: model });
    grid.setActiveSheet("middle");

    expect(grid.applyRemoteOperations([{ op: "removeSheet", sheet: "middle" }]).status).toBe(
      "applied",
    );
    expect(grid.getActiveSheet()).toBe("right");
    expect(model.activeSheet).toBe("left");

    grid.setActiveSheet("left");
    expect(
      grid.applyRemoteOperations([
        { op: "setSheetVisibility", sheet: "left", visibility: "hidden" },
      ]).status,
    ).toBe("applied");
    expect(grid.getActiveSheet()).toBe("right");
    expect(model.activeSheet).toBe("right");
    expect(grid.getCommandState("undo").disabled).toBe(true);

    grid.destroy();
  });

  it("rebases visibility conservatively without inventing order intent", () => {
    expect(
      rebaseDocumentOperations(
        [{ op: "setSheetVisibility", sheet: "one", visibility: "hidden" }],
        [{ op: "setSheetVisibility", sheet: "one", visibility: "hidden" }],
      ),
    ).toEqual({
      status: "rebased",
      operations: [{ op: "setSheetVisibility", sheet: "one", visibility: "hidden" }],
    });

    const visibilityConflict = rebaseDocumentOperations(
      [{ op: "setSheetVisibility", sheet: "one", visibility: "visible" }],
      [{ op: "setSheetVisibility", sheet: "one", visibility: "hidden" }],
    );
    expect(visibilityConflict.status).toBe("conflict");
    if (visibilityConflict.status === "conflict") {
      expect(visibilityConflict.conflict.code).toBe("sheet-lifecycle");
    }

    const removed = rebaseDocumentOperations(
      [{ op: "setSheetVisibility", sheet: "one", visibility: "hidden" }],
      [{ op: "removeSheet", sheet: "one" }],
    );
    expect(removed.status).toBe("conflict");
    if (removed.status === "conflict") expect(removed.conflict.code).toBe("sheet-removed");
  });
});
