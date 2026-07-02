import "./browserFallback"; // Must be first - sets up mock interface if browser mode enabled
import * as monaco from "monaco-editor";
import * as lua from "./lua";
import { GLuaFormatter } from "./formatter";
import { GLuaCompletionProvider } from "./completionProvider";
import { GLuaHoverProvider } from "./hoverProvider";
import { GLuaLinkProvider } from "./gluaLinkProvider";
import { ThemeLoader } from "./themeLoader";
import { replInterface } from "./replInterface";
import { replFoldingProvider } from "./replFoldingProvider";
import "./browserTestUtils"; // Exposes testUtils to window for browser testing

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
        folding: true,
        showFoldingControls: "always",
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
        fixedOverflowWidgets: true,
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

line.addAction({
    id: "reverse-history-search",
    label: "Reverse History Search",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR],
    run: () => {
        if (replInterface?.searchMode) {
            replInterface.ExitSearchMode(true);
        } else {
            replInterface?.EnterSearchMode();
        }
    },
});

monaco.languages.registerCompletionItemProvider(
    "glua",
    new GLuaCompletionProvider()
);
monaco.languages.registerHoverProvider("glua", new GLuaHoverProvider());
monaco.languages.registerLinkProvider("glua", new GLuaLinkProvider());
// The output editor can switch language (glua/javascript), so register folding
// for both. The provider itself only returns ranges for the output editor model.
monaco.languages.registerFoldingRangeProvider("glua", replFoldingProvider);
monaco.languages.registerFoldingRangeProvider("javascript", replFoldingProvider);

themePromise.finally(() => {
    if (replInterface) {
        replInterface!.SetEditors(editor, line);
        replInterface!.OnReady();
        setupSuggestWidget();
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
// Minimal shapes of the private Monaco suggest APIs the REPL relies on
interface PrivateCompletionModel {
    replInverted?: boolean;
    _snippetCompareFn?: (a: unknown, b: unknown) => number;
    _refilterKind?: number;
}
interface PrivateSuggestWidget {
    showSuggestions?: (
        completionModel: PrivateCompletionModel,
        ...args: unknown[]
    ) => void;
    selectLast?: () => boolean;
}
interface PrivateSuggestController extends monaco.editor.IEditorContribution {
    widget?: { value?: PrivateSuggestWidget };
    forceRenderingAbove?: () => void;
}

// The REPL input sits at the bottom of the page, so the suggest widget must
// render above it with the best match at the bottom (closest to the input).
// Monaco has no public API for list order, so the completion model's compare
// function is inverted through the suggest controller's internals.
function setupSuggestWidget(): void {
    const controller = line.getContribution<PrivateSuggestController>(
        "editor.contrib.suggestController"
    );
    if (!controller?.widget || !controller.forceRenderingAbove) {
        console.warn("Monaco suggest controller API changed, some REPL features may not work");
        return;
    }
    controller.forceRenderingAbove();
    // The widget is created lazily; reading .value instantiates it now
    const widget = controller.widget.value;
    if (!widget?.showSuggestions || !widget.selectLast) {
        console.warn("Monaco suggest widget API changed, some REPL features may not work");
        return;
    }
    const originalShow = widget.showSuggestions.bind(widget);
    const selectLast = widget.selectLast.bind(widget);
    widget.showSuggestions = (completionModel, ...args) => {
        if (completionModel && !completionModel.replInverted) {
            const compare = completionModel._snippetCompareFn;
            if (compare) {
                completionModel._snippetCompareFn = (a, b) => -compare(a, b);
                // Refilter.All, so the already-sorted items get re-sorted
                // with the inverted order before the first render
                completionModel._refilterKind = 1;
            }
            completionModel.replInverted = true;
        }
        originalShow(completionModel, ...args);
        selectLast();
    };
    replInterface!.SetWidget(widget);
}
