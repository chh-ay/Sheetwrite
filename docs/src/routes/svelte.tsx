import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { SvelteShowcaseIsland } from "../showcases/AdapterIslands.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import svelteWorkbenchStylesheet from "../styles/svelte-workbench.css?url";

const description =
  "Queue edits offline in a durable IndexedDB outbox, reconnect to drain them through host persistence, and recover a real base-version conflict — with live presence — inside one Svelte component.";

export const Route = createFileRoute("/svelte")({
  head: () => ({
    meta: pageMeta("Svelte offline workbench — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: svelteWorkbenchStylesheet }],
  }),
  component: SvelteShowcaseRoute,
});

function SvelteShowcaseRoute() {
  return (
    <ShowcasePage
      active="svelte"
      description={description}
      eyebrow="SVELTE / OFFLINE & COLLABORATION"
      guide="/docs/frameworks/svelte/"
      packageName="@sheetwrite/svelte"
      proof={[
        {
          title: "Durable offline queue",
          detail: "Edits persist to an IndexedDB outbox before any network send.",
        },
        {
          title: "Reconnect drain & conflicts",
          detail: "Queued work drains in order; stale bases surface as explicit conflicts.",
        },
        {
          title: "Presence & remote commits",
          detail: "Collaborator selections and server-sequenced edits land on the live grid.",
        },
        {
          title: "Remount persistence",
          detail: "Destroying and remounting the island restores pending work from disk.",
        },
      ]}
      prompt="Go offline, log two field updates, let HQ commit concurrent work, then reconnect and merge — or remount the island mid-queue."
      sourcePath="docs/src/showcases/SvelteShowcase.svelte"
      title="Offline-first collaboration, held in Svelte state."
    >
      <SvelteShowcaseIsland />
    </ShowcasePage>
  );
}
