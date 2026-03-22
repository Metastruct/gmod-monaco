/**
 * Browser testing utilities for gmod-monaco
 *
 * These snippets can be used to test the editor in a browser environment
 * without the GMod/REPL backend.
 *
 * Usage: Copy the desired snippet and paste into browser console,
 * or uncomment the mock interfaces in gmodInterface.ts / replInterface.ts
 */

import * as monaco from "monaco-editor";
import { autocompletionData } from "./autocompletionData";
import { LoadAutocompletionData, FetchGwiki } from "./glua/Gwiki";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import { gmodInterface } from "./gmodInterface";

declare global {
    interface Window {
        testUtils: typeof browserTestUtils;
    }
}

export const browserTestUtils = {
    /**
     * Load GLua autocomplete data for a specific realm
     * @param state - "Client", "Server", "Shared", or "Menu"
     */
    async loadAutocomplete(state: string = "Shared") {
        console.log(`Loading autocomplete for realm: ${state}`);
        await FetchGwiki();
        await LoadAutocompletionData(state);
        autocompletionData.ClearAutocompleteCache();
        console.log("Autocomplete loaded!", {
            functions: autocompletionData.functions.length,
            classmethods: autocompletionData.classmethods.length,
            hooks: autocompletionData.hooks.length,
            enums: autocompletionData.enums.length,
            modules: autocompletionData.modules.length,
        });
    },

    /**
     * Test autocomplete by triggering global cache generation
     */
    testGlobalAutocomplete() {
        console.log("Testing global autocomplete...");
        try {
            autocompletionData.GenerateGlobalCache();
            console.log("Global cache generated successfully!", {
                items: autocompletionData.globalCache.length,
            });
            return autocompletionData.globalCache.slice(0, 10);
        } catch (e) {
            console.error("Global autocomplete failed:", e);
            throw e;
        }
    },

    /**
     * Test method autocomplete cache generation
     */
    testMethodAutocomplete() {
        console.log("Testing method autocomplete...");
        try {
            autocompletionData.GenerateMethodsCache();
            console.log("Methods cache generated successfully!", {
                items: autocompletionData.methodsCache.length,
            });
            return autocompletionData.methodsCache.slice(0, 10);
        } catch (e) {
            console.error("Method autocomplete failed:", e);
            throw e;
        }
    },

    /**
     * Add a custom autocomplete value for testing
     */
    addTestValue(fullname: string, type: string = "Variable") {
        const value = new GmodInterfaceValue({
            fullname,
            name: fullname.split(/[.:]/).pop(),
            type,
            classFunction: fullname.includes(":"),
        });
        autocompletionData.AddNewInterfaceValue(value);
        console.log("Added test value:", fullname);
    },

    /**
     * Add sample client autocomplete data (simulates what GMod sends)
     */
    addSampleClientData() {
        const sampleData = {
            values: "LocalPlayer|game|engine|vgui|hook|timer|net|util|math.huge|table.Empty",
            funcs: "print|pairs|ipairs|tonumber|tostring|Entity:GetPos|Entity:SetPos|Player:Nick|hook.Add|hook.Remove|timer.Create|net.Start|net.SendToServer",
        };
        console.log("Loading sample client data...");

        // Parse and add values
        sampleData.values.split("|").forEach((value) => {
            if (!autocompletionData.valuesLookup.has(value)) {
                this.addTestValue(value);
            }
        });

        // Parse and add functions
        sampleData.funcs.split("|").forEach((func) => {
            if (!autocompletionData.valuesLookup.has(func)) {
                this.addTestValue(func, func.includes(":") ? "Method" : "Function");
            }
        });

        autocompletionData.ClearAutocompleteCache();
        console.log("Sample client data loaded!");
    },

    /**
     * Get autocomplete stats
     */
    getStats() {
        return {
            functions: autocompletionData.functions.length,
            classmethods: autocompletionData.classmethods.length,
            hooks: autocompletionData.hooks.length,
            enums: autocompletionData.enums.length,
            modules: autocompletionData.modules.length,
            interfaceValues: autocompletionData.interfaceValues.length,
            globalCacheSize: autocompletionData.globalCache.length,
            methodsCacheSize: autocompletionData.methodsCache.length,
            valuesLookupSize: autocompletionData.valuesLookup.size,
            methodsLookupSize: autocompletionData.methodsLookup.size,
        };
    },

    /**
     * Search for a function/method by name
     */
    search(query: string) {
        const results: { type: string; name: string; fullName: string }[] = [];

        autocompletionData.functions.forEach((func) => {
            if (func.isValid() && func.getFullName().toLowerCase().includes(query.toLowerCase())) {
                results.push({ type: "function", name: func.name, fullName: func.getFullName() });
            }
        });

        autocompletionData.classmethods.forEach((method) => {
            if (method.isValid() && method.getFullName().toLowerCase().includes(query.toLowerCase())) {
                results.push({ type: "method", name: method.name, fullName: method.getFullName() });
            }
        });

        autocompletionData.hooks.forEach((hook) => {
            if (hook.isValid() && hook.getFullName().toLowerCase().includes(query.toLowerCase())) {
                results.push({ type: "hook", name: hook.name, fullName: hook.getFullName() });
            }
        });

        return results.slice(0, 20);
    },

    /**
     * Clear all autocomplete caches
     */
    clearCaches() {
        autocompletionData.ClearAutocompleteCache();
        console.log("Caches cleared!");
    },

    /**
     * Expose autocompletionData for direct inspection
     */
    get data() {
        return autocompletionData;
    },

    // ==================== ACTION/HOTKEY TESTING ====================

    /**
     * Add a test action with keybinding (simulates what GMod sends)
     * @param id - Action identifier
     * @param label - Display label
     * @param keyBindings - Array of keybinding strings, e.g. ["Mod.CtrlCmd | Key.KeyS"]
     */
    addAction(id: string, label: string, keyBindings: string[] = []) {
        if (!gmodInterface) {
            console.error("[addAction] gmodInterface not available");
            return;
        }
        const action = {
            id,
            label,
            keyBindings,
            contextMenuGroup: "Test",
        };
        console.log("[addAction] Adding action:", action);
        gmodInterface.AddAction(action);
        console.log("[addAction] Action added successfully");
    },

    /**
     * Add sample actions for testing (common GMod editor hotkeys)
     */
    addSampleActions() {
        const sampleActions = [
            { id: "runCode", label: "Run Code", keyBindings: ["Mod.CtrlCmd | Key.KeyE"] },
            { id: "saveCode", label: "Save Code", keyBindings: ["Mod.CtrlCmd | Key.KeyS"] },
            { id: "newTab", label: "New Tab", keyBindings: ["Mod.CtrlCmd | Key.KeyT"] },
            { id: "closeTab", label: "Close Tab", keyBindings: ["Mod.CtrlCmd | Key.KeyW"] },
            { id: "validate", label: "Validate Code", keyBindings: ["Key.F5"] },
        ];

        sampleActions.forEach((action) => {
            this.addAction(action.id, action.label, action.keyBindings);
        });

        console.log("[addSampleActions] Added", sampleActions.length, "sample actions");
    },

    /**
     * List all registered actions in the editor
     */
    listActions() {
        const editor = globalThis.editor;
        if (!editor) {
            console.error("[listActions] Editor not available");
            return [];
        }

        // Access Monaco's internal action registry
        // @ts-expect-error - accessing private API
        const actions = editor._actions;
        if (!actions) {
            console.warn("[listActions] Could not access editor actions");
            return [];
        }

        const actionList: { id: string; label: string }[] = [];
        actions.forEach((action: any, id: string) => {
            actionList.push({
                id,
                label: action.label || action._label || "(no label)",
            });
        });

        console.table(actionList);
        return actionList;
    },

    /**
     * Get keybindings for a specific action
     */
    getActionKeybindings(actionId: string) {
        const editor = globalThis.editor;
        if (!editor) {
            console.error("[getActionKeybindings] Editor not available");
            return null;
        }

        try {
            // @ts-expect-error - accessing private API
            const keybindingService = editor._standaloneKeybindingService;
            if (!keybindingService) {
                console.warn("[getActionKeybindings] Keybinding service not available");
                return null;
            }

            const resolver = keybindingService._getResolver();
            const keybindings = resolver.lookupPrimaryKeybinding(actionId);

            if (keybindings) {
                console.log(`[getActionKeybindings] ${actionId}:`, keybindings);
                return keybindings;
            } else {
                console.log(`[getActionKeybindings] No keybinding found for ${actionId}`);
                return null;
            }
        } catch (e) {
            console.error("[getActionKeybindings] Error:", e);
            return null;
        }
    },

    /**
     * Trigger an action by ID
     */
    triggerAction(actionId: string) {
        const editor = globalThis.editor;
        if (!editor) {
            console.error("[triggerAction] Editor not available");
            return false;
        }

        try {
            editor.trigger("test", actionId, null);
            console.log(`[triggerAction] Triggered: ${actionId}`);
            return true;
        } catch (e) {
            console.error(`[triggerAction] Failed to trigger ${actionId}:`, e);
            return false;
        }
    },

    /**
     * Debug keybinding resolution for a key combination
     * @param keyCode - Monaco KeyCode value (e.g., monaco.KeyCode.KeyS)
     * @param modifiers - Object with ctrlCmd, shift, alt, meta booleans
     */
    debugKeybinding(keyCode: number, modifiers: { ctrlCmd?: boolean; shift?: boolean; alt?: boolean } = {}) {
        const editor = globalThis.editor;
        if (!editor) {
            console.error("[debugKeybinding] Editor not available");
            return;
        }

        try {
            // @ts-expect-error - accessing private API
            const keybindingService = editor._standaloneKeybindingService;
            const resolver = keybindingService._getResolver();

            console.log("[debugKeybinding] Resolver lookup map:", resolver._lookupMap);
            console.log("[debugKeybinding] Checking for keyCode:", keyCode, "modifiers:", modifiers);

            // List all keybindings that might match
            const matches: any[] = [];
            resolver._lookupMap.forEach((bindings: any[], commandId: string) => {
                bindings.forEach((binding: any) => {
                    const parts = binding.resolvedKeybinding?._parts;
                    if (parts && parts[0]) {
                        const part = parts[0];
                        if (part.keyCode === keyCode) {
                            matches.push({
                                commandId,
                                keyCode: part.keyCode,
                                ctrlKey: part.ctrlKey,
                                shiftKey: part.shiftKey,
                                altKey: part.altKey,
                                metaKey: part.metaKey,
                            });
                        }
                    }
                });
            });

            console.log("[debugKeybinding] Matching keybindings:", matches);
            console.table(matches);
            return matches;
        } catch (e) {
            console.error("[debugKeybinding] Error:", e);
        }
    },

    /**
     * Dump all keybindings for debugging
     */
    dumpAllKeybindings() {
        const editor = globalThis.editor;
        if (!editor) {
            console.error("[dumpAllKeybindings] Editor not available");
            return;
        }

        try {
            // @ts-expect-error - accessing private API
            const keybindingService = editor._standaloneKeybindingService;
            const resolver = keybindingService._getResolver();

            const allBindings: any[] = [];
            resolver._lookupMap.forEach((bindings: any[], commandId: string) => {
                bindings.forEach((binding: any) => {
                    const parts = binding.resolvedKeybinding?._parts;
                    if (parts && parts[0]) {
                        const part = parts[0];
                        allBindings.push({
                            commandId,
                            keyCode: part.keyCode,
                            keyCodeName: monaco.KeyCode[part.keyCode] || "Unknown",
                            ctrlKey: part.ctrlKey,
                            shiftKey: part.shiftKey,
                            altKey: part.altKey,
                            metaKey: part.metaKey,
                        });
                    }
                });
            });

            console.log("[dumpAllKeybindings] Total bindings:", allBindings.length);
            console.table(allBindings.filter((b) => b.commandId.startsWith("editor.") === false).slice(0, 50));
            return allBindings;
        } catch (e) {
            console.error("[dumpAllKeybindings] Error:", e);
        }
    },

    /**
     * Monaco KeyCode reference (full enum)
     */
    KeyCode: monaco.KeyCode,

    /**
     * Monaco KeyMod reference (full enum)
     */
    KeyMod: monaco.KeyMod,

    /**
     * Get the editor instance
     */
    get editor() {
        return globalThis.editor;
    },

    /**
     * Get the gmodInterface instance
     */
    get gmodInterface() {
        return gmodInterface;
    },
};

