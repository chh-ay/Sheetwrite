import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "../components/DocsShell.js";
import { pageMeta } from "../lib/seo.js";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite documentation",
      "Install Sheetwrite, choose a framework adapter, and build against its runtime, data, interaction, and API contracts.",
    ),
  }),
  component: DocsOverview,
});

function DocsOverview() {
  return (
    <DocsShell
      activeHref="/docs/"
      description="Install the engine, choose an adapter, and build against explicit runtime, data, interaction, and delivery contracts."
      title="Build spreadsheets you still own."
    >
      <p className="sw-landing-lead">
        Sheetwrite is a canvas spreadsheet engine with a Rust/WASM data core and first-party
        Vanilla, React, Vue, and Svelte adapters. The host application owns document state,
        persistence, collaboration, and product chrome.
      </p>

      <section>
        <h2>Start with the runtime contract</h2>
        <div className="sw-landing-grid">
          <a href="/docs/start/installation/">
            <strong>Install Sheetwrite</strong>
            <span>Package boundaries, CSS entry points, and one-time WASM initialization.</span>
          </a>
          <a href="/docs/start/first-grid/">
            <strong>Create the first grid</strong>
            <span>Mount a typed workbook, own its lifecycle, and commit a real edit.</span>
          </a>
          <a href="/docs/concepts/runtime-ownership/">
            <strong>Understand ownership</strong>
            <span>
              Separate the host, adapter, Grid, Store, renderer, and WASM responsibilities.
            </span>
          </a>
        </div>
      </section>

      <section>
        <h2>Choose the host integration</h2>
        <div className="sw-landing-grid sw-landing-grid--frameworks">
          <a href="/docs/frameworks/vanilla/">
            <strong>Vanilla</strong>
            <span>Imperative lifecycle and complete Grid control.</span>
          </a>
          <a href="/docs/frameworks/react/">
            <strong>React</strong>
            <span>Stable refs, prop updates, and explicit readiness.</span>
          </a>
          <a href="/docs/frameworks/vue/">
            <strong>Vue</strong>
            <span>Component refs, kebab-case events, and datasource windows.</span>
          </a>
          <a href="/docs/frameworks/svelte/">
            <strong>Svelte</strong>
            <span>Component bindings, callback props, and teardown.</span>
          </a>
        </div>
      </section>

      <section>
        <h2>See it running</h2>
        <div className="sw-landing-grid sw-landing-grid--frameworks">
          <a href="/vanilla/">
            <strong>Vanilla showcase</strong>
            <span>An imperative workbook with host-owned chrome.</span>
          </a>
          <a href="/react/">
            <strong>React showcase</strong>
            <span>100,000 sales rows behind an operating view.</span>
          </a>
          <a href="/vue/">
            <strong>Vue showcase</strong>
            <span>A million-row workbook on a paged datasource.</span>
          </a>
          <a href="/svelte/">
            <strong>Svelte showcase</strong>
            <span>Live formulas composed from components.</span>
          </a>
        </div>
      </section>

      <section>
        <h2>Build against documented behavior</h2>
        <ul className="sw-landing-links">
          <li>
            <a href="/docs/guides/configuration/">Configure the grid and built-in shell</a>
          </li>
          <li>
            <a href="/docs/guides/data-operations/">Read, mutate, validate, and search data</a>
          </li>
          <li>
            <a href="/docs/guides/persistence/">Persist snapshots and pending operations</a>
          </li>
          <li>
            <a href="/docs/guides/collaboration/">Coordinate versioned collaboration</a>
          </li>
          <li>
            <a href="/docs/api/">Browse every generated package entry point</a>
          </li>
        </ul>
      </section>
    </DocsShell>
  );
}
