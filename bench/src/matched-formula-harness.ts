import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type * as WasmModule from "../../packages/wasm/pkg/sheetwrite_wasm.js";

const root = new URL("../../", import.meta.url).pathname;
const candidateCommit = Bun.env.CANDIDATE_COMMIT;
if (!candidateCommit || !/^[0-9a-f]{40}$/u.test(candidateCommit)) {
  throw new Error("CANDIDATE_COMMIT must be the exact 40-character commit SHA");
}
const sides = {
  baseline: {
    commit: "77c41983b53f09c393c6f8b82a4033283c0f9830",
    pkg: `${root}.formula-evidence/pre77/packages/wasm/pkg`,
  },
  post94: { commit: candidateCommit, pkg: `${root}packages/wasm/pkg` },
} as const;

type Side = keyof typeof sides;
type Wasm = typeof WasmModule;
type Store = InstanceType<Wasm["CellStore"]>;
type Allocation = {
  allocationAvailable: boolean;
  retainedBytes: number | null;
  retainedDeltaBytes: number | null;
  peakTransientBytes: number | null;
  transientAllocations: number | null;
};
type Fixture = { store: Store; run(): void; check(): void };
type Sample = Allocation & { ms: number };
type ResourceStore = Store & {
  memoryStats?: () => Float64Array;
  formulaMatrixResourceStats?: () => Float64Array;
  resetFormulaMatrixResourceStats?: () => void;
};

const modules = {} as Record<Side, Wasm>;
for (const side of Object.keys(sides) as Side[]) {
  const descriptor = sides[side];
  const wasm = (await import(`${descriptor.pkg}/sheetwrite_wasm.js`)) as Wasm;
  wasm.initSync({ module: readFileSync(`${descriptor.pkg}/sheetwrite_wasm_bg.wasm`) });
  modules[side] = wasm;
}
function retained(store: ResourceStore): number | null {
  const stats = store.memoryStats?.();
  if (stats === undefined) return null;
  if (stats[0] !== 3 || stats.length !== 5 + stats[1]! * 3) {
    throw new Error(`unexpected memory schema ${Array.from(stats)}`);
  }
  return stats.at(-1)!;
}
function allocation(store: ResourceStore, retainedBefore: number | null): Allocation {
  const transient = store.formulaMatrixResourceStats?.();
  const retainedBytes = retained(store);
  const allocationAvailable =
    retainedBytes !== null && retainedBefore !== null && transient !== undefined;
  return {
    allocationAvailable,
    retainedBytes: allocationAvailable ? retainedBytes : null,
    retainedDeltaBytes: allocationAvailable ? retainedBytes - retainedBefore : null,
    peakTransientBytes: allocationAvailable ? transient[1]! : null,
    transientAllocations: allocationAvailable ? transient[2]! : null,
  };
}
function numberAt(store: Store, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}
function textAt(store: Store, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}
const factories: Record<string, (wasm: Wasm) => Fixture> = {
  "independent-parse-load/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(2, count);
    store.setColumnNumbers(
      sheet,
      0,
      0,
      Float64Array.from({ length: count }, (_, row) => row),
      0,
    );
    return {
      store,
      run: () => {
        for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, `=A${row + 1}+1`, 0);
      },
      check: () => {
        store.recompute(sheet);
        if (numberAt(store, sheet, count - 1, 1) !== count) throw new Error("parse-load output");
      },
    };
  },
  "error-propagation/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(2, count);
    store.setFormula(sheet, 0, 0, "=1/0", 0);
    for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
    return {
      store,
      run: () => store.recompute(sheet),
      check: () => {
        if (textAt(store, sheet, count - 1, 1) !== "#DIV/0!") throw new Error("error output");
      },
    };
  },
  "scalar-edit-affects-1000/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(3, count);
    store.setNumber(sheet, 0, 0, 1, 0);
    for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, `=$A$1+${row + 1}`, 0);
    store.recompute(sheet);
    return {
      store,
      run: () => {
        store.setNumber(sheet, 0, 0, 10, 0);
        store.recompute(sheet);
      },
      check: () => {
        if (numberAt(store, sheet, count - 1, 1) !== count + 10) throw new Error("scalar output");
      },
    };
  },
  "shared-range-edit/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(2, count);
    store.setColumnNumbers(
      sheet,
      0,
      0,
      Float64Array.from({ length: 100 }, () => 1),
      0,
    );
    for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=SUM($A$1:$A$100)", 0);
    store.recompute(sheet);
    return {
      store,
      run: () => {
        store.setNumber(sheet, 0, 0, 2, 0);
        store.recompute(sheet);
      },
      check: () => {
        if (numberAt(store, sheet, count - 1, 1) !== 101) throw new Error("shared output");
      },
    };
  },
  "removed-sheet-ref/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const source = store.addSheet(1, 1);
    const summary = store.addSheet(1, count);
    store.setSheetName(source, "source", "Source");
    store.setSheetName(summary, "summary", "Summary");
    store.setNumber(source, 0, 0, 1, 0);
    for (let row = 0; row < count; row++) store.setFormula(summary, row, 0, "=Source!A1", 0);
    store.recompute(summary);
    return {
      store,
      run: () => {
        store.removeSheet(source);
      },
      check: () => {
        if (textAt(store, summary, count - 1, 0) !== "#REF!") throw new Error("removed output");
      },
    };
  },
  "wide-fan-out-edit/1000": (wasm) => {
    const count = 1_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(3, count);
    store.setNumber(sheet, 0, 0, 1, 0);
    for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, `=$A$1+${row + 1}`, 0);
    store.recompute(sheet);
    return {
      store,
      run: () => {
        store.setNumber(sheet, 0, 0, 10, 0);
        store.recompute(sheet);
      },
      check: () => {
        if (numberAt(store, sheet, count - 1, 1) !== count + 10) throw new Error("fanout1k output");
      },
    };
  },
  "wide-fan-out-edit/100000": (wasm) => {
    const count = 100_000;
    const store = new wasm.CellStore();
    const sheet = store.addSheet(3, count);
    store.setNumber(sheet, 0, 0, 1, 0);
    for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, `=$A$1+${row + 1}`, 0);
    store.recompute(sheet);
    return {
      store,
      run: () => {
        store.setNumber(sheet, 0, 0, 10, 0);
        store.recompute(sheet);
      },
      check: () => {
        if (numberAt(store, sheet, count - 1, 1) !== count + 10)
          throw new Error("fanout100k output");
      },
    };
  },
};
function capture(side: Side, workload: string): Sample {
  const fixture = factories[workload]!(modules[side]);
  Bun.gc(true);
  (fixture.store as ResourceStore).resetFormulaMatrixResourceStats?.();
  const retainedBefore = retained(fixture.store as ResourceStore);
  const started = performance.now();
  fixture.run();
  const ms = performance.now() - started;
  const resources = allocation(fixture.store as ResourceStore, retainedBefore);
  fixture.check();
  fixture.store.free();
  return { ms, ...resources };
}
for (const workload of Object.keys(factories)) {
  for (const side of ["baseline", "post94"] as const) capture(side, workload);
}
const pairCount = Number(Bun.env.PAIRS ?? "20");
if (pairCount !== 20)
  throw new Error("canonical matched formula capture requires exactly 20 pairs");
