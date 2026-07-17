import { SHOWCASE_NAVIGATION } from "../lib/navigation.js";
import "../styles/showcase.css";
import { ThemeToggle } from "./ThemeToggle.js";

interface SiteTopbarProps {
  /** Highlighted showcase entry, when rendered on a showcase route. */
  active?: "vanilla" | "react" | "vue" | "svelte";
  /** Extra in-page anchor for the landing's benchmark section. */
  benchmarksHref?: string;
}

/**
 * The one product topbar: brand, Docs, showcase routes, GitHub, theme.
 * Shared by the landing and every showcase so the site has a single chrome.
 */
export function SiteTopbar({ active, benchmarksHref }: Readonly<SiteTopbarProps>) {
  return (
    <header className="sw-showcase-nav sw-product-nav">
      <a aria-label="Sheetwrite home" className="sw-showcase-brand" href="/">
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <rect height="26" rx="5" width="26" x="3" y="3" />
          <path d="M3 11h26M11 3v26M20 11v18M11 20h18" />
        </svg>
        <span>Sheetwrite</span>
      </a>
      <nav aria-label="Site">
        <a href="/docs/">Docs</a>
        {SHOWCASE_NAVIGATION.map((item) => {
          const id = item.href.replaceAll("/", "");
          return (
            <a aria-current={id === active ? "page" : undefined} href={item.href} key={item.href}>
              {item.label}
            </a>
          );
        })}
        {benchmarksHref ? <a href={benchmarksHref}>Benchmarks</a> : null}
      </nav>
      <div className="sw-showcase-nav__actions">
        <a href="https://github.com/chh-ay/Sheetwrite">GitHub</a>
        <ThemeToggle />
      </div>
    </header>
  );
}
