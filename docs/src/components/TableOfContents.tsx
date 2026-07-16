import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  label: string;
  depth: number;
}

/**
 * Right-rail outline of the rendered document: h2/h3 headings (ids come from
 * rehype-slug in the prerendered HTML) plus generated API member rows. Built
 * from the DOM after hydration so one component serves markdown guides and
 * generator-emitted API markup alike.
 */
export function TableOfContents() {
  const [items, setItems] = useState<readonly TocItem[]>([]);
  const [active, setActive] = useState("");
  // Client-side navigations swap the article without remounting the shell.
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    setActive("");
    // Scope to the prose article: the ToC itself lives inside <main>, and
    // observing our own renders would loop scan -> setItems -> scan.
    const article = document.querySelector<HTMLElement>("#main-content article.sw-prose");
    if (article === null) return;
    let intersection: IntersectionObserver | undefined;
    // Seeding with the route key also makes the rescan trigger explicit.
    let signature = `route:${pathname}`;

    const scan = (): void => {
      const collected: TocItem[] = [];
      for (const node of article.querySelectorAll<HTMLElement>(
        "h2[id], h3[id], details.api-member[id]",
      )) {
        const isMember = node.tagName === "DETAILS";
        // Member rows: only the name code, never the trailing doc summary.
        // Headings: own text minus decorations like the .api-count chip.
        const label = (
          isMember
            ? node.querySelector(":scope > summary > code")?.textContent
            : Array.from(node.childNodes)
                .filter(
                  (child) => !(child instanceof Element && child.classList.contains("api-count")),
                )
                .map((child) => child.textContent)
                .join("")
        )?.trim();
        if (!label) continue;
        // Overload rows repeat the member name; one rail entry is enough.
        const previous = collected.at(-1);
        if (previous !== undefined && previous.label === label && previous.depth === 1) continue;
        collected.push({
          id: node.id,
          label,
          depth: isMember || node.tagName === "H3" ? 1 : 0,
        });
      }
      const next = collected.map((item) => `${item.depth}:${item.id}`).join("|");
      if (next === signature) return;
      signature = next;
      setItems(collected.length >= 2 ? collected : []);
      intersection?.disconnect();
      intersection = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(entry.target.id);
          }
        },
        { rootMargin: "-80px 0px -66%" },
      );
      for (const item of collected) {
        const target = document.getElementById(item.id);
        if (target !== null) intersection.observe(target);
      }
    };

    scan();
    // Suspense resolves the article after this effect on client navigations;
    // rescan when its children actually arrive (attribute churn is ignored).
    const mutations = new MutationObserver(scan);
    mutations.observe(article, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      intersection?.disconnect();
    };
  }, [pathname]);

  if (items.length === 0) return null;
  return (
    <nav aria-label="On this page" className="sw-toc">
      <span className="sw-toc__label">On this page</span>
      <ul>
        {items.map((item) => (
          <li data-depth={item.depth} key={item.id}>
            <a aria-current={active === item.id ? "location" : undefined} href={`#${item.id}`}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
