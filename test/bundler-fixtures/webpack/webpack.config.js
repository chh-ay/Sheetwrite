import { resolve } from "node:path";
import webpack from "webpack";

export default {
  mode: "production",
  entry: "./src/main.js",
  devtool: false,
  optimization: { minimize: false },
  plugins: [new webpack.IgnorePlugin({ resourceRegExp: /^node:fs\/promises$/ })],
  output: {
    path: resolve("dist"),
    filename: "main.js",
    chunkFilename: "worker-[name]-[contenthash].js",
    assetModuleFilename: "assets/[name]-[contenthash][ext]",
    clean: true,
  },
};
