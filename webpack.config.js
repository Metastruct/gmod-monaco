const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    globalObject: "self",
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
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
    // new webpack.optimize.LimitChunkCountPlugin({
    //   maxChunks: 1, // disable creating additional chunks
    // }),
  ],

  // having minimize enabled gives weird Â's for blank lines??
  optimization: {
    minimize: false,
  },
};
