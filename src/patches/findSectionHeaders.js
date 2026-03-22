import { isMultilineRegexSource } from 'monaco-editor/esm/vs/editor/common/model/textModelSearch.js';
import { regExpLeadsToEndlessLoop } from 'monaco-editor/esm/vs/base/common/strings.js';

const trimDashesRegex = /^-+|-+$/g;
const CHUNK_SIZE = 100;
const MAX_SECTION_LINES = 5;

function findSectionHeaders(model, options) {
    let headers = [];
    if (options.findRegionSectionHeaders && options.foldingRules?.markers) {
        const regionHeaders = collectRegionHeaders(model, options);
        headers = headers.concat(regionHeaders);
    }
    if (options.findMarkSectionHeaders) {
        const markHeaders = collectMarkHeaders(model, options);
        headers = headers.concat(markHeaders);
    }
    return headers;
}
function collectRegionHeaders(model, options) {
    const regionHeaders = [];
    const endLineNumber = model.getLineCount();
    for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {
        const lineContent = model.getLineContent(lineNumber);
        const match = lineContent.match(options.foldingRules.markers.start);
        if (match) {
            const range = { startLineNumber: lineNumber, startColumn: match[0].length + 1, endLineNumber: lineNumber, endColumn: lineContent.length + 1 };
            if (range.endColumn > range.startColumn) {
                const sectionHeader = {
                    range,
                    ...getHeaderText(lineContent.substring(match[0].length)),
                    shouldBeInComments: false
                };
                if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
                    regionHeaders.push(sectionHeader);
                }
            }
        }
    }
    return regionHeaders;
}
function collectMarkHeaders(model, options) {
    const markHeaders = [];
    const endLineNumber = model.getLineCount();
    if (!options.markSectionHeaderRegex || options.markSectionHeaderRegex.trim() === '') {
        return markHeaders;
    }
    const multiline = isMultilineRegexSource(options.markSectionHeaderRegex);
    // Removed 'd' flag - unsupported on Chrome <90 (GMod CEF is Chrome 86)
    const regex = new RegExp(options.markSectionHeaderRegex, `gm${multiline ? 's' : ''}`);
    if (regExpLeadsToEndlessLoop(regex)) {
        return markHeaders;
    }
    for (let startLine = 1; startLine <= endLineNumber; startLine += CHUNK_SIZE - MAX_SECTION_LINES) {
        const endLine = Math.min(startLine + CHUNK_SIZE - 1, endLineNumber);
        const lines = [];
        for (let i = startLine; i <= endLine; i++) {
            lines.push(model.getLineContent(i));
        }
        const text = lines.join('\n');
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const precedingText = text.substring(0, match.index);
            const lineOffset = (precedingText.match(/\n/g) || []).length;
            const lineNumber = startLine + lineOffset;
            const matchLines = match[0].split('\n');
            const matchHeight = matchLines.length;
            const matchEndLine = lineNumber + matchHeight - 1;
            const lineStartIndex = precedingText.lastIndexOf('\n') + 1;
            const startColumn = match.index - lineStartIndex + 1;
            const lastMatchLine = matchLines[matchLines.length - 1];
            const endColumn = matchHeight === 1 ? startColumn + match[0].length : lastMatchLine.length + 1;
            const range = {
                startLineNumber: lineNumber,
                startColumn,
                endLineNumber: matchEndLine,
                endColumn
            };
            const text2 = (match.groups ?? {})['label'] ?? '';
            const hasSeparatorLine = ((match.groups ?? {})['separator'] ?? '') !== '';
            const sectionHeader = {
                range,
                text: text2,
                hasSeparatorLine,
                shouldBeInComments: true
            };
            if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
                if (markHeaders.length === 0 || markHeaders[markHeaders.length - 1].range.endLineNumber < sectionHeader.range.startLineNumber) {
                    markHeaders.push(sectionHeader);
                }
            }
            regex.lastIndex = match.index + match[0].length;
        }
    }
    return markHeaders;
}
function getHeaderText(text) {
    text = text.trim();
    const hasSeparatorLine = text.startsWith('-');
    text = text.replace(trimDashesRegex, '');
    return { text, hasSeparatorLine };
}

export { collectMarkHeaders, findSectionHeaders };
