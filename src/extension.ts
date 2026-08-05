import * as vscode from 'vscode';

type ColorDecorationPair = {
  nameDecoration: vscode.TextEditorDecorationType;
  delimDecoration: vscode.TextEditorDecorationType;
  nameRanges: vscode.Range[];
  delimRanges: vscode.Range[];
};

const DARK_PALETTE = [
  '#ff5555', // Vivid Coral Red
  '#ffb86c', // Vivid Peach Orange
  '#f1fa8c', // Vivid Bright Yellow
  '#50fa7b', // Vivid Neon Green
  '#8be9fd', // Vivid Cyan / Light Blue
  '#bd93f9', // Vivid Lavender Purple
  '#ff79c6', // Vivid Hot Pink
  '#00e5ff', // Vivid Electric Cyan
  '#a6e22e', // Vivid Lime
  '#ff922b', // Vivid Amber Orange
  '#38d9a9', // Vivid Mint
  '#e599f7'  // Vivid Orchid
];

const LIGHT_PALETTE = [
  '#d73a49', // Vivid Crimson
  '#e36209', // Vivid Burnt Orange
  '#b08800', // Vivid Saturated Gold
  '#22863a', // Vivid Forest Green
  '#0086b3', // Vivid Dark Teal
  '#005cc5', // Vivid Royal Blue
  '#6f42c1', // Vivid Deep Purple
  '#d023b7', // Vivid Magenta
  '#0969da', // Vivid Deep Blue
  '#118355', // Vivid Emerald
  '#c05621', // Vivid Amber
  '#805ad5'  // Vivid Violet
];

let activeEditor: vscode.TextEditor | undefined;
const decorationCache = new Map<string, ColorDecorationPair>();
let updateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  activeEditor = vscode.window.activeTextEditor;

  if (activeEditor && shouldProcessDoc(activeEditor.document)) {
    triggerUpdateDecorations();
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
      activeEditor = editor;
      if (activeEditor && shouldProcessDoc(activeEditor.document)) {
        triggerUpdateDecorations();
      } else {
        clearAllDecorations();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
      if (activeEditor && event.document === activeEditor.document && shouldProcessDoc(event.document)) {
        triggerUpdateDecorations();
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
      if (activeEditor && doc === activeEditor.document && shouldProcessDoc(doc)) {
        triggerUpdateDecorations();
      }
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      clearAllDecorations();
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      disposeAllDecorations();
      if (activeEditor && shouldProcessDoc(activeEditor.document)) {
        triggerUpdateDecorations();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
      if (
        e.affectsConfiguration('rainbow-html.additionalFileTypes') ||
        e.affectsConfiguration('rainbow-html.colorMode') ||
        e.affectsConfiguration('rainbow-html.tagColors')
      ) {
        disposeAllDecorations();
        if (activeEditor && shouldProcessDoc(activeEditor.document)) {
          triggerUpdateDecorations();
        } else {
          clearAllDecorations();
        }
      }
    }),
    vscode.commands.registerCommand('rainbow-html.refresh', () => triggerUpdateDecorations())
  );
}

export function deactivate() {
  disposeAllDecorations();
}

function shouldProcessDoc(doc: vscode.TextDocument): boolean {
  if (doc.languageId === 'html' || doc.fileName.endsWith('.html') || doc.fileName.endsWith('.htm')) return true;
  if (
    doc.languageId === 'javascript' ||
    doc.languageId === 'typescript' ||
    doc.languageId === 'javascriptreact' ||
    doc.languageId === 'typescriptreact'
  ) return true;

  const config = vscode.workspace.getConfiguration('rainbow-html');
  const additionalTypes = config.get<string[]>('additionalFileTypes') || [];

  for (const type of additionalTypes) {
    if (doc.languageId === type) return true;
    const suffix = type.startsWith('.') ? type : '.' + type;
    if (doc.fileName.endsWith(suffix) || doc.fileName.endsWith(type)) return true;
  }

  return false;
}

