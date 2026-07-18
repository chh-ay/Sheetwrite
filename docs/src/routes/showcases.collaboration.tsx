import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import CollaborationShowcase from "../showcases/CollaborationShowcase.js";
import { ProofPage } from "../showcases/ProofPage.js";
import proofStylesheet from "../styles/showcase-proofs.css?url";

const description =
  "Two live clients against one sequencing server: ordered durable commits, duplicate acknowledgements, presence, offline queues that drain on reconnect, version-gap buffering, and conservative conflict recovery.";

export const Route = createFileRoute("/showcases/collaboration")({
  head: () => ({
    meta: pageMeta("Collaboration protocol — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: proofStylesheet }],
  }),
  component: CollaborationProofRoute,
});

function CollaborationProofRoute() {
  return (
    <ProofPage
      boundary={[
        {
          concern: "Sequencing protocol",
          owner: "sheetwrite",
          detail:
            "SyncCoordinator: optimistic local commits, ordered acknowledgements, echo deduplication, gap buffering, and fail-closed input limits.",
        },
        {
          concern: "Presence & conservative rebase",
          owner: "sheetwrite",
          detail:
            "PresenceCoordinator shares ephemeral selections; rebaseDocumentOperations transforms safe edits and reports explicit conflicts instead of guessing.",
        },
        {
          concern: "Transport",
          owner: "host",
          detail:
            "The in-page server here stands in for your WebSocket or realtime channel. Sheetwrite ships protocol contracts, not network code.",
        },
        {
          concern: "Durable server storage",
          owner: "host",
          detail:
            "Server-side document state, revision history, and backups live in your database behind your PersistenceAdapter implementation.",
        },
        {
          concern: "Auth, authorization & deployment",
          owner: "host",
          detail:
            "Who a collaborator is, what they may edit, and where the service runs are host decisions — presence identity is advisory UI state, never access control.",
        },
      ]}
      boundaryLede="Everything moving on this page is the real collaboration protocol running in your browser tab. The server is deliberately illustrative — the responsibilities below never move into Sheetwrite."
      description={description}
      eyebrow="CAPABILITY / COLLABORATION PROTOCOL"
      facts={[
        { label: "Clients", value: "Two, fully isolated" },
        { label: "Ordering", value: "Server-sequenced versions" },
        { label: "Durability", value: "IndexedDB pending queues" },
        { label: "Conflicts", value: "Conservative rebase" },
      ]}
      guideHref="/docs/guides/collaboration/"
      guideLabel="Read the collaboration guide"
      proof={[
        {
          title: "Convergence under ordering",
          detail:
            "Every commit is sequenced once by the server and fanned out; both grids — including live formulas — converge to identical state.",
        },
        {
          title: "Loss without double-apply",
          detail:
            "Drop an acknowledgement, retry with the same mutation id, and the server answers duplicate: applied exactly once, at the original version.",
        },
        {
          title: "Offline is a first-class state",
          detail:
            "An offline client keeps committing into its durable IndexedDB queue; reconnecting drains the queue in order through the same protocol.",
        },
        {
          title: "Gaps and conflicts stay explicit",
          detail:
            "Out-of-order broadcasts buffer until the gap closes; stale base versions surface as conflicts that recover through the documented rebase loop.",
        },
      ]}
      prompt="Take Bram offline, queue a few edits, and reconnect. Then hold a broadcast on Ana, commit from the server, and watch her conflict recover."
      slug="collaboration"
      sourcePath="docs/src/showcases/collaboration-protocol.ts"
      title="Two clients, one protocol, no lost updates."
    >
      <CollaborationShowcase />
    </ProofPage>
  );
}
