import * as monaco from "monaco-editor";
import { GluaItem } from "./GluaItem";

export class GluaFunc extends GluaItem {
    declare name: string;
    declare parent: string;
    declare type: string;
    declare description: {
        text: string;
        internal?: string;
        deprecated?: string;
    };
    declare realm: string;
    declare file: { text: string; line: string } | undefined;
    declare args: {
        text: string;
        name: string;
        type: string;
        default?: string;
    }[];
    declare rets: {
        text: string;
        name: string;
        type: string;
    }[];
    declare example: {
        description: string;
        code: string;
        output: string;
    }[];
    declare realms: string[];
    declare objType: string;
    constructor(jsonObj: object) {
        super(jsonObj);
    }
    isValid(): boolean {
        return typeof this.name === "string" && this.name.length > 0;
    }
    hasArgs(): boolean {
        return this.args?.length > 0;
    }
    getDetail(): string {
        const desc = this.description ?? { text: "" };
        return (
            `${
                desc.deprecated !== undefined ? "[deprecated] " : ""
            }${desc.internal !== undefined ? "[internal] " : ""}[${
                this.realm ?? "unknown"
            }] ` + (desc.text?.split("\n").shift() ?? "")
        );
    }
    getSuggestDocumentation(): string {
        return this.description?.text?.split("\n").slice(1).join("\n") ?? "";
    }
    getFullName(): string {
        const name = this.name ?? "";
        const parent = this.parent ?? "";
        if (this.type === "libraryfunc" && parent !== "Global") {
            return `${parent}.${name}`;
        } else if (this.type === "classfunc" || this.type === "panelfunc") {
            return `${parent}:${name}`;
        }
        return name;
    }

    generateUsageSnippet(): string {
        const name = this.name ?? "";
        if (!this.hasArgs()) {
            return `${
                this.type === "classfunc" ||
                this.type === "hook" ||
                this.type === "panelfunc"
                    ? name
                    : this.getFullName()
            }()`;
        }
        const args: string[] = [];
        this.args.forEach((elem, idx) => {
            const elemType = elem?.type ?? "any";
            const elemName = elem?.name ?? `arg${idx}`;
            let arg = `${idx + 1}:${elemType}_${elemName}`;
            if (elem?.default && elem.default !== "" && elem.default !== "nil") {
                arg += "=" + elem.default;
            }
            args.push("${" + arg + "}");
        });
        return `${
            this.type === "classfunc" ||
            this.type === "hook" ||
            this.type === "panelfunc"
                ? name
                : this.getFullName()
        }(${args.join(", ")})`;
    }
    generateUsageText(): string {
        if (!this.hasArgs()) {
            return this.getFullName() + "()";
        }
        const args: string[] = [];
        this.args.forEach((elem) => {
            const elemType = elem?.type ?? "any";
            const elemName = elem?.name ?? "arg";
            let arg = `(${elemType})${elemName}`;
            if (elem?.default && elem.default !== "" && elem.default !== "nil") {
                arg += "=" + elem.default;
            }
            args.push(arg);
        });
        return `${this.getFullName()}(${args.join(", ")})`;
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        const desc = this.description ?? { text: "" };
        const output = [
            { value: `**${this.generateUsageText()}**` },
            { value: `#### Realm: \`${this.realm ?? "unknown"}\`` },
            {
                value: `${
                    desc.deprecated !== undefined
                        ? "### Deprecated\n" + desc.deprecated
                        : ""
                }`,
            },
            {
                value: `${
                    desc.internal !== undefined
                        ? "### Internal\n" + desc.internal
                        : ""
                }`,
            },
            { value: `${desc.text ?? ""}` },
        ];
        if (this.hasArgs()) {
            let result = "## Arguments\n";
            this.args.forEach((arg, idx) => {
                const argType = arg?.type ?? "any";
                const argName = arg?.name ?? `arg${idx}`;
                const argText = arg?.text ?? "";
                let argStr = `${idx + 1}. (${argType}) ${argName}`;
                if (
                    arg?.default &&
                    arg.default !== "" &&
                    arg.default !== "nil"
                ) {
                    argStr += "=" + arg.default;
                }
                result += `### ${argStr}\n##### ${argText.replace(
                    "\n",
                    "\n##### "
                )}\n`;
            });
            output.push({ value: result.trim() });
        }
        if (this.rets?.length > 0) {
            let result = "## Returns\n";
            this.rets.forEach((ret, idx) => {
                const retType = ret?.type ?? "any";
                const retText = ret?.text ?? "";
                result += `### ${idx + 1}. ${retType}\n##### ${retText.replace("\n", "\n##### ")}\n`;
            });
            output.push({ value: result.trim() });
        }
        if (this.example?.length > 0) {
            output.push({ value: `## Examples` });
            this.example.forEach((elem, idx) => {
                output.push({
                    value: `### Example ${idx + 1}.\n#### ${elem?.description ?? ""}`,
                });
                output.push({ value: `\`\`\`glua\n${elem?.code ?? ""}\n\`\`\`` });
                if (elem?.output && elem.output !== "") {
                    output.push({ value: `##### Output\n\`${elem.output}\`` });
                }
            });
        }
        return output;
    }
}
