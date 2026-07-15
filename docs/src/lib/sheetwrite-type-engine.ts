import {
  CompilerOptionsResolver,
  createLanguage,
  createVueLanguagePlugin,
  defaultMapperFactory,
  FileMap,
} from "@vue/language-core";
import ts from "typescript";

export interface SheetwriteTypeHover {
  type: "hover";
  text: string;
  docs?: string;
  tags?: readonly [name: string, text: string | undefined][];
  start: number;
  length: number;
  target: string;
  line: number;
  character: number;
}

export interface SheetwriteTypeEngineOptions {
  cwd: string;
  fsMap?: ReadonlyMap<string, string>;
}

interface VirtualSource {
  code: string;
  version: number;
}

const INTERNAL_IDENTIFIER = /^__/;
const UNRESOLVED_ANY = /\bany\b/;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function displayParts(parts: readonly ts.SymbolDisplayPart[] | undefined): string {
  return parts?.map((part) => part.text).join("") ?? "";
}

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) offsets.push(index + 1);
  }
  return offsets;
}

function sourcePosition(
  offsets: readonly number[],
  offset: number,
): { line: number; character: number } {
  let low = 0;
  let high = offsets.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if ((offsets[middle] ?? 0) <= offset) low = middle;
    else high = middle;
  }
  return { line: low, character: offset - (offsets[low] ?? 0) };
}

function usefulType(text: string): boolean {
  return text.length > 0 && !UNRESOLVED_ANY.test(text);
}

