interface OfficeCase {
  id: string;
  kind: "formula" | "workbook";
  inputs?: Array<{ cell: string; value: string | number | boolean | null }>;
  formula?: string;
  target?: string;
  numberFormat?: string;
}

interface OfficePayload {
  protocol: 1;
  producerVersion: string;
  cases: OfficeCase[];
}

function resultOf(range: ExcelScript.Range): Record<string, unknown> {
  const value = range.getValue();
  const displayedText = range.getText();
  const formula = range.getFormula();
  if (typeof value === "number") return { type: "number", value, displayedText, formula };
  if (typeof value === "boolean") return { type: "boolean", value, displayedText, formula };
  if (typeof value === "string" && value.startsWith("#")) {
    return { type: "error", error: value, displayedText, formula };
  }
  if (value === "") return { type: "blank", displayedText, formula };
  return { type: "string", value, displayedText, formula };
}

/** Office Script entry point copied verbatim into the protected Excel runner. */
export function main(
  workbook: ExcelScript.Workbook,
  payloadJson: string,
  scriptSha256: string,
): string {
  const payload = JSON.parse(payloadJson) as OfficePayload;
  if (payload.protocol !== 1 || !payload.producerVersion || !Array.isArray(payload.cases)) {
    throw new Error("Invalid conformance payload");
  }
  const existing = new Set(
    workbook
      .getWorksheets()
      .getItems()
      .map((sheet) => sheet.getName()),
  );
  const created: ExcelScript.Worksheet[] = [];
  const observations: Array<{ caseId: string; result: Record<string, unknown> }> = [];
  try {
    for (let index = 0; index < payload.cases.length; index += 1) {
      const entry = payload.cases[index]!;
      if (entry.kind !== "formula" || !entry.formula || !entry.target) continue;
      let name = `Case${String(index + 1).padStart(4, "0")}`;
      while (existing.has(name)) name = `_${name}`;
      existing.add(name);
      const sheet = workbook.getWorksheets().add(name);
      created.push(sheet);
      for (const input of entry.inputs ?? []) {
        if (input.value !== null) sheet.getRange(input.cell).setValue(input.value);
      }
      const target = sheet.getRange(entry.target);
      target.setFormula(entry.formula);
      if (entry.numberFormat) target.setNumberFormat([[entry.numberFormat]]);
    }
    workbook.getApplication().calculate("fullRebuild");
    let formulaIndex = 0;
    for (const entry of payload.cases) {
      if (entry.kind !== "formula" || !entry.target) continue;
      const sheet = created[formulaIndex++]!;
      observations.push({ caseId: entry.id, result: resultOf(sheet.getRange(entry.target)) });
    }
    return JSON.stringify({
      protocol: 1,
      producer: "excel-web",
      producerVersion: payload.producerVersion,
      capturedAt: new Date().toISOString(),
      scriptSha256,
      calculation: "fullRebuild",
      observations,
    });
  } finally {
    for (const sheet of created.reverse()) sheet.delete();
  }
}
