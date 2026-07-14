import type { CellAddress, DocumentOp, Range } from "./types.js";

interface RevisionRectangle {
  readonly range: Range;
  readonly revision: number;
}

export interface MutationRevisionStats {
  readonly points: number;
  readonly rectangles: number;
  readonly retainedRequests: number;
  readonly retainedRevisions: number;
}

/**
 * Request-scoped local-mutation index for datasource race protection.
 *
 * Mutations are retained only while a datasource request old enough to observe
 * them is in flight. Sparse operations use point records; dense operations use
 * one rectangle record regardless of addressed area.
 */
export class MutationRevisionIndex {
  private readonly points = new Map<string, number>();
  private rectangles: RevisionRectangle[] = [];
  private readonly retained = new Map<number, number>();
  private retainedRequests = 0;

  retainRevision(revision: number): () => void {
    this.retained.set(revision, (this.retained.get(revision) ?? 0) + 1);
    this.retainedRequests += 1;
    this.prune();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = this.retained.get(revision);
      if (count === undefined) return;
      if (count === 1) this.retained.delete(revision);
      else this.retained.set(revision, count - 1);
      this.retainedRequests -= 1;
      this.prune();
    };
  }

  record(operations: readonly DocumentOp[], revision: number): void {
    if (this.retainedRequests === 0) return;

    for (const operation of operations) {
      switch (operation.op) {
        case "set":
          this.recordPoint(operation.addr, revision);
          break;
        case "setRange": {
          const range = normalize(operation.range);
          for (const cell of operation.cells) {
            this.recordPoint(
              {
                sheet: range.sheet,
                row: range.start.row + cell.rowOffset,
                col: range.start.col + cell.colOffset,
              },
              revision,
            );
          }
          break;
        }
        case "setBlock":
          this.rectangles.push({ range: normalize(operation.range), revision });
          break;
        case "clearRange":
          if (operation.contents ?? true) {
            this.rectangles.push({ range: normalize(operation.range), revision });
          }
          break;
      }
    }
    this.prune();
  }

  isNewerThan(address: CellAddress, revision: number): boolean {
    if ((this.points.get(pointKey(address)) ?? -1) > revision) return true;
    for (const rectangle of this.rectangles) {
      if (rectangle.revision <= revision || rectangle.range.sheet !== address.sheet) continue;
      if (
        address.row >= rectangle.range.start.row &&
        address.row <= rectangle.range.end.row &&
        address.col >= rectangle.range.start.col &&
        address.col <= rectangle.range.end.col
      ) {
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.points.clear();
    this.rectangles = [];
    this.retained.clear();
    this.retainedRequests = 0;
  }

  stats(): MutationRevisionStats {
    return {
      points: this.points.size,
      rectangles: this.rectangles.length,
      retainedRequests: this.retainedRequests,
      retainedRevisions: this.retained.size,
    };
  }

  private recordPoint(address: CellAddress, revision: number): void {
    const key = pointKey(address);
    if ((this.points.get(key) ?? -1) < revision) this.points.set(key, revision);
  }

  private prune(): void {
    if (this.retainedRequests === 0) {
      this.points.clear();
      this.rectangles = [];
      return;
    }
    let oldest = Number.POSITIVE_INFINITY;
    for (const revision of this.retained.keys()) oldest = Math.min(oldest, revision);
    for (const [key, revision] of this.points) {
      if (revision <= oldest) this.points.delete(key);
    }
    this.rectangles = this.rectangles.filter((rectangle) => rectangle.revision > oldest);
  }
}

function pointKey(address: CellAddress): string {
  return `${address.sheet}:${address.row}:${address.col}`;
}

function normalize(range: Range): Range {
  return {
    sheet: range.sheet,
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}
