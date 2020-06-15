import * as monaco from "monaco-editor";
import * as lua from "./lua";
import { GLuaFormatter } from "./formatter";
import { GLuaCompletionProvider } from "./completionProvider";
import { gmodInterface } from "./gmodInterface";
import { ThemeLoader } from "./themeLoader";
import { LoadAutocompletionData } from "./glua/Gwiki";
import { GLuaHoverProvider } from "./hoverProvider";

const themeLoader: ThemeLoader = new ThemeLoader();
const themePromise: Promise<void> = themeLoader.loadThemes();

monaco.languages.register({
    id: "glua",
    extensions: [".lua"],
    aliases: ["GLua", "glua"],
});

monaco.languages.setMonarchTokensProvider("glua", lua.language);
monaco.languages.setLanguageConfiguration("glua", lua.conf);
monaco.languages.registerDocumentFormattingEditProvider(
    "glua",
    new GLuaFormatter()
);
monaco.languages.registerCompletionItemProvider(
    "glua",
    new GLuaCompletionProvider()
);
monaco.languages.registerHoverProvider("glua", new GLuaHoverProvider());

const editor = monaco.editor.create(
    document.getElementById("container")!,
    {
        value: "",
        language: "glua",

        theme: "vs-dark",

        minimap: {
            enabled: true,
        },
        autoIndent: "full",
        formatOnPaste: true,
        formatOnType: true,
        acceptSuggestionOnEnter: "off",
    },
    {
        storageService: {
            get() {},
            getBoolean(key: string) {
                if (key === "expandSuggestionDocs") return true;
                return false;
            },
            remove() {},
            store() {},
            onWillSaveState() {},
            onDidChangeStorage() {},
        },
    }
);

editor.focus();
window.addEventListener("resize", () => editor.layout());

// so all themes are available to gmod when OnReady is fired
// this prevents any loading order issue
themePromise.finally(() => {
    if (gmodInterface) {
        gmodInterface.OnThemesLoaded(themeLoader.getLoadedThemes());
        gmodInterface.SetEditor(editor);
        gmodInterface.OnReady();
    } else {
        // For people viewing page in browser
        LoadAutocompletionData("Client");
    }
});
