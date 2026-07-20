import { describe, expect, it } from "bun:test";
import { AriaMirror } from "../src/aria-mirror.js";
import type { VisibleWindowView } from "../src/types.js";

function view(cols: readonly number[], rowStart = 3): VisibleWindowView {
  return {
    sheet: "s1",
    rows: { start: rowStart, end: rowStart + 1 },
    cols,
    values: cols.map((col) => `r${rowStart}c${col}`),
    styleIds: new Uint32Array(cols.length),
    styles: [{}],
  };
}

function mountMirror(): { host: HTMLDivElement; mirror: AriaMirror } {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  const scroller = document.createElement("div");
  const overlay = document.createElement("div");
  viewport.append(scroller, overlay, document.createElement("canvas"));
  host.appendChild(viewport);
  document.body.appendChild(host);
  return {
    host,
    mirror: new AriaMirror({
      host,
      scroller,
      overlay,
      viewport,
      rowCount: 100,
      colCount: 40,
      readOnly: false,
      focusCell: () => null,
      noteAt: () => null,
      selection: () => null,
    }),
  };
}

function columnIndices(host: HTMLElement, role: "columnheader" | "gridcell"): string[] {
  return [...host.querySelectorAll(`[role="${role}"]`)].map(
    (cell) => cell.getAttribute("aria-colindex") ?? "",
  );
}

describe("AriaMirror absolute indices", () => {
  it("uses one-based sheet columns while rebuilding and patching a horizontal window", () => {
    const { host, mirror } = mountMirror();
    try {
      mirror.update(view([0, 1, 8]));
      expect(columnIndices(host, "columnheader")).toEqual(["1", "2", "9"]);
      expect(columnIndices(host, "gridcell")).toEqual(["1", "2", "9"]);

      mirror.update(view([7, 8, 15], 12));
      expect(columnIndices(host, "columnheader")).toEqual(["8", "9", "16"]);
      expect(columnIndices(host, "gridcell")).toEqual(["8", "9", "16"]);
      expect(host.querySelector('[role="row"][aria-rowindex="14"]')).not.toBeNull();
    } finally {
      mirror.destroy();
      host.remove();
    }
  });

  it("keeps frozen and virtualized column positions absolute in one retained shape", () => {
    const { host, mirror } = mountMirror();
    try {
      mirror.update(view([0, 6, 7]));
      expect(columnIndices(host, "columnheader")).toEqual(["1", "7", "8"]);
      mirror.bumpVersion();
      mirror.update(view([0, 18, 19]));
      expect(columnIndices(host, "columnheader")).toEqual(["1", "19", "20"]);
      expect(columnIndices(host, "gridcell")).toEqual(["1", "19", "20"]);
    } finally {
      mirror.destroy();
      host.remove();
    }
  });
});
