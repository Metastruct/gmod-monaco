import * as monaco from "monaco-editor";
import { replInterface } from "./replInterface";

/**
 * Provides folding ranges for the REPL output editor.
 *
 * Fold ranges are not derived from the text itself: the output editor holds a
 * flat stream where repl answers and unrelated console output (prints, errors,
 * async messages) are interleaved. Instead the ranges are owned by the
 * replInterface, which only finalizes an entry once its answer is inserted
 * (see AddText's `isReplAnswer` flag). This provider just mirrors those ranges.
 */
class ReplFoldingProvider implements monaco.languages.FoldingRangeProvider {
    private readonly _onDidChange = new monaco.Emitter<this>();
    public readonly onDidChange = this._onDidChange.event;

    public provideFoldingRanges(
        model: monaco.editor.ITextModel
    ): monaco.languages.ProviderResult<monaco.languages.FoldingRange[]> {
        if (!replInterface || replInterface.editor?.getModel() !== model) {
            return [];
        }
        return replInterface.replFoldRanges.map((r) => ({
            start: r.start,
            end: r.end,
            kind: monaco.languages.FoldingRangeKind.Region,
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
