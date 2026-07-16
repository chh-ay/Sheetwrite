import type { ReactNode } from "react";
import { useState } from "react";
import { SHOWCASE_NAVIGATION } from "../lib/navigation.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import "../styles/showcase.css";

export interface ShowcaseProof {
  detail: string;
  title: string;
}

interface ShowcasePageProps {
  active: "vanilla" | "react" | "vue" | "svelte";
  children: ReactNode;
  description: string;
  eyebrow: string;
  guide: string;
  packageName: string;
  proof: readonly ShowcaseProof[];
  prompt: string;
  sourcePath: string;
  title: string;
}

function InstallCommand({ packageName }: Readonly<{ packageName: string }>) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const command = `npm install ${packageName}`;
  const feedback = state === "copied" ? "Copied" : state === "error" ? "Try again" : "Copy";

  return (
    <button
      aria-label={`Copy install command: ${command}`}
      className="sw-install-command"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setState("copied");
          window.setTimeout(() => setState("idle"), 1600);
        } catch {
          setState("error");
          window.setTimeout(() => setState("idle"), 2400);
        }
      }}
      type="button"
    >
      <span aria-hidden="true">$</span>
      <code>{command}</code>
      <strong aria-live="polite">{feedback}</strong>
    </button>
  );
}

export function ShowcasePage({
  active,
  children,
  description,
  eyebrow,
  guide,
  packageName,
  proof,
  prompt,
  sourcePath,
  title,
}: Readonly<ShowcasePageProps>) {
  const activeIndex = SHOWCASE_NAVIGATION.findIndex(
    (item) => item.href.replaceAll("/", "") === active,
  );
  const activeItem = SHOWCASE_NAVIGATION[activeIndex] ?? SHOWCASE_NAVIGATION[0]!;
  const nextItem = SHOWCASE_NAVIGATION[(activeIndex + 1) % SHOWCASE_NAVIGATION.length]!;
  const adapterLabel = active === "vanilla" ? "Core API" : `${activeItem.label} binding`;

  return (
    <div className="sw-showcase-frame">
      <header className="sw-showcase-nav sw-product-nav">
        <a aria-label="Sheetwrite home" className="sw-showcase-brand" href="/">
          <svg aria-hidden="true" viewBox="0 0 32 32">
            <rect height="26" rx="5" width="26" x="3" y="3" />
            <path d="M3 11h26M11 3v26M20 11v18M11 20h18" />
          </svg>
          <span>Sheetwrite</span>
        </a>
        <nav aria-label="Framework examples">
          <a href="/docs/start/installation/">Docs</a>
          {SHOWCASE_NAVIGATION.map((item) => {
            const id = item.href.replaceAll("/", "");
            return (
              <a aria-current={id === active ? "page" : undefined} href={item.href} key={item.href}>
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="sw-showcase-nav__actions">
          <a href="https://github.com/chh-ay/Sheetwrite">GitHub</a>
          <ThemeToggle />
        </div>
      </header>

      <main className="sw-showcase-page" data-framework={active}>
        <header className="sw-showcase-page__hero">
          <div className="sw-showcase-page__hero-copy">
            <p className="sw-showcase-page__eyebrow">
              <span aria-hidden="true">LIVE</span>
              {eyebrow}
            </p>
            <h1>{title}</h1>
            <p>{description}</p>
            <dl className="sw-showcase-page__specs">
              <div>
                <dt>Adapter</dt>
                <dd>{adapterLabel}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>Rust / WASM</dd>
              </div>
              <div>
                <dt>Surface</dt>
                <dd>Canvas</dd>
              </div>
            </dl>
          </div>
          <aside className="sw-showcase-page__install" aria-label={`${activeItem.label} setup`}>
            <div>
              <span>Published package</span>
              <strong>Start with the real adapter.</strong>
            </div>
            <InstallCommand packageName={packageName} />
            <a href={guide}>Open the integration guide →</a>
          </aside>
        </header>

        <section aria-label={`${title} live example`} className="sw-showcase-page__stage">
          <header className="sw-showcase-stage__bar">
            <div>
              <strong>Live workbook</strong>
              <span>/ {activeItem.label}</span>
            </div>
            <span>Published package · interactive state</span>
          </header>
          <div className="sw-showcase-stage__viewport">{children}</div>
          <footer className="sw-showcase-stage__prompt">
            <strong>Try it</strong>
            <span>{prompt}</span>
            <span>Keyboard ready · Canvas rendered</span>
          </footer>
        </section>

        <section aria-labelledby={`${active}-runtime-details`} className="sw-showcase-page__proof">
          <header>
            <p className="sw-showcase-page__eyebrow">PUBLISHED RUNTIME</p>
            <h2 id={`${active}-runtime-details`}>See the contract working.</h2>
            <p>
              No mock controls or copied state. Every interaction above crosses the public adapter
              and Grid APIs.
            </p>
          </header>
          <ol>
            {proof.map((item, index) => (
              <li key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="sw-showcase-page__footer">
          <div>
            <span>CONTINUE BUILDING</span>
            <strong>Take the integration apart.</strong>
            <p>Lifecycle, SSR, reset, and event contracts are documented for this adapter.</p>
          </div>
          <nav aria-label="Example resources">
            <a href={guide}>Read the guide</a>
            <a href={`https://github.com/chh-ay/Sheetwrite/blob/develop/${sourcePath}`}>
              View source
            </a>
            <a href={nextItem.href}>Next: {nextItem.label} →</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
