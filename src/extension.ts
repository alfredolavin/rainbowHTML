import * as vscode from 'vscode';

type ColorDecorationPair = {
  nameDecoration: vscode.TextEditorDecorationType;
  delimDecoration: vscode.TextEditorDecorationType;
};

type PerColorRanges = {
  nameRanges: vscode.Range[];
  delimRanges: vscode.Range[];
};

const PALETTE = [
  'rainbowHtml.color0',
  'rainbowHtml.color1',
  'rainbowHtml.color2',
  'rainbowHtml.color3',
  'rainbowHtml.color4',
  'rainbowHtml.color5',
  'rainbowHtml.color6',
  'rainbowHtml.color7',
  'rainbowHtml.color8',
  'rainbowHtml.color9',
  'rainbowHtml.color10',
  'rainbowHtml.color11'
];

const decorationCache = new Map<string, ColorDecorationPair>();
let updateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Paint decorations immediately on startup for all visible editors
  updateAllVisibleEditors();
  // Queue subsequent ticks in case editors are still mounting in VS Code
  setTimeout(() => updateAllVisibleEditors(), 0);
  setTimeout(() => updateAllVisibleEditors(), 150);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
      if (editor && shouldProcessDoc(editor.document)) {
        updateDecorationsForEditor(editor);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors: readonly vscode.TextEditor[]) => {
      for (const editor of editors) {
        if (shouldProcessDoc(editor.document)) {
          updateDecorationsForEditor(editor);
        }
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === event.document && shouldProcessDoc(editor.document)) {
          triggerUpdateDecorationsForEditor(editor);
        }
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc && shouldProcessDoc(doc)) {
          updateDecorationsForEditor(editor);
        }
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      disposeAllDecorations();
      updateAllVisibleEditors();
    }),
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
      if (
        e.affectsConfiguration('rainbow-html.additionalFileTypes') ||
        e.affectsConfiguration('rainbow-html.colorMode') ||
        e.affectsConfiguration('rainbow-html.tagColors') ||
        e.affectsConfiguration('rainbow-html.tagShadow')
      ) {
        disposeAllDecorations();
        updateAllVisibleEditors();
      }
    }),
    vscode.commands.registerCommand('rainbow-html.refresh', () => {
      disposeAllDecorations();
      updateAllVisibleEditors();
    })
  );
}

export function deactivate() {
  disposeAllDecorations();
}

