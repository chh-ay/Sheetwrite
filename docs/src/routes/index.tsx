import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="sw-proof-shell">
      <p className="sw-eyebrow">Sheetwrite documentation migration</p>
      <h1>Host-owned spreadsheets, documented precisely.</h1>
      <p>
        Read the contracts behind the canvas renderer, Rust/WASM data engine, and framework
        adapters.
      </p>
      <a className="sw-button" href="/docs/start/installation/">
        Read the documentation
      </a>
    </main>
  );
}
