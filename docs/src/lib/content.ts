import { type ComponentType, type LazyExoticComponent, lazy } from "react";

export interface DocumentFrontmatter {
  title: string;
  description: string;
}

export interface DocumentModule {
  default: ComponentType;
  frontmatter?: DocumentFrontmatter;
}

interface DocumentSource {
  component: LazyExoticComponent<ComponentType>;
  fallbackTitle: string;
  href: string;
  load: () => Promise<DocumentModule>;
}

export interface DocumentRecord extends DocumentFrontmatter {
  component: LazyExoticComponent<ComponentType>;
  href: string;
}

const sourceModules = import.meta.glob<DocumentModule>("../content/docs/**/*.{md,mdx}");

function hrefFromSource(source: string): string {
  const relative = source
    .replace(/^\.\.\/content\/docs\//, "")
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/\/index$/, "");
  return `/docs/${relative}/`.replace(/\/+/g, "/");
}

const DOCUMENT_SOURCES: ReadonlyMap<string, DocumentSource> = new Map(
  Object.entries(sourceModules).map(([source, load]) => {
    const href = hrefFromSource(source);
    const fallbackTitle =
      href.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Sheetwrite";
    return [href, { component: lazy(load), fallbackTitle, href, load }];
  }),
);

export function normalizeDocumentHref(splat: string | undefined): string {
  const path = splat?.replace(/^\/+|\/+$/g, "") ?? "";
  return `/docs/${path}${path.length === 0 ? "" : "/"}`;
}

export async function documentForSplat(
  splat: string | undefined,
): Promise<DocumentRecord | undefined> {
  const source = DOCUMENT_SOURCES.get(normalizeDocumentHref(splat));
  if (source === undefined) return undefined;
  const module = await source.load();
  return {
    component: source.component,
    title: module.frontmatter?.title ?? source.fallbackTitle,
    description: module.frontmatter?.description ?? "Sheetwrite documentation.",
    href: source.href,
  };
}

export function documentComponentForSplat(
  splat: string | undefined,
): LazyExoticComponent<ComponentType> | undefined {
  return DOCUMENT_SOURCES.get(normalizeDocumentHref(splat))?.component;
}
