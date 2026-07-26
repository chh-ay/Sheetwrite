import { describe, expect, it } from "bun:test";
import { changesetComparisonFromBaseRef } from "./changeset-ci.js";

const CASES = [
  { githubBaseRef: "0.4.0", expectedBaseRef: "origin/0.4.0" },
  { githubBaseRef: "develop", expectedBaseRef: "origin/develop" },
  { githubBaseRef: "release/next", expectedBaseRef: "origin/release/next" },
  { githubBaseRef: "", expectedBaseRef: "origin/develop" },
  { githubBaseRef: undefined, expectedBaseRef: "origin/develop" },
] as const;

describe("changeset comparison base", () => {
  for (const { githubBaseRef, expectedBaseRef } of CASES) {
    it(`uses ${expectedBaseRef} for ${githubBaseRef ?? "an absent GITHUB_BASE_REF"}`, () => {
      expect(changesetComparisonFromBaseRef(githubBaseRef)).toEqual({
        baseRef: expectedBaseRef,
        diffRange: `${expectedBaseRef}...HEAD`,
        sinceArgument: `--since=${expectedBaseRef}`,
      });
    });
  }
});
