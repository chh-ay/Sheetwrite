import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import stylesheet from "../styles/showcase-engine.css?url";

const EngineShowcase = lazy(() => import("../showcases/EngineShowcase.js"));

const description =
  "Edit a live 50,000-row regional forecast in a real Grid while public datasource, formula, resource, drawing, and host-save evidence stays aligned beside it.";

export const Route = createFileRoute("/showcases/engine")({
  head: () => ({
    meta: [
      { name: "description", content: description },
      { title: "Live financial Grid and engine evidence — Sheetwrite" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: EngineRoute,
});

function EngineRoute() {
  return (
    <Suspense
      fallback={
        <main className="sw-engine-loading" data-testid="engine-route-loading">
          <p>Loading the live engine view…</p>
        </main>
      }
    >
      <EngineShowcase />
    </Suspense>
  );
}