// Expose to window for browser console access
if (typeof window !== "undefined") {
    window.testUtils = browserTestUtils;
}

/**
 * Console snippets for testing (copy-paste into browser console):
 *
 * === AUTOCOMPLETE TESTING ===
 * ```js
 * // Quick test - load autocomplete and test caches
 * await testUtils.loadAutocomplete("Shared");
 * testUtils.testGlobalAutocomplete();
 * testUtils.testMethodAutocomplete();
 * console.table(testUtils.getStats());
 * ```
 *
 * ```js
 * // Search for functions
 * console.table(testUtils.search("Entity"));
 * ```
 *
 * ```js
 * // Add custom test data
 * testUtils.addSampleClientData();
 * testUtils.testGlobalAutocomplete();
 * ```
 *
 * === ACTION/HOTKEY TESTING ===
 * ```js
 * // Add sample actions (simulates what GMod sends)
 * testUtils.addSampleActions();
 * ```
 *
 * ```js
 * // Add a custom action with keybinding
 * testUtils.addAction("myAction", "My Action", ["Mod.CtrlCmd | Key.KeyM"]);
 * ```
 *
 * ```js
 * // List all registered actions
 * testUtils.listActions();
 * ```
 *
 * ```js
 * // Trigger an action programmatically
 * testUtils.triggerAction("runCode");
 * ```
 *
 * ```js
 * // Debug keybindings - dump all custom keybindings
 * testUtils.dumpAllKeybindings();
 * ```
 *
 * ```js
 * // Check keybinding for a specific key (e.g., Ctrl+S)
 * testUtils.debugKeybinding(testUtils.KeyCode.KeyS, { ctrlCmd: true });
 * ```
 *
 * ```js
 * // Access Monaco KeyCode/KeyMod values
 * console.log(testUtils.KeyCode);  // All key codes
 * console.log(testUtils.KeyMod);   // All modifiers
 * ```
 */
