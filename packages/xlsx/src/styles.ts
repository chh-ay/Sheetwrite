import type { CellBorder, CellStyle } from "@sheetwrite/core";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import {
  assertXmlRoot,
  escapeXml,
  XmlBuffer,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
} from "./xml.js";

const BUILTIN_NUMBER_FORMATS: Readonly<Record<number, string>> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

const MAIN_NAMESPACES = [
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://purl.oclc.org/ooxml/spreadsheetml/main",
] as const;
const DRAWING_NAMESPACES = [
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
] as const;
const INDEXED_COLORS = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
] as const;

interface FontRecord {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly fontSize?: number;
  readonly color?: string;
}

interface FillRecord {
  readonly backgroundColor?: string;
}

interface BorderRecord {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface ParsedCellStyle {
  readonly style?: CellStyle;
  readonly numberFormat?: string;
  readonly date: boolean;
}

function argb(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const color = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(color)) {
    return `FF${[...color]
      .map((component) => component.repeat(2))
      .join("")
      .toUpperCase()}`;
  }
  if (/^[\da-f]{6}$/i.test(color)) return `FF${color.toUpperCase()}`;
  if (/^[\da-f]{8}$/i.test(color)) return color.toUpperCase();
  return undefined;
}

function sheetwriteColor(value: string | undefined): string | undefined {
  if (!value || !/^[\da-f]{8}$/i.test(value)) return undefined;
  return `#${value.slice(2).toUpperCase()}`;
}

function tintColor(value: string, tint: number): string {
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels as [number, number, number];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  let lightness = (maximum + minimum) / 2;
  if (maximum !== minimum) {
    const delta = maximum - minimum;
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }
  hue = Math.round(hue * 240) / 240;
  saturation = Math.round(saturation * 240) / 240;
  lightness = Math.round(lightness * 240);
  lightness =
    Math.round(tint < 0 ? lightness * (1 + tint) : lightness * (1 - tint) + 240 * tint) / 240;
  const hueChannel = (first: number, second: number, offset: number): number => {
    let normalized = offset;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < 1 / 6) return first + (second - first) * 6 * normalized;
    if (normalized < 1 / 2) return second;
    if (normalized < 2 / 3) return first + (second - first) * (2 / 3 - normalized) * 6;
    return first;
  };
  const output =
    saturation === 0
      ? [lightness, lightness, lightness]
      : (() => {
          const second =
            lightness < 0.5
              ? lightness * (1 + saturation)
              : lightness + saturation - lightness * saturation;
          const first = 2 * lightness - second;
          return [
            hueChannel(first, second, hue + 1 / 3),
            hueChannel(first, second, hue),
            hueChannel(first, second, hue - 1 / 3),
          ];
        })();
  return output
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function parsedThemeColors(
  root: XmlElement | undefined,
  part: string,
): ReadonlyMap<number, string> {
  const colors = new Map<number, string>();
  if (!root) return colors;
  assertXmlRoot(root, "theme", DRAWING_NAMESPACES, part);
  const scheme = xmlChild(xmlChild(root, "themeElements") ?? root, "clrScheme");
  if (!scheme) return colors;
  const names = [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ] as const;
  for (let index = 0; index < names.length; index++) {
    const item = xmlChild(scheme, names[index]!);
    const source = item?.children[0];
    const raw =
      source &&
      (source.name.endsWith("sysClr")
        ? xmlAttribute(source, "lastClr")
        : xmlAttribute(source, "val"));
    if (raw && /^[\da-f]{6}$/i.test(raw)) colors.set(index, raw.toUpperCase());
  }
  return colors;
}

