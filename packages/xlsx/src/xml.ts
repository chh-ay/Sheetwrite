import { assertResource, checkAbort, type XlsxCodecContext } from "./resources.js";

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const ENCODER = new TextEncoder();
const XML_NAME = /^[A-Za-z_][A-Za-z\d_.:-]*/;

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

interface MutableXmlElement {
  name: string;
  attributes: Record<string, string>;
  children: MutableXmlElement[];
  text: string;
  textBytes: number;
}

function xmlFailure(part: string, message: string): never {
  throw new TypeError(`Sheetwrite: invalid XLSX XML in ${part}: ${message}`);
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const trail = value.charCodeAt(index + 1);
      if (trail >= 0xdc00 && trail <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function decodeXmlEntities(value: string, part: string): string {
  if (!value.includes("&")) return value;
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf("&", cursor);
    if (ampersand < 0) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0) return xmlFailure(part, "unterminated entity reference");
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity === "amp") output += "&";
    else if (entity === "lt") output += "<";
    else if (entity === "gt") output += ">";
    else if (entity === "quot") output += '"';
    else if (entity === "apos") output += "'";
    else {
      const numeric = /^#(\d+)$/.exec(entity);
      const hexadecimal = /^#x([\da-f]+)$/i.exec(entity);
      if (!numeric && !hexadecimal) return xmlFailure(part, `unknown entity &${entity};`);
      const codePoint = Number.parseInt(numeric?.[1] ?? hexadecimal![1]!, numeric ? 10 : 16);
      const validXmlCharacter =
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff);
      if (!validXmlCharacter) {
        return xmlFailure(part, `invalid character reference &${entity};`);
      }
      output += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return output;
}

function findTagEnd(xml: string, start: number, part: string): number {
  let quote = "";
  for (let index = start; index < xml.length; index++) {
    const char = xml[index]!;
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ">") return index;
  }
  return xmlFailure(part, "unterminated tag");
}

function parseStartTag(
  source: string,
  part: string,
  context: XlsxCodecContext,
): { name: string; attributes: Record<string, string>; selfClosing: boolean } {
  let offset = 0;
  while (/\s/.test(source[offset] ?? "")) offset += 1;
  const nameMatch = XML_NAME.exec(source.slice(offset));
  if (!nameMatch) return xmlFailure(part, "element name is invalid");
  const name = nameMatch[0];
  offset += name.length;
  const attributes: Record<string, string> = Object.create(null);
  let attributeCount = 0;
  let selfClosing = false;
  while (offset < source.length) {
    while (/\s/.test(source[offset] ?? "")) offset += 1;
    if (source[offset] === "/") {
      selfClosing = true;
      offset += 1;
      while (/\s/.test(source[offset] ?? "")) offset += 1;
      if (offset !== source.length)
        return xmlFailure(part, "unexpected content after self-closing slash");
      break;
    }
    if (offset === source.length) break;
    const attributeMatch = XML_NAME.exec(source.slice(offset));
    if (!attributeMatch) return xmlFailure(part, `attribute on ${name} is invalid`);
    const attributeName = attributeMatch[0];
    offset += attributeName.length;
    while (/\s/.test(source[offset] ?? "")) offset += 1;
    if (source[offset] !== "=") return xmlFailure(part, `attribute ${attributeName} has no value`);
    offset += 1;
    while (/\s/.test(source[offset] ?? "")) offset += 1;
    const quote = source[offset];
    if (quote !== '"' && quote !== "'")
      return xmlFailure(part, `attribute ${attributeName} is unquoted`);
    const end = source.indexOf(quote, offset + 1);
    if (end < 0) return xmlFailure(part, `attribute ${attributeName} is unterminated`);
    if (Object.hasOwn(attributes, attributeName))
      return xmlFailure(part, `attribute ${attributeName} is duplicated`);
    attributeCount += 1;
    assertResource(context, "maxXmlAttributesPerElement", attributeCount);
    const attributeValue = decodeXmlEntities(source.slice(offset + 1, end), part);
    assertResource(context, "maxXmlTextBytes", utf8Length(attributeValue));
    attributes[attributeName] = attributeValue;
    offset = end + 1;
  }
  return { name, attributes, selfClosing };
}

