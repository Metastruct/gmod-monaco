import * as monaco from "monaco-editor";

export class ThemeLoader {
    async loadThemes(): Promise<void> {
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
                monaco.editor.defineTheme(name, themeData);
            }
        } catch (err) {
            console.warn("Could not load custom themes?!: ", err);
        }
    }
}
