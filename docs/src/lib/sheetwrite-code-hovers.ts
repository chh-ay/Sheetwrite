import {
  type AnnotationRenderOptions,
  definePlugin,
  ExpressiveCodeAnnotation,
  type ExpressiveCodeBlock,
  type ResolvedExpressiveCodeEngineConfig,
} from "@expressive-code/core";
import { type Element, type ElementContent, h, selectAll } from "@expressive-code/core/hast";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { ExpressiveCode } from "expressive-code";
import { format } from "prettier";
import { svelte2tsx } from "svelte2tsx";
import { SheetwriteTypeEngine, type SheetwriteTypeHover } from "./sheetwrite-type-engine.js";

const SUPPORTED_LANGUAGES = new Set(["ts", "tsx", "vue", "svelte"]);
const LEADING_KIND = /^\(([\w-]+)\)\s+/gm;
const IMPORT_SUFFIX = /\nimport .*$/s;
const TYPE_MEMBER = /^[A-Z]\w*(<[^>]*>)?:/;
const FUNCTION_MEMBER = /^\w+\(/;

export interface SheetwriteCodeHoverOptions {
  cwd: string;
  fsMap?: Map<string, string>;
  shouldTransform?: (codeBlock: ExpressiveCodeBlock) => boolean;
}

interface RenderedHover {
  accessibleSignature: string;
  wideSignature: ElementContent[];
  narrowSignature: ElementContent[];
  docs?: string;
  tags: readonly [name: string, text: string | undefined][];
}

function nestedRendererConfig(config: ResolvedExpressiveCodeEngineConfig) {
  return {
    cascadeLayer: config.cascadeLayer,
    customizeTheme: config.customizeTheme,
    defaultLocale: config.defaultLocale,
    defaultProps: config.defaultProps,
    logger: config.logger,
    minSyntaxHighlightingColorContrast: config.minSyntaxHighlightingColorContrast,
    styleOverrides: config.styleOverrides,
    themeCssRoot: config.themeCssRoot,
    themeCssSelector: config.themeCssSelector,
    themes: config.themes,
    useDarkModeMediaQuery: config.useDarkModeMediaQuery,
    useStyleReset: config.useStyleReset,
    useThemedScrollbars: config.useThemedScrollbars,
    useThemedSelectionColors: config.useThemedSelectionColors,
    frames: {
      showCopyToClipboardButton: false,
      extractFileNameFromCode: false,
    },
  };
}

function normalizeQuickInfo(raw: string): string {
  let signature = raw.replace(LEADING_KIND, "").replace(IMPORT_SUFFIX, "").trim();
  if (TYPE_MEMBER.test(signature)) signature = `type ${signature}`;
  if (FUNCTION_MEMBER.test(signature)) signature = `function ${signature}`;
  return signature;
}

async function formatSignature(signature: string, printWidth: number): Promise<string> {
  if (!signature) return signature;

  const needsDeclaration = /^(const|let|var|function)\b/.test(signature);
  const source = needsDeclaration ? `declare ${signature.replace(/;?$/, ";")}` : signature;
  try {
    const formatted = await format(source, {
      parser: "typescript",
      printWidth,
      tabWidth: 2,
      semi: true,
      singleQuote: false,
      trailingComma: "all",
    });
    const withoutDeclaration = needsDeclaration
      ? formatted.replace(/^declare\s+/, "").replace(/;\s*$/, "")
      : formatted.trimEnd();
    return withoutDeclaration.trim();
  } catch {
    return signature;
  }
}

export async function formatHoverSignature(raw: string, printWidth = 80): Promise<string> {
  return formatSignature(normalizeQuickInfo(raw), printWidth);
}

function codeLineContents(ast: Element): ElementContent[] {
  const lines = selectAll(".ec-line > .code", ast);
  const output: ElementContent[] = [];
  for (const [index, line] of lines.entries()) {
    output.push(h("span.sw-code-popover__line", line.children));
    if (index < lines.length - 1) output.push({ type: "text", value: "\n" });
  }
  return output;
}

function cleanDocumentation(value: string): string {
  return value
    .replace(/\{@link\s+([^}|\s]+)(?:\s*\|\s*([^}]+))?\}/g, (_, target: string, label?: string) =>
      (label ?? target).trim(),
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvedQuickInfo(hover: SheetwriteTypeHover, language: string): string {
  const signature = normalizeQuickInfo(hover.text);
  if (
    language === "vue" &&
    hover.target === "Sheetwrite" &&
    signature.includes("DefineComponent<")
  ) {
    return "const Sheetwrite: DefineComponent";
  }
  return signature;
}

function svelteScriptDocumentation(
  source: string,
  analyzer: SheetwriteTypeEngine,
): ReadonlyMap<string, string> {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (scripts.length === 0) return new Map();

  const documentation = new Map<string, string>();
  for (const node of analyzer.analyze(scripts.join("\n"), "ts")) {
    if (node.type !== "hover" || !node.docs?.trim() || documentation.has(node.target)) continue;
    documentation.set(node.target, node.docs);
  }
  return documentation;
}

function mapSvelteHovers(source: string, analyzer: SheetwriteTypeEngine): SheetwriteTypeHover[] {
  const transformed = svelte2tsx(source, {
    filename: "Component.svelte",
    isTsFile: true,
    mode: "ts",
  });
  const sourceMap = new TraceMap(JSON.parse(transformed.map.toString()));
  const scriptDocumentation = svelteScriptDocumentation(source, analyzer);
  const sourceLines = source.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of sourceLines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const result = analyzer.analyze(transformed.code, "tsx");
  const hovers: SheetwriteTypeHover[] = [];
  for (const node of result) {
    const original = originalPositionFor(sourceMap, {
      line: node.line + 1,
      column: node.character,
    });
    if (original.line === null || original.column === null) continue;
    const lineIndex = original.line - 1;
    const sourceLine = sourceLines[lineIndex];
    if (
      !sourceLine ||
      sourceLine.slice(original.column, original.column + node.target.length) !== node.target
    ) {
      continue;
    }
    hovers.push({
      ...node,
      docs: node.docs?.trim() ? node.docs : scriptDocumentation.get(node.target),
      line: lineIndex,
      character: original.column,
      start: (lineOffsets[lineIndex] ?? 0) + original.column,
      length: node.target.length,
    });
  }
  return analyzer.resolveFrameworkTypes(hovers, source);
}

class SheetwriteHoverAnnotation extends ExpressiveCodeAnnotation {
  readonly name = "sheetwrite-code-hover";

  constructor(
    hover: SheetwriteTypeHover,
    private readonly rendered: RenderedHover,
    private readonly popoverId: string,
  ) {
    super({
      inlineRange: {
        columnStart: hover.character,
        columnEnd: hover.character + hover.length,
      },
    });
  }

  override render({ nodesToTransform }: AnnotationRenderOptions): Element[] {
    return nodesToTransform.map((node) =>
      h("span.sw-code-popover", [
        h(
          "span.sw-code-popover__trigger",
          {
            tabIndex: 0,
            ariaDescribedBy: this.popoverId,
            dataSwCodePopoverTrigger: this.popoverId,
          },
          [node],
        ),
        h(
          "span.sw-code-popover__panel",
          {
            id: this.popoverId,
            role: "tooltip",
            hidden: true,
            ariaHidden: "true",
            dataSwCodePopoverPanel: "",
          },
          [
            h("span.sw-code-popover__accessible-signature", this.rendered.accessibleSignature),
            h(
              "span.sw-code-popover__signature.sw-code-popover__signature--wide",
              { ariaHidden: "true" },
              this.rendered.wideSignature,
            ),
            h(
              "span.sw-code-popover__signature.sw-code-popover__signature--narrow",
              { ariaHidden: "true" },
              this.rendered.narrowSignature,
            ),
            this.rendered.docs
              ? h("span.sw-code-popover__docs", cleanDocumentation(this.rendered.docs))
              : [],
            this.rendered.tags.length > 0
              ? h(
                  "span.sw-code-popover__tags",
                  this.rendered.tags.map(([name, value]) =>
                    h("span.sw-code-popover__tag", [
                      h("span.sw-code-popover__tag-name", `@${name}`),
                      value ? ` ${cleanDocumentation(value)}` : "",
                    ]),
                  ),
                )
              : [],
          ],
        ),
      ]),
    );
  }
}

export function sheetwriteCodeHovers(options: SheetwriteCodeHoverOptions) {
  const analyzer = new SheetwriteTypeEngine({ cwd: options.cwd, fsMap: options.fsMap });
  let signatureRenderer: ExpressiveCode | undefined;
  let popoverSequence = 0;

  return definePlugin({
    name: "sheetwrite-code-hovers",
    hooks: {
      async preprocessCode({ codeBlock, config }) {
        if (!SUPPORTED_LANGUAGES.has(codeBlock.language)) return;
        if (options.shouldTransform && !options.shouldTransform(codeBlock)) return;

        signatureRenderer ??= new ExpressiveCode(nestedRendererConfig(config));
        const hovers =
          codeBlock.language === "svelte"
            ? mapSvelteHovers(codeBlock.code, analyzer)
            : analyzer.analyze(codeBlock.code, codeBlock.language as "ts" | "tsx" | "vue");

        for (const hover of hovers) {
          const line = codeBlock.getLine(hover.line);
          if (!line) continue;
          const accessibleSignature = resolvedQuickInfo(hover, codeBlock.language);
          if (!accessibleSignature) continue;
          const [wideSignature, narrowSignature] = await Promise.all([
            formatSignature(accessibleSignature, 68),
            formatSignature(accessibleSignature, 34),
          ]);
          const [renderedWideSignature, renderedNarrowSignature] = await Promise.all([
            signatureRenderer.render({
              code: wideSignature,
              language: "ts",
              meta: "",
            }),
            signatureRenderer.render({
              code: narrowSignature,
              language: "ts",
              meta: "",
            }),
          ]);
          const popoverId = `sheetwrite-code-popover-${popoverSequence}`;
          popoverSequence += 1;
          line.addAnnotation(
            new SheetwriteHoverAnnotation(
              hover,
              {
                accessibleSignature,
                wideSignature: codeLineContents(renderedWideSignature.renderedGroupAst),
                narrowSignature: codeLineContents(renderedNarrowSignature.renderedGroupAst),
                docs: hover.docs,
                tags: hover.tags ?? [],
              },
              popoverId,
            ),
          );
        }
      },
    },
  });
}
