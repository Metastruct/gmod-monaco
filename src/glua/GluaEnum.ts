import * as monaco from "monaco-editor";
import { GluaItem } from "./GluaItem";

export class GluaEnum extends GluaItem {
    declare key: string;
    declare value: string;
    declare text: string;
    declare tableDesc: string;
    declare realm: string;
    declare realms: string[] | undefined;
    constructor(jsonObj: object) {
        super(jsonObj);
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        return [
            { value: `Value: \`${this.value ?? ""}\`` },
            { value: this.text || "No description" },
            { value: this.tableDesc || "No description" },
        ];
    }
    getDetail(): string {
        return `${this.text || ""}\n\n${this.tableDesc || "No description"}`;
    }
    getFullName() {
        return this.key ?? "";
    }
}