function resolvedColor(
  element: XmlElement | undefined,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): string | undefined {
  if (!element) return undefined;
  const rgb = sheetwriteColor(xmlAttribute(element, "rgb"));
  let sixDigit = rgb?.slice(1);
  const themeIndex = Number(xmlAttribute(element, "theme"));
  const indexed = Number(xmlAttribute(element, "indexed"));
  if (!sixDigit && Number.isInteger(themeIndex)) sixDigit = theme.get(themeIndex);
  if (!sixDigit && Number.isInteger(indexed) && indexed >= 0 && indexed < INDEXED_COLORS.length) {
    sixDigit = INDEXED_COLORS[indexed];
  }
  if (!sixDigit) {
    const key = JSON.stringify(element.attributes);
    if (!warnings.has(key)) {
      warnings.add(key);
      emitWarning(context, {
        code: "format-loss",
        message: "An automatic, invalid, or unavailable theme style color was dropped",
        part,
      });
    }
    return undefined;
  }
  const rawTint = xmlAttribute(element, "tint");
  if (rawTint !== undefined) {
    const tint = Number(rawTint);
    if (!Number.isFinite(tint) || tint < -1 || tint > 1) {
      emitWarning(context, {
        code: "format-loss",
        message: `Invalid style color tint ${rawTint} was ignored`,
        part,
      });
    } else {
      sixDigit = tintColor(sixDigit, tint);
    }
  }
  return `#${sixDigit}`;
}

function canonicalStyle(style: CellStyle | undefined): CellStyle | undefined {
  if (!style) return undefined;
  const border = style.border;
  const orderedBorder = border
    ? {
        ...(border.all ? { all: { ...border.all } } : {}),
        ...(border.top ? { top: { ...border.top } } : {}),
        ...(border.right ? { right: { ...border.right } } : {}),
        ...(border.bottom ? { bottom: { ...border.bottom } } : {}),
        ...(border.left ? { left: { ...border.left } } : {}),
      }
    : undefined;
  const ordered: CellStyle = {
    ...(style.bold !== undefined ? { bold: style.bold } : {}),
    ...(style.italic !== undefined ? { italic: style.italic } : {}),
    ...(style.underline !== undefined ? { underline: style.underline } : {}),
    ...(style.strikethrough !== undefined ? { strikethrough: style.strikethrough } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.backgroundColor !== undefined ? { backgroundColor: style.backgroundColor } : {}),
    ...(style.align !== undefined ? { align: style.align } : {}),
    ...(style.wrap !== undefined ? { wrap: style.wrap } : {}),
    ...(orderedBorder && Object.keys(orderedBorder).length > 0 ? { border: orderedBorder } : {}),
  };
  return Object.keys(ordered).length > 0 ? ordered : undefined;
}

function borderStyle(border: CellBorder | undefined): string | undefined {
  if (!border) return undefined;
  if (border.style === "dashed") return (border.width ?? 1) >= 2 ? "mediumDashed" : "dashed";
  if (border.style === "dotted") return "dotted";
  return (border.width ?? 1) >= 2 ? "medium" : "thin";
}

function importedBorder(
  element: XmlElement | undefined,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): CellBorder | undefined {
  if (!element) return undefined;
  const rawStyle = xmlAttribute(element, "style");
  const color = resolvedColor(xmlChild(element, "color"), theme, context, warnings, part);
  if (!rawStyle && !color) return undefined;
  const border: CellBorder = {};
  if (rawStyle === "dashed" || rawStyle?.includes("Dash")) border.style = "dashed";
  else if (rawStyle === "dotted") border.style = "dotted";
  else if (rawStyle) border.style = "solid";
  if (
    rawStyle === "medium" ||
    rawStyle === "thick" ||
    rawStyle === "double" ||
    rawStyle?.startsWith("medium")
  ) {
    border.width = 2;
  } else if (rawStyle) {
    border.width = 1;
  }
  if (color) border.color = color;
  return border;
}

function styleKey(style: CellStyle | undefined, numberFormat: string | undefined): string {
  return JSON.stringify([canonicalStyle(style) ?? null, numberFormat ?? null]);
}

function dateNumberFormat(format: string | undefined): boolean {
  if (!format) return false;
  const hasElapsedTime = /\[(?:h+|m+|s+)\]/i.test(format);
  const stripped = format.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "").toLowerCase();
  return hasElapsedTime || /[ymdhis]/.test(stripped);
}

function fontXml(font: FontRecord): string {
  let xml = "<font>";
  if (font.bold) xml += "<b/>";
  if (font.italic) xml += "<i/>";
  if (font.underline) xml += "<u/>";
  if (font.strikethrough) xml += "<strike/>";
  if (font.fontSize !== undefined) xml += `<sz val="${(font.fontSize * 72) / 96}"/>`;
  const color = argb(font.color);
  if (color) xml += `<color rgb="${color}"/>`;
  return `${xml}</font>`;
}

