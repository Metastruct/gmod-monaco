import * as monaco from "monaco-editor";

export class ThemeLoader {
    private loadedThemes: Array<string> = [];

    async loadThemes(): Promise<void> {
        this.loadedThemes = [];
        try {
            let data = (await import("../themes/themelist.json")) as Object;
            let themeNames: string[] = Object.values(data);
            for (let themeName of themeNames) {
                if (typeof themeName !== "string") continue;
                let themeData = await import(`../themes/${themeName}.json`);
                let name: string = themeName
                    .replace(/(\s|_)/g, "-")
                    .replace(/(\(|\))/g, "")
                    .toLowerCase();
                this.loadedThemes.push(name);
                monaco.editor.defineTheme(name, themeData);
            }
        } catch (err) {
            console.warn("Could not load custom themes?!: ", err);
        }
    }

    getLoadedThemes(): Array<string> {
        return this.loadedThemes;
    }
}
