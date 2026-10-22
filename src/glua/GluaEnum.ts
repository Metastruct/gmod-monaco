import * as monaco from "monaco-editor";
import { GluaItem } from "./GluaItem";
import { enumWikiUrl } from "./wikiLinks";
import {
    cleanText,
    joinSections,
    renderAdmonitions,
    renderRichText,
} from "./docMarkdown";

export class GluaEnum extends GluaItem {
    declare key: string;
    declare value: string;
    declare text: string;
    declare tableDesc: unknown;
    declare realm: string;
    declare realms: string[] | undefined;
    declare added: string | undefined;
    declare deprecated: unknown;
    declare note: unknown;
    declare warning: unknown;
    declare bug: unknown;
    /** Wiki page of the enum table this key belongs to, resolved while parsing. */
    declare wikiPage: string | undefined;
    constructor(jsonObj: object) {
        super(jsonObj);
    }
    getWikiUrl(): string | undefined {
        return enumWikiUrl(this.wikiPage);
    }
    generateDocumentation(): monaco.IMarkdownString[] {
        const signature = joinSections([
            `\`\`\`glua\n${this.key ?? ""} = ${this.value ?? ""}\n\`\`\``,
            this.realm ? `\`${this.realm}\`` : "",
        ]);
        const body = joinSections([
            cleanText(this.text),
            ...renderAdmonitions("Deprecated", this.deprecated),
            ...renderAdmonitions("Warning", this.warning),
            ...renderAdmonitions("Note", this.note),
            ...renderAdmonitions("Bug", this.bug),
        ]);
        const wikiUrl = this.getWikiUrl();
        const footer = [
            wikiUrl
                ? `[View \`${this.wikiPage}\` on the Garry's Mod Wiki](${wikiUrl})`
                : "",
            this.added ? `added in \`${this.added}\`` : "",
        ]
            .filter(Boolean)
            .join(" · ");
        return [signature, body, renderRichText(this.tableDesc), footer]
            .filter((section) => section.trim())
            .map((value) => ({ value }));
    }
    getDetail(): string {
        return joinSections([
            cleanText(this.text),
            renderRichText(this.tableDesc),
        ]) || "No description";
    }
    getFullName() {
        return this.key ?? "";
    }
}
