import EngineLandingTeaser from "./EngineLandingTeaser.js";

/**
 * Keeps the landing page's engine callout static and engine-free. The live
 * Grid and its WASM runtime are loaded only after the visitor follows the CTA.
 */
export function LazyEngineTeaser() {
  return (
    <section aria-labelledby="landing-engine-title" className="sw-landing-engine-slot">
      <EngineLandingTeaser />
    </section>
  );
}
