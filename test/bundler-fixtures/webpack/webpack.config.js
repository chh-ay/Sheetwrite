import { resolve } from "node:path";

export default {
  mode: "production",
  entry: "./src/main.js",
  devtool: false,
  output: {
    path: resolve("dist"),
    filename: "main.js",
    chunkFilename: "worker-[name]-[contenthash].js",
    assetModuleFilename: "assets/[name]-[contenthash][ext]",
    clean: true,
  },
};
