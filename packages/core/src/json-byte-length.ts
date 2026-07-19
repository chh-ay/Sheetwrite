export class JsonByteLengthError extends Error {
  override readonly name = "JsonByteLengthError";

  constructor(
    readonly code: "invalid" | "limit",
    message: string,
    readonly actual?: number,
    readonly limit?: number,
  ) {
    super(message);
  }
}

export interface JsonByteLengthOptions {
  /** Match JSON object encoding by omitting own properties whose value is undefined. */
  omitUndefinedProperties?: boolean;
}

/** Computes exact JSON UTF-8 bytes without constructing the encoded payload. */
export function boundedJsonByteLength(
  value: unknown,
  limit: number,
  options: JsonByteLengthOptions = {},
): number {
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (amount: number): void => {
    bytes += amount;
    if (bytes > limit) {
      throw new JsonByteLengthError(
        "limit",
        `Encoded JSON exceeds the ${limit} byte limit`,
        bytes,
        limit,
      );
    }
  };
  const addString = (input: string): void => {
    add(2);
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      if (
        code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
      ) {
        add(2);
      } else if (code < 0x20) {
        add(6);
      } else if (code <= 0x7f) {
        add(1);
      } else if (code <= 0x7ff) {
        add(2);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = input.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          index += 1;
        } else {
          add(6);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        add(6);
      } else {
        add(3);
      }
    }
  };
  const visit = (input: unknown): void => {
    if (input === null) {
      add(4);
      return;
    }
    if (typeof input === "string") {
      addString(input);
      return;
    }
    if (typeof input === "boolean") {
      add(input ? 4 : 5);
      return;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new JsonByteLengthError("invalid", "JSON numbers must be finite");
      }
      add(JSON.stringify(input).length);
      return;
    }
    if (typeof input !== "object") {
      throw new JsonByteLengthError("invalid", "Value is not JSON-safe");
    }
    if (ancestors.has(input)) {
      throw new JsonByteLengthError("invalid", "JSON values cannot contain cycles");
    }
    ancestors.add(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) {
        throw new JsonByteLengthError("invalid", "Arrays must use Array prototype");
      }
      add(2);
      for (let index = 0; index < input.length; index++) {
        if (index > 0) add(1);
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new JsonByteLengthError("invalid", "Arrays cannot be sparse");
        }
        visit(descriptor.value);
      }
      for (const key in input) {
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          index >= input.length
        ) {
          throw new JsonByteLengthError("invalid", "Arrays cannot contain named properties");
        }
      }
      ancestors.delete(input);
      return;
    }
    if (Object.getPrototypeOf(input) !== Object.prototype) {
      throw new JsonByteLengthError("invalid", "JSON values must contain only plain objects");
    }
    const record = input as Record<string, unknown>;
    if (Object.getOwnPropertyDescriptor(record, "toJSON")) {
      throw new JsonByteLengthError("invalid", "JSON values cannot define toJSON");
    }
    add(2);
    let first = true;
    for (const key in record) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new JsonByteLengthError("invalid", "JSON fields must be enumerable data properties");
      }
      if (descriptor.value === undefined && options.omitUndefinedProperties) continue;
      if (!first) add(1);
      first = false;
      addString(key);
      add(1);
      visit(descriptor.value);
    }
    ancestors.delete(input);
  };
  visit(value);
  return bytes;
}
