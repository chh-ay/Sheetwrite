/// <reference types="svelte" />
/// <reference types="vite/client" />

// WASM binary imported as a URL asset (handled by Vite's `?url` suffix).
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
