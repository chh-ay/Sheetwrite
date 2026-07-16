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
import {
  injectHoverPrelude,
  type PreludeInjection,
  resolveHoverPrelude,
} from "./hover-preludes.js";
import { SheetwriteTypeEngine, type SheetwriteTypeHover } from "./sheetwrite-type-engine.js";

const SUPPORTED_LANGUAGES = new Set(["ts", "tsx", "vue", "svelte"]);
const LOW_QUALITY_HOVER = /\bany\b|\/\*unresolved\*\//;
const LEADING_KIND = /^\(([\w-]+)\)\s+/gm;
const IMPORT_SUFFIX = /\nimport .*$/s;
const TYPE_MEMBER = /^[A-Z]\w*(<[^>]*>)?:/;
const FUNCTION_MEMBER = /^\w+\(/;
const MEMBER_PATH = /^([A-Z][\w$]*(?:<[^>]*>)?)\.([\w$]+)(\??): ([\s\S]+)$/;

export interface SheetwriteCodeHoverOptions {
  cwd: string;
  fsMap?: Map<string, string>;
  shouldTransform?: (codeBlock: ExpressiveCodeBlock) => boolean;
}

interface ApiManifestShape {
  packages: readonly {
    name: string;
    entryPoints: readonly {
      subpath: string;
      classification: string;
      exports?: readonly {
        name: string;
        memberDocs?: readonly { name: string; documentation: string }[];
      }[];
    }[];
  }[];
}

interface MemberReference {
  docs: string;
  route: string;
}

function referenceAnchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Symbol name -> generated reference route, so every hover on a public API
 * symbol can link straight to its documentation page. Root entry points win
 * name collisions; `@sheetwrite/core` wins across packages.
 */
export function apiReferenceRoutes(manifest: ApiManifestShape): ReadonlyMap<string, string> {
  const routes = new Map<string, string>();
  const packages = [...manifest.packages].sort((a, b) =>
    a.name === "@sheetwrite/core" ? -1 : b.name === "@sheetwrite/core" ? 1 : 0,
  );
  for (const pkg of packages) {
    const packageSlug = pkg.name.replace("@sheetwrite/", "");
    const entryPoints = [...pkg.entryPoints].sort((a, b) =>
      a.subpath === "." ? -1 : b.subpath === "." ? 1 : 0,
    );
    for (const entry of entryPoints) {
      if (entry.classification !== "supported") continue;
      const slug =
        entry.subpath === "."
          ? packageSlug
          : `${packageSlug}-${entry.subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
      for (const item of entry.exports ?? []) {
        if (!routes.has(item.name)) {
          routes.set(item.name, `/docs/api/${slug}/${referenceAnchor(item.name)}/`);
        }
      }
    }
  }
  return routes;
}

/**
 * Member name -> owning documentation. Framework template hovers (`@ready`,
 * `onGridChange={…}`) resolve to synthetic bindings without JSDoc; the member
 * docs from the API manifest restore the depth and a deep link.
 */
export function apiMemberReferences(
  manifest: ApiManifestShape,
): ReadonlyMap<string, MemberReference> {
  const members = new Map<string, MemberReference>();
  const packages = [...manifest.packages].sort((a, b) =>
    a.name === "@sheetwrite/core" ? -1 : b.name === "@sheetwrite/core" ? 1 : 0,
  );
  for (const pkg of packages) {
    const packageSlug = pkg.name.replace("@sheetwrite/", "");
    for (const entry of pkg.entryPoints) {
      if (entry.classification !== "supported") continue;
      const slug =
        entry.subpath === "."
          ? packageSlug
          : `${packageSlug}-${entry.subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
      for (const item of entry.exports ?? []) {
        for (const member of item.memberDocs ?? []) {
          if (!member.documentation || members.has(member.name)) continue;
          members.set(member.name, {
            docs: member.documentation,
            route: `/docs/api/${slug}/${referenceAnchor(item.name)}/#${referenceAnchor(item.name)}-${referenceAnchor(member.name)}`,
          });
        }
      }
    }
  }
  return members;
}

/** `grid-change` template events document as the adapter's `onGridChange` member. */
function memberLookupNames(target: string): string[] {
  const names = [target];
  if (/^[a-z][\w-]*$/.test(target)) {
    const camel = target
      .split("-")
      .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    names.push(`on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`);
  }
  return names;
}

function memberDocsFor(
  target: string,
  signature: string,
  members: ReadonlyMap<string, MemberReference>,
): MemberReference | undefined {
  // The displayed binding (`let onReady: …`) names the semantic member; the
  // raw hover target (`ready`, `grid-change`) is only a fallback spelling.
  const declared = /^(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)/.exec(signature)?.[1];
  const candidates = declared
    ? [declared, ...memberLookupNames(target)]
    : memberLookupNames(target);
  for (const name of candidates) {
    const member = members.get(name);
    if (member) return member;
  }
  return undefined;
}

interface RenderedHover {
  accessibleSignature: string;
  wideSignature: ElementContent[];
  narrowSignature: ElementContent[];
  docs?: string;
  tags: readonly [name: string, text: string | undefined][];
  referenceRoute?: string;
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

/** Rewrites checker member paths into parseable TS so signatures render with syntax colors. */
function renderableSignature(signature: string): string {
  const member = signature.match(MEMBER_PATH);
  if (member) return `interface ${member[1]} { ${member[2]}${member[3]}: ${member[4]} }`;
  if (/^[a-z_$][\w$]*: /.test(signature)) return `let ${signature}`;
  return signature;
}

async function formatSignature(rawSignature: string, printWidth: number): Promise<string> {
  if (!rawSignature) return rawSignature;
  const signature = renderableSignature(rawSignature);

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
  return (
    value
      // Unwrap fenced examples before inline-code cleanup so no stray fences survive.
      .replace(/```[\w-]*\s*([\s\S]*?)```/g, "$1")
      .replace(/\{@link\s+([^}|\s]+)(?:\s*\|\s*([^}]+))?\}/g, (_, target: string, label?: string) =>
        (label ?? target).trim(),
      )
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
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
export function isHighQualityHover(hover: SheetwriteTypeHover, language = "ts"): boolean {
  return hover.origin === "lib" || !LOW_QUALITY_HOVER.test(resolvedQuickInfo(hover, language));
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

function svelteSourceHovers(source: string, analyzer: SheetwriteTypeEngine): SheetwriteTypeHover[] {
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
  return hovers;
}

function mapSvelteHovers(source: string, analyzer: SheetwriteTypeEngine): SheetwriteTypeHover[] {
  return analyzer.resolveFrameworkTypes(svelteSourceHovers(source, analyzer), source);
}

function remapThroughInjection(
  hovers: readonly SheetwriteTypeHover[],
  injection: PreludeInjection,
  originalSource: string,
): SheetwriteTypeHover[] {
  const lines = originalSource.split("\n");
  const remapped: SheetwriteTypeHover[] = [];
  for (const hover of hovers) {
    const position = injection.toOriginal({ line: hover.line, character: hover.character });
    if (position === null) continue;
    const line = lines[position.line];
    if (
      !line ||
      line.slice(position.character, position.character + hover.target.length) !== hover.target
    ) {
      continue;
    }
    remapped.push({
      ...hover,
      line: position.line,
      character: position.character,
      start: position.start,
    });
  }
  return remapped;
}

export function collectFenceHovers(
  code: string,
  language: "ts" | "tsx" | "vue" | "svelte",
  analyzer: SheetwriteTypeEngine,
  preludeName?: string,
): SheetwriteTypeHover[] {
  if (preludeName === undefined) {
    return language === "svelte"
      ? mapSvelteHovers(code, analyzer)
      : analyzer.analyze(code, language);
  }
  const injection = injectHoverPrelude(code, language, resolveHoverPrelude(preludeName));
  if (language === "svelte") {
    const mapped = remapThroughInjection(
      svelteSourceHovers(injection.analysisSource, analyzer),
      injection,
      code,
    );
    return analyzer.resolveFrameworkTypes(mapped, code);
  }
  return remapThroughInjection(
    analyzer.analyze(injection.analysisSource, language),
    injection,
    code,
  );
}

function hashIdentifier(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function hoverPopoverId(
  codeBlock: Pick<ExpressiveCodeBlock, "code" | "language" | "meta" | "parentDocument">,
  hover: Pick<SheetwriteTypeHover, "character" | "length" | "line" | "target">,
  hoverIndex: number,
): string {
  const groupIndex = codeBlock.parentDocument?.positionInDocument?.groupIndex;
  const blockIdentity =
    groupIndex === undefined
      ? hashIdentifier(`${codeBlock.language}\0${codeBlock.meta}\0${codeBlock.code}`)
      : String(groupIndex);
  return `sheetwrite-code-popover-${blockIdentity}-${hoverIndex}-${hover.line}-${hover.character}-${hover.length}-${hashIdentifier(hover.target)}`;
}

/** Render a cleaned tag value with bare URLs as real links, like the reference footer. */
function tagValueContents(value: string): ElementContent[] {
  const cleaned = cleanDocumentation(value);
  const contents: ElementContent[] = [];
  const urlPattern = /https?:\/\/[^\s"'<>)]+/g;
  let cursor = 0;
  for (const match of cleaned.matchAll(urlPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) contents.push({ type: "text", value: cleaned.slice(cursor, start) });
    contents.push(
      h(
        "a.sw-code-popover__tag-link",
        { href: match[0], rel: "noreferrer", target: "_blank" },
        match[0].replace(/^https?:\/\//, "").replace(/\/$/, ""),
      ),
    );
    cursor = start + match[0].length;
  }
  if (cursor < cleaned.length) contents.push({ type: "text", value: cleaned.slice(cursor) });
  return contents;
}

class SheetwriteHoverAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "sheetwrite-code-hover";

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
    const kind = this.rendered.docs
      ? "documented"
      : this.rendered.referenceRoute
        ? "reference"
        : "type";
    return nodesToTransform.map((node) =>
      h("span.sw-code-popover", [
        h(
          "span.sw-code-popover__trigger",
          {
            tabIndex: 0,
            ariaDescribedBy: this.popoverId,
            dataSwCodePopoverTrigger: this.popoverId,
            dataHoverKind: kind,
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
                      ...(value ? [{ type: "text", value: " " } as ElementContent] : []),
                      ...(value ? tagValueContents(value) : []),
                    ]),
                  ),
                )
              : [],
            this.rendered.referenceRoute
              ? h(
                  "a.sw-code-popover__link",
                  { href: this.rendered.referenceRoute },
                  "API reference →",
                )
              : [],
          ],
        ),
      ]),
    );
  }
}

export interface ReferenceLink {
  line: number;
  columnStart: number;
  columnEnd: number;
  route: string;
}

const DECLARED_NAME =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|enum|function|const|let|var|type)\s+([A-Za-z_$][\w$]*)/;

