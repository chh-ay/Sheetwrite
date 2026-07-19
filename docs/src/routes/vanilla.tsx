import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import VanillaWorkbench from "../showcases/VanillaWorkbench.js";
import vanillaStylesheet from "../styles/vanilla-workbench.css?url";

const description =
  "Framework-free host code owns create, reset, and destroy: renderer selection, Worker fallback, a host-served page source, and workbook operations, all through the public core API.";

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
      prompt="Switch the renderer to Web Worker and the data path to Paged source — then destroy and re-create the grid. The URL follows the construction options."
      sourcePath="docs/src/showcases/vanilla-workbench.ts"
      title="Drive the engine without an adapter."
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
