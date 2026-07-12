// Public entry for the composable spreadsheet shell: a full Sheets-style
// chrome (`createSpreadsheetShell`) plus independently mountable pieces that
// attach to any `Grid` — including one exposed by a framework adapter. Import
// "@sheetwrite/core/shell.css" alongside the core stylesheet.

export {
  createFormulaBar,
  createNameBox,
  type FormulaBarOptions,
  type FormulaBarPiece,
  type NameBoxOptions,
  type ShellPiece,
} from "./shell/formula-controls.js";
export { createSelectionStatus, describeSelection } from "./shell/selection-status.js";
export {
  createSpreadsheetShell,
  type SpreadsheetShell,
  type SpreadsheetShellOptions,
} from "./shell/spreadsheet-shell.js";
export { createToolbar, type ToolbarOptions } from "./shell/toolbar-factory.js";
