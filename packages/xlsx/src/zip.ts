import { Inflate, zipSync } from "fflate";
import { assertResource, checkAbort, inputView, type XlsxCodecContext } from "./resources.js";

const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const DOS_EPOCH = new Date(1980, 0, 1, 0, 0, 0, 0);

function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export interface ZipEntry {
  readonly name: string;
  readonly method: 0 | 8;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly dataOffset: number;
  readonly localOffset: number;
}

function fail(message: string): never {
  throw new TypeError(`Sheetwrite: invalid XLSX ZIP: ${message}`);
}

function findEocd(bytes: Uint8Array, view: DataView): number {
  const start = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return fail("end-of-central-directory record not found");
}
export function normalizeDecodedPartName(decoded: string, source = decoded): string {
  if (
    decoded.length === 0 ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    decoded.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(decoded)
  ) {
    return fail(`unsafe part name ${JSON.stringify(source)}`);
  }
  const segments = decoded.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return fail(`unsafe part name ${JSON.stringify(source)}`);
  }
  return segments.join("/");
}

/** Decode and validate one logical OPC part name without resolving traversal. */
export function normalizePartName(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fail(`part name ${JSON.stringify(value)} has invalid percent escaping`);
  }
  return normalizeDecodedPartName(decoded, value);
}

