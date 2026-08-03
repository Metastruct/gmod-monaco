import * as monaco from "monaco-editor";

export class GLuaFormatter
    implements monaco.languages.DocumentFormattingEditProvider {
    displayName?: string;

    // lua-fmt (and its luaparse + diff deps, ~250KB) are only needed when the
    // user actually formats. Import it lazily so it stays off the first-paint
    // path and loads as its own chunk on the first format/paste/type.
    async provideDocumentFormattingEdits(
        model: monaco.editor.ITextModel,
        options: monaco.languages.FormattingOptions,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.TextEdit[]> {
        const { formatText } = await import("lua-fmt");
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
