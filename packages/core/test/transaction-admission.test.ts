import { describe, expect, it } from "bun:test";
import {
  beginGridTransactionAdmission,
  type GridTransactionAdmissionGuard,
  type GridTransactionAdmissionReservation,
  registerGridTransactionAdmission,
} from "../src/transaction-admission.js";
import type { Grid } from "../src/types/grid.js";
import type { ApplyTransactionResult } from "../src/types/transaction.js";

const outcome: ApplyTransactionResult = { status: "noop", epoch: 0, reason: "empty" };

function reservation(log: string[], name: string): GridTransactionAdmissionReservation {
  return {
    cancel: () => log.push(`${name}:cancel`),
    finish: (result) => log.push(`${name}:finish:${result.status}`),
  };
}

describe("grid transaction admission", () => {
  it("uses an inert reservation when no guards are registered", () => {
    const decision = beginGridTransactionAdmission({} as Grid, []);
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error("empty admission unexpectedly rejected");
    expect(() => {
      decision.reservation.cancel();
      decision.reservation.finish(outcome);
    }).not.toThrow();
  });

  it("registers one guard and removes it idempotently", () => {
    const grid = {} as Grid;
    const log: string[] = [];
    const dispose = registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, "only") }),
    });

    const decision = beginGridTransactionAdmission(grid, []);
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error("single guard unexpectedly rejected");
    decision.reservation.finish(outcome);
    expect(log).toEqual(["only:finish:noop"]);

    dispose();
    dispose();
    expect(beginGridTransactionAdmission(grid, []).ok).toBe(true);
  });

  it("finishes or cancels every reservation exactly once", () => {
    const grid = {} as Grid;
    const finishLog: string[] = [];
    const cancelLog: string[] = [];
    const disposers = ["first", "second"].map((name) =>
      registerGridTransactionAdmission(grid, {
        reserve: () => ({ ok: true, reservation: reservation(finishLog, name) }),
      }),
    );

    const finished = beginGridTransactionAdmission(grid, []);
    expect(finished.ok).toBe(true);
    if (!finished.ok) throw new Error("multi-guard admission unexpectedly rejected");
    finished.reservation.finish(outcome);
    finished.reservation.finish(outcome);
    finished.reservation.cancel();
    expect(finishLog).toEqual(["first:finish:noop", "second:finish:noop"]);

    for (const dispose of disposers) dispose();
    const cancelDisposers = ["first", "second"].map((name) =>
      registerGridTransactionAdmission(grid, {
        reserve: () => ({ ok: true, reservation: reservation(cancelLog, name) }),
      }),
    );
    const cancelled = beginGridTransactionAdmission(grid, []);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) throw new Error("multi-guard admission unexpectedly rejected");
    cancelled.reservation.cancel();
    cancelled.reservation.cancel();
    cancelled.reservation.finish(outcome);
    expect(cancelLog).toEqual(["first:cancel", "second:cancel"]);
    for (const dispose of cancelDisposers) dispose();
  });

  it("cancels earlier reservations when a later guard rejects or throws", () => {
    const rejectedGrid = {} as Grid;
    const rejectedLog: string[] = [];
    registerGridTransactionAdmission(rejectedGrid, {
      reserve: () => ({ ok: true, reservation: reservation(rejectedLog, "first") }),
    });
    registerGridTransactionAdmission(rejectedGrid, {
      reserve: () => ({
        ok: false,
        issue: {
          kind: "resource-limit",
          severity: "error",
          resource: "operations",
          actual: 2,
          max: 1,
          message: "too many operations",
        },
      }),
    });
    const rejected = beginGridTransactionAdmission(rejectedGrid, []);
    expect(rejected.ok).toBe(false);
    expect(rejectedLog).toEqual(["first:cancel"]);

    const thrownGrid = {} as Grid;
    const thrownLog: string[] = [];
    const throwingGuard: GridTransactionAdmissionGuard = {
      reserve: () => {
        throw new Error("guard failed");
      },
    };
    registerGridTransactionAdmission(thrownGrid, {
      reserve: () => ({ ok: true, reservation: reservation(thrownLog, "first") }),
    });
    registerGridTransactionAdmission(thrownGrid, throwingGuard);
    expect(() => beginGridTransactionAdmission(thrownGrid, [])).toThrow("guard failed");
    expect(thrownLog).toEqual(["first:cancel"]);
  });
});
