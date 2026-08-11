/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: import.meta.dirname,
  webpack(config, { dev, isServer }) {
    if (!dev && !isServer) config.devtool = "hidden-source-map";
    return config;
  },
};

export default nextConfig;
