import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { SvelteShowcaseIsland } from "../showcases/AdapterIslands.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import svelteWorkbenchStylesheet from "../styles/svelte-workbench.css?url";

const description =
  "Take a live dispatch board through signal loss: edit real tickets offline, keep every change in IndexedDB, then reconnect and watch the authoritative queue drain.";

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
      eyebrow="SVELTE / OFFLINE FIELD WORK"
      guide="/docs/frameworks/svelte/"
      packageName="@sheetwrite/svelte"
      proof={[
        {
          title: "Offline ticket edits",
          detail: "The live Grid remains editable while the connection is down.",
        },
        {
          title: "Durable outbox",
          detail: "IndexedDB owns each edit before reconnect drains it in order.",
        },
        {
          title: "Causal collaboration",
          detail: "Presence, remote commits, queue state, and server versions stay live.",
        },
        {
          title: "Explicit recovery",
          detail: "Version conflicts and remount restoration remain inspectable on demand.",
        },
      ]}
      prompt="Switch Offline → edit a ticket → see it enter the durable outbox → reconnect and watch dispatch acknowledge it."
      sourcePath="docs/src/showcases/SvelteShowcase.svelte"
      title="Dispatch keeps moving without signal."
    >
      <SvelteShowcaseIsland />
    </ShowcasePage>
  );
}
