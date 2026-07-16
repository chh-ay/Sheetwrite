import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import { DocsShell } from "../components/DocsShell.js";
import {
  documentComponentForSplat,
  documentForSplat,
  normalizeDocumentHref,
} from "../lib/content.js";

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const document = await documentForSplat(params._splat);
    if (document === undefined) throw notFound();
    return { title: document.title, description: document.description };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Documentation"} — Sheetwrite` },
      { name: "description", content: loaderData?.description ?? "Sheetwrite documentation." },
    ],
  }),
  component: DocumentRoute,
  notFoundComponent: DocumentNotFound,
});

function DocumentRoute() {
  const params = Route.useParams();
  const metadata = Route.useLoaderData();
  const Content = documentComponentForSplat(params._splat);
  if (Content === undefined) return <DocumentNotFound />;

  return (
    <DocsShell
      activeHref={normalizeDocumentHref(params._splat)}
      description={metadata.description}
      title={metadata.title}
    >
      <Suspense fallback={<p className="sw-document-loading">Loading documentation…</p>}>
        <Content />
      </Suspense>
    </DocsShell>
  );
}

function DocumentNotFound() {
  return (
    <DocsShell
      activeHref=""
      description="The requested documentation page does not exist."
      title="Page not found"
    >
      <p>
        Return to <a href="/docs/start/installation/">installation</a> or search the documentation.
      </p>
    </DocsShell>
  );
}
