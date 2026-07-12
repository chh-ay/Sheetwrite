/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:fs\/promises$/ }));
    }
    return config;
  },
};

export default nextConfig;
