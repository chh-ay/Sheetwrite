import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SITE_URL = "https://sheetwrite.vercel.app";
const SITE_HOST = new URL(SITE_URL).host;
const MAX_URLS = 10_000;

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY = "5e579cf90bb062665893b22ad5114110";

interface IndexNowPayload {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: readonly string[];
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function urlsFromSitemap(xml: string): readonly string[] {
  const urls = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const value = match[1];
    if (value === undefined) continue;
    const url = new URL(decodeXmlText(value));
    if (url.origin !== SITE_URL) {
      throw new Error(`Sitemap URL is outside ${SITE_URL}: ${url.href}`);
    }
    urls.add(url.href);
  }
  if (urls.size === 0) throw new Error("Generated sitemap contains no URLs");
  if (urls.size > MAX_URLS) {
    throw new Error(`Generated sitemap exceeds the IndexNow ${MAX_URLS}-URL request limit`);
  }
  return [...urls];
}

export function indexNowPayload(urlList: readonly string[]): IndexNowPayload {
  return {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList,
  };
}

export async function submitIndexNow(
  urls: readonly string[],
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowPayload(urls)),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(
      `IndexNow rejected ${urls.length} URLs with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  return urls.length;
}

async function submitProductionSitemap(): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("IndexNow submission skipped outside a Vercel production build");
    return;
  }
  const sitemap = await readFile(
    resolve(import.meta.dir, "../docs/dist/client/sitemap.xml"),
    "utf8",
  );
  const urls = urlsFromSitemap(sitemap);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const submitted = await submitIndexNow(urls);
      console.log(`IndexNow accepted ${submitted} canonical URLs`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await Bun.sleep(attempt * 1_000);
    }
  }
  console.warn(
    `IndexNow submission did not complete after three attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

if (import.meta.main) {
  await submitProductionSitemap();
}
