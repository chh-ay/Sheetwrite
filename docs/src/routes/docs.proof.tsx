import { createFileRoute } from "@tanstack/react-router";
import Proof from "../content/proof.mdx";

export const Route = createFileRoute("/docs/proof")({
  head: () => ({ meta: [{ title: "MDX and hover proof · Sheetwrite" }] }),
  component: ProofPage,
});

function ProofPage() {
  return (
    <main className="sw-proof-shell sw-prose" data-pagefind-body>
      <Proof />
    </main>
  );
}
