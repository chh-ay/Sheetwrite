import { emitWarning, type XlsxCodecContext } from "./resources.js";
import {
  assertXmlRoot,
  escapeXml,
  parseXml,
  XmlBuffer,
  type XmlElement,
  xmlAttribute,
  xmlChildren,
} from "./xml.js";
import { normalizeDecodedPartName, normalizePartName, ZipArchive } from "./zip.js";

const TRANSITIONAL_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const STRICT_REL_NS = "http://purl.oclc.org/ooxml/officeDocument/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

export function relationshipTypeMatches(type: string, kind: string): boolean {
  return type === `${TRANSITIONAL_REL_NS}/${kind}` || type === `${STRICT_REL_NS}/${kind}`;
}

function foldedPartName(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export interface OpcRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external: boolean;
}

function opcFailure(message: string): never {
  throw new TypeError(`Sheetwrite: invalid XLSX OPC package: ${message}`);
}

function relationshipsPart(sourcePart: string): string {
  if (sourcePart === "") return "_rels/.rels";
  const slash = sourcePart.lastIndexOf("/");
  const directory = slash < 0 ? "" : sourcePart.slice(0, slash + 1);
  const filename = sourcePart.slice(slash + 1);
  return `${directory}_rels/${filename}.rels`;
}

function relationshipSourcePart(part: string): string {
  if (part.toLowerCase() === "_rels/.rels") return "";
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/i.exec(part);
  if (!match) return opcFailure(`relationship part name ${part} is invalid`);
  return `${match[1] ?? ""}${match[2]}`;
}

function resolveRelationshipTarget(sourcePart: string, rawTarget: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch {
    return opcFailure(`relationship target ${rawTarget} has invalid escaping`);
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("?") ||
    decoded.includes("#")
  ) {
    return opcFailure(`relationship target ${rawTarget} is unsafe`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded))
    return opcFailure(`internal relationship target ${rawTarget} has a URI scheme`);
  const output = decoded.startsWith("/")
    ? []
    : sourcePart
        .slice(0, Math.max(0, sourcePart.lastIndexOf("/") + 1))
        .split("/")
        .filter(Boolean);
  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (output.length === 0)
        return opcFailure(`relationship target ${rawTarget} escapes the package`);
      output.pop();
    } else output.push(segment);
  }
  return normalizeDecodedPartName(output.join("/"), rawTarget);
}

function parseRelationships(
  root: XmlElement,
  sourcePart: string,
  context: XlsxCodecContext,
): OpcRelationship[] {
  assertXmlRoot(root, "Relationships", [PACKAGE_REL_NS], relationshipsPart(sourcePart));
  const relationships: OpcRelationship[] = [];
  const ids = new Set<string>();
  for (const element of xmlChildren(root, "Relationship")) {
    const id = xmlAttribute(element, "Id");
    const type = xmlAttribute(element, "Type");
    const rawTarget = xmlAttribute(element, "Target");
    if (!id || !type || !rawTarget)
      return opcFailure(`relationship in ${relationshipsPart(sourcePart)} is incomplete`);
    if (ids.has(id))
      return opcFailure(`duplicate relationship id ${id} in ${relationshipsPart(sourcePart)}`);
    ids.add(id);
    const external = xmlAttribute(element, "TargetMode") === "External";
    if (external && !relationshipTypeMatches(type, "hyperlink")) {
      emitWarning(context, {
        code: "external-relationship",
        message: `External relationship ${id} was not followed`,
        part: sourcePart || "/",
      });
    }
    relationships.push({
      id,
      type,
      target: external ? rawTarget : resolveRelationshipTarget(sourcePart, rawTarget),
      external,
    });
  }
  return relationships;
}

export class OpcPackage {
  readonly archive: ZipArchive;
  readonly contentTypes = new Map<string, string>();
  readonly defaultContentTypes = new Map<string, string>();
  readonly #context: XlsxCodecContext;
  readonly #relationshipCache = new Map<string, readonly OpcRelationship[]>();

