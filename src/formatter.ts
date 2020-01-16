import { formatText } from "lua-fmt";
import * as monaco from "monaco-editor";

export class LuaFormatter implements monaco.languages.DocumentFormattingEditProvider {
	displayName?: string;

	provideDocumentFormattingEdits(model: monaco.editor.ITextModel, options: monaco.languages.FormattingOptions, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.TextEdit[]> {
		let code: string = model.getValue();
		let range: monaco.IRange = model.getFullModelRange();
		return [{
			range: range,
			text: formatText(code)
		}]
	}
}