function shouldProcessDoc(doc: vscode.TextDocument | undefined): boolean {
  if (!doc) return false;

  const lang = doc.languageId ? doc.languageId.toLowerCase() : '';
  if (
    lang === 'html' ||
    lang === 'htm' ||
    lang === 'javascript' ||
    lang === 'typescript' ||
    lang === 'javascriptreact' ||
    lang === 'typescriptreact' ||
    lang === 'jsx' ||
    lang === 'tsx' ||
    lang === 'vue' ||
    lang === 'svelte' ||
    lang === 'astro' ||
    lang === 'php' ||
    lang === 'blade' ||
    lang === 'handlebars' ||
    lang === 'razor' ||
    lang === 'xml' ||
    lang === 'svg' ||
    lang === 'nunjucks' ||
    lang === 'njk' ||
    lang === 'twig' ||
    lang === 'jinja-html' ||
    lang === 'django-html'
  ) {
    return true;
  }

  const fileName = doc.fileName ? doc.fileName.toLowerCase() : '';
  if (
    fileName.endsWith('.html') ||
    fileName.endsWith('.htm') ||
    fileName.endsWith('.jsx') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.vue') ||
    fileName.endsWith('.svelte') ||
    fileName.endsWith('.astro') ||
    fileName.endsWith('.php') ||
    fileName.endsWith('.blade.php') ||
    fileName.endsWith('.xml') ||
    fileName.endsWith('.svg') ||
    fileName.endsWith('.njk') ||
    fileName.endsWith('.nunjucks') ||
    fileName.endsWith('.twig') ||
    fileName.endsWith('.hbs') ||
    fileName.endsWith('.handlebars')
  ) {
    return true;
  }

    const config = vscode.workspace.getConfiguration('rainbow-html');
  const additionalTypes = config.get<string[]>('additionalFileTypes') || [];

  for (const type of additionalTypes) {
    const cleanType = type.toLowerCase().trim();
    if (lang === cleanType) return true;
    const suffix = cleanType.startsWith('.') ? cleanType : '.' + cleanType;
    if (fileName.endsWith(suffix)) return true;
  }

  // Also process documents of any other language if they include HTML/XML or tagged template literals
  const fullText = doc.getText();
  if (/(?:html|svg|xml|lit)\s*`|\/\*\s*(?:html|xml|svg)\s*\*\/`|<template\b|```(?:html|xml|svg)/i.test(fullText)) {
    return true;
  }

  return false;
}

// 32-bit FNV-1a hash with avalanche mixer to evenly disperse tag names across the palette
function hashTagName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return Math.abs(h);
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

type ColorMode = 'rainbow' | 'depth' | 'tagNameHash' | 'uniqueTagNames';

function getColorMode(): ColorMode {
  const config = vscode.workspace.getConfiguration('rainbow-html');
  const mode = config.get<string>('colorMode') || 'rainbow';
  if (mode === 'depth' || mode === 'tagNameHash' || mode === 'uniqueTagNames') {
    return mode;
  }
  return 'rainbow';
}

function getTagShadow(): string {
  const config = vscode.workspace.getConfiguration('rainbow-html');
  const shadow = config.get<string>('tagShadow')?.trim() || '';
  if (!shadow || shadow.toLowerCase() === 'none' || shadow.toLowerCase() === 'off') {
    return '';
  }
  return shadow;
}

function getOrCreateDecorations(color: string): ColorDecorationPair {
  const normalizedColor = color.startsWith('rainbowHtml.') ? color : color.toLowerCase();
  const shadow = getTagShadow();
  const cacheKey = shadow ? `${normalizedColor}:${shadow}` : normalizedColor;
  let pair = decorationCache.get(cacheKey);
  if (!pair) {
    const isThemeColor = normalizedColor.startsWith('rainbowHtml.');
    const colorValue = isThemeColor ? new vscode.ThemeColor(normalizedColor) : normalizedColor;

    const nameDecorationOptions: vscode.DecorationRenderOptions = {
      color: colorValue,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    };
    if (shadow) {
      nameDecorationOptions.textDecoration = `none; text-shadow: ${shadow}`;
    }

    pair = {
      nameDecoration: vscode.window.createTextEditorDecorationType(nameDecorationOptions),
      delimDecoration: vscode.window.createTextEditorDecorationType({
        color: colorValue,
        opacity: '1.0',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      })
    };
    decorationCache.set(cacheKey, pair);
  }
  return pair;
}

function disposeAllDecorations() {
  for (const pair of decorationCache.values()) {
    pair.nameDecoration.dispose();
    pair.delimDecoration.dispose();
  }
  decorationCache.clear();
}

function updateAllVisibleEditors() {
  for (const editor of vscode.window.visibleTextEditors) {
    if (shouldProcessDoc(editor.document)) {
      updateDecorationsForEditor(editor);
    }
  }
}

const editorTimers = new WeakMap<vscode.TextEditor, ReturnType<typeof setTimeout>>();

function triggerUpdateDecorationsForEditor(editor: vscode.TextEditor) {
  const existing = editorTimers.get(editor);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    if (vscode.window.visibleTextEditors.includes(editor)) {
      updateDecorationsForEditor(editor);
    }
  }, 60);
  editorTimers.set(editor, timer);
}

function updateDecorationsForEditor(editor: vscode.TextEditor) {
  const doc = editor.document;
  if (!shouldProcessDoc(doc)) {
    return;
  }

  const text = doc.getText();
  const segments = getProcessableSegments(doc, text);
  const palette = PALETTE;
  const manualOverrides = getManualOverrides();
  const colorMode = getColorMode();

  // Document-wide map for uniqueTagNames mode
  const docTagColorMap = new Map<string, string>();

  // Ranges collected per color for this editor
  const rangesByColor = new Map<string, PerColorRanges>();

  const getRanges = (colorHex: string): PerColorRanges => {
    const normalized = colorHex.startsWith('rainbowHtml.') ? colorHex : colorHex.toLowerCase();
    let ranges = rangesByColor.get(normalized);
    if (!ranges) {
      ranges = { nameRanges: [], delimRanges: [] };
      rangesByColor.set(normalized, ranges);
    }
    return ranges;
  };

  const rawTextElements = new Set(['script', 'style']);
  const colorStack: { name: string; color: string }[] = [];
  let rainbowCycleIndex = 0;

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
        const isTypeScript = doc.languageId === 'typescript' || doc.languageId === 'typescriptreact' || doc.fileName.endsWith('.tsx') || doc.fileName.endsWith('.ts');
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
          let matchedColor: string | undefined;
          for (let i = colorStack.length - 1; i >= 0; i--) {
            if (colorStack[i].name === tagName) {
              matchedColor = colorStack[i].color;
              colorStack.splice(i);
              break;
            }
          }

          if (!matchedColor) {
            matchedColor = resolveTagColor(
              tagName,
              colorStack,
              palette,
              manualOverrides,
              colorMode,
              docTagColorMap,
              rainbowCycleIndex
            );
          }

          addTagPieces(doc, pos, tagText, matchedColor, getRanges(matchedColor));
          pos = gt + 1;
          continue;
        } else {
          const assignedColor = resolveTagColor(
            tagName,
            colorStack,
            palette,
            manualOverrides,
            colorMode,
            docTagColorMap,
            rainbowCycleIndex
          );
          rainbowCycleIndex = (rainbowCycleIndex + 1) % palette.length;

          addTagPieces(doc, pos, tagText, assignedColor, getRanges(assignedColor));

          if (!isSelfClosing) {
            colorStack.push({ name: tagName, color: assignedColor });

            if (rawTextElements.has(tagName)) {
              const closeIdx = text.indexOf(`</${tagName}`, gt + 1);
              if (closeIdx !== -1 && closeIdx < seg.end) {
                const closeGt = text.indexOf('>', closeIdx + 2);
                if (closeGt !== -1 && closeGt < seg.end) {
                  const closeTagText = text.slice(closeIdx, closeGt + 1);
                  addTagPieces(doc, closeIdx, closeTagText, assignedColor, getRanges(assignedColor));
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

  // Apply decoration ranges to this editor, clearing any unused cached types
  for (const [colorKey, pair] of decorationCache.entries()) {
    const rawColor = colorKey.split(':')[0];
    const ranges = rangesByColor.get(rawColor);
    editor.setDecorations(pair.nameDecoration, ranges ? ranges.nameRanges : []);
    editor.setDecorations(pair.delimDecoration, ranges ? ranges.delimRanges : []);
  }

  // For any new colors in rangesByColor not yet in cache, register and apply them
  for (const [rawColor, ranges] of rangesByColor.entries()) {
    const pair = getOrCreateDecorations(rawColor);
    editor.setDecorations(pair.nameDecoration, ranges.nameRanges);
    editor.setDecorations(pair.delimDecoration, ranges.delimRanges);
  }
}

function resolveTagColor(
  tagName: string,
  colorStack: { name: string; color: string }[],
  palette: string[],
  manualOverrides: Record<string, string>,
  colorMode: ColorMode,
  docTagColorMap: Map<string, string>,
  cycleIndex: number
): string {
  // 1. Manual User Override
  if (manualOverrides[tagName]) {
    return manualOverrides[tagName];
  }

  const parentColor = colorStack.length > 0 ? colorStack[colorStack.length - 1].color : null;

  // 2. Mode Resolution
  if (colorMode === 'uniqueTagNames') {
    if (docTagColorMap.has(tagName)) {
      return docTagColorMap.get(tagName)!;
    }
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

  if (colorMode === 'tagNameHash') {
    let index = hashTagName(tagName) % palette.length;
    let color = palette[index];
    if (color === parentColor && palette.length > 1) {
      index = (index + 1) % palette.length;
      color = palette[index];
    }
    return color;
  }

  // Default: 'rainbow' (consecutive cycle mode)
  let idx = cycleIndex % palette.length;
  let color = palette[idx];
  if (color === parentColor && palette.length > 1) {
    idx = (idx + 1) % palette.length;
    color = palette[idx];
  }
  return color;
}

function addTagPieces(
  doc: vscode.TextDocument,
  startOffset: number,
  tagText: string,
  colorHex: string,
  ranges: PerColorRanges
) {
  if (tagText.length === 0) return;

  const pushDelim = (s: number, e: number) => {
    const start = doc.positionAt(startOffset + s);
    const end = doc.positionAt(startOffset + e);
    ranges.delimRanges.push(new vscode.Range(start, end));
  };
  const pushName = (s: number, e: number) => {
    const start = doc.positionAt(startOffset + s);
    const end = doc.positionAt(startOffset + e);
    ranges.nameRanges.push(new vscode.Range(start, end));
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
  const lang = doc.languageId ? doc.languageId.toLowerCase() : '';
  if (
    lang === 'html' ||
    lang === 'htm' ||
    lang === 'vue' ||
    lang === 'svelte' ||
    lang === 'astro' ||
    lang === 'php' ||
    lang === 'blade' ||
    lang === 'handlebars' ||
    lang === 'razor' ||
    lang === 'xml' ||
    lang === 'svg' ||
    lang === 'nunjucks' ||
    lang === 'njk' ||
    lang === 'twig' ||
    lang === 'jinja-html' ||
    lang === 'django-html' ||
    lang === 'javascriptreact' ||
    lang === 'typescriptreact' ||
    lang === 'jsx' ||
    lang === 'tsx'
  ) {
    return [{ start: 0, end: full.length }];
  }

  const fileName = doc.fileName ? doc.fileName.toLowerCase() : '';
  if (
    fileName.endsWith('.html') ||
    fileName.endsWith('.htm') ||
    fileName.endsWith('.jsx') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.vue') ||
    fileName.endsWith('.svelte') ||
    fileName.endsWith('.astro') ||
    fileName.endsWith('.php') ||
    fileName.endsWith('.blade.php') ||
    fileName.endsWith('.xml') ||
    fileName.endsWith('.svg') ||
    fileName.endsWith('.njk') ||
    fileName.endsWith('.nunjucks') ||
    fileName.endsWith('.twig') ||
    fileName.endsWith('.hbs') ||
    fileName.endsWith('.handlebars')
  ) {
    return [{ start: 0, end: full.length }];
  }

  const config = vscode.workspace.getConfiguration('rainbow-html');
  const additionalTypes = config.get<string[]>('additionalFileTypes') || [];
  for (const type of additionalTypes) {
    const cleanType = type.toLowerCase().trim();
    if (lang === cleanType) return [{ start: 0, end: full.length }];
    const suffix = cleanType.startsWith('.') ? cleanType : '.' + cleanType;
    if (fileName.endsWith(suffix)) return [{ start: 0, end: full.length }];
  }

  // Scan for tagged template literals in any language (html`...`, svg`...`, xml`...`, lit`...`, /* html */ `...`, /* xml */ `...`)
  const segments: TextSegment[] = [];
  let i = 0;
  while (i < full.length) {
    if (full[i] === '`') {
      if (isHtmlTagBeforeBacktick(full, i)) {
        const contentStart = i + 1;
        const end = scanBacktickLiteral(full, contentStart);
        if (end !== -1) {
          segments.push({ start: contentStart, end });
          collectNestedHtmlTemplates(full, contentStart, end, segments);
          i = end + 1;
          continue;
        }
      }
    }
    i++;
  }

  // Markdown code blocks ```html ... ``` or ```xml ... ``` or ```svg ... ```
  if (lang === 'markdown' || fileName.endsWith('.md')) {
    const codeBlockRegex = /```(?:html|xml|svg|xhtml)\b([\s\S]*?)```/gi;
    let cbm: RegExpExecArray | null;
    while ((cbm = codeBlockRegex.exec(full)) !== null) {
      const blockContent = cbm[1];
      const start = cbm.index + cbm[0].indexOf(blockContent);
      segments.push({ start, end: start + blockContent.length });
    }
  }

  // <template>...</template> blocks in any other file
  const templateTagRegex = /<template\b[^>]*>([\s\S]*?)<\/template>/gi;
  let ttm: RegExpExecArray | null;
  while ((ttm = templateTagRegex.exec(full)) !== null) {
    const inner = ttm[1];
    const start = ttm.index + ttm[0].indexOf(inner);
    segments.push({ start, end: start + inner.length });
  }

  return segments;
}

