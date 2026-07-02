import * as monaco from "monaco-editor";

// Matches file references like:
//   @addons/noir-dev/lua/noir/noir_init.lua
//   @addons/noir-dev/lua/noir/noir_init.lua:6
//   @addons/noir-dev/lua/noir/noir_init.lua:6-30
//   @addons/noir-dev/lua/noir/noir_init.lua:6:12       (line:column)
const FILE_REFERENCE =
    /@([\w./\\-]+\.lua)(?::(\d+)(?:-(\d+))?(?::(\d+))?)?/g;

/**
 * Optional existence check for file references. When set (via
 * EnableLinkValidation on the gmod/repl interfaces), a reference only becomes
 * a link once the checker confirms the file exists; when unset, every
 * reference is clickable as before.
 */
export type FileExistsChecker = (
    path: string,
    callback: (exists: boolean) => void
) => void;

let fileExistsChecker: FileExistsChecker | undefined;
let fileExistsTimeoutMs = 2000;

// Answers from the Gmod side, LRU-evicted so an ever-growing REPL scrollback
// can't grow the cache without bound. Timeouts are not cached, so a slow or
// dropped response doesn't permanently mark a file as missing.
const EXISTS_CACHE_LIMIT = 512;
const existsCache = new Map<string, boolean>();
const pendingChecks = new Map<string, Promise<boolean>>();

export function setFileExistsChecker(
    checker: FileExistsChecker | undefined
): void {
    fileExistsChecker = checker;
    existsCache.clear();
    pendingChecks.clear();
}

export function setFileExistsTimeout(ms: number): void {
    fileExistsTimeoutMs = ms;
}

/** Call when files may have been created/deleted on the Gmod side. */
export function clearFileExistsCache(): void {
    existsCache.clear();
}

function cacheExists(path: string, exists: boolean): void {
    if (existsCache.has(path)) {
        existsCache.delete(path);
    } else if (existsCache.size >= EXISTS_CACHE_LIMIT) {
        existsCache.delete(existsCache.keys().next().value!);
    }
    existsCache.set(path, exists);
}

function checkFileExists(path: string): Promise<boolean> {
    if (existsCache.has(path)) {
        const exists = existsCache.get(path)!;
        cacheExists(path, exists); // refresh LRU recency
        return Promise.resolve(exists);
    }
    const pending = pendingChecks.get(path);
    if (pending) {
        return pending;
    }
    const promise = new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            settled = true;
            pendingChecks.delete(path);
            resolve(false);
        }, fileExistsTimeoutMs);
        fileExistsChecker!(path, (exists) => {
            // Cache even answers that arrive after the timeout, so the next
            // scan of the same reference doesn't have to ask again.
            cacheExists(path, exists);
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                pendingChecks.delete(path);
                resolve(exists);
            }
        });
    });
    pendingChecks.set(path, promise);
    return promise;
}

export class GLuaLinkProvider implements monaco.languages.LinkProvider {
    async provideLinks(
        model: monaco.editor.ITextModel
    ): Promise<monaco.languages.ILinksList> {
        const candidates: { link: monaco.languages.ILink; path: string }[] =
            [];
        const lineCount = model.getLineCount();

        for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
            const text = model.getLineContent(lineNumber);
            for (const match of text.matchAll(FILE_REFERENCE)) {
                const index = match.index ?? 0;
                const path = match[1];
                const start = match[2];
                const end = match[3];
                const column = match[4];

                const params = new URLSearchParams();
                params.set("path", path);
                if (start) params.set("start", start);
                if (end) params.set("end", end);
                if (column) params.set("column", column);

                candidates.push({
                    link: {
                        // +1 because Monaco columns are 1-based; the match spans the
                        // whole reference including the leading "@".
                        range: new monaco.Range(
                            lineNumber,
                            index + 1,
                            lineNumber,
                            index + 1 + match[0].length
                        ),
                        url: `gmod-file://open?${params.toString()}`,
                        tooltip: "Open in Gmod",
                    },
                    path,
                });
            }
        }

        if (!fileExistsChecker) {
            return { links: candidates.map((c) => c.link) };
        }

        const results = await Promise.all(
            candidates.map((c) => checkFileExists(c.path))
        );
        return {
            links: candidates
                .filter((_, i) => results[i])
                .map((c) => c.link),
        };
    }
}
