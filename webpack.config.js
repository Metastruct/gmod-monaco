const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

// Verify the Monaco file we patch still exists (guards against Monaco version changes)
const patchTarget = "node_modules/monaco-editor/esm/vs/editor/common/services/findSectionHeaders.js";
if (!require("fs").existsSync(path.resolve(__dirname, patchTarget))) {
    throw new Error(
        `Monaco patch target not found: ${patchTarget}\n` +
        "The findSectionHeaders patch (removes RegExp 'd' flag for Chrome 86) may need updating for this Monaco version."
    );
}

module.exports = {
    mode: "production",
    cache: {
        type: "filesystem",
    },
    entry: {
        index: ["./src/polyfills.ts", "./src/index.ts"],
        repl: ["./src/polyfills.ts", "./src/repl.ts"],
    },
    resolve: {
        extensions: [".ts", ".js"],
        fallback: {
            path: require.resolve("path-browserify"),
            fs: false,
        },
    },
    output: {
        globalObject: "self",
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: true,
        environment: {
            arrowFunction: true,
            bigIntLiteral: false,
            const: true,
            destructuring: true,
            dynamicImport: true,
            dynamicImportInWorker: false,
            forOf: true,
            globalThis: true,
            module: false,
            optionalChaining: true,
            templateLiteral: true,
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: [
                                [
                                    "@babel/preset-env",
                                    {
                                        useBuiltIns: "usage",
                                        corejs: 3,
                                        bugfixes: true,
                                    },
                                ],
                            ],
                        },
                    },
                    {
                        loader: "esbuild-loader",
                        options: {
                            target: "chrome86",
                        },
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.js$/,
                include: /node_modules[\\/]monaco-editor/,
                loader: "babel-loader",
                options: {
                    presets: [
                        [
                            "@babel/preset-env",
                            {
                                useBuiltIns: "usage",
                                corejs: 3,
                                bugfixes: true,
                            },
                        ],
                    ],
                },
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
        new webpack.ProvidePlugin({
            process: require.resolve("process/browser"),
        }),
        new webpack.NormalModuleReplacementPlugin(
            /monaco-editor\/esm\/.*\/findSectionHeaders\.js$/,
            path.resolve(__dirname, "src/patches/findSectionHeaders.js")
        ),
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
