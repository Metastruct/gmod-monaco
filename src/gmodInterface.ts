import * as monaco from "monaco-editor";
import { LuaReport } from "./luacheckCompat";
import { EditorSession, EditorSessionObject } from "./editorSession";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import { autocompletionData } from "./autocompletionData";
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
        var gmodinterface: GmodInterface | undefined;
        var editor: monaco.editor.IStandaloneCodeEditor | undefined;
    }
}

interface GmodInterface {
    OnReady(): void;
    OnCode(code: string, versionId: number): void;
    OpenURL(url: string): void;
    OnSessionSet(session: object): void;
    OnAction(actionId: string): void;
    OnSessions(sessions: object[]): void;
    OnThemesLoaded(themes: string[]): void;
    OnLanguages(langs: string[], populatedLangs: monaco.languages.ILanguageExtensionPoint[]): void;
    /** Called when Monaco requests dynamic autocomplete items */
    OnAutocompleteRequest?(context: AutocompleteRequestContext, requestId: number): void;
}

interface ExtendedGmodInterface extends GmodInterface {
    editor?: monaco.editor.IStandaloneCodeEditor;
    /** Pending dynamic autocomplete callbacks by request ID */
    _autocompleteCallbacks?: Map<number, (items: DynamicAutocompleteItem[]) => void>;
    /** Counter for autocomplete request IDs */
    _autocompleteRequestId?: number;
    SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    SetCode(code: string): void;
    SetTheme(themeName: string): void;
    SetLanguage(langId: string): void;
    GotoLine(line: number): void;
    SubmitLuaReport(report: LuaReport): void;
    SaveSession(): void;
    RenameSession(newName: string, oldName?: string): void;
    SetSession(name: string): void;
    CreateSession(sessionObj: object): EditorSession | undefined;
    CloseSession(sessionName?: string, switchTo?: string): void;
    LoadSessions(list: object[], newActive?: string): void;
    SetSessionCode(sessionName: string, code: string): void;
    AddAutocompleteValue(value: object): void;
    AddAutocompleteValues(valuesArray: object[]): void;
    LoadAutocomplete(clData: ClientAutocompleteData): void;
    AddSnippet(name: string, code: string): void;
    LoadSnippets(snippets: { name: string; code: string }[]): void;
    AddAction(action: EditorAction): void;
    LoadAutocompleteState(state: string): Promise<void>;
    ResetAutocompletion(): void;
    GetSessions(): void;
    /** Enable dynamic autocomplete - Gmod must implement OnAutocompleteRequest */
    EnableDynamicAutocomplete(timeoutMs?: number): void;
    /** Disable dynamic autocomplete */
    DisableDynamicAutocomplete(): void;
    /** Called by Gmod to provide autocomplete items for a request */
    ProvideAutocompleteItems(requestId: number, items: DynamicAutocompleteItem[]): void;
    /** Setup link opener for editor - from shared mixin */
    setupLinkOpener(editor: monaco.editor.IStandaloneCodeEditor): void;
}

let currentSession: EditorSession | undefined;
export const sessions: Map<string, EditorSession> = new Map();

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

/**
 * Parse a keybinding string like "Mod.CtrlCmd | Key.KeyS" into a Monaco keybinding number
 */
function parseKeybinding(keybindingStr: string): number {
    let result = 0;

    // Split by | and trim each part
    const parts = keybindingStr.split("|").map((p) => p.trim());

    for (const part of parts) {
        if (part.startsWith("Mod.")) {
            const modName = part.substring(4); // Remove "Mod."
            const mod = (monaco.KeyMod as unknown as Record<string, number>)[modName];
            if (mod !== undefined) {
                result |= mod;
            } else {
                console.warn(`[parseKeybinding] Unknown modifier: ${modName}`);
            }
        } else if (part.startsWith("Key.")) {
            const keyName = part.substring(4); // Remove "Key."
            const key = (monaco.KeyCode as unknown as Record<string, number>)[keyName];
            if (key !== undefined) {
                result |= key;
            } else {
                console.warn(`[parseKeybinding] Unknown key: ${keyName}`);
            }
        } else {
            console.warn(`[parseKeybinding] Invalid keybinding part: ${part}`);
        }
    }

    return result;
}

// Browser testing snippets - uncomment to enable testing in browser
// globalThis.gmodinterface = {
//     OnReady: () => console.log("[OnReady] Editor interface ready"),
//     OnCode: (code: string, versionId: number) => console.log("[OnCode]", { versionId, length: code.length }),
//     OpenURL: (url: string) => { console.log("[OpenURL]", url); window.open(url, "_blank"); },
//     OnSessionSet: (session: object) => console.log("[OnSessionSet]", session),
//     OnAction: (actionId: string) => console.log("[OnAction]", actionId),
//     OnSessions: (sessions: object[]) => console.log("[OnSessions]", sessions),
//     OnThemesLoaded: (themes: string[]) => console.log("[OnThemesLoaded]", themes),
//     OnLanguages: (langs: string[], populated: monaco.languages.ILanguageExtensionPoint[]) =>
//         console.log("[OnLanguages]", { langs, populated }),
// };

let maybeGmodInterface: ExtendedGmodInterface | undefined;
if (globalThis.gmodinterface) {
    maybeGmodInterface = {
        ...globalThis.gmodinterface,
        ...createSharedInterfaceMethods(),

        SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
            this.editor = editor;
            // Need to expose editor to gmod to have some more JS HACKS
            globalThis.editor = editor;

            editor.onDidChangeModelContent(() => {
                this.OnCode(
                    editor.getValue(),
                    editor.getModel()!.getAlternativeVersionId()
                );
            });
            this.setupLinkOpener(editor);
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
            if (currentSession) {
                this.SaveSession();
            }
        },

        SetTheme(themeName: string): void {
            monaco.editor.setTheme(themeName);
        },

        SetLanguage(langId: string): void {
            monaco.editor.setModelLanguage(this.editor!.getModel()!, langId);
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
            let markers: monaco.editor.IMarkerData[] = report.events.map(
                (e) => {
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
                }
            );

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
            monaco.editor.setModelMarkers(
                this.editor!.getModel()!,
                "luacheck",
                []
            );
        },

        CreateSession(
            sessionObj: EditorSessionObject
        ): EditorSession | undefined {
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

        LoadSessions(list: EditorSessionObject[], newActive?: string): void {
            list.forEach((sessionObj) => {
                const session = EditorSession.fromObject(sessionObj);
                sessions.set(session.name, session);
            });
            if (newActive) {
                this.SetSession(newActive);
            }
        },

        SetSessionCode(sessionName: string, code: string): void {
            if (!sessions.has(sessionName)) {
                console.error(
                    `Cant set code for session session named ${sessionName}, it does not exist`
                );
            }
            sessions.get(sessionName)?.model.setValue(code);
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
            if (!action.label) {
                console.warn("[AddAction] Skipping action without label:", action);
                return;
            }
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
                action.keyBindings.forEach((binding: string) => {
                    const parsed = parseKeybinding(binding);
                    if (parsed !== 0) {
                        newAction.keybindings!.push(parsed);
                    }
                });
            }
            this.editor!.addAction(newAction);
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
