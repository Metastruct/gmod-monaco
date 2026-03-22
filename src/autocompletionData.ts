import * as monaco from "monaco-editor";
import { GmodInterfaceValue } from "./glua/GmodInterfaceValue";
import { GluaEnum } from "./glua/GluaEnum";
import { GluaFunc } from "./glua/GluaFunc";
import { GluaItem } from "./glua/GluaItem";

const buildinSnippets = [
    {
        name: "local",
        code: "local ${1:x} = ${2:1}",
    },
    {
        name: "fun",
        code: "function ${1:fname}(${2:...})\n${3:-- body}\nend",
    },
    {
        name: "for",
        code: "for ${1:i}=${2:1},${3:10} do\n${4:print(i)}\nend",
    },
    {
        name: "forp",
        code:
            "for ${1:i},${2:v} in pairs(${3:table_name}) do\n${4:-- body}\nend",
    },
    {
        name: "fori",
        code:
            "for ${1:i},${2:v} in ipairs(${3:table_name}) do\n${4:-- body}\nend",
    },
    {
        name: "hookadd",
        code:
            'local function ${1:hookname}(${3:...})\n${4:-- body}\nend\nhook.Add("${1:hookname}",${2:Tag},${1:hookname})',
    },
];
const buildinConstants = ["SERVER", "CLIENT", "_G", "_VERSION", "VERSION"];
const keywords = [
    "and",
    "break",
    "do",
    "else",
    "elseif",
    "end",
    "false",
    "for",
    "function",
    "goto",
    "if",
    "in",
    "local",
    "nil",
    "not",
    "or",
    "repeat",
    "return",
    "then",
    "true",
    "until",
    "while",
    "continue",
];

