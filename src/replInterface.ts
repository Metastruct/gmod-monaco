import * as monaco from "monaco-editor";
import { FetchGwiki } from "./glua/Gwiki";
import {
    BaseCallbacks,
    SharedInterfaceMethods,
    createSharedInterfaceMethods,
} from "./baseInterface";
import { refreshReplFolding } from "./replFoldingProvider";

declare global {
    namespace globalThis {
        var replinterface: ReplInterface | ExtendedReplInterface | undefined;
    }
}

// Prompt label shown before the input line, per editor language. Falls back to
// "<langId>>" for any language without an explicit entry.
const LANGUAGE_PROMPTS: Record<string, string> = {
    glua: "lua>",
    javascript: "js>",
};
function promptForLanguage(langId: string): string {
    return LANGUAGE_PROMPTS[langId] ?? `${langId}>`;
}
interface ReplInterface extends BaseCallbacks {
    OnCode(code: string): void;
}

interface ExtendedReplInterface extends ReplInterface, SharedInterfaceMethods {
    editor?: monaco.editor.IStandaloneCodeEditor;
    line?: monaco.editor.IStandaloneCodeEditor;
    replLines: Map<number, number>;
    replHistory: string[];
    replHistoryIndex: number;
    replCounter: number;
    /** Finalized folding ranges for completed repl entries (1-based lines). */
    replFoldRanges: Array<{ start: number; end: number }>;
    /** Start lines of repl entries still awaiting their answer (FIFO). */
    replPendingStarts: number[];
    /** Ids of the current separator decorations in the output editor. */
    replDecorations: string[];
    suggestWidget?: any;
    searchMode: boolean;
    searchModePrevValue: string;
    /** Prompt label for the currently active language (e.g. "lua>", "js>") */
    prompt: string;

    SetEditors(
        editor: monaco.editor.IStandaloneCodeEditor,
        line: monaco.editor.IStandaloneCodeEditor
    ): void;
    SetWidget(widget: object): void;
    SetLanguage(langId: string): void;
    /**
     * Append text to the output editor.
     * @param isReplAnswer when true, this text is the result of a repl input and
     *   closes the oldest open entry, finalizing its collapsible fold range.
     *   Loose console output (prints, errors) should omit it.
     */
    AddText(text: string, isReplAnswer?: boolean): void;
    updateReplDecorations(): void;
    Clear(): void;
    Reset(): void;
    EnterSearchMode(keepValue?: boolean): void;
    ExitSearchMode(restoreValue: boolean): void;
    SetHistory(entries: string[]): void;
    AddHistory(entry: string): void;
}

// Browser testing snippets - uncomment to enable testing in browser
// globalThis.replinterface = {
//     OpenURL: (url: string) => { console.log("[OpenURL]", url); window.open(url, "_blank"); },
//     OnReady: () => console.log("[OnReady] REPL interface ready"),
//     OnCode: (code: string) => {
//         console.log("[OnCode]", code);
//         // Simulate execution result
//         setTimeout(() => {
//             if (globalThis.replinterface && "AddText" in globalThis.replinterface) {
//                 (globalThis.replinterface as ExtendedReplInterface).AddText(`> ${code}\n= [result]`);
//             }
//         }, 100);
//     },
// };

