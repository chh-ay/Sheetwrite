import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { deferredModule, installFixtureOnlyCandidate } from "./candidate-package.mjs";

const fixtureRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(fixtureRoot, "../..");
const outputRoot = resolve(repositoryRoot, "test-results/bundlers/first-paint");
const viteDependencyRoot = resolve(fixtureRoot, "vite");
const nextDependencyRoot = resolve(fixtureRoot, "next");
const viteFixtureRoot = resolve(import.meta.dirname, "vite");
const nextFixtureRoot = resolve(import.meta.dirname, "next");
const rounds = 10;

function run(command, args, cwd, environment = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} failed (${code ?? signal})`));
    });
  });
}

async function replaceNodeModulesLink(target, source) {
  await rm(target, { recursive: true, force: true });
  await symlink(source, target, "dir");
}

async function buildVite(variant, corePackageRoot) {
  const output = resolve(outputRoot, "vite", variant);
  await rm(output, { recursive: true, force: true });
  await run(
    resolve(viteDependencyRoot, "node_modules/.bin/vite"),
    ["build", "--config", resolve(viteFixtureRoot, "vite.config.ts")],
    viteFixtureRoot,
    {
      SHEETWRITE_FIRST_PAINT_CORE: corePackageRoot,
      SHEETWRITE_FIRST_PAINT_OUTPUT: output,
    },
  );
}

async function buildNext(variant, corePackageRoot) {
  await rm(resolve(nextFixtureRoot, ".next"), { recursive: true, force: true });
  await rm(resolve(nextFixtureRoot, "out"), { recursive: true, force: true });
  await run(resolve(nextDependencyRoot, "node_modules/.bin/next"), ["build"], nextFixtureRoot, {
    SHEETWRITE_FIRST_PAINT_CORE: corePackageRoot,
  });
  const output = resolve(outputRoot, "next", variant);
  await rm(output, { recursive: true, force: true });
  await cp(resolve(nextFixtureRoot, "out"), output, { recursive: true });
}

async function buildPair(name, dependencyRoot, build) {
  const baselineCore = resolve(dependencyRoot, "node_modules/@sheetwrite/core");
  const candidateCore = resolve(outputRoot, ".candidate-core", name.toLowerCase());
  await mkdir(resolve(outputRoot, ".candidate-core"), { recursive: true });
  await rm(candidateCore, { recursive: true, force: true });
  await cp(baselineCore, candidateCore, { recursive: true });
  const candidateScope = resolve(candidateCore, "node_modules/@sheetwrite");
  await mkdir(candidateScope, { recursive: true });
  await symlink(
    resolve(dependencyRoot, "node_modules/@sheetwrite/wasm"),
    resolve(candidateScope, "wasm"),
    "dir",
  );
  await installFixtureOnlyCandidate(candidateCore);
  await build("baseline", baselineCore);
  await build("candidate", candidateCore);
  console.log(`${name} first-paint baseline/candidate built`);
}

async function withServer(root, callback) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname);
      const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const file = resolve(root, `.${requested}`);
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      const contentType =
        extname(file) === ".html"
          ? "text/html; charset=utf-8"
          : extname(file) === ".js"
            ? "text/javascript; charset=utf-8"
            : extname(file) === ".css"
              ? "text/css; charset=utf-8"
              : extname(file) === ".wasm"
                ? "application/wasm"
                : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  const listening = Promise.withResolvers();
  server.once("error", listening.reject);
  server.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Static server has no port");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    const closed = Promise.withResolvers();
    server.close(closed.resolve);
    await closed.promise;
  }
}

function summarizeBytes(chunks) {
  const totals = { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 };
  for (const chunk of chunks) {
    totals.rawBytes += chunk.byteLength;
    totals.gzipBytes += gzipSync(chunk, { level: 9, mtime: 0 }).byteLength;
    totals.brotliBytes += brotliCompressSync(chunk, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength;
  }
  return totals;
}

async function capturePage(browser, root, path = "/") {
  return withServer(root, async (origin) => {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: 500, width: 800 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined, undefined, {
      timeout: 20_000,
    });
    const state = await page.evaluate(() => ({
      readyMs: window.__sheetwriteFirstPaint.readyMs,
      surface: window.__sheetwriteFirstPaint.surface,
      scripts: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith(".js")),
    }));
    if (JSON.stringify(state.surface) !== JSON.stringify(["createGrid", "initSheetwrite"])) {
      throw new Error("Fixture did not preserve the createGrid/initSheetwrite surface");
    }
    const host = page.locator("[data-sheetwrite-first-paint-host]");
    const screenshot = await host.screenshot({ animations: "disabled" });
    const checksum = createHash("sha256").update(screenshot).digest("hex");
    if (errors.length > 0) throw new Error(`First-paint fixture failed:\n${errors.join("\n")}`);
    await page.close();
    const scripts = await Promise.all(
      state.scripts.map((url) => readFile(resolve(root, `.${new URL(url).pathname}`))),
    );
    return { checksum, initialJavaScript: summarizeBytes(scripts), readyMs: state.readyMs };
  });
}

async function interactionEvidence(browser, root, path = "/") {
  return withServer(root, async (origin) => {
    const page = await browser.newPage();
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined);
    const before = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name),
    );
    const success = await page.evaluate(async () => {
      const events = [];
      globalThis.addEventListener("sheetwrite:first-interaction-module", (event) =>
        events.push(event.detail),
      );
      let rejected = false;
      let outcome;
      try {
        outcome = await window.__sheetwriteFirstPaint.grid.actions.copy();
      } catch {
        rejected = true;
      }
      return { events, outcome, rejected };
    });
    const after = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name),
    );
    const deferredUrl = after.find(
      (url) => !before.includes(url) && new URL(url).pathname.endsWith(".js"),
    );
    if (
      deferredUrl === undefined ||
      success.outcome !== "empty" ||
      success.rejected ||
      !success.events.some((event) => event.module === deferredModule && event.state === "loaded")
    ) {
      throw new Error("Candidate did not load the named clipboard module on first interaction");
    }
    await page.close();

    const errorPage = await browser.newPage();
    await errorPage.route(deferredUrl, (route) => route.abort("failed"));
    await errorPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await errorPage.waitForFunction(() => window.__sheetwriteFirstPaint !== undefined);
    const failure = await errorPage.evaluate(async () => {
      const events = [];
      globalThis.addEventListener("sheetwrite:first-interaction-module", (event) =>
        events.push(event.detail),
      );
      let rejected = false;
      let outcome;
      try {
        outcome = await window.__sheetwriteFirstPaint.grid.actions.copy();
      } catch {
        rejected = true;
      }
      return { events, outcome, rejected };
    });
    await errorPage.close();
    if (
      failure.outcome !== "unsupported" ||
      failure.rejected ||
      !failure.events.some((event) => event.module === deferredModule && event.state === "error")
    ) {
      throw new Error("Candidate did not fail closed when its interaction chunk was unavailable");
    }
    return {
      deferredChunk: new URL(deferredUrl).pathname,
      interaction: {
        module: deferredModule,
        loaded: true,
        successOutcome: success.outcome,
        errorOutcome: failure.outcome,
        rejected: failure.rejected,
      },
    };
  });
}

function timing(samplesMs) {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    samplesMs,
    medianMs: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

async function captureFixture(browser, bundler, version, provenance, path) {
  const roots = {
    baseline: resolve(outputRoot, bundler, "baseline"),
    candidate: resolve(outputRoot, bundler, "candidate"),
  };
  const observations = { baseline: [], candidate: [] };
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const variant of order) {
      observations[variant].push(await capturePage(browser, roots[variant], path));
    }
  }
  const baseline = observations.baseline[0];
  const candidate = observations.candidate[0];
  if (observations.baseline.some((entry) => entry.checksum !== baseline.checksum)) {
    throw new Error(`${bundler} baseline first-paint checksum was unstable`);
  }
  if (observations.candidate.some((entry) => entry.checksum !== candidate.checksum)) {
    throw new Error(`${bundler} candidate first-paint checksum was unstable`);
  }
  const interaction = await interactionEvidence(browser, roots.candidate, path);
  const delta = {
    rawBytes: baseline.initialJavaScript.rawBytes - candidate.initialJavaScript.rawBytes,
    gzipBytes: baseline.initialJavaScript.gzipBytes - candidate.initialJavaScript.gzipBytes,
    brotliBytes: baseline.initialJavaScript.brotliBytes - candidate.initialJavaScript.brotliBytes,
  };
  return {
    bundler,
    version,
    provenance,
    eagerImports: ["@sheetwrite/core#createGrid", "@sheetwrite/core#initSheetwrite"],
    baseline: {
      initialJavaScript: baseline.initialJavaScript,
      timing: timing(observations.baseline.map((entry) => entry.readyMs)),
      checksum: baseline.checksum,
    },
    candidate: {
      initialJavaScript: candidate.initialJavaScript,
      timing: timing(observations.candidate.map((entry) => entry.readyMs)),
      checksum: candidate.checksum,
      ...interaction,
    },
    delta: {
      ...delta,
      brotliPercent: (delta.brotliBytes / baseline.initialJavaScript.brotliBytes) * 100,
    },
  };
}

for (const [fixture, dependency] of [
  [viteFixtureRoot, viteDependencyRoot],
  [nextFixtureRoot, nextDependencyRoot],
]) {
  await replaceNodeModulesLink(
    resolve(fixture, "node_modules"),
    resolve(dependency, "node_modules"),
  );
}
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await buildPair("Vite", viteDependencyRoot, buildVite);
await buildPair("Next.js", nextDependencyRoot, buildNext);

const vitePackage = JSON.parse(await readFile(resolve(viteDependencyRoot, "package.json"), "utf8"));
const nextPackage = JSON.parse(await readFile(resolve(nextDependencyRoot, "package.json"), "utf8"));
const browser = await chromium.launch({ headless: true });
let fixtures;
try {
  fixtures = [
    await captureFixture(
      browser,
      "next",
      nextPackage.dependencies.next,
      {
        buildMode: "production",
        minified: true,
        minifier: { name: "next-swc", version: nextPackage.dependencies.next },
        externals: [],
        target: "browser",
        sourceMaps: "hidden-external",
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      "/",
    ),
    await captureFixture(
      browser,
      "vite",
      vitePackage.dependencies.vite,
      {
        buildMode: "production",
        minified: true,
        minifier: { name: "esbuild", version: "0.25.12" },
        externals: [],
        target: "browser",
        sourceMaps: "hidden-external",
        attributionMethod: "source-map-generated-spans-with-explicit-opaque-assets-v2",
      },
      "/",
    ),
  ];
} finally {
  await browser.close();
}

const evidence = {
  schemaVersion: 2,
  kind: "first-paint-counterfactual",
  candidate: {
    fixtureOnly: true,
    shipping: false,
    deferredModules: [deferredModule],
  },
  thresholds: {
    brotliBytes: 7_680,
    percent: 10,
    timing: "median-and-p95-no-slower",
  },
  fixtures,
};
const evidencePath = resolve(repositoryRoot, "test-results/bundlers/first-paint.json");
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
await run(
  "bun",
  ["scripts/first-paint-evidence.ts", "check", relative(repositoryRoot, evidencePath)],
  repositoryRoot,
);
console.log(`First-paint evidence: ${relative(repositoryRoot, evidencePath)}`);