function getActivePalette(): string[] {
  const kind = vscode.window.activeColorTheme.kind;
  const isLight = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return isLight ? LIGHT_PALETTE : DARK_PALETTE;
}

function hashTagName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) + name.charCodeAt(i);
  }
  return Math.abs(hash);
}

function getManualOverrides(): Record<string, string> {
  const config = vscode.workspace.getConfiguration('rainbow-html');
  const rawObj = config.get<Record<string, string>>('tagColors') || {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(rawObj)) {
    result[key.toLowerCase()] = rawObj[key];
  }
  return result;
}

function getColorMode(): 'tagNameHash' | 'uniqueTagNames' | 'depth' {
  const config = vscode.workspace.getConfiguration('rainbow-html');
  return config.get<'tagNameHash' | 'uniqueTagNames' | 'depth'>('colorMode') || 'tagNameHash';
}

function getOrCreateDecorations(color: string): ColorDecorationPair {
  const normalizedColor = color.toLowerCase();
  let pair = decorationCache.get(normalizedColor);
  if (!pair) {
    pair = {
      nameDecoration: vscode.window.createTextEditorDecorationType({
        color: normalizedColor,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      }),
      delimDecoration: vscode.window.createTextEditorDecorationType({
        color: normalizedColor,
        opacity: '1.0',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      }),
      nameRanges: [],
      delimRanges: []
    };
    decorationCache.set(normalizedColor, pair);
  }
  return pair;
}

function clearAllDecorations() {
  if (!activeEditor) return;
  for (const pair of decorationCache.values()) {
    pair.nameRanges = [];
    pair.delimRanges = [];
    activeEditor.setDecorations(pair.nameDecoration, []);
    activeEditor.setDecorations(pair.delimDecoration, []);
  }
}

function disposeAllDecorations() {
  if (activeEditor) {
    for (const pair of decorationCache.values()) {
      activeEditor.setDecorations(pair.nameDecoration, []);
      activeEditor.setDecorations(pair.delimDecoration, []);
      pair.nameDecoration.dispose();
      pair.delimDecoration.dispose();
    }
  }
  decorationCache.clear();
}

function triggerUpdateDecorations() {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(updateDecorations, 100);
}

