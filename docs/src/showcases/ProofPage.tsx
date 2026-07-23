import type { ReactNode } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { CapabilityHero } from "./CapabilityHero.js";

export interface ProofFact {
  label: string;
  value: string;
}

export interface VerificationPoint {
  title: string;
  detail: string;
}

/** One responsibility split row: what Sheetwrite ships vs. what the host owns. */
export interface BoundaryRow {
  concern: string;
  owner: "sheetwrite" | "host";
  detail: string;
}

interface ProofPageProps {
  boundary: readonly BoundaryRow[];
  /** The named contract that crosses the ownership boundary (e.g. PersistenceAdapter). */
  boundaryContract: string;
  boundaryLede: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  facts: readonly ProofFact[];
  guideHref: string;
  guideLabel: string;
  prompt: string;
  slug: "database" | "collaboration";
  sourcePath: string;
  title: string;
  verification: readonly VerificationPoint[];
}

/**
 * Shared shell for the capability showcase routes (database, collaboration).
 * Framework showcases keep their own `ShowcasePage`; these pages demonstrate
 * one protocol capability instead of one adapter, so the hero leads with the
 * contract and every page ends with an explicit host-ownership boundary map.
 */
export function ProofPage({
  boundary,
  boundaryContract,
  boundaryLede,
  children,
  description,
  eyebrow,
  facts,
  guideHref,
  guideLabel,
  prompt,
  slug,
  sourcePath,
  title,
  verification,
}: Readonly<ProofPageProps>) {
  const sheetwriteRows = boundary.filter((row) => row.owner === "sheetwrite");
  const hostRows = boundary.filter((row) => row.owner === "host");
  return (
    <div className="sw-showcase-frame">
      <SiteTopbar />
      <main className="sw-proofs-page" data-proof={slug}>
        <CapabilityHero description={description} eyebrow={eyebrow} facts={facts} title={title} />

        <section aria-label={`${title} live scenario`} className="sw-proofs-page__stage">
          <div className="sw-proofs-page__viewport">{children}</div>
          <footer className="sw-proofs-page__prompt">
            <strong>Try it</strong>
            <span>{prompt}</span>
          </footer>
        </section>

        <section aria-labelledby={`${slug}-proof-points`} className="sw-proofs-page__points">
          <header>
            <p className="sw-proofs-page__eyebrow">VERIFIED IN THIS SCENARIO</p>
            <h2 id={`${slug}-proof-points`}>Every behavior above is the public contract.</h2>
          </header>
          <ol>
            {verification.map((item, index) => (
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
          <div className="sw-proofs-page__boundary-map">
            <section
              aria-label="Sheetwrite-owned responsibilities"
              className="sw-proofs-page__lane"
              data-lane="sheetwrite"
            >
              <header className="sw-proofs-page__lane-head">
                <span className="sw-proofs-page__owner-badge">Sheetwrite</span>
                <span className="sw-proofs-page__lane-note">ships in the library</span>
              </header>
              <ul>
                {sheetwriteRows.map((row) => (
                  <li data-owner={row.owner} key={row.concern}>
                    <strong>{row.concern}</strong>
                    <p>{row.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
            <p className="sw-proofs-page__lane-joint">
              <span>{boundaryContract}</span>
            </p>
            <section
              aria-label="Host-owned responsibilities"
              className="sw-proofs-page__lane"
              data-lane="host"
            >
              <header className="sw-proofs-page__lane-head">
                <span className="sw-proofs-page__owner-badge">Your host</span>
                <span className="sw-proofs-page__lane-note">you implement and deploy</span>
              </header>
              <ul>
                {hostRows.map((row) => (
                  <li data-owner={row.owner} key={row.concern}>
                    <strong>{row.concern}</strong>
                    <p>{row.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>

        <footer className="sw-proofs-page__footer">
          <div>
            <span>CONTINUE BUILDING</span>
            <strong>Wire the same contracts into your backend.</strong>
          </div>
          <nav aria-label="Showcase resources">
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
