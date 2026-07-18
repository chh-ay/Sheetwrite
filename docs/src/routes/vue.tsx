import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { createApp } from "vue";
import { pageMeta } from "../lib/seo.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import VueWorkbench from "../showcases/VueWorkbench.js";
import vueWorkbenchStylesheet from "../styles/vue-workbench.css?url";

const description =
  "Run a governed revenue pipeline through one Vue component: reactive configuration, validation and protection, cell notes, sheet operations, and live host persistence state.";

export const Route = createFileRoute("/vue")({
  head: () => ({
    meta: pageMeta("Vue business workbench — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: vueWorkbenchStylesheet }],
  }),
  component: VueWorkbenchRoute,
});

function VueWorkbenchRoute() {
  return (
    <ShowcasePage
      active="vue"
      description={description}
      eyebrow="VUE / BUSINESS WORKFLOW"
      guide="/docs/frameworks/vue/"
      packageName="@sheetwrite/vue"
      proof={[
        {
          title: "Reactive configuration",
          detail: "Role, read-only, and mutation policy are Vue state bound to adapter props.",
        },
        {
          title: "Validation and protection",
          detail: "Rejected edits surface as structured issues, never silent failures.",
        },
        {
          title: "Notes and workbook workflow",
          detail: "Cell notes, sheet metadata, and workbook operations use the public Grid API.",
        },
        {
          title: "Host persistence state",
          detail: "Pending commits, server versions, and acknowledgements mirror into Vue refs.",
        },
      ]}
      prompt="Enter an out-of-policy amount, unlock the protected quarter as finance lead, note a cell, or sync pending edits to the host adapter."
      sourcePath="docs/src/showcases/VueWorkbench.ts"
      title="Governed data entry, driven by Vue state."
    >
      <VueWorkbenchIsland />
    </ShowcasePage>
  );
}

function VueWorkbenchIsland() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current === null) return;
    const app = createApp(VueWorkbench);
    app.mount(host.current);
    return () => app.unmount();
  }, []);

  return <div className="sw-framework-island" data-island="vue" ref={host} />;
}
