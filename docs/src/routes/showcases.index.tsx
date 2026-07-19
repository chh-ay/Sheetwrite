import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
import { pageMeta } from "../lib/seo.js";
import {
  CAPABILITY_INVENTORY,
  CAPABILITY_OWNERS,
  type CapabilityOwnerId,
} from "../showcases/capabilities.js";
import { assertCapabilityInventory } from "../showcases/capability-validation.js";
import hubStylesheet from "../styles/showcase-hub.css?url";

// Fail closed at module scope: a broken capability contract must never
// prerender, so an invalid inventory fails the docs build here.
assertCapabilityInventory(CAPABILITY_INVENTORY, CAPABILITY_OWNERS);

export const Route = createFileRoute("/showcases/")({
  head: () => ({
    meta: pageMeta(
      "Showcases — evaluate Sheetwrite by capability",
      "Every public Sheetwrite capability with its owning live showcase: editing, formulas, validation, million-row scale, XLSX/CSV exchange, IndexedDB persistence, offline sync, and collaboration.",
    ),
    links: [{ rel: "stylesheet", href: hubStylesheet }],
  }),
  component: ShowcaseHub,
});

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

/** Launch order for the four capability scenes: measured scale leads. */
const SCENE_ORDER = [
  "performance",
  "database",
  "interoperability",
  "collaboration",
] as const satisfies readonly CapabilityOwnerId[];

type SceneOwnerId = (typeof SCENE_ORDER)[number];

/** One concise line per scene, distilled from the owner's responsibility. */
const SCENE_SUMMARY: Readonly<Record<SceneOwnerId, string>> = {
  performance: "A million paged rows, Worker and main-thread rendering, measured medians.",
  database: "Snapshot load, append-only IndexedDB commits, compaction, reload recovery.",
  interoperability: "XLSX/Excel and CSV/TSV against independent fixtures, with explicit warnings.",
  collaboration: "Two clients, one sequencer: presence, offline reconnect, conflicts, recovery.",
};

/** Accurate mount and runtime cues per first-party adapter. */
const FRAMEWORK_MOUNTS: Readonly<Record<string, { mount: string; pkg: string }>> = {
  vanilla: { mount: "createGrid(host, …)", pkg: "@sheetwrite/core" },
  react: { mount: "<SheetwriteGrid />", pkg: "@sheetwrite/react" },
  vue: { mount: "<SheetwriteGrid />", pkg: "@sheetwrite/vue" },
  svelte: { mount: "<SheetwriteGrid bind:grid />", pkg: "@sheetwrite/svelte" },
};

interface HubBenchData {
  available: boolean;
  heroStats?: {
    millionRowMedianMs?: number;
    millionRowHeapMb?: number;
    millionRowScenarios?: number;
  };
}

const TELEMETRY_BAR_IDS = Array.from({ length: 16 }, (_, index) => `telemetry-${index + 1}`);
const EXCHANGE_CELL_IDS = Array.from({ length: 9 }, (_, index) => `exchange-${index + 1}`);

/** Million-row telemetry: paged-row counter, median readout, frame bars. */
function PerformanceScene({ medianMs }: Readonly<{ medianMs?: number }>) {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--performance">
      <span className="sw-hub-tele">
        <span className="sw-hub-tele__stat">
          <strong>1,000,000</strong>
          <small>rows paged</small>
        </span>
        <span className="sw-hub-tele__stat">
          {medianMs === undefined ? (
            <>
              <strong>Worker</strong>
              <small>renderer host</small>
            </>
          ) : (
            <>
              <strong>{medianMs} ms</strong>
              <small>median interaction</small>
            </>
          )}
        </span>
      </span>
      <span className="sw-hub-tele__bars">
        {TELEMETRY_BAR_IDS.map((id) => (
          <i key={id} />
        ))}
      </span>
      <span className="sw-hub-scene__caption">scroll · jump · edit · cache churn</span>
    </span>
  );
}

/** Durable commit timeline: snapshot, append-only commits, compact, reload. */
function DatabaseScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--database">
      <span className="sw-hub-commits">
        <span className="sw-hub-commits__node" data-kind="snapshot">
          <i />
          <code>snapshot</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c41</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c42</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="commit">
          <i />
          <code>c43</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="compact">
          <i />
          <code>compact</code>
        </span>
        <span className="sw-hub-commits__node" data-kind="reload">
          <i />
          <code>reload</code>
        </span>
      </span>
      <span className="sw-hub-scene__caption">IndexedDB · append-only log · recovery</span>
    </span>
  );
}

/** Workbook exchange: files in, grid in the middle, files back out. */
function InteroperabilityScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--interoperability">
      <span className="sw-hub-exchange">
        <span className="sw-hub-exchange__files">
          <span className="sw-hub-file">.xlsx</span>
          <span className="sw-hub-file">.csv</span>
        </span>
        <i className="sw-hub-exchange__arrow" />
        <span className="sw-hub-exchange__grid">
          {EXCHANGE_CELL_IDS.map((id) => (
            <i key={id} />
          ))}
        </span>
        <i className="sw-hub-exchange__arrow" />
        <span className="sw-hub-exchange__files">
          <span className="sw-hub-file">.xlsx</span>
          <span className="sw-hub-file">.tsv</span>
        </span>
      </span>
      <span className="sw-hub-scene__caption">import · fidelity warnings · export</span>
    </span>
  );
}

