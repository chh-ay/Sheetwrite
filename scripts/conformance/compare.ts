import { canonicalJson } from "./normalize.js";
import type { ConformanceObservation, ConformanceResult, KnownDivergence } from "./types.js";

function orderedFloat(value: number): bigint {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  return bits >> 63n ? ~bits : bits | (1n << 63n);
}

export function compareResults(expected: ConformanceResult, actual: ConformanceResult): string[] {
  const differences: string[] = [];
  if (actual.type !== expected.type) {
    return [`type: expected ${expected.type}, received ${actual.type}`];
  }
  if (expected.type === "number") {
    const left = expected.value as number;
    const right = actual.value as number;
    const tolerance = expected.tolerance;
    let pass = Object.is(left, right);
    if (tolerance?.kind === "absolute") pass = Math.abs(left - right) <= tolerance.value;
    if (tolerance?.kind === "relative") {
      pass = Math.abs(left - right) <= tolerance.value * Math.max(1, Math.abs(left));
    }
    if (tolerance?.kind === "ulp") {
      const leftBits = orderedFloat(left);
      const rightBits = orderedFloat(right);
      pass =
        Number(leftBits < rightBits ? rightBits - leftBits : leftBits - rightBits) <=
        tolerance.value;
    }
    if (!pass) differences.push(`value: expected ${left}, received ${right}`);
  } else if (expected.type === "error") {
    if (actual.error !== expected.error) {
      differences.push(`error: expected ${expected.error}, received ${actual.error}`);
    }
  } else if (
    expected.type !== "blank" &&
    expected.type !== "unsupported" &&
    canonicalJson(actual.value) !== canonicalJson(expected.value)
  ) {
    differences.push(
      `value: expected ${canonicalJson(expected.value)}, received ${canonicalJson(actual.value)}`,
    );
  }
  for (const field of ["rows", "columns", "displayedText", "formula"] as const) {
    if (expected[field] !== undefined && actual[field] !== expected[field]) {
      differences.push(
        `${field}: expected ${String(expected[field])}, received ${String(actual[field])}`,
      );
    }
  }
  return differences;
}

export function compareReviewedObservation(
  expected: ConformanceResult,
  observation: ConformanceObservation,
  divergence?: KnownDivergence,
): string[] {
  const expectedDifferences = compareResults(expected, observation.result!);
  if (expectedDifferences.length === 0) return [];
  if (!divergence?.producers.includes(observation.producer)) return expectedDifferences;
  const alternateDifferences = compareResults(divergence.alternate, observation.result!);
  if (alternateDifferences.length === 0) return [];
  return [
    ...expectedDifferences,
    `declared alternate did not match (${alternateDifferences.join("; ")})`,
  ];
}
