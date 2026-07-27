import * as monaco from "monaco-editor";
import { FetchGwiki } from "./glua/Gwiki";
import {
    BaseCallbacks,
    SharedInterfaceMethods,
    createSharedInterfaceMethods,
} from "./baseInterface";
import { refreshReplFolding } from "./replFoldingProvider";
import { colorClassName, ReplColor } from "./replColors";

/** Identifier for a foldable reply block. */
export type ReplId = string | number;
/**
 * One argument of AddColoredText: a color (paints following strings), a string
 * (emitted with the current color), or `false` to reset to default tokenizer
 * coloring.
 */
export type ReplSegment = string | ReplColor | false;

function isReplColor(value: unknown): value is ReplColor {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as ReplColor).r === "number" &&
        typeof (value as ReplColor).g === "number" &&
        typeof (value as ReplColor).b === "number"
    );
}

declare global {
    namespace globalThis {
        var replinterface: ReplInterface | ExtendedReplInterface | undefined;
    }
}

// Prompt label shown before the input line, per editor language. Falls back to
// "<langId>>" for any language without an explicit entry.
const LANGUAGE_PROMPTS: Record<string, string> = {
    glua: "lua>",
    javascript: "js>",
};
function promptForLanguage(langId: string): string {
    return LANGUAGE_PROMPTS[langId] ?? `${langId}>`;
}
interface ReplInterface extends BaseCallbacks {
    OnCode(code: string): void;
}

interface ExtendedReplInterface extends ReplInterface, SharedInterfaceMethods {
    editor?: monaco.editor.IStandaloneCodeEditor;
    line?: monaco.editor.IStandaloneCodeEditor;
    replLines: Map<number, number>;
    replHistory: string[];
    replHistoryIndex: number;
    replCounter: number;
    /** Finalized folding ranges for completed repl entries (1-based lines). */
    replFoldRanges: Array<{ start: number; end: number }>;
    /** Start lines of repl entries still awaiting their answer (FIFO). */
    replPendingStarts: number[];
    /** Currently-open id-based reply blocks: id -> stack of 1-based start lines. */
    replOpenReplies: Map<ReplId, number[]>;
    /** Ids of the current separator decorations in the output editor. */
    replDecorations: string[];
    /** Ids of inline color decorations from AddColoredText (never rebuilt). */
    replColorDecorations: string[];
    suggestWidget?: any;
    /** True while the input line is empty; gates the target-cycle Tab action. */
    replInputEmpty?: monaco.editor.IContextKey<boolean>;
    searchMode: boolean;
    searchModePrevValue: string;
    /** Prompt label for the currently active language (e.g. "lua>", "js>") */
    prompt: string;

    SetEditors(
        editor: monaco.editor.IStandaloneCodeEditor,
        line: monaco.editor.IStandaloneCodeEditor
    ): void;
    SetWidget(widget: object): void;
    SetLanguage(langId: string): void;
    /**
     * Append text to the output editor.
     * @param isReplAnswer when true, this text is the result of a repl input and
     *   closes the oldest open entry, finalizing its collapsible fold range.
     *   Loose console output (prints, errors) should omit it.
     */
    AddText(text: string, isReplAnswer?: boolean): void;
    /**
     * Append text with per-segment colors, MsgC-style. Arguments are a stream of
     * colors and strings: a color paints the strings that follow it, and `false`
     * resets to the default tokenizer coloring. An optional trailing boolean is
     * isReplAnswer (like AddText): when true it closes the pending repl entry's
     * fold. Standalone output can also be grouped with BeginReply/EndReply.
     */
    AddColoredText(...args: Array<ReplSegment | boolean>): void;
    /** Close the oldest open repl entry's fold. Internal (shared by Add*Text). */
    _finalizeReplAnswer(): void;
    /** Open a collapsible reply block; blocks may nest. */
    BeginReply(id: ReplId): void;
    /** Finalize the reply block opened with the given id (unknown id: no-op). */
    EndReply(id: ReplId): void;
    /** Insert text at end of output, returning the start position. Internal. */
    _appendOutput(text: string): monaco.Position;
    updateReplDecorations(): void;
    Clear(): void;
    Reset(): void;
    EnterSearchMode(keepValue?: boolean): void;
    ExitSearchMode(restoreValue: boolean): void;
    SetHistory(entries: string[]): void;
    AddHistory(entry: string): void;
}

