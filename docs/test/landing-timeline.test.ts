import { describe, expect, it } from "bun:test";
import { LANDING_TIMELINE, sampleLandingTimeline } from "../src/components/LandingSpreadsheet.js";

describe("landing visual timeline", () => {
  it("samples every named phase without timing drift", () => {
    expect(sampleLandingTimeline(LANDING_TIMELINE.enter.start).phase).toBe("enter");
    expect(sampleLandingTimeline(LANDING_TIMELINE.select.start).phase).toBe("select");
    expect(sampleLandingTimeline(LANDING_TIMELINE.dependencies.start).phase).toBe("dependencies");
    expect(sampleLandingTimeline(LANDING_TIMELINE.request.start).phase).toBe("request");
    expect(sampleLandingTimeline(LANDING_TIMELINE.resolve.start).phase).toBe("resolve");
    expect(sampleLandingTimeline(LANDING_TIMELINE.resolve.end)).toEqual({
      phase: "resolve",
      selection: 1,
      dependencies: 1,
      request: 1,
      resolved: 1,
    });
  });

  it("returns the complete static frame for reduced motion", () => {
    expect(sampleLandingTimeline(0, true)).toEqual({
      phase: "resolve",
      selection: 1,
      dependencies: 1,
      request: 1,
      resolved: 1,
    });
  });
});