function updateDecorations() {
  if (!activeEditor) return;
  const doc = activeEditor.document;
  if (!shouldProcessDoc(doc)) {
    clearAllDecorations();
    return;
  }

  // Reset ranges in existing cache
  for (const pair of decorationCache.values()) {
    pair.nameRanges = [];
    pair.delimRanges = [];
  }

  const text = doc.getText();
  const segments = getProcessableSegments(doc, text);
  const palette = getActivePalette();
  const manualOverrides = getManualOverrides();
  const colorMode = getColorMode();

  // Document-wide map for uniqueTagNames mode
  const docTagColorMap = new Map<string, string>();

  // Lightweight scanner that pairs tags so opening/closing share the same color
  const rawTextElements = new Set(['script', 'style']);
  const colorStack: { name: string; color: string }[] = [];

  for (const seg of segments) {
    let pos = seg.start;
    let inComment = false;
    let inDoctype = false;

    while (pos < seg.end) {
      if (!inComment && !inDoctype && text.startsWith('<!--', pos)) {
        inComment = true;
        pos += 4;
        continue;
      }
      if (inComment) {
        const end = text.indexOf('-->', pos);
        if (end === -1 || end + 3 > seg.end) { pos = seg.end; inComment = false; continue; }
        pos = end + 3;
        inComment = false;
        continue;
      }

      if (!inDoctype && text.startsWith('<!DOCTYPE', pos)) {
        inDoctype = true;
        pos += 2;
      }
      if (inDoctype) {
        const end = text.indexOf('>', pos);
        if (end === -1 || end + 1 > seg.end) { pos = seg.end; inDoctype = false; continue; }
        pos = end + 1;
        inDoctype = false;
        continue;
      }

      if (text.charCodeAt(pos) === 60 /* '<' */) {
        const isTypeScript = doc.languageId === 'typescript' || doc.languageId === 'typescriptreact';
        if (isTypeScript && pos > 0) {
          const charBefore = text[pos - 1];
          if (/[a-zA-Z0-9]/.test(charBefore)) {
            pos++;
            continue;
          }
        }

        const gt = findTagEnd(text, pos + 1, seg.end);
        if (gt === -1 || gt >= seg.end) { pos++; continue; }
        const tagText = text.slice(pos, gt + 1);

        if (tagText.startsWith('<?') || (tagText.startsWith('<!') && !tagText.startsWith('<!DOCTYPE'))) {
          pos = gt + 1;
          continue;
        }

        const isClosing = tagText.startsWith('</');
        const nameMatch = tagText.match(/^<\/?\s*([A-Za-z][A-Za-z0-9:.-]*)/);
        if (!nameMatch) {
          pos = gt + 1;
          continue;
        }
        const tagName = nameMatch[1].toLowerCase();
        const isSelfClosingSyntax = tagText.trim().endsWith('/>');
        const isVoid = isVoidElement(tagName);
        const isSelfClosing = isSelfClosingSyntax || isVoid;

        if (isClosing) {
          let matchedColor = resolveTagColor(tagName, colorStack, palette, manualOverrides, colorMode, docTagColorMap);
          for (let i = colorStack.length - 1; i >= 0; i--) {
            if (colorStack[i].name === tagName) {
              matchedColor = colorStack[i].color;
              colorStack.splice(i);
              break;
            }
          }
          addTagPieces(doc, pos, tagText, matchedColor);
          pos = gt + 1;
          continue;
        } else {
          const assignedColor = resolveTagColor(tagName, colorStack, palette, manualOverrides, colorMode, docTagColorMap);
          addTagPieces(doc, pos, tagText, assignedColor);

          if (!isSelfClosing) {
            colorStack.push({ name: tagName, color: assignedColor });

            if (rawTextElements.has(tagName)) {
              const closeIdx = text.indexOf(`</${tagName}`, gt + 1);
              if (closeIdx !== -1 && closeIdx < seg.end) {
                const closeGt = text.indexOf('>', closeIdx + 2);
                if (closeGt !== -1 && closeGt < seg.end) {
                  const closeTagText = text.slice(closeIdx, closeGt + 1);
                  addTagPieces(doc, closeIdx, closeTagText, assignedColor);
                  for (let i = colorStack.length - 1; i >= 0; i--) {
                    if (colorStack[i].name === tagName) {
                      colorStack.splice(i);
                      break;
                    }
                  }
                  pos = closeGt + 1;
                  continue;
                }
              }
            }
          }

          pos = gt + 1;
          continue;
        }
      }

      pos++;
    }
  }

  // Apply decorations
  if (!activeEditor) return;
  for (const pair of decorationCache.values()) {
    activeEditor.setDecorations(pair.nameDecoration, pair.nameRanges);
    activeEditor.setDecorations(pair.delimDecoration, pair.delimRanges);
  }
}

function resolveTagColor(
  tagName: string,
  colorStack: { name: string; color: string }[],
  palette: string[],
  manualOverrides: Record<string, string>,
  colorMode: 'tagNameHash' | 'uniqueTagNames' | 'depth',
  docTagColorMap: Map<string, string>
): string {
  // 1. Manual Override
  if (manualOverrides[tagName]) {
    return manualOverrides[tagName];
  }

  const parentColor = colorStack.length > 0 ? colorStack[colorStack.length - 1].color : null;

  // 2. Mode resolution
  if (colorMode === 'uniqueTagNames') {
    if (docTagColorMap.has(tagName)) {
      return docTagColorMap.get(tagName)!;
    }
    // Pick unused color or fallback cycle
    let candidateIndex = docTagColorMap.size % palette.length;
    let color = palette[candidateIndex];
    if (color === parentColor && palette.length > 1) {
      candidateIndex = (candidateIndex + 1) % palette.length;
      color = palette[candidateIndex];
    }
    docTagColorMap.set(tagName, color);
    return color;
  }

  if (colorMode === 'depth') {
    let index = colorStack.length % palette.length;
    let color = palette[index];
    if (color === parentColor && palette.length > 1) {
      index = (index + 1) % palette.length;
      color = palette[index];
    }
    return color;
  }

  // Default: tagNameHash
  let index = hashTagName(tagName) % palette.length;
  let color = palette[index];
  if (color === parentColor && palette.length > 1) {
    index = (index + 1) % palette.length;
    color = palette[index];
  }
  return color;
}

