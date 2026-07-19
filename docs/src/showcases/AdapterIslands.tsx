import { useEffect, useRef } from "react";
import { mount, unmount } from "svelte";
import SvelteShowcase from "./SvelteShowcase.svelte";

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
