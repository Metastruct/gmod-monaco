const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "development",
  entry: {
    app: "./src/index.js",
    "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
  },
  output: {
    globalObject: "self",
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.ttf$/,
        use: ["file-loader"],
      },
    ],
  },
  plugins: [
    new MonacoWebpackPlugin(),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1, // disable creating additional chunks
    }),
  ],
  optimization: {
    // We no not want to minimize our code.
    minimize: false,
  },
};