function borderSideXml(name: string, border: CellBorder | undefined): string {
  const style = borderStyle(border);
  if (!style) return `<${name}/>`;
  const color = argb(border?.color);
  return `<${name} style="${style}">${color ? `<color rgb="${color}"/>` : ""}</${name}>`;
}

function styleFont(style: CellStyle | undefined): FontRecord {
  return {
    ...(style?.bold ? { bold: true } : {}),
    ...(style?.italic ? { italic: true } : {}),
    ...(style?.underline ? { underline: true } : {}),
    ...(style?.strikethrough ? { strikethrough: true } : {}),
    ...(style?.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(argb(style?.color) ? { color: style!.color } : {}),
  };
}

function styleBorder(style: CellStyle | undefined): BorderRecord {
  const result: BorderRecord = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = style?.border?.[side] ?? style?.border?.all;
    if (value && (borderStyle(value) || argb(value.color))) result[side] = value;
  }
  return result;
}

function differentialXml(style: CellStyle): string {
  const font = styleFont(style);
  const border = styleBorder(style);
  let xml = "<dxf>";
  if (Object.keys(font).length > 0) xml += fontXml(font);
  const fillColor = argb(style.backgroundColor);
  if (fillColor) {
    xml += `<fill><patternFill><bgColor rgb="${fillColor}"/></patternFill></fill>`;
  }
  if (Object.keys(border).length > 0) {
    xml += `<border>${borderSideXml("left", border.left)}${borderSideXml("right", border.right)}${borderSideXml("top", border.top)}${borderSideXml("bottom", border.bottom)}</border>`;
  }
  if (style.align !== undefined || style.wrap !== undefined) {
    xml += `<alignment${style.align ? ` horizontal="${style.align}"` : ""}${style.wrap ? ' wrapText="1"' : ""}/>`;
  }
  return `${xml}</dxf>`;
}

/** Deterministic style table shared by table and workbook writers. */
export class StylesRegistry {
  readonly #context: XlsxCodecContext;
  readonly #styles: { style?: CellStyle; numberFormat?: string }[] = [{}];
  readonly #styleIds = new Map<string, number>([[styleKey(undefined, undefined), 0]]);
  readonly #differentials: CellStyle[] = [];
  readonly #differentialIds = new Map<string, number>();

  constructor(context: XlsxCodecContext) {
    this.#context = context;
  }

  register(style: CellStyle | undefined, numberFormat: string | undefined): number {
    const cleanedStyle = canonicalStyle(style);
    const cleanedFormat = numberFormat && numberFormat !== "General" ? numberFormat : undefined;
    const key = styleKey(cleanedStyle, cleanedFormat);
    const existing = this.#styleIds.get(key);
    if (existing !== undefined) return existing;
    for (const [side, border] of Object.entries(cleanedStyle?.border ?? {})) {
      if (border?.width !== undefined && border.width !== 1 && border.width !== 2) {
        emitWarning(this.#context, {
          code: "format-loss",
          message: `Border ${side} width ${border.width} is preserved in metadata; native XLSX uses the closest standard width`,
          part: "xl/styles.xml",
        });
      }
    }
    const id = this.#styles.length;
    assertResource(this.#context, "maxStyles", id + 1);
    this.#styles.push({ style: cleanedStyle, numberFormat: cleanedFormat });
    this.#styleIds.set(key, id);
    return id;
  }

  registerDifferential(style: CellStyle): number {
    const cleaned = canonicalStyle(style) ?? {};
    const key = JSON.stringify(cleaned);
    const existing = this.#differentialIds.get(key);
    if (existing !== undefined) return existing;
    for (const [side, border] of Object.entries(cleaned.border ?? {})) {
      if (border?.width !== undefined && border.width !== 1 && border.width !== 2) {
        emitWarning(this.#context, {
          code: "format-loss",
          message: `Conditional-format border ${side} width ${border.width} is preserved in metadata; native XLSX uses the closest standard width`,
          part: "xl/styles.xml",
        });
      }
    }
    const id = this.#differentials.length;
    assertResource(this.#context, "maxStyles", this.#styles.length + id + 1);
    this.#differentials.push(cleaned);
    this.#differentialIds.set(key, id);
    return id;
  }

