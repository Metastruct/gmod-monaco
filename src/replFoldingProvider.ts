import * as monaco from "monaco-editor";
// Monaco's built-in indentation folding engine — the exact one a plain editor
// uses when no folding-range provider is registered. There's no public export
// for it, so reach into the internal esm module rather than reimplement it.
// @ts-expect-error - no type declarations for this internal path
import { computeRanges } from "monaco-editor/esm/vs/editor/contrib/folding/browser/indentRangeProvider";
import { replInterface } from "./replInterface";

/**
 * Provides folding ranges for the REPL editors.
 *
 * Two kinds of ranges are merged:
 *  - Repl-entry / reply-block regions, which are NOT derived from the text: the
 *    output editor holds a flat stream where repl answers and unrelated console
 *    output (prints, errors, async messages) are interleaved, so the ranges are
 *    owned by the replInterface, which finalizes an entry once its answer is
 *    inserted (see AddText's `isReplAnswer`) or a reply block is closed
 *    (EndReply). These apply to the output editor model only.
 *  - Indentation-based ranges from Monaco's own engine, so ordinary multi-line
 *    code still folds. Registering any folding-range provider for a language
 *    disables Monaco's built-in indentation folding, so we re-run that same
 *    engine here and merge its ranges in.
 */

interface FoldRange {
    start: number;
    end: number;
    /** Region-kind ranges (repl entries/replies) fold as regions; code omits it. */
    kind?: monaco.languages.FoldingRangeKind;
}

/**
 * Run Monaco's built-in indentation folding over the model. glua defines no
 * `foldingRules`, so offSide/markers default to false/undefined — byte-for-byte
 * what the regular GLua editor computes. computeRanges reads the model's own
 * tabSize/indentSize and blank-line handling, so nothing here is re-derived.
 */
function indentationFoldRanges(model: monaco.editor.ITextModel): FoldRange[] {
    const regions = computeRanges(model, false, undefined);
    const ranges: FoldRange[] = [];
    for (let i = 0; i < regions.length; i++) {
        ranges.push({
            start: regions.getStartLineNumber(i),
            end: regions.getEndLineNumber(i),
        });
    }
    return ranges;
}

/**
 * Monaco's folding model is a strict tree, so ranges must nest and never cross.
 * Reply blocks are meant to be nested, but a close-out-of-order could produce a
 * crossing; clamp each range's end down to its enclosing parent's end so every
 * block stays foldable. Sort by start asc, then end desc, and walk a parent
 * stack.
 */
function sanitizeNesting(ranges: FoldRange[]): FoldRange[] {
    const sorted = ranges
        .map((r) => ({ start: r.start, end: r.end, kind: r.kind }))
        .sort((a, b) => a.start - b.start || b.end - a.end);
    const stack: FoldRange[] = [];
    for (const r of sorted) {
        // Drop parents we've moved past.
        while (stack.length > 0 && stack[stack.length - 1].end < r.start) {
            stack.pop();
        }
        const parent = stack[stack.length - 1];
        if (parent && r.end > parent.end) {
            r.end = parent.end;
        }
        if (r.end > r.start) {
            stack.push(r);
        }
    }
    return sorted.filter((r) => r.end > r.start);
}

class ReplFoldingProvider implements monaco.languages.FoldingRangeProvider {
    private readonly _onDidChange = new monaco.Emitter<this>();
    public readonly onDidChange = this._onDidChange.event;

    public provideFoldingRanges(
        model: monaco.editor.ITextModel
    ): monaco.languages.ProviderResult<monaco.languages.FoldingRange[]> {
        // Indentation folding for the text itself (any glua/js model).
        const ranges = indentationFoldRanges(model);
        // The output editor additionally gets its repl-entry/reply regions,
        // tagged as Region so they read as collapsible sections (code folds,
        // which carry no kind, keep the plain indentation-fold behavior).
        if (replInterface && replInterface.editor?.getModel() === model) {
            for (const r of replInterface.replFoldRanges) {
                ranges.push({
                    start: r.start,
                    end: r.end,
                    kind: monaco.languages.FoldingRangeKind.Region,
                });
            }
        }
        return sanitizeNesting(ranges).map((r) => ({
            start: r.start,
            end: r.end,
            kind: r.kind,
        }));
    }

    /** Ask Monaco to re-query folding ranges (call after ranges change). */
    public fireDidChange(): void {
        this._onDidChange.fire(this);
    }
}

export const replFoldingProvider = new ReplFoldingProvider();

export function refreshReplFolding(): void {
    replFoldingProvider.fireDidChange();
}
