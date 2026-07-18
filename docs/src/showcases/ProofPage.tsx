import type { ReactNode } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";

export interface ProofFact {
  label: string;
  value: string;
}

export interface ProofPoint {
  title: string;
  detail: string;
}

/** One responsibility split row: what this proof owns vs. what the host owns. */
export interface BoundaryRow {
  concern: string;
  owner: "sheetwrite" | "host";
  detail: string;
}

interface ProofPageProps {
  boundary: readonly BoundaryRow[];
  boundaryLede: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  facts: readonly ProofFact[];
  guideHref: string;
  guideLabel: string;
  proof: readonly ProofPoint[];
  prompt: string;
  slug: "database" | "collaboration";
  sourcePath: string;
  title: string;
}

/**
 * Shared shell for the capability proof routes (database, collaboration).
 * Framework showcases keep their own `ShowcasePage`; these pages prove one
 * protocol capability instead of one adapter, so the hero leads with the
 * contract and every page ends with an explicit host-ownership boundary.
 */
export function ProofPage({
  boundary,
  boundaryLede,
  children,
  description,
  eyebrow,
  facts,
  guideHref,
  guideLabel,
  proof,
  prompt,
  slug,
  sourcePath,
  title,
}: Readonly<ProofPageProps>) {
  return (
    <div className="sw-showcase-frame">
      <SiteTopbar />
      <main className="sw-proofs-page" data-proof={slug}>
        <header className="sw-proofs-page__hero">
          <div>
            <p className="sw-proofs-page__eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="sw-proofs-page__lede">{description}</p>
          </div>
          <dl aria-label="Proof scope" className="sw-proofs-page__facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section aria-label={`${title} live proof`} className="sw-proofs-page__stage">
          <div className="sw-proofs-page__viewport">{children}</div>
          <footer className="sw-proofs-page__prompt">
            <strong>Try it</strong>
            <span>{prompt}</span>
          </footer>
        </section>

        <section aria-labelledby={`${slug}-proof-points`} className="sw-proofs-page__points">
          <header>
            <p className="sw-proofs-page__eyebrow">WHAT THIS PROVES</p>
            <h2 id={`${slug}-proof-points`}>Every behavior above is the public contract.</h2>
          </header>
          <ol>
            {proof.map((item, index) => (
              <li key={item.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby={`${slug}-boundary`}
          className="sw-proofs-page__boundary"
          data-testid="proof-boundary"
        >
          <header>
            <p className="sw-proofs-page__eyebrow">OWNERSHIP BOUNDARY</p>
            <h2 id={`${slug}-boundary`}>What Sheetwrite provides — and what your host owns.</h2>
            <p>{boundaryLede}</p>
          </header>
          <ul className="sw-proofs-page__boundary-list">
            {boundary.map((row) => (
              <li data-owner={row.owner} key={row.concern}>
                <span className="sw-proofs-page__owner-badge">
                  {row.owner === "host" ? "Host-owned" : "Sheetwrite"}
                </span>
                <strong>{row.concern}</strong>
                <p>{row.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="sw-proofs-page__footer">
          <div>
            <span>CONTINUE BUILDING</span>
            <strong>Wire the same contracts into your backend.</strong>
          </div>
          <nav aria-label="Proof resources">
            <a href={guideHref}>{guideLabel}</a>
            <a href={`https://github.com/chh-ay/sheetwrite/blob/develop/${sourcePath}`}>
              View source
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
