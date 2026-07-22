import { describe, expect, it } from "bun:test";
import type {
  SheetSnapshot,
  SheetVisibility,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";

function sheet(
  id: string,
  name: string,
  order: number,
  visibility?: SheetVisibility,
): SheetSnapshot {
  return {
    id,
    name,
    order,
    ...(visibility ? { visibility } : {}),
    rowCount: 1,
    columns: [{ key: "a", header: "A", width: 80, type: "text" }],
    cells: [],
  };
}

function snapshot(sheets: SheetSnapshot[], activeSheet = sheets[0]!.id): WorkbookSnapshot {
  return { schemaVersion: 1, workbook: { activeSheet }, sheets };
}

async function workbookXml(source: WorkbookSnapshot, warnings?: XlsxWorkbookWarning[]) {
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source, {
    ...(warnings ? { onWarning: (warning) => warnings.push(warning) } : {}),
  });
  const parts = unzipSync(bytes);
  return { bytes, xml: strFromU8(parts["xl/workbook.xml"]!) };
}

describe("XLSX worksheet lifecycle fidelity", () => {
  it("normalizes external worksheet names to NFC only at the import boundary", async () => {
    const decomposed = "Cafe\u0301";
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({ sheets: [{ name: decomposed, xml: worksheet("<sheetData/>") }] }),
    );

    expect(imported.sheets[0]!.name).toBe("Café");
    expect(imported.sheets[0]!.name).not.toBe(decomposed);

    const { xml } = await workbookXml(imported);
    expect(xml).toContain('name="Café"');

    const noncanonical = snapshot([sheet("s", decomposed, 0)]);
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(noncanonical)).rejects.toThrow();
    expect(noncanonical.sheets[0]!.name).toBe(decomposed);
  });

  it("rejects NFC and case-insensitive worksheet-name collisions on import and export", async () => {
    for (const names of [
      ["Café", "Cafe\u0301"],
      ["Data", "data"],
    ] as const) {
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          rawXlsx({
            sheets: names.map((name) => ({ name, xml: worksheet("<sheetData/>") })),
          }),
        ),
      ).rejects.toThrow();

      await expect(
        sheetwriteWorkbookBackend.toXlsxWorkbook(
          snapshot(names.map((name, order) => sheet(`s${order}`, name, order))),
        ),
      ).rejects.toThrow();
    }
  });

  it("applies canonical blank, forbidden-character, apostrophe-edge, and UTF-16 length rules", async () => {
    const invalidNames = ["", "Bad/Name", "'Edge", "Edge'", `${"😀".repeat(15)}AB`];
    for (const name of invalidNames) {
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          rawXlsx({ sheets: [{ name, xml: worksheet("<sheetData/>") }] }),
        ),
      ).rejects.toThrow();
      await expect(
        sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot([sheet("s", name, 0)])),
      ).rejects.toThrow();
    }

    const boundaryName = `${"😀".repeat(15)}A`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({ sheets: [{ name: boundaryName, xml: worksheet("<sheetData/>") }] }),
    );
    expect(imported.sheets[0]!.name).toBe(boundaryName);
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(imported)).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it("round-trips quoted cross-sheet reference syntax without asserting formula evaluation", async () => {
    const source = sheet("source", "Source", 0);
    source.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "ref", target: { sheet: "target", row: 0, col: 0 } },
          },
        ],
      },
    ];
    const target = sheet("target", "O'Brien Data", 1);
    const { bytes } = await workbookXml(snapshot([source, target], "source"));
    const parts = unzipSync(bytes);
    expect(strFromU8(parts["xl/worksheets/sheet1.xml"]!)).toContain(
      "<f>&apos;O&apos;&apos;Brien Data&apos;!A1</f>",
    );

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "ref",
      target: { sheet: "target", row: 0, col: 0 },
    });
  });

  it("round-trips visible, hidden, and veryHidden states with a visible activeTab fallback", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const source = snapshot(
      [
        sheet("hidden", "Hidden", 0, "hidden"),
        sheet("visible", "Visible", 1),
        sheet("very-hidden", "VeryHidden", 2, "veryHidden"),
      ],
      "hidden",
    );
    const { bytes, xml } = await workbookXml(source, warnings);

    expect(xml).toContain('<workbookView activeTab="1"/>');
    expect(xml).toContain('name="Hidden" sheetId="1" state="hidden"');
    expect(xml).toContain('name="Visible" sheetId="2"');
    expect(xml).toContain('name="VeryHidden" sheetId="3" state="veryHidden"');
    expect(warnings).toEqual([
      expect.objectContaining({
        code: "unsupported-feature",
        sheet: "Hidden",
      }),
    ]);

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.workbook.activeSheet).toBe("visible");
    expect(imported.sheets.map(({ id, visibility }) => [id, visibility])).toEqual([
      ["hidden", "hidden"],
      ["visible", undefined],
      ["very-hidden", "veryHidden"],
    ]);

    const hiddenActiveImport = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          { name: "Hidden", state: "hidden", xml: worksheet("<sheetData/>") },
          { name: "Visible", xml: worksheet("<sheetData/>") },
        ],
        workbookExtra: '<bookViews><workbookView activeTab="0"/></bookViews>',
      }),
    );
    expect(hiddenActiveImport.workbook.activeSheet).toBe(hiddenActiveImport.sheets[1]!.id);
  });

  it("rejects import and export when no ordinary worksheet is visible", async () => {
    await expect(
      sheetwriteWorkbookBackend.toXlsxWorkbook(
        snapshot(
          [
            sheet("hidden", "Hidden", 0, "hidden"),
            sheet("very-hidden", "VeryHidden", 1, "veryHidden"),
          ],
          "hidden",
        ),
      ),
    ).rejects.toThrow(/visible worksheet/i);

    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sheets: [
            { name: "Hidden", state: "hidden", xml: worksheet("<sheetData/>") },
            { name: "VeryHidden", state: "veryHidden", xml: worksheet("<sheetData/>") },
          ],
        }),
      ),
    ).rejects.toThrow(/visible worksheet/i);
  });
});
