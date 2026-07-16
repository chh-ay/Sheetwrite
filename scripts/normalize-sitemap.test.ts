import { describe, expect, it } from "bun:test";
import { normalizeSitemap } from "./normalize-sitemap.ts";

const wrap = (urls: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((loc) => `<url><loc>${loc}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

describe("sitemap normalization contract", () => {
  it("keeps one canonical trailing-slash URL per page and drops fragments and noindex routes", () => {
    const { xml, kept, dropped } = normalizeSitemap(
      wrap([
        "https://sheetwrite.vercel.app/",
        "https://sheetwrite.vercel.app/react",
        "https://sheetwrite.vercel.app/react/",
        "https://sheetwrite.vercel.app/docs/api/core/grid/#grid-set-zoom",
        "https://sheetwrite.vercel.app/test/xlsx",
        "https://sheetwrite.vercel.app/docs/proof/",
        "https://sheetwrite.vercel.app/docs/start/installation/",
      ]),
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://sheetwrite.vercel.app/",
      "https://sheetwrite.vercel.app/react/",
      "https://sheetwrite.vercel.app/docs/start/installation/",
    ]);
    expect(kept).toBe(3);
    expect(dropped).toBe(4);
  });

  it("refuses to emit an empty sitemap", () => {
    const { kept } = normalizeSitemap(wrap(["https://sheetwrite.vercel.app/test/xlsx"]));
    expect(kept).toBe(0);
  });
});
