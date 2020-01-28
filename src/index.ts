import * as monaco from "monaco-editor";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";
import { LuaCompletionProvider } from "./completionProvider";
import { LuaQuickFixActionProvider } from "./quickFixActionProvider";
import { gmodInterface } from "./gmodInterface";
import { ThemeLoader } from "./themeLoader";

const themeLoader: ThemeLoader = new ThemeLoader();
const themePromise: Promise<void> = themeLoader.loadThemes();

monaco.languages.register({
    id: "lua",
    extensions: [".lua"],
    aliases: ["Lua", "lua"],
});

monaco.languages.setMonarchTokensProvider("lua", lua.language);
monaco.languages.setLanguageConfiguration("lua", lua.conf);
monaco.languages.registerDocumentFormattingEditProvider(
    "lua",
    new LuaFormatter()
);
monaco.languages.registerCompletionItemProvider(
    "lua",
    new LuaCompletionProvider()
);
monaco.languages.registerCodeActionProvider(
    "lua",
    new LuaQuickFixActionProvider()
);

const editor = monaco.editor.create(document.getElementById("container")!, {
    value: "",
    language: "lua",

    theme: "vs-dark",

    minimap: {
        enabled: false,
    },
    autoIndent: "full",
    formatOnPaste: true,
    formatOnType: true,
    acceptSuggestionOnEnter: "off",
});

editor.focus();
window.addEventListener("resize", () => editor.layout());

// so all themes are available to gmod when OnReady is fired
// this prevents any loading order issue
themePromise.finally(() => {
    if (gmodInterface) {
        gmodInterface.SetEditor(editor);
        gmodInterface.OnReady();
    }
});