/**
 * Deterministic identifier -> API-route links for generated declaration
 * fences. Generated signatures carry no imports, so the type engine cannot
 * resolve their identifiers; the manifest name map can. The declared symbol
 * itself is skipped (a page linking to itself is noise), as are member
 * accesses and string-opening positions.
 */
export function collectReferenceLinks(
  code: string,
  routes: ReadonlyMap<string, string>,
): ReferenceLink[] {
  if (routes.size === 0) return [];
  const declared = code.match(DECLARED_NAME)?.[1];
  const links: ReferenceLink[] = [];
  for (const [lineIndex, text] of code.split("\n").entries()) {
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = match[0];
      if (name === declared) continue;
      const route = routes.get(name);
      if (route === undefined) continue;
      const start = match.index;
      const before = start > 0 ? text[start - 1] : "";
      if (before === "." || before === '"' || before === "'") continue;
      links.push({ line: lineIndex, columnStart: start, columnEnd: start + name.length, route });
    }
  }
  return links;
}

class SheetwriteReferenceLinkAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "sheetwrite-code-ref";

  constructor(
    private readonly route: string,
    columnStart: number,
    columnEnd: number,
  ) {
    super({ inlineRange: { columnStart, columnEnd } });
  }

  override render({ nodesToTransform }: AnnotationRenderOptions): Element[] {
    return nodesToTransform.map((node) => h("a.sw-code-ref", { href: this.route }, [node]));
  }
}

