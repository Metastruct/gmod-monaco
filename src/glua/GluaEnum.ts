import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { GluaItem } from "./GluaItem";

export class GluaEnum extends GluaItem {
    key!: string;
    value!: string;
    text!: string;
    tableDesc!: string;
    realm!: string;
    realms: string[] | undefined;
    constructor(jsonObj: object) {
        super(jsonObj);
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        return [
            { value: `Value: \`${this.value}\`` },
            { value: this.text || "No description" },
            { value: this.tableDesc || "No description" },
        ];
    }
    getDetail(): string {
        return `${this.text || ""}\n\n${this.tableDesc || "No description"}`;
    }
}
