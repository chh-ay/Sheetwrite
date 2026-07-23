import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_INVENTORY_PATH = "test/conformance/formula-contract.inventory.json";
const REQUIRED_SUPPORTED_COUNT = 100;

type JsonObject = Record<string, unknown>;

interface FormulaArgument {
  readonly name: string;
  readonly required: boolean;
  readonly default: unknown;
  readonly accepts: readonly string[];
  readonly repeat: string;
}

interface SignatureProfile {
  readonly arguments: readonly FormulaArgument[];
  readonly returns: string;
}

interface FormulaRecord {
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly family: string;
  readonly contractStatus: "required-supported" | "supported";
  readonly signature: string;
  readonly semantics: string;
  readonly dialects: string;
  readonly implementation: string;
  readonly version: number;
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function recordMap(value: unknown, label: string): Record<string, JsonObject> {
  const source = object(value, label);
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [key, object(entry, `${label}.${key}`)]),
  );
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/(^-|-$)/gu, "");
}

function sourceLink(path: string): string {
  return `[\`${path}\`](https://github.com/chh-ay/sheetwrite/blob/main/${path})`;
}

function valueText(value: unknown): string {
  if (value === null) return "none";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function keyValues(value: unknown, label: string): string {
  return Object.entries(object(value, label))
    .map(([key, entry]) => {
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        return `${key}: ${keyValues(entry, `${label}.${key}`)}`;
      }
      return `${key}: ${valueText(entry)}`;
    })
    .join("<br />");
}

function parseSignatureProfiles(value: unknown): Record<string, SignatureProfile> {
  return Object.fromEntries(
    Object.entries(recordMap(value, "signatureProfiles")).map(([id, raw]) => {
      const argumentsValue = raw.arguments;
      if (!Array.isArray(argumentsValue))
        throw new Error(`signatureProfiles.${id}.arguments must be an array`);
      const args = argumentsValue.map((entry, index): FormulaArgument => {
        const argument = object(entry, `signatureProfiles.${id}.arguments[${index}]`);
        if (typeof argument.required !== "boolean") {
          throw new Error(`signatureProfiles.${id}.arguments[${index}].required must be boolean`);
        }
        return {
          name: string(argument.name, `signatureProfiles.${id}.arguments[${index}].name`),
          required: argument.required,
          default: argument.default,
          accepts: stringArray(
            argument.accepts,
            `signatureProfiles.${id}.arguments[${index}].accepts`,
          ),
          repeat: string(argument.repeat, `signatureProfiles.${id}.arguments[${index}].repeat`),
        };
      });
      return [
        id,
        { arguments: args, returns: string(raw.returns, `signatureProfiles.${id}.returns`) },
      ];
    }),
  );
}

function parseFunctions(value: unknown): FormulaRecord[] {
  if (!Array.isArray(value)) throw new Error("functions must be an array");
  return value.map((entry, index): FormulaRecord => {
    const formula = object(entry, `functions[${index}]`);
    const contractStatus = string(formula.contractStatus, `functions[${index}].contractStatus`);
    if (contractStatus !== "required-supported" && contractStatus !== "supported") {
      throw new Error(`functions[${index}].contractStatus is unsupported: ${contractStatus}`);
    }
    if (typeof formula.version !== "number")
      throw new Error(`functions[${index}].version must be numeric`);
    return {
      canonical: string(formula.canonical, `functions[${index}].canonical`),
      aliases: stringArray(formula.aliases, `functions[${index}].aliases`),
      family: string(formula.family, `functions[${index}].family`),
      contractStatus,
      signature: string(formula.signature, `functions[${index}].signature`),
      semantics: string(formula.semantics, `functions[${index}].semantics`),
      dialects: string(formula.dialects, `functions[${index}].dialects`),
      implementation: string(formula.implementation, `functions[${index}].implementation`),
      version: formula.version,
    };
  });
}

function statusPaths(value: unknown, label: string): string {
  const profile = object(value, label);
  const status = string(profile.status, `${label}.status`);
  const paths = stringArray(profile.paths, `${label}.paths`);
  return paths.length === 0
    ? status
    : `${status}<br />${paths.map((path) => sourceLink(path)).join("<br />")}`;
}

export async function loadFormulaContractInventory(
  root: string,
  path = DEFAULT_INVENTORY_PATH,
): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

export function renderFormulaFunctionContract(inventoryValue: unknown): string {
  const inventory = object(inventoryValue, "formula inventory");
  const contract = string(inventory.contract, "contract");
  if (contract !== "sheetwrite.formula-capabilities") {
    throw new Error(`unexpected formula contract: ${contract}`);
  }
  if (typeof inventory.version !== "number")
    throw new Error("formula inventory version must be numeric");

  const sources = recordMap(inventory.sources, "sources");
  const families = recordMap(inventory.families, "families");
  const signatures = parseSignatureProfiles(inventory.signatureProfiles);
  const semantics = recordMap(inventory.semanticsProfiles, "semanticsProfiles");
  const dialects = recordMap(inventory.dialectProfiles, "dialectProfiles");
  const implementations = recordMap(inventory.implementationProfiles, "implementationProfiles");
  const functions = parseFunctions(inventory.functions);
  if (!Array.isArray(inventory.unsupportedCategories)) {
    throw new Error("unsupportedCategories must be an array");
  }
  const unsupported = inventory.unsupportedCategories.map((entry, index) =>
    object(entry, `unsupportedCategories[${index}]`),
  );

  const duplicateNames = functions
    .map((formula) => formula.canonical)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0)
    throw new Error(`duplicate formula names: ${duplicateNames.join(", ")}`);

  const required = functions.filter((formula) => formula.contractStatus === "required-supported");
  const incumbent = functions.filter((formula) => formula.contractStatus === "supported");
  if (required.length !== REQUIRED_SUPPORTED_COUNT) {
    throw new Error(
      `formula documentation requires ${REQUIRED_SUPPORTED_COUNT} required-supported functions; found ${required.length}`,
    );
  }

  for (const formula of functions) {
    if (!families[formula.family])
      throw new Error(`${formula.canonical} has unknown family ${formula.family}`);
    if (!signatures[formula.signature]) {
      throw new Error(`${formula.canonical} has unknown signature ${formula.signature}`);
    }
    if (!semantics[formula.semantics]) {
      throw new Error(`${formula.canonical} has unknown semantics ${formula.semantics}`);
    }
    if (!dialects[formula.dialects]) {
      throw new Error(`${formula.canonical} has unknown dialect ${formula.dialects}`);
    }
    if (!implementations[formula.implementation]) {
      throw new Error(`${formula.canonical} has unknown implementation ${formula.implementation}`);
    }
  }

  const lines = [
    "---",
    'title: "Formula function contract"',
    'description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."',
    "---",
    "",
    "# Formula function contract",
    "",
    `This page is generated from the checked version ${inventory.version} \`${contract}\` inventory. It publishes **${required.length} required-supported target functions** and **${incumbent.length} incumbent functions** (${functions.length} canonical functions total) without maintaining a second name list. Aliases are shown beside their canonical function.`,
    "",
    "A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.",
    "",
    "## Bounded evaluation contract",
    "",
    "- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.",
    "- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see the [formula guide](/docs/guides/formulas/#dynamic-arrays-and-spills) for admission rules.",
    "- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.",
    "- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.",
    "- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.",
    "",
    "No formula throughput or latency number is published here because this contract has no checked final formula-performance artifact. Use the [performance evidence protocol](/docs/guides/performance-resources/) to capture and validate measurements; limits above are implementation ceilings, not benchmark results.",
    "",
    "## Functions by family",
    "",
  ];

  for (const [familyId, family] of Object.entries(families)) {
    const title = string(family.title, `families.${familyId}.title`);
    const sourceId = string(family.source, `families.${familyId}.source`);
    const section = string(family.section, `families.${familyId}.section`);
    const source = sources[sourceId];
    if (!source) throw new Error(`families.${familyId} has unknown source ${sourceId}`);
    const sourceUrl = string(source.link, `sources.${sourceId}.link`);
    const familyFunctions = functions.filter((formula) => formula.family === familyId);
    lines.push(
      `### ${title}`,
      "",
      `Taxonomy/source: [${section}](${sourceUrl}).`,
      "",
      "| Function (aliases) | Contract | Signature profile | Semantics profile | Dialect profile | Implementation profile |",
      "| --- | --- | --- | --- | --- | --- |",
      ...familyFunctions.map((formula) => {
        const aliases =
          formula.aliases.length > 0
            ? ` (${formula.aliases.map((name) => `\`${name}\``).join(", ")})`
            : "";
        const contractLabel =
          formula.contractStatus === "required-supported" ? "required target" : "incumbent";
        return `| \`${formula.canonical}\`${aliases} | ${contractLabel} | [\`${formula.signature}\`](#signature-${anchor(formula.signature)}) | [\`${formula.semantics}\`](#semantics-${anchor(formula.semantics)}) | [\`${formula.dialects}\`](#dialect-${anchor(formula.dialects)}) | [\`${formula.implementation}\`](#implementation-${anchor(formula.implementation)}) |`;
      }),
      "",
    );
  }

  lines.push(
    "## Signature profiles",
    "",
    "Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.",
    "",
  );
  for (const [id, signature] of Object.entries(signatures)) {
    lines.push(
      `### Signature: ${id}`,
      "",
      `Return shape: \`${signature.returns}\`.`,
      "",
      "| Argument | Required | Default | Accepts | Repetition |",
      "| --- | --- | --- | --- | --- |",
      ...(signature.arguments.length === 0
        ? ["| _none_ | — | — | — | — |"]
        : signature.arguments.map(
            (argument) =>
              `| \`${argument.name}\` | ${argument.required ? "yes" : "no"} | ${cell(valueText(argument.default))} | ${argument.accepts.map((value) => `\`${value}\``).join(", ")} | \`${argument.repeat}\` |`,
          )),
      "",
    );
  }

  lines.push(
    "## Semantic profiles",
    "",
    "These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guide's function-specific sections rather than assuming another spreadsheet's edge behavior.",
    "",
  );
  for (const [id, profile] of Object.entries(semantics)) {
    lines.push(
      `### Semantics: ${id}`,
      "",
      "| Dimension | Contract |",
      "| --- | --- |",
      ...Object.entries(profile).map(
        ([dimension, value]) =>
          `| ${dimension} | ${cell(keyValues(value, `semanticsProfiles.${id}.${dimension}`))} |`,
      ),
      "",
    );
  }

  lines.push("## Dialect profiles", "");
  for (const [id, profile] of Object.entries(dialects)) {
    lines.push(
      `### Dialect: ${id}`,
      "",
      "| Dialect | Status |",
      "| --- | --- |",
      `| Microsoft Excel | ${cell(valueText(profile.excel))} |`,
      `| Google Sheets | ${cell(valueText(profile.googleSheets))} |`,
      `| OpenFormula | ${cell(valueText(profile.openFormula))} |`,
      "",
      `Limitations: ${stringArray(profile.divergences, `dialectProfiles.${id}.divergences`).join(" ")}`,
      "",
    );
  }

  lines.push("## Implementation profiles", "");
  for (const [id, profile] of Object.entries(implementations)) {
    lines.push(
      `### Implementation: ${id}`,
      "",
      "| Layer | Status and source/evidence |",
      "| --- | --- |",
      `| Parser | ${statusPaths(profile.parser, `implementationProfiles.${id}.parser`)} |`,
      `| Evaluator | ${statusPaths(profile.evaluator, `implementationProfiles.${id}.evaluator`)} |`,
      `| Formula assist | ${statusPaths(profile.assist, `implementationProfiles.${id}.assist`)} |`,
      `| Evidence | ${statusPaths(profile.evidence, `implementationProfiles.${id}.evidence`)} |`,
      "",
    );
  }

  lines.push(
    "## Unsupported categories",
    "",
    "Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.",
    "",
    "| Category | Scope | Examples | Source | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...unsupported.map((category, index) => {
      const sourceId = string(category.source, `unsupportedCategories[${index}].source`);
      const source = sources[sourceId];
      if (!source)
        throw new Error(`unsupportedCategories[${index}] has unknown source ${sourceId}`);
      const evidence = object(category.evidence, `unsupportedCategories[${index}].evidence`);
      return `| **${cell(string(category.title, `unsupportedCategories[${index}].title`))}** (\`${string(category.id, `unsupportedCategories[${index}].id`)}\`) | ${cell(string(category.scope, `unsupportedCategories[${index}].scope`))} | ${stringArray(
        category.examples,
        `unsupportedCategories[${index}].examples`,
      )
        .map((name) => `\`${name}\``)
        .join(
          ", ",
        )} | [${cell(string(category.section, `unsupportedCategories[${index}].section`))}](${string(source.link, `sources.${sourceId}.link`)}) | ${stringArray(
        evidence.paths,
        `unsupportedCategories[${index}].evidence.paths`,
      )
        .map((path) => sourceLink(path))
        .join("<br />")} |`;
    }),
    "",
    "In particular, automatic volatile functions beyond the explicit host-clock barrier, network/external-data functions, arbitrary external workbook links, database functions, cube/OLAP functions, and `LAMBDA`/higher-order execution are unsupported. `TODAY` and `NOW` are the documented clock-function exception; `LET` is supported and is not a `LAMBDA` fallback.",
    "",
  );

  return `${lines.join("\n").trimEnd()}\n`;
}