function isHtmlTagBeforeBacktick(full: string, backtickIndex: number): boolean {
  let k = backtickIndex - 1;
  while (k >= 0 && /\s/.test(full[k])) k--;

  // Check for comment like /* html */ or /* HTML */ or /* xml */ or /* svg */
  if (k >= 1 && full[k - 1] === '*' && full[k] === '/') {
    const commentStart = full.lastIndexOf('/*', k - 1);
    if (commentStart !== -1) {
      const commentContent = full.slice(commentStart + 2, k - 1).trim().toLowerCase();
      if (['html', 'xml', 'svg', 'xhtml', 'htm', 'lit'].includes(commentContent)) {
        return true;
      }
      k = commentStart - 1;
      while (k >= 0 && /\s/.test(full[k])) k--;
    }
  }

  if (k >= 1 && full[k - 1] === '/' && full[k] === '/') {
    while (k >= 0 && full[k] !== '\n') k--;
    while (k >= 0 && /\s/.test(full[k])) k--;
  }

  let endWord = k;
  while (endWord >= 0 && /[A-Za-z0-9_$]/.test(full[endWord])) endWord--;
  let word = full.slice(endWord + 1, k + 1).toLowerCase();

  if (word.length === 0 && full[endWord] === '.') {
    let p = endWord - 1;
    while (p >= 0 && /[A-Za-z0-9_$\.]/.test(full[p])) p--;
    const chain = full.slice(p + 1, k + 1).replace(/\s+/g, '').toLowerCase();
    if (chain.endsWith('.html') || chain.endsWith('.svg') || chain.endsWith('.xml') || chain.endsWith('.lit')) {
      return true;
    }
  }

  return ['html', 'svg', 'xml', 'lit', 'xhtml', 'htm'].includes(word);
}

