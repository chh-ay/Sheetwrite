// Ambient declarations for non-code imports handled by the bundler.
declare module "*.css";

declare module "*.wasm" {
  const url: string;
  export default url;
}
