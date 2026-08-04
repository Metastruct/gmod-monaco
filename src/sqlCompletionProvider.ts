import * as monaco from "monaco-editor";
import { replInterface } from "./replInterface";
import {
    AutocompleteRequestContext,
    createInsertRange,
    getDynamicAutocompleteProvider,
    getLineHistoryCompletions,
    getSearchModeCompletions,
    requestDynamicCompletions,
    sanitizeCompletionList,
} from "./completionProvider";

type CompletionList = monaco.languages.CompletionList;
type IRange = monaco.IRange;

// Gmod's `sql` library is SQLite, so completions target the SQLite dialect.
// Keywords are offered upper-cased (conventional for SQL); Monaco matches them
// case-insensitively, so typing "sel" still surfaces "SELECT".
const SQL_KEYWORDS = [
    "ABORT", "ACTION", "ADD", "AFTER", "ALL", "ALTER", "ANALYZE", "AND", "AS",
    "ASC", "ATTACH", "AUTOINCREMENT", "BEFORE", "BEGIN", "BETWEEN", "BY",
    "CASCADE", "CASE", "CAST", "CHECK", "COLLATE", "COLUMN", "COMMIT",
    "CONFLICT", "CONSTRAINT", "CREATE", "CROSS", "CURRENT_DATE",
    "CURRENT_TIME", "CURRENT_TIMESTAMP", "DATABASE", "DEFAULT", "DEFERRABLE",
    "DEFERRED", "DELETE", "DESC", "DETACH", "DISTINCT", "DROP", "EACH", "ELSE",
    "END", "ESCAPE", "EXCEPT", "EXCLUSIVE", "EXISTS", "EXPLAIN", "FAIL", "FOR",
    "FOREIGN", "FROM", "FULL", "GLOB", "GROUP", "HAVING", "IF", "IGNORE",
    "IMMEDIATE", "IN", "INDEX", "INDEXED", "INITIALLY", "INNER", "INSERT",
    "INSTEAD", "INTERSECT", "INTO", "IS", "ISNULL", "JOIN", "KEY", "LEFT",
    "LIKE", "LIMIT", "MATCH", "NATURAL", "NO", "NOT", "NOTNULL", "NULL", "OF",
    "OFFSET", "ON", "OR", "ORDER", "OUTER", "PLAN", "PRAGMA", "PRIMARY",
    "QUERY", "RAISE", "RECURSIVE", "REFERENCES", "REGEXP", "REINDEX", "RELEASE",
    "RENAME", "REPLACE", "RESTRICT", "RETURNING", "RIGHT", "ROLLBACK", "ROW",
    "SAVEPOINT", "SELECT", "SET", "TABLE", "TEMP", "TEMPORARY", "THEN", "TO",
    "TRANSACTION", "TRIGGER", "UNION", "UNIQUE", "UPDATE", "USING", "VACUUM",
    "VALUES", "VIEW", "VIRTUAL", "WHEN", "WHERE", "WITH", "WITHOUT",
];

// SQLite storage classes / common type affinities.
const SQL_TYPES = [
    "INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC", "BOOLEAN", "DATETIME",
    "VARCHAR", "CHAR", "FLOAT", "DOUBLE",
];

// Core SQLite built-in scalar and aggregate functions. `fn` is the snippet
// inserted (with the cursor placed inside the parens).
const SQL_FUNCTIONS: { name: string; detail: string }[] = [
    { name: "COUNT", detail: "Aggregate: number of rows" },
    { name: "SUM", detail: "Aggregate: sum of values" },
    { name: "AVG", detail: "Aggregate: average of values" },
    { name: "MIN", detail: "Aggregate: minimum value" },
    { name: "MAX", detail: "Aggregate: maximum value" },
    { name: "TOTAL", detail: "Aggregate: sum as floating point" },
    { name: "GROUP_CONCAT", detail: "Aggregate: concatenate values" },
    { name: "ABS", detail: "Absolute value" },
    { name: "ROUND", detail: "Round to N decimal places" },
    { name: "LENGTH", detail: "Length of string/blob" },
    { name: "LOWER", detail: "Lowercase a string" },
    { name: "UPPER", detail: "Uppercase a string" },
    { name: "SUBSTR", detail: "Substring (str, start, len)" },
    { name: "REPLACE", detail: "Replace occurrences in a string" },
    { name: "TRIM", detail: "Trim surrounding whitespace" },
    { name: "LTRIM", detail: "Trim leading whitespace" },
    { name: "RTRIM", detail: "Trim trailing whitespace" },
    { name: "INSTR", detail: "Position of substring" },
    { name: "COALESCE", detail: "First non-NULL argument" },
    { name: "IFNULL", detail: "Second value if first is NULL" },
    { name: "NULLIF", detail: "NULL if the two args are equal" },
    { name: "TYPEOF", detail: "Datatype of a value" },
    { name: "HEX", detail: "Hexadecimal rendering of a blob" },
    { name: "QUOTE", detail: "SQL-quoted literal" },
    { name: "RANDOM", detail: "Random integer" },
    { name: "DATE", detail: "Date string" },
    { name: "TIME", detail: "Time string" },
    { name: "DATETIME", detail: "Datetime string" },
    { name: "STRFTIME", detail: "Formatted date/time" },
    { name: "PRINTF", detail: "printf-style formatting" },
    { name: "LAST_INSERT_ROWID", detail: "Rowid of last INSERT" },
    { name: "CHANGES", detail: "Rows changed by last statement" },
];

