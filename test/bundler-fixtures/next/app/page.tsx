"use client";

import "@sheetwrite/core";

const wasmUrl = new URL("@sheetwrite/wasm/wasm", import.meta.url);

export default function Page() {
  return <output>{wasmUrl.href}</output>;
}
