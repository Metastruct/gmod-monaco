import * as monaco from "monaco-editor";
import { autocompletionData } from "./autocompletionData";
import { replInterface } from "./replInterface";

type CompletionList = monaco.languages.CompletionList;
type IRange = monaco.IRange;

interface IdentifierContext {
    firstWord: monaco.editor.IWordAtPosition;
    fullIdentifier: string;
    lastChar: string;
}

/**
 * Context passed to Gmod when requesting dynamic autocomplete
 */
export interface AutocompleteRequestContext {
    /** The current word being typed (partial) */
    word: string;
    /** Full identifier chain (e.g., "ents.GetAll" when typing after "ents.") */
    fullIdentifier: string;
    /** The character before the current word (".", ":", or empty) */
    lastChar: string;
    /** Line number in the editor */
    lineNumber: number;
    /** Column position */
    column: number;
    /** Full line content up to cursor */
    lineContent: string;
}

/**
 * A dynamic autocomplete item provided by Gmod
 */
export interface DynamicAutocompleteItem {
    /** Display label */
    label: string;
    /** Insert text (if different from label) */
    insertText?: string;
    /** Kind: "Function", "Method", "Variable", "Value", etc. (Monaco CompletionItemKind keys) */
    kind?: keyof typeof monaco.languages.CompletionItemKind;
    /** Short detail text shown next to the label */
    detail?: string;
    /** Longer documentation */
    documentation?: string;
    /** If true, insertText is a snippet */
    isSnippet?: boolean;
}

type DynamicAutocompleteCallback = (items: DynamicAutocompleteItem[]) => void;
type DynamicAutocompleteProvider = (
    context: AutocompleteRequestContext,
    callback: DynamicAutocompleteCallback
) => void;

let dynamicAutocompleteProvider: DynamicAutocompleteProvider | undefined;
let dynamicAutocompleteTimeout = 100; // ms to wait for Gmod response

/**
 * Set the dynamic autocomplete provider function.
 * This should be called by gmodInterface/replInterface when Gmod registers a handler.
 */
export function setDynamicAutocompleteProvider(provider: DynamicAutocompleteProvider | undefined): void {
    dynamicAutocompleteProvider = provider;
}

/**
 * Set the timeout for waiting for dynamic autocomplete responses
 */
export function setDynamicAutocompleteTimeout(timeoutMs: number): void {
    dynamicAutocompleteTimeout = timeoutMs;
}

/**
 * Get the current dynamic provider (for use by interfaces)
 */
export function getDynamicAutocompleteProvider(): DynamicAutocompleteProvider | undefined {
    return dynamicAutocompleteProvider;
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

/**
 * Convert a kind string to Monaco CompletionItemKind.
 * Accepts Monaco CompletionItemKind key names: "Function", "Method", "Variable", "Value", etc.
 */
function parseCompletionKind(kind?: keyof typeof monaco.languages.CompletionItemKind): monaco.languages.CompletionItemKind {
    if (!kind) {
        return monaco.languages.CompletionItemKind.Value;
    }
    return monaco.languages.CompletionItemKind[kind] ?? monaco.languages.CompletionItemKind.Value;
}

export class GLuaCompletionProvider
    implements monaco.languages.CompletionItemProvider {
    public triggerCharacters = [":", ".", "("];

    public provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): monaco.languages.ProviderResult<CompletionList> {
        if (replInterface?.searchMode && replInterface.line?.getModel() === model) {
            return this.getHistoryCompletions(model, position);
        }
        const lineUntil = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column - 1);
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

        const staticCompletions = this.getCompletions(
            insertRange,
            prevWord,
            firstWord,
            fullIdentifier,
            lastChar
        );

        // If we have a dynamic provider, request additional completions
        if (dynamicAutocompleteProvider) {
            return this.getCompletionsWithDynamic(
                model,
                position,
                insertRange,
                word,
                fullIdentifier,
                lastChar,
                lineUntil,
                staticCompletions
            );
        }

        return staticCompletions;
    }

    private getCompletionsWithDynamic(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        insertRange: IRange,
        word: monaco.editor.IWordAtPosition,
        fullIdentifier: string,
        lastChar: string,
        lineUntil: string,
        staticCompletions: CompletionList
    ): Promise<CompletionList> {
        const context: AutocompleteRequestContext = {
            word: word.word,
            fullIdentifier,
            lastChar,
            lineNumber: position.lineNumber,
            column: position.column,
            lineContent: lineUntil,
        };

        return new Promise((resolve) => {
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(staticCompletions);
                }
            }, dynamicAutocompleteTimeout);

            dynamicAutocompleteProvider!(context, (items) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutId);

                if (!items || items.length === 0) {
                    resolve(staticCompletions);
                    return;
                }

                // Build a set of existing labels for deduplication
                const existingLabels = new Set<string>();
                for (const suggestion of staticCompletions.suggestions) {
                    const label = typeof suggestion.label === "string"
                        ? suggestion.label
                        : suggestion.label.label;
                    existingLabels.add(label);
                }

                // Filter out duplicates and convert dynamic items
                const dynamicSuggestions: monaco.languages.CompletionItem[] = [];
                for (const item of items) {
                    if (!existingLabels.has(item.label)) {
                        dynamicSuggestions.push(this.convertDynamicItem(item, insertRange));
                        existingLabels.add(item.label);
                    }
                }

                resolve({
                    suggestions: [...staticCompletions.suggestions, ...dynamicSuggestions],
                    incomplete: true, // Allow re-triggering as user types
                });
            });
        });
    }

    private convertDynamicItem(
        item: DynamicAutocompleteItem,
        range: IRange
    ): monaco.languages.CompletionItem {
        return {
            label: item.label,
            kind: parseCompletionKind(item.kind),
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText ?? item.label,
            insertTextRules: item.isSnippet
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
            range,
            sortText: "~~~" + item.label, // Sort dynamic items after static ones
        };
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

    private getHistoryCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): CompletionList {
        const query = model.getLineContent(1).toLowerCase();
        const fullRange: IRange = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 1,
            endColumn: model.getLineMaxColumn(1),
        };
        const seen = new Set<string>();
        const suggestions: monaco.languages.CompletionItem[] = [];
        const history = replInterface!.replHistory;
        for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            if (!entry || seen.has(entry)) continue;
            if (query && !entry.toLowerCase().includes(query)) continue;
            seen.add(entry);
            suggestions.push({
                label: entry,
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: entry,
                range: fullRange,
                filterText: query || entry,
                sortText: String(i).padStart(8, "0"),
            });
        }
        return { suggestions, incomplete: true };
    }
}
