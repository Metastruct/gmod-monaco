import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { GLuaFormatter } from "./formatter";
import { GLuaCompletionProvider } from "./completionProvider";
import { GLuaHoverProvider } from "./hoverProvider";
import { ThemeLoader } from "./themeLoader";
import { replInterface } from "./replInterface";

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

const storageService = {
    // tslint:disable: no-empty
    get() { },
    getBoolean(key: string) {
        if (key === "expandSuggestionDocs") return true;
        return false;
    },
    getNumber(key: string) {
        return 0;
    },
    remove() { },
    store() { },
    onWillSaveState() { },
    onDidChangeStorage() { },
    // tslint:enable: no-empty
};

const editor = monaco.editor.create(
    document.getElementById("container")!,
    {
        value: "",
        language: "glua",
        theme: "vs-dark",
        scrollBeyondLastLine: false,
        lineNumbers: "off",
        minimap: {
            enabled: true,
        },
        readOnly: true,
    },
    {
        storageService,
    }
);
const line = monaco.editor.create(
    document.getElementById("line-container")!,
    {
        value: "",
        language: "glua",
        theme: "vs-dark",
        lineNumbers: "off",
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        renderFinalNewline: false,
        acceptSuggestionOnEnter: "off",
        tabCompletion: "off",
        contextmenu: false,
        tabSize: 2,
        codeLens: false,
        minimap: {
            enabled: false,
        },
        scrollbar: {
            handleMouseWheel: false,
            horizontal: "hidden",
        },
    },
    {
        storageService,
    }
);

line.focus();
window.addEventListener("resize", () => {
    editor.layout();
    line.layout();
});

monaco.languages.registerCompletionItemProvider(
    "glua",
    new GLuaCompletionProvider()
);
monaco.languages.registerHoverProvider("glua", new GLuaHoverProvider());

themePromise.finally(() => {
    if (replInterface) {
        // Im sorry for this hack but for some reason widgets are now lazy loading
        let haxInterval = setInterval(() => {
            if (replHax()) {
                clearInterval(haxInterval);
                replInterface!.SetEditors(editor, line);
            }
        }, 100);
        replInterface.OnReady();
    }
});

// Stuff bellow is big brain hacking to make the line thing look normal
// @ts-ignore
line._standaloneKeybindingService
    ._getResolver()
    ._lookupMap.get(
        "editor.action.quickCommand"
    )[0].resolvedKeybinding._parts[0].keyCode = 0;
// @ts-ignore
line._standaloneKeybindingService.updateResolver();
function replHax(): boolean {
    // @ts-ignore
    const widgetContainer = line._contentWidgets["editor.widget.suggestWidget"];
    if (widgetContainer === undefined) {
        return false;
    }
    const widget = widgetContainer.widget._widget;
    const OLDshowSuggestions = widget.showSuggestions.bind(widget);
    // Hacking to invert the order and select the last line
    // @ts-ignore
    widget.showSuggestions = (...args) => {
        OLDshowSuggestions(...args);
        widget.selectLast();
        if (!widget._completionModel || widget._completionModel.hacked) {
            return;
        }
        const oldFn = widget._completionModel._snippetCompareFn;
        // @ts-ignore
        widget._completionModel._snippetCompareFn = (...cmpArgs) => {
            return -oldFn(...cmpArgs);
        };
        widget._completionModel.hacked = true;
    };
    const elem = widget.element.domNode;
    // Force the popup widget to have this style cus monaco updates the style all the time
    const widgetStyle =
        "background-color: rgb(37, 37, 38); border-color: rgb(69, 69, 69); width: 430px; position: fixed; visibility: inherit; max-width: 1162px; line-height: 19px; bottom: 26px;";
    const observer = new MutationObserver(() => {
        const oldLeft = elem.style.left;
        if (!oldLeft) {
            return;
        }
        // A hack to keep the left atribute while changing everything else
        const newStyle = `${widgetStyle} left: ${oldLeft};`;
        if (elem.style.cssText !== newStyle) {
            elem.style.cssText = widgetStyle;
        }
    });
    observer.observe(elem, { attributes: true });
    return true;
}