// Browser testing snippets - uncomment to enable testing in browser
// globalThis.replinterface = {
//     OpenURL: (url: string) => { console.log("[OpenURL]", url); window.open(url, "_blank"); },
//     OnReady: () => console.log("[OnReady] REPL interface ready"),
//     OnCode: (code: string) => {
//         console.log("[OnCode]", code);
//         // Simulate execution result
//         setTimeout(() => {
//             if (globalThis.replinterface && "AddText" in globalThis.replinterface) {
//                 (globalThis.replinterface as ExtendedReplInterface).AddText(`> ${code}\n= [result]`);
//             }
//         }, 100);
//     },
// };

let maybeReplInterface: ExtendedReplInterface | undefined;
if (globalThis.replinterface) {
    maybeReplInterface = {
        ...globalThis.replinterface,
        ...createSharedInterfaceMethods(),

        replLines: new Map<number, number>(),
        replHistory: [],
        replHistoryIndex: 0,
        replCounter: 0,
        replFoldRanges: [],
        replPendingStarts: [],
        replOpenReplies: new Map<ReplId, number[]>(),
        replDecorations: [],
        replColorDecorations: [],
        searchMode: false,
        searchModePrevValue: "",
        prompt: "lua>",

        SetEditors(
            editor: monaco.editor.IStandaloneCodeEditor,
            line: monaco.editor.IStandaloneCodeEditor
        ): void {
            this.editor = editor;
            this.line = line;
            this.replInputEmpty = line.createContextKey<boolean>(
                "replInputEmpty",
                true
            );
            line.onDidChangeModelContent((event) => {
                const content = line.getValue();
                this.replInputEmpty?.set(content.trim() === "");
                // Bash-style "!!" opens history search. The "!!" stays in the
                // line (the completion provider ignores it when filtering) and
                // is replaced along with the rest of the line when an entry is
                // accepted. "!! query" (e.g. pasted whole) also triggers, with
                // everything after the space used as the search query.
                if (
                    !this.searchMode &&
                    (content === "!!" || content.startsWith("!! "))
                ) {
                    this.EnterSearchMode(true);
                    return;
                }
                if (content.indexOf(event.eol) !== -1) {
                    line.setValue(content.replace(/(?:\r\n|\r|\n)/g, " "));
                }
                const hoverWidget =
                    // @ts-ignore
                    line._contentWidgets[
                    "editor.contrib.modesContentHoverWidget"
                    ];
                if (
                    hoverWidget &&
                    hoverWidget.widget &&
                    hoverWidget.widget._containerDomNode
                ) {
                    const style = hoverWidget.widget._containerDomNode.style;
                    if (style.top !== null) {
                        style.position = "fixed";
                        style.bottom = 30;
                        style.top = null;
                    }
                }
                if (this.searchMode) {
                    setTimeout(() => {
                        if (this.suggestWidget && this.suggestWidget._state === 0) {
                            // Only exit if user has typed something and then suggestions closed
                            // Don't exit when line is empty (just entered search mode)
                            if (line.getValue().length > 0) {
                                this.ExitSearchMode(false);
                            }
                        } else {
                            line.trigger("search", "editor.action.triggerSuggest", {});
                        }
                    }, 0);
                }
            });
            line.onKeyDown((event: monaco.IKeyboardEvent) => {
                if (this.searchMode) {
                    if (event.keyCode === monaco.KeyCode.UpArrow || event.keyCode === monaco.KeyCode.DownArrow) {
                        return;
                    }
                }
                let prevent = true;
                if (
                    (!this.suggestWidget || this.suggestWidget._state !== 0) &&
                    event.keyCode !== monaco.KeyCode.Enter
                ) {
                    return;
                }
                let histStr;
                switch (event.keyCode) {
                    case monaco.KeyCode.Enter:
                        if (this.searchMode) {
                            // Accept the highlighted suggestion if widget is open
                            if (this.suggestWidget && this.suggestWidget._state !== 0) {
                                line.trigger("keyboard", "acceptSelectedSuggestion", {});
                            }
                            this.ExitSearchMode(false);
                            break;
                        }
                        const code = line.getValue();
                        if (code.trim() === "") {
                            prevent = true;
                            break;
                        }
                        this.AddText(code);
                        const startLine =
                            this.editor!.getModel()!.getLineCount() - 1;
                        this.replLines.set(startLine, this.replCounter);
                        this.replCounter++;
                        // Open an entry; its answer (AddText with isReplAnswer)
                        // will close it into a collapsible fold range.
                        this.replPendingStarts.push(startLine);
                        this.updateReplDecorations();
                        line.setValue("");
                        this.replHistory.unshift(code);
                        this.replHistoryIndex = 0;
                        this.OnCode(code);
                        break;

                    case monaco.KeyCode.UpArrow:
                        if (this.replHistoryIndex >= this.replHistory.length) {
                            break;
                        }
                        this.replHistoryIndex++;
                        histStr = this.replHistory[this.replHistoryIndex - 1];
                        line.setValue(histStr);
                        // .hack
                        setTimeout(() => {
                            line.setPosition(
                                new monaco.Position(1, histStr.length + 1)
                            );
                        }, 10);
                        break;

                    case monaco.KeyCode.DownArrow:
                        if (this.replHistoryIndex === 1) {
                            line.setValue("");
                            this.replHistoryIndex = 0;
                            break;
                        }
                        if (this.replHistoryIndex === 0) {
                            break;
                        }
                        this.replHistoryIndex--;
                        histStr = this.replHistory[this.replHistoryIndex - 1];
                        line.setValue(histStr);
                        line.setPosition(
                            new monaco.Position(1, histStr.length + 1)
                        );
                        break;

                    default:
                        prevent = false;
                }
                if (prevent) {
                    event.preventDefault();
                }
            });
            editor.updateOptions({
                lineNumbers: (originalLineNumber: number) => {
                    if (this.replLines.has(originalLineNumber)) {
                        return "repl" + this.replLines.get(originalLineNumber);
                    }
                    return "";
                },
            });
            editor.addAction({
                id: "clearCode",
                label: "Clear",
                contextMenuGroupId: "GMod",
                keybindings: [],
                run: () => {
                    this.Clear();
                },
            });
            this.setupLinkOpener(editor);

            FetchGwiki();
        },
        SetWidget(widget: object): void {
            this.suggestWidget = widget;
        },
        SetLanguage(langId: string): void {
            monaco.editor.setModelLanguage(this.editor!.getModel()!, langId);
            monaco.editor.setModelLanguage(this.line!.getModel()!, langId);
            this.prompt = promptForLanguage(langId);
            // Search mode owns the prompt while active; it restores this.prompt
            // on exit, so only update the visible label when not searching.
            if (!this.searchMode) {
                document.getElementById("input-prompt")!.textContent =
                    this.prompt;
            }
        },
        // Insert text at the end of the output model (with a trailing newline)
        // and return the 1-based position where the text began. Shared by
        // AddText and AddColoredText; does not touch folding or decorations.
        _appendOutput(text: string): monaco.Position {
            this.editor!.updateOptions({
                readOnly: false,
            });
            const lineCount = this.editor!.getModel()!.getLineCount();
            const start = new monaco.Position(lineCount, 1);
            this.editor!.executeEdits("repl-AddText", [
                {
                    forceMoveMarkers: true,
                    range: new monaco.Range(lineCount, 1, lineCount, 1),
                    text: text + "\n",
                },
            ]);
            this.editor!.revealLine(this.editor!.getModel()!.getLineCount());
            this.editor!.updateOptions({
                readOnly: true,
            });
            return start;
        },
        // Close the oldest open repl entry, finalizing its collapsible fold range
        // (from the entry's command line down to the just-appended answer). Shared
        // by AddText and AddColoredText so colored answers fold identically.
        _finalizeReplAnswer(): void {
            if (this.replPendingStarts.length > 0) {
                const start = this.replPendingStarts.shift()!;
                const end = this.editor!.getModel()!.getLineCount() - 1;
                if (end > start) {
                    this.replFoldRanges.push({ start, end });
                }
            }
        },
        AddText(text: string, isReplAnswer: boolean = false): void {
            this._appendOutput(text);

            // An answer closes the oldest open entry, finalizing its fold range.
            // Loose console output (isReplAnswer omitted/false) is left unfolded,
            // which also keeps old Lua callers of AddText(text) working unchanged.
            if (isReplAnswer) this._finalizeReplAnswer();
            this.updateReplDecorations();
            refreshReplFolding();
        },
        AddColoredText(...args: Array<ReplSegment | boolean>): void {
            // An optional trailing boolean is isReplAnswer (mirrors AddText): when
            // true it closes the pending entry's fold, exactly like a plain answer.
            // A trailing `false` is popped too -- it's the default, and a trailing
            // color-reset segment is a no-op anyway -- so callers can always pass
            // the flag last without it being mistaken for a color reset.
            let isReplAnswer = false;
            if (args.length > 0 && typeof args[args.length - 1] === "boolean") {
                isReplAnswer = args.pop() as boolean;
            }
            const segments = args as ReplSegment[];
            // Walk the MsgC-style stream: colors set the active color, `false`
            // resets to default (no decoration), strings are emitted. Build the
            // full text and, for each colored run, its char offsets into it.
            let fullText = "";
            let currentColor: ReplColor | null = null;
            const runs: Array<{
                startOffset: number;
                endOffset: number;
                color: ReplColor;
            }> = [];
            for (const segment of segments) {
                if (segment === false) {
                    currentColor = null;
                } else if (isReplColor(segment)) {
                    currentColor = segment;
                } else if (typeof segment === "string") {
                    if (segment.length === 0) continue;
                    const startOffset = fullText.length;
                    fullText += segment;
                    if (currentColor) {
                        runs.push({
                            startOffset,
                            endOffset: fullText.length,
                            color: currentColor,
                        });
                    }
                }
            }

            // A flag-only/color-only call has no text; skip the append so it
            // doesn't inject a stray blank line (it may still close a fold).
            if (fullText.length > 0) {
                const start = this._appendOutput(fullText);

                if (runs.length > 0) {
                    const model = this.editor!.getModel()!;
                    const base = model.getOffsetAt(start);
                    const decorations: monaco.editor.IModelDeltaDecoration[] =
                        [];
                    for (const run of runs) {
                        const className = colorClassName(run.color);
                        const from = model.getPositionAt(
                            base + run.startOffset
                        );
                        const to = model.getPositionAt(base + run.endOffset);
                        // One range per line the run covers.
                        for (
                            let ln = from.lineNumber;
                            ln <= to.lineNumber;
                            ln++
                        ) {
                            const startCol =
                                ln === from.lineNumber ? from.column : 1;
                            const endCol =
                                ln === to.lineNumber
                                    ? to.column
                                    : model.getLineMaxColumn(ln);
                            if (endCol > startCol) {
                                decorations.push({
                                    range: new monaco.Range(
                                        ln,
                                        startCol,
                                        ln,
                                        endCol
                                    ),
                                    options: { inlineClassName: className },
                                });
                            }
                        }
                    }
                    // Append without disturbing the separator decorations, which
                    // live in their own replDecorations array; Monaco tracks
                    // these ranges as later output is appended below them.
                    const ids = this.editor!.deltaDecorations([], decorations);
                    this.replColorDecorations.push(...ids);
                }
            }

            if (isReplAnswer) this._finalizeReplAnswer();
            this.updateReplDecorations();
            refreshReplFolding();
        },
        BeginReply(id: ReplId): void {
            // Anchor at the line where the next appended text will start. Blocks
            // may nest, and the same id may be open more than once at a time, so
            // starts are kept in a per-id stack (closed LIFO by EndReply).
            const start = this.editor!.getModel()!.getLineCount();
            const starts = this.replOpenReplies.get(id);
            if (starts) starts.push(start);
            else this.replOpenReplies.set(id, [start]);
        },
        EndReply(id: ReplId): void {
            // LIFO: the most recently opened block with this id closes first.
            const starts = this.replOpenReplies.get(id);
            if (!starts || starts.length === 0) return;
            const start = starts.pop()!;
            if (starts.length === 0) this.replOpenReplies.delete(id);
            const end = this.editor!.getModel()!.getLineCount() - 1;
            if (end > start) {
                this.replFoldRanges.push({ start, end });
            }
            refreshReplFolding();
        },
        updateReplDecorations(): void {
            const model = this.editor!.getModel();
            if (!model) return;
            const lineCount = model.getLineCount();
            const decorations: monaco.editor.IModelDeltaDecoration[] = [];
            // Draw a separator above the first line of every repl entry.
            for (const lineNumber of this.replLines.keys()) {
                if (lineNumber < 1 || lineNumber > lineCount) continue;
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                    options: {
                        isWholeLine: true,
                        className: "repl-entry-separator",
                    },
                });
            }
            this.replDecorations = this.editor!.deltaDecorations(
                this.replDecorations,
                decorations
            );
        },
        Clear(): void {
            this.replLines.clear();
            this.replFoldRanges = [];
            this.replPendingStarts = [];
            this.replOpenReplies.clear();
            this.editor!.setValue("");
            this.replDecorations = this.editor!.deltaDecorations(
                this.replDecorations,
                []
            );
            this.replColorDecorations = this.editor!.deltaDecorations(
                this.replColorDecorations,
                []
            );
            refreshReplFolding();
        },
        Reset(): void {
            this.replCounter = 0;
            this.Clear();
        },
        EnterSearchMode(keepValue: boolean = false): void {
            if (this.searchMode) return;
            this.searchMode = true;
            // Restoring the "!!" trigger on cancel would just re-enter search
            // mode, so the keepValue path restores an empty line instead.
            this.searchModePrevValue = keepValue ? "" : this.line!.getValue();
            document.getElementById("input-prompt")!.textContent = "search>";
            if (!keepValue) {
                this.line!.setValue("");
            }
            this.line!.focus();
            setTimeout(() => {
                this.line!.trigger("search", "editor.action.triggerSuggest", {});
            }, 0);
        },
        ExitSearchMode(restoreValue: boolean): void {
            if (!this.searchMode) return;
            this.searchMode = false;
            document.getElementById("input-prompt")!.textContent = this.prompt;
            if (restoreValue) {
                this.line!.setValue(this.searchModePrevValue);
                const len = this.searchModePrevValue.length;
                this.line!.setPosition(new monaco.Position(1, len + 1));
            }
            this.replHistoryIndex = 0;
        },
        SetHistory(entries: string[]): void {
            this.replHistory = entries;
        },
        AddHistory(entry: string): void {
            this.replHistory.unshift(entry);
        },
    };

    // give gmod access to the extended interface
    globalThis.replinterface = maybeReplInterface;
}

export const replInterface = maybeReplInterface;
