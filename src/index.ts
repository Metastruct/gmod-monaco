import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";
import { LuaReport } from "./luacheckCompat";

monaco.languages.register({
  id: "lua",
  extensions: [".lua"],
  aliases: ["Lua", "lua"],
});
monaco.languages.setMonarchTokensProvider("lua", lua.language);
monaco.languages.setLanguageConfiguration("lua", lua.conf);
monaco.languages.registerDocumentFormattingEditProvider("lua", new LuaFormatter());

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
  acceptSuggestionOnEnter: "off",

  // snippetSuggestions
});

editor.focus();
window.addEventListener('resize', () => editor.layout());

if (globalThis.gmodinterface) {
  globalThis.gmodinterface.SetCode = (code: string) => {
    editor.setValue(code);
  };

  let curDecoration: string[] = [];
  globalThis.gmodinterface.SubmitLuaReport = (report: LuaReport) => {
    let newDecorations: monaco.editor.IModelDeltaDecoration[] = report.events.map(e => {
      return {
        range: new monaco.Range(e.line, e.startColumn, e.line, e.endColumn),
        options: {
          glyphMarginHoverMessage: { value: e.message }
        }
      }
    });

    curDecoration = editor.deltaDecorations(curDecoration, newDecorations);
  }

  globalThis.gmodinterface.OnReady();
}

let previousValue: string;
setInterval(() => {
  if (previousValue && previousValue !== editor.getValue() && globalThis.gmodinterface) {
    globalThis.gmodinterface.OnCode(editor.getValue());
  }

  previousValue = editor.getValue();
}, 1);