/** Parse a bounded XML part without DTDs, custom entities, or network-capable constructs. */
export function parseXml(bytes: Uint8Array, part: string, context: XlsxCodecContext): XmlElement {
  assertResource(context, "maxEntryUncompressedBytes", bytes.byteLength);
  let xml: string;
  try {
    xml = UTF8.decode(bytes);
  } catch {
    return xmlFailure(part, "content is not valid UTF-8");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return xmlFailure(part, "DTDs and entities are forbidden");
  const roots: MutableXmlElement[] = [];
  const stack: MutableXmlElement[] = [];
  let elementCount = 0;
  let cursor = 0;
  const appendText = (raw: string, cdata = false): void => {
    if (raw.length === 0) return;
    const current = stack.at(-1);
    const decoded = cdata ? raw : decodeXmlEntities(raw, part);
    const decodedBytes = utf8Length(decoded);
    if (!current) {
      if (decoded.trim().length > 0) xmlFailure(part, "text exists outside the root element");
      return;
    }
    current.textBytes += decodedBytes;
    assertResource(context, "maxXmlTextBytes", current.textBytes);
    current.text += decoded;
  };

  while (cursor < xml.length) {
    if ((elementCount & 4_095) === 0) checkAbort(context.options);
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      appendText(xml.slice(cursor));
      cursor = xml.length;
      break;
    }
    appendText(xml.slice(cursor, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) return xmlFailure(part, "comment is unterminated");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) return xmlFailure(part, "CDATA is unterminated");
      appendText(xml.slice(open + 9, end), true);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) return xmlFailure(part, "processing instruction is unterminated");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("</", open)) {
      const end = xml.indexOf(">", open + 2);
      if (end < 0) return xmlFailure(part, "closing tag is unterminated");
      const name = xml.slice(open + 2, end).trim();
      const current = stack.pop();
      if (!current || current.name !== name)
        return xmlFailure(part, `closing tag ${name} does not match`);
      cursor = end + 1;
      continue;
    }
    if (xml.startsWith("<!", open)) return xmlFailure(part, "unsupported declaration");
    const end = findTagEnd(xml, open + 1, part);
    const parsed = parseStartTag(xml.slice(open + 1, end), part, context);
    elementCount += 1;
    assertResource(context, "maxXmlElements", elementCount);
    const element: MutableXmlElement = {
      name: parsed.name,
      attributes: parsed.attributes,
      children: [],
      text: "",
      textBytes: 0,
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else roots.push(element);
    if (!parsed.selfClosing) {
      stack.push(element);
      assertResource(context, "maxXmlDepth", stack.length);
    }
    cursor = end + 1;
  }
  if (stack.length > 0) return xmlFailure(part, `element ${stack.at(-1)!.name} is unclosed`);
  if (roots.length !== 1)
    return xmlFailure(part, `expected one root element, found ${roots.length}`);
  return roots[0]!;
}

export function xmlLocalName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

export function xmlChildren(element: XmlElement, localName: string): readonly XmlElement[] {
  return element.children.filter((child) => xmlLocalName(child.name) === localName);
}

export function xmlChild(element: XmlElement, localName: string): XmlElement | undefined {
  return element.children.find((child) => xmlLocalName(child.name) === localName);
}

export function xmlAttribute(element: XmlElement, localName: string): string | undefined {
  for (const [name, value] of Object.entries(element.attributes)) {
    if (xmlLocalName(name) === localName) return value;
  }
  return undefined;
}

export function xmlBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/** Decode SpreadsheetML's UTF-16 `_xHHHH_` string escapes. */
export function decodeXstring(value: string): string {
  if (!/_x[\da-f]{4}_/i.test(value)) return value;
  let output = "";
  for (let index = 0; index < value.length; ) {
    const literalEscape = /^_x005F_(x[\da-f]{4}_)/i.exec(value.slice(index));
    if (literalEscape) {
      output += `_${literalEscape[1]}`;
      index += literalEscape[0].length;
      continue;
    }
    const encoded = /^_x([\da-f]{4})_/i.exec(value.slice(index));
    if (encoded) {
      output += String.fromCharCode(Number.parseInt(encoded[1]!, 16));
      index += encoded[0].length;
      continue;
    }
    output += value[index]!;
    index += 1;
  }
  return output;
}

/** Encode XML-forbidden UTF-16 units and literal escape-looking text as ST_Xstring. */
export function encodeXstring(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x5f && /^x[\da-f]{4}_/i.test(value.slice(index + 1))) {
      output += "_x005F_";
    } else if (
      code <= 0x8 ||
      code === 0xb ||
      code === 0xc ||
      (code >= 0xe && code <= 0x1f) ||
      code === 0xfffe ||
      code === 0xffff ||
      (code >= 0xd800 &&
        code <= 0xdfff &&
        !(
          code <= 0xdbff &&
          index + 1 < value.length &&
          value.charCodeAt(index + 1) >= 0xdc00 &&
          value.charCodeAt(index + 1) <= 0xdfff
        ))
    ) {
      output += `_x${code.toString(16).toUpperCase().padStart(4, "0")}_`;
    } else {
      output += value[index]!;
      if (code >= 0xd800 && code <= 0xdbff) output += value[++index]!;
    }
  }
  return output;
}

/** Require an expected OOXML root and one allowed Strict/Transitional namespace. */
export function assertXmlRoot(
  root: XmlElement,
  localName: string,
  namespaces: readonly string[],
  part: string,
): void {
  const colon = root.name.indexOf(":");
  const namespace =
    colon < 0 ? root.attributes.xmlns : root.attributes[`xmlns:${root.name.slice(0, colon)}`];
  if (xmlLocalName(root.name) !== localName || !namespace || !namespaces.includes(namespace)) {
    xmlFailure(part, `expected ${localName} in an allowed OOXML namespace`);
  }
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Incrementally bounds generated XML before joining and UTF-8 encoding it. */
export class XmlBuffer {
  readonly #parts: string[] = [];
  #bytes = 0;

  constructor(private readonly context: XlsxCodecContext) {}

  append(value: string): void {
    this.#bytes += utf8Length(value);
    assertResource(this.context, "maxEntryUncompressedBytes", this.#bytes);
    this.#parts.push(value);
  }

  appendText(value: string): void {
    const encoded = escapeXml(encodeXstring(value));
    assertResource(this.context, "maxXmlTextBytes", utf8Length(encoded));
    this.append(encoded);
  }

  finish(): Uint8Array {
    checkAbort(this.context.options);
    return ENCODER.encode(this.#parts.join(""));
  }
}
