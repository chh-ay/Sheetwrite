import { Link } from "@tanstack/react-router";
import type { CapabilityOwnerId } from "../showcases/capabilities.js";

import { ThemeToggle } from "./ThemeToggle.js";

interface SiteTopbarProps {
  /**
   * Current showcase context: an owner id on a showcase-family route, or
   * "showcases" on the hub itself. The Showcases link is `page`-current on the
   * hub and ancestor-current everywhere in the family.
   */
  active?: CapabilityOwnerId | "showcases";
}

/**
 * The one product topbar: brand, Docs, showcases, GitHub, theme.
 * Shared by the landing and every showcase so the site has a single chrome.
 * Framework deep links and benchmark navigation live in their dedicated surfaces.
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
        <Link
          activeOptions={{ exact: true }}
          aria-current={
            active === "showcases"
              ? "page"
              : active && active !== "performance"
                ? "true"
                : undefined
          }
          to="/showcases/"
        >
          Showcases
        </Link>
      </nav>
      <div className="sw-showcase-nav__actions">
        <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
        <ThemeToggle />
      </div>
    </header>
  );
}
