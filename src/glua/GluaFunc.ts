import * as monaco from "monaco-editor";
import { GluaItem } from "./GluaItem";
import { funcWikiUrl, sourceUrl, wikiUrlFromLink } from "./wikiLinks";
import {
    cleanText,
    indentContinuation,
    joinSections,
    renderAdmonitions,
    renderExampleOutput,
    renderRichText,
} from "./docMarkdown";

export class GluaFunc extends GluaItem {
    declare name: string;
    declare parent: string;
    declare type: string;
    declare description: {
        text: string;
        internal?: string;
        deprecated?: string;
        removed?: string;
        note?: unknown;
        warning?: unknown;
        bug?: unknown;
        validate?: string;
    };
    declare realm: string;
    declare added: string | undefined;
    declare predicted: string | undefined;
    declare file: { text: string; line: string } | undefined;
    /** Wiki page path recorded by the scraper, when the dump is new enough. */
    declare link: string | undefined;
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
    /**
     * Name as the wiki writes it. Unlike getFullName (which is what you type,
     * and so stays bare for hooks and globals) this qualifies hooks and fields
     * with their parent, e.g. `GM:PlayerSpawn`.
     */
    getDisplayName(): string {
        const full = this.getFullName();
        const parent = this.parent ?? "";
        if (!parent || parent === "Global" || /[.:]/.test(full)) {
            return full;
        }
        return `${parent}${this.type === "libraryfield" ? "." : ":"}${full}`;
    }
    getWikiUrl(): string | undefined {
        return (
            wikiUrlFromLink(this.link) ??
            funcWikiUrl(this.type, this.parent, this.name)
        );
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
            return this.getDisplayName() + "()";
        }
        const args: string[] = [];
        this.args.forEach((elem, idx) => {
            const elemType = elem?.type ?? "any";
            const elemName = elem?.name ?? `arg${idx}`;
            let arg = `${elemType} ${elemName}`;
            if (elem?.default && elem.default !== "" && elem.default !== "nil") {
                arg += " = " + elem.default;
            }
            args.push(arg);
        });
        return `${this.getDisplayName()}(${args.join(", ")})`;
    }

    /** `Shared` · `deprecated` · `predicted` — the at-a-glance flags row. */
    private generateBadges(): string {
        const desc = this.description ?? { text: "" };
        const badges = [this.realm ?? "unknown"];
        if (desc.removed !== undefined) badges.push("removed");
        if (desc.deprecated !== undefined) badges.push("deprecated");
        if (desc.internal !== undefined) badges.push("internal");
        if (this.predicted) badges.push("predicted");
        return badges.map((badge) => `\`${badge}\``).join(" · ");
    }

    private generateSignature(): string {
        const returns = this.rets?.length
            ? `${this.rets.map((ret) => ret?.type ?? "any").join(", ")} `
            : "";
        return joinSections([
            `\`\`\`glua\n${returns}${this.generateUsageText()}\n\`\`\``,
            this.generateBadges(),
        ]);
    }

    private generateBody(): string {
        const desc = this.description ?? { text: "" };
        return joinSections([
            cleanText(desc.text),
            ...renderAdmonitions("Removed", desc.removed),
            ...renderAdmonitions("Deprecated", desc.deprecated),
            ...renderAdmonitions("Internal", desc.internal),
            ...renderAdmonitions("Warning", desc.warning),
            ...renderAdmonitions("Note", desc.note),
            ...renderAdmonitions("Bug", desc.bug),
            ...renderAdmonitions("Validate", desc.validate),
        ]);
    }

    private generateArguments(): string {
        if (!this.hasArgs()) return "";
        const items = this.args.map((arg, idx) => {
            const type = arg?.type ?? "any";
            const name = arg?.name ?? `arg${idx}`;
            const hasDefault =
                arg?.default && arg.default !== "" && arg.default !== "nil";
            const head = `${idx + 1}. \`${name}\` — *${type}*${
                hasDefault ? ` (default \`${arg.default}\`)` : ""
            }`;
            const text = renderRichText(arg?.text);
            return text
                ? `${head}\n\n   ${indentContinuation(text, 3)}`
                : head;
        });
        return `**Arguments**\n\n${items.join("\n")}`;
    }

    private generateReturns(): string {
        if (!this.rets?.length) return "";
        const items = this.rets.map((ret, idx) => {
            const head = `${idx + 1}. *${ret?.type ?? "any"}*${
                ret?.name ? ` \`${ret.name}\`` : ""
            }`;
            const text = renderRichText(ret?.text);
            return text
                ? `${head}\n\n   ${indentContinuation(text, 3)}`
                : head;
        });
        return `**Returns**\n\n${items.join("\n")}`;
    }

    private generateExamples(): string[] {
        if (!this.example?.length) return [];
        return this.example.map((elem, idx) => {
            const title =
                this.example.length > 1
                    ? `**Example ${idx + 1}**`
                    : "**Example**";
            return joinSections([
                title,
                renderRichText(elem?.description),
                `\`\`\`glua\n${elem?.code ?? ""}\n\`\`\``,
                renderExampleOutput(elem?.output),
            ]);
        });
    }

    private generateFooter(): string {
        const wikiUrl = this.getWikiUrl();
        const parts: string[] = [];
        if (wikiUrl) {
            parts.push(`[View on the Garry's Mod Wiki](${wikiUrl})`);
        }
        if (this.added) {
            parts.push(`added in \`${this.added}\``);
        }
        if (this.file?.text) {
            const line = this.file.line?.split("-")[0];
            const label = `${this.file.text}${line ? `:${line}` : ""}`;
            const source = sourceUrl(this.file);
            parts.push(
                source
                    ? `[source: \`${label}\`](${source})`
                    : `defined in \`${label}\``
            );
        }
        return parts.join(" · ");
    }

    generateDocumentation(): monaco.IMarkdownString[] {
        return [
            this.generateSignature(),
            this.generateBody(),
            this.generateArguments(),
            this.generateReturns(),
            ...this.generateExamples(),
            this.generateFooter(),
        ]
            .filter((section) => section.trim())
            .map((value) => ({ value }));
    }
}
