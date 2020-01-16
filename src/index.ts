import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";

monaco.languages.register({
  id: "lua",
  extensions: [".lua"],
  aliases: ["Lua", "lua"],
});
monaco.languages.setMonarchTokensProvider("lua", lua.language);
monaco.languages.setLanguageConfiguration("lua", lua.conf);
monaco.languages.registerDocumentFormattingEditProvider("lua", new LuaFormatter());

var editor = monaco.editor.create(document.getElementById("container"), {
  value: ["do", "\tlua()", "end"].join("\n"),
  language: "lua",

  theme: "vs-dark",

  minimap: {
    enabled: false,
  },
  autoIndent: "full",
  formatOnPaste: true,
  formatOnType: true,
  acceptSuggestionOnEnter: "off",

  // snippetSuggestions
});

editor.focus();
window.addEventListener('resize', () => editor.layout());

if (globalThis.gmodinterface) {
  globalThis.gmodinterface.SetCode = (code: string) => {
    editor.setValue(code);
  };

  globalThis.gmodinterface.OnReady();
}

let previousValue: string;
setInterval(() => {
  if (previousValue && previousValue !== editor.getValue() && globalThis.gmodinterface) {
    globalThis.gmodinterface.OnCode(editor.getValue());
  }

  previousValue = editor.getValue();
}, 1);