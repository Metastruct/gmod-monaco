export const WIKI_HOST = "https://wiki.facepunch.com";
export const WIKI_BASE = `${WIKI_HOST}/gmod/`;
const ISSUE_BASE = "https://github.com/Facepunch/garrysmod-issues/issues/";
const SOURCE_BASE =
    "https://github.com/Facepunch/garrysmod/blob/master/garrysmod/";
// Everything the wiki reports a `file` for lives under one of these; anything
// else (a stray typo'd path) is shown as plain text rather than a dead link.
const SOURCE_ROOTS = ["lua/", "gamemodes/"];

/** Resolve the `link` page path the scraper records into an absolute URL. */
export function wikiUrlFromLink(link: unknown): string | undefined {
    if (typeof link !== "string" || !link) return undefined;
    return /^https?:\/\//.test(link) ? link : `${WIKI_HOST}${link}`;
}

/** Page name out of a link path, e.g. "/gmod/Enums/ACT" -> "ACT". */
export function enumPageFromLink(link: unknown): string | undefined {
    if (typeof link !== "string") return undefined;
    const match = link.match(/\/Enums\/([^/?#]+)/);
    return match ? match[1] : undefined;
}

// Fallback for gwiki.json dumps produced before the scraper started recording
// `link`: those never name the table an enum belongs to, so the page has to be
// recovered from the keys.
// Sorted longest-first so prefix matching picks the most specific page
// (STENCILOPERATION_KEEP -> STENCILOPERATION, not STENCIL).
const ENUM_PAGES = [
    "ACT", "AIMR", "AMMO", "ANALOG", "BLEND", "BLENDFUNC", "BLOOD_COLOR",
    "BONE", "BOUNDS", "BOX", "BUTTON_CODE", "CAP", "CHAN", "CLASS",
    "COLLISION_GROUP", "COND", "CONTENTS", "CREATERENDERTARGETFLAGS", "CT",
    "ContentAlignment", "D", "DEATH_NOTICE", "DISPSURF", "DMG", "DOCK", "DOF",
    "EF", "EFL", "FCVAR", "FFT", "FL", "FORCE", "FSASYNC", "FSOLID",
    "FVPHYSICS", "GESTURE_SLOT", "GLOBAL", "GMOD_CHANNEL", "GOALTYPE",
    "HITGROUP", "HUD", "HULL", "IMAGE_FORMAT", "IN", "JOYSTICK", "KEY",
    "MASK", "MAT", "MATERIAL", "MATERIAL_CULLMODE", "MATERIAL_FOG",
    "MATERIAL_LIGHT", "MATERIAL_RT_DEPTH", "MOUSE", "MOVECOLLIDE", "MOVETYPE",
    "NAV", "NAV_MESH", "NOTIFY", "NPC_STATE", "NUM", "NavCorner", "NavDir",
    "NavTraverseType", "OBS_MODE", "PATTACH", "PLAYER", "PLAYERANIMEVENT",
    "RENDERGROUP", "RENDERMODE", "RT_SIZE", "SCHED", "SCREENFADE",
    "SENSORBONE", "SF", "SIGNONSTATE", "SIM", "SND", "SNDLVL", "SOLID",
    "SOUND", "STENCIL", "STENCILCOMPARISONFUNCTION", "STENCILOPERATION",
    "STEPSOUNDTIME", "STUDIO", "SURF", "TASKSTATUS", "TEAM", "TEXFILTER",
    "TEXTUREFLAGS", "TEXT_ALIGN", "TEXT_FILTER", "TRACER", "TRANSMIT", "TYPE",
    "USE", "VIEW", "WEAPON_PROFICIENCY", "_USE", "kRenderFx",
].sort((a, b) => b.length - a.length);

// The handful of tables whose keys share no prefix with their page name.
const ENUM_PAGE_BY_KEY: Record<string, string> = {
    CONTINUOUS_USE: "_USE",
    NODOCK: "DOCK",
    NORTH: "NavDir",
    GO_NORTH: "NavTraverseType",
    NORTH_WEST: "NavCorner",
    BOTTOM_LEFT: "ContentAlignment",
};

// Share of a table's keys that must agree before a page is accepted. Tables
// like NavDir contain a stray NUM_DIRECTIONS that matches an unrelated page.
const ENUM_PAGE_CONFIDENCE = 0.5;

function matchEnumPage(key: string): string | undefined {
    return ENUM_PAGES.find((page) => key.startsWith(page));
}

/** Recover the wiki page an enum table lives on from the keys it defines. */
export function resolveEnumPage(keys: string[]): string | undefined {
    if (keys.length === 0) return undefined;
    const votes = new Map<string, number>();
    keys.forEach((key) => {
        const page = matchEnumPage(key);
        if (page) votes.set(page, (votes.get(page) ?? 0) + 1);
    });
    let best: string | undefined;
    let bestCount = 0;
    votes.forEach((count, page) => {
        if (count > bestCount) {
            best = page;
            bestCount = count;
        }
    });
    if (best && bestCount / keys.length >= ENUM_PAGE_CONFIDENCE) {
        return best;
    }
    return keys.map((key) => ENUM_PAGE_BY_KEY[key]).find(Boolean);
}

export function enumWikiUrl(page: string | undefined): string | undefined {
    return page ? `${WIKI_BASE}Enums/${page}` : undefined;
}

// Libraries and fields are addressed with a dot on the wiki, everything else
// with a colon. Only used when a dump predates the scraper recording `link`;
// a handful of pages (`Global.error(lowercase)`, `COLOR:AddHue`) are spelled
// in ways no rule can derive, which is why `link` is the primary source.
const DOT_SEPARATED = ["libraryfunc", "libraryfield", "panelfield"];

export function funcWikiUrl(
    type: string | undefined,
    parent: string | undefined,
    name: string | undefined
): string | undefined {
    if (!name) return undefined;
    if (!parent) return `${WIKI_BASE}${name}`;
    const sep = DOT_SEPARATED.indexOf(type ?? "") !== -1 ? "." : ":";
    return `${WIKI_BASE}${parent}${sep}${name}`;
}

export function issueUrl(issue: string): string {
    return `${ISSUE_BASE}${issue}`;
}

/** GitHub link for a wiki `file` entry. `line` already reads like "212-L254". */
export function sourceUrl(
    file: { text?: string; line?: string } | undefined
): string | undefined {
    const path = file?.text;
    if (
        typeof path !== "string" ||
        !SOURCE_ROOTS.some((root) => path.startsWith(root))
    ) {
        return undefined;
    }
    return `${SOURCE_BASE}${path}${file?.line ? `#L${file.line}` : ""}`;
}

const MARKDOWN_LINK = /(\[[^\]]*\]\([^)]*\))/;
const ENUM_REFERENCE = /\bEnums\/([A-Za-z_][A-Za-z0-9_]*)/g;

/** Turn bare `Enums/FOO` mentions in wiki prose into links, leaving existing links alone. */
export function linkifyWikiReferences(text: string): string {
    return text
        .split(MARKDOWN_LINK)
        .map((part, idx) =>
            idx % 2 === 1
                ? part
                : part.replace(
                      ENUM_REFERENCE,
                      (match, page) => `[${match}](${WIKI_BASE}Enums/${page})`
                  )
        )
        .join("");
}