/** Two-client sequencing: per-client op lanes converging on one shared log. */
function CollaborationScene() {
  return (
    <span aria-hidden="true" className="sw-hub-scene sw-hub-scene--collaboration">
      <span className="sw-hub-sync">
        <span className="sw-hub-sync__lane" data-client="a">
          <span className="sw-hub-sync__peer">A</span>
          <code>edit B2</code>
          <code>edit C4</code>
        </span>
        <span className="sw-hub-sync__seq">
          <span data-client="a">41</span>
          <span data-client="b">42</span>
          <span data-client="a">43</span>
          <span data-client="b">44</span>
        </span>
        <span className="sw-hub-sync__lane" data-client="b">
          <span className="sw-hub-sync__peer">B</span>
          <code>edit D1</code>
          <code>ack 42</code>
        </span>
      </span>
      <span className="sw-hub-scene__caption">two clients · one sequencer · convergence</span>
    </span>
  );
}

function CapabilityScene({ id, medianMs }: Readonly<{ id: SceneOwnerId; medianMs?: number }>) {
  switch (id) {
    case "performance":
      return <PerformanceScene medianMs={medianMs} />;
    case "database":
      return <DatabaseScene />;
    case "interoperability":
      return <InteroperabilityScene />;
    case "collaboration":
      return <CollaborationScene />;
  }
}

function ShowcaseHub() {
  const bench = landingBench as HubBenchData;
  const heroStats = bench.available ? bench.heroStats : undefined;
  const frameworks = CAPABILITY_OWNERS.filter((owner) => owner.kind === "framework");

  return (
    <div className="sw-hub-frame">
      <SiteTopbar active="showcases" />
      <main className="sw-hub" id="main-content">
        <header className="sw-hub__hero">
          <p className="sw-hub__eyebrow">Capability evaluation</p>
          <h1>Every capability, live and verified.</h1>
          <p className="sw-hub__lede">
            {CAPABILITY_INVENTORY.length} public capabilities, each with exactly one owning
            showcase, a required interaction, and an executable browser contract. Open the live
            scenario that matches your job.
          </p>
          {heroStats ? (
            <p className="sw-hub__bench">
              <strong>{heroStats.millionRowMedianMs} ms</strong> median interaction at 1,000,000
              rows across {heroStats.millionRowScenarios} scenarios ·{" "}
              <strong>{heroStats.millionRowHeapMb} MB</strong> renderer heap —{" "}
              <Link to="/showcases/performance/">see the measured evidence</Link> or{" "}
              <a href="/docs/guides/performance-resources/">read the protocol</a>.
            </p>
          ) : (
            <p className="sw-hub__bench">
              Benchmark evidence renders from checked-in protocol artifacts on the{" "}
              <Link to="/showcases/performance/">performance showcase</Link>.
            </p>
          )}
        </header>

        <section aria-labelledby="hub-scenes" className="sw-hub__scenes">
          <h2 id="hub-scenes">Capability showcases</h2>
          <p>Four framework-neutral live scenarios — one subsystem each, real and editable.</p>
          <ul className="sw-hub-scenes">
            {SCENE_ORDER.map((id) => {
              const owner = OWNER_BY_ID.get(id);
              if (!owner) return null;
              return (
                <li key={owner.id}>
                  <Link className="sw-hub-launch" data-owner={owner.id} to={owner.href}>
                    <CapabilityScene id={id} medianMs={heroStats?.millionRowMedianMs} />
                    <span className="sw-hub-launch__body">
                      <strong>{owner.label}</strong>
                      <span className="sw-hub-launch__summary">{SCENE_SUMMARY[id]}</span>
                      <span className="sw-hub__owner-count">
                        {CAPABILITY_INVENTORY.filter((c) => c.primary === owner.id).length} owned
                        capabilities →
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="hub-frameworks" className="sw-hub__frameworks">
          <h2 id="hub-frameworks">Framework workbenches</h2>
          <p>One engine, four first-party adapters — every workbench stays directly editable.</p>
          <ul className="sw-hub-rail">
            {frameworks.map((owner) => {
              const cue = FRAMEWORK_MOUNTS[owner.id];
              return (
                <li key={owner.id}>
                  <Link
                    className="sw-hub-rail__item"
                    data-framework={owner.id}
                    data-owner={owner.id}
                    to={owner.href}
                  >
                    <strong>{owner.label}</strong>
                    {cue ? (
                      <span className="sw-hub-rail__mount">
                        <code>{cue.mount}</code>
                        <code className="sw-hub-rail__pkg">{cue.pkg}</code>
                      </span>
                    ) : null}
                    <span className="sw-hub__owner-count">
                      {CAPABILITY_INVENTORY.filter((c) => c.primary === owner.id).length} owned
                      capabilities →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
