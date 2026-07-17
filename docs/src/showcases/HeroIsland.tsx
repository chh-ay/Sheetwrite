import type { ComponentType } from "react";
import { useEffect, useState } from "react";

/** Row count shared with the lazy workbook module so the skeleton copy matches. */
export const HERO_ROWS = 320;

/**
 * Client island for the landing hero workbook. The real React adapter (and the
 * WASM engine behind it) loads as its own chunk after first paint, behind a
 * static grid skeleton, so the prerendered hero never jumps and the landing
 * route's initial bundle stays light.
 */
export function HeroWorkbookIsland() {
  const [Workbook, setWorkbook] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("./HeroShowcase.js").then(
      (mod) => {
        if (alive) setWorkbook(() => mod.default);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (Workbook !== null) return <Workbook />;

  return (
    <>
      <div className="sw-hero-stage__viewport">
        <div aria-hidden="true" className="sw-hero-stage__skeleton" />
        <p className="sw-hero-stage__boot" role="status">
          {failed ? "Demo unavailable — open a showcase below" : "Loading the live workbook…"}
        </p>
      </div>
      <footer className="sw-hero-stage__status">
        <span>{HERO_ROWS} rows</span>
        <span>
          Σ FY26 <strong>—</strong>
        </span>
        <span>Booting the Rust/WASM engine…</span>
      </footer>
    </>
  );
}
