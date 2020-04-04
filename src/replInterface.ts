import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LoadAutocompletionData } from "./glua/Gwiki";
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
    replLines: Map<number,number>;
    history: string[];
    historyIndex: number;
    replCounter: number;
    SetEditors(editor: monaco.editor.IStandaloneCodeEditor, line: monaco.editor.IStandaloneCodeEditor): void;
    AddText(text: string) : void;
    Clear() : void;
    Reset() : void;
    LoadAutocompleteState(state: string) : void;
    ResetAutocompletion() : void;
    LoadAutocomplete(clData: ClientAutocompleteData): void;
}

interface ClientAutocompleteData {
    values: string; // Array of global non-table concatenated by '|'
    funcs: string; // Same as above but global functions and object methods
}

let maybeReplInterface: ExtendedReplInterface | undefined;
if (globalThis.replinterface) {
    maybeReplInterface = {
        ...globalThis.replinterface,

        replLines: new Map<number,number>(),
        history: [],
        historyIndex: 0,
        replCounter: 0,

        SetEditors(editor: monaco.editor.IStandaloneCodeEditor, line: monaco.editor.IStandaloneCodeEditor): void {
            this.editor = editor;
            this.line = line;
            line.onDidChangeModelContent((event) => {
                const content = line.getValue()
                if(content.indexOf(event.eol) !== -1){
                    line.setValue(content.replace(/(?:\r\n|\r|\n)/g, " "))
                }
                // @ts-ignore
                const hoverWidget = line._contentWidgets["editor.contrib.modesContentHoverWidget"]
                if(hoverWidget && hoverWidget.widget && hoverWidget.widget._containerDomNode) {
                    const style = hoverWidget.widget._containerDomNode.style;
                    if(style.top !== null) {
                        style.position = "fixed"
                        style.bottom = 30
                        style.top = null
                    }
                }
            });
            // @ts-ignore
            const widget = line._contentWidgets["editor.widget.suggestWidget"].widget
            line.onKeyDown((event: monaco.IKeyboardEvent) => {
                let prevent = true
                if(widget.state !== 0 && event.keyCode !== monaco.KeyCode.Enter){return;}
                let histStr
                switch(event.keyCode) {
                  case monaco.KeyCode.Enter:
                    const code = line.getValue()
                    if(code.trim() === ""){
                      prevent = true;
                      break;
                    }
                    this.AddText(code)
                    this.replLines.set(this.editor!.getModel()!.getLineCount() - 1, this.replCounter)
                    this.replCounter++
                    line.setValue("")
                    this.history.unshift(code)
                    this.historyIndex = 0
                    this.OnCode(code)
                    break;
              
                  case monaco.KeyCode.UpArrow:
                    if(this.historyIndex >= history.length){break;}
                    this.historyIndex++
                    histStr = this.history[this.historyIndex - 1]
                    line.setValue(histStr)
                    console.log("up",histStr, histStr.length)
                    // .hack
                    setTimeout(() => {line.setPosition(new monaco.Position(1, histStr.length + 1))}, 10)
                    break;
              
                  case monaco.KeyCode.DownArrow:
                    if(this.historyIndex === 1){
                      line.setValue("")
                      this.historyIndex = 0
                      break;
                    }
                    if(this.historyIndex === 0){break;}
                    this.historyIndex--
                    histStr = this.history[this.historyIndex - 1]
                    line.setValue(histStr)
                    console.log("down",histStr, histStr.length)
                    line.setPosition(new monaco.Position(1, histStr.length + 1))
                    break;
              
                  default:
                    prevent = false;
                }
                if(prevent){
                  event.preventDefault()
                }
            })
            editor.updateOptions({
                lineNumbers: (originalLineNumber : number) => {
                    if (this.replLines.has(originalLineNumber)) {
                        return "repl" + this.replLines.get(originalLineNumber);
                    }
                    return "";
                }
            })
            editor.addAction({
                id: "clearCode",
                label: "Clear",
                contextMenuGroupId: "GMod",
                keybindings: [],
                run: () => {this.Clear();}
            });
            // @ts-ignore
            editor.getContribution("editor.linkDetector").openerService.open = (
                url: string
            ) => {
                this.OpenURL(url);
            };
        },
        AddText(text: string) : void {
            this.editor!.setValue(`${this.editor!.getValue()}${text}\n`)
            this.editor!.revealLine(this.editor!.getModel()!.getLineCount())
        },
        Clear() : void {
            this.replLines.clear()
            this.editor!.setValue("")
        },
        Reset() : void {
          this.replCounter = 0
          this.Clear()
        },
        LoadAutocompleteState(state: string) : void {
            LoadAutocompletionData(state);
            autocompletionData.ClearAutocompleteCache();
        },
        ResetAutocompletion() : void {
            ResetAutocomplete()
        },
        // This function will load all the client autocomplete stuff
        // See ClientAutocompleteData for input format
        LoadAutocomplete(clData: ClientAutocompleteData): void {
            // Build caches first to avoid duplicates
            autocompletionData.interfaceValues = [];
            autocompletionData.GenerateMethodsCache();
            autocompletionData.GenerateGlobalCache();
            const values = clData.values.split("|");
            const fucns = clData.funcs.split("|");
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
            fucns.forEach((func: string) => {
                let name = func;
                let classFunction = false;
                let type = "Function";
                if (func.indexOf(".") !== -1) {
                    const split = func.split(".");
                    name = split.pop()!;
                    const tableName = split.join(".");
                    if (tables.indexOf(tableName) === -1) {
                        tables.push(tableName);
                    }
                } else if (func.indexOf(":") !== -1) {
                    const split = func.split(":");
                    name = split.pop()!;
                    classFunction = true;
                    type = "Method";
                }
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
            });
            tables.forEach((table) => {
                if (autocompletionData.modules.indexOf(table) === -1) {
                    autocompletionData.modules.push(table);
                }
            });
        },
    }
    
    // give gmod access to the extended interface
    globalThis.replinterface = maybeReplInterface;
}

export const replInterface = maybeReplInterface;