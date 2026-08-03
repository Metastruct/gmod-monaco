import * as monaco from "monaco-editor";

export class ThemeLoader {
    private loadedThemes: string[] = ["vs-dark"];

    async loadThemes(): Promise<void> {
        this.loadedThemes = ["vs-dark"];
        try {
            // Bundle every theme JSON into a SINGLE lazy chunk ("lazy-once").
            // The first ctx() call fetches that one chunk; every subsequent
            // call resolves from it with no extra request. This replaces what
            // used to be 50 separate, sequentially-awaited network round-trips
            // (one chunk per theme) that stalled startup for seconds on
            // GitHub Pages and gated GMod's OnReady() signal.
            const ctx = (import.meta as any).webpackContext("../themes", {
                regExp: /\.json$/,
                mode: "lazy-once",
            });
            const data = (await ctx("./themelist.json")) as Object;
            const themeNames: string[] = Object.values(data);
            await Promise.all(
                themeNames.map(async (themeName) => {
                    if (typeof themeName !== "string") return;
                    const themeData = await ctx(`./${themeName}.json`);
                    const name: string = themeName
                        .replace(/(\s|_)/g, "-")
                        .replace(/(\(|\))/g, "")
                        .toLowerCase();
                    this.loadedThemes.push(name);
                    monaco.editor.defineTheme(name, themeData);
                })
            );
        } catch (err) {
            console.warn("Could not load custom themes?!: ", err);
        }
    }

    getLoadedThemes(): string[] {
        return this.loadedThemes;
    }
}
