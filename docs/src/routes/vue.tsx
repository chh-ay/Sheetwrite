import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { createApp } from "vue";
import { pageMeta } from "../lib/seo.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import VueWorkbench from "../showcases/VueWorkbench.js";
import vueWorkbenchStylesheet from "../styles/vue-workbench.css?url";

const description =
  "Reject a protected workbook edit, inspect the exact policy issue, authorize the finance role, and commit the same mutation through Vue-owned state.";

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
          title: "Policy result beside the mutation",
          detail:
            "The selected cell, access rule, rejection, role change, and accepted commit stay in one causal view.",
        },
        {
          title: "Vue-native authority",
          detail:
            "Reactive props drive the published adapter while every workbook change crosses the real Grid API.",
        },
        {
          title: "Attached workbook tools",
          detail:
            "The selected-cell note editor and adapter event feed stay accessible while native tabs own sheet lifecycle.",
        },
        {
          title: "Host acknowledgement",
          detail: "Accepted edits enter the real pending queue before the host version advances.",
        },
      ]}
      prompt="Attempt the protected G1 override as Reviewer, inspect the rejection, authorize Finance lead, then commit the same edit."
      sourcePath="docs/src/showcases/VueWorkbench.ts"
      title="A governed edit, from rejection to commit."
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
