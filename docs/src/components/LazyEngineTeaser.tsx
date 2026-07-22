import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const EngineLandingTeaser = lazy(() => import("./EngineLandingTeaser.js"));

/**
 * Keeps the landing page's below-hero slot stable without importing the live
 * engine view. The preview is armed only after a real scroll reaches the slot.
 */
export function LazyEngineTeaser() {
  const slotRef = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let userScrolled = window.scrollY > 0;
    let visible = false;
    const arm = () => {
      userScrolled = true;
      if (visible) setArmed(true);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible && userScrolled) setArmed(true);
      },
      { rootMargin: "0px" },
    );
    observer.observe(slot);
    window.addEventListener("scroll", arm, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", arm);
    };
  }, []);

  return (
    <section
      aria-labelledby="landing-engine-title"
      className="sw-landing-engine-slot"
      ref={slotRef}
    >
      {armed ? (
        <Suspense
          fallback={
            <div className="sw-landing-engine-slot__placeholder" role="status">
              Loading the live engine view…
            </div>
          }
        >
          <EngineLandingTeaser />
        </Suspense>
      ) : (
        <div className="sw-landing-engine-slot__reserved">
          <p className="sw-section-eyebrow">A closer look, when you want it</p>
          <h2 id="landing-engine-title">See one real edit travel through the Grid.</h2>
          <p>
            Scroll here to load the small preview. The full view opens only when you choose it, so
            the landing page stays quick.
          </p>
          <Link className="sw-landing-engine-slot__link" to="/showcases/engine/">
            Open the live engine view →
          </Link>
        </div>
      )}
    </section>
  );
}
