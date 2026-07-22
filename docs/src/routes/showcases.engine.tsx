import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import stylesheet from "../styles/showcase-engine.css?url";

const EngineShowcase = lazy(() => import("../showcases/EngineShowcase.js"));

const description =
  "A live paged formula sheet where Grid edits, row requests, checked results, drawing choices, and host saves stay readable in one view.";

export const Route = createFileRoute("/showcases/engine")({
  head: () => ({
    meta: [
      { name: "description", content: description },
      { title: "Live engine view — Sheetwrite" },
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
