/**
 * Normalizes the crawler-generated sitemap after `vite build`.
 *
 * The TanStack Start crawler records every discovered link verbatim, which
 * leaves three kinds of entries a sitemap must not contain: fragment URLs
 * (`/docs/api/core/grid/#grid-set-zoom`), slash/non-slash duplicates of the
 * same page, and routes that deliberately carry `noindex` (test fixtures and
 * the MDX proof page). Canonical URLs on every page use the trailing-slash
 * form, so the sitemap does too.
 */
import { readFileSync, writeFileSync } from "node:fs";

const NOINDEX_ROUTES = [/^\/test\//, /^\/docs\/proof\/$/];

export function normalizeSitemap(xml: string): { xml: string; kept: number; dropped: number } {
  const entries = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  const seen = new Set<string>();
  const kept: string[] = [];
  let dropped = 0;
  for (const entry of entries) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (loc === undefined) {
      dropped++;
      continue;
    }
    const url = new URL(loc);
    if (url.hash !== "" || loc.includes("#")) {
      dropped++;
      continue;
    }
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    if (NOINDEX_ROUTES.some((route) => route.test(url.pathname))) {
      dropped++;
      continue;
    }
    if (seen.has(url.href)) {
      dropped++;
      continue;
    }
    seen.add(url.href);
    kept.push(entry.replace(/<loc>[^<]+<\/loc>/, `<loc>${url.href}</loc>`));
  }
  const header = xml.slice(0, xml.indexOf("<url>"));
  const footer = "</urlset>\n";
  return { xml: `${header}${kept.join("\n")}\n${footer}`, kept: kept.length, dropped };
}

if (import.meta.main) {
  const path = new URL("../docs/dist/client/sitemap.xml", import.meta.url).pathname;
  const { xml, kept, dropped } = normalizeSitemap(readFileSync(path, "utf8"));
  if (kept === 0) throw new Error("sitemap normalization produced zero URLs");
  writeFileSync(path, xml);
  console.log(`sitemap normalized: ${kept} urls kept, ${dropped} dropped`);
}
