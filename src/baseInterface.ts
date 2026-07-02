import * as monaco from "monaco-editor";
import { LoadAutocompletionData } from "./glua/Gwiki";
import { autocompletionData, ResetAutocomplete } from "./autocompletionData";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import {
    AutocompleteRequestContext,
    DynamicAutocompleteItem,
    setDynamicAutocompleteProvider,
    setDynamicAutocompleteTimeout,
} from "./completionProvider";
import {
    setFileExistsChecker,
    setFileExistsTimeout,
    clearFileExistsCache,
} from "./gluaLinkProvider";

export interface ClientAutocompleteData {
    values: string; // Array of global non-table concatenated by '|'
    funcs: string; // Same as above but global functions and object methods
}

export interface EditorAction {
    id: string;
    label: string;
    keyBindings?: string[];
    contextMenuGroup?: string;
}

/**
 * Parse a keybinding string like "Mod.CtrlCmd | Key.KeyS" into a Monaco keybinding number
 */
export function parseKeybinding(keybindingStr: string): number {
    let result = 0;
    const parts = keybindingStr.split("|").map((p) => p.trim());

    for (const part of parts) {
        if (part.startsWith("Mod.")) {
            const modName = part.substring(4);
            const mod = (monaco.KeyMod as unknown as Record<string, number>)[modName];
            if (mod !== undefined) {
                result |= mod;
            } else {
                console.warn(`[parseKeybinding] Unknown modifier: ${modName}`);
            }
        } else if (part.startsWith("Key.")) {
            const keyName = part.substring(4);
            const key = (monaco.KeyCode as unknown as Record<string, number>)[keyName];
            if (key !== undefined) {
                result |= key;
            } else {
                console.warn(`[parseKeybinding] Unknown key: ${keyName}`);
            }
        } else {
            console.warn(`[parseKeybinding] Invalid keybinding part: ${part}`);
        }
    }

    return result;
}

// Callbacks implemented by the Gmod Lua side, common to the editor and REPL
// interfaces. OnCode is declared per-interface because its signature differs
// (the editor passes a versionId along with the code).
export interface BaseCallbacks {
    OnReady(): void;
    OpenURL(url: string): void;
    OnAction(actionId: string): void;
    /** Called when Monaco requests dynamic autocomplete items */
    OnAutocompleteRequest?(context: AutocompleteRequestContext, requestId: number): void;
    /** Called when Monaco needs to know whether a referenced file exists */
    OnFileExistsRequest?(path: string, requestId: number): void;
}

// Interface that both extended interfaces must satisfy for the mixin to work
export interface BaseInterfaceShape extends BaseCallbacks {
    editor?: monaco.editor.IStandaloneCodeEditor;
    /** REPL input line - shared methods also target it when present */
    line?: monaco.editor.IStandaloneCodeEditor;
    _autocompleteCallbacks?: Map<number, (items: DynamicAutocompleteItem[]) => void>;
    _autocompleteRequestId?: number;
    _fileExistsCallbacks?: Map<number, (exists: boolean) => void>;
    _fileExistsRequestId?: number;
}

