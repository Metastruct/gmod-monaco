const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

module.exports = {
    mode: "production",
    entry: {
        index: "./src/index.ts",
        repl: "./src/repl.ts",
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    output: {
        globalObject: "self",
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: true,
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
                type: "asset/resource",
            },
        ],
    },
    plugins: [
        new MonacoWebpackPlugin({
            // Only include essential features for GLua editor
            languages: [], // GLua is registered at runtime, no built-in languages needed
            features: [
                "bracketMatching",
                "clipboard",
                "codeAction",
                "codelens",
                "colorPicker",
                "comment",
                "contextmenu",
                "cursorUndo",
                "find",
                "folding",
                "fontZoom",
                "format",
                "hover",
                "indentation",
                "inlineCompletions",
                "linesOperations",
                "links",
                "multicursor",
                "parameterHints",
                "quickCommand",
                "quickOutline",
                "smartSelect",
                "suggest",
                "wordHighlighter",
                "wordOperations",
            ],
        }),
        new HtmlWebpackPlugin({
            template: "views/index.html",
            chunks: ["index"],
        }),
        new HtmlWebpackPlugin({
            filename: "repl.html",
            template: "views/repl.html",
            chunks: ["repl"],
        }),
    ],

    devtool: "source-map",

    performance: {
        // Monaco editor bundles are inherently large
        hints: false,
    },

    devServer: {
        static: path.join(__dirname, "dist"),
        port: 8080,
        compress: true,
        allowedHosts: "all",
    },
};
