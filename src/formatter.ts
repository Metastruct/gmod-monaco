import * as monaco from "monaco-editor";
import { formatText } from "lua-fmt";

export class GLuaFormatter
    implements monaco.languages.DocumentFormattingEditProvider {
    displayName?: string;

    provideDocumentFormattingEdits(
        model: monaco.editor.ITextModel,
        options: monaco.languages.FormattingOptions,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.TextEdit[]> {
        let code: string = model.getValue();
        return [
            {
                eol: monaco.editor.EndOfLineSequence.LF,
                range: model.getFullModelRange(),
                text: formatText(code, {
                    useTabs: !options.insertSpaces,
                    indentCount: options.tabSize,
                    quotemark: "double",
                }),
            },
        ];
    }
}
