import { createFileRoute } from "@tanstack/react-router";
import landingBench from "../generated/landing-bench.json";
import { pageMeta } from "../lib/seo.js";

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

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

function Landing() {
  const bench = landingBench as {
    available: boolean;
    capture?: { commit: string; timestamp: string; browser: string; rounds: number };
    heroStats?: {
      millionRowScenarios: number;
      millionRowMedianMs: number;
      millionRowHeapMb: number;
    };
    sizes?: LandingBenchSize[];
  };
  return (
    <div className="sw-landing">
      <header className="sw-landing-topbar">
        <a aria-label="Sheetwrite home" className="sw-brand" href="/">
          <svg aria-hidden="true" viewBox="0 0 32 32">
            <rect
              fill="none"
              height="24"
              rx="4"
              stroke="currentColor"
              strokeWidth="2.5"
              width="24"
              x="4"
              y="4"
            />
            <path d="M4 12h24M12 4v24" fill="none" stroke="currentColor" strokeWidth="2.5" />
          </svg>
          <span>Sheetwrite</span>
        </a>
        <nav aria-label="Site">
          <a href="/docs/">Docs</a>
          <a href="#benchmarks">Benchmarks</a>
          <a href="https://github.com/chh-ay/Sheetwrite">GitHub</a>
        </nav>
      </header>

      <main id="main-content">
        <section className="sw-hero">
          <h1>Build spreadsheets you still own.</h1>
          <p>
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
          <code className="sw-hero-install">npm install @sheetwrite/core</code>
        </section>

        <section aria-labelledby="benchmarks-title" className="sw-landing-bench" id="benchmarks">
          <h2 id="benchmarks-title">Measured, not promised</h2>
          {bench.available && bench.sizes && bench.heroStats && bench.capture ? (
            <>
              <ul className="sw-bench-stats">
                {bench.sizes.map((entry) => (
                  <li key={entry.size}>
                    <strong>{entry.medianRatio}× faster</strong>
                    <span>
                      median across {entry.comparedScenarios} interactions at {fmtRows(entry.size)}{" "}
                      rows
                      {entry.handsontableIncomplete > 0
                        ? `; Handsontable did not finish ${entry.handsontableIncomplete} of them`
                        : ""}
                    </span>
                  </li>
                ))}
                <li>
                  <strong>{bench.heroStats.millionRowMedianMs} ms</strong>
                  <span>
                    median interaction at 1,000,000 rows across{" "}
                    {bench.heroStats.millionRowScenarios} scenarios ·{" "}
                    {bench.heroStats.millionRowHeapMb} MB renderer heap
                  </span>
                </li>
              </ul>
              <p className="sw-bench-footnote">
                Ten counterbalanced rounds in controlled {bench.capture.browser}, correctness
                checkpoints on every interaction, failures recorded as failures.{" "}
                <a href="/docs/guides/performance-resources/">Read the full protocol.</a>
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
          <h2 id="showcases-title">Live in every framework</h2>
          <div className="sw-landing-grid sw-landing-grid--frameworks">
            <a href="/vanilla/">
              <strong>Vanilla</strong>
              <span>An imperative workbook with host-owned chrome.</span>
            </a>
            <a href="/react/">
              <strong>React</strong>
              <span>100,000 sales rows behind an operating view.</span>
            </a>
            <a href="/vue/">
              <strong>Vue</strong>
              <span>A million-row workbook on a paged datasource.</span>
            </a>
            <a href="/svelte/">
              <strong>Svelte</strong>
              <span>Live formulas composed from components.</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="sw-landing-footer">
        <span>MIT licensed.</span>
        <nav aria-label="Footer">
          <a href="/docs/">Documentation</a>
          <a href="/docs/guides/performance-resources/">Benchmarks</a>
          <a href="https://github.com/chh-ay/Sheetwrite">GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