const rounds = [] as Array<{
  round: number;
  order: Side[];
  samples: Record<string, Partial<Record<Side, Sample>>>;
}>;
for (let round = 0; round < pairCount; round++) {
  const order: Side[] = round % 2 === 0 ? ["baseline", "post94"] : ["post94", "baseline"];
  const samples: Record<string, Partial<Record<Side, Sample>>> = {};
  for (const workload of Object.keys(factories)) {
    samples[workload] = {};
    for (const side of order) samples[workload]![side] = capture(side, workload);
  }
  rounds.push({ round: round + 1, order, samples });
}
const harnessSource = readFileSync(new URL(import.meta.url));
const artifact = {
  protocol: "formula-corrected-baseline-matched-v1",
  harnessSha256: createHash("sha256").update(harnessSource).digest("hex"),
  sides,
  releaseBuild: { rust: "opt-level=3,lto=fat,codegen-units=1", wasmOpt: "-O3", bun: Bun.version },
  controls: {
    cpuAffinity: [12],
    concurrency: 1,
    warmupsPerSidePerWorkload: 1,
    alternatingPairs: pairCount,
    platformProfile: readFileSync("/sys/firmware/acpi/platform_profile", "utf8").trim(),
    governor: readFileSync("/sys/devices/system/cpu/cpu12/cpufreq/scaling_governor", "utf8").trim(),
    energyPerformancePreference: readFileSync(
      "/sys/devices/system/cpu/cpu12/cpufreq/energy_performance_preference",
      "utf8",
    ).trim(),
  },
  workloadBoundaries: {
    "independent-parse-load/1000":
      "setup store/sheet/numeric input; timed 1000 setFormula calls (parse, FormulaEntry metadata, store insertion); correctness recompute/read is untimed",
    "error-propagation/1000":
      "setup 1001 setFormula calls; timed first recompute only; read check untimed",
    "scalar-edit-affects-1000/1000":
      "setup 1000 formulas plus initial recompute; timed setNumber plus incremental recompute; read check untimed",
    "shared-range-edit/1000":
      "setup 1000 SUM(range) formulas plus initial recompute; timed setNumber plus incremental recompute; read check untimed",
    "removed-sheet-ref/1000":
      "setup sheets, 1000 cross-sheet formulas, initial recompute; timed removeSheet only (invalidation/recompute inside API); read check untimed",
    "wide-fan-out-edit/1000":
      "setup 1000 scalar formulas plus initial recompute; timed setNumber plus incremental recompute; read check untimed",
    "wide-fan-out-edit/100000":
      "setup 100000 scalar formulas plus initial recompute; timed setNumber plus incremental recompute; read check untimed",
  },
  rounds,
};
const output = Bun.env.OUTPUT ?? `${root}.formula-evidence/formula-regression-raw.json`;
await Bun.write(output, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ output, rounds: rounds.length, candidate: candidateCommit }));
