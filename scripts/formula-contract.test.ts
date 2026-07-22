import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  extractAssistSpellings,
  extractParserSpellings,
  validateClosedSchema,
  validateFormulaContractData,
  validateFormulaContractRepository,
} from "./formula-contract.js";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = JSON.parse(
  readFileSync(resolve(ROOT, "test/conformance/formula-contract.inventory.json"), "utf8"),
) as MutableContract;
const SCHEMA = JSON.parse(
  readFileSync(resolve(ROOT, "test/conformance/formula-contract.schema.json"), "utf8"),
) as Record<string, unknown>;

interface MutableFunction {
  canonical: string;
  aliases: string[];
  family: string;
  contractStatus: string;
  signature: string;
  semantics: string;
  dialects: string;
  implementation: string;
  version: number;
  [key: string]: unknown;
}

interface MutableContract {
  version: number;
  parserRules: Record<string, unknown>;
  sources: Record<string, Record<string, unknown>>;
  families: Record<string, Record<string, unknown>>;
  signatureProfiles: Record<string, Record<string, unknown>>;
  semanticsProfiles: Record<string, Record<string, unknown>>;
  dialectProfiles: Record<string, Record<string, unknown>>;
  implementationProfiles: Record<string, Record<string, unknown>>;
  unsupportedCategories: Array<Record<string, unknown>>;
  functions: MutableFunction[];
  [key: string]: unknown;
}

interface MutationCase {
  name: string;
  mutate: (contract: MutableContract) => void;
  expectedIssue: string;
}

const MUTATIONS: MutationCase[] = [
  {
    name: "rejects an unknown top-level field",
    mutate: (contract) => {
      contract.unreviewedCapability = true;
    },
    expectedIssue: "contract.unreviewedCapability: unknown field",
  },
  {
    name: "rejects a version outside the closed protocol",
    mutate: (contract) => {
      contract.version = 2;
    },
    expectedIssue: "contract.version: expected constant 1",
  },
  {
    name: "requires normalized source metadata",
    mutate: (contract) => {
      delete contract.sources["microsoft-excel-functions"]?.title;
    },
    expectedIssue: "contract.sources.microsoft-excel-functions.title: required field",
  },
  {
    name: "rejects insecure public source links",
    mutate: (contract) => {
      const source = contract.sources["microsoft-excel-functions"];
      if (source) source.link = "http://example.invalid/functions";
    },
    expectedIssue: "string does not match ^https://",
  },
  {
    name: "rejects unknown family source references",
    mutate: (contract) => {
      const family = contract.families.math;
      if (family) family.source = "missing-source";
    },
    expectedIssue: "contract.families.math.source: unknown source missing-source",
  },
  {
    name: "rejects unknown function family references",
    mutate: (contract) => {
      const sum = contract.functions.find((entry) => entry.canonical === "SUM");
      if (sum) sum.family = "missing-family";
    },
    expectedIssue: ".family: unknown profile missing-family",
  },
  {
    name: "rejects incomplete argument/default records",
    mutate: (contract) => {
      const profile = contract.signatureProfiles["unary-number"];
      const argumentsList = profile?.arguments;
      if (Array.isArray(argumentsList) && argumentsList[0]) {
        delete (argumentsList[0] as Record<string, unknown>).default;
      }
    },
    expectedIssue: ".default: required field",
  },
  {
    name: "pins NUMBERVALUE invariant separators",
    mutate: (contract) => {
      const profile = contract.signatureProfiles["number-value"];
      const argumentsList = profile?.arguments;
      if (Array.isArray(argumentsList)) {
        const decimal = argumentsList.find(
          (argument) => (argument as Record<string, unknown>).name === "decimalSeparator",
        ) as Record<string, unknown> | undefined;
        if (decimal) decimal.default = "locale";
      }
    },
    expectedIssue: "number-value.decimalSeparator: expected invariant default",
  },
  {
    name: "pins date-time invariant locale",
    mutate: (contract) => {
      const profile = contract.semanticsProfiles["date-time"];
      const environment = profile?.environment as Record<string, unknown> | undefined;
      if (environment) environment.locale = "locale-aware";
    },
    expectedIssue: "date-time.environment.locale: expected invariant",
  },
  {
    name: "rejects unknown semantics fields",
    mutate: (contract) => {
      const semantics = contract.semanticsProfiles.scalar;
      if (semantics) semantics.implicitIntersection = "unspecified";
    },
    expectedIssue: ".implicitIntersection: unknown field",
  },
  {
    name: "rejects duplicate parser spellings",
    mutate: (contract) => {
      const average = contract.functions.find((entry) => entry.canonical === "AVERAGE");
      if (average) average.aliases = ["SUM"];
    },
    expectedIssue: "duplicate parser spelling SUM",
  },
  {
    name: "pins every required expansion target",
    mutate: (contract) => {
      const product = contract.functions.find((entry) => entry.canonical === "PRODUCT");
      if (product) product.contractStatus = "supported";
    },
    expectedIssue: "required-supported target set differs from the expansion specification",
  },
  {
    name: "pins LET as required-supported",
    mutate: (contract) => {
      const letEntry = contract.functions.find((entry) => entry.canonical === "LET");
      if (letEntry) letEntry.contractStatus = "supported";
    },
    expectedIssue: "LET must remain required-supported",
  },
  {
    name: "pins explicit unsupported categories",
    mutate: (contract) => {
      contract.unsupportedCategories = contract.unsupportedCategories.filter(
        (entry) => entry.id !== "external-workbook",
      );
    },
    expectedIssue: "required unsupported category set differs",
  },
  {
    name: "rejects unsupported categories without status",
    mutate: (contract) => {
      delete contract.unsupportedCategories[0]?.status;
    },
    expectedIssue: ".status: required field",
  },
  {
    name: "rejects parser inventory drift",
    mutate: (contract) => {
      contract.functions = contract.functions.filter((entry) => entry.canonical !== "SUM");
    },
    expectedIssue: "parser/inventory drift: unexpected SUM",
  },
  {
    name: "rejects assist status drift",
    mutate: (contract) => {
      const sum = contract.functions.find((entry) => entry.canonical === "SUM");
      if (sum) sum.implementation = "parser-declared-target";
    },
    expectedIssue: "assist/inventory drift: unexpected SUM",
  },
  {
    name: "rejects repository-escaping evidence paths",
    mutate: (contract) => {
      const profile = contract.implementationProfiles["implemented-assisted"];
      const evidence = profile?.evidence as Record<string, unknown> | undefined;
      if (evidence) evidence.paths = ["../outside"];
    },
    expectedIssue: "string does not match ^(packages|test|scripts)/",
  },
];