// Handy multi-token snippets for the common statements.
const SQL_SNIPPETS: { label: string; insertText: string }[] = [
    {
        label: "select",
        insertText: "SELECT ${1:*} FROM ${2:table}${3: WHERE ${4:condition}}",
    },
    {
        label: "insert",
        insertText: "INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})",
    },
    {
        label: "update",
        insertText: "UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}",
    },
    {
        label: "delete",
        insertText: "DELETE FROM ${1:table} WHERE ${2:condition}",
    },
    {
        label: "createtable",
        insertText:
            "CREATE TABLE ${1:table} (\n\t${2:id} INTEGER PRIMARY KEY,\n\t${3:column} ${4:TEXT}\n)",
    },
];

/**
 * Completion provider for the REPL's SQLite mode. Offers static SQL keywords,
 * types, built-in functions and statement snippets, plus (when Gmod has enabled
 * it) live table/column names via the shared dynamic autocomplete channel.
 */
export class SQLCompletionProvider
    implements monaco.languages.CompletionItemProvider {
    public triggerCharacters = [".", "("];

    private staticCache: monaco.languages.CompletionItem[] = [];

    public provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): monaco.languages.ProviderResult<CompletionList> {
        if (replInterface?.searchMode && replInterface.line?.getModel() === model) {
            return sanitizeCompletionList(getSearchModeCompletions(model, position));
        }

        const lineUntil = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const insertRange = createInsertRange(position, word);

        const staticCompletions = this.getStaticCompletions(insertRange);

        // Offer prior repl commands in the line input, ranking prefix matches
        // above the SQL completions (same behaviour as the Lua provider).
        const historyItems = getLineHistoryCompletions(model, position);
        const baseCompletions: CompletionList = historyItems.length
            ? {
                  suggestions: [...staticCompletions.suggestions, ...historyItems],
                  incomplete: staticCompletions.incomplete,
              }
            : staticCompletions;

        if (getDynamicAutocompleteProvider()) {
            const { lastChar, fullIdentifier } = this.parseTableReference(
                lineUntil,
                word
            );
            const context: AutocompleteRequestContext = {
                word: word.word,
                fullIdentifier,
                lastChar,
                language: model.getLanguageId(),
                lineNumber: position.lineNumber,
                column: position.column,
                lineContent: lineUntil,
            };
            return requestDynamicCompletions(context, insertRange, baseCompletions);
        }

        return sanitizeCompletionList(baseCompletions);
    }

    /**
     * Identify a `table.` reference so Gmod can return that table's columns. If
     * the cursor sits right after a dot, `lastChar` is "." and `fullIdentifier`
     * is the dotted chain preceding the current word (e.g. "playerdata").
     */
    private parseTableReference(
        lineUntil: string,
        word: monaco.editor.IWordAtPosition
    ): { lastChar: string; fullIdentifier: string } {
        const lastChar = lineUntil.charAt(word.startColumn - 2);
        if (lastChar !== ".") {
            return { lastChar: "", fullIdentifier: word.word };
        }
        const beforeDot = lineUntil.substring(0, word.startColumn - 2);
        const match = beforeDot.match(/[A-Za-z_][A-Za-z0-9_]*$/);
        return { lastChar, fullIdentifier: match ? match[0] : "" };
    }

    private getStaticCompletions(range: IRange): CompletionList {
        if (this.staticCache.length === 0) {
            this.staticCache = this.buildStaticCache();
        }
        for (const item of this.staticCache) {
            item.range = range;
        }
        return { suggestions: this.staticCache, incomplete: false };
    }

    private buildStaticCache(): monaco.languages.CompletionItem[] {
        const placeholder = new monaco.Range(0, 0, 0, 0);
        const items: monaco.languages.CompletionItem[] = [];

        for (const snippet of SQL_SNIPPETS) {
            items.push({
                label: snippet.label,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: snippet.insertText,
                insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "SQL snippet",
                range: placeholder,
            });
        }

        for (const keyword of SQL_KEYWORDS) {
            items.push({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range: placeholder,
            });
        }

        for (const type of SQL_TYPES) {
            items.push({
                label: type,
                kind: monaco.languages.CompletionItemKind.TypeParameter,
                insertText: type,
                detail: "Type",
                range: placeholder,
            });
        }

        for (const fn of SQL_FUNCTIONS) {
            items.push({
                label: fn.name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `${fn.name}($0)`,
                insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: fn.detail,
                range: placeholder,
            });
        }

        return items;
    }
}
