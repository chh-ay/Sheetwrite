import { strToU8, zipSync } from "fflate";

const fixed = new Date(1980, 0, 1);
const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Fixture" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
const ordinarySheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>fixture</t></is></c></row></sheetData></worksheet>`;

function packageBytes(sheet: string, additions: Record<string, Uint8Array> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    ...additions,
  };
  return zipSync(files, { level: 9, mtime: fixed });
}

await Bun.write(
  new URL("shared-formula.xlsx", import.meta.url),
  packageBytes(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" si="0" ref="B1:B3">A1*2</f><v>2</v></c></row>
<row r="2"><c r="A2"><v>2</v></c><c r="B2"><f t="shared" si="0"/><v>4</v></c></row>
<row r="3"><c r="A3"><v>3</v></c><c r="B3"><f t="shared" si="0"/><v>6</v></c></row>
</sheetData></worksheet>`),
);
await Bun.write(
  new URL("traversal.xlsx", import.meta.url),
  packageBytes(ordinarySheet, { "../escape.xml": strToU8("escaped") }),
);
await Bun.write(
  new URL("doctype.xlsx", import.meta.url),
  packageBytes(
    `<?xml version="1.0"?><!DOCTYPE worksheet [<!ENTITY x "expanded">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&x;</t></is></c></row></sheetData></worksheet>`,
  ),
);
await Bun.write(
  new URL("deep-xml.xlsx", import.meta.url),
  packageBytes(
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${"<level>".repeat(80)}${"</level>".repeat(80)}</worksheet>`,
  ),
);
await Bun.write(
  new URL("compression-ratio.xlsx", import.meta.url),
  packageBytes(ordinarySheet, {
    "xl/unreferenced-compressible.xml": strToU8(`<data>${"A".repeat(1024 * 1024)}</data>`),
  }),
);
const corrupt = packageBytes(ordinarySheet).slice();
for (let offset = 0; offset + 30 < corrupt.length; ) {
  const view = new DataView(corrupt.buffer, corrupt.byteOffset, corrupt.byteLength);
  if (view.getUint32(offset, true) !== 0x04034b50) break;
  const compressedSize = view.getUint32(offset + 18, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const name = new TextDecoder().decode(corrupt.subarray(offset + 30, offset + 30 + nameLength));
  const dataOffset = offset + 30 + nameLength + extraLength;
  if (name === "xl/worksheets/sheet1.xml") {
    corrupt[dataOffset + Math.floor(compressedSize / 2)]! ^= 0x20;
    break;
  }
  offset = dataOffset + compressedSize;
}
await Bun.write(new URL("corrupt-deflate.xlsx", import.meta.url), corrupt);
