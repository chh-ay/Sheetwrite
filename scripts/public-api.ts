import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import * as ts from "typescript-compiler";
import { PUBLIC_TYPE_DOMAINS } from "./check-import-cycles.js";

export type ApiEntryClassification = "supported" | "internal" | "asset" | "test-only";

export interface ApiMemberDoc {
  name: string;
  documentation: string;
}

export interface ApiExport {
  name: string;
  kind: string;
  signature: string;
  owners: string[];
  source: string;
  jsDocTags: string[];
  documentation: string;
  memberDocs: ApiMemberDoc[];
}

export interface ApiEntryPoint {
  subpath: string;
  target: string;
  source?: string;
  kind: "typescript" | "asset";
  classification: ApiEntryClassification;
  exports: ApiExport[];
}

export interface ApiPackage {
  name: string;
  entryPoints: ApiEntryPoint[];
}

export interface PublicApiManifest {
  formatVersion: 2;
  packages: ApiPackage[];
}

export interface ApiIssue {
  code:
    | "deprecated-symbol"
    | "duplicate-export"
    | "forbidden-export"
    | "malformed-report"
    | "missing-documentation"
    | "missing-export"
    | "parse-error"
    | "manifest-drift"
    | "unclassified-entry"
    | "wrong-owner"
    | "unresolved-entry";
  message: string;
  package?: string;
  entryPoint?: string;
  symbol?: string;
}

interface PackageJson {
  name?: string;
  private?: boolean;
  workspaces?: string[];
  exports?: unknown;
  types?: string;
}

interface ResolvedEntry {
  subpath: string;
  target: string;
  source?: string;
  kind: "typescript" | "asset";
  classification: ApiEntryClassification;
}

const FORBIDDEN_EXPORTS = new Set([
  "Patch",
  "LegacyDataSource",
  "toXlsx",
  "fromXlsx",
  "XlsxBackend",
  "XlsxImportBackend",
  "setXlsxBackend",
  "setXlsxImportBackend",
]);

const REQUIRED_CORE_EXPORTS = new Set([
  "DocumentOp",
  "DataSource",
  "ChangeEvent",
  "Store",
  "toXlsxTable",
  "fromXlsxTable",
  "XlsxTableExportBackend",
  "XlsxTableImportBackend",
  "setXlsxTableExportBackend",
  "setXlsxTableImportBackend",
  "toXlsxWorkbook",
  "fromXlsxWorkbook",
  "XlsxWorkbookBackend",
  "setXlsxWorkbookBackend",
]);

const SUPPORTED_PACKAGES: Readonly<Record<string, true>> = {
  "@sheetwrite/core": true,
  "@sheetwrite/react": true,
  "@sheetwrite/svelte": true,
  "@sheetwrite/vue": true,
  "@sheetwrite/xlsx": true,
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

function selectTypesTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return undefined;
  const conditions = value as Record<string, unknown>;
  const preferred = conditions.types ?? conditions.svelte ?? conditions.default;
  if (preferred !== undefined) return selectTypesTarget(preferred);
  for (const nested of Object.values(conditions)) {
    const target = selectTypesTarget(nested);
    if (target !== undefined) return target;
  }
  return undefined;
}