function parseEntries(bytes: Uint8Array, context: XlsxCodecContext): ZipEntry[] {
  if (bytes.byteLength < 22) return fail("archive is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (eocd + 22 + commentLength !== bytes.byteLength)
    return fail("trailing or truncated EOCD data");
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
    return fail("multi-disk archives are unsupported");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return fail("ZIP64 archives are unsupported");
  }
  assertResource(context, "maxArchiveEntries", entryCount);
  if (centralOffset + centralSize !== eocd || centralOffset + centralSize > bytes.byteLength) {
    return fail("central directory bounds are inconsistent");
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    checkAbort(context.options);
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return fail(`central directory entry ${index} is truncated`);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (end > eocd) return fail(`central directory entry ${index} exceeds its directory`);
    if ((flags & 1) !== 0) return fail("encrypted entries are unsupported");
    if (method !== 0 && method !== 8) return fail(`compression method ${method} is unsupported`);
    if (diskStart !== 0) return fail("multi-disk entry is unsupported");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      return fail("ZIP64 entry is unsupported");
    }
    let name: string;
    try {
      name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      return fail(`entry ${index} has an invalid UTF-8 name`);
    }
    const directory = name.endsWith("/");
    const normalized = normalizePartName(directory ? name.slice(0, -1) : name);
    name = directory ? `${normalized}/` : normalized;
    const foldedName = asciiFold(normalized);
    if (!directory) {
      if (names.has(foldedName)) return fail(`duplicate logical part name ${name}`);
      names.add(foldedName);
    }
    assertResource(context, "maxEntryUncompressedBytes", uncompressedSize);
    if (
      uncompressedSize > 0 &&
      (compressedSize === 0 ||
        uncompressedSize / compressedSize > context.limits.maxCompressionRatio)
    ) {
      assertResource(context, "maxCompressionRatio", uncompressedSize / compressedSize);
    }
    totalUncompressed += uncompressedSize;
    assertResource(context, "maxTotalUncompressedBytes", totalUncompressed);
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      return fail(`local header for ${name} is invalid`);
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    if (localFlags !== flags || localMethod !== method) return fail(`headers disagree for ${name}`);
    if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) {
      return fail(`local header for ${name} exceeds the file-data area`);
    }
    if (localNameLength !== nameLength) return fail(`local filename length disagrees for ${name}`);
    for (let byte = 0; byte < nameLength; byte++) {
      if (bytes[localOffset + 30 + byte] !== bytes[offset + 46 + byte]) {
        return fail(`local filename disagrees for ${name}`);
      }
    }
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    if (
      (flags & 8) === 0
        ? localCrc !== crc32 ||
          localCompressedSize !== compressedSize ||
          localUncompressedSize !== uncompressedSize
        : (localCrc !== 0 && localCrc !== crc32) ||
          (localCompressedSize !== 0 && localCompressedSize !== compressedSize) ||
          (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize)
    ) {
      return fail(`local sizes or CRC disagree for ${name}`);
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset)
      return fail(`compressed data for ${name} is truncated`);
    if (!directory) {
      entries.push({
        name,
        method,
        flags,
        crc32,
        compressedSize,
        uncompressedSize,
        dataOffset,
        localOffset,
      });
    }
    offset = end;
  }
  const localOrder = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index + 1 < localOrder.length; index++) {
    const current = localOrder[index]!;
    const next = localOrder[index + 1]!;
    if (current.dataOffset + current.compressedSize > next.localOffset) {
      return fail(`local file records overlap near ${current.name}`);
    }
  }
  if (offset !== eocd) return fail("central directory entry count is inconsistent");
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export class ZipArchive {
  readonly entries: ReadonlyMap<string, ZipEntry>;
  readonly #bytes: Uint8Array;
  readonly #context: XlsxCodecContext;
  readonly #lookup = new Map<string, ZipEntry>();
  readonly #cache = new Map<string, Uint8Array>();

  constructor(data: ArrayBuffer | Uint8Array, context: XlsxCodecContext) {
    this.#context = context;
    this.#bytes = inputView(data, context);
    const entries = parseEntries(this.#bytes, context);
    this.entries = new Map(entries.map((entry) => [entry.name, entry]));
    for (const entry of entries) this.#lookup.set(asciiFold(entry.name), entry);
  }

  has(name: string): boolean {
    return this.#lookup.has(asciiFold(normalizePartName(name)));
  }

  read(name: string): Uint8Array {
    const logicalName = normalizePartName(name);
    const entry = this.#lookup.get(asciiFold(logicalName));
    if (!entry) throw new TypeError(`Sheetwrite: XLSX package is missing ${logicalName}`);
    const cached = this.#cache.get(entry.name);
    if (cached) return cached;
    checkAbort(this.#context.options);
    const compressed = this.#bytes.subarray(
      entry.dataOffset,
      entry.dataOffset + entry.compressedSize,
    );
    const output = new Uint8Array(entry.uncompressedSize);
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize)
        return fail(`stored size mismatch for ${entry.name}`);
      output.set(compressed);
    } else {
      let written = 0;
      const inflater = new Inflate((chunk) => {
        if (written + chunk.byteLength > output.byteLength)
          return fail(`inflated size exceeds declaration for ${entry.name}`);
        output.set(chunk, written);
        written += chunk.byteLength;
      });
      try {
        inflater.push(compressed, true);
      } catch (error) {
        if (error instanceof TypeError && error.message.startsWith("Sheetwrite:")) throw error;
        return fail(`deflate stream for ${entry.name} is corrupt`);
      }
      if (written !== output.byteLength) return fail(`inflated size mismatch for ${entry.name}`);
    }
    if (crc32(output) !== entry.crc32) return fail(`CRC mismatch for ${entry.name}`);
    this.#cache.set(entry.name, output);
    return output;
  }
}

/** Serialize deterministic ZIP bytes after checking every source and output bound. */
export function writeZip(
  parts: ReadonlyMap<string, Uint8Array>,
  context: XlsxCodecContext,
): Uint8Array {
  assertResource(context, "maxArchiveEntries", parts.size);
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const [rawName, bytes] of [...parts].sort(([left], [right]) => left.localeCompare(right))) {
    const name = normalizePartName(rawName);
    assertResource(context, "maxEntryUncompressedBytes", bytes.byteLength);
    total += bytes.byteLength;
    assertResource(context, "maxTotalUncompressedBytes", total);
    files[name] = bytes;
  }
  const conservativeOutput = total + parts.size * 256;
  assertResource(context, "maxOutputBytes", conservativeOutput);
  checkAbort(context.options);
  const output = zipSync(files, { level: 6, mtime: DOS_EPOCH });
  assertResource(context, "maxOutputBytes", output.byteLength);
  return output;
}
