import { describe, expect, it } from "bun:test";
import { OpcPackage } from "../src/opc.js";
import { createCodecContext } from "../src/resources.js";
import { rawZip } from "./raw-opc.js";

describe("OPC package metadata", () => {
  it("resolves exact and default content types", () => {
    const archive = rawZip({
      "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/custom/data.bin" ContentType="application/custom"/></Types>`,
      "custom/data.bin": "binary",
      "custom/fallback.xml": "<root/>",
      "custom/extensionless": "plain",
    });
    const packageFile = new OpcPackage(archive, createCodecContext("import"));

    expect(packageFile.contentType("custom/data.bin")).toBe("application/custom");
    expect(packageFile.contentType("custom/fallback.XML")).toBe("application/xml");
    expect(packageFile.contentType("custom/extensionless")).toBeUndefined();
    expect(new TextDecoder().decode(packageFile.read("custom/data.bin"))).toBe("binary");
  });
});
