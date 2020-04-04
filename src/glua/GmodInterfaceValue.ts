import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { GluaItem } from "./GluaItem";

export class GmodInterfaceValue extends GluaItem {
    fullname!: string;
    name!: string;
    classFunction?: boolean;
    description?: string;
    type!: string;
    constructor(jsonObj: object) {
        super(jsonObj);
        if (!name) {
            this.name = `${
                this.classFunction
                    ? this.fullname.split(":").pop()
                    : this.fullname
            }`;
        }
    }
    getUsage(): string {
        if (this.type === "Function" || this.type === "Method") {
            return `${this.classFunction ? this.name : this.fullname}()`;
        }
        return this.fullname;
    }
    getCompletionKind(): monaco.languages.CompletionItemKind {
        if (this.type in monaco.languages.CompletionItemKind) {
            // @ts-ignore
            // Have no idea how to do this properly
            return monaco.languages.CompletionItemKind[this.type];
        }
        return monaco.languages.CompletionItemKind.Value;
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        if (this.description) {
            return [{ value: `${this.description}` }];
        }
        return [];
    }
}
