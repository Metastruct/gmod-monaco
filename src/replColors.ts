// Dynamic CSS-class cache for arbitrary REPL text colors.
//
// Monaco inline decorations only accept a CSS *class name* (inlineClassName),
// never an inline style, so arbitrary Color(r,g,b) values from Lua are turned
// into on-demand CSS rules: one `.repl-fg-<key>` rule per unique color, injected
// into a shared <style> element and cached. `!important` lets the decoration's
// color win over the tokenizer's `.mtkN` color (both are single-class
// specificity, so without it declaration order would decide).

export interface ReplColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}

const classCache = new Map<string, string>();
let styleEl: HTMLStyleElement | undefined;

function ensureStyleEl(): HTMLStyleElement {
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.setAttribute("data-repl-colors", "");
        document.head.appendChild(styleEl);
    }
    return styleEl;
}

function clamp(n: number): number {
    n = Math.round(n);
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
}

/** Returns a cached CSS class name that paints text with the given color. */
export function colorClassName(color: ReplColor): string {
    const r = clamp(color.r);
    const g = clamp(color.g);
    const b = clamp(color.b);
    // Alpha is 0-255 (GMod Color); default fully opaque.
    const a = color.a === undefined ? 255 : clamp(color.a);
    const key = `${r}_${g}_${b}_${a}`;

    const cached = classCache.get(key);
    if (cached) return cached;

    const className = `repl-fg-${key}`;
    const css =
        a === 255
            ? `color:rgb(${r},${g},${b})!important`
            : `color:rgba(${r},${g},${b},${(a / 255).toFixed(3)})!important`;
    const sheet = ensureStyleEl().sheet;
    if (sheet) {
        sheet.insertRule(`.${className}{${css}}`, sheet.cssRules.length);
    }
    classCache.set(key, className);
    return className;
}

/** Test hook: drop all cached classes and the injected stylesheet. */
export function resetReplColorStyles(): void {
    classCache.clear();
    if (styleEl) {
        styleEl.remove();
        styleEl = undefined;
    }
}
