import * as monaco from "monaco-editor";
import { autocompletionData } from "./autocompletionData";
import { GluaItem } from "./glua/GluaItem";

export class GLuaHoverProvider implements monaco.languages.HoverProvider {
    provideHover(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.Hover> {
        const lineUntil = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column);
        const word = model.getWordAtPosition(position);
        if (!word) {
            return;
        }
        let firstIdentifierWord = word;
        let currentIdentifier = word.word;
        if (lineUntil.charAt(word.startColumn - 2) === ".") {
            while (true) {
                if (
                    lineUntil.charAt(firstIdentifierWord.startColumn - 2) !==
                    "."
                ) {
                    break;
                }
                firstIdentifierWord = model.getWordUntilPosition({
                    lineNumber: position.lineNumber,
                    column: firstIdentifierWord.startColumn - 1,
                });
                currentIdentifier =
                    firstIdentifierWord.word + "." + currentIdentifier;
            }
        } else if (
            lineUntil.charAt(word.startColumn - 2) === ":" &&
            autocompletionData.methodsLookup.has(word.word)
        ) {
            let conent: monaco.IMarkdownString[] = [];
            autocompletionData.methodsLookup
                .get(word.word)
                ?.forEach((method: GluaItem) => {
                    conent = conent.concat(method.generateDocumentation());
                });
            return {
                contents: conent,
                range: new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                ),
            };
        }
        if (!autocompletionData.valuesLookup.has(currentIdentifier)) {
            return {
                contents: [],
                range: new monaco.Range(
                    position.lineNumber,
                    firstIdentifierWord.startColumn,
                    position.lineNumber,
                    word.endColumn
                ),
            };
        }
        return {
            contents: autocompletionData.valuesLookup
                .get(currentIdentifier)
                ?.generateDocumentation() || [{ value: "No documentation" }],
            range: new monaco.Range(
                position.lineNumber,
                firstIdentifierWord.startColumn,
                position.lineNumber,
                word.endColumn
            ),
        };
    }
}