function addTagPieces(doc: vscode.TextDocument, startOffset: number, tagText: string, colorHex: string) {
  if (tagText.length === 0) return;

  const pair = getOrCreateDecorations(colorHex);

  const pushDelim = (s: number, e: number) => {
    const start = doc.positionAt(startOffset + s);
    const end = doc.positionAt(startOffset + e);
    pair.delimRanges.push(new vscode.Range(start, end));
  };
  const pushName = (s: number, e: number) => {
    const start = doc.positionAt(startOffset + s);
    const end = doc.positionAt(startOffset + e);
    pair.nameRanges.push(new vscode.Range(start, end));
  };

  // '<'
  pushDelim(0, 1);
  // optional '/' for </tag
  if (tagText.startsWith('</')) {
    pushDelim(1, 2);
  }
  // tag name
  const nameMatch = tagText.match(/^<\/?\s*([A-Za-z][A-Za-z0-9:.-]*)/);
  if (nameMatch && nameMatch.index !== undefined) {
    const nameStartInTag = nameMatch[0].indexOf(nameMatch[1]);
    const nameStart = nameStartInTag;
    const nameEnd = nameStartInTag + nameMatch[1].length;
    pushName(nameStart, nameEnd);
  }

  // self-closing '/>' - find the last '/' before the final '>'
  const trimmed = tagText.trim();
  if (trimmed.endsWith('/>')) {
    const lastGt = tagText.lastIndexOf('>');
    const slashPos = tagText.lastIndexOf('/', lastGt);
    if (slashPos !== -1 && slashPos === lastGt - 1) {
      pushDelim(slashPos, lastGt);
    }
  }

  // '>'
  pushDelim(tagText.length - 1, tagText.length);
}

function isVoidElement(name: string): boolean {
  switch (name) {
    case 'area':
    case 'base':
    case 'br':
    case 'col':
    case 'embed':
    case 'hr':
    case 'img':
    case 'input':
    case 'link':
    case 'meta':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
      return true;
    default:
      return false;
  }
}

type TextSegment = { start: number; end: number };

function getProcessableSegments(doc: vscode.TextDocument, full: string): TextSegment[] {
  if (doc.languageId === 'html') {
    return [{ start: 0, end: full.length }];
  }

  const config = vscode.workspace.getConfiguration('rainbow-html');
  const additionalTypes = config.get<string[]>('additionalFileTypes') || [];
  for (const type of additionalTypes) {
    if (doc.languageId === type) return [{ start: 0, end: full.length }];
    const suffix = type.startsWith('.') ? type : '.' + type;
    if (doc.fileName.endsWith(suffix) || doc.fileName.endsWith(type)) return [{ start: 0, end: full.length }];
  }

  if (doc.languageId === 'javascriptreact' || doc.languageId === 'typescriptreact') {
    // For JSX/TSX, process the entire document buffer
    return [{ start: 0, end: full.length }];
  }
  const segments: TextSegment[] = [];
  let i = 0;
  while (i < full.length) {
    if (full[i] === '`') {
      if (isHtmlTagBeforeBacktick(full, i)) {
        const contentStart = i + 1;
        const end = scanBacktickLiteral(full, contentStart);
        if (end !== -1) {
          segments.push({ start: contentStart, end });
          // Collect nested html`...` inside ${ ... } expressions within this template
          collectNestedHtmlTemplates(full, contentStart, end, segments);
          i = end + 1;
          continue;
        }
      }
    }
    i++;
  }
  return segments;
}

