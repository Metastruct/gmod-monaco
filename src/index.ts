import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as lua from "./lua";
import { LuaFormatter } from "./formatter";
import { LuaCompletionProvider } from "./completionProvider";
import { LuaReport } from "./luacheckCompat";

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

if (globalThis.gmodinterface) {
  globalThis.gmodinterface.SetCode = (code: string) => {
    editor.setValue(code);
  };

  globalThis.gmodinterface.GotoLine = (line: number) => {
    editor.revealLineInCenter(line, monaco.editor.ScrollType.Immediate);
  };

  globalThis.gmodinterface.SubmitLuaReport = (report: LuaReport) => {
    let markers: monaco.editor.IMarkerData[] = report.events.map(e => {
      return {
        message: e.message,
        endColumn: e.endColumn,
        startColumn: e.startColumn,
        startLineNumber: e.line,
        endLineNumber: e.line,
        severity: e.isError ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning
      };
    });

    monaco.editor.setModelMarkers(editor.getModel(), "luacheck", markers);
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