import * as monaco from "monaco-editor";

export abstract class GluaItem {
    constructor(jsonObj: object) {
        Object.assign(this, jsonObj)
    }
    abstract generateDocumentation(): monaco.IMarkdownString[];
    abstract getFullName(): string;
}