function exportedSubpaths(manifest: PackageJson): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (manifest.exports !== undefined) {
    if (typeof manifest.exports === "string") return [[".", manifest.exports]];
    if (manifest.exports !== null && typeof manifest.exports === "object") {
      for (const [subpath, value] of Object.entries(manifest.exports)) {
        if (!subpath.startsWith(".")) continue;
        const target = selectTypesTarget(value);
        if (target !== undefined) entries.push([subpath, target]);
      }
    }
  } else if (manifest.types !== undefined) {
    entries.push([".", manifest.types]);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function isTypescriptTarget(target: string): boolean {
  return /(?:\.d)?\.[cm]?tsx?$/.test(target);
}

async function resolveSource(packageRoot: string, target: string): Promise<string | undefined> {
  const normalized = target.replace(/^\.\//, "");
  const published = resolve(packageRoot, normalized);
  const sourceCandidates: string[] = [];
  if (normalized.startsWith("dist/")) {
    const sourcePath = normalized.slice("dist/".length);
    sourceCandidates.push(
      join(packageRoot, "src", sourcePath.replace(/\.d\.[cm]?ts$/, ".ts")),
      join(packageRoot, "src", sourcePath.replace(/\.d\.[cm]?ts$/, ".tsx")),
      join(packageRoot, "src", sourcePath.replace(/\.[cm]?js$/, ".ts")),
    );
  }
  if (/\.[cm]?js$/.test(normalized)) {
    sourceCandidates.push(resolve(packageRoot, normalized.replace(/\.[cm]?js$/, ".ts")));
    sourceCandidates.push(resolve(packageRoot, normalized.replace(/\.[cm]?js$/, ".tsx")));
  }

  for (const candidate of sourceCandidates) {
    if (await exists(candidate)) return candidate;
  }
  if (await exists(published)) return published;
  return undefined;
}

async function packageDirectories(repositoryRoot: string): Promise<string[]> {
  const rootManifest = await readJson<PackageJson>(join(repositoryRoot, "package.json"));
  const directories: string[] = [];
  for (const workspace of rootManifest.workspaces ?? []) {
    if (!workspace.endsWith("/*")) continue;
    const parent = resolve(repositoryRoot, workspace.slice(0, -2));
    if (!(await exists(parent))) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(parent, entry.name);
      if (await exists(join(directory, "package.json"))) directories.push(directory);
    }
  }
  return directories.sort();
}

function classifyEntry(
  packageName: string,
  subpath: string,
  kind: "typescript" | "asset",
): ApiEntryClassification | undefined {
  if (kind === "asset") return "asset";
  if (packageName === "@sheetwrite/core" && subpath === "./testing") return "test-only";
  if (packageName === "@sheetwrite/wasm" && subpath === ".") return "internal";
  if (SUPPORTED_PACKAGES[packageName] === true) return "supported";
  return undefined;
}

async function resolveEntries(
  packageRoot: string,
  manifest: PackageJson,
): Promise<{ entries: ResolvedEntry[]; issues: ApiIssue[] }> {
  const entries: ResolvedEntry[] = [];
  const issues: ApiIssue[] = [];
  const packageName = manifest.name ?? "";
  for (const [subpath, target] of exportedSubpaths(manifest)) {
    const kind = isTypescriptTarget(target) ? "typescript" : "asset";
    const classification = classifyEntry(packageName, subpath, kind);
    if (classification === undefined) {
      issues.push({
        code: "unclassified-entry",
        message: `${packageName} ${subpath} (${target}) has no public API classification`,
        package: packageName,
        entryPoint: subpath,
      });
      continue;
    }
    if (kind === "asset") {
      entries.push({ subpath, target, kind, classification });
      continue;
    }
    entries.push({
      subpath,
      target,
      source: await resolveSource(packageRoot, target),
      kind,
      classification,
    });
  }
  return { entries, issues };
}

function normalizeText(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n\r]*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function symbolKind(symbol: ts.Symbol): string {
  const flags = symbol.flags;
  if (flags & ts.SymbolFlags.Class) return "class";
  if (flags & ts.SymbolFlags.Interface) return "interface";
  if (flags & ts.SymbolFlags.TypeAlias) return "type";
  if (flags & ts.SymbolFlags.Enum) return "enum";
  if (flags & ts.SymbolFlags.Function) return "function";
  if (flags & ts.SymbolFlags.Variable) return "variable";
  if (flags & ts.SymbolFlags.NamespaceModule) return "namespace";
  return "symbol";
}

function isPrivateSymbol(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations() ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => {
      if (!ts.canHaveModifiers(declaration)) return false;
      return (
        ts
          .getModifiers(declaration)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword) === true
      );
    })
  );
}

function publicPropertySignature(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  prefix = "",
): string | undefined {
  if (isPrivateSymbol(symbol) || symbol.getName() === "prototype") return undefined;
  const location = symbol.getDeclarations()?.[0];
  if (location === undefined) return undefined;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const optional = symbol.flags & ts.SymbolFlags.Optional ? "?" : "";
  return `${prefix}${symbol.getName()}${optional}: ${checker.typeToString(
    type,
    location,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  )}`;
}

