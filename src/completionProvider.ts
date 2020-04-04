import * as monaco from "monaco-editor";
import { autocompletionData } from "./autocompletionData";

export class GLuaCompletionProvider
implements monaco.languages.CompletionItemProvider {
    
    public triggerCharacters?: [":", ".","("];
        
    public provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
        const lineUntil = model.getLineContent(position.lineNumber).substring(0, position.column);
        const word = model.getWordUntilPosition(position);
        const insertRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
        };
        const prevWord = model.getWordUntilPosition({
            lineNumber: position.lineNumber,
            column: word.startColumn - 1
        })
        const lastChar = lineUntil.charAt(prevWord.endColumn - 1);
        let firstIdentifierWord = prevWord
        let currentIdentifier = firstIdentifierWord.word
        if(lastChar === "."  || lastChar === "(") {
            while(true) {
                if(lineUntil.charAt(firstIdentifierWord.startColumn-2) !== ".") {
                    break
                }
                firstIdentifierWord =  model.getWordUntilPosition({
                    lineNumber: position.lineNumber,
                    column: firstIdentifierWord.startColumn - 1
                })
                currentIdentifier = firstIdentifierWord.word + "." + currentIdentifier
            }
        }
        if (lastChar === ":") {
            return autocompletionData.methodAutocomplete(insertRange)
        } else if (lastChar === "." && autocompletionData.modules.indexOf(currentIdentifier.split(".")[0]) !== -1) {
            insertRange.startColumn = firstIdentifierWord.startColumn;
            return autocompletionData.globalAutocomplete(insertRange)
        } else if(( lastChar === "(" || lastChar === "\"" ) && firstIdentifierWord.word === "hook" && currentIdentifier !== "hook.GetTable") {
            return autocompletionData.hookAutocomplete(insertRange, lastChar === "(")
        } else if (prevWord.word === "local"){
            return {
                suggestions: [
                    {
                        label: "function",
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: "function",
                        range: insertRange
                    },
                    {
                        label: "fun",
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: "function ${1:fname}(${2:...})\n${3:-- body}\nend",
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range: insertRange,
                    },
                ],
                incomplete: false
            }
        } else if(lastChar === ".") {
            return {
                suggestions: [],
                incomplete: false
            }
        } else {
            return autocompletionData.globalAutocomplete(insertRange)
        }
    }
}