export function createSharedInterfaceMethods() {
    return {
        _autocompleteCallbacks: undefined as Map<number, (items: DynamicAutocompleteItem[]) => void> | undefined,
        _autocompleteRequestId: undefined as number | undefined,
        _fileExistsCallbacks: undefined as Map<number, (exists: boolean) => void> | undefined,
        _fileExistsRequestId: undefined as number | undefined,

        setupLinkOpener(this: BaseInterfaceShape, editor: monaco.editor.IStandaloneCodeEditor): void {
            // @ts-ignore
            editor.getContribution("editor.linkDetector").openerService.open = (url: string) => {
                this.OpenURL(url);
            };
        },

        AddAction(this: BaseInterfaceShape, action: EditorAction): void {
            if (!action.label) {
                console.warn("[AddAction] Skipping action without label:", action);
                return;
            }
            const keybindings: number[] = [];
            if (action.keyBindings) {
                action.keyBindings.forEach((binding: string) => {
                    const parsed = parseKeybinding(binding);
                    if (parsed !== 0) {
                        keybindings.push(parsed);
                    }
                });
            }
            const descriptor: monaco.editor.IActionDescriptor = {
                id: action.id,
                label: action.label,
                contextMenuGroupId: action.contextMenuGroup,
                keybindings,
                run: () => {
                    this.OnAction(action.id);
                },
            };
            // The REPL registers actions on its input line as well
            [this.editor, this.line].forEach((target) =>
                target?.addAction(descriptor)
            );
        },

        LoadAutocompleteState(state: string): Promise<void> {
            return new Promise<void>((resolve) => {
                LoadAutocompletionData(state).then(() => {
                    autocompletionData.ClearAutocompleteCache();
                    resolve();
                });
            });
        },

        ResetAutocompletion(): void {
            ResetAutocomplete();
        },

        LoadAutocomplete(clData: ClientAutocompleteData): void {
            // Build caches first to avoid duplicates
            autocompletionData.interfaceValues = [];
            autocompletionData.GenerateMethodsCache();
            autocompletionData.GenerateGlobalCache();
            const values = clData.values.split("|");
            const funcs = clData.funcs.split("|");
            const tables: string[] = [];
            values.forEach((value: string) => {
                if (!value) return;
                let name = value;
                if (value.indexOf(".") !== -1) {
                    const split = value.split(".");
                    name = split.pop()!;
                    const tableName = split.join(".");
                    if (tables.indexOf(tableName) === -1) {
                        tables.push(tableName);
                    }
                }
                if (!autocompletionData.valuesLookup.has(value)) {
                    autocompletionData.AddNewInterfaceValue(
                        new GmodInterfaceValue({
                            name,
                            fullname: value,
                        })
                    );
                }
            });
            funcs.forEach((func: string) => {
                if (!func) return;
                let name = func;
                let classFunction = false;
                let type = "Function";
                let parent = undefined;
                if (func.indexOf(".") !== -1) {
                    const split = func.split(".");
                    name = split.pop()!;
                    const tableName = split.join(".");
                    if (tables.indexOf(tableName) === -1) {
                        tables.push(tableName);
                    }
                } else if (func.indexOf(":") !== -1) {
                    const split = func.split(":");
                    parent = split[1];
                    name = split.pop()!;
                    classFunction = true;
                    type = "Method";
                }
                if (classFunction) {
                    if (autocompletionData.methodsLookup.has(name)) {
                        let found = false;
                        autocompletionData.methodsLookup
                            .get(name)
                            ?.forEach((method) => {
                                if (method.getFullName() == func) {
                                    found = true;
                                }
                            });
                        if (found) {
                            return;
                        }
                    }
                    autocompletionData.AddNewInterfaceValue(
                        new GmodInterfaceValue({
                            name,
                            parent,
                            fullname: func,
                            classFunction,
                            type,
                        })
                    );
                } else {
                    if (!autocompletionData.valuesLookup.has(func)) {
                        autocompletionData.AddNewInterfaceValue(
                            new GmodInterfaceValue({
                                name,
                                fullname: func,
                                classFunction,
                                type,
                            })
                        );
                    }
                }
            });
            tables.forEach((table) => {
                if (table && autocompletionData.modules.indexOf(table) === -1) {
                    autocompletionData.modules.push(table);
                }
            });
            autocompletionData.ClearAutocompleteCache();
        },

        EnableDynamicAutocomplete(this: BaseInterfaceShape, timeoutMs?: number): void {
            if (!this.OnAutocompleteRequest) {
                console.warn("[EnableDynamicAutocomplete] OnAutocompleteRequest callback not defined");
                return;
            }
            this._autocompleteCallbacks = new Map();
            this._autocompleteRequestId = 0;

            if (timeoutMs !== undefined) {
                setDynamicAutocompleteTimeout(timeoutMs);
            }

            const self = this;
            setDynamicAutocompleteProvider((context, callback) => {
                const requestId = self._autocompleteRequestId!++;
                self._autocompleteCallbacks!.set(requestId, callback);
                self.OnAutocompleteRequest!(context, requestId);
            });
        },

        DisableDynamicAutocomplete(this: BaseInterfaceShape): void {
            setDynamicAutocompleteProvider(undefined);
            this._autocompleteCallbacks?.clear();
        },

        ProvideAutocompleteItems(this: BaseInterfaceShape, requestId: number, items: DynamicAutocompleteItem[]): void {
            const callback = this._autocompleteCallbacks?.get(requestId);
            if (callback) {
                this._autocompleteCallbacks!.delete(requestId);
                callback(items);
            }
        },

        EnableLinkValidation(this: BaseInterfaceShape, timeoutMs?: number): void {
            if (!this.OnFileExistsRequest) {
                console.warn("[EnableLinkValidation] OnFileExistsRequest callback not defined");
                return;
            }
            this._fileExistsCallbacks = new Map();
            this._fileExistsRequestId = 0;

            if (timeoutMs !== undefined) {
                setFileExistsTimeout(timeoutMs);
            }

            const self = this;
            setFileExistsChecker((path, callback) => {
                const requestId = self._fileExistsRequestId!++;
                self._fileExistsCallbacks!.set(requestId, callback);
                self.OnFileExistsRequest!(path, requestId);
            });
        },

        DisableLinkValidation(this: BaseInterfaceShape): void {
            setFileExistsChecker(undefined);
            this._fileExistsCallbacks?.clear();
        },

        ProvideFileExists(this: BaseInterfaceShape, requestId: number, exists: boolean): void {
            const callback = this._fileExistsCallbacks?.get(requestId);
            if (callback) {
                this._fileExistsCallbacks!.delete(requestId);
                callback(exists);
            }
        },

        /** Called by Gmod when files were created/deleted and cached answers may be stale */
        ClearFileExistsCache(): void {
            clearFileExistsCache();
        },
    };
}

/**
 * Everything createSharedInterfaceMethods provides, derived from the
 * implementation so the extended interfaces can inherit these declarations
 * instead of restating them (and drifting).
 */
export type SharedInterfaceMethods = ReturnType<typeof createSharedInterfaceMethods>;