describe("formula capability contract", () => {
  test("validates the checked-in schema, inventory, parser, assist, and evidence paths", async () => {
    const result = await validateFormulaContractRepository(ROOT);
    expect(result.issues).toEqual([]);
    expect(result.summary).toEqual({
      functions: 154,
      requiredSupported: 100,
      unsupportedCategories: 7,
      parserSpellings: 156,
      assistSpellings: 156,
    });
  });

  test("keeps every object schema explicitly closed", () => {
    expect(validateClosedSchema(SCHEMA)).toEqual([]);
    const openSchema = structuredClone(SCHEMA) as {
      $defs: Record<string, Record<string, unknown>>;
    };
    delete openSchema.$defs.function?.additionalProperties;
    expect(validateClosedSchema(openSchema)).toContain(
      "schema.$defs.function: object schema is not closed",
    );
  });

  test("extracts canonical and alias spellings from the Rust function registry", () => {
    const source = `
      define_function_registry! {
        canonical {
          Avg => "AVG";
          ModeSngl => "MODE.SNGL";
        }
        aliases {
          "AVERAGE" => Avg;
        }
      }
    `;
    expect(extractParserSpellings(source)).toEqual(["AVG", "MODE.SNGL", "AVERAGE"]);
    expect(INVENTORY.parserRules).toMatchObject({
      dispatch: "lookup_func(name.as_ref())",
      caseSensitive: false,
    });
  });

  test("extracts only literal assist registry entries", () => {
    const source = `
      export const FORMULA_FUNCTIONS: readonly string[] = [
        "AVERAGE",
        "MODE.SNGL",
      ];
    `;
    expect(extractAssistSpellings(source)).toEqual(["AVERAGE", "MODE.SNGL"]);
    expect(() =>
      extractAssistSpellings(`
        export const FORMULA_FUNCTIONS: readonly string[] = [
          "SUM",
          injectedName,
        ];
      `),
    ).toThrow("non-literal entries");
  });

  for (const mutation of MUTATIONS) {
    test(mutation.name, async () => {
      const candidate = structuredClone(INVENTORY);
      mutation.mutate(candidate);
      const result = await validateFormulaContractRepository(ROOT, candidate);
      expect(result.issues.some((issue) => issue.includes(mutation.expectedIssue))).toBe(true);
    });
  }

  test("schema-only validation rejects mutations without repository context", () => {
    const candidate = structuredClone(INVENTORY);
    candidate.functions[0]!.version = 2;
    expect(
      validateFormulaContractData(candidate, SCHEMA).some((issue) =>
        issue.includes("contract.functions[0].version: expected constant 1"),
      ),
    ).toBe(true);
  });
});
