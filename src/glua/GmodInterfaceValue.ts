import * as monaco from "monaco-editor";
import { GluaItem } from "./GluaItem";

export class GmodInterfaceValue extends GluaItem {
    declare fullname: string;
    declare name: string;
    declare classFunction: boolean | undefined;
    declare description: string | undefined;
    declare type: keyof typeof monaco.languages.CompletionItemKind;
    declare parent: string | undefined;
    constructor(jsonObj: object) {
        super(jsonObj);
        if (!this.name && this.fullname) {
            this.name = `${this.classFunction
                    ? this.fullname.split(":").pop() ?? ""
                    : this.fullname
                }`;
        }
    }
    getUsage(): string {
        if (this.type === "Function" || this.type === "Method") {
            return `${this.classFunction ? (this.name ?? "") : (this.fullname ?? "")}()`;
        }
        return this.fullname ?? "";
    }
    getFullName() {
        return this.fullname ?? "";
    }
    getCompletionKind(): monaco.languages.CompletionItemKind {
        if (!this.type) {
            return monaco.languages.CompletionItemKind.Value;
        }
        return monaco.languages.CompletionItemKind[this.type];
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        if (this.description) {
            return [{ value: `${this.description}` }];
        }
        return [];
    }
}