function collectNestedHtmlTemplates(full: string, start: number, end: number, out: TextSegment[]) {
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
  let i = startPos;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let braceDepth = 0;

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

    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === '`') { inBacktick = true; i++; continue; }

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

    if (next2 === '${') {
      const res = scanTemplateExpr(text, i + 2, hardEnd);
      if (res === -1) return -1;
      i = res;
      continue;
    }

    if (ch === '>' && braceDepth === 0) {
      return i;
    }

    i++;
  }
  return -1;
}

function scanTemplateExpr(text: string, startPos: number, hardEnd: number): number {
  let i = startPos;
  let braceDepth = 1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  while (i < hardEnd) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);
    if ((inSingle || inDouble || inBacktick) && ch === '\\') { i += 2; continue; }
    if (!inDouble && !inBacktick && ch === "'" && !inSingle) { inSingle = true; i++; continue; }
    if (inSingle && ch === "'") { inSingle = false; i++; continue; }
    if (!inSingle && !inBacktick && ch === '"' && !inDouble) { inDouble = true; i++; continue; }
    if (inDouble && ch === '"') { inDouble = false; i++; continue; }
    if (!inSingle && !inDouble && ch === '`' && !inBacktick) { inBacktick = true; i++; continue; }
    if (inBacktick && ch === '`') { inBacktick = false; i++; continue; }

    if (!(inSingle || inDouble || inBacktick)) {
      if (next2 === '//') {
        i += 2;
        while (i < hardEnd && text[i] !== '\n') i++;
        if (i < hardEnd) i++;
        continue;
      }
      if (next2 === '/*') {
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
      if (next2 === '${') { expr++; i += 2; continue; }
      if (ch === '}') { expr--; i++; continue; }
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
