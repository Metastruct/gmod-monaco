import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export abstract class GluaItem {
    constructor(jsonObj: object) {
        for (const propName in jsonObj) {
            // Will ts-ignore this bc our json is dirty
            // @ts-ignore
            this[propName] = jsonObj[propName];
        }
        // Object.assign(this, jsonObj)
    }
    abstract generateDocumentation(): monaco.IMarkdownString[];
    abstract getFullName(): string;
}
