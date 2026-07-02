import * as monaco from "monaco-editor";
import { LuaReport } from "./luacheckCompat";
import { EditorSession, EditorSessionObject } from "./editorSession";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import { autocompletionData } from "./autocompletionData";
import {
    BaseCallbacks,
    SharedInterfaceMethods,
    createSharedInterfaceMethods,
} from "./baseInterface";

declare global {
    namespace globalThis {
        var gmodinterface: GmodInterface | undefined;
        var editor: monaco.editor.IStandaloneCodeEditor | undefined;
    }
}

interface GmodInterface extends BaseCallbacks {
    OnCode(code: string, versionId: number): void;
    OnSessionSet(session: object): void;
    OnSessions(sessions: object[]): void;
    OnThemesLoaded(themes: string[]): void;
    OnLanguages(langs: string[], populatedLangs: monaco.languages.ILanguageExtensionPoint[]): void;
}

interface ExtendedGmodInterface extends GmodInterface, SharedInterfaceMethods {
    editor?: monaco.editor.IStandaloneCodeEditor;
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
    AddSnippet(name: string, code: string): void;
    LoadSnippets(snippets: { name: string; code: string }[]): void;
    GetSessions(): void;
}

let currentSession: EditorSession | undefined;
export const sessions: Map<string, EditorSession> = new Map();

// Monaco's WordHighlighter stores its decoration state inside the editor view
// state. Restoring that state calls WordHighlighter.restore(250), which arms a
// 250ms delayer. Switching sessions again before it fires disposes/cancels that
// delayer and rejects its (uncaught) promise with a benign "Canceled" error -
// this is what surfaces when switching sessions really fast. Word highlights
// are ephemeral and not worth carrying across a switch, so we drop that
// contribution's state before restoring: the delayer is never armed and fast
// switching becomes safe. Cursor and scroll position live elsewhere in the
// view state and are preserved.
const WORD_HIGHLIGHTER_CONTRIB_ID = "editor.contrib.wordHighlighter";

function restoreViewStateSafely(
    editor: monaco.editor.IStandaloneCodeEditor,
    viewState: monaco.editor.ICodeEditorViewState
): void {
    const contributionsState = viewState.contributionsState;
    if (contributionsState && WORD_HIGHLIGHTER_CONTRIB_ID in contributionsState) {
        // Shallow clone so the stored session view state isn't mutated.
        viewState = {
            ...viewState,
            contributionsState: { ...contributionsState },
        };
        delete viewState.contributionsState[WORD_HIGHLIGHTER_CONTRIB_ID];
    }
    editor.restoreViewState(viewState);
}

// The WordHighlighter also arms a short (50ms) delayer whenever the cursor or
// selection moves. Swapping the editor model disposes that highlighter, which
// cancels the pending delayer and rejects its promise with a benign "Canceled"
// error. Monaco discards that promise without a catch handler, so it surfaces
// as an unhandled rejection when a session is switched away within that window.
// Since we are the ones about to trigger the disposal, we attach a no-op catch
// to the pending promise first so the cancellation is handled, not logged.
function settlePendingWordHighlight(
    editor: monaco.editor.IStandaloneCodeEditor
): void {
    try {
        // Reaching into Monaco internals: the public API exposes no way to
        // observe or drain the highlighter's delayer. Guarded so any internal
        // change can never break session switching.
        const contrib = editor.getContribution(
            WORD_HIGHLIGHTER_CONTRIB_ID
        ) as unknown as {
            wordHighlighter?: { runDelayer?: { completionPromise?: Promise<unknown> } };
        } | null;
        const completionPromise =
            contrib?.wordHighlighter?.runDelayer?.completionPromise;
        completionPromise?.catch(() => {});
    } catch {
        // ignore - this is a best-effort suppression of benign cancellation noise
    }
}

interface Snippet {
    name: string;
    code: string;
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
                restoreViewStateSafely(this.editor!, viewState!);
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
            // Swapping the model disposes the current model's word highlighter;
            // handle its pending delayer first so fast switches don't leak a
            // benign "Canceled" rejection to the console.
            settlePendingWordHighlight(this.editor!);
            this.editor!.setModel(session.model);
            if (session!.viewState) {
                restoreViewStateSafely(this.editor!, session.viewState);
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
