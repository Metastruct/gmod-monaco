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

        let word = model.getWordAtPosition(position);
        let replace: monaco.Range = word
            ? new monaco.Range(
                  position.lineNumber,
                  word.startColumn,
                  position.lineNumber,
                  word.endColumn
              )
            : monaco.Range.fromPositions(position);
        let insert: monaco.Range = replace.setEndPosition(
            position.lineNumber,
            position.column
        );

        return {
            suggestions: this.suggestionList
                .filter(
                    (item: monaco.languages.CompletionItem) =>
                        word && item.label.indexOf(word.word) !== -1
                )
                .map((item: monaco.languages.CompletionItem) => {
                    return {
                        kind: item.kind,
                        label: item.label,
                        insertText: item.insertText,
                        range: { insert, replace },
                    };
                }),
        };
    }
}
