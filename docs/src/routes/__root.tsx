import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { type ReactNode, useEffect } from "react";
import { initializeCodeEnhancements } from "../lib/code-popovers.ts";
import { installAnchorReveal } from "../lib/reveal-anchor.ts";
import showcaseStylesheet from "../styles/showcase.css?url";
import siteStylesheet from "../styles/site.css?url";
import tokensStylesheet from "../styles/tokens.css?url";

const THEME_SCRIPT =
  'document.documentElement.dataset.theme=localStorage.getItem("sheetwrite-theme")??(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")';

const SITE_URL = "https://sheetwrite.vercel.app";
const SITE_DESCRIPTION =
  "Build production spreadsheets with a typed TypeScript API, a Rust/WASM data engine, Canvas rendering, and framework adapters.";
const STRUCTURED_DATA = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Sheetwrite",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  codeRepository: "https://github.com/chh-ay/sheetwrite",
  license: "https://opensource.org/license/mit",
});

export const Route = createRootRoute({
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "/";
    const canonicalPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const canonical = new URL(canonicalPath, SITE_URL).href;
    return {
      links: [
        // Explicit head links are render-blocking in dev and production. Plain
        // CSS imports are injected by Vite only after hydration in dev, which
        // exposed a half-styled SSR frame on full-page route navigation.
        { rel: "stylesheet", href: tokensStylesheet },
        { rel: "stylesheet", href: siteStylesheet },
        { rel: "stylesheet", href: showcaseStylesheet },
        { rel: "canonical", href: canonical },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "robots", content: "index, follow" },
        { name: "theme-color", content: "#080b12" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Sheetwrite" },
        { property: "og:title", content: "Sheetwrite — the spreadsheet engine for the web" },
        { property: "og:description", content: SITE_DESCRIPTION },
        { property: "og:url", content: canonical },
        { property: "og:image", content: `${SITE_URL}/og-sheetwrite.webp` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Sheetwrite — the spreadsheet engine for the web" },
        { name: "twitter:description", content: SITE_DESCRIPTION },
        { name: "twitter:image", content: `${SITE_URL}/og-sheetwrite.webp` },
        { title: "Sheetwrite" },
      ],
      scripts: [{ type: "application/ld+json", children: STRUCTURED_DATA }],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    const cleanup = initializeCodeEnhancements();
    const uninstallReveal = installAnchorReveal();
    // Deterministic signal for interaction tests: listeners are attached.
    document.documentElement.dataset.hydrated = "true";
    return () => {
      cleanup();
      uninstallReveal();
    };
  }, []);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script>{THEME_SCRIPT}</script>
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}
