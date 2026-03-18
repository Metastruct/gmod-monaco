import * as monaco from "monaco-editor";
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
        renderFinalNewline: "off",
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

window.addEventListener("resize", () => {
    editor.layout();
    line.layout();
});

// Redirect Ctrl+F from line input to output editor's find widget
line.addAction({
    id: "redirect-find-to-output",
    label: "Find in Output",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
    run: () => {
        editor.focus();
        editor.trigger("keyboard", "actions.find", null);
    },
});

monaco.languages.registerCompletionItemProvider(
    "glua",
    new GLuaCompletionProvider()
);
monaco.languages.registerHoverProvider("glua", new GLuaHoverProvider());

themePromise.finally(() => {
    if (replInterface) {
        replInterface!.SetEditors(editor, line);
        replInterface!.OnReady();
        // Im sorry for this hack but for some reason widgets are now lazy loading
        const haxInterval = setInterval(() => {
            if (replHax()) {
                clearInterval(haxInterval);
            }
        }, 100);
    }
    // Click prompt label to focus input
    document.getElementById("input-prompt")!.addEventListener("click", () => {
        line.focus();
    });
    // Focus the input field on page load
    line.focus();
});

// Stuff bellow is big brain hacking to make the line thing look normal
// Disable the quick command keybinding (F1) in the line editor
try {
    // @ts-expect-error - accessing private Monaco API
    const keybindingService = line._standaloneKeybindingService;
    const resolver = keybindingService._getResolver();
    const lookupMap = resolver._lookupMap;
    const quickCommandBindings = lookupMap.get("editor.action.quickCommand");
    if (quickCommandBindings && quickCommandBindings[0]?.resolvedKeybinding?._parts?.[0]) {
        quickCommandBindings[0].resolvedKeybinding._parts[0].keyCode = 0;
        keybindingService.updateResolver();
    }
} catch (e) {
    console.warn("Failed to disable quick command keybinding:", e);
}
function replHax(): boolean {
    // @ts-expect-error - accessing private Monaco API
    const widgetContainer = line._contentWidgets?.["editor.widget.suggestWidget"];
    if (widgetContainer === undefined) {
        return false;
    }
    const widget = widgetContainer.widget?._widget ?? widgetContainer.widget;
    if (!widget) {
        return false;
    }
    if (!widget.showSuggestions || !widget.selectLast) {
        console.warn("Monaco suggest widget API changed, some REPL features may not work");
        return false;
    }
    const OLDshowSuggestions = widget.showSuggestions.bind(widget);
    // Hacking to invert the order and select the last line
    // @ts-expect-error - accessing private Monaco API
    widget.showSuggestions = (...args) => {
        OLDshowSuggestions(...args);
        widget.selectLast();
        if (!widget._completionModel || widget._completionModel.hacked) {
            return;
        }
        const oldFn = widget._completionModel._snippetCompareFn;
        if (oldFn) {
            // @ts-expect-error - accessing private Monaco API
            widget._completionModel._snippetCompareFn = (...cmpArgs) => {
                return -oldFn(...cmpArgs);
            };
        }
        widget._completionModel.hacked = true;
    };
    replInterface!.SetWidget(widget);
    const elem = widget.element?.domNode ?? widget.element;
    if (!elem) {
        console.warn("Monaco suggest widget element not found");
        return true; // Still return true to stop the interval
    }
    // Force the popup widget to have this style cus monaco updates the style all the time
    const widgetStyle =
        "background-color: rgb(37, 37, 38); border-color: rgb(69, 69, 69); width: 430px; position: fixed; visibility: inherit; max-width: 1162px; line-height: 19px; bottom: 29px;";
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
