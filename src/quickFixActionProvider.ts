import * as monaco from "monaco-editor";

interface QuickFixActionDictionary {
    [Key: string]: (
        model: monaco.editor.ITextModel,
        markerData: monaco.editor.IMarkerData
    ) => monaco.languages.CodeAction;
}

const quickFixActions: QuickFixActionDictionary = {
    // we probably need an AST parser for these, you can add simple quickfix actions though, if you're brave enough
    /*["211"]: ( // unused local variable
        model: monaco.editor.ITextModel,
        markerData: monaco.editor.IMarkerData
    ) => {
		let beforeText: string = model.getLineContent(markerData.startLineNumber).substring(0, markerData.startColumn);
		let afterText: string = model.getLineContent(markerData.startLineNumber).substring(markerData.endColumn + 1);
		if (beforeText.match("local\s+$") && afterText.match("^\s+= ")) {

		}

		//markerData.startLineNumber
        return {
            title: "Remove",
            diagnostic: [markerData],
            kind: "quickfix",
            edit: {
                edits: [
                    {
                        resource: model.uri,
                        edits: [
                            {
                                range: markerData,
                                text: "",
                            },
                        ],
                    },
                ],
            },
        };
    },*/
};

export class GLuaQuickFixActionProvider
    implements monaco.languages.CodeActionProvider {
    provideCodeActions(
        model: monaco.editor.ITextModel,
        range: monaco.Range,
        context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.CodeActionList> {
        let actions: monaco.languages.CodeAction[] = [];
        for (let markerData of context.markers) {
            if (markerData.code && quickFixActions[markerData.code]) {
                actions.push(
                    quickFixActions[markerData.code](model, markerData)
                );
            }
        }

        return {
            actions: actions,
            dispose: () => {},
        };
    }
}
