import { Link } from "@tanstack/react-router";
import { SHOWCASE_NAVIGATION } from "../lib/navigation.js";

import { ThemeToggle } from "./ThemeToggle.js";

interface SiteTopbarProps {
  /** Highlighted showcase entry, when rendered on a showcase route. */
  active?: "vanilla" | "react" | "vue" | "svelte";
}

/**
 * The one product topbar: brand, Docs, showcase routes, GitHub, theme.
 * Shared by the landing and every showcase so the site has a single chrome.
 */
export function SiteTopbar({ active }: Readonly<SiteTopbarProps>) {
  return (
    <header className="sw-showcase-nav sw-product-nav">
      <Link aria-label="Sheetwrite home" className="sw-showcase-brand" to="/">
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <rect height="26" rx="5" width="26" x="3" y="3" />
          <path d="M3 11h26M11 3v26M20 11v18M11 20h18" />
        </svg>
        <span>Sheetwrite</span>
      </Link>
      <nav aria-label="Site">
        <Link to="/docs/">Docs</Link>
        {SHOWCASE_NAVIGATION.map((item) => {
          const id = item.href.replaceAll("/", "");
          return (
            <Link aria-current={id === active ? "page" : undefined} key={item.href} to={item.href}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sw-showcase-nav__actions">
        <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
        <ThemeToggle />
      </div>
    </header>
  );
}
