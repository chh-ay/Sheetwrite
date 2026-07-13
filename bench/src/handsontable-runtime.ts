import type { GridSettings, HotInstance } from "handsontable";
import * as HandsontableModule from "handsontable";

const DEFAULT_REQUIRED_METHODS = [
  "destroy",
  "getData",
  "getDataAtCell",
  "getSelectedLast",
  "selectCell",
] as const;

/**
 * Construct Handsontable through its public runtime export while containing the
 * package's TypeScript 7 CJS/ESM declaration mismatch in one checked boundary.
 */
export function createHandsontable(
  host: HTMLElement,
  settings: GridSettings,
  requiredMethods: readonly string[] = DEFAULT_REQUIRED_METHODS,
): HotInstance {
  const namespace: unknown = HandsontableModule;
  const namespaceRecord =
    namespace !== null && typeof namespace === "object"
      ? (namespace as Record<string, unknown>)
      : undefined;
  const candidate = namespaceRecord?.default ?? namespace;
  if (typeof candidate !== "function") {
    throw new TypeError("Handsontable public export is not constructable");
  }

  const instance: unknown = Reflect.construct(candidate, [host, settings]);
  if (instance === null || typeof instance !== "object") {
    throw new TypeError("Handsontable constructor did not return an object");
  }
  const methods = instance as Record<string, unknown>;
  for (const method of requiredMethods) {
    if (typeof methods[method] !== "function") {
      throw new TypeError(`Handsontable runtime is missing required method: ${method}`);
    }
  }
  return instance as HotInstance;
}
