import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles/tokens.css";
import "../styles/site.css";
import "../lib/code-popovers.ts";

const THEME_SCRIPT =
  'document.documentElement.dataset.theme=localStorage.getItem("sheetwrite-theme")??(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content: "Documentation and examples for the Sheetwrite spreadsheet engine.",
      },
      { title: "Sheetwrite" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
        <script>{THEME_SCRIPT}</script>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
