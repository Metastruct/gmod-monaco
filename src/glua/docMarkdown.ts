import { issueUrl, linkifyWikiReferences } from "./wikiLinks";

// A line that opens or closes a fenced block: up to 3 spaces, then 3+ of ` or ~.
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Wiki example output sometimes carries a fence that never closes — a stray
 * trailing ```, a one-line ```foo``` that reads as an opener, or a block opened
 * with ```` and closed with ```. Any of those swallow every section after them
 * in the hover, so close whatever is still open.
 */
export function balanceFences(markdown: string): string {
    let open: string | undefined;
    for (const line of markdown.split("\n")) {
        const match = FENCE_LINE.exec(line);
        if (!match) continue;
        const [, marker, rest] = match;
        if (open === undefined) {
            open = marker;
        } else if (
            marker[0] === open[0] &&
            marker.length >= open.length &&
            !rest.trim()
        ) {
            open = undefined;
        }
    }
    return open === undefined ? markdown : `${markdown}\n${open}`;
}

export interface Admonition {
    text: string;
    issue?: string;
}

/**
 * Wiki prose arrives with the source XML's tab indentation still in it, which
 * markdown would turn into code blocks. Trailing double-spaces are kept: the
 * wiki uses them as deliberate hard line breaks.
 */
export function cleanText(text: unknown): string {
    if (typeof text !== "string" || !text) return "";
    return balanceFences(
        linkifyWikiReferences(
            text
                .replace(/\r\n/g, "\n")
                .split("\n")
                .map((line) => {
                    const body = line.replace(/\t/g, " ");
                    const indent = body.length - body.trimStart().length;
                    return indent >= 4 ? body.trimStart() : body;
                })
                .join("\n")
                .trim(),
        ),
    );
}

/** `note`/`warning`/`bug` are a string, an object or a list of either. */
export function toAdmonitions(value: unknown): Admonition[] {
    if (!value) return [];
    if (typeof value === "string") {
        return value.trim() ? [{ text: value }] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap(toAdmonitions);
    }
    if (typeof value === "object") {
        const obj = value as { text?: unknown; issue?: unknown };
        if (typeof obj.text === "string" && obj.text.trim()) {
            return [
                {
                    text: obj.text,
                    issue:
                        typeof obj.issue === "string" ? obj.issue : undefined,
                },
            ];
        }
    }
    return [];
}

function blockquote(markdown: string): string {
    return markdown
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
}

export function renderAdmonitions(label: string, value: unknown): string[] {
    return toAdmonitions(value).map((item) => {
        const issue = item.issue
            ? ` ([issue #${item.issue}](${issueUrl(item.issue)}))`
            : "";
        return blockquote(`**${label}**${issue}\n\n${cleanText(item.text)}`);
    });
}

/**
 * Wiki prose arrives either as a bare string or as a block carrying its own
 * `note`/`warning`/`bug` siblings — example descriptions and enum table
 * descriptions use the latter.
 */
export function renderRichText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return cleanText(value);
    if (Array.isArray(value)) return joinSections(value.map(renderRichText));
    if (typeof value !== "object") return "";
    const block = value as Record<string, unknown>;
    return joinSections([
        cleanText(block.text),
        ...renderAdmonitions("Deprecated", block.deprecated),
        ...renderAdmonitions("Warning", block.warning),
        ...renderAdmonitions("Note", block.note),
        ...renderAdmonitions("Bug", block.bug),
    ]);
}

/** Indent every line but the first, so multi-line text stays inside its list item. */
export function indentContinuation(text: string, spaces: number): string {
    const pad = " ".repeat(spaces);
    return text.split("\n").join(`\n${pad}`);
}

export function joinSections(parts: (string | undefined)[]): string {
    return parts.filter((part) => part && part.trim()).join("\n\n");
}

/** Example output is sometimes a multi-line block, sometimes already fenced. */
export function renderExampleOutput(output: unknown): string {
    if (typeof output !== "string") return "";
    const trimmed = output.trim();
    if (!trimmed) return "";
    // A one-line ```foo``` is an inline span, not a fence: left alone, markdown
    // reads "foo" as the fence's info string and the text disappears.
    const inline = /^```(.*)```$/.exec(trimmed);
    if (inline) return `Output: \`${inline[1].trim()}\``;
    if (trimmed.indexOf("```") !== -1) {
        return `Output:\n\n${balanceFences(trimmed)}`;
    }
    if (trimmed.indexOf("\n") !== -1) {
        return `Output:\n\n\`\`\`\n${trimmed}\n\`\`\``;
    }
    return `Output: \`${trimmed}\``;
}
