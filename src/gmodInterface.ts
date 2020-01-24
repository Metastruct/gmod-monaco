import * as monaco from "monaco-editor";
import { LuaReport } from "./luacheckCompat";

declare global {
    namespace globalThis {
        var gmodinterface: GmodInterface | ExtendedGmodInterface | undefined;
    }
}

interface GmodInterface {
    OnReady(): void;
    OnCode(code: string): void;
}

interface ExtendedGmodInterface extends GmodInterface {
    editor?: monaco.editor.IStandaloneCodeEditor;
    SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    SetCode(code: string): void;
    GotoLine(line: number): void;
    SubmitLuaReport(report: LuaReport): void;
}

let maybeGmodInterface: ExtendedGmodInterface | undefined;
if (globalThis.gmodinterface) {
    maybeGmodInterface = {
        ...globalThis.gmodinterface,

        SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
            this.editor = editor;

            editor.getModel()!.onDidChangeContent(() => {
                this.OnCode(editor.getValue());
            });
        },

        SetCode(code: string): void {
            this.editor!.setValue(code);
        },

        GotoLine(line: number): void {
            this.editor!.revealLineInCenter(
                line,
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
    };

    // give gmod access to the extended interface
    globalThis.gmodinterface = maybeGmodInterface;
}

export const gmodInterface = maybeGmodInterface;
