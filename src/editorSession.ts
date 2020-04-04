import * as monaco from "monaco-editor";

export class EditorSession {
    name: string = "Unnamed";
    code: string = "-- empty :c";
    language: string = "glua";
    model: monaco.editor.ITextModel = monaco.editor.createModel(
        this.code,
        this.language
    );
    viewState?: monaco.editor.ICodeEditorViewState;
    getSerializable(): object {
        return {
            name: this.name,
            code: this.code,
            language: this.language,
            viewState: this.viewState,
            vesrionId: this.model.getAlternativeVersionId(),
        };
    }
    static fromObject(sessionObj: { [x: string]: any }): EditorSession {
        const newSession = new EditorSession();
        for (const propName in sessionObj) {
            // @ts-ignore
            newSession[propName] = sessionObj[propName];
        }
        newSession.model.setValue(newSession.code);
        monaco.editor.setModelLanguage(newSession.model, newSession.language);
        return newSession;
    }
}
