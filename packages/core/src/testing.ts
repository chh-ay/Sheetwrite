// ── Test-environment helper (never import from production code) ─────────────

/**
 * The stub 2D context the canvas test stubs install: every method is a no-op
 * that counts its invocations in `calls`, so tests can assert paint activity
 * (e.g. `ctx.calls.fillText > 0`) without a real canvas.
 */
export interface RecordingContext2D {
  /** Per-method invocation counts, keyed by the 2D-context method name. */
  readonly calls: Record<string, number>;
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  [method: string]: unknown;
}

export interface CanvasTestStubOptions {
  /** Stubbed `clientWidth` for every element (happy-dom/jsdom have no layout). Default 800. */
  width?: number;
  /** Stubbed `clientHeight` for every element. Default 400. */
  height?: number;
}

function makeRecordingContext(canvas: HTMLCanvasElement): RecordingContext2D {
  const calls: Record<string, number> = {};
  const target: Record<string, unknown> = {
    calls,
    canvas,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
  };

  // A Proxy covers every context method the renderer may call — present and
  // future — while still recording per-method counts for paint assertions.
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return Reflect.get(object, property);
      if (typeof property !== "string") return undefined;
      return (...args: unknown[]) => {
        void args;
        calls[property] = (calls[property] ?? 0) + 1;
      };
    },
    set(object, property, value) {
      Reflect.set(object, property, value);
      return true;
    },
  }) as unknown as RecordingContext2D;
}

/**
 * Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom)
 * needs before `createGrid` can mount — without them the renderer throws
 * `"Sheetwrite: 2D canvas context is unavailable"`. Returns a restore
 * function that undoes every patch.
 *
 * The installed `getContext("2d")` returns a per-canvas
 * {@link RecordingContext2D}; re-request it from a mounted canvas to assert
 * paint activity. Nothing is painted — assert grid STATE, not pixels.
 * Test-only: never import from production code.
 */
export function installCanvasTestStubs(options: CanvasTestStubOptions = {}): () => void {
  const width = options.width ?? 800;
  const height = options.height ?? 400;

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );

  const contexts = new WeakMap<HTMLCanvasElement, RecordingContext2D>();
  const stub = function (this: HTMLCanvasElement): CanvasRenderingContext2D {
    let context = contexts.get(this);
    if (!context) {
      context = makeRecordingContext(this);
      contexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  };
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });

  return () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    }
  };
}