function memberDocumentation(symbol: ts.Symbol, checker: ts.TypeChecker): ApiMemberDoc[] {
  const docs = new Map<string, string>();
  const record = (name: string, documentation: string): void => {
    if (documentation.length > 0 && !docs.has(name)) docs.set(name, documentation);
  };
  const collectFromType = (type: ts.Type): void => {
    for (const property of checker.getPropertiesOfType(type)) {
      if (isPrivateSymbol(property) || property.getName() === "prototype") continue;
      record(
        property.getName(),
        ts.displayPartsToString(property.getDocumentationComment(checker)).trim(),
      );
    }
    const signatureKinds = [
      [ts.SignatureKind.Call, "call"],
      [ts.SignatureKind.Construct, "new"],
    ] as const;
    for (const [kind, name] of signatureKinds) {
      for (const signature of checker.getSignaturesOfType(type, kind)) {
        record(name, ts.displayPartsToString(signature.getDocumentationComment(checker)).trim());
      }
    }
    for (const info of checker.getIndexInfosOfType(type)) {
      const declaration = info.declaration;
      if (declaration === undefined) continue;
      const comment = ts
        .getJSDocCommentsAndTags(declaration)
        .map((doc) =>
          doc.kind === ts.SyntaxKind.JSDoc ? (ts.getTextOfJSDocComment(doc.comment) ?? "") : "",
        )
        .join(" ")
        .trim();
      record("index", comment);
    }
  };
  if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) {
    collectFromType(checker.getDeclaredTypeOfSymbol(symbol));
  }
  const classDeclaration = symbol.getDeclarations()?.find(ts.isClassDeclaration);
  if (classDeclaration !== undefined) {
    collectFromType(checker.getTypeOfSymbolAtLocation(symbol, classDeclaration));
  }
  const aliasDeclaration = symbol.getDeclarations()?.find(ts.isTypeAliasDeclaration);
  if (aliasDeclaration !== undefined) {
    collectFromType(checker.getTypeAtLocation(aliasDeclaration.type));
  }
  return [...docs.entries()]
    .map(([name, documentation]) => ({ name, documentation }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function classSignature(symbol: ts.Symbol, checker: ts.TypeChecker): string {
  const declaration = symbol.getDeclarations()?.find(ts.isClassDeclaration);
  if (declaration === undefined) return `class ${symbol.getName()}`;
  const instanceType = checker.getDeclaredTypeOfSymbol(symbol);
  const valueType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const constructors = checker
    .getSignaturesOfType(valueType, ts.SignatureKind.Construct)
    .map((signature) =>
      checker.signatureToString(
        signature,
        declaration,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
      ),
    );
  const members = checker
    .getPropertiesOfType(instanceType)
    .map((property) => publicPropertySignature(property, checker))
    .filter((signature): signature is string => signature !== undefined);
  const staticMembers = checker
    .getPropertiesOfType(valueType)
    .map((property) => publicPropertySignature(property, checker, "static "))
    .filter((signature): signature is string => signature !== undefined);
  return `class ${symbol.getName()} { ${[...constructors, ...members, ...staticMembers]
    .sort()
    .join("; ")} }`;
}

function declarationSignature(symbol: ts.Symbol, checker: ts.TypeChecker): string {
  const declarations = symbol.getDeclarations() ?? [];
  if (symbol.flags & ts.SymbolFlags.Class) return classSignature(symbol, checker);
  if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)) {
    return declarations
      .map((declaration) => normalizeText(declaration.getText()))
      .sort()
      .join(" | ");
  }

  const location = declarations[0];
  if (location === undefined) return symbol.getName();
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const callSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  if (callSignatures.length > 0) {
    return callSignatures
      .map((signature) =>
        checker.signatureToString(
          signature,
          location,
          ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
        ),
      )
      .sort()
      .join(" | ");
  }
  return checker.typeToString(
    type,
    location,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
}

function exportStatementDocumentation(symbol: ts.Symbol): string {
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (!ts.isExportSpecifier(declaration)) continue;
    const statement = declaration.parent.parent;
    const comment = ts
      .getJSDocCommentsAndTags(statement)
      .map((doc) =>
        doc.kind === ts.SyntaxKind.JSDoc ? (ts.getTextOfJSDocComment(doc.comment) ?? "") : "",
      )
      .join(" ")
      .trim();
    if (comment.length > 0) return comment;
  }
  return "";
}

function collectTags(symbol: ts.Symbol, checker: ts.TypeChecker): string[] {
  const tags = new Set(symbol.getJsDocTags(checker).map((tag) => tag.name));
  for (const declaration of symbol.getDeclarations() ?? []) {
    const visit = (node: ts.Node): void => {
      if (ts.isBlock(node)) return;
      if (ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)) return;
      }
      for (const tag of ts.getJSDocTags(node)) tags.add(tag.tagName.text);
      ts.forEachChild(node, visit);
    };
    visit(declaration);
  }
  return [...tags].sort();
}

function resolvedSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while (current.flags & ts.SymbolFlags.Alias) {
    if (seen.has(current)) break;
    seen.add(current);
    current = checker.getAliasedSymbol(current);
  }
  return current;
}

function analyzeEntry(
  packageName: string,
  packageRoot: string,
  entry: ResolvedEntry,
): { entry: ApiEntryPoint; issues: ApiIssue[] } {
  const issues: ApiIssue[] = [];
  if (entry.source === undefined) {
    issues.push({
      code: "unresolved-entry",
      message: `${packageName}${entry.subpath === "." ? "" : entry.subpath.slice(1)} cannot resolve ${entry.target}`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return { entry: { ...entry, exports: [] }, issues };
  }

  const program = ts.createProgram([entry.source], {
    allowJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  const sourceFile = program.getSourceFile(entry.source);
  if (sourceFile === undefined) {
    issues.push({
      code: "parse-error",
      message: `${packageName} ${entry.subpath} was resolved but not parsed`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(packageRoot, entry.source)), exports: [] },
      issues,
    };
  }

  for (const diagnostic of program.getSyntacticDiagnostics(sourceFile)) {
    issues.push({
      code: "parse-error",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      package: packageName,
      entryPoint: entry.subpath,
    });
  }
  for (const diagnostic of program.getSemanticDiagnostics()) {
    if (diagnostic.code !== 2308) continue;
    issues.push({
      code: "duplicate-export",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      package: packageName,
      entryPoint: entry.subpath,
    });
  }

  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    issues.push({
      code: "parse-error",
      message: `${packageName} ${entry.subpath} is not an external module`,
      package: packageName,
      entryPoint: entry.subpath,
    });
    return {
      entry: { ...entry, source: posix(relative(packageRoot, entry.source)), exports: [] },
      issues,
    };
  }

  const mergedDeclarationSymbols: string[] = [];
  const apiExports = checker
    .getExportsOfModule(moduleSymbol)
    .map((exported): ApiExport => {
      const target = resolvedSymbol(exported, checker);
      const declarations = target.getDeclarations() ?? [];
      const structuralDeclarations = declarations.filter(
        (candidate) =>
          ts.isInterfaceDeclaration(candidate) ||
          ts.isTypeAliasDeclaration(candidate) ||
          ts.isEnumDeclaration(candidate),
      );
      if (structuralDeclarations.length > 1) mergedDeclarationSymbols.push(exported.getName());
      const owners = new Set(
        declarations.map((declaration) =>
          posix(relative(packageRoot, declaration.getSourceFile().fileName)),
        ),
      );
      const declaration = declarations[0];
      const source =
        declaration === undefined
          ? ""
          : `${posix(relative(packageRoot, declaration.getSourceFile().fileName))}#L${
              declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart())
                .line + 1
            }`;
      const tags = new Set([...collectTags(exported, checker), ...collectTags(target, checker)]);
      const documentation = [
        exportStatementDocumentation(exported),
        ...[exported, target].map((symbol) =>
          ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
        ),
      ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
      return {
        name: exported.getName(),
        kind: symbolKind(target),
        signature: declarationSignature(target, checker),
        owners: [...owners].sort(),
        source,
        jsDocTags: [...tags].sort(),
        documentation: documentation.join("\n\n"),
        memberDocs: memberDocumentation(target, checker),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const symbol of mergedDeclarationSymbols) {
    issues.push({
      code: "duplicate-export",
      message: `${packageName} ${entry.subpath} export ${symbol} merges multiple structural declarations; the joined signature cannot render as one declaration`,
      package: packageName,
      entryPoint: entry.subpath,
      symbol,
    });
  }
  for (const apiExport of apiExports) {
    if (apiExport.owners.length > 1) {
      issues.push({
        code: "duplicate-export",
        message: `${packageName} ${entry.subpath} gives ${apiExport.name} multiple owners: ${apiExport.owners.join(", ")}`,
        package: packageName,
        entryPoint: entry.subpath,
        symbol: apiExport.name,
      });
    }
    if (apiExport.jsDocTags.includes("deprecated")) {
      issues.push({
        code: "deprecated-symbol",
        message: `${packageName} ${entry.subpath} exports deprecated symbol ${apiExport.name}`,
        package: packageName,
        entryPoint: entry.subpath,
        symbol: apiExport.name,
      });
    }
    if (entry.classification === "supported" && apiExport.documentation.trim().length === 0) {
      issues.push({
        code: "missing-documentation",
        message: `${packageName} ${entry.subpath} export ${apiExport.name} has no source JSDoc summary`,
        package: packageName,
        entryPoint: entry.subpath,
        symbol: apiExport.name,
      });
    }
  }

  return {
    entry: {
      subpath: entry.subpath,
      target: entry.target,
      source: posix(relative(packageRoot, entry.source)),
      kind: entry.kind,
      classification: entry.classification,
      exports: apiExports,
    },
    issues,
  };
}

export function validateManifest(value: unknown): ApiIssue[] {
  const malformed = (message: string): ApiIssue[] => [
    { code: "malformed-report", message: `Malformed public API report: ${message}` },
  ];
  if (value === null || typeof value !== "object") return malformed("root is not an object");
  const report = value as Partial<PublicApiManifest>;
  if (report.formatVersion !== 2) return malformed("formatVersion is not 2");
  if (!Array.isArray(report.packages) || report.packages.length === 0) {
    return malformed("packages is missing or empty");
  }
  for (const pkg of report.packages) {
    if (typeof pkg?.name !== "string" || pkg.name.length === 0)
      return malformed("package name missing");
    if (!Array.isArray(pkg.entryPoints) || pkg.entryPoints.length === 0) {
      return malformed(`${pkg.name} entryPoints is missing or empty`);
    }
    for (const entry of pkg.entryPoints) {
      if (typeof entry.subpath !== "string" || !Array.isArray(entry.exports)) {
        return malformed(`${pkg.name} contains a partial entry point`);
      }
      if (
        entry.classification !== "supported" &&
        entry.classification !== "internal" &&
        entry.classification !== "asset" &&
        entry.classification !== "test-only"
      ) {
        return malformed(`${pkg.name} ${entry.subpath} has no valid classification`);
      }
      const names = new Set<string>();
      for (const apiExport of entry.exports) {
        if (
          typeof apiExport?.name !== "string" ||
          typeof apiExport.kind !== "string" ||
          typeof apiExport.signature !== "string" ||
          !Array.isArray(apiExport.owners) ||
          typeof apiExport.source !== "string" ||
          !Array.isArray(apiExport.jsDocTags) ||
          typeof apiExport.documentation !== "string" ||
          !Array.isArray(apiExport.memberDocs) ||
          apiExport.memberDocs.some(
            (member) =>
              typeof member?.name !== "string" || typeof member.documentation !== "string",
          )
        ) {
          return malformed(`${pkg.name} ${entry.subpath} contains a partial export`);
        }
        if (names.has(apiExport.name))
          return malformed(`${pkg.name} ${entry.subpath} repeats ${apiExport.name}`);
        names.add(apiExport.name);
      }
    }
  }
  return [];
}
export const PUBLIC_API_BASELINE_SHA256 =
  "4f6cc69d3d8d8316b5317901d8c58ebf61e6745e79d1ec88482ce2c210e5f93f";

export function publicApiDigest(manifest: PublicApiManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export function checkManifestBaseline(
  manifest: PublicApiManifest,
  expected = PUBLIC_API_BASELINE_SHA256,
): ApiIssue[] {
  const actual = publicApiDigest(manifest);
  return actual === expected
    ? []
    : [
        {
          code: "manifest-drift",
          message: `Public API manifest digest changed: expected ${expected}, received ${actual}`,
        },
      ];
}

export async function analyzePublicApi(repositoryRoot: string): Promise<{
  manifest: PublicApiManifest;
  issues: ApiIssue[];
}> {
  const packages: ApiPackage[] = [];
  const issues: ApiIssue[] = [];
  for (const packageRoot of await packageDirectories(repositoryRoot)) {
    const packageManifest = await readJson<PackageJson>(join(packageRoot, "package.json"));
    if (packageManifest.name === undefined || packageManifest.private === true) continue;
    const resolved = await resolveEntries(packageRoot, packageManifest);
    issues.push(...resolved.issues);
    const entryPoints: ApiEntryPoint[] = [];
    for (const entry of resolved.entries) {
      if (entry.kind === "asset") {
        entryPoints.push({ ...entry, exports: [] });
        continue;
      }
      const analyzed = analyzeEntry(packageManifest.name, packageRoot, entry);
      entryPoints.push(analyzed.entry);
      issues.push(...analyzed.issues);
    }
    if (entryPoints.length > 0) packages.push({ name: packageManifest.name, entryPoints });
  }

  const manifest: PublicApiManifest = { formatVersion: 2, packages };
  issues.push(...validateManifest(manifest));

  const core = packages.find((pkg) => pkg.name === "@sheetwrite/core");
  const coreRoot = core?.entryPoints.find((entry) => entry.subpath === ".");
  const allExports = new Set(
    packages.flatMap((pkg) =>
      pkg.entryPoints.flatMap((entry) => entry.exports.map((item) => item.name)),
    ),
  );
  for (const name of FORBIDDEN_EXPORTS) {
    if (!allExports.has(name)) continue;
    issues.push({
      code: "forbidden-export",
      message: `Forbidden compatibility export: ${name}`,
      symbol: name,
    });
  }
  const coreExports = new Set(coreRoot?.exports.map((item) => item.name) ?? []);
  for (const name of REQUIRED_CORE_EXPORTS) {
    if (coreExports.has(name)) continue;
    issues.push({
      code: "missing-export",
      message: `Missing canonical @sheetwrite/core export: ${name}`,
      package: "@sheetwrite/core",
      entryPoint: ".",
      symbol: name,
    });
  }
  if (
    coreRoot !== undefined &&
    (coreRoot.source === "dist/index.d.ts" || coreRoot.source === "src/index.ts")
  ) {
    const builtDeclarations = coreRoot.source.startsWith("dist/");
    for (const [domainName, domain] of Object.entries(PUBLIC_TYPE_DOMAINS)) {
      const expectedOwner = builtDeclarations
        ? `dist/types/${domainName}.d.ts`
        : `src/types/${domainName}.ts`;
      for (const name of domain.exports) {
        const apiExport = coreRoot.exports.find((item) => item.name === name);
        if (apiExport === undefined) continue;
        if (apiExport.owners.length === 1 && apiExport.owners[0] === expectedOwner) continue;
        issues.push({
          code: "wrong-owner",
          message: `@sheetwrite/core ${name} must be owned by ${expectedOwner}; found ${apiExport.owners.join(", ") || "none"}`,
          package: "@sheetwrite/core",
          entryPoint: ".",
          symbol: name,
        });
      }
    }
  }

  issues.sort((left, right) =>
    [left.code, left.package ?? "", left.entryPoint ?? "", left.symbol ?? "", left.message]
      .join("\0")
      .localeCompare(
        [
          right.code,
          right.package ?? "",
          right.entryPoint ?? "",
          right.symbol ?? "",
          right.message,
        ].join("\0"),
      ),
  );
  return { manifest, issues };
}

function formatIssues(issues: readonly ApiIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}

if (import.meta.main) {
  const mode = process.argv[2];
  const repositoryRoot = resolve(process.argv[3] ?? join(import.meta.dir, ".."));
  if (mode !== "report" && mode !== "check") {
    throw new Error("Usage: bun scripts/public-api.ts <report|check> [repository-root]");
  }
  const result = await analyzePublicApi(repositoryRoot);
  if (mode === "report") {
    if (
      result.issues.some(
        (issue) =>
          issue.code === "malformed-report" ||
          issue.code === "parse-error" ||
          issue.code === "unresolved-entry",
      )
    ) {
      throw new Error(formatIssues(result.issues));
    }
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
  } else {
    const issues = [...result.issues, ...checkManifestBaseline(result.manifest)];
    if (issues.length > 0) throw new Error(formatIssues(issues));
    console.log("Public API policy check passed");
  }
}
