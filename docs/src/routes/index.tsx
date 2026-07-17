import { createFileRoute, Link } from "@tanstack/react-router";
import { InstallCommand } from "../components/InstallCommand.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
import { pageMeta } from "../lib/seo.js";
import { HeroWorkbookIsland } from "../showcases/HeroIsland.js";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite — build spreadsheets you still own",
      "A canvas spreadsheet engine with a Rust/WASM data core, first-party Vanilla, React, Vue, and Svelte adapters, and protocol-validated benchmarks.",
    ),
  }),
  component: Landing,
});

interface LandingBenchSize {
  size: number;
  comparedScenarios: number;
  medianRatio: number;
  bestRatio: number;
  bestScenario: string;
  handsontableIncomplete: number;
}

interface LandingBenchData {
  available: boolean;
  capture?: { commit: string; timestamp: string; browser: string; rounds: number };
  heroStats?: {
    millionRowScenarios: number;
    millionRowMedianMs: number;
    millionRowHeapMb: number;
  };
  sizes?: LandingBenchSize[];
}

const SHOWCASES = [
  {
    id: "vanilla",
    label: "Vanilla",
    href: "/vanilla/",
    headline: "An imperative workbook with host-owned chrome.",
  },
  {
    id: "react",
    label: "React",
    href: "/react/",
    headline: "100,000 sales rows behind an operating view.",
  },
  {
    id: "vue",
    label: "Vue",
    href: "/vue/",
    headline: "A million-row workbook on a paged datasource.",
  },
  {
    id: "svelte",
    label: "Svelte",
    href: "/svelte/",
    headline: "Live formulas composed from components.",
  },
] as const;

const OWNERSHIP = [
  {
    key: "01 · Host",
    title: "You own the product.",
    detail: "Lifecycle, persistence, collaboration, and product UI stay in your codebase.",
  },
  {
    key: "02 · TypeScript core",
    title: "One narrow seam.",
    detail:
      "Grid API, transactions, virtualization, interaction, and renderer coordination — ownership crosses in one place.",
  },
  {
    key: "03 · Rust / WASM",
    title: "The engine owns the speed.",
    detail: "Columnar cells, formulas, query scans, snapshots, and packed render windows.",
  },
] as const;

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

/** Shared log scale across every ratio bar: ×1 is parity (zero width). */
function ratioWidth(ratio: number, maxRatio: number): string {
  const domain = Math.log10(maxRatio * 1.25);
  const pct = (Math.log10(Math.max(ratio, 1)) / domain) * 100;
  return `${Math.min(100, Math.max(pct, 3)).toFixed(1)}%`;
}

