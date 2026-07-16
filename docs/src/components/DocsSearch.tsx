import { useEffect, useRef, useState } from "react";

interface PagefindResultData {
  url: string;
  meta: { title?: string };
  excerpt: string;
}

interface PagefindResult {
  data(): Promise<PagefindResultData>;
}

interface PagefindResponse {
  results: PagefindResult[];
}

interface PagefindModule {
  search(query: string): Promise<PagefindResponse>;
}

export function DocsSearch() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PagefindResultData[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      dialog.current?.showModal();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setStatus("");
      return;
    }

    const controller = new AbortController();
    const search = async () => {
      try {
        setStatus("Searching…");
        // Pagefind creates this browser module after Vite finishes, so no static import exists.
        const pagefindPath = "/pagefind/pagefind.js";
        const pagefind = (await import(/* @vite-ignore */ pagefindPath)) as PagefindModule;
        const response = await pagefind.search(query);
        const data = (
          await Promise.all(response.results.slice(0, 8).map((result) => result.data()))
        ).map((result) => ({
          ...result,
          excerpt: result.excerpt.replaceAll("<mark>", "").replaceAll("</mark>", ""),
        }));
        if (controller.signal.aborted) return;
        setResults(data);
        setStatus(data.length === 0 ? "No matching pages." : "");
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus("Search becomes available after the static index is built.");
        }
      }
    };
    void search();
    return () => controller.abort();
  }, [query]);

  return (
    <>
      <button
        className="sw-search-button"
        onClick={() => {
          dialog.current?.showModal();
          requestAnimationFrame(() => input.current?.focus());
        }}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 5 5" />
        </svg>
        <span>Search docs</span>
        <kbd>/</kbd>
      </button>
      <dialog className="sw-search-dialog" ref={dialog}>
        <form method="dialog">
          <label>
            <span className="sw-visually-hidden">Search documentation</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 5 5" />
            </svg>
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search APIs, guides, and examples"
              ref={input}
              type="search"
              value={query}
            />
          </label>
          <button aria-label="Close search" type="submit">
            Esc
          </button>
        </form>
        <div aria-live="polite" className="sw-search-results">
          {status.length > 0 ? <p>{status}</p> : null}
          {results.map((result) => (
            <a href={result.url} key={result.url}>
              <strong>{result.meta.title ?? result.url}</strong>
              <span>{result.excerpt}</span>
            </a>
          ))}
        </div>
      </dialog>
    </>
  );
}
