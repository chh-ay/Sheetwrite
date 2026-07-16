import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="sw-proof-shell">
      <p className="sw-eyebrow">Sheetwrite documentation migration</p>
      <h1>Host-owned spreadsheets, documented precisely.</h1>
      <p>
        This TanStack Start route seeds the static crawler and proves that MDX documentation can
        ship as indexed HTML.
      </p>
      <Link className="sw-button" to="/docs/proof">
        Open the MDX proof
      </Link>
    </main>
  );
}
