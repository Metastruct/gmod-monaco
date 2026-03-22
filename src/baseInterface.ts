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

export interface ClientAutocompleteData {
    values: string; // Array of global non-table concatenated by '|'
    funcs: string; // Same as above but global functions and object methods
}

// Interface that both extended interfaces must satisfy for the mixin to work
export interface BaseInterfaceShape {
    editor?: monaco.editor.IStandaloneCodeEditor;
    _autocompleteCallbacks?: Map<number, (items: DynamicAutocompleteItem[]) => void>;
    _autocompleteRequestId?: number;
    OpenURL(url: string): void;
    OnAutocompleteRequest?(context: AutocompleteRequestContext, requestId: number): void;
}

export function createSharedInterfaceMethods() {
    return {
        _autocompleteCallbacks: undefined as Map<number, (items: DynamicAutocompleteItem[]) => void> | undefined,
        _autocompleteRequestId: undefined as number | undefined,

        setupLinkOpener(this: BaseInterfaceShape, editor: monaco.editor.IStandaloneCodeEditor): void {
            // @ts-ignore
            editor.getContribution("editor.linkDetector").openerService.open = (url: string) => {
                this.OpenURL(url);
            };
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
    };
}