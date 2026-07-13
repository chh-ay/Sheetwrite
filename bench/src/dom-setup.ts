/**
 * Headless DOM bootstrap for the data-layer benchmark.
 *
 * Handsontable is a DOM grid: it cannot be constructed without a `document`,
 * and even "data" operations route through its rendering/index machinery. To
 * measure it outside a browser we register happy-dom's globals *before*
 * Handsontable is imported, then patch the handful of browser APIs happy-dom
 * does not implement that Handsontable touches on boot.
 *
 * Importing this module for its side effects MUST come first — keep it as the
 * first import in any entry that loads Handsontable headlessly.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof globalThis.window === "undefined") GlobalRegistrator.register();

// happy-dom leaves `window.frameElement` as `undefined`, but Handsontable's
// `getParentWindow` relies on the spec value `null` for a top-level window —
// otherwise its `while (parentWindow !== null)` event-binding loop dereferences
// `undefined`. Pin it to `null` so Handsontable treats this as the top frame.
Object.defineProperty(window, "frameElement", { value: null, configurable: true, writable: true });

interface ResizeObserverLike {
  observe(): void;
  unobserve(): void;
  disconnect(): void;
}

// happy-dom omits ResizeObserver; Handsontable's autoColumnSize/viewport code
// instantiates one. A no-op observer is sufficient for headless data work.
if (typeof globalThis.ResizeObserver === "undefined") {
  class NoopResizeObserver implements ResizeObserverLike {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: NoopResizeObserver,
    configurable: true,
  });
}

// happy-dom's matchMedia can be absent; Handsontable queries it for theming.
if (typeof globalThis.matchMedia === "undefined") {
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
