import { autocompletionData } from "../autocompletionData";
import { GluaFunc } from "./GluaFunc";
import { GluaEnum } from "./GluaEnum";

function PreprocessGWikiElem(elem: any, parentElem: any) {
    if (elem.args && elem.args.arg) {
        if (Array.isArray(elem.args.arg)) {
            elem.args = elem.args.arg;
        } else {
            elem.args = [elem.args.arg];
        }
    } else {
        elem.args = [];
    }
    if (elem.rets && elem.rets.ret) {
        if (Array.isArray(elem.rets.ret)) {
            elem.rets = elem.rets.ret;
        } else {
            elem.rets = [elem.rets.ret];
        }
    } else {
        elem.rets = [];
    }
    if (typeof elem.description === "string") {
        elem.description = { text: elem.description };
    }
    if (elem.description && !elem.description.text) {
        elem.description.text = "";
    } else if (!elem.description) {
        elem.description = { text: "" };
    }
    elem.example = elem.example || parentElem.example;
    if (elem.example) {
        if (Array.isArray(elem.example)) {
            elem.example = elem.example;
        } else {
            elem.example = [elem.example];
        }
        // https://i.imgur.com/hipDRlx.png
        // This ruins everything
        elem.example.forEach((element: { code: any }, idx: any) => {
            if (typeof element.code !== "string") {
                elem.example.splice(idx, 1);
            }
        });
    } else {
        elem.example = [];
    }
}

function addEnum(jsonOBJ: any) {
    if (Array.isArray(jsonOBJ.enum)) {
        jsonOBJ.enum.forEach((element: any) => {
            addEnum({ items: element });
        });
        return;
    }
    let enums;
    if (Array.isArray(jsonOBJ)) {
        enums = jsonOBJ;
    } else {
        enums = jsonOBJ.items.item;
    }
    enums.forEach((element: { items: any }) => {
        if (element.items) {
            addEnum(element);
            return;
        }
        const enumObj = new GluaEnum(element);
        if (autocompletionData.valuesLookup.has(enumObj.key)) {
            // Avoid enum duplicates
            return;
        }
        enumObj.tableDesc = jsonOBJ.description;
        autocompletionData.valuesLookup.set(enumObj.key, enumObj);
        autocompletionData.enums.push(enumObj);
    });
}

export let gwikiData: any[];

export function LoadAutocompletionData(currentState: string) {
    if (!gwikiData) {
        fetch("https://metastruct.github.io/gmod-wiki-scraper/gwiki.json")
            .then(response => {
                return response.json();
            })
            .then(data => {
                gwikiData = data;
                LoadAutocompletionData(currentState);
            });
        return;
    }
    gwikiData.forEach(elem => {
        if (elem.realms.indexOf(currentState) === -1) {
            return;
        }
        if (elem.function) {
            const funcElem = elem.function;
            PreprocessGWikiElem(funcElem, elem);
            const func = new GluaFunc(funcElem);
            autocompletionData.valuesLookup.set(func.getFullName(), func);
            if (autocompletionData.modules.indexOf(func.parent) === -1) {
                autocompletionData.modules.push(func.parent);
            }
            if (func.type === "classfunc" || func.type === "panelfunc") {
                autocompletionData.classmethods.push(func);
                if (autocompletionData.methodsLookup.has(func.name)) {
                    autocompletionData.methodsLookup.get(func.name)?.push(func);
                } else {
                    autocompletionData.methodsLookup.set(func.name, [func]);
                }
            } else if (func.type === "hook") {
                autocompletionData.valuesLookup.set(func.name, func);
                autocompletionData.hooks.push(func);
            } else {
                autocompletionData.functions.push(func);
            }
        } else if (elem.enum) {
            addEnum(elem.enum);
        }
    });
    autocompletionData.ClearAutocompleteCache();
}