let maybeReplInterface: ExtendedReplInterface | undefined;
if (globalThis.replinterface) {
    maybeReplInterface = {
        ...globalThis.replinterface,
        ...createSharedInterfaceMethods(),

        replLines: new Map<number, number>(),
        replHistory: [],
        replHistoryIndex: 0,
        replCounter: 0,
        replFoldRanges: [],
        replPendingStarts: [],
        replDecorations: [],
        searchMode: false,
        searchModePrevValue: "",
        prompt: "lua>",

        SetEditors(
            editor: monaco.editor.IStandaloneCodeEditor,
            line: monaco.editor.IStandaloneCodeEditor
        ): void {
            this.editor = editor;
            this.line = line;
            line.onDidChangeModelContent((event) => {
                const content = line.getValue();
                // Bash-style "!!" opens history search. The "!!" stays in the
                // line (the completion provider ignores it when filtering) and
                // is replaced along with the rest of the line when an entry is
                // accepted. "!! query" (e.g. pasted whole) also triggers, with
                // everything after the space used as the search query.
                if (
                    !this.searchMode &&
                    (content === "!!" || content.startsWith("!! "))
                ) {
                    this.EnterSearchMode(true);
                    return;
                }
                if (content.indexOf(event.eol) !== -1) {
                    line.setValue(content.replace(/(?:\r\n|\r|\n)/g, " "));
                }
                const hoverWidget =
                    // @ts-ignore
                    line._contentWidgets[
                    "editor.contrib.modesContentHoverWidget"
                    ];
                if (
                    hoverWidget &&
                    hoverWidget.widget &&
                    hoverWidget.widget._containerDomNode
                ) {
                    const style = hoverWidget.widget._containerDomNode.style;
                    if (style.top !== null) {
                        style.position = "fixed";
                        style.bottom = 30;
                        style.top = null;
                    }
                }
                if (this.searchMode) {
                    setTimeout(() => {
                        if (this.suggestWidget && this.suggestWidget._state === 0) {
                            // Only exit if user has typed something and then suggestions closed
                            // Don't exit when line is empty (just entered search mode)
                            if (line.getValue().length > 0) {
                                this.ExitSearchMode(false);
                            }
                        } else {
                            line.trigger("search", "editor.action.triggerSuggest", {});
                        }
                    }, 0);
                }
            });
            line.onKeyDown((event: monaco.IKeyboardEvent) => {
                if (this.searchMode) {
                    if (event.keyCode === monaco.KeyCode.UpArrow || event.keyCode === monaco.KeyCode.DownArrow) {
                        return;
                    }
                }
                let prevent = true;
                if (
                    (!this.suggestWidget || this.suggestWidget._state !== 0) &&
                    event.keyCode !== monaco.KeyCode.Enter
                ) {
                    return;
                }
                let histStr;
                switch (event.keyCode) {
                    case monaco.KeyCode.Enter:
                        if (this.searchMode) {
                            // Accept the highlighted suggestion if widget is open
                            if (this.suggestWidget && this.suggestWidget._state !== 0) {
                                line.trigger("keyboard", "acceptSelectedSuggestion", {});
                            }
                            this.ExitSearchMode(false);
                            break;
                        }
                        const code = line.getValue();
                        if (code.trim() === "") {
                            prevent = true;
                            break;
                        }
                        this.AddText(code);
                        const startLine =
                            this.editor!.getModel()!.getLineCount() - 1;
                        this.replLines.set(startLine, this.replCounter);
                        this.replCounter++;
                        // Open an entry; its answer (AddText with isReplAnswer)
                        // will close it into a collapsible fold range.
                        this.replPendingStarts.push(startLine);
                        this.updateReplDecorations();
                        line.setValue("");
                        this.replHistory.unshift(code);
                        this.replHistoryIndex = 0;
                        this.OnCode(code);
                        break;

                    case monaco.KeyCode.UpArrow:
                        if (this.replHistoryIndex >= this.replHistory.length) {
                            break;
                        }
                        this.replHistoryIndex++;
                        histStr = this.replHistory[this.replHistoryIndex - 1];
                        line.setValue(histStr);
                        // .hack
                        setTimeout(() => {
                            line.setPosition(
                                new monaco.Position(1, histStr.length + 1)
                            );
                        }, 10);
                        break;

                    case monaco.KeyCode.DownArrow:
                        if (this.replHistoryIndex === 1) {
                            line.setValue("");
                            this.replHistoryIndex = 0;
                            break;
                        }
                        if (this.replHistoryIndex === 0) {
                            break;
                        }
                        this.replHistoryIndex--;
                        histStr = this.replHistory[this.replHistoryIndex - 1];
                        line.setValue(histStr);
                        line.setPosition(
                            new monaco.Position(1, histStr.length + 1)
                        );
                        break;

                    default:
                        prevent = false;
                }
                if (prevent) {
                    event.preventDefault();
                }
            });
            editor.updateOptions({
                lineNumbers: (originalLineNumber: number) => {
                    if (this.replLines.has(originalLineNumber)) {
                        return "repl" + this.replLines.get(originalLineNumber);
                    }
                    return "";
                },
            });
            editor.addAction({
                id: "clearCode",
                label: "Clear",
                contextMenuGroupId: "GMod",
                keybindings: [],
                run: () => {
                    this.Clear();
                },
            });
            this.setupLinkOpener(editor);

            FetchGwiki();
        },
        SetWidget(widget: object): void {
            this.suggestWidget = widget;
        },
        SetLanguage(langId: string): void {
            monaco.editor.setModelLanguage(this.editor!.getModel()!, langId);
            monaco.editor.setModelLanguage(this.line!.getModel()!, langId);
            this.prompt = promptForLanguage(langId);
            // Search mode owns the prompt while active; it restores this.prompt
            // on exit, so only update the visible label when not searching.
            if (!this.searchMode) {
                document.getElementById("input-prompt")!.textContent =
                    this.prompt;
            }
        },
        AddText(text: string, isReplAnswer: boolean = false): void {
            this.editor!.updateOptions({
                readOnly: false,
            });
            const lineCount = this.editor!.getModel()!.getLineCount();
            this.editor!.executeEdits("repl-AddText", [
                {
                    forceMoveMarkers: true,
                    range: new monaco.Range(lineCount, 1, lineCount, 1),
                    text: text + "\n",
                },
            ]);
            this.editor!.revealLine(this.editor!.getModel()!.getLineCount());
            this.editor!.updateOptions({
                readOnly: true,
            });

            // An answer closes the oldest open entry, finalizing its fold range.
            // Loose console output (isReplAnswer omitted/false) is left unfolded,
            // which also keeps old Lua callers of AddText(text) working unchanged.
            if (isReplAnswer && this.replPendingStarts.length > 0) {
                const start = this.replPendingStarts.shift()!;
                const end = this.editor!.getModel()!.getLineCount() - 1;
                if (end > start) {
                    this.replFoldRanges.push({ start, end });
                }
            }
            this.updateReplDecorations();
            refreshReplFolding();
        },
        updateReplDecorations(): void {
            const model = this.editor!.getModel();
            if (!model) return;
            const lineCount = model.getLineCount();
            const decorations: monaco.editor.IModelDeltaDecoration[] = [];
            // Draw a separator above the first line of every repl entry.
            for (const lineNumber of this.replLines.keys()) {
                if (lineNumber < 1 || lineNumber > lineCount) continue;
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                    options: {
                        isWholeLine: true,
                        className: "repl-entry-separator",
                    },
                });
            }
            this.replDecorations = this.editor!.deltaDecorations(
                this.replDecorations,
                decorations
            );
        },
        Clear(): void {
            this.replLines.clear();
            this.replFoldRanges = [];
            this.replPendingStarts = [];
            this.editor!.setValue("");
            this.replDecorations = this.editor!.deltaDecorations(
                this.replDecorations,
                []
            );
            refreshReplFolding();
        },
        Reset(): void {
            this.replCounter = 0;
            this.Clear();
        },
        EnterSearchMode(keepValue: boolean = false): void {
            if (this.searchMode) return;
            this.searchMode = true;
            // Restoring the "!!" trigger on cancel would just re-enter search
            // mode, so the keepValue path restores an empty line instead.
            this.searchModePrevValue = keepValue ? "" : this.line!.getValue();
            document.getElementById("input-prompt")!.textContent = "search>";
            if (!keepValue) {
                this.line!.setValue("");
            }
            this.line!.focus();
            setTimeout(() => {
                this.line!.trigger("search", "editor.action.triggerSuggest", {});
            }, 0);
        },
        ExitSearchMode(restoreValue: boolean): void {
            if (!this.searchMode) return;
            this.searchMode = false;
            document.getElementById("input-prompt")!.textContent = this.prompt;
            if (restoreValue) {
                this.line!.setValue(this.searchModePrevValue);
                const len = this.searchModePrevValue.length;
                this.line!.setPosition(new monaco.Position(1, len + 1));
            }
            this.replHistoryIndex = 0;
        },
        SetHistory(entries: string[]): void {
            this.replHistory = entries;
        },
        AddHistory(entry: string): void {
            this.replHistory.unshift(entry);
        },
    };

    // give gmod access to the extended interface
    globalThis.replinterface = maybeReplInterface;
}

export const replInterface = maybeReplInterface;
