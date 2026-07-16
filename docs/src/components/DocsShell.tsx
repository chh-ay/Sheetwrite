import type { ReactNode } from "react";
import { DOCS_NAVIGATION, SHOWCASE_NAVIGATION } from "../lib/navigation.js";
import { DocsSearch } from "./DocsSearch.js";
import { TableOfContents } from "./TableOfContents.js";
import { ThemeToggle } from "./ThemeToggle.js";

interface DocsShellProps {
  activeHref?: string;
  children: ReactNode;
  description: string;
  title: string;
}

function Brand() {
  return (
    <a aria-label="Sheetwrite home" className="sw-brand" href="/">
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <rect height="26" rx="5" width="26" x="3" y="3" />
        <path d="M3 11h26M11 3v26M20 11v18M11 20h18" />
      </svg>
      <span>Sheetwrite</span>
    </a>
  );
}

function Sidebar({ activeHref }: Readonly<{ activeHref?: string }>) {
  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav">
      {DOCS_NAVIGATION.map((section) => (
        <section key={section.label}>
          <h2>{section.label}</h2>
          {section.items.map((item) => (
            <a
              aria-current={activeHref === item.href ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </section>
      ))}
      <section>
        <h2>Live showcases</h2>
        {SHOWCASE_NAVIGATION.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </section>
    </nav>
  );
}

export function DocsShell({ activeHref, children, description, title }: Readonly<DocsShellProps>) {
  // API page titles arrive as "Symbol | @sheetwrite/pkg"; the package reads
  // better as a chip than as part of a display-size heading.
  const [titleMain, titlePackage] = title.split(" | ", 2);
  return (
    <div className="sw-docs">
      <a className="sw-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="sw-docs-header">
        <Brand />
        <DocsSearch />
        <nav aria-label="Product links" className="sw-docs-header__links">
          <a href="https://github.com/chh-ay/Sheetwrite">GitHub</a>
          <ThemeToggle />
        </nav>
      </header>
      <aside className="sw-sidebar">
        <div className="sw-sidebar__intro">
          <span>Documentation</span>
          <p>Build and own a production spreadsheet runtime.</p>
        </div>
        <Sidebar activeHref={activeHref} />
      </aside>
      <main className="sw-document" data-pagefind-body id="main-content">
        <header className="sw-document__header">
          <p>Sheetwrite / Documentation</p>
          <h1>
            {titleMain}
            {titlePackage ? <code className="sw-title-package">{titlePackage}</code> : null}
          </h1>
          <span>{description}</span>
        </header>
        <article className="sw-prose">{children}</article>
        <TableOfContents />
        <footer className="sw-document__footer">
          <span>Sheetwrite is MIT licensed.</span>
          <a href="https://github.com/chh-ay/Sheetwrite/issues">Report a documentation issue</a>
        </footer>
      </main>
    </div>
  );
}
