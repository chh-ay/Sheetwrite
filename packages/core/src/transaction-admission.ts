import type { DocumentOp, MutationIssue } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { ApplyTransactionResult, Transaction } from "./types/transaction.js";

export interface GridTransactionAdmissionReservation {
  cancel(): void;
  finish(outcome: ApplyTransactionResult): void;
}

export type GridTransactionAdmissionDecision =
  | { ok: true; reservation: GridTransactionAdmissionReservation }
  | { ok: false; issue: MutationIssue };

export interface GridTransactionAdmissionGuard {
  reserve(operations: readonly DocumentOp[]): GridTransactionAdmissionDecision;
}

const guardsByGrid = new WeakMap<Grid, Set<GridTransactionAdmissionGuard>>();
const storageRevisionByTransaction = new WeakMap<Transaction, bigint>();

export function setTransactionStorageRevision(transaction: Transaction, revision: bigint): void {
  storageRevisionByTransaction.set(transaction, revision);
}

export function transactionStorageRevision(transaction: Transaction): bigint | undefined {
  return storageRevisionByTransaction.get(transaction);
}
const EMPTY_RESERVATION: GridTransactionAdmissionReservation = Object.freeze({
  cancel: () => {},
  finish: () => {},
});
const EMPTY_DECISION: GridTransactionAdmissionDecision = Object.freeze({
  ok: true,
  reservation: EMPTY_RESERVATION,
});

export function registerGridTransactionAdmission(
  grid: Grid,
  guard: GridTransactionAdmissionGuard,
): () => void {
  let guards = guardsByGrid.get(grid);
  if (!guards) {
    guards = new Set();
    guardsByGrid.set(grid, guards);
  }
  guards.add(guard);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    guards!.delete(guard);
    if (guards!.size === 0) guardsByGrid.delete(grid);
  };
}

export function beginGridTransactionAdmission(
  grid: Grid,
  operations: readonly DocumentOp[],
): GridTransactionAdmissionDecision {
  const guards = guardsByGrid.get(grid);
  if (!guards || guards.size === 0) return EMPTY_DECISION;

  const reservations: GridTransactionAdmissionReservation[] = [];
  try {
    for (const guard of guards) {
      const decision = guard.reserve(operations);
      if (!decision.ok) {
        for (const reservation of reservations) reservation.cancel();
        return decision;
      }
      reservations.push(decision.reservation);
    }
  } catch (error) {
    for (const reservation of reservations) reservation.cancel();
    throw error;
  }

  if (reservations.length === 1) {
    return { ok: true, reservation: reservations[0]! };
  }
  let finished = false;
  return {
    ok: true,
    reservation: {
      cancel() {
        if (finished) return;
        finished = true;
        for (const reservation of reservations) reservation.cancel();
      },
      finish(outcome) {
        if (finished) return;
        finished = true;
        for (const reservation of reservations) reservation.finish(outcome);
      },
    },
  };
}
