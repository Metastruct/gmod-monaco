import * as monaco from "monaco-editor";
import { LuaReport } from "./luacheckCompat";

export class GmodInterface {
	private static editor: monaco.editor.IStandaloneCodeEditor;

	public static SetEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
		this.editor = editor;

		editor.getModel().onDidChangeContent(_ => {
			this.OnCode(editor.getValue());
		})
	}

	public static SetCode(code: string): void {
		this.editor.setValue(code);
	}

	public static GotoLine(line: number): void {
		this.editor.revealLineInCenter(line, monaco.editor.ScrollType.Smooth);
	}

	// the LuaReport object must be passed from the gmod lua state :v
	public static SubmitLuaReport(report: LuaReport): void {
		let markers: monaco.editor.IMarkerData[] = report.events.map(e => {
			return {
				message: e.message,
				endColumn: e.endColumn,
				startColumn: e.startColumn,
				startLineNumber: e.line,
				endLineNumber: e.line,
				severity: e.isError ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
			};
		});

		monaco.editor.setModelMarkers(this.editor.getModel(), "luacheck", markers);
	}

	// to override from gmod lua state
	public static OnReady(): void { }
	public static OnCode(code: string): void {}
}