import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "..");
const INVENTORY_PATH = "test/conformance/formula-contract.inventory.json";
const SCHEMA_PATH = "test/conformance/formula-contract.schema.json";
const ASSIST_PATH = "packages/core/src/formula-assist.ts";
const REQUIRED_TARGET_HASH = "3efef696839478b92b59a004537f9ede7fa803f9749042bb830b664086495e80";
const UNSUPPORTED_CATEGORY_HASH =
  "eef794e222795f2122b414d5ee9efd09802cf92ef372ae9fa12aac29fa06eb5b";
const FORMULA_NAME = /^[A-Z][A-Z0-9.]*$/;
const ID = /^[a-z][a-z0-9-]*$/;

export interface FormulaContractSummary {
  functions: number;
  requiredSupported: number;
  unsupportedCategories: number;
  parserSpellings: number;
  assistSpellings: number;
}

export interface FormulaContractValidation {
  issues: string[];
  summary: FormulaContractSummary;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schemaTypeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

function resolveJsonPointer(root: JsonObject, reference: string): unknown {
  if (!reference.startsWith("#/")) throw new Error(`unsupported schema reference ${reference}`);
  let current: unknown = root;
  for (const rawPart of reference.slice(2).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) || !(part in current)) {
      throw new Error(`unresolved schema reference ${reference}`);
    }
    current = current[part];
  }
  return current;
}

function validateSchemaNode(
  value: unknown,
  node: unknown,
  root: JsonObject,
  path: string,
  issues: string[],
): void {
  if (!isObject(node)) {
    issues.push(`${path}: invalid schema node`);
    return;
  }
  if (typeof node.$ref === "string") {
    validateSchemaNode(value, resolveJsonPointer(root, node.$ref), root, path, issues);
    return;
  }
  if ("const" in node && !sameJson(value, node.const)) {
    issues.push(`${path}: expected constant ${JSON.stringify(node.const)}`);
  }
  if (Array.isArray(node.enum) && !node.enum.some((candidate) => sameJson(candidate, value))) {
    issues.push(`${path}: value is outside the closed enum`);
  }
  const declaredTypes = Array.isArray(node.type)
    ? node.type.filter((entry): entry is string => typeof entry === "string")
    : typeof node.type === "string"
      ? [node.type]
      : [];
  if (declaredTypes.length > 0 && !declaredTypes.some((type) => schemaTypeMatches(value, type))) {
    issues.push(`${path}: expected ${declaredTypes.join(" or ")}`);
    return;
  }
  if (typeof value === "string") {
    if (typeof node.minLength === "number" && value.length < node.minLength) {
      issues.push(`${path}: string is shorter than ${node.minLength}`);
    }
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(value)) {
      issues.push(`${path}: string does not match ${node.pattern}`);
    }
    if (node.format === "uri") {
      try {
        new URL(value);
      } catch {
        issues.push(`${path}: expected an absolute URI`);
      }
    }
  }
  if (typeof value === "number" && typeof node.minimum === "number" && value < node.minimum) {
    issues.push(`${path}: number is below ${node.minimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) {
      issues.push(`${path}: expected at least ${node.minItems} items`);
    }
    if (node.uniqueItems === true) {
      const unique = new Set(value.map((entry) => JSON.stringify(entry)));
      if (unique.size !== value.length) issues.push(`${path}: duplicate array item`);
    }
    if (node.items !== undefined) {
      value.forEach((entry, index) => {
        validateSchemaNode(entry, node.items, root, `${path}[${index}]`, issues);
      });
    }
  }
  if (!isObject(value)) return;
  const properties = isObject(node.properties) ? node.properties : {};
  if (Array.isArray(node.required)) {
    for (const key of node.required) {
      if (typeof key === "string" && !(key in value)) issues.push(`${path}.${key}: required field`);
    }
  }
  if (typeof node.minProperties === "number" && Object.keys(value).length < node.minProperties) {
    issues.push(`${path}: expected at least ${node.minProperties} properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key in properties) {
      validateSchemaNode(child, properties[key], root, `${path}.${key}`, issues);
    } else if (node.additionalProperties === false) {
      issues.push(`${path}.${key}: unknown field`);
    } else if (isObject(node.additionalProperties)) {
      validateSchemaNode(child, node.additionalProperties, root, `${path}.${key}`, issues);
    }
  }
}

