import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { mount, unmount } from "svelte";
import { createApp } from "vue";
import ReactFixture from "../test-fixtures/framework-lifecycle/ReactFixture.js";
import SvelteFixture from "../test-fixtures/framework-lifecycle/SvelteFixture.svelte";
import VueFixture from "../test-fixtures/framework-lifecycle/VueFixture.js";

export const Route = createFileRoute("/test/framework-lifecycle/$framework")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: FrameworkLifecycleRoute,
});

function FrameworkLifecycleRoute() {
  const { framework } = Route.useParams();
  return (
    <div className="sw-test-fixture">
      {framework === "react" ? <ReactFixture /> : null}
      {framework === "vue" ? <VueFixtureIsland /> : null}
      {framework === "svelte" ? <SvelteFixtureIsland /> : null}
      {framework !== "react" && framework !== "vue" && framework !== "svelte" ? (
        <main>Unknown framework fixture</main>
      ) : null}
    </div>
  );
}

function VueFixtureIsland() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current === null) return;
    const app = createApp(VueFixture);
    app.mount(host.current);
    return () => app.unmount();
  }, []);
  return <div ref={host} />;
}

function SvelteFixtureIsland() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current === null) return;
    const component = mount(SvelteFixture, { target: host.current });
    return () => {
      void unmount(component);
    };
  }, []);
  return <div ref={host} />;
}
