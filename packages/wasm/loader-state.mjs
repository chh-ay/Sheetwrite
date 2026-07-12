const DIFFERENT_SOURCE_IN_FLIGHT =
  "Sheetwrite: concurrent load() with a different source while initialization is in flight";
const DIFFERENT_SOURCE_AFTER_INIT =
  "Sheetwrite: load() called with a different source after initialization; keeping the first module.";

/**
 * Own the environment-neutral initialization lifecycle.
 *
 * @param {(source: BufferSource | URL | string | Request | WebAssembly.Module | undefined) => Promise<void>} initialize
 */
export function createLoader(initialize) {
  let ready = false;
  /** @type {Promise<void> | null} */
  let inFlight = null;
  /** @type {unknown} */
  let selectedSource;

  /**
   * @param {BufferSource | URL | string | Request | WebAssembly.Module} [source]
   */
  async function load(source) {
    if (ready) {
      if (source !== undefined && source !== selectedSource) {
        console.warn(DIFFERENT_SOURCE_AFTER_INIT);
      }
      return;
    }

    if (inFlight) {
      if (source !== undefined && source !== selectedSource) {
        throw new Error(DIFFERENT_SOURCE_IN_FLIGHT);
      }
      return inFlight;
    }

    selectedSource = source;
    inFlight = initialize(source);

    try {
      await inFlight;
      ready = true;
    } catch (error) {
      inFlight = null;
      selectedSource = undefined;
      throw error;
    }
  }

  function isLoaded() {
    return ready;
  }

  return { load, isLoaded };
}
