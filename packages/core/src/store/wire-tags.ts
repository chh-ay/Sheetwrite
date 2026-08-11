// These values mirror packages/wasm/src/types.rs and must change together.
export const KIND_EMPTY = 0 as const;
export const KIND_NUMBER = 1 as const;
export const KIND_STRING = 2 as const;
export const KIND_BOOL = 3 as const;
export const KIND_FORMULA = 4 as const;

export const NO_STRING = 0xffffffff as const;
