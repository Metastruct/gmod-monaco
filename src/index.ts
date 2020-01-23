import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";
import { LuaCompletionProvider } from "./completionProvider";
import { GmodInterface } from "./gmodInterface";

monaco.languages.register({
  id: "lua",
  extensions: [".lua"],
  aliases: ["Lua", "lua"],
});

monaco.languages.setMonarchTokensProvider("lua", lua.language);
monaco.languages.setLanguageConfiguration("lua", lua.conf);
monaco.languages.registerDocumentFormattingEditProvider("lua", new LuaFormatter());
monaco.languages.registerCompletionItemProvider("lua", new LuaCompletionProvider());

let editor = monaco.editor.create(document.getElementById("container"), {
  value: ["do", "\tlua()", "end"].join("\n"),
  language: "lua",

  theme: "vs-dark",

  minimap: {
    enabled: false,
  },
  autoIndent: "full",
  formatOnPaste: true,
  formatOnType: true,
  acceptSuggestionOnEnter: "smart",

  // snippetSuggestions
});

editor.focus();
window.addEventListener("resize", () => editor.layout());

GmodInterface.SetEditor(editor);

// override GmodInterface funcs with the lua ones we received
if (globalThis.gmodinterface) {
  // valid functions to copy over
  let validFuncNames: string[] = [ "OnCode", "OnReady" ];

  for (let funcName of validFuncNames) {
    let luaDefinedFunc: any = globalThis.gmodinterface[funcName]
    if (luaDefinedFunc) {
      GmodInterface[funcName] = luaDefinedFunc;
    }
  }
}

globalThis.gmodinterface = GmodInterface;
GmodInterface.OnReady();