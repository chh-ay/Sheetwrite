import { useEffect, useRef } from "react";
import { mount, unmount } from "svelte";
import { createApp } from "vue";
import SvelteShowcase from "./SvelteShowcase.svelte";
import VueShowcase from "./VueShowcase.js";

export function VueShowcaseIsland() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current === null) return;
    const app = createApp(VueShowcase);
    app.mount(host.current);
    return () => app.unmount();
  }, []);

  return <div className="sw-framework-island" data-island="vue" ref={host} />;
}

export function SvelteShowcaseIsland() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current === null) return;
    const component = mount(SvelteShowcase, { target: host.current });
    return () => {
      void unmount(component);
    };
  }, []);

  return <div className="sw-framework-island" data-island="svelte" ref={host} />;
}
