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
        polyfills: "./src/polyfills.ts",
        index: { import: "./src/index.ts", dependOn: "polyfills" },
        repl: { import: "./src/repl.ts", dependOn: "polyfills" },
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
            chunks: ["polyfills", "index"],
            chunksSortMode: "manual",
        }),
        new HtmlWebpackPlugin({
            filename: "repl.html",
            template: "views/repl.html",
            chunks: ["polyfills", "repl"],
            chunksSortMode: "manual",
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
