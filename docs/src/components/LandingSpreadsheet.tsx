import { useEffect, useRef } from "react";

export const LANDING_TIMELINE = {
  enter: { start: 0, end: 420 },
  select: { start: 420, end: 900 },
  dependencies: { start: 900, end: 1_600 },
  request: { start: 1_600, end: 2_300 },
  resolve: { start: 2_300, end: 3_000 },
} as const;

export type LandingTimelinePhase = keyof typeof LANDING_TIMELINE;

export interface LandingTimelineFrame {
  readonly phase: LandingTimelinePhase;
  readonly selection: number;
  readonly dependencies: number;
  readonly request: number;
  readonly resolved: number;
}

const TIMELINE_END = LANDING_TIMELINE.resolve.end;
const AMBIENT_CELLS = Array.from({ length: 96 }, (_, index) => index);
const COLUMN_HEADERS = ["A", "B", "C", "D"] as const;
const ROWS = [
  ["Region", "Units", "Rate", "Revenue"],
  ["North", "128", "$42", "$5,376"],
  ["West", "96", "$48", "$4,608"],
  ["South", "112", "$44", "$4,928"],
  ["East", "104", "$46", "$4,784"],
  ["Total", "440", "", "$19,696"],
] as const;

function progress(elapsed: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (elapsed - start) / (end - start)));
}

/** Deterministic visual state. Values are choreography time, never runtime performance. */
export function sampleLandingTimeline(
  elapsedMs: number,
  reducedMotion = false,
): LandingTimelineFrame {
  if (reducedMotion) {
    return { phase: "resolve", selection: 1, dependencies: 1, request: 1, resolved: 1 };
  }
  const elapsed = Math.min(TIMELINE_END, Math.max(0, elapsedMs));
  const phase = (Object.entries(LANDING_TIMELINE).find(
    ([, interval]) => elapsed >= interval.start && elapsed < interval.end,
  )?.[0] ?? "resolve") as LandingTimelinePhase;
  return {
    phase,
    selection: progress(elapsed, LANDING_TIMELINE.select.start, LANDING_TIMELINE.select.end),
    dependencies: progress(
      elapsed,
      LANDING_TIMELINE.dependencies.start,
      LANDING_TIMELINE.dependencies.end,
    ),
    request: progress(elapsed, LANDING_TIMELINE.request.start, LANDING_TIMELINE.request.end),
    resolved: progress(elapsed, LANDING_TIMELINE.resolve.start, LANDING_TIMELINE.resolve.end),
  };
}

function applyFrame(root: HTMLElement, elapsed: number, reducedMotion: boolean): void {
  const frame = sampleLandingTimeline(elapsed, reducedMotion);
  root.dataset.landingPhase = frame.phase;
  root.style.setProperty("--sw-landing-select", String(frame.selection));
  root.style.setProperty("--sw-landing-dependencies", String(frame.dependencies));
  root.style.setProperty("--sw-landing-request", String(frame.request));
  root.style.setProperty("--sw-landing-resolved", String(frame.resolved));
}

