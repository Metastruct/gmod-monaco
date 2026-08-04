import "./browserFallback"; // Must be first - sets up mock interface if browser mode enabled
import * as monaco from "monaco-editor";
import * as lua from "./lua";
import { GLuaFormatter } from "./formatter";
import { GLuaCompletionProvider } from "./completionProvider";
import { SQLCompletionProvider } from "./sqlCompletionProvider";
import { GLuaHoverProvider } from "./hoverProvider";
import { GLuaLinkProvider } from "./gluaLinkProvider";
import { GLuaColorProvider } from "./gluaColorProvider";
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
        tabSize: 4,
        // insertSpaces: true,
        detectIndentation: true,
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
        tabSize: 4,
        // insertSpaces: true,
        detectIndentation: true,
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

// Command palette, opened with VSCode-style Ctrl+Shift+P. It always opens in the
// output editor, so both editors get the same action: focus the output, then
// open. addAction scopes each keybinding to its own editor (via an `editorId`
// when-clause) and registers it with a higher weight than any built-in binding.
function openCommandPalette(): void {
    editor.focus();
    editor.trigger("keyboard", "editor.action.quickCommand", null);
}
for (const target of [editor, line]) {
    target.addAction({
        id: "repl-command-palette",
        label: "Command Palette",
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
        ],
        run: openCommandPalette,
    });
}

// The input line's built-in F1 (quickCommand) would open the palette anchored to
// the tiny single-line editor, which looks broken -- so swallow F1 there. This
// replaces the old hack that zeroed a resolvedKeybinding shared by BOTH editors
// (and so wrongly disabled F1 everywhere); binding a no-op via addAction is
// scoped to the line editor alone and outweighs the built-in.
line.addAction({
    id: "suppress-line-quick-command",
    label: "Suppress Command Palette (input line)",
    keybindings: [monaco.KeyCode.F1],
    run: () => {
        // no-op: keep F1 from opening the palette inside the input line
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
// The REPL can switch to SQLite mode (SetLanguage("sql")); Monaco's built-in
// "sql" language only tokenizes, so register our own completions for it.
monaco.languages.registerCompletionItemProvider(
    "sql",
    new SQLCompletionProvider()
);
monaco.languages.registerHoverProvider("glua", new GLuaHoverProvider());
monaco.languages.registerLinkProvider("glua", new GLuaLinkProvider());
monaco.languages.registerColorProvider("glua", new GLuaColorProvider());
// The output editor can switch language (glua/javascript/sql), so register
// folding for each. The provider itself only returns ranges for the output
// editor model.
monaco.languages.registerFoldingRangeProvider("glua", replFoldingProvider);
monaco.languages.registerFoldingRangeProvider("javascript", replFoldingProvider);
monaco.languages.registerFoldingRangeProvider("sql", replFoldingProvider);

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
