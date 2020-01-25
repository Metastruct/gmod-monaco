import * as monaco from "monaco-editor";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";
import { LuaCompletionProvider } from "./completionProvider";
import { gmodInterface } from "./gmodInterface";

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

if (gmodInterface) {
    gmodInterface.SetEditor(editor);
    gmodInterface.OnReady();
}
