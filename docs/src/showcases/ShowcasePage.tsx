import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { InstallCommand } from "../components/InstallCommand.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { SHOWCASE_NAVIGATION } from "../lib/navigation.js";

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
      <SiteTopbar active={active} />

      <main className="sw-showcase-page" data-framework={active}>
        <header className="sw-showcase-page__hero">
          <div className="sw-showcase-page__hero-copy">
            <p className="sw-showcase-page__eyebrow">{eyebrow}</p>
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
              <span>First-party package</span>
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
            <span>Real adapter · interactive state</span>
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
            <a href={`https://github.com/chh-ay/sheetwrite/blob/develop/${sourcePath}`}>
              View source
            </a>
            <Link to={nextItem.href}>Next: {nextItem.label} →</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