export function validateAgainstFormulaSchema(value: unknown, schema: unknown): string[] {
  if (!isObject(schema)) return ["schema: expected object"];
  const issues: string[] = [];
  validateSchemaNode(value, schema, schema, "contract", issues);
  return issues;
}

export function validateClosedSchema(schema: unknown): string[] {
  if (!isObject(schema)) return ["schema: expected object"];
  const issues: string[] = [];
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    issues.push("schema.$schema: expected JSON Schema 2020-12");
  }
  if (schema.$id !== "https://sheetwrite.dev/schemas/formula-contract-v1.json") {
    issues.push("schema.$id: unexpected contract schema identity");
  }
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "object" && !("additionalProperties" in value)) {
      issues.push(`${path}: object schema is not closed`);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(schema, "schema");
  return issues;
}

function namesHash(names: readonly string[]): string {
  return createHash("sha256")
    .update([...names].sort().join("\n"))
    .digest("hex");
}

function namesFromFunction(entry: JsonObject): string[] {
  const canonical = typeof entry.canonical === "string" ? [entry.canonical] : [];
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.filter((value): value is string => typeof value === "string")
    : [];
  return [...canonical, ...aliases];
}

function stringMap(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function objectProperty(object: JsonObject, key: unknown): JsonObject | undefined {
  if (typeof key !== "string") return undefined;
  const value = object[key];
  return isObject(value) ? value : undefined;
}

function sortedDifference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((entry) => !right.has(entry)).sort();
}

function compareNameSets(
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
  label: string,
  issues: string[],
): void {
  const missing = sortedDifference(expected, actual);
  const extra = sortedDifference(actual, expected);
  if (missing.length > 0) issues.push(`${label}: missing ${missing.join(", ")}`);
  if (extra.length > 0) issues.push(`${label}: unexpected ${extra.join(", ")}`);
}

export function extractParserSpellings(source: string): string[] {
  const registry = source.match(
    /define_function_registry!\s*\{\s*canonical\s*\{([\s\S]*?)\n\s*\}\s*aliases\s*\{([\s\S]*?)\n\s*\}\s*\}/,
  );
  if (!registry?.[1] || registry[2] === undefined) {
    throw new Error("formula parser registry not found");
  }

  const spellings: string[] = [];
  const parseBlock = (block: string, arm: RegExp, label: string): void => {
    let armCount = 0;
    for (const line of block.split("\n")) {
      if (line.trim().length === 0) continue;
      const match = line.match(arm);
      if (!match?.[1]) throw new Error(`unrecognized formula parser ${label}: ${line.trim()}`);
      spellings.push(match[1]);
      armCount += 1;
    }
    if (label === "canonical arm" && armCount === 0) {
      throw new Error("formula parser registry has no canonical arms");
    }
  };

  parseBlock(
    registry[1],
    /^\s*[A-Za-z][A-Za-z0-9_]*\s*=>\s*"([A-Z][A-Z0-9.]*)";\s*$/,
    "canonical arm",
  );
  parseBlock(registry[2], /^\s*"([A-Z][A-Z0-9.]*)"\s*=>\s*[A-Za-z][A-Za-z0-9_]*;\s*$/, "alias arm");
  return spellings;
}