class AutocompletionData {
    constants: string[] = buildinConstants;
    keywords: string[] = keywords;
    classmethods: GluaFunc[] = [];
    functions: GluaFunc[] = [];
    hooks: GluaFunc[] = [];
    modules: string[] = [];
    interfaceValues: GmodInterfaceValue[] = [];
    snippets: {
        name: string;
        code: string;
    }[] = buildinSnippets;
    enums: GluaEnum[] = [];
    valuesLookup: Map<string, GluaItem> = new Map();
    methodsLookup: Map<string, GluaItem[]> = new Map();
    globalCache: monaco.languages.CompletionItem[] = [];
    methodsCache: monaco.languages.CompletionItem[] = [];
    GenerateGlobalCache() {
        this.globalCache = [];
        autocompletionData.functions.forEach((func: GluaFunc) => {
            if (!func?.isValid()) return;
            this.globalCache.push({
                label: func.getFullName(),
                kind: monaco.languages.CompletionItemKind.Function,
                detail: func.getDetail(),
                documentation: func.getSuggestDocumentation(),
                insertText: func.generateUsageSnippet(),
                insertTextRules: func.hasArgs()
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                tags: func.description?.deprecated !== undefined
                    ? [monaco.languages.CompletionItemTag.Deprecated]
                    : [],
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.enums.forEach((enumObj: GluaEnum) => {
            if (!enumObj?.key) return;
            this.globalCache.push({
                label: enumObj.key,
                kind: monaco.languages.CompletionItemKind.Enum,
                detail: `Value: ${enumObj.value ?? ""}`,
                documentation: enumObj.getDetail?.() ?? "",
                insertText: enumObj.key,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.snippets.forEach((snippet) => {
            if (!snippet?.name) return;
            this.globalCache.push({
                label: snippet.name,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: snippet.code ?? "",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.constants.forEach((constant) => {
            this.globalCache.push({
                label: constant,
                kind: monaco.languages.CompletionItemKind.Constant,
                insertText: constant,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.keywords.forEach((keyword) => {
            this.globalCache.push({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.modules.forEach((moduleName: string) => {
            if (!moduleName) return;
            this.globalCache.push({
                label: moduleName,
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: moduleName,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.interfaceValues.forEach((interfaceValue: GmodInterfaceValue) => {
            if (!interfaceValue?.fullname || interfaceValue.classFunction) return;
            this.globalCache.push({
                label: interfaceValue.fullname,
                kind: interfaceValue.getCompletionKind?.() ?? monaco.languages.CompletionItemKind.Variable,
                documentation: interfaceValue.description ?? "",
                insertText: interfaceValue.getUsage?.() ?? interfaceValue.fullname,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
    }
    GenerateMethodsCache() {
        autocompletionData.classmethods.forEach((method: GluaFunc) => {
            if (!method?.isValid()) return;
            this.methodsCache.push({
                label: method.getFullName(),
                kind: monaco.languages.CompletionItemKind.Method,
                detail: method.getDetail(),
                documentation: method.getSuggestDocumentation(),
                insertText: method.generateUsageSnippet(),
                sortText: method.name ?? "",
                filterText: method.name ?? "",
                insertTextRules: method.hasArgs()
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                tags: method.description?.deprecated !== undefined
                    ? [monaco.languages.CompletionItemTag.Deprecated]
                    : [],
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.hooks.forEach((hook: GluaFunc) => {
            if (!hook?.isValid()) return;
            this.methodsCache.push({
                label: hook.getFullName(),
                kind: monaco.languages.CompletionItemKind.Event,
                detail: hook.getDetail(),
                documentation: hook.getSuggestDocumentation(),
                insertText: hook.generateUsageSnippet(),
                insertTextRules: hook.hasArgs()
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                tags: hook.description?.deprecated !== undefined
                    ? [monaco.languages.CompletionItemTag.Deprecated]
                    : [],
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
        autocompletionData.interfaceValues.forEach((interfaceValue: GmodInterfaceValue) => {
            if (!interfaceValue?.fullname || !interfaceValue.classFunction) return;
            this.methodsCache.push({
                label: interfaceValue.fullname,
                kind: interfaceValue.getCompletionKind?.() ?? monaco.languages.CompletionItemKind.Method,
                detail: "Clientside value",
                documentation: interfaceValue.description ?? "",
                insertText: interfaceValue.getUsage?.() ?? interfaceValue.fullname,
                sortText: interfaceValue.name ?? "",
                filterText: interfaceValue.name ?? "",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                range: new monaco.Range(0, 0, 0, 0),
            });
        });
    }
    updateCacheRange(
        cache: monaco.languages.CompletionItem[],
        newRange: monaco.IRange
    ) {
        cache.forEach((val) => {
            val.range = newRange;
        });
    }
    globalAutocomplete(range: monaco.IRange): monaco.languages.CompletionList {
        if (this.globalCache.length === 0) {
            this.GenerateGlobalCache();
        }
        this.updateCacheRange(this.globalCache, range);
        return {
            suggestions: this.globalCache,
        };
    }
    methodAutocomplete(range: monaco.IRange): monaco.languages.CompletionList {
        if (this.methodsCache.length === 0) {
            this.GenerateMethodsCache();
        }
        this.updateCacheRange(this.methodsCache, range);
        return {
            suggestions: this.methodsCache,
        };
    }
    hookAutocomplete(range: monaco.IRange, addQuotes: boolean): monaco.languages.CompletionList {
        const hookSuggestions: monaco.languages.CompletionItem[] = [];
        autocompletionData.hooks.forEach((hook: GluaFunc) => {
            if (!hook?.isValid() || hook.parent !== "GM") return;
            const hookName = hook.name ?? "";
            hookSuggestions.push({
                label: `"${hookName}"`,
                kind: monaco.languages.CompletionItemKind.Event,
                detail: hook.generateUsageText(),
                documentation: hook.description?.text ?? "",
                insertText: addQuotes ? `"${hookName}"` : hookName,
                range,
            });
        });
        return { suggestions: hookSuggestions };
    }
    AddNewInterfaceValue(val: GmodInterfaceValue) {
        if (!val.fullname) {
            console.error("Cant add new value without a fullname");
            return;
        }
        if (
            buildinConstants.indexOf(val.fullname) !== -1 ||
            keywords.indexOf(val.fullname) !== -1
        ) {
            return;
        }
        autocompletionData.interfaceValues.push(val);
        autocompletionData.valuesLookup.set(val.fullname, val);
        if (val.classFunction) {
            if (autocompletionData.methodsLookup.has(val.name)) {
                autocompletionData.methodsLookup.get(val.name)?.push(val);
            } else {
                autocompletionData.methodsLookup.set(val.name, [val]);
            }
            this.ClearMethodsAutocompletionCache();
        } else {
            this.ClearGlobalAutocompletionCache();
        }
    }
    ClearMethodsAutocompletionCache() {
        this.methodsCache = [];
    }
    ClearGlobalAutocompletionCache() {
        this.globalCache = [];
    }
    ClearAutocompleteCache() {
        this.globalCache = [];
        this.methodsCache = [];
    }
}

export let autocompletionData: AutocompletionData = new AutocompletionData();
export function ResetAutocomplete() {
    autocompletionData = new AutocompletionData();
}
