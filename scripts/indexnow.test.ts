import { describe, expect, it } from "bun:test";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  indexNowPayload,
  submitIndexNow,
  urlsFromSitemap,
} from "./indexnow.js";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sheetwrite.vercel.app/</loc></url>
  <url><loc>https://sheetwrite.vercel.app/docs/start/installation/</loc></url>
  <url><loc>https://sheetwrite.vercel.app/docs/start/installation/</loc></url>
</urlset>`;

describe("IndexNow discovery submission", () => {
  it("extracts unique canonical production URLs from the generated sitemap", () => {
    expect(urlsFromSitemap(sitemap)).toEqual([
      "https://sheetwrite.vercel.app/",
      "https://sheetwrite.vercel.app/docs/start/installation/",
    ]);
    expect(() =>
      urlsFromSitemap(
        sitemap.replace(
          "https://sheetwrite.vercel.app/docs/start/installation/",
          "https://attacker.example/docs/",
        ),
      ),
    ).toThrow("outside https://sheetwrite.vercel.app");
  });

  it("builds the public protocol payload from the same hosted key", () => {
    expect(INDEXNOW_ENDPOINT).toBe("https://api.indexnow.org/indexnow");
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
    expect(indexNowPayload(urlsFromSitemap(sitemap))).toEqual({
      host: "sheetwrite.vercel.app",
      key: INDEXNOW_KEY,
      keyLocation: `https://sheetwrite.vercel.app/${INDEXNOW_KEY}.txt`,
      urlList: [
        "https://sheetwrite.vercel.app/",
        "https://sheetwrite.vercel.app/docs/start/installation/",
      ],
    });
  });

  it("accepts only successful IndexNow protocol responses", async () => {
    let requestBody: unknown;
    const accepted = await submitIndexNow(urlsFromSitemap(sitemap), async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    });
    expect(accepted).toBe(2);
    expect(requestBody).toEqual(indexNowPayload(urlsFromSitemap(sitemap)));

    await expect(
      submitIndexNow(
        urlsFromSitemap(sitemap),
        async () => new Response("invalid", { status: 422 }),
      ),
    ).rejects.toThrow("IndexNow rejected 2 URLs with HTTP 422");
  });
});
