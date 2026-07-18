import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
import { pageMeta } from "../lib/seo.js";
import {
  CAPABILITY_INVENTORY,
  CAPABILITY_OWNERS,
  type Capability,
  type CapabilityArea,
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
      "Every public Sheetwrite capability with its owning live proof: editing, formulas, validation, million-row scale, XLSX/CSV exchange, IndexedDB persistence, offline sync, and collaboration.",
    ),
    links: [{ rel: "stylesheet", href: hubStylesheet }],
  }),
  component: ShowcaseHub,
});

const AREA_ORDER: readonly { area: CapabilityArea; label: string; job: string }[] = [
  { area: "editing", label: "Edit & interact", job: "Enter, move, and correct data" },
  { area: "modeling", label: "Model & analyze", job: "Formulas, aggregates, and queries" },
  {
    area: "workflow",
    label: "Govern & annotate",
    job: "Validation, protection, notes, formatting",
  },
  { area: "scale", label: "Scale & render", job: "Million rows, Workers, measured speed" },
  { area: "interop", label: "Exchange spreadsheets", job: "XLSX, Excel, CSV/TSV in and out" },
  {
    area: "persistence",
    label: "Persist & recover",
    job: "Snapshots, commits, compaction, reload",
  },
  {
    area: "collaboration",
    label: "Sync & collaborate",
    job: "Offline queues, presence, convergence",
  },
  {
    area: "lifecycle",
    label: "Mount in your framework",
    job: "Create, reset, live options, destroy",
  },
];

const OWNER_BY_ID = new Map(CAPABILITY_OWNERS.map((owner) => [owner.id, owner]));

interface HubBenchData {
  available: boolean;
  heroStats?: {
    millionRowMedianMs?: number;
    millionRowHeapMb?: number;
    millionRowScenarios?: number;
  };
}

function OwnerLink({ id }: Readonly<{ id: CapabilityOwnerId }>) {
  const owner = OWNER_BY_ID.get(id);
  if (!owner) return null;
  return (
    <Link className="sw-hub-owner-link" data-owner={id} to={owner.href}>
      {owner.label}
    </Link>
  );
}

function CapabilityRow({ capability }: Readonly<{ capability: Capability }>) {
  return (
    <li className="sw-hub-cap">
      <div className="sw-hub-cap__head">
        <h4>{capability.title}</h4>
        <code>{capability.id}</code>
      </div>
      <p className="sw-hub-cap__interaction">{capability.interaction}</p>
      <dl className="sw-hub-cap__facts">
        <div>
          <dt>Proof</dt>
          <dd>
            <OwnerLink id={capability.primary} />
            {(capability.secondary ?? []).map((secondary) => (
              <span className="sw-hub-cap__secondary" key={secondary.owner}>
                also <OwnerLink id={secondary.owner} />
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>
            <code>{capability.testPath}</code>
          </dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>{capability.boundary}</dd>
        </div>
      </dl>
    </li>
  );
}

function ShowcaseHub() {
  const bench = landingBench as HubBenchData;
  const heroStats = bench.available ? bench.heroStats : undefined;
  const frameworks = CAPABILITY_OWNERS.filter((owner) => owner.kind === "framework");
  const proofs = CAPABILITY_OWNERS.filter((owner) => owner.kind === "capability");

  return (
    <div className="sw-hub-frame">
      <SiteTopbar active="showcases" />
      <main className="sw-hub" id="main-content">
        <header className="sw-hub__hero">
          <p className="sw-hub__eyebrow">Capability evaluation</p>
          <h1>Every capability, proven live.</h1>
          <p className="sw-hub__lede">
            {CAPABILITY_INVENTORY.length} public capabilities, each with exactly one owning
            showcase, a required interaction, an executable browser contract, and an explicit
            host-owned boundary. Open the proof that matches your job — every grid below is real and
            editable.
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

        <section aria-labelledby="hub-proofs" className="sw-hub__owners">
          <h2 id="hub-proofs">Deep capability proofs</h2>
          <p>Framework-neutral routes that prove one subsystem end to end.</p>
          <ul className="sw-hub__owner-grid">
            {proofs.map((owner) => (
              <li key={owner.id}>
                <Link data-owner={owner.id} to={owner.href}>
                  <strong>{owner.label}</strong>
                  <span>{owner.responsibility}</span>
                  <span className="sw-hub__owner-count">
                    {CAPABILITY_INVENTORY.filter((c) => c.primary === owner.id).length} owned
                    capabilities →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="hub-frameworks" className="sw-hub__owners">
          <h2 id="hub-frameworks">Framework workbenches</h2>
          <p>
            One engine, four first-party adapters. Each workbench mounts the same core with a
            bounded product story — and stays directly editable.
          </p>
          <ul className="sw-hub__owner-grid">
            {frameworks.map((owner) => (
              <li key={owner.id}>
                <Link data-owner={owner.id} to={owner.href}>
                  <strong>{owner.label}</strong>
                  <span>{owner.responsibility}</span>
                  <span className="sw-hub__owner-count">
                    {CAPABILITY_INVENTORY.filter((c) => c.primary === owner.id).length} owned
                    capabilities →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="hub-index" className="sw-hub__index">
          <h2 id="hub-index">The capability index</h2>
          <p>
            The same checked-in inventory that gates the docs build — if a capability loses its
            owner, route, interaction contract, or shared protocol binding, this site fails to ship.
          </p>
          {AREA_ORDER.map(({ area, label, job }) => {
            const capabilities = CAPABILITY_INVENTORY.filter((c) => c.area === area);
            if (capabilities.length === 0) return null;
            const headingId = `hub-area-${area}`;
            return (
              <section aria-labelledby={headingId} className="sw-hub__area" key={area}>
                <header>
                  <h3 id={headingId}>{label}</h3>
                  <p>{job}</p>
                </header>
                <ul className="sw-hub__caps">
                  {capabilities.map((capability) => (
                    <CapabilityRow capability={capability} key={capability.id} />
                  ))}
                </ul>
              </section>
            );
          })}
        </section>
      </main>
    </div>
  );
}