  constructor(data: ArrayBuffer | Uint8Array, context: XlsxCodecContext) {
    this.#context = context;
    this.archive = new ZipArchive(data, context);
    const root = this.readXml("[Content_Types].xml");
    assertXmlRoot(root, "Types", [CONTENT_TYPES_NS], "[Content_Types].xml");
    for (const item of root.children) {
      const local = item.name.includes(":")
        ? item.name.slice(item.name.indexOf(":") + 1)
        : item.name;
      const contentType = xmlAttribute(item, "ContentType");
      if (!contentType) opcFailure("content type declaration is incomplete");
      if (local === "Default") {
        const extension = xmlAttribute(item, "Extension")?.toLowerCase();
        if (!extension) opcFailure("default content type has no extension");
        this.defaultContentTypes.set(extension, contentType);
      } else if (local === "Override") {
        const rawName = xmlAttribute(item, "PartName");
        if (!rawName?.startsWith("/")) opcFailure("override part name must be absolute");
        const name = normalizePartName(rawName.slice(1));
        const foldedName = foldedPartName(name);
        if (!this.archive.has(name)) {
          emitWarning(context, {
            code: "unsupported-feature",
            message: `Ignored content type for missing part ${name}`,
            part: name,
          });
          continue;
        }
        this.contentTypes.set(foldedName, contentType);
      }
    }
    for (const part of this.archive.entries.keys()) {
      if (!part.toLowerCase().endsWith(".rels")) continue;
      const sourcePart = relationshipSourcePart(part);
      const relationships = parseRelationships(this.readXml(part), sourcePart, context);
      this.#relationshipCache.set(foldedPartName(sourcePart), relationships);
    }
  }

  read(part: string): Uint8Array {
    return this.archive.read(normalizePartName(part));
  }

  readXml(part: string): XmlElement {
    const name = normalizePartName(part);
    return parseXml(this.archive.read(name), name, this.#context);
  }

  relationships(sourcePart: string): readonly OpcRelationship[] {
    const normalizedSource = sourcePart === "" ? "" : normalizePartName(sourcePart);
    const key = normalizedSource === "" ? "" : foldedPartName(normalizedSource);
    const cached = this.#relationshipCache.get(key);
    if (cached) return cached;
    const part = relationshipsPart(normalizedSource);
    if (!this.archive.has(part)) {
      this.#relationshipCache.set(key, []);
      return [];
    }
    const parsed = parseRelationships(this.readXml(part), normalizedSource, this.#context);
    this.#relationshipCache.set(key, parsed);
    return parsed;
  }

  relationship(sourcePart: string, id: string): OpcRelationship {
    const relationship = this.relationships(sourcePart).find((candidate) => candidate.id === id);
    if (!relationship || relationship.external)
      return opcFailure(`relationship ${id} from ${sourcePart || "/"} is unavailable`);
    return relationship;
  }

  officeDocumentPart(): string {
    const relationship = this.relationships("").find(
      (candidate) =>
        relationshipTypeMatches(candidate.type, "officeDocument") && !candidate.external,
    );
    if (!relationship) return opcFailure("office document relationship is missing");
    return relationship.target;
  }

  contentType(part: string): string | undefined {
    const normalized = normalizePartName(part);
    const exact = this.contentTypes.get(foldedPartName(normalized));
    if (exact) return exact;
    const dot = normalized.lastIndexOf(".");
    return dot < 0
      ? undefined
      : this.defaultContentTypes.get(normalized.slice(dot + 1).toLowerCase());
  }
}

export interface ContentTypeOverride {
  readonly part: string;
  readonly contentType: string;
}

export function contentTypesXml(
  overrides: readonly ContentTypeOverride[],
  context: XlsxCodecContext,
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">');
  xml.append(
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  );
  xml.append('<Default Extension="xml" ContentType="application/xml"/>');
  for (const override of [...overrides].sort((left, right) =>
    left.part.localeCompare(right.part),
  )) {
    xml.append(
      `<Override PartName="/${normalizePartName(override.part)}" ContentType="${override.contentType}"/>`,
    );
  }
  xml.append("</Types>");
  return xml.finish();
}

export function relationshipsXml(
  relationships: readonly (Pick<OpcRelationship, "id" | "type" | "target"> & {
    readonly external?: boolean;
  })[],
  context: XlsxCodecContext,
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  );
  for (const relationship of relationships) {
    xml.append(
      `<Relationship Id="${escapeXml(relationship.id)}" Type="${escapeXml(relationship.type)}" Target="${escapeXml(relationship.target)}"${relationship.external ? ' TargetMode="External"' : ""}/>`,
    );
  }
  xml.append("</Relationships>");
  return xml.finish();
}