function isHtmlTagBeforeBacktick(full: string, backtickIndex: number): boolean {
  // Look backwards for an identifier ending with .?html before optional whitespace/comments
  let k = backtickIndex - 1;
  // skip whitespace
  while (k >= 0 && /\s/.test(full[k])) k--;
  // skip line comments
  if (k >= 1 && full[k - 1] === '/' && full[k] === '/') {
    // move back to line start
    while (k >= 0 && full[k] !== '\n') k--;
  }
  // read last identifier possibly after a dot chain
  let endWord = k;
  while (endWord >= 0 && /[A-Za-z0-9_$]/.test(full[endWord])) endWord--;
  let word = full.slice(endWord + 1, k + 1);
  if (word.length === 0 && full[endWord] === '.') {
    // try previous identifiers in a dotted chain
    let p = endWord - 1;
    while (p >= 0 && /[A-Za-z0-9_$\.]/.test(full[p])) p--;
    const chain = full.slice(p + 1, k + 1).replace(/\s+/g, '');
    if (chain.endsWith('.html')) word = 'html';
  }
  return word === 'html';
}

function collectNestedHtmlTemplates(full: string, start: number, end: number, out: TextSegment[]) {
  // Scan template content for ${ ... } expressions and within them for nested html`...`
  let j = start;
  while (j < end) {
    const next2 = full.slice(j, j + 2);
    if (next2 === '${') {
      const exprStart = j + 2;
      const exprEnd = scanTemplateExpr(full, exprStart, end);
      if (exprEnd === -1) return;
      scanRangeForHtmlTemplates(full, exprStart, exprEnd, out);
      j = exprEnd;
      continue;
    }
    // handle escaped backtick inside content
    if (full[j] === '\\' && j + 1 < end) { j += 2; continue; }
    j++;
  }
}

function scanRangeForHtmlTemplates(full: string, start: number, end: number, out: TextSegment[]) {
  let k = start;
  while (k < end) {
    if (full[k] === '`') {
      if (isHtmlTagBeforeBacktick(full, k)) {
        const innerStart = k + 1;
        const innerEnd = scanBacktickLiteral(full, innerStart);
        if (innerEnd !== -1 && innerEnd <= full.length) {
          out.push({ start: innerStart, end: innerEnd });
          // Recurse for nested html inside this template's expressions
          collectNestedHtmlTemplates(full, innerStart, innerEnd, out);
          k = innerEnd + 1;
          continue;
        }
      }
    }
    k++;
  }
}



function findTagEnd(text: string, startPos: number, hardEnd: number): number {
  // Find '>' but treat `>` inside attribute values as text.
  // Handle quotes ' and " and also template placeholders like ${ ... } inside attribute values.
  // ALSO handle TSX expressions { ... } which might contain operators like > or strings.
  let i = startPos;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let braceDepth = 0; // Track { } for TSX expressions

  while (i < hardEnd) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);

    if (inSingle || inDouble || inBacktick) {
      if (ch === '\\' && i + 1 < hardEnd) {
        i += 2;
        continue;
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inBacktick && ch === '`') inBacktick = false;
      i++;
      continue;
    }

    // Enter strings
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === '`') { inBacktick = true; i++; continue; }

    // TSX expressions
    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      i++;
      continue;
    }

    // Handle template expressions ${...} if we are somehow scanning inside a backtick literal's tag attributes
    if (next2 === '${') {
      const res = scanTemplateExpr(text, i + 2, hardEnd);
      if (res === -1) return -1;
      i = res;
      continue;
    }

    // End of tag
    if (ch === '>' && braceDepth === 0) {
      return i;
    }

    i++;
  }
  return -1;
}

