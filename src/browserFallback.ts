/**
 * Browser fallback - enables testing mode when:
 * - URL has ?browser=1 parameter
 * - Shift key is held during page load
 * - localStorage has 'gmod-monaco-browser-mode' set to 'true'
 *
 * This module MUST be imported before gmodInterface/replInterface
 * to set up globalThis.gmodinterface/replinterface before they check it.
 */

declare global {
    interface Window {
        browserModeEnabled: boolean;
    }
}

function shouldEnableBrowserMode(): boolean {
    // Never enable browser mode if Gmod's interface already exists
    if (globalThis.gmodinterface || globalThis.replinterface) {
        return false;
    }

    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("browser") === "1") {
        console.log("[BrowserFallback] Enabled via URL parameter");
        return true;
    }

    // Check localStorage
    if (localStorage.getItem("gmod-monaco-browser-mode") === "true") {
        console.log("[BrowserFallback] Enabled via localStorage");
        return true;
    }

    return false;
}

function setupMockGmodInterface(): void {
    if (globalThis.gmodinterface) return; // Already exists

    globalThis.gmodinterface = {
        OnReady: () => console.log("[Mock] OnReady - Editor interface ready"),
        OnCode: (code: string, versionId: number) =>
            console.log("[Mock] OnCode", { versionId, length: code.length }),
        OpenURL: (url: string) => {
            console.log("[Mock] OpenURL", url);
            window.open(url, "_blank");
        },
        OnSessionSet: (session: object) => console.log("[Mock] OnSessionSet", session),
        OnAction: (actionId: string) => console.log("[Mock] OnAction", actionId),
        OnSessions: (sessions: object[]) => console.log("[Mock] OnSessions", sessions),
        OnThemesLoaded: (themes: string[]) => console.log("[Mock] OnThemesLoaded", themes.length, "themes"),
        OnLanguages: (langs: string[]) => console.log("[Mock] OnLanguages", langs.length, "languages"),
    };

    console.log(
        "%c[Browser Mode Enabled]%c Use testUtils in console for testing",
        "background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px;",
        "color: #888;"
    );
}

function setupMockReplInterface(): void {
    if (globalThis.replinterface) return; // Already exists

    globalThis.replinterface = {
        OpenURL: (url: string) => {
            console.log("[Mock] OpenURL", url);
            window.open(url, "_blank");
        },
        OnReady: () => console.log("[Mock] OnReady - REPL interface ready"),
        OnCode: (code: string) => {
            console.log("[Mock] OnCode", code);
            // Simulate execution result after a short delay
            setTimeout(() => {
                const repl = globalThis.replinterface as any;
                if (repl?.AddText) {
                    repl.AddText(`> ${code}\n= [simulated result]`);
                }
            }, 100);
        },
    };

    console.log(
        "%c[Browser Mode Enabled]%c Use testUtils in console for testing",
        "background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px;",
        "color: #888;"
    );
}

// Check if browser mode should be enabled
export const browserModeEnabled = shouldEnableBrowserMode();
window.browserModeEnabled = browserModeEnabled;

// Setup appropriate mock interface based on page
if (browserModeEnabled) {
    // Detect which page we're on by checking for specific elements
    const isRepl = document.getElementById("line-container") !== null;

    if (isRepl) {
        setupMockReplInterface();
    } else {
        setupMockGmodInterface();
    }
}

// Also listen for Shift key press during early load to enable browser mode
// This creates a small window where holding Shift will enable it
let shiftPressed = false;
const shiftHandler = (e: KeyboardEvent) => {
    if (e.key === "Shift" && !browserModeEnabled && !globalThis.gmodinterface && !globalThis.replinterface) {
        shiftPressed = true;
        console.log("[BrowserFallback] Shift detected - enabling browser mode...");
        localStorage.setItem("gmod-monaco-browser-mode", "true");
        window.location.reload();
    }
};

// Only listen briefly during initial load
document.addEventListener("keydown", shiftHandler);
setTimeout(() => {
    document.removeEventListener("keydown", shiftHandler);
}, 2000); // 2 second window to press Shift

/**
 * Disable browser mode (removes localStorage flag)
 */
export function disableBrowserMode(): void {
    localStorage.removeItem("gmod-monaco-browser-mode");
    console.log("[BrowserFallback] Browser mode disabled. Reload to take effect.");
}

/**
 * Enable browser mode (sets localStorage flag)
 */
export function enableBrowserMode(): void {
    localStorage.setItem("gmod-monaco-browser-mode", "true");
    console.log("[BrowserFallback] Browser mode enabled. Reload to take effect.");
}

// Expose controls to window
if (typeof window !== "undefined") {
    (window as any).enableBrowserMode = enableBrowserMode;
    (window as any).disableBrowserMode = disableBrowserMode;
}
