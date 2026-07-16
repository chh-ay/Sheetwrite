import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { VueShowcaseIsland } from "../showcases/AdapterIslands.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";

const description =
  "Stream only the visible window of a million-row datasource, then watch paging, local edits, retries, and server acknowledgement in real time.";

export const Route = createFileRoute("/vue")({
  head: () => ({
    meta: pageMeta("Vue streaming workbook — Sheetwrite", description),
  }),
  component: VueShowcaseRoute,
});

function VueShowcaseRoute() {
  return (
    <ShowcasePage
      active="vue"
      description={description}
      eyebrow="VUE / STREAMING OPERATIONS"
      guide="/docs/frameworks/vue/"
      packageName="@sheetwrite/vue"
      proof={[
        {
          title: "Windowed datasource",
          detail: "One million rows are paged only for the visible range.",
        },
        {
          title: "Scroll to match",
          detail: "Datasource search reveals results inside the live grid.",
        },
        {
          title: "Durable sync",
          detail: "Mutation IDs survive delayed acknowledgement and retry.",
        },
        {
          title: "Vue bindings",
          detail: "Refs and events expose one Grid without copied document state.",
        },
      ]}
      prompt="Locate Tokyo, jump to row 500,000, or acknowledge a queued edit through the sync pipeline."
      sourcePath="docs/src/showcases/VueShowcase.ts"
      title="One million rows. Only the viewport in memory."
    >
      <VueShowcaseIsland />
    </ShowcasePage>
  );
}
