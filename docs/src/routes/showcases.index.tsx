import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
      "Showcases — evaluate Sheetwrite by feature",
      "Every public Sheetwrite feature with its owning live example: editing, formulas, validation, million-row scale, XLSX/CSV exchange, IndexedDB persistence, offline sync, and collaboration.",
    ),
    links: [{ rel: "stylesheet", href: hubStylesheet }],
  }),
  component: ShowcaseHub,
});

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

/** The eight-showcase gallery contains four capability owners plus four adapters. */
const SCENE_ORDER = [
  "performance",
  "database",
  "interoperability",
  "collaboration",
] as const satisfies readonly CapabilityOwnerId[];

type SceneOwnerId = (typeof SCENE_ORDER)[number];

/** Concise launch copy, distilled from each checked owner's responsibility. */
const SCENE_SUMMARY: Readonly<Record<SceneOwnerId, string>> = {
  performance: "Million-row paging with measured Worker and main-thread results.",
  database: "IndexedDB snapshots, append-only commits, compaction, and reload recovery.",
  interoperability: "XLSX and delimited exchange with fixtures and explicit fidelity warnings.",
  collaboration: "Two clients proving sequencing, reconnects, conflicts, and recovery.",
};

/** Accurate mount and runtime cues per first-party adapter. */
const FRAMEWORK_MOUNTS: Readonly<Record<string, { mount: string; pkg: string }>> = {
  vanilla: { mount: "createGrid(host, …)", pkg: "@sheetwrite/core" },
  react: { mount: "<SheetwriteGrid />", pkg: "@sheetwrite/react" },
  vue: { mount: "<SheetwriteGrid />", pkg: "@sheetwrite/vue" },
  svelte: { mount: "<SheetwriteGrid bind:grid />", pkg: "@sheetwrite/svelte" },
};

const FRAMEWORK_SUMMARY: Readonly<Record<string, string>> = {
  vanilla: "Direct Grid lifecycle, renderer choice, and workbook operations.",
  react: "Controlled analytics with queries, formulas, clipboard, and reset semantics.",
  vue: "Validation, protection, notes, sheets, and host persistence.",
  svelte: "Durable offline edits, reconnect drain, and collaborative activity.",
};

type HubGroup = "all" | "data" | "workbook" | "collaboration" | "framework";

const HUB_GROUPS: readonly { id: HubGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "data", label: "Data & scale" },
  { id: "workbook", label: "Workbook" },
  { id: "collaboration", label: "Collaboration" },
  { id: "framework", label: "Framework integration" },
];

function ownerGroup(owner: (typeof CAPABILITY_OWNERS)[number]): Exclude<HubGroup, "all"> {
  if (owner.kind === "framework") return "framework";
  if (owner.id === "interoperability") return "workbook";
  if (owner.id === "collaboration") return "collaboration";
  return "data";
}

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
  const [group, setGroup] = useState<HubGroup>("all");
  const orderedOwners = [
    ...SCENE_ORDER.map((id) => OWNER_BY_ID.get(id)).filter(
      (owner): owner is NonNullable<typeof owner> => owner !== undefined,
    ),
    ...CAPABILITY_OWNERS.filter((owner) => owner.kind === "framework"),
  ];
  const visibleOwners =
    group === "all" ? orderedOwners : orderedOwners.filter((owner) => ownerGroup(owner) === group);

  return (
    <div className="sw-hub-frame">
      <SiteTopbar active="showcases" />
      <main className="sw-hub" id="main-content">
        <header className="sw-hub__hero">
          <div className="sw-hub__hero-copy">
            <p className="sw-hub__eyebrow">Choose a product proof</p>
            <h1>Every feature, live and tested.</h1>
            <p className="sw-hub__lede">
              Start with the job you need to prove. Each launcher opens its real editable example,
              with one action to try and browser evidence beside it.
            </p>
          </div>
          <div className="sw-hub__hero-notes">
            <p className="sw-hub__inventory">
              <strong>{CAPABILITY_INVENTORY.length} checked features</strong>
              <span>Eight owning experiences · one authoritative route each</span>
            </p>
            <details className="sw-hub__internals">
              <summary>Implementation and measurement notes</summary>
              <div>
                <p>
                  The launcher initializes no Grid or WASM. Each destination owns its product
                  runtime.
                </p>
                <p>
                  <Link to="/showcases/engine/">Inspect the live engine</Link>
                  {heroStats ? (
                    <>
                      {" "}
                      or open the <Link to="/showcases/performance/">measured scale results</Link> (
                      {heroStats.millionRowMedianMs} ms median interaction at 1,000,000 rows).
                    </>
                  ) : (
                    <>
                      {" "}
                      or open the <Link to="/showcases/performance/">saved scale results</Link>.
                    </>
                  )}
                </p>
              </div>
            </details>
          </div>
        </header>

        <section aria-labelledby="hub-scenes" className="sw-hub__scenes">
          <div className="sw-hub__section-heading">
            <div>
              <p className="sw-hub__section-index">01 / Product experiences</p>
              <h2 id="hub-scenes">Pick the proof that matches your work</h2>
            </div>
            <p>Preview the interaction, then open the owning route to use it.</p>
          </div>
          <div className="sw-hub__toolbar">
            <fieldset className="sw-hub__filters">
              <legend>Filter product examples</legend>
              {HUB_GROUPS.map((item) => (
                <button
                  aria-pressed={group === item.id}
                  key={item.id}
                  onClick={() => setGroup(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </fieldset>
            <p aria-live="polite" className="sw-hub__filter-status">
              {visibleOwners.length} / {orderedOwners.length} shown
            </p>
          </div>
          <ol className="sw-hub-scenes" data-group={group}>
            {visibleOwners.map((owner) => {
              const cue = FRAMEWORK_MOUNTS[owner.id];
              const isFramework = owner.kind === "framework";
              const isFeatured = owner.id === "performance";
              const featureCount = CAPABILITY_INVENTORY.filter(
                (capability) => capability.primary === owner.id,
              ).length;
              return (
                <li data-owner={owner.id} key={owner.id}>
                  <Link
                    className={`sw-hub-launch${isFramework ? " sw-hub-launch--framework" : ""}${isFeatured ? " sw-hub-launch--featured" : ""}`}
                    data-owner={owner.id}
                    to={owner.href}
                  >
                    {isFramework ? (
                      <span aria-hidden="true" className="sw-hub-framework-scene">
                        <span>{owner.label.replace(" workbench", "")}</span>
                        <code>{cue?.mount}</code>
                        <small>{cue?.pkg}</small>
                      </span>
                    ) : (
                      <CapabilityScene
                        id={owner.id as SceneOwnerId}
                        medianMs={heroStats?.millionRowMedianMs}
                      />
                    )}
                    <span className="sw-hub-launch__body">
                      <span className="sw-hub-launch__meta">
                        <span>
                          {isFeatured
                            ? "Featured scale proof"
                            : HUB_GROUPS.find((item) => item.id === ownerGroup(owner))?.label}
                        </span>
                        <span>{featureCount} checked</span>
                      </span>
                      <strong>{owner.label}</strong>
                      <span className="sw-hub-launch__summary">
                        {isFramework
                          ? FRAMEWORK_SUMMARY[owner.id]
                          : SCENE_SUMMARY[owner.id as SceneOwnerId]}
                      </span>
                      <span className="sw-hub__owner-count">Open live experience →</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
