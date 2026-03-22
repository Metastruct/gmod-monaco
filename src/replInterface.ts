import * as monaco from "monaco-editor";
import { FetchGwiki } from "./glua/Gwiki";
import {
    AutocompleteRequestContext,
    DynamicAutocompleteItem,
} from "./completionProvider";
import {
    ClientAutocompleteData,
    createSharedInterfaceMethods,
} from "./baseInterface";

declare global {
    namespace globalThis {
        var replinterface: ReplInterface | ExtendedReplInterface | undefined;
    }
}
interface ReplInterface {
    OnReady(): void;
    OnCode(code: string): void;
    OpenURL(url: string): void;
    /** Called when Monaco requests dynamic autocomplete items */
    OnAutocompleteRequest?(context: AutocompleteRequestContext, requestId: number): void;
}

interface ExtendedReplInterface extends ReplInterface {
    editor?: monaco.editor.IStandaloneCodeEditor;
    line?: monaco.editor.IStandaloneCodeEditor;
    replLines: Map<number, number>;
    replHistory: string[];
    replHistoryIndex: number;
    replCounter: number;
    suggestWidget?: any;
    searchMode: boolean;
    searchModePrevValue: string;
    /** Pending dynamic autocomplete callbacks by request ID */
    _autocompleteCallbacks?: Map<number, (items: DynamicAutocompleteItem[]) => void>;
    /** Counter for autocomplete request IDs */
    _autocompleteRequestId?: number;

    SetEditors(
        editor: monaco.editor.IStandaloneCodeEditor,
        line: monaco.editor.IStandaloneCodeEditor
    ): void;
    SetWidget(widget: object): void;
    AddText(text: string): void;
    Clear(): void;
    Reset(): void;
    LoadAutocompleteState(state: string): Promise<void>;
    ResetAutocompletion(): void;
    LoadAutocomplete(clData: ClientAutocompleteData): void;
    EnterSearchMode(): void;
    ExitSearchMode(restoreValue: boolean): void;
    SetHistory(entries: string[]): void;
    AddHistory(entry: string): void;
    /** Enable dynamic autocomplete - Gmod must implement OnAutocompleteRequest */
    EnableDynamicAutocomplete(timeoutMs?: number): void;
    /** Disable dynamic autocomplete */
    DisableDynamicAutocomplete(): void;
    /** Called by Gmod to provide autocomplete items for a request */
    ProvideAutocompleteItems(requestId: number, items: DynamicAutocompleteItem[]): void;
    /** Setup link opener for editor - from shared mixin */
    setupLinkOpener(editor: monaco.editor.IStandaloneCodeEditor): void;
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
        searchMode: false,
        searchModePrevValue: "",

        SetEditors(
            editor: monaco.editor.IStandaloneCodeEditor,
            line: monaco.editor.IStandaloneCodeEditor
        ): void {
            this.editor = editor;
            this.line = line;
            line.onDidChangeModelContent((event) => {
                const content = line.getValue();
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
                        this.replLines.set(
                            this.editor!.getModel()!.getLineCount() - 1,
                            this.replCounter
                        );
                        this.replCounter++;
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
        AddText(text: string): void {
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
        },
        Clear(): void {
            this.replLines.clear();
            this.editor!.setValue("");
        },
        Reset(): void {
            this.replCounter = 0;
            this.Clear();
        },
        EnterSearchMode(): void {
            if (this.searchMode) return;
            this.searchMode = true;
            this.searchModePrevValue = this.line!.getValue();
            document.getElementById("input-prompt")!.textContent = "search>";
            this.line!.setValue("");
            this.line!.focus();
            setTimeout(() => {
                this.line!.trigger("search", "editor.action.triggerSuggest", {});
            }, 0);
        },
        ExitSearchMode(restoreValue: boolean): void {
            if (!this.searchMode) return;
            this.searchMode = false;
            document.getElementById("input-prompt")!.textContent = "lua>";
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