export function LandingSpreadsheet() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = media.matches;
    let intersecting = false;
    let started = false;
    let elapsed = 0;
    let previousTime = 0;
    let frameRequest = 0;
    let pointerRequest = 0;
    let pointerBoundsRequest = 0;

    let pointerX = 0.5;
    let pointerY = 0.5;
    let pointerBounds = root.getBoundingClientRect();

    const animations = Array.from(root.querySelectorAll<HTMLElement>("[data-landing-animate]"))
      .map((element) => {
        const phase = element.dataset.landingAnimate as LandingTimelinePhase | undefined;
        const interval = phase ? LANDING_TIMELINE[phase] : undefined;
        if (!interval || typeof element.animate !== "function") return null;
        const animation = element.animate(
          [
            { opacity: 0, transform: "translateY(4px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: Math.max(1, interval.end - interval.start),
            delay: interval.start,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
        animation.pause();
        return animation;
      })
      .filter((animation): animation is Animation => animation !== null);

    const seek = (time: number) => {
      applyFrame(root, time, reducedMotion);
      for (const animation of animations) animation.currentTime = time;
    };
    const shouldRun = () =>
      started && intersecting && document.visibilityState === "visible" && !reducedMotion;
    const tick = (time: number) => {
      frameRequest = 0;
      if (!shouldRun()) return;
      if (previousTime !== 0) elapsed = Math.min(TIMELINE_END, elapsed + time - previousTime);
      previousTime = time;
      seek(elapsed);
      if (elapsed < TIMELINE_END) frameRequest = requestAnimationFrame(tick);
      else root.dataset.landingRunning = "false";
    };
    const resume = () => {
      if (!shouldRun() || frameRequest !== 0 || elapsed >= TIMELINE_END) return;
      previousTime = 0;
      root.dataset.landingRunning = "true";
      frameRequest = requestAnimationFrame(tick);
    };
    const pause = () => {
      if (frameRequest !== 0) cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      previousTime = 0;
      root.dataset.landingRunning = "false";
    };
    const replay = () => {
      elapsed = reducedMotion ? TIMELINE_END : 0;
      started = true;
      seek(elapsed);
      resume();
    };
    const updatePointerBounds = () => {
      pointerBounds = root.getBoundingClientRect();
    };
    const schedulePointerBoundsUpdate = () => {
      if (pointerBoundsRequest !== 0) return;
      pointerBoundsRequest = requestAnimationFrame(() => {
        pointerBoundsRequest = 0;
        updatePointerBounds();
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = Math.min(
        1,
        Math.max(0, (event.clientX - pointerBounds.left) / Math.max(1, pointerBounds.width)),
      );
      pointerY = Math.min(
        1,
        Math.max(0, (event.clientY - pointerBounds.top) / Math.max(1, pointerBounds.height)),
      );
      if (pointerRequest !== 0) return;
      pointerRequest = requestAnimationFrame(() => {
        pointerRequest = 0;
        root.style.setProperty("--sw-pointer-x", `${(pointerX * 100).toFixed(2)}%`);
        root.style.setProperty("--sw-pointer-y", `${(pointerY * 100).toFixed(2)}%`);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        pause();
        elapsed = TIMELINE_END;
        seek(elapsed);
      } else {
        elapsed = 0;
        seek(elapsed);
        resume();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting === true && entry.intersectionRatio >= 0.4;
        if (intersecting && !started) {
          started = true;
          elapsed = reducedMotion ? TIMELINE_END : 0;
          seek(elapsed);
        }
        if (intersecting) resume();
        else pause();
      },
      { threshold: [0, 0.4, 1] },
    );
    const resizeObserver = new ResizeObserver(updatePointerBounds);

    root.addEventListener("pointerenter", updatePointerBounds, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root
      .querySelector<HTMLButtonElement>("[data-landing-replay]")
      ?.addEventListener("click", replay);
    document.addEventListener("visibilitychange", onVisibilityChange);
    media.addEventListener("change", onMotionChange);
    window.addEventListener("scroll", schedulePointerBoundsUpdate, { passive: true });
    observer.observe(root);
    resizeObserver.observe(root);
    seek(reducedMotion ? TIMELINE_END : 0);

    return () => {
      pause();
      if (pointerRequest !== 0) cancelAnimationFrame(pointerRequest);
      if (pointerBoundsRequest !== 0) cancelAnimationFrame(pointerBoundsRequest);
      observer.disconnect();
      resizeObserver.disconnect();
      root.removeEventListener("pointerenter", updatePointerBounds);
      root.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", schedulePointerBoundsUpdate);
      root
        .querySelector<HTMLButtonElement>("[data-landing-replay]")
        ?.removeEventListener("click", replay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      media.removeEventListener("change", onMotionChange);
      for (const animation of animations) animation.cancel();
    };
  }, []);

  return (
    <div
      className="sw-product-story"
      data-landing-phase="resolve"
      data-landing-running="false"
      data-testid="landing-product-story"
      ref={rootRef}
      style={
        {
          "--sw-landing-select": 1,
          "--sw-landing-dependencies": 1,
          "--sw-landing-request": 1,
          "--sw-landing-resolved": 1,
          "--sw-pointer-x": "50%",
          "--sw-pointer-y": "50%",
        } as React.CSSProperties
      }
    >
      <div aria-hidden="true" className="sw-product-story__field">
        {AMBIENT_CELLS.map((cell) => (
          <i key={cell} />
        ))}
      </div>
      <figure className="sw-workbook-stage" data-hero-panel>
        <header className="sw-workbook-stage__bar">
          <span aria-hidden="true" className="sw-workbook-stage__lights">
            <i />
            <i />
            <i />
          </span>
          <strong>Revenue model</strong>
          <span>Illustrative product view</span>
        </header>
        <div className="sw-workbook-stage__formula" data-landing-animate="enter">
          <span aria-hidden="true">fx</span>
          <code>=SUM(D2:D5)</code>
          <span aria-hidden="true" className="sw-workbook-stage__status" />
        </div>
        <div aria-hidden="true" className="sw-workbook-stage__grid">
          <span aria-hidden="true" className="sw-sheet-corner" />
          {COLUMN_HEADERS.map((header) => (
            <span aria-hidden="true" className={header === "D" ? "is-active" : ""} key={header}>
              {header}
            </span>
          ))}
          {ROWS.map((row, rowIndex) => (
            <div className="sw-sheet-row" key={row[0]}>
              <span aria-hidden="true" className={rowIndex === 5 ? "is-active" : ""}>
                {rowIndex + 1}
              </span>
              {COLUMN_HEADERS.map((column, colIndex) => {
                const value = row[colIndex];
                const precedent = column === "D" && rowIndex > 0 && rowIndex < 5;
                const selected = column === "D" && rowIndex === 5;
                return (
                  <span
                    className={`${precedent ? "is-precedent" : ""} ${selected ? "is-selected" : ""}`}
                    data-landing-animate={
                      selected ? "resolve" : precedent ? "dependencies" : undefined
                    }
                    key={column}
                  >
                    {value || " "}
                  </span>
                );
              })}
            </div>
          ))}
          <div aria-hidden="true" className="sw-workbook-stage__reference-range" />
        </div>
        <footer className="sw-workbook-stage__foot">
          <span>
            <i /> Resident window
          </span>
          <span>
            <i /> Cached rows
          </span>
          <span className="sw-workbook-stage__engine">work sent to the calculation engine</span>
        </footer>
        <figcaption>
          A static Sheetwrite composition: formula dependencies, selection, and resident-window
          state.
        </figcaption>
        <button data-landing-replay type="button">
          Replay visual explanation
        </button>
      </figure>
    </div>
  );
}
