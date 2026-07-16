import { createFileRoute } from "@tanstack/react-router";
import Proof from "../content/proof.mdx";

export const Route = createFileRoute("/docs/proof")({
  // Internal MDX/hover pipeline proof; not a reader-facing document.
  head: () => ({
    meta: [
      { title: "MDX and hover proof · Sheetwrite" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProofPage,
});

function ProofPage() {
  return (
    <main className="sw-proof-shell sw-prose" data-pagefind-body>
      <Proof />
    </main>
  );
}
