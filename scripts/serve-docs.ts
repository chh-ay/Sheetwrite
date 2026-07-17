import { resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const outputRoot = resolve(repositoryRoot, "docs/dist/client");
const base = "";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const LOCAL_VERCEL_SCRIPTS = new Set([
  "/_vercel/insights/script.js",
  "/_vercel/speed-insights/script.js",
]);

function outputPath(pathname: string): string | null {
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const relative = pathname.slice(base.length).replace(/^\/+/, "");
  const candidate = resolve(outputRoot, relative.endsWith("/") ? relative : relative || ".");
  if (candidate !== outputRoot && !candidate.startsWith(`${outputRoot}${sep}`)) return null;
  return relative === "" || relative.endsWith("/") ? resolve(candidate, "index.html") : candidate;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (LOCAL_VERCEL_SCRIPTS.has(pathname)) {
      return new Response("", {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      });
    }
    const candidate = outputPath(pathname);
    if (candidate !== null) {
      const file = Bun.file(candidate);
      if (await file.exists()) return new Response(file);
      const index = Bun.file(resolve(candidate, "index.html"));
      if (await index.exists()) return new Response(index);
    }
    const notFound = Bun.file(resolve(outputRoot, "404.html"));
    return new Response(await notFound.arrayBuffer(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Sheetwrite docs available at ${server.url}${base}/`);
