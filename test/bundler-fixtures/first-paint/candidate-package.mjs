import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const deferredModule = "@sheetwrite/core/dist/clipboard-controller.js";
const originalName = "clipboard-controller.js";
const deferredName = "clipboard-controller.first-interaction.js";

const proxySource = `const loadEvent = "sheetwrite:first-interaction-module";

function publish(detail) {
  globalThis.dispatchEvent?.(new CustomEvent(loadEvent, { detail }));
}

export const SHEETWRITE_CLIPBOARD_MIME = "application/x-sheetwrite+json";

export class ClipboardController {
  #deps;
  #controller;

  constructor(deps) {
    this.#deps = deps;
  }

  async #load() {
    if (this.#controller === undefined) {
      publish({ module: ${JSON.stringify(deferredModule)}, state: "loading" });
      this.#controller = import("./${deferredName}")
        .then(({ ClipboardController: DeferredClipboardController }) => {
          publish({ module: ${JSON.stringify(deferredModule)}, state: "loaded" });
          return new DeferredClipboardController(this.#deps);
        })
        .catch((error) => {
          publish({
            module: ${JSON.stringify(deferredModule)},
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
    }
    return this.#controller;
  }

  async copy() {
    const controller = await this.#load();
    return controller === null ? "unsupported" : controller.copy();
  }

  async cut() {
    const controller = await this.#load();
    return controller === null ? "unsupported" : controller.cut();
  }

  async paste() {
    const controller = await this.#load();
    return controller === null ? "unsupported" : controller.paste();
  }

  async pasteValues() {
    const controller = await this.#load();
    return controller === null ? "unsupported" : controller.pasteValues();
  }
}
`;

export async function installFixtureOnlyCandidate(corePackageRoot) {
  const coreDist = resolve(corePackageRoot, "dist");
  const originalPath = resolve(coreDist, originalName);
  const deferredPath = resolve(coreDist, deferredName);
  await rename(originalPath, deferredPath);
  await writeFile(originalPath, proxySource);
}
