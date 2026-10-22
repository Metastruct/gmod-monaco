import * as monaco from "monaco-editor";

export abstract class GluaItem {
    constructor(jsonObj: object) {
        Object.assign(this, jsonObj)
    }
    abstract generateDocumentation(): monaco.IMarkdownString[];
    abstract getFullName(): string;
    /** Wiki page for this item, when one exists (live globals have none). */
    getWikiUrl(): string | undefined {
        return undefined;
    }
}