function Landing() {
  const bench = landingBench as LandingBenchData;
  const evidence =
    bench.available && bench.sizes && bench.heroStats && bench.capture
      ? { sizes: bench.sizes, heroStats: bench.heroStats, capture: bench.capture }
      : undefined;
  const maxRatio = evidence ? Math.max(...evidence.sizes.map((entry) => entry.medianRatio)) : 1;
  return (
    <div className="sw-landing">
      <SiteTopbar />

      <main id="main-content">
        <section className="sw-hero">
          <div className="sw-hero__copy">
            <p className="sw-hero__eyebrow">Canvas spreadsheet engine · Rust/WASM core · MIT</p>
            <h1>Build spreadsheets you still own.</h1>
            <p className="sw-hero__lede">
              Sheetwrite is a canvas spreadsheet engine with a Rust/WASM data core and first-party
              Vanilla, React, Vue, and Svelte adapters. Your application owns the document, the
              persistence, and the chrome — the engine owns the speed.
            </p>
            <div className="sw-hero-actions">
              <a className="sw-cta" href="/docs/start/installation/">
                Get started
              </a>
              <a className="sw-cta sw-cta--ghost" href="#benchmarks">
                See the numbers
              </a>
            </div>
            <div className="sw-hero-install">
              <InstallCommand packageName="@sheetwrite/core" />
            </div>
          </div>
          <div className="sw-hero-demo">
            <div className="sw-hero-stage">
              <header className="sw-hero-stage__bar">
                <div>
                  <strong>fy26-plan.sheet</strong>
                  <span>@sheetwrite/react</span>
                </div>
                <span>every FY total is =SUM</span>
              </header>
              <HeroWorkbookIsland />
            </div>
            <p className="sw-hero-demo__hint">
              The real adapter, not a video — click a quarter, type a number, and the FY totals
              recalculate in the Rust engine.
            </p>
          </div>
        </section>

        <section aria-labelledby="benchmarks-title" className="sw-landing-bench" id="benchmarks">
          <header className="sw-section-head">
            <p className="sw-section-eyebrow">Protocol evidence</p>
            <h2 id="benchmarks-title">Measured, not promised</h2>
            {evidence ? (
              <p className="sw-section-lede">
                Median speedups over Handsontable, rendered straight from checked-in protocol
                artifacts. The gap widens as the data grows.
              </p>
            ) : null}
          </header>
          {evidence ? (
            <>
              <div className="sw-bench-layout">
                <figure className="sw-bench-figure">
                  <ul className="sw-bench-stats">
                    {evidence.sizes.map((entry) => (
                      <li key={entry.size}>
                        <div className="sw-bench-stat__head">
                          <span className="sw-bench-stat__size">{fmtRows(entry.size)} rows</span>
                          <strong>{entry.medianRatio}× faster</strong>
                        </div>
                        <span aria-hidden="true" className="sw-bench-stat__track">
                          <i style={{ width: ratioWidth(entry.medianRatio, maxRatio) }} />
                        </span>
                        <span className="sw-bench-stat__detail">
                          median of {entry.comparedScenarios} interactions · best {entry.bestRatio}×
                          in <code>{entry.bestScenario}</code>
                          {entry.handsontableIncomplete > 0
                            ? ` · Handsontable did not finish ${entry.handsontableIncomplete} of ${
                                entry.comparedScenarios + entry.handsontableIncomplete
                              }`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <figcaption>
                    Bar length maps the median speedup on a shared log scale — ×1 would be parity.
                  </figcaption>
                </figure>
                <aside aria-label="One million row summary" className="sw-bench-aside">
                  <p className="sw-bench-aside__eyebrow">At 1,000,000 rows</p>
                  <p className="sw-bench-aside__stat">
                    <strong>{evidence.heroStats.millionRowMedianMs} ms</strong>
                    <span>
                      median interaction across {evidence.heroStats.millionRowScenarios} scenarios
                    </span>
                  </p>
                  <p className="sw-bench-aside__stat">
                    <strong>{evidence.heroStats.millionRowHeapMb} MB</strong>
                    <span>renderer heap</span>
                  </p>
                  <dl className="sw-bench-capture">
                    <div>
                      <dt>Browser</dt>
                      <dd>{evidence.capture.browser}</dd>
                    </div>
                    <div>
                      <dt>Rounds</dt>
                      <dd>{evidence.capture.rounds} counterbalanced</dd>
                    </div>
                    <div>
                      <dt>Commit</dt>
                      <dd>
                        <code>{evidence.capture.commit.slice(0, 7)}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Captured</dt>
                      <dd>{evidence.capture.timestamp.slice(0, 10)}</dd>
                    </div>
                  </dl>
                </aside>
              </div>
              <p className="sw-bench-footnote">
                Correctness checkpoints guard every interaction, and failures are recorded as
                failures. <a href="/docs/guides/performance-resources/">Read the full protocol.</a>
              </p>
            </>
          ) : (
            <p className="sw-bench-footnote">
              Benchmark evidence is generated from local protocol artifacts. Run{" "}
              <code>bun run --filter @sheetwrite/bench bench:render:scale</code> and{" "}
              <code>bun run docs:generate</code> to publish real numbers here.
            </p>
          )}
        </section>

        <section aria-labelledby="showcases-title" className="sw-landing-showcases">
          <header className="sw-section-head">
            <p className="sw-section-eyebrow">Live showcases</p>
            <h2 id="showcases-title">One engine. Four ways to mount it.</h2>
            <p className="sw-section-lede">
              Vanilla, React, Vue, and Svelte use the same package entry points shown in the docs.
              Open any grid and edit it.
            </p>
          </header>
          <div className="sw-landing-grid sw-landing-grid--frameworks">
            {SHOWCASES.map((showcase) => (
              <Link data-framework={showcase.id} key={showcase.id} to={showcase.href}>
                <span className="sw-showcase-card__meta">{showcase.label}</span>
                <strong>{showcase.headline}</strong>
                <span className="sw-showcase-card__cta">Open the live grid →</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="ownership-title" className="sw-landing-own">
          <header className="sw-section-head">
            <p className="sw-section-eyebrow">Runtime contract</p>
            <h2 id="ownership-title">The ownership line is explicit</h2>
          </header>
          <ol className="sw-own-grid">
            {OWNERSHIP.map((layer) => (
              <li key={layer.key}>
                <span>{layer.key}</span>
                <h3>{layer.title}</h3>
                <p>{layer.detail}</p>
              </li>
            ))}
          </ol>
          <a className="sw-own-link" href="/docs/concepts/runtime-ownership/">
            Read the runtime-ownership model →
          </a>
        </section>
      </main>

      <footer className="sw-landing-footer">
        <p className="sw-landing-footer__brand">
          <strong>Sheetwrite</strong>
          <span>MIT licensed.</span>
        </p>
        <nav aria-label="Footer">
          <a href="/docs/">Documentation</a>
          <a href="/docs/guides/performance-resources/">Benchmarks</a>
          <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
