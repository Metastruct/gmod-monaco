import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LoadAutocompletionData, FetchGwiki } from "./glua/Gwiki";
import { autocompletionData, ResetAutocomplete } from "./autocompletionData";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";

declare global {
    namespace globalThis {
        var replinterface: ReplInterface | ExtendedReplInterface | undefined;
    }
}
interface ReplInterface {
    OnReady(): void;
    OnCode(code: string): void;
    OpenURL(url: string): void;
}

interface ExtendedReplInterface extends ReplInterface {
    editor?: monaco.editor.IStandaloneCodeEditor;
    line?: monaco.editor.IStandaloneCodeEditor;
    replLines: Map<number, number>;
    replHistory: string[];
    replHistoryIndex: number;
    replCounter: number;
    suggestWidget?: any;

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
}

interface ClientAutocompleteData {
    values: string; // Array of global non-table concatenated by '|'
    funcs: string; // Same as above but global functions and object methods
}

// I use this for debugging in browser
// globalThis.replinterface = {
//     OpenURL: console.log,
//     OnReady: console.log,
//     OnCode: console.log,
// };

let maybeReplInterface: ExtendedReplInterface | undefined;
if (globalThis.replinterface) {
    maybeReplInterface = {
        ...globalThis.replinterface,

        replLines: new Map<number, number>(),
        replHistory: [],
        replHistoryIndex: 0,
        replCounter: 0,

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
            });
            line.onKeyDown((event: monaco.IKeyboardEvent) => {
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
            // @ts-ignore
            editor.getContribution("editor.linkDetector").openerService.open = (
                url: string
            ) => {
                this.OpenURL(url);
            };

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
        LoadAutocompleteState(state: string): Promise<void> {
            return new Promise<void>(function (resolve, reject) {
                LoadAutocompletionData(state).then(() => {
                    autocompletionData.ClearAutocompleteCache();
                    resolve();
                });
            });
        },
        ResetAutocompletion(): void {
            ResetAutocomplete();
        },
        // This function will load all the client autocomplete stuff
        // See ClientAutocompleteData for input format
        LoadAutocomplete(clData: ClientAutocompleteData): void {
            // Build caches first to avoid duplicates
            autocompletionData.interfaceValues = [];
            autocompletionData.GenerateMethodsCache();
            autocompletionData.GenerateGlobalCache();
            const values = clData.values.split("|");
            const funcs = clData.funcs.split("|");
            const tables: string[] = [];
            values.forEach((value: string) => {
                let name = value;
                if (value.indexOf(".") !== -1) {
                    const split = value.split(".");
                    name = split.pop()!;
                    const tableName = split.join(".");
                    if (tables.indexOf(tableName) === -1) {
                        tables.push(tableName);
                    }
                }
                if (!autocompletionData.valuesLookup.has(value)) {
                    autocompletionData.AddNewInterfaceValue(
                        new GmodInterfaceValue({
                            name,
                            fullname: value,
                        })
                    );
                }
            });
            funcs.forEach((func: string) => {
                let name = func;
                let classFunction = false;
                let type = "Function";
                let parent = undefined;
                if (func.indexOf(".") !== -1) {
                    const split = func.split(".");
                    name = split.pop()!;
                    const tableName = split.join(".");
                    if (tables.indexOf(tableName) === -1) {
                        tables.push(tableName);
                    }
                } else if (func.indexOf(":") !== -1) {
                    const split = func.split(":");
                    parent = split[1];
                    name = split.pop()!;
                    classFunction = true;
                    type = "Method";
                }
                if (classFunction) {
                    if (autocompletionData.methodsLookup.has(name)) {
                        let found = false;
                        autocompletionData.methodsLookup
                            .get(name)
                            ?.forEach((method) => {
                                if (method.getFullName() == func) {
                                    found = true;
                                }
                            });
                        if (found) {
                            return;
                        }
                    }
                    autocompletionData.AddNewInterfaceValue(
                        new GmodInterfaceValue({
                            name,
                            parent,
                            fullname: func,
                            classFunction,
                            type,
                        })
                    );
                } else {
                    if (!autocompletionData.valuesLookup.has(func)) {
                        autocompletionData.AddNewInterfaceValue(
                            new GmodInterfaceValue({
                                name,
                                fullname: func,
                                classFunction,
                                type,
                            })
                        );
                    }
                }
            });
            tables.forEach((table) => {
                if (autocompletionData.modules.indexOf(table) === -1) {
                    autocompletionData.modules.push(table);
                }
            });
            autocompletionData.ClearAutocompleteCache();
        },
    };

    // give gmod access to the extended interface
    globalThis.replinterface = maybeReplInterface;
}

export const replInterface = maybeReplInterface;
