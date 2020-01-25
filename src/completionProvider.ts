import * as monaco from "monaco-editor";

interface LookupItem {
    url: string;
    title: string;
    html: string;
    scope: string;
}

export class LuaCompletionProvider
    implements monaco.languages.CompletionItemProvider {
    private suggestionListAttempts: number;
    private suggestionList: monaco.languages.CompletionItem[];
    private isCachingSuggestionList: boolean;

    public triggerCharacters?: string[];

    constructor() {
        this.suggestionList = [];
        this.suggestionListAttempts = 0;
        this.isCachingSuggestionList = false;
    }

    private hasSuggestionListCached(): boolean {
        return (
            this.suggestionListAttempts >= 3 || this.suggestionList.length > 0
        );
    }

    private async cacheSuggestionList() {
        if (this.isCachingSuggestionList) return;

        try {
            this.isCachingSuggestionList = true;

            let resp: Response = await fetch("./glua_wiki_dump.json");
            let lookup: LookupItem[] = await resp.json();
            this.suggestionList = lookup.map((item: LookupItem) => {
                return {
                    kind: item.html.match("wiki.garrysmod.com/page/Enums")
                        ? monaco.languages.CompletionItemKind.Enum
                        : monaco.languages.CompletionItemKind.Function,
                    label: `[${item.scope}] ${item.title}`,
                    insertText: item.title,
                    description: item.html,
                    range: new monaco.Range(0, 0, 0, 0),
                };
            });
        } catch (err) {
            console.error(err);
            this.suggestionListAttempts++;
        } finally {
            this.isCachingSuggestionList = false;
        }
    }

    public provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
        if (!this.hasSuggestionListCached()) {
            this.cacheSuggestionList();
            // return an empty completion list, we dont have the data yet anyway
            return { suggestions: [] };
        }

        // TODO handle ctrl-space? show everything?

        const lineContent = model.getLineContent(position.lineNumber);
        const lineUntilPosition = lineContent
            .substr(0, position.column - 1)
            .toLowerCase();

        // regex for matching how much to replace
        const match = lineUntilPosition.match(/([a-z0-9.]+)$/);

        if (!match) {
            return { suggestions: [] };
        }

        // first capture group
        const word = match[1];

        // range tells the engine how much to replace
        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - word.length,
            endColumn: position.column,
        };

        return {
            suggestions: this.suggestionList.map(suggestion => ({
                ...suggestion,
                range,
            })),
        };
    }
}