function eventPropertyName(target: string): string {
  return `on${target
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

function typeAfterDeclaration(text: string): string | undefined {
  const separator = text.indexOf(":");
  if (separator < 0) return undefined;
  const value = text.slice(separator + 1).trim();
  return usefulType(value) ? value : undefined;
}

/**
 * Repository-owned quick-info engine. TypeScript remains the type system; this class owns
 * virtual files, identifier discovery, framework source mapping, and unresolved-type repair.
 */
export class SheetwriteTypeEngine {
  private readonly compilerOptions: ts.CompilerOptions;
  private readonly virtualSources = new Map<string, VirtualSource>();
  private readonly languageService: ts.LanguageService;
  private projectVersion = 0;

  constructor(private readonly options: SheetwriteTypeEngineOptions) {
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "react",
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      allowJs: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      noImplicitAny: false,
    };

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.compilerOptions,
      getCurrentDirectory: () => this.options.cwd,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getNewLine: () => "\n",
      getProjectVersion: () => String(this.projectVersion),
      getScriptFileNames: () => [...this.virtualSources.keys()],
      getScriptKind: (fileName) =>
        fileName.endsWith(".tsx")
          ? ts.ScriptKind.TSX
          : fileName.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : fileName.endsWith(".js")
              ? ts.ScriptKind.JS
              : fileName.endsWith(".json")
                ? ts.ScriptKind.JSON
                : ts.ScriptKind.TS,
      getScriptSnapshot: (fileName) => {
        const content = this.readFile(fileName);
        return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
      },
      getScriptVersion: (fileName) =>
        String(this.virtualSources.get(normalizedPath(fileName))?.version ?? 0),
      fileExists: (fileName) => this.readFile(fileName) !== undefined,
      readFile: (fileName) => this.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    };
    this.languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  analyze(source: string, language: "ts" | "tsx" | "vue"): SheetwriteTypeHover[] {
    if (language === "vue") return this.analyzeVue(source);
    return this.analyzeTypeScript(source, language);
  }

  private readFile(fileName: string): string | undefined {
    const path = normalizedPath(fileName);
    const virtual = this.virtualSources.get(path);
    if (virtual) return virtual.code;
    const mapped = this.options.fsMap?.get(path) ?? this.options.fsMap?.get(fileName);
    return mapped ?? ts.sys.readFile(fileName);
  }

  private analyzeTypeScript(source: string, language: "ts" | "tsx"): SheetwriteTypeHover[] {
    const fileName = normalizedPath(`${this.options.cwd}/.sheetwrite-hover.${language}`);
    const current = this.virtualSources.get(fileName);
    this.virtualSources.clear();
    this.virtualSources.set(fileName, { code: source, version: (current?.version ?? 0) + 1 });
    this.projectVersion += 1;

    const sourceFile = this.languageService.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return [];

    const hovers: SheetwriteTypeHover[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !INTERNAL_IDENTIFIER.test(node.text)) {
        const start = node.getStart(sourceFile);
        const quickInfo = this.languageService.getQuickInfoAtPosition(fileName, start);
        const text = displayParts(quickInfo?.displayParts);
        if (text) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
          const docs = displayParts(quickInfo?.documentation);
          const tags = quickInfo?.tags?.map(
            (tag) => [tag.name, displayParts(tag.text)] as [string, string | undefined],
          );
          hovers.push({
            type: "hover",
            text,
            ...(docs ? { docs } : {}),
            ...(tags?.length ? { tags } : {}),
            start,
            length: node.end - start,
            target: node.text,
            line,
            character,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return hovers;
  }

  private analyzeVue(source: string): SheetwriteTypeHover[] {
    const resolver = new CompilerOptionsResolver(ts as never, ts.sys.readFile);
    resolver.addConfig({}, this.options.cwd);
    const language = createLanguage(
      [
        createVueLanguagePlugin<string>(
          ts as never,
          { ...this.compilerOptions, jsx: ts.JsxEmit.Preserve } as never,
          resolver.build(),
          (id) => id,
        ),
      ],
      new FileMap(ts.sys.useCaseSensitiveFileNames),
      () => {},
    );
    const sourceFileName = normalizedPath(`${this.options.cwd}/.sheetwrite-hover.vue`);
    const script = language.scripts.set(sourceFileName, ts.ScriptSnapshot.fromString(source));
    if (!script?.generated) return [];
    const embedded = [...script.generated.embeddedCodes.values()].find(
      (code) => code.id === "script_ts",
    );
    if (!embedded) return [];

    const generated = embedded.snapshot.getText(0, embedded.snapshot.getLength());
    const mapper = defaultMapperFactory(embedded.mappings);
    const generatedHovers = this.analyzeTypeScript(generated, "tsx");
    const offsets = lineOffsets(source);
    const mapped: SheetwriteTypeHover[] = [];

    for (const hover of generatedHovers) {
      const startMapping = [...mapper.toSourceLocation(hover.start)][0];
      if (!startMapping) continue;
      const start = startMapping[0];
      let end = [...mapper.toSourceLocation(hover.start + hover.length)][0]?.[0];
      if (end === undefined && startMapping[1].sourceOffsets[0] === start) {
        end = startMapping[1].sourceOffsets[1];
      }
      if (end === undefined || start < 0 || end <= start || end > source.length) continue;
      const target = source.slice(start, end);
      if (!target.trim()) continue;
      const { line, character } = sourcePosition(offsets, start);
      mapped.push({ ...hover, start, length: end - start, target, line, character });
    }

    return this.resolveFrameworkTypes(mapped, source);
  }

  resolveFrameworkTypes(
    hovers: readonly SheetwriteTypeHover[],
    source?: string,
  ): SheetwriteTypeHover[] {
    const normalized = hovers.map((hover) => ({
      ...hover,
      text: hover.text.replace(/<__VLS_[A-Za-z0-9_$]+>/g, ""),
    }));
    const resolvedByTarget = new Map<string, SheetwriteTypeHover>();
    for (const hover of normalized) {
      if (usefulType(hover.text)) resolvedByTarget.set(hover.target, hover);
    }
    const scriptBoundary = source?.lastIndexOf("</script>") ?? -1;

    const repaired = normalized.map((hover) => {
      if (usefulType(hover.text)) return hover;
      if (source && hover.target === "$props") {
        const lineStart = source.lastIndexOf("\n", hover.start) + 1;
        const prefix = source.slice(lineStart, hover.start);
        const annotatedType = prefix.match(/:\s*([^=]+?)\s*=\s*$/)?.[1]?.trim();
        if (annotatedType && usefulType(annotatedType)) {
          return { ...hover, text: `function $props(): ${annotatedType}` };
        }
      }
      const sameTarget = resolvedByTarget.get(hover.target);
      if (sameTarget && source && scriptBoundary >= 0 && hover.start > scriptBoundary) {
        return { ...hover, text: sameTarget.text, docs: hover.docs ?? sameTarget.docs };
      }

      if (source && hover.target.includes("-")) {
        const suffix = source.slice(hover.start + hover.length);
        const handlerName = suffix.match(/^="([A-Za-z_$][\w$]*)"/)?.[1];
        const handler = handlerName ? resolvedByTarget.get(handlerName) : undefined;
        const handlerType = handler ? typeAfterDeclaration(handler.text) : undefined;
        if (handlerType) {
          return { ...hover, text: `${eventPropertyName(hover.target)}: ${handlerType}` };
        }
      }
      return hover;
    });

    const byRange = new Map<string, SheetwriteTypeHover>();
    for (const hover of repaired) byRange.set(`${hover.start}:${hover.length}`, hover);
    return [...byRange.values()].sort((left, right) => left.start - right.start);
  }
}
