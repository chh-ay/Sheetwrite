/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: import.meta.dirname,
  webpack(config, { dev, isServer }) {
    const core = process.env.SHEETWRITE_FIRST_PAINT_CORE;
    if (!core) throw new Error("SHEETWRITE_FIRST_PAINT_CORE is required");
    config.resolve.alias["@sheetwrite/core"] = core;
    if (!dev && !isServer) config.devtool = "hidden-source-map";
    return config;
  },
};

export default nextConfig;
