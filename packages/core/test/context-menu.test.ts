import { describe, expect, it } from "bun:test";
import { ContextMenu } from "../src/context-menu.js";
import { DEFAULT_THEME } from "../src/grid.js";
import type {
  CellAddress,
  ContextMenuActionName,
  Grid,
  GridActions,
  GridConfig,
} from "../src/types.js";

const ACTIONS: ReadonlyArray<readonly [ContextMenuActionName, string]> = [
  ["cut", "cut"],
  ["copy", "copy"],
  ["paste", "paste"],
  ["clearContents", "clearContents"],
  ["merge", "merge"],
  ["unmerge", "unmerge"],
  ["insertRowAbove", "insertRowAbove"],
  ["insertRowBelow", "insertRowBelow"],
  ["deleteRow", "deleteRow"],
  ["hideRow", "hideRows"],
  ["showAllRows", "showRows"],
  ["autoFitRow", "autoFitRows"],
  ["insertColumnLeft", "insertColumnLeft"],
  ["insertColumnRight", "insertColumnRight"],
  ["deleteColumn", "deleteColumn"],
  ["hideColumn", "hideColumns"],
  ["showAllColumns", "showColumns"],
  ["autoFitColumn", "autoFitColumns"],
  ["clearFilter", "clearFilter"],
  ["exportCsv", "exportCsv"],
  ["exportXlsx", "exportXlsx"],
];

describe("ContextMenu", () => {
  it("dispatches every built-in item to the matching public grid action", () => {
    const calls: string[] = [];
    const actions = new Proxy(
      {},
      {
        get: (_target, property) => () => calls.push(String(property)),
      },
    ) as GridActions;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const config: GridConfig = {
      contextMenu: [
        ...ACTIONS.map(([action]) => ({ action })),
        { action: "separator" },
        { label: "No action" },
      ],
    };
    const menu = new ContextMenu(host, config, DEFAULT_THEME, actions, {} as Grid);
    const rows = [...host.querySelectorAll<HTMLElement>(".sheetwrite-context-menu-item")];

    for (const row of rows) row.click();

    expect(calls).toEqual(ACTIONS.map(([, method]) => method));
    expect(host.querySelectorAll(".sheetwrite-context-menu-sep")).toHaveLength(1);
    expect(rows.at(-1)?.textContent).toBe("No action");
    expect((host.querySelector(".sheetwrite-context-menu") as HTMLElement).style.display).toBe(
      "none",
    );
    menu.destroy();
  });

  it("passes the opened cell to custom actions and dismisses on outside input", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const cell: CellAddress = { sheet: "s1", row: 4, col: 2 };
    const received: Array<CellAddress | null> = [];
    const grid = {} as Grid;
    const menu = new ContextMenu(
      host,
      {
        contextMenu: [
          {
            label: "Inspect",
            onClick: (receivedGrid, address) => {
              expect(receivedGrid).toBe(grid);
              received.push(address);
            },
          },
        ],
      },
      DEFAULT_THEME,
      {} as GridActions,
      grid,
    );
    const element = host.querySelector<HTMLElement>(".sheetwrite-context-menu")!;

    menu.open(-10, -20, cell);
    expect(element.style.left).toBe("0px");
    expect(element.style.top).toBe("0px");
    host.querySelector<HTMLElement>(".sheetwrite-context-menu-item")!.click();
    expect(received).toEqual([cell]);

    menu.open(20, 20, null);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(element.style.display).toBe("none");
    menu.open(20, 20, null);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(element.style.display).toBe("none");
    menu.open(20, 20, null);
    window.dispatchEvent(new Event("resize"));
    expect(element.style.display).toBe("none");
    menu.open(20, 20, null);
    window.dispatchEvent(new Event("scroll"));
    expect(element.style.display).toBe("none");

    menu.destroy();
    expect(host.querySelector(".sheetwrite-context-menu")).toBeNull();
  });
});
