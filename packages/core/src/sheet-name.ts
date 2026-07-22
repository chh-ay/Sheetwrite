function hasForbiddenSheetNameCharacter(name: string): boolean {
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);
    if (code <= 0x1f || "\\/*?:[]".includes(name[index]!)) return true;
  }
  return false;
}

/** Stable reason codes returned by worksheet-name validation. */
export type SheetNameIssueCode =
  | "blank"
  | "too-long"
  | "forbidden-character"
  | "edge-apostrophe"
  | "duplicate";

/** Successful canonical name or an actionable validation failure. */
export type SheetNameValidationResult =
  | {
      readonly ok: true;
      /** NFC-normalized display name stored in the document. */
      readonly name: string;
      /** Case-insensitive canonical comparison key. */
      readonly key: string;
    }
  | {
      readonly ok: false;
      readonly code: SheetNameIssueCode;
      /** NFC-normalized candidate, retained for inline editor display. */
      readonly name: string;
      /** Case-insensitive canonical comparison key. */
      readonly key: string;
    };

/** NFC and locale-independent Unicode lowercase key used for worksheet-name identity. */
export function sheetNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * Validate and canonicalize a SpreadsheetML worksheet name.
 *
 * Length is measured in UTF-16 code units, matching SpreadsheetML and JavaScript
 * string length. Callers renaming an existing sheet should omit that sheet's
 * current name from `existingNames`.
 */
export function validateSheetName(
  name: string,
  existingNames: readonly string[] = [],
): SheetNameValidationResult {
  const normalized = name.normalize("NFC");
  const key = sheetNameKey(normalized);
  let code: SheetNameIssueCode | null = null;
  if (normalized.trim().length === 0) code = "blank";
  else if (normalized.length > 31) code = "too-long";
  else if (normalized.startsWith("'") || normalized.endsWith("'")) code = "edge-apostrophe";
  else if (hasForbiddenSheetNameCharacter(normalized)) {
    code = "forbidden-character";
  } else if (existingNames.some((existing) => sheetNameKey(existing) === key)) {
    code = "duplicate";
  }
  return code === null
    ? { ok: true, name: normalized, key }
    : { ok: false, code, name: normalized, key };
}
