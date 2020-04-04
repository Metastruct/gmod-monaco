import * as monaco from "monaco-editor";

export interface EditorSessionObject {
    name: string;
    code: string;
    language: string;
    viewState?: monaco.editor.ICodeEditorViewState;
    versionId: number;
}

export class EditorSession implements EditorSessionObject {
    name: string = "Unnamed";
    code: string = "-- empty :c";
    language: string = "glua";
    model: monaco.editor.ITextModel = monaco.editor.createModel(
        this.code,
        this.language
    );
    viewState?: monaco.editor.ICodeEditorViewState;
    versionId: number = 0;
    getSerializable(): EditorSessionObject {
        return {
            name: this.name,
            code: this.code,
            language: this.language,
            viewState: this.viewState,
            versionId: this.model.getAlternativeVersionId(),
        };
    }
    static fromObject(sessionObj: EditorSessionObject): EditorSession {
        const newSession = Object.assign(new EditorSession(), sessionObj);
        newSession.model.setValue(newSession.code);
        monaco.editor.setModelLanguage(newSession.model, newSession.language);
        return newSession;
    }
}
