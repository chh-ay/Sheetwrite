import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import ReactShowcase from "../showcases/ReactShowcase.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";

const description =
  "Filter, search, aggregate, and render 100,000 sales rows from React state while Rust/WASM keeps the hot path out of the component tree.";

export const Route = createFileRoute("/react")({
  head: () => ({
    meta: pageMeta("React analytics workbook — Sheetwrite", description),
  }),
  component: ReactShowcaseRoute,
});

function ReactShowcaseRoute() {
  return (
    <ShowcasePage
      active="react"
      description={description}
      eyebrow="REACT / ANALYTICS WORKBOOK"
      guide="/docs/frameworks/react/"
      packageName="@sheetwrite/react"
      proof={[
        { title: "Bulk ingest", detail: "100,000 columnar rows enter WASM in one pass." },
        {
          title: "Query engine",
          detail: "Search, sort, filter, and aggregate use the live Grid API.",
        },
        {
          title: "Renderer control",
          detail: "Canvas and Worker selection flows through adapter props.",
        },
        {
          title: "React events",
          detail: "Transactions surface through callbacks and an imperative ref.",
        },
      ]}
      prompt="Filter a market, search an account, or move rendering onto a Web Worker."
      sourcePath="docs/src/showcases/ReactShowcase.tsx"
      title="A 100,000-row operating view, driven by React."
    >
      <ReactShowcase />
    </ShowcasePage>
  );
}
