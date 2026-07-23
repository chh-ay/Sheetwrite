import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import VanillaWorkbench from "../showcases/VanillaWorkbench.js";
import vanillaStylesheet from "../styles/vanilla-workbench.css?url";

const description =
  "Create a real Grid, edit it, switch a construction-bound option, and tear it down. The adjacent instrument shows exactly which renderer, datasource, and workbook the host owns.";

/** Construction-bound options are deep-linkable; defaults stay out of the URL. */
interface VanillaSearch {
  renderer?: "worker";
  data?: "paged";
}

export const Route = createFileRoute("/vanilla")({
  validateSearch: (search: Record<string, unknown>): VanillaSearch => ({
    ...(search.renderer === "worker" ? { renderer: "worker" as const } : {}),
    ...(search.data === "paged" ? { data: "paged" as const } : {}),
  }),
  head: () => ({
    meta: pageMeta("Vanilla engine workbench — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: vanillaStylesheet }],
  }),
  component: VanillaWorkbenchRoute,
});

function VanillaWorkbenchRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ShowcasePage
      active="vanilla"
      description={description}
      eyebrow="VANILLA / ENGINE WORKBENCH"
      guide="/docs/frameworks/vanilla/"
      packageName="@sheetwrite/core"
      proof={[
        {
          title: "Explicit lifecycle",
          detail:
            "createWorkbench and destroy() bound every generation — no listeners, chrome, or canvas survive teardown.",
        },
        {
          title: "Construction-bound truth",
          detail:
            "Renderer and data path rebuild the grid and live in the URL; read-only flips on the running instance.",
        },
        {
          title: "Host-owned paging",
          detail:
            "The page source, its latency, and its abort path are host code; allocation stats read back from the store.",
        },
        {
          title: "Honest Worker fallback",
          detail:
            "A failed Worker boot emits renderer-fallback and keeps painting on the main thread — requested vs. active is always visible.",
        },
      ]}
      prompt="Edit B2, switch Main thread to Web Worker, then destroy and create the Grid. Watch the adjacent generation instrument prove each ownership boundary."
      sourcePath="docs/src/showcases/vanilla-workbench.ts"
      title="Own every Grid generation."
    >
      <VanillaWorkbench
        renderer={search.renderer ?? "canvas"}
        data={search.data ?? "columnar"}
        onSpecChange={(spec) =>
          void navigate({
            search: {
              ...(spec.renderer === "worker" ? { renderer: "worker" as const } : {}),
              ...(spec.data === "paged" ? { data: "paged" as const } : {}),
            },
            replace: true,
          })
        }
      />
    </ShowcasePage>
  );
}
