import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { GluaItem } from "./GluaItem";

export class GluaFunc extends GluaItem {
    name!: string;
    parent!: string;
    type!: string;
    description!: {
        text: string;
        internal?: string;
        deprecated?: string;
    };
    realm!: string;
    file?: { text: string; line: string };
    args!: {
        text: string;
        name: string;
        type: string;
        default?: string;
    }[];
    rets!: {
        text: string;
        name: string;
        type: string;
    }[];
    example!: {
        description: string;
        code: string;
        output: string;
    }[];
    realms!: string[];
    objType!: string;
    constructor(jsonObj: object) {
        super(jsonObj);
    }
    hasArgs(): boolean {
        return this.args.length !== 0;
    }
    getDetail(): string {
        return (
            `${
                this.description.deprecated !== undefined ? "[deprecated] " : ""
            }${this.description.internal !== undefined ? "[internal] " : ""}[${
                this.realm
            }] ` + this.description.text.split("\n").shift()
        );
    }
    getSuggestDocumentation(): string {
        return this.description.text.split("\n").slice(1).join("\n");
    }
    getFullName(): string {
        if (this.type === "libraryfunc" && this.parent !== "Global") {
            return `${this.parent}.${this.name}`;
        } else if (this.type === "classfunc" || this.type === "panelfunc") {
            return `${this.parent}:${this.name}`;
        }
        return this.name;
    }

    generateUsageSnippet(): string {
        if (!this.hasArgs()) {
            return `${
                this.type === "classfunc" ||
                this.type === "hook" ||
                this.type === "panelfunc"
                    ? this.name
                    : this.getFullName()
            }()`;
        }
        const args: string[] = [];
        this.args.forEach((elem, idx) => {
            let arg = `${idx + 1}:${elem.type}_${elem.name}`;
            if (elem.default && elem.default !== "" && elem.default !== "nil") {
                arg += "=" + elem.default;
            }
            args.push("${" + arg + "}");
        });
        return `${
            this.type === "classfunc" ||
            this.type === "hook" ||
            this.type === "panelfunc"
                ? this.name
                : this.getFullName()
        }(${args.join(", ")})`;
    }
    generateUsageText(): string {
        if (!this.hasArgs()) {
            return this.getFullName() + "()";
        }
        const args: string[] = [];
        this.args.forEach((elem) => {
            let arg = `(${elem.type})${elem.name}`;
            if (elem.default && elem.default !== "" && elem.default !== "nil") {
                arg += "=" + elem.default;
            }
            args.push(arg);
        });
        return `${this.getFullName()}(${args.join(", ")})`;
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        const output = [
            { value: `**${this.generateUsageText()}**` },
            { value: `#### Realm: \`${this.realm}\`` },
            {
                value: `${
                    this.description.deprecated !== undefined
                        ? "### Deprecated\n" + this.description.deprecated
                        : ""
                }`,
            },
            {
                value: `${
                    this.description.internal !== undefined
                        ? "### Internal\n" + this.description.internal
                        : ""
                }`,
            },
            { value: `${this.description.text}` },
        ];
        if (this.hasArgs()) {
            let result = "## Arguments\n";
            this.args.forEach((arg, idx) => {
                let argStr = `${idx + 1}. (${arg.type}) ${arg.name}`;
                if (
                    arg.default &&
                    arg.default !== "" &&
                    arg.default !== "nil"
                ) {
                    argStr += "=" + arg.default;
                }
                result += `### ${argStr}\n##### ${arg.text.replace(
                    "\n",
                    "\n##### "
                )}\n`;
            });
            output.push({ value: result.trim() });
        }
        if (this.rets !== undefined && this.rets.length !== 0) {
            let result = "## Returns\n";
            this.rets.forEach((ret, idx) => {
                result += `### ${idx + 1}. ${
                    ret.type
                }\n##### ${ret.text.replace("\n", "\n##### ")}\n`;
            });
            output.push({ value: result.trim() });
        }
        if (this.example.length !== 0) {
            output.push({ value: `## Examples` });
            this.example.forEach((elem, idx) => {
                output.push({
                    value: `### Example ${idx + 1}.\n#### ${elem.description}`,
                });
                output.push({ value: `\`\`\`glua\n${elem.code}\n\`\`\`` });
                if (elem.output !== "" && elem.output !== undefined) {
                    output.push({ value: `##### Output\n\`${elem.output}\`` });
                }
            });
        }
        return output;
    }
}
