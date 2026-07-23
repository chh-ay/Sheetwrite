import { readFile } from "node:fs/promises";
import { persistCapture, readBoundedResponse } from "../capture.js";
import { canonicalJson, isNonemptyString, isObject, sha256 } from "../normalize.js";
import { rejectUnknownKeys, scanSecrets, validateResult } from "../schema.js";
import type { CaptureArtifact, ConformanceCorpus } from "../types.js";

const CAPTURE_KEYS = [
  "protocol",
  "producer",
  "producerVersion",
  "capturedAt",
  "scriptSha256",
  "calculation",
  "observations",
] as const;
const CAPTURE_OBSERVATION_KEYS = ["caseId", "result"] as const;

export function validateExcelCapture(
  value: unknown,
  corpus: ConformanceCorpus,
  producerVersion: string,
  scriptSha256: string,
): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return ["capture: expected object"];
  rejectUnknownKeys(value, CAPTURE_KEYS, "capture", issues);
  if (value.protocol !== 1) issues.push("capture.protocol: expected 1");
  if (value.producer !== "excel-web") issues.push("capture.producer: expected excel-web");
  if (value.producerVersion !== producerVersion) {
    issues.push("capture.producerVersion: response does not match requested version");
  }
  if (value.scriptSha256 !== scriptSha256) issues.push("capture.scriptSha256: runner drift");
  if (value.calculation !== "fullRebuild") issues.push("capture.calculation: fullRebuild required");
  if (!isNonemptyString(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt))) {
    issues.push("capture.capturedAt: invalid timestamp");
  }
  const expectedIds = corpus.cases
    .filter((entry) => entry.kind === "formula")
    .map((entry) => entry.id);
  if (!Array.isArray(value.observations)) {
    return [...issues, "capture.observations: expected array"];
  }
  const receivedIds: string[] = [];
  value.observations.forEach((observation, index) => {
    if (!isObject(observation)) {
      issues.push(`capture.observations[${index}]: expected object`);
      return;
    }
    rejectUnknownKeys(
      observation,
      CAPTURE_OBSERVATION_KEYS,
      `capture.observations[${index}]`,
      issues,
    );
    if (!isNonemptyString(observation.caseId)) {
      issues.push(`capture.observations[${index}].caseId: required`);
    } else receivedIds.push(observation.caseId);
    validateResult(observation.result, `capture.observations[${index}].result`, issues);
  });
  if (canonicalJson(receivedIds) !== canonicalJson(expectedIds)) {
    issues.push("capture.observations: missing, extra, or reordered case IDs");
  }
  scanSecrets(value, "capture", issues);
  return issues;
}

export async function captureExcel(corpus: ConformanceCorpus): Promise<string> {
  const endpoint = process.env.SHEETWRITE_EXCEL_ORACLE_URL;
  const token = process.env.SHEETWRITE_EXCEL_ORACLE_TOKEN;
  const producerVersion = process.env.SHEETWRITE_EXCEL_PRODUCER_VERSION;
  if (!endpoint || !token || !producerVersion) {
    throw new Error(
      "Compatibility check BLOCKED: Excel needs a protected service URL, access token, and exact app version",
    );
  }
  const script = await readFile("scripts/conformance-excel-office-script.ts", "utf8");
  const scriptSha256 = sha256(script);
  const payloadJson = canonicalJson({
    protocol: corpus.protocol,
    producerVersion,
    cases: corpus.cases,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: canonicalJson({
      protocol: 1,
      script,
      scriptSha256,
      arguments: { payloadJson, scriptSha256 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Excel oracle failed with HTTP ${response.status}`);
  const envelopeBytes = await readBoundedResponse(response);
  const envelope: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(envelopeBytes),
  );
  if (!isObject(envelope) || typeof envelope.result !== "string") {
    throw new Error("Excel oracle response omitted the Office Script result");
  }
  const payload: unknown = JSON.parse(envelope.result);
  const issues = validateExcelCapture(payload, corpus, producerVersion, scriptSha256);
  if (issues.length > 0) throw new Error(issues.join("\n"));
  const serialized = canonicalJson(payload);
  if (serialized.includes(token)) throw new Error("Excel oracle response contained a credential");
  return persistCapture(payload as CaptureArtifact);
}