function scanTemplateExpr(text: string, startPos: number, hardEnd: number): number {
  // We enter right after the `${`. We must stop right after the matching `}` of this expression.
  let i = startPos;
  let braceDepth = 1; // one '{' from `${`
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  while (i < hardEnd) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);
    // Handle escapes in any string mode
    if ((inSingle || inDouble || inBacktick) && ch === '\\') { i += 2; continue; }
    // Toggle string modes
    if (!inDouble && !inBacktick && ch === "'" && !inSingle) { inSingle = true; i++; continue; }
    if (inSingle && ch === "'") { inSingle = false; i++; continue; }
    if (!inSingle && !inBacktick && ch === '"' && !inDouble) { inDouble = true; i++; continue; }
    if (inDouble && ch === '"') { inDouble = false; i++; continue; }
    if (!inSingle && !inDouble && ch === '`' && !inBacktick) { inBacktick = true; i++; continue; }
    if (inBacktick && ch === '`') { inBacktick = false; i++; continue; }

    if (!(inSingle || inDouble || inBacktick)) {
      // Handle comments
      if (next2 === '//') {
        // Skip single-line comment
        i += 2;
        while (i < hardEnd && text[i] !== '\n') i++;
        if (i < hardEnd) i++; // skip the newline
        continue;
      }
      if (next2 === '/*') {
        // Skip multi-line comment
        i += 2;
        while (i < hardEnd - 1) {
          if (text.slice(i, i + 2) === '*/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }

      if (next2 === '${') { braceDepth++; i += 2; continue; }
      if (ch === '{') { braceDepth++; i++; continue; }
      if (ch === '}') { braceDepth--; i++; if (braceDepth === 0) return i; continue; }
    }
    i++;
  }
  return -1;
}

function scanBacktickLiteral(text: string, startPos: number): number {
  // startPos is first char after opening backtick. Return index of closing backtick.
  let i = startPos;
  let expr = 0;
  while (i < text.length) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);
    if (ch === '\\') { i += 2; continue; }
    if (expr === 0) {
      if (ch === '`') return i;
      if (next2 === '${') { expr = 1; i += 2; continue; }
      i++;
    } else {
      // inside ${...}
      if (next2 === '${') { expr++; i += 2; continue; }
      if (ch === '}') { expr--; i++; continue; }
      // handle string literals inside the JS expression
      if (ch === '"' || ch === "'" || ch === '`') {
        const endStr = scanJsString(text, i);
        i = endStr === -1 ? i + 1 : endStr;
        continue;
      }
      i++;
    }
  }
  return -1;
}

function scanJsString(text: string, startPos: number): number {
  const quote = text[startPos];
  let i = startPos + 1;
  let nestedTpl = 0;
  while (i < text.length) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);
    if (ch === '\\') { i += 2; continue; }
    if (quote === '`') {
      if (next2 === '${') { nestedTpl++; i += 2; continue; }
      if (ch === '`' && nestedTpl === 0) return i + 1;
      if (ch === '}' && nestedTpl > 0) { nestedTpl--; i++; continue; }
      i++;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return -1;
}

function extractProcessableText(doc: vscode.TextDocument): string {
  // For html documents, process the whole text
  if (doc.languageId === 'html') {
    return doc.getText();
  }
  // For JS/TS variants, extract html`...` template literal contents, skipping ${...}
  const full = doc.getText();
  let result = '';
  let i = 0;
  while (i < full.length) {
    // Look for html` start
    if (full.startsWith('html`', i)) {
      i += 5; // move past html`
      const start = i;
      let buf = '';
      let inExprDepth = 0;
      while (i < full.length) {
        const ch = full[i];
        const next2 = full.slice(i, i + 2);
        if (inExprDepth === 0 && ch === '`') {
          // end of template
          result += buf;
          i++; // consume closing backtick
          break;
        }
        if (inExprDepth === 0 && next2 === '${') {
          // enter expression; skip until matching }
          inExprDepth = 1;
          i += 2;
          // Skip expression content with rudimentary brace balancing
          let brace = 1;
          while (i < full.length && brace > 0) {
            const c = full[i];
            if (c === '{') brace++;
            else if (c === '}') brace--;
            i++;
          }
          continue;
        }
        // handle escaped backticks \`
        if (ch === '\\' && i + 1 < full.length && full[i + 1] === '`') {
          buf += '`';
          i += 2;
          continue;
        }
        buf += ch;
        i++;
      }
      continue;
    }
    i++;
  }
  return result;
}