export function sheetwriteCodeHovers(options: SheetwriteCodeHoverOptions) {
  const analyzer = new SheetwriteTypeEngine({ cwd: options.cwd, fsMap: options.fsMap });
  let signatureRenderer: ExpressiveCode | undefined;
  let referenceRoutes: ReadonlyMap<string, string> | undefined;
  let memberReferences: ReadonlyMap<string, MemberReference> | undefined;

  const resolveManifest = async (): Promise<void> => {
    if (referenceRoutes && memberReferences) return;
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const manifestPath = join(options.cwd, "src/generated/public-api.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ApiManifestShape;
      referenceRoutes = apiReferenceRoutes(manifest);
      memberReferences = apiMemberReferences(manifest);
    } catch {
      // Docs generation has not run yet; hovers simply render without links.
      referenceRoutes = new Map();
      memberReferences = new Map();
    }
  };

  return definePlugin({
    name: "sheetwrite-code-hovers",
    hooks: {
      async preprocessCode({ codeBlock, config }) {
        if (!SUPPORTED_LANGUAGES.has(codeBlock.language)) return;
        // Generated declaration fences get manifest reference links instead of
        // type-engine hovers: their identifiers have no imports to resolve.
        if (/\bgenerated\b/.test(codeBlock.meta)) {
          await resolveManifest();
          for (const link of collectReferenceLinks(
            codeBlock.code,
            referenceRoutes ?? new Map<string, string>(),
          )) {
            codeBlock
              .getLine(link.line)
              ?.addAnnotation(
                new SheetwriteReferenceLinkAnnotation(link.route, link.columnStart, link.columnEnd),
              );
          }
          return;
        }
        if (options.shouldTransform && !options.shouldTransform(codeBlock)) return;

        signatureRenderer ??= new ExpressiveCode(nestedRendererConfig(config));
        const hovers = collectFenceHovers(
          codeBlock.code,
          codeBlock.language as "ts" | "tsx" | "vue" | "svelte",
          analyzer,
          codeBlock.metaOptions.getString("prelude"),
        ).filter((hover) => isHighQualityHover(hover, codeBlock.language));

        await resolveManifest();
        const routes = referenceRoutes ?? new Map<string, string>();
        const members = memberReferences ?? new Map<string, MemberReference>();
        for (const [hoverIndex, hover] of hovers.entries()) {
          const line = codeBlock.getLine(hover.line);
          if (!line) continue;
          const accessibleSignature = resolvedQuickInfo(hover, codeBlock.language);
          if (!accessibleSignature) continue;
          // Import aliases and self-restating declarations waste the reader's hover.
          if (/^import\s/.test(accessibleSignature)) continue;
          const hasDetails = Boolean(hover.docs) || (hover.tags?.length ?? 0) > 0;
          if (!hasDetails) {
            const restated = accessibleSignature.replace(/[;,]\s*$/, "").replace(/\s+/g, " ");
            if (line.text.replace(/\s+/g, " ").includes(restated)) continue;
          }
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
          const popoverId = hoverPopoverId(codeBlock, hover, hoverIndex);
          line.addAnnotation(
            new SheetwriteHoverAnnotation(
              hover,
              {
                accessibleSignature,
                wideSignature: codeLineContents(renderedWideSignature.renderedGroupAst),
                narrowSignature: codeLineContents(renderedNarrowSignature.renderedGroupAst),
                docs: hover.docs ?? memberDocsFor(hover.target, accessibleSignature, members)?.docs,
                tags: hover.tags ?? [],
                referenceRoute:
                  routes.get(hover.target) ??
                  memberDocsFor(hover.target, accessibleSignature, members)?.route,
              },
              popoverId,
            ),
          );
        }
      },
    },
  });
}