export function extractAssistSpellings(source: string): string[] {
  const match = source.match(
    /export const FORMULA_FUNCTIONS:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\n\s*\];/,
  );
  const body = match?.[1];
  if (body === undefined) throw new Error("formula assist registry not found");
  const names: string[] = [];
  for (const entry of body.matchAll(/"([A-Z][A-Z0-9.]*)"/g)) {
    const name = entry[1];
    if (name === undefined) {
      throw new Error("formula assist registry contains an invalid literal");
    }
    names.push(name);
  }
  const residue = body.replaceAll(/"[A-Z][A-Z0-9.]*"/g, "").replaceAll(/[\s,]/g, "");
  if (residue.length > 0 || names.length === 0) {
    throw new Error("formula assist registry contains non-literal entries");
  }
  return names;
}

function validateReferencesAndNames(inventory: JsonObject, issues: string[]): void {
  const sources = stringMap(inventory.sources);
  const families = stringMap(inventory.families);
  const signatures = stringMap(inventory.signatureProfiles);
  const semantics = stringMap(inventory.semanticsProfiles);
  const dialects = stringMap(inventory.dialectProfiles);
  const implementations = stringMap(inventory.implementationProfiles);

  for (const [familyId, rawFamily] of Object.entries(families)) {
    if (!isObject(rawFamily)) continue;
    if (typeof rawFamily.source !== "string" || !(rawFamily.source in sources)) {
      issues.push(
        `contract.families.${familyId}.source: unknown source ${String(rawFamily.source)}`,
      );
    }
  }

  const functions = Array.isArray(inventory.functions) ? inventory.functions.filter(isObject) : [];
  const canonicalNames = new Set<string>();
  const parserNames = new Set<string>();
  const requiredNames: string[] = [];
  for (const [index, entry] of functions.entries()) {
    const path = `contract.functions[${index}]`;
    const canonical = entry.canonical;
    if (typeof canonical === "string") {
      if (canonicalNames.has(canonical)) issues.push(`${path}.canonical: duplicate ${canonical}`);
      canonicalNames.add(canonical);
      if (entry.contractStatus === "required-supported") requiredNames.push(canonical);
    }
    for (const spelling of namesFromFunction(entry)) {
      if (!FORMULA_NAME.test(spelling)) continue;
      if (parserNames.has(spelling)) issues.push(`${path}: duplicate parser spelling ${spelling}`);
      parserNames.add(spelling);
    }
    if (Array.isArray(entry.aliases) && entry.aliases.includes(canonical)) {
      issues.push(`${path}.aliases: canonical spelling cannot repeat as an alias`);
    }
    const references: Array<[string, JsonObject]> = [
      ["family", families],
      ["signature", signatures],
      ["semantics", semantics],
      ["dialects", dialects],
      ["implementation", implementations],
    ];
    for (const [field, registry] of references) {
      const reference = entry[field];
      if (typeof reference !== "string" || !(reference in registry)) {
        issues.push(`${path}.${field}: unknown profile ${String(reference)}`);
      }
    }
    const implementation = objectProperty(implementations, entry.implementation);
    const parser = implementation ? objectProperty(implementation, "parser") : undefined;
    if (parser?.status !== "implemented") {
      issues.push(`${path}.implementation: parser spelling is not marked implemented`);
    }
  }

  if (namesHash(requiredNames) !== REQUIRED_TARGET_HASH) {
    issues.push(
      "contract.functions: required-supported target set differs from the expansion specification",
    );
  }
  const letEntry = functions.find((entry) => entry.canonical === "LET");
  if (letEntry?.contractStatus !== "required-supported") {
    issues.push("contract.functions: LET must remain required-supported");
  }

  const unsupported = Array.isArray(inventory.unsupportedCategories)
    ? inventory.unsupportedCategories.filter(isObject)
    : [];
  const unsupportedIds = unsupported
    .map((entry) => entry.id)
    .filter((value): value is string => typeof value === "string");
  if (new Set(unsupportedIds).size !== unsupportedIds.length) {
    issues.push("contract.unsupportedCategories: duplicate category id");
  }
  if (namesHash(unsupportedIds) !== UNSUPPORTED_CATEGORY_HASH) {
    issues.push("contract.unsupportedCategories: required unsupported category set differs");
  }
  for (const [index, category] of unsupported.entries()) {
    if (typeof category.source !== "string" || !(category.source in sources)) {
      issues.push(
        `contract.unsupportedCategories[${index}].source: unknown source ${String(category.source)}`,
      );
    }
  }
}