  toXml(): Uint8Array {
    const fonts: FontRecord[] = [{}];
    const fills: FillRecord[] = [{}, {}];
    const borders: BorderRecord[] = [{}];
    const fontIds = new Map<string, number>([["{}", 0]]);
    const fillIds = new Map<string, number>([["{}", 0]]);
    const borderIds = new Map<string, number>([["{}", 0]]);
    const customFormats: string[] = [];
    const customFormatIds = new Map<string, number>();
    const xfs: {
      fontId: number;
      fillId: number;
      borderId: number;
      numFmtId: number;
      alignment?: CellStyle;
    }[] = [];

    for (const record of this.#styles) {
      const style = record.style;
      const font = styleFont(style);
      const fill: FillRecord = argb(style?.backgroundColor)
        ? { backgroundColor: style!.backgroundColor }
        : {};
      const border = styleBorder(style);
      const fontKey = JSON.stringify(font);
      const fillKey = JSON.stringify(fill);
      const borderKey = JSON.stringify(border);
      let fontId = fontIds.get(fontKey);
      if (fontId === undefined) {
        fontId = fonts.length;
        fonts.push(font);
        fontIds.set(fontKey, fontId);
      }
      let fillId = fillIds.get(fillKey);
      if (fillId === undefined) {
        fillId = fills.length;
        fills.push(fill);
        fillIds.set(fillKey, fillId);
      }
      let borderId = borderIds.get(borderKey);
      if (borderId === undefined) {
        borderId = borders.length;
        borders.push(border);
        borderIds.set(borderKey, borderId);
      }
      let numFmtId = 0;
      if (record.numberFormat) {
        const builtin = Object.entries(BUILTIN_NUMBER_FORMATS).find(
          ([, value]) => value === record.numberFormat,
        );
        if (builtin) numFmtId = Number(builtin[0]);
        else {
          let custom = customFormatIds.get(record.numberFormat);
          if (custom === undefined) {
            custom = 164 + customFormats.length;
            customFormats.push(record.numberFormat);
            customFormatIds.set(record.numberFormat, custom);
          }
          numFmtId = custom;
        }
      }
      xfs.push({ fontId, fillId, borderId, numFmtId, alignment: style });
    }

    const xml = new XmlBuffer(this.#context);
    xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    xml.append('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    if (customFormats.length > 0) {
      xml.append(`<numFmts count="${customFormats.length}">`);
      for (let index = 0; index < customFormats.length; index++) {
        xml.append(
          `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(customFormats[index]!)}"/>`,
        );
      }
      xml.append("</numFmts>");
    }
    xml.append(`<fonts count="${fonts.length}">`);
    for (const font of fonts) xml.append(fontXml(font));
    xml.append("</fonts>");
    xml.append(
      `<fills count="${fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>`,
    );
    for (let index = 2; index < fills.length; index++) {
      const color = argb(fills[index]!.backgroundColor)!;
      xml.append(
        `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`,
      );
    }
    xml.append("</fills>");
    xml.append(`<borders count="${borders.length}">`);
    for (const border of borders) {
      xml.append(
        `<border>${borderSideXml("left", border.left)}${borderSideXml("right", border.right)}${borderSideXml("top", border.top)}${borderSideXml("bottom", border.bottom)}<diagonal/></border>`,
      );
    }
    xml.append("</borders>");
    xml.append(
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    );
    xml.append(`<cellXfs count="${xfs.length}">`);
    for (const xf of xfs) {
      const alignment = xf.alignment;
      const hasAlignment = alignment?.align !== undefined || alignment?.wrap !== undefined;
      xml.append(
        `<xf numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="${xf.fillId}" borderId="${xf.borderId}" xfId="0"${xf.numFmtId ? ' applyNumberFormat="1"' : ""}${xf.fontId ? ' applyFont="1"' : ""}${xf.fillId > 1 ? ' applyFill="1"' : ""}${xf.borderId ? ' applyBorder="1"' : ""}${hasAlignment ? ' applyAlignment="1"' : ""}>`,
      );
      if (hasAlignment)
        xml.append(
          `<alignment${alignment?.align ? ` horizontal="${alignment.align}"` : ""}${alignment?.wrap ? ' wrapText="1"' : ""}/>`,
        );
      xml.append("</xf>");
    }
    xml.append("</cellXfs>");
    xml.append(
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    );
    if (this.#differentials.length > 0) {
      xml.append(`<dxfs count="${this.#differentials.length}">`);
      for (const style of this.#differentials) xml.append(differentialXml(style));
      xml.append("</dxfs>");
    }
    xml.append("</styleSheet>");
    return xml.finish();
  }
}

function integerAttribute(element: XmlElement, name: string, fallback = 0): number {
  const raw = xmlAttribute(element, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`Sheetwrite: invalid XLSX style ${name}=${JSON.stringify(raw)}`);
  }
  return value;
}

function fontPropertyEnabled(element: XmlElement | undefined): boolean {
  if (!element) return false;
  const value = xmlAttribute(element, "val");
  return value === undefined || xmlBoolean(value);
}

function parsedDifferentialStyle(
  dxf: XmlElement,
  theme: ReadonlyMap<number, string>,
  context: XlsxCodecContext,
  warnings: Set<string>,
  part: string,
): CellStyle {
  const style: CellStyle = {};
  const font = xmlChild(dxf, "font");
  if (fontPropertyEnabled(font ? xmlChild(font, "b") : undefined)) style.bold = true;
  if (fontPropertyEnabled(font ? xmlChild(font, "i") : undefined)) style.italic = true;
  const underline = font ? xmlChild(font, "u") : undefined;
  const underlineValue = underline ? xmlAttribute(underline, "val") : undefined;
  if (
    underline &&
    underlineValue !== "none" &&
    underlineValue !== "0" &&
    underlineValue?.toLowerCase() !== "false"
  ) {
    style.underline = true;
  }
  if (fontPropertyEnabled(font ? xmlChild(font, "strike") : undefined)) {
    style.strikethrough = true;
  }
  const fontSize = Number(font ? xmlAttribute(xmlChild(font, "sz") ?? font, "val") : undefined);
  if (Number.isFinite(fontSize) && fontSize > 0) style.fontSize = (fontSize * 96) / 72;
  const fontColor = resolvedColor(
    font ? xmlChild(font, "color") : undefined,
    theme,
    context,
    warnings,
    part,
  );
  if (fontColor) style.color = fontColor;
  const fill = xmlChild(dxf, "fill");
  const pattern = fill ? xmlChild(fill, "patternFill") : undefined;
  const patternType = pattern ? xmlAttribute(pattern, "patternType") : undefined;
  const differentialFill = pattern
    ? resolvedColor(
        xmlChild(pattern, patternType === "solid" ? "fgColor" : "bgColor"),
        theme,
        context,
        warnings,
        part,
      )
    : undefined;
  if (differentialFill) {
    style.backgroundColor = differentialFill;
  } else if (patternType && patternType !== "none" && patternType !== "gray125") {
    emitWarning(context, {
      code: "format-loss",
      message: `Non-solid conditional-format fill pattern ${patternType} cannot be represented and was dropped`,
      part,
    });
  }
  const border = xmlChild(dxf, "border");
  if (border) {
    const parsed = {
      top: importedBorder(xmlChild(border, "top"), theme, context, warnings, part),
      right: importedBorder(xmlChild(border, "right"), theme, context, warnings, part),
      bottom: importedBorder(xmlChild(border, "bottom"), theme, context, warnings, part),
      left: importedBorder(xmlChild(border, "left"), theme, context, warnings, part),
    };
    if (parsed.top || parsed.right || parsed.bottom || parsed.left) {
      style.border = {};
      if (parsed.top) style.border.top = parsed.top;
      if (parsed.right) style.border.right = parsed.right;
      if (parsed.bottom) style.border.bottom = parsed.bottom;
      if (parsed.left) style.border.left = parsed.left;
    }
  }
  const alignment = xmlChild(dxf, "alignment");
  const horizontal = alignment ? xmlAttribute(alignment, "horizontal") : undefined;
  if (horizontal === "left" || horizontal === "center" || horizontal === "right") {
    style.align = horizontal;
  }
  if (alignment && xmlBoolean(xmlAttribute(alignment, "wrapText"))) style.wrap = true;
  return style;
}

export class ParsedStyles {
  readonly #styles: ParsedCellStyle[];
  readonly #differentials: CellStyle[];

