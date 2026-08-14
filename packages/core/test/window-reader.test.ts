import { describe, expect, it } from "bun:test";
import { decodePackedWindow } from "../src/store/window-reader.js";
import { KIND_BOOL, KIND_EMPTY, KIND_NUMBER, KIND_STRING } from "../src/store/wire-tags.js";

const HEADER_BYTES = 40;

function makePackedWindow(): Uint8Array {
  const kinds = new Uint8Array([KIND_EMPTY, KIND_NUMBER, KIND_STRING, KIND_BOOL]);
  const numbers = new Float64Array([0, 42.5, 0, 1]);
  const stringIds = new Uint32Array([0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff]);
  const stringIndex = new Int32Array([-1, -1, 0, -1]);
  const styleIds = new Uint32Array([0, 1, 1, 0]);
  const styleDict = new Uint32Array([4, 9]);
  const condMatches = new Uint32Array([0, 2, 1, 0]);
  const numbersStart = (HEADER_BYTES + kinds.length + 7) & ~7;
  const stringIdsStart = numbersStart + numbers.byteLength;
  const stringIndexStart = stringIdsStart + stringIds.byteLength;
  const styleIdsStart = stringIndexStart + stringIndex.byteLength;
  const styleDictStart = styleIdsStart + styleIds.byteLength;
  const condMatchesStart = styleDictStart + styleDict.byteLength;
  const totalBytes = condMatchesStart + condMatches.byteLength;
  const packed = new Uint8Array(totalBytes);
  const header = new DataView(packed.buffer);
  for (const [index, value] of [
    0x3157_4e53,
    1,
    HEADER_BYTES,
    totalBytes,
    2,
    2,
    kinds.length,
    styleDict.length,
    condMatches.length,
    1,
  ].entries()) {
    header.setUint32(index * 4, value, true);
  }
  packed.set(kinds, HEADER_BYTES);
  new Float64Array(packed.buffer, numbersStart, numbers.length).set(numbers);
  new Uint32Array(packed.buffer, stringIdsStart, stringIds.length).set(stringIds);
  new Int32Array(packed.buffer, stringIndexStart, stringIndex.length).set(stringIndex);
  new Uint32Array(packed.buffer, styleIdsStart, styleIds.length).set(styleIds);
  new Uint32Array(packed.buffer, styleDictStart, styleDict.length).set(styleDict);
  new Uint32Array(packed.buffer, condMatchesStart, condMatches.length).set(condMatches);
  return packed;
}

describe("packed window decoding", () => {
  it("exposes aligned owned-buffer views for every value kind, styles, and conditional masks", () => {
    const packed = makePackedWindow();
    const decoded = decodePackedWindow(packed);

    expect([decoded.nRows, decoded.nCols, decoded.localStringCount]).toEqual([2, 2, 1]);
    expect(Array.from(decoded.kinds)).toEqual([KIND_EMPTY, KIND_NUMBER, KIND_STRING, KIND_BOOL]);
    expect(Array.from(decoded.numbers)).toEqual([0, 42.5, 0, 1]);
    expect(Array.from(decoded.stringIds)).toEqual([
      0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff,
    ]);
    expect(Array.from(decoded.stringIndex)).toEqual([-1, -1, 0, -1]);
    expect(Array.from(decoded.styleIds)).toEqual([0, 1, 1, 0]);
    expect(Array.from(decoded.styleDict)).toEqual([4, 9]);
    expect(Array.from(decoded.condMatches)).toEqual([0, 2, 1, 0]);
    expect(decoded.kinds.buffer).toBe(packed.buffer);
    expect(decoded.numbers.buffer).toBe(packed.buffer);
    expect(decoded.numbers.byteOffset % Float64Array.BYTES_PER_ELEMENT).toBe(0);
  });

  it("rejects truncated, inconsistent, and unaligned layouts", () => {
    expect(() => decodePackedWindow(new Uint8Array(HEADER_BYTES - 1))).toThrow(
      "truncated packed window",
    );

    const truncated = makePackedWindow().slice(0, -1);
    expect(() => decodePackedWindow(truncated)).toThrow("truncated packed window");

    const badDimensions = makePackedWindow();
    new DataView(badDimensions.buffer).setUint32(24, 3, true);
    expect(() => decodePackedWindow(badDimensions)).toThrow("invalid packed window dimensions");

    const badConditionalLength = makePackedWindow();
    new DataView(badConditionalLength.buffer).setUint32(32, 1, true);
    expect(() => decodePackedWindow(badConditionalLength)).toThrow(
      "invalid packed conditional-match length",
    );

    const badStyleLength = makePackedWindow();
    new DataView(badStyleLength.buffer).setUint32(28, 3, true);
    expect(() => decodePackedWindow(badStyleLength)).toThrow("invalid packed window layout");

    const valid = makePackedWindow();
    const shifted = new Uint8Array(valid.byteLength + 1);
    shifted.set(valid, 1);
    expect(() => decodePackedWindow(shifted.subarray(1))).toThrow(
      "invalid packed window alignment",
    );
  });
});
