import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import DatabaseShowcase from "../showcases/DatabaseShowcase.js";
import { ProofPage } from "../showcases/ProofPage.js";
import proofStylesheet from "../styles/showcase-proofs.css?url";

const description =
  "A versioned workbook database over real browser IndexedDB: append-only commits, atomic base-version checks, idempotent retries, bounded tails, compaction, and reload recovery — with every read, write, and byte on a live gauge.";

export const Route = createFileRoute("/showcases/database")({
  head: () => ({
    meta: pageMeta("Database and document lifecycle — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: proofStylesheet }],
  }),
  component: DatabaseProofRoute,
});

function DatabaseProofRoute() {
  return (
    <ProofPage
      boundary={[
        {
          concern: "Persistence contract",
          owner: "sheetwrite",
          detail:
            "PersistenceAdapter: snapshot load plus append-only DocumentOp[] commits with applied / duplicate / conflict acknowledgements.",
        },
        {
          concern: "Durable offline queue",
          owner: "sheetwrite",
          detail:
            "IndexedDbPendingCommitStorage keeps unacknowledged local commits durable across reloads, with bounded restore.",
        },
        {
          concern: "Server database",
          owner: "host",
          detail:
            "The IndexedDB adapter on this page is demo-only. Production documents live in your database behind your own PersistenceAdapter.",
        },
        {
          concern: "Authentication & authorization",
          owner: "host",
          detail:
            "Sheetwrite never sees credentials. Identity, session, and per-document permissions are enforced by your backend before a commit is sequenced.",
        },
        {
          concern: "Transport & deployment",
          owner: "host",
          detail:
            "HTTP, WebSocket, queues, regions, backups: the adapter interface is transport-neutral by design and ships no network code.",
        },
      ]}
      boundaryContract="PersistenceAdapter"
      boundaryLede="This showcase runs the full persistence protocol against a real browser database so you can inspect it. The pieces a product must own stay explicitly yours."
      description={description}
      eyebrow="CAPABILITY / DATABASE & DOCUMENT LIFECYCLE"
      facts={[
        { label: "Storage", value: "Browser IndexedDB" },
        { label: "Commits", value: "Append-only DocumentOp[]" },
        { label: "Versioning", value: "Atomic base-version compare" },
        { label: "Durability", value: "Pending queue survives reload" },
      ]}
      guideHref="/docs/guides/persistence/"
      guideLabel="Read the persistence guide"
      prompt="Turn autosave off, make a few edits, then reload the page — the pending queue survives. Or force an external commit and watch conflict recovery rebase your work."
      slug="database"
      sourcePath="docs/src/showcases/showcase-database.ts"
      title="A real database lifecycle, observable end to end."
      verification={[
        {
          title: "Atomic sequencing",
          detail:
            "Each commit compares its base version against the stored head inside one serialized adapter queue — stale writers get a recoverable conflict, never a lost update.",
        },
        {
          title: "Idempotent retries",
          detail:
            "Lose an acknowledgement and retry with the same mutation id: the server answers duplicate with the original version and applies nothing twice.",
        },
        {
          title: "Bounded storage",
          detail:
            "The operation tail is capped by record count and bytes; crossing either bound folds the tail into one compacted snapshot record — watch the gauges.",
        },
        {
          title: "Reload recovery",
          detail:
            "Close and reopen the session (or reload this page): committed state and the durable pending queue come back from IndexedDB exactly once.",
        },
      ]}
    >
      <DatabaseShowcase />
    </ProofPage>
  );
}
