import * as monaco from "monaco-editor";
import { autocompletionData } from "./autocompletionData";

type CompletionList = monaco.languages.CompletionList;
type IRange = monaco.IRange;

interface IdentifierContext {
    firstWord: monaco.editor.IWordAtPosition;
    fullIdentifier: string;
    lastChar: string;
}

const LOCAL_COMPLETIONS: monaco.languages.CompletionItem[] = [
    {
        label: "function",
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: "function",
        range: undefined!,
    },
    {
        label: "fun",
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: "function ${1:fname}(${2:...})\n${3:-- body}\nend",
        insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: undefined!,
    },
];

const EMPTY_COMPLETIONS: CompletionList = { suggestions: [], incomplete: false };

export class GLuaCompletionProvider
    implements monaco.languages.CompletionItemProvider {
    public triggerCharacters = [":", ".", "("];

    public provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): monaco.languages.ProviderResult<CompletionList> {
        const lineUntil = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column);
        const word = model.getWordUntilPosition(position);
        const insertRange = this.createInsertRange(position, word);
        const prevWord = model.getWordUntilPosition({
            lineNumber: position.lineNumber,
            column: word.startColumn - 1,
        });

        const { firstWord, fullIdentifier, lastChar } = this.parseIdentifierChain(
            model,
            position,
            lineUntil,
            prevWord
        );

        return this.getCompletions(
            insertRange,
            prevWord,
            firstWord,
            fullIdentifier,
            lastChar
        );
    }

    private createInsertRange(
        position: monaco.Position,
        word: monaco.editor.IWordAtPosition
    ): IRange {
        return {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
        };
    }

    private parseIdentifierChain(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        lineUntil: string,
        prevWord: monaco.editor.IWordAtPosition
    ): IdentifierContext {
        const lastChar = lineUntil.charAt(prevWord.endColumn - 1);
        let firstWord = prevWord;
        let fullIdentifier = firstWord.word;

        if (lastChar === "." || lastChar === "(") {
            while (lineUntil.charAt(firstWord.startColumn - 2) === ".") {
                firstWord = model.getWordUntilPosition({
                    lineNumber: position.lineNumber,
                    column: firstWord.startColumn - 1,
                });
                fullIdentifier = firstWord.word + "." + fullIdentifier;
            }
        }

        return { firstWord, fullIdentifier, lastChar };
    }

    private getCompletions(
        insertRange: IRange,
        prevWord: monaco.editor.IWordAtPosition,
        firstWord: monaco.editor.IWordAtPosition,
        fullIdentifier: string,
        lastChar: string
    ): CompletionList {
        if (lastChar === ":") {
            return autocompletionData.methodAutocomplete(insertRange);
        }

        if (lastChar === "." && this.isModuleAccess(fullIdentifier)) {
            return autocompletionData.globalAutocomplete({
                ...insertRange,
                startColumn: firstWord.startColumn,
            });
        }

        if (this.isHookCall(lastChar, firstWord.word, fullIdentifier)) {
            return autocompletionData.hookAutocomplete(insertRange, lastChar === "(");
        }

        if (prevWord.word === "local") {
            return this.createLocalCompletions(insertRange);
        }

        if (lastChar === ".") {
            return EMPTY_COMPLETIONS;
        }

        return autocompletionData.globalAutocomplete(insertRange);
    }

    private isModuleAccess(identifier: string): boolean {
        const rootModule = identifier.split(".")[0];
        return autocompletionData.modules.includes(rootModule);
    }

    private isHookCall(lastChar: string, firstWord: string, fullIdentifier: string): boolean {
        return (
            (lastChar === "(" || lastChar === '"') &&
            firstWord === "hook" &&
            fullIdentifier !== "hook.GetTable"
        );
    }

    private createLocalCompletions(insertRange: IRange): CompletionList {
        return {
            suggestions: LOCAL_COMPLETIONS.map((item) => ({
                ...item,
                range: insertRange,
            })),
            incomplete: false,
        };
    }
}
