import * as monaco from "monaco-editor";

// Surfaces GMod color expressions as editable swatches, the same way Monaco
// already renders a square for hex literals like `#ff0000`.
//
// Recognised forms:
//   Color(r, g, b[, a])               constructor calls
//   surface.SetDrawColor(r, g, b[,a]) raw draw-color setters (see RAW_COLOR_FUNCS)
//   HSVToColor(h, s, v)               hue/sat/value -> opaque color
//   color_white / color_black / ...   built-in named globals
//
// The provider hands Monaco a color + range for every match; Monaco draws the
// swatch and, when the picker is used, calls provideColorPresentations to build
// the replacement text (preserving the original wrapper wherever possible).

// Functions whose first three/four integer arguments are a color. `Color` is
// the constructor; the rest set render state from raw bytes. Calls that pass a
// Color object instead of raw bytes simply won't match the numeric pattern
// (their inner `Color(...)`, if any, is picked up on its own).
const RAW_COLOR_FUNCS = [
    "Color",
    "surface.SetDrawColor",
    "surface.SetTextColor",
    "mesh.Color",
];

// name(r, g, b[, a]) — whitespace-tolerant, optional alpha. `\b` before the
// alternation stops `Color` matching the tail of e.g. `SetDrawColor`.
const COLOR_CALL = new RegExp(
    "\\b(" +
        RAW_COLOR_FUNCS.map((n) => n.replace(/\./g, "\\.")).join("|") +
        ")\\s*\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*(?:,\\s*(\\d{1,3})\\s*)?\\)",
    "g"
);

// HSVToColor(hue, sat, val): hue in [0, 360), sat/val in [0, 1]; alpha is 255.
const HSV_CALL =
    /\bHSVToColor\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\s*\)/g;

// GMod's built-in named color globals.
const NAMED_COLORS: Record<string, ColorTuple> = {
    color_white: { r: 255, g: 255, b: 255, a: 255 },
    color_black: { r: 0, g: 0, b: 0, a: 255 },
    color_transparent: { r: 255, g: 255, b: 255, a: 0 },
};

const NAMED_COLOR = new RegExp(
    "\\b(" + Object.keys(NAMED_COLORS).join("|") + ")\\b",
    "g"
);

interface ColorTuple {
    r: number;
    g: number;
    b: number;
    a: number;
}

function clampByte(n: number): number {
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
}

// Monaco color channels are 0-1 floats; GMod uses 0-255 integers.
function toByte(channel: number): number {
    return clampByte(Math.round(channel * 255));
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function hsvToRgb(h: number, s: number, v: number): ColorTuple {
    h = ((h % 360) + 360) % 360;
    s = Math.min(Math.max(s, 0), 1);
    v = Math.min(Math.max(v, 0), 1);

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    return {
        r: clampByte(Math.round((r + m) * 255)),
        g: clampByte(Math.round((g + m) * 255)),
        b: clampByte(Math.round((b + m) * 255)),
        a: 255,
    };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }

    return {
        h: Math.round(h),
        s: max === 0 ? 0 : d / max,
        v: max,
    };
}

function tupleToColor(t: ColorTuple): monaco.languages.IColor {
    return {
        red: t.r / 255,
        green: t.g / 255,
        blue: t.b / 255,
        alpha: t.a / 255,
    };
}

// Omit the alpha argument when fully opaque, matching how the calls are usually
// written; include it otherwise so a picked color round-trips.
function buildCall(name: string, t: ColorTuple): string {
    return t.a === 255
        ? `${name}(${t.r}, ${t.g}, ${t.b})`
        : `${name}(${t.r}, ${t.g}, ${t.b}, ${t.a})`;
}

// Name of a built-in global exactly equal to this color, if any.
function matchNamedColor(t: ColorTuple): string | undefined {
    for (const [name, c] of Object.entries(NAMED_COLORS)) {
        if (c.r === t.r && c.g === t.g && c.b === t.b && c.a === t.a) {
            return name;
        }
    }
    return undefined;
}

export class GLuaColorProvider implements monaco.languages.DocumentColorProvider {
    provideDocumentColors(
        model: monaco.editor.ITextModel
    ): monaco.languages.ProviderResult<monaco.languages.IColorInformation[]> {
        const colors: monaco.languages.IColorInformation[] = [];
        const lineCount = model.getLineCount();

        for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
            const text = model.getLineContent(lineNumber);

            const push = (index: number, length: number, tuple: ColorTuple) => {
                colors.push({
                    // +1 because Monaco columns are 1-based.
                    range: new monaco.Range(
                        lineNumber,
                        index + 1,
                        lineNumber,
                        index + 1 + length
                    ),
                    color: tupleToColor(tuple),
                });
            };

            // Color(...) and raw draw-color setters.
            for (const match of text.matchAll(COLOR_CALL)) {
                push(match.index ?? 0, match[0].length, {
                    r: clampByte(parseInt(match[2], 10)),
                    g: clampByte(parseInt(match[3], 10)),
                    b: clampByte(parseInt(match[4], 10)),
                    a:
                        match[5] === undefined
                            ? 255
                            : clampByte(parseInt(match[5], 10)),
                });
            }

            // HSVToColor(h, s, v).
            for (const match of text.matchAll(HSV_CALL)) {
                push(
                    match.index ?? 0,
                    match[0].length,
                    hsvToRgb(
                        parseFloat(match[1]),
                        parseFloat(match[2]),
                        parseFloat(match[3])
                    )
                );
            }

            // Named globals (color_white, ...).
            for (const match of text.matchAll(NAMED_COLOR)) {
                push(match.index ?? 0, match[0].length, NAMED_COLORS[match[1]]);
            }
        }

        return colors;
    }

    provideColorPresentations(
        model: monaco.editor.ITextModel,
        colorInfo: monaco.languages.IColorInformation
    ): monaco.languages.ProviderResult<monaco.languages.IColorPresentation[]> {
        const { red, green, blue, alpha } = colorInfo.color;
        const tuple: ColorTuple = {
            r: toByte(red),
            g: toByte(green),
            b: toByte(blue),
            a: toByte(alpha),
        };

        const source = model.getValueInRange(colorInfo.range);
        const labels: string[] = [];

        // Offer the built-in global first when the color matches one exactly,
        // so e.g. picking pure white on a Color(...) can collapse to color_white.
        const named = matchNamedColor(tuple);
        if (named) labels.push(named);

        if (/^HSVToColor\b/.test(source)) {
            // HSVToColor has no alpha channel; only round-trip when opaque.
            if (tuple.a === 255) {
                const { h, s, v } = rgbToHsv(tuple.r, tuple.g, tuple.b);
                labels.push(`HSVToColor(${h}, ${round2(s)}, ${round2(v)})`);
            }
            labels.push(buildCall("Color", tuple));
        } else {
            // Preserve the original wrapper for Color(...) and the raw setters;
            // fall back to Color(...) for bare named globals.
            const call = source.match(/^([\w.]+)\s*\(/);
            labels.push(buildCall(call ? call[1] : "Color", tuple));
        }

        // De-duplicate while preserving order (named global may equal a form).
        const seen = new Set<string>();
        return labels
            .filter((label) => !seen.has(label) && seen.add(label))
            .map((label) => ({
                label,
                textEdit: { range: colorInfo.range, text: label },
            }));
    }
}