function expectedAssistNames(inventory: JsonObject, issues: string[]): Set<string> {
  const expected = new Set<string>();
  const implementations = stringMap(inventory.implementationProfiles);
  const functions = Array.isArray(inventory.functions) ? inventory.functions.filter(isObject) : [];
  for (const [index, entry] of functions.entries()) {
    const profile = objectProperty(implementations, entry.implementation);
    const assist = profile ? objectProperty(profile, "assist") : undefined;
    if (assist?.status === "implemented") {
      for (const spelling of namesFromFunction(entry)) expected.add(spelling);
    } else if (assist?.status !== "missing" && assist?.status !== "declared") {
      issues.push(`contract.functions[${index}].implementation: invalid assist status`);
    }
  }
  return expected;
}

function inventoryParserNames(inventory: JsonObject): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(inventory.functions)) return names;
  for (const entry of inventory.functions) {
    if (!isObject(entry)) continue;
    for (const spelling of namesFromFunction(entry)) names.add(spelling);
  }
  return names;
}

async function validateEvidencePaths(
  root: string,
  inventory: JsonObject,
  issues: string[],
): Promise<void> {
  const paths = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "paths" && Array.isArray(child)) {
        for (const path of child) if (typeof path === "string") paths.add(path);
      } else if (key === "sourcePath" && typeof child === "string") {
        paths.add(child);
      } else {
        collect(child);
      }
    }
  };
  collect(inventory);
  await Promise.all(
    [...paths].map(async (path) => {
      if (path.startsWith("/") || path.split("/").includes("..")) {
        issues.push(`contract evidence path escapes repository: ${path}`);
        return;
      }
      try {
        await access(resolve(root, path));
      } catch {
        issues.push(`contract evidence path does not exist: ${path}`);
      }
    }),
  );
}

function validatePortableFormulaSemantics(inventory: JsonObject, issues: string[]): void {
  const signatures = stringMap(inventory.signatureProfiles);
  const numberValue = isObject(signatures["number-value"]) ? signatures["number-value"] : undefined;
  const numberArguments =
    numberValue && Array.isArray(numberValue.arguments)
      ? numberValue.arguments.filter(isObject)
      : [];
  const decimal = numberArguments.find((argument) => argument.name === "decimalSeparator");
  const grouping = numberArguments.find((argument) => argument.name === "groupSeparator");
  if (decimal?.default !== ".") {
    issues.push(
      "contract.signatureProfiles.number-value.decimalSeparator: expected invariant default",
    );
  }
  if (grouping?.default !== ",") {
    issues.push(
      "contract.signatureProfiles.number-value.groupSeparator: expected invariant default",
    );
  }
  const semantics = stringMap(inventory.semanticsProfiles);
  const dateTime = isObject(semantics["date-time"]) ? semantics["date-time"] : undefined;
  const environment = dateTime && isObject(dateTime.environment) ? dateTime.environment : undefined;
  if (environment?.locale !== "invariant") {
    issues.push("contract.semanticsProfiles.date-time.environment.locale: expected invariant");
  }
}

export function validateFormulaContractData(inventory: unknown, schema: unknown): string[] {
  const issues = [
    ...validateClosedSchema(schema),
    ...validateAgainstFormulaSchema(inventory, schema),
  ];
  if (isObject(inventory)) validateReferencesAndNames(inventory, issues);
  if (isObject(inventory)) validatePortableFormulaSemantics(inventory, issues);
  return issues;
}