  constructor(
    root: XmlElement | undefined,
    context: XlsxCodecContext,
    themeRoot?: XmlElement,
    part = "xl/styles.xml",
    themePart = "xl/theme/theme1.xml",
  ) {
    if (!root) {
      this.#styles = [{ date: false }];
      this.#differentials = [];
      return;
    }
    assertXmlRoot(root, "styleSheet", MAIN_NAMESPACES, part);
    const theme = parsedThemeColors(themeRoot, themePart);
    const formats = new Map<number, string>();
    for (const [id, value] of Object.entries(BUILTIN_NUMBER_FORMATS)) {
      formats.set(Number(id), value);
    }
    const numberFormats = xmlChildren(
      xmlChild(root, "numFmts") ?? { attributes: {}, children: [], name: "", text: "" },
      "numFmt",
    );
    assertResource(context, "maxStyles", numberFormats.length);
    for (const format of numberFormats) {
      const id = integerAttribute(format, "numFmtId", -1);
      const code = xmlAttribute(format, "formatCode");
      if (id < 0 || code === undefined) {
        throw new TypeError("Sheetwrite: invalid XLSX custom number format");
      }
      formats.set(id, code);
    }
    const fonts = xmlChildren(
      xmlChild(root, "fonts") ?? { attributes: {}, children: [], name: "", text: "" },
      "font",
    );
    const fills = xmlChildren(
      xmlChild(root, "fills") ?? { attributes: {}, children: [], name: "", text: "" },
      "fill",
    );
    const borders = xmlChildren(
      xmlChild(root, "borders") ?? { attributes: {}, children: [], name: "", text: "" },
      "border",
    );
    const xfs = xmlChildren(
      xmlChild(root, "cellXfs") ?? { attributes: {}, children: [], name: "", text: "" },
      "xf",
    );
    const differentials = xmlChildren(
      xmlChild(root, "dxfs") ?? { attributes: {}, children: [], name: "", text: "" },
      "dxf",
    );
    assertResource(context, "maxStyles", xfs.length + differentials.length);
    assertResource(
      context,
      "maxStyles",
      Math.max(fonts.length, fills.length, borders.length, xfs.length),
    );
    const colorWarnings = new Set<string>();
    for (const [index, expected] of ["none", "gray125"].entries()) {
      const pattern = fills[index] ? xmlChild(fills[index]!, "patternFill") : undefined;
      const actual = pattern ? (xmlAttribute(pattern, "patternType") ?? "none") : undefined;
      if (actual !== undefined && actual !== expected) {
        emitWarning(context, {
          code: "format-loss",
          message: `Reserved Excel fill ${index} had pattern ${actual}; it was treated as ${expected}`,
          part,
        });
      }
    }
    this.#styles = xfs.map((xf, styleIndex) => {
      const fontId = integerAttribute(xf, "fontId");
      const fillId = integerAttribute(xf, "fillId");
      const borderId = integerAttribute(xf, "borderId");
      const numFmtId = integerAttribute(xf, "numFmtId");
      if (fontId >= fonts.length || fillId >= fills.length || borderId >= borders.length) {
        throw new TypeError(
          `Sheetwrite: invalid XLSX style ${styleIndex} references font ${fontId}, fill ${fillId}, or border ${borderId}`,
        );
      }
      const style: CellStyle = {};
      const font = fonts[fontId]!;
      if (fontPropertyEnabled(xmlChild(font, "b"))) style.bold = true;
      if (fontPropertyEnabled(xmlChild(font, "i"))) style.italic = true;
      const underline = xmlChild(font, "u");
      const underlineValue = underline ? xmlAttribute(underline, "val") : undefined;
      if (
        underline &&
        underlineValue !== "none" &&
        underlineValue !== "0" &&
        underlineValue?.toLowerCase() !== "false"
      ) {
        style.underline = true;
      }
      if (
        underlineValue &&
        ["double", "singleAccounting", "doubleAccounting"].includes(underlineValue) &&
        !colorWarnings.has(`underline:${fontId}`)
      ) {
        colorWarnings.add(`underline:${fontId}`);
        emitWarning(context, {
          code: "format-loss",
          message: `Excel ${underlineValue} underline was reduced to boolean underline`,
          part,
        });
      }
      if (fontPropertyEnabled(xmlChild(font, "strike"))) style.strikethrough = true;
      const size = Number(
        xmlAttribute(
          xmlChild(font, "sz") ?? { attributes: {}, children: [], name: "", text: "" },
          "val",
        ),
      );
      if (Number.isFinite(size) && size > 0) style.fontSize = (size * 96) / 72;
      const fontColor = resolvedColor(xmlChild(font, "color"), theme, context, colorWarnings, part);
      if (fontColor) style.color = fontColor;

      if (fillId > 1) {
        const fill = fills[fillId]!;
        const pattern = xmlChild(fill, "patternFill");
        const patternType = pattern ? (xmlAttribute(pattern, "patternType") ?? "none") : undefined;
        if (patternType === "solid") {
          const color = resolvedColor(
            xmlChild(pattern!, "fgColor"),
            theme,
            context,
            colorWarnings,
            part,
          );
          if (color) style.backgroundColor = color;
        } else if (
          patternType !== undefined &&
          patternType !== "none" &&
          patternType !== "gray125"
        ) {
          emitWarning(context, {
            code: "format-loss",
            message: `Non-solid fill pattern ${patternType} cannot be represented and was dropped`,
            part,
          });
        } else if (xmlChild(fill, "gradientFill")) {
          emitWarning(context, {
            code: "format-loss",
            message: "Gradient fill cannot be represented and was dropped",
            part,
          });
        }
      }

      const border = borders[borderId]!;
      if (
        (xmlBoolean(xmlAttribute(border, "diagonalUp")) ||
          xmlBoolean(xmlAttribute(border, "diagonalDown")) ||
          xmlAttribute(xmlChild(border, "diagonal") ?? border, "style")) &&
        !colorWarnings.has(`diagonal:${borderId}`)
      ) {
        colorWarnings.add(`diagonal:${borderId}`);
        emitWarning(context, {
          code: "format-loss",
          message: "Diagonal border presentation cannot be represented and was dropped",
          part,
        });
      }
      const parsed = {
        top: importedBorder(xmlChild(border, "top"), theme, context, colorWarnings, part),
        right: importedBorder(xmlChild(border, "right"), theme, context, colorWarnings, part),
        bottom: importedBorder(xmlChild(border, "bottom"), theme, context, colorWarnings, part),
        left: importedBorder(xmlChild(border, "left"), theme, context, colorWarnings, part),
      };
      if (parsed.top || parsed.right || parsed.bottom || parsed.left) {
        style.border = {};
        if (parsed.top) style.border.top = parsed.top;
        if (parsed.right) style.border.right = parsed.right;
        if (parsed.bottom) style.border.bottom = parsed.bottom;
        if (parsed.left) style.border.left = parsed.left;
      }
      const alignment = xmlChild(xf, "alignment");
      const horizontal = alignment ? xmlAttribute(alignment, "horizontal") : undefined;
      if (horizontal === "left" || horizontal === "center" || horizontal === "right") {
        style.align = horizontal;
      }
      if (alignment && xmlBoolean(xmlAttribute(alignment, "wrapText"))) style.wrap = true;
      const numberFormat = formats.get(numFmtId);
      return {
        ...(Object.keys(style).length > 0 ? { style } : {}),
        ...(numberFormat && numberFormat !== "General" ? { numberFormat } : {}),
        date: dateNumberFormat(numberFormat),
      };
    });
    this.#differentials = differentials.map((dxf) =>
      parsedDifferentialStyle(dxf, theme, context, colorWarnings, part),
    );
    if (this.#styles.length === 0) this.#styles.push({ date: false });
  }

  at(index: number): ParsedCellStyle {
    const style = this.#styles[index];
    if (!style) throw new TypeError(`Sheetwrite: XLSX cell style index ${index} is out of range`);
    return style;
  }

  differentialAt(index: number): CellStyle {
    const style = this.#differentials[index];
    if (!style) {
      throw new TypeError(`Sheetwrite: XLSX differential style index ${index} is out of range`);
    }
    return style;
  }
}
