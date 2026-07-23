import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import stylesheet from "../styles/showcase-host-rows.css?url";

const HostRowsShowcase = lazy(() => import("../showcases/HostRowsShowcase.js"));

export const Route = createFileRoute("/showcases/host-rows")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Keep app-owned entity rows in step with committed Sheetwrite changes.",
      },
      { title: "Host-owned rows — Sheetwrite" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: HostRowsRoute,
});

function HostRowsRoute() {
  return (
    <Suspense fallback={<main>Loading host rows…</main>}>
      <HostRowsShowcase />
    </Suspense>
  );
}