export async function validateFormulaContractRepository(
  root = REPOSITORY_ROOT,
  inventoryOverride?: unknown,
): Promise<FormulaContractValidation> {
  const [schemaSource, inventorySource, parserSource, assistSource] = await Promise.all([
    readFile(resolve(root, SCHEMA_PATH), "utf8"),
    inventoryOverride === undefined ? readFile(resolve(root, INVENTORY_PATH), "utf8") : undefined,
    readFile(resolve(root, "packages/wasm/src/calc.rs"), "utf8"),
    readFile(resolve(root, ASSIST_PATH), "utf8"),
  ]);
  let schema: unknown;
  let inventory: unknown = inventoryOverride;
  const issues: string[] = [];
  try {
    schema = JSON.parse(schemaSource);
  } catch (error) {
    return {
      issues: [`${SCHEMA_PATH}: invalid JSON: ${String(error)}`],
      summary: {
        functions: 0,
        requiredSupported: 0,
        unsupportedCategories: 0,
        parserSpellings: 0,
        assistSpellings: 0,
      },
    };
  }
  if (inventoryOverride === undefined) {
    try {
      inventory = JSON.parse(inventorySource ?? "");
    } catch (error) {
      return {
        issues: [`${INVENTORY_PATH}: invalid JSON: ${String(error)}`],
        summary: {
          functions: 0,
          requiredSupported: 0,
          unsupportedCategories: 0,
          parserSpellings: 0,
          assistSpellings: 0,
        },
      };
    }
  }
  issues.push(...validateFormulaContractData(inventory, schema));

  let parserSpellings: string[] = [];
  let assistSpellings: string[] = [];
  try {
    parserSpellings = extractParserSpellings(parserSource);
  } catch (error) {
    issues.push(`parser drift extraction failed: ${String(error)}`);
  }
  try {
    assistSpellings = extractAssistSpellings(assistSource);
  } catch (error) {
    issues.push(`assist drift extraction failed: ${String(error)}`);
  }
  if (new Set(parserSpellings).size !== parserSpellings.length) {
    issues.push("parser drift extraction found duplicate spellings");
  }
  if (new Set(assistSpellings).size !== assistSpellings.length) {
    issues.push("assist drift extraction found duplicate spellings");
  }
  if (isObject(inventory)) {
    compareNameSets(
      new Set(parserSpellings),
      inventoryParserNames(inventory),
      "parser/inventory drift",
      issues,
    );
    compareNameSets(
      new Set(assistSpellings),
      expectedAssistNames(inventory, issues),
      "assist/inventory drift",
      issues,
    );
    await validateEvidencePaths(root, inventory, issues);
  }

  const functions =
    isObject(inventory) && Array.isArray(inventory.functions)
      ? inventory.functions.filter(isObject)
      : [];
  const unsupported =
    isObject(inventory) && Array.isArray(inventory.unsupportedCategories)
      ? inventory.unsupportedCategories.filter(isObject)
      : [];
  return {
    issues: [...new Set(issues)].sort(),
    summary: {
      functions: functions.length,
      requiredSupported: functions.filter((entry) => entry.contractStatus === "required-supported")
        .length,
      unsupportedCategories: unsupported.length,
      parserSpellings: new Set(parserSpellings).size,
      assistSpellings: new Set(assistSpellings).size,
    },
  };
}

if (import.meta.main) {
  const result = await validateFormulaContractRepository();
  if (result.issues.length > 0) {
    process.stderr.write(`${result.issues.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    const summary = result.summary;
    process.stdout.write(
      `formula contract valid: ${summary.functions} functions (${summary.requiredSupported} required-supported), ` +
        `${summary.unsupportedCategories} unsupported categories, ${summary.parserSpellings} parser spellings, ` +
        `${summary.assistSpellings} assist spellings\n`,
    );
  }
}
