import * as monaco from "monaco-editor";
import { LuaReport } from "./luacheckCompat";
import { EditorSession } from "./editorSession";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import { autocompletionData, ResetAutocomplete } from "./autocompletionData";
import { LoadAutocompletionData } from "./glua/Gwiki";

declare global {
    namespace globalThis {
        var gmodinterface: GmodInterface | ExtendedGmodInterface | undefined;
    }
}

interface GmodInterface {
    OnReady(): void;
    OnCode(code: string, versionId: number): void;
    OpenURL(url: string): void;
    OnSessionSet(session: object): void;
    OnAction(actionId: string): void;
    OnSessions(sesstions: object[]): void;
}

interface ExtendedGmodInterface extends GmodInterface {
    editor?: monaco.editor.IStandaloneCodeEditor;
    SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    SetCode(code: string): void;
    SetTheme(themeName: string): void;
    GotoLine(line: number): void;
    SubmitLuaReport(report: LuaReport): void;
    SaveSession(): void;
    RenameSession(newName: string, oldName?: string): void;
    SetSession(name: string): void;
    CreateSession(sessionObj: object): EditorSession | undefined;
    CloseSession(sessionName?: string, switchTo?: string): void;
    LoadSessions(list: object[], newActive?: string): void;
    AddAutocompleteValue(value: object): void;
    AddAutocompleteValues(valuesArray: object[]): void;
    LoadAutocomplete(clData: ClientAutocompleteData): void;
    AddSnippet(name: string, code: string): void;
    LoadSnippets(snippets: { name: string; code: string }[]): void;
    AddAction(action: EditorAction): void;
    LoadAutocompleteState(state: string): void;
    ResetAutocompletion(): void;
    GetSessions(): void;
}

let currentSession: EditorSession | undefined;
export const sessions: Map<string, EditorSession> = new Map();

interface ClientAutocompleteData {
    values: string; // Array of global non-table concatenated by '|'
    funcs: string; // Same as above but global functions and object methods
}

interface Snippet {
    name: string;
    code: string;
}

interface EditorAction {
    id: string;
    label: string;
    keyBindings: string[];
    contextMenuGroup: string;
}

let maybeGmodInterface: ExtendedGmodInterface | undefined;
if (globalThis.gmodinterface) {
    maybeGmodInterface = {
        ...globalThis.gmodinterface,

        SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
            this.editor = editor;

            editor.getModel()!.onDidChangeContent(() => {
                this.OnCode(
                    editor.getValue(),
                    editor.getModel()!.getAlternativeVersionId()
                );
            });
            // @ts-ignore
            editor.getContribution("editor.linkDetector").openerService.open = (
                url: string
            ) => {
                this.OpenURL(url);
            };
        },

        SetCode(code: string, keepViewState: boolean = false): void {
            let viewState: monaco.editor.ICodeEditorViewState;
            if (keepViewState) {
                viewState = this.editor!.saveViewState()!;
            }
            this.editor!.setValue(code);
            if (keepViewState) {
                this.editor!.restoreViewState(viewState!);
            }
            this.SaveSession();
        },

        SetTheme(themeName: string): void {
            monaco.editor.setTheme(themeName);
        },

        GotoLine(lineNumber: number): void {
            const position = {
                lineNumber,
                column: 1,
            };
            this.editor!.setPosition(position);
            this.editor!.revealPositionInCenterIfOutsideViewport(
                position,
                monaco.editor.ScrollType.Smooth
            );
        },

        // the LuaReport object must be passed from the gmod lua state :v
        SubmitLuaReport(report: LuaReport): void {
            let markers: monaco.editor.IMarkerData[] = report.events.map(e => {
                return {
                    message: e.message,
                    endColumn: e.endColumn,
                    startColumn: e.startColumn,
                    startLineNumber: e.line,
                    endLineNumber: e.line,
                    severity: e.isError
                        ? monaco.MarkerSeverity.Error
                        : monaco.MarkerSeverity.Warning,
                };
            });

            monaco.editor.setModelMarkers(
                this.editor!.getModel()!,
                "luacheck",
                markers
            );
        },

        SaveSession(): void {
            currentSession!.code = this.editor!.getValue();
            currentSession!.model = this.editor!.getModel()!;
            currentSession!.viewState = this.editor!.saveViewState()!;
            sessions.set(currentSession!.name, currentSession!);
        },

        RenameSession(newName: string, oldName?: string) {
            if (!currentSession || (oldName && !sessions.has(oldName))) {
                console.error("Cant find session to rename");
                return;
            }
            if (sessions.has(newName)) {
                console.error("Cant rename session, name already taken");
                return;
            }
            const session = oldName ? sessions.get(oldName) : currentSession;
            sessions.delete(session!.name);
            session!.name = newName;
            sessions.set(newName, session!);
        },
        SetSession(name: string) {
            if (!sessions.has(name)) {
                console.error(`Cant find session named ${name}`);
                return;
            }
            if (currentSession) {
                this.SaveSession();
            }
            const session = sessions.get(name)!;
            this.editor!.setModel(session.model);
            if (session!.viewState) {
                this.editor!.restoreViewState(session.viewState);
            }
            currentSession = session;
            this.OnSessionSet(session.getSerializable());
        },

        CreateSession(sessionObj: object): EditorSession | undefined {
            const session = EditorSession.fromObject(sessionObj);
            if (sessions.has(session.name)) {
                console.error(
                    `Cant add session named ${session.name}, name already taken`
                );
                return undefined;
            }
            sessions.set(session.name, session);
            this.SetSession(session.name);
            return session;
        },

        CloseSession(sessionName?: string, switchTo?: string): void {
            if (sessionName && !sessions.has(sessionName)) {
                console.error(
                    `Cant close session named ${sessionName}, it does not exist`
                );
                return;
            }
            const session = sessionName
                ? sessions.get(sessionName)!
                : currentSession!;
            sessions.delete(session.name);
            if (session === currentSession) {
                currentSession = undefined;
                if (switchTo && sessions.has(switchTo)) {
                    this.SetSession(switchTo);
                } else {
                    this.CreateSession({ code: "-- empty :c" });
                }
            }
            session.model.dispose();
        },

        LoadSessions(list: object[], newActive?: string): void {
            list.forEach(sessionObj => {
                const session = EditorSession.fromObject(sessionObj);
                sessions.set(session.name, session);
            });
            if (newActive) {
                this.SetSession(newActive);
            }
        },
        AddAutocompleteValue(value: object): void {
            autocompletionData.AddNewInterfaceValue(
                new GmodInterfaceValue(value)
            );
        },

        AddAutocompleteValues(valuesArray: object[]): void {
            valuesArray.forEach((val: any) => {
                autocompletionData.AddNewInterfaceValue(
                    new GmodInterfaceValue(val)
                );
            });
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
            tables.forEach(table => {
                if (autocompletionData.modules.indexOf(table) === -1) {
                    autocompletionData.modules.push(table);
                }
            });
        },

        AddSnippet(name: string, code: string): void {
            autocompletionData.snippets.push({
                name,
                code,
            });
            autocompletionData.ClearGlobalAutocompletionCache();
        },

        LoadSnippets(snippets: Snippet[]): void {
            snippets.forEach((snippet: Snippet) => {
                autocompletionData.snippets.push({
                    name: snippet.name,
                    code: snippet.code,
                });
            });
            autocompletionData.ClearGlobalAutocompletionCache();
        },

        AddAction(action: EditorAction): void {
            // {id: "Test", label: "Test", keyBindings: ["Mod.CtrlCmd | Key.F2"]}
            const newAction: monaco.editor.IActionDescriptor = {
                id: action.id,
                label: action.label,
                contextMenuGroupId: action.contextMenuGroup,
                keybindings: [],
                run: () => {
                    this.OnAction(action.id);
                },
            };
            if (action.keyBindings) {
                action.keyBindings.forEach((obj: string) => {
                    obj = obj.replace(/Mod\./g, "monaco.KeyMod.");
                    obj = obj.replace(/Key\./g, "monaco.KeyCode.");
                    // Not the best way to do it, but im too lazy
                    newAction.keybindings!.push(eval(obj));
                });
            }
            this.editor!.addAction(newAction);
        },

        LoadAutocompleteState(state: string): void {
            LoadAutocompletionData(state);
            autocompletionData.ClearAutocompleteCache();
        },
        ResetAutocompletion(): void {
            ResetAutocomplete();
        },

        GetSessions(): void {
            this.SaveSession();
            const serializableSessions: object[] = [];
            sessions.forEach((session: EditorSession) => {
                serializableSessions.push(session.getSerializable());
            });
            this.OnSessions(serializableSessions);
        },
    };

    // give gmod access to the extended interface
    globalThis.gmodinterface = maybeGmodInterface;
}

export const gmodInterface = maybeGmodInterface;
