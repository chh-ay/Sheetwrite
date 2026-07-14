import { describe, expect, it } from "bun:test";
import {
  type AuditAllowance,
  type AuditCommandResult,
  evaluateAuditPolicy,
} from "./dependency-audit.js";

const TODAY = "2026-07-14";

function auditResult(
  severity: "low" | "moderate" | "high" | "critical",
  exitCode = 1,
): AuditCommandResult {
  return {
    exitCode,
    stderr: "bun audit v1.3.14",
    stdout: JSON.stringify({
      vulnerable: [
        {
          id: 123,
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          title: "Fixture vulnerability",
          severity,
        },
      ],
    }),
  };
}

const REVIEWED_ALLOWANCE: AuditAllowance = {
  advisory: "GHSA-AAAA-BBBB-CCCC",
  package: "vulnerable",
  owner: "security@example.invalid",
  reason: "Fixture has no reachable affected call path while the upstream fix is prepared.",
  expires: "2026-08-01",
};

describe("JavaScript dependency audit policy", () => {
  it("accepts a clean audit", () => {
    const result = evaluateAuditPolicy({ exitCode: 0, stdout: "{}", stderr: "" }, [], TODAY);
    expect(result.findings).toEqual([]);
  });

  it("reports reviewed low and moderate findings without blocking", () => {
    const result = evaluateAuditPolicy(auditResult("moderate"), [], TODAY);
    expect(result.nonBlockingFindings).toHaveLength(1);
    expect(result.allowedBlockingFindings).toEqual([]);
  });

  it("rejects an unowned high or critical finding", () => {
    expect(() => evaluateAuditPolicy(auditResult("high"), [], TODAY)).toThrow(
      "Unallowlisted high/critical",
    );
    expect(() => evaluateAuditPolicy(auditResult("critical"), [], TODAY)).toThrow(
      "Unallowlisted high/critical",
    );
  });

  it("accepts an owned, reasoned, unexpired exact allowance", () => {
    const result = evaluateAuditPolicy(auditResult("high"), [REVIEWED_ALLOWANCE], TODAY);
    expect(result.allowedBlockingFindings).toHaveLength(1);
  });

  it("rejects an expired allowance", () => {
    expect(() =>
      evaluateAuditPolicy(
        auditResult("high"),
        [{ ...REVIEWED_ALLOWANCE, expires: "2026-07-13" }],
        TODAY,
      ),
    ).toThrow("expired on 2026-07-13");
  });

  it("fails closed on malformed audit output", () => {
    expect(() =>
      evaluateAuditPolicy({ exitCode: 1, stdout: "not-json", stderr: "" }, [], TODAY),
    ).toThrow("malformed JSON");
    expect(() =>
      evaluateAuditPolicy(
        { exitCode: 1, stdout: JSON.stringify({ vulnerable: [{ severity: "high" }] }), stderr: "" },
        [],
        TODAY,
      ),
    ).toThrow("invalid schema");
  });

  it("fails closed when the audit service is unavailable", () => {
    expect(() =>
      evaluateAuditPolicy(
        { exitCode: 1, stdout: "", stderr: "registry request timed out" },
        [],
        TODAY,
      ),
    ).toThrow("produced no JSON: registry request timed out");
  });
});
