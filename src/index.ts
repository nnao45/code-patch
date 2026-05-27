/**
 * html-patcher
 * LLMエージェント向けHTML Search/Replaceパッチユーティリティ
 *
 * 機能:
 * - 完全文字列マッチ（Claude Code / claw-code と同じ思想）
 * - 複数マッチ検出して拒否（誤適用防止）
 * - インデント補正（元ファイルのインデントに合わせて replace を調整）
 * - LLMが自己修正できる詳細エラーメッセージ
 * - 複数ブロック一括適用（SEARCH/REPLACE を複数まとめて渡せる）
 * - 改行コード正規化（CRLF/LF どちらでもOK）
 */

// ── 型定義 ──────────────────────────────────────────────────────────────────

export type PatchSuccess = {
  success: true;
  content: string;
};

export type PatchFailure = {
  success: false;
  error: string;
  /** LLMへのヒント（そのままプロンプトに入れるだけでOK） */
  hint: string;
};

export type PatchResult = PatchSuccess | PatchFailure;

export type SearchReplaceBlock = {
  search: string;
  replace: string;
};

// ── ユーティリティ ────────────────────────────────────────────────────────

/** 改行コードをLFに統一 */
function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

/** 先頭のインデント文字列を取得 */
function leadingIndent(line: string): string {
  return line.match(/^[\t ]*/)?.[0] ?? "";
}

/**
 * インデント補正
 * - search の先頭行インデントを基準に、replace の各行インデントを
 *   実際にマッチした場所のインデントに合わせてシフトする
 */
function adjustIndent(
  searchLines: string[],
  replaceLines: string[],
  matchedLines: string[]
): string[] {
  const searchBase = leadingIndent(searchLines[0] ?? "");
  const matchedBase = leadingIndent(matchedLines[0] ?? "");
  const replaceBase = leadingIndent(replaceLines[0] ?? "");

  if (searchBase === matchedBase && replaceBase === matchedBase) return replaceLines;

  return replaceLines.map((line) => {
    if (line.trim() === "") return line;
    const currentIndent = leadingIndent(line);
    const relativeExtra = currentIndent.slice(replaceBase.length);
    const finalIndent =
      currentIndent.length < replaceBase.length
        ? matchedBase.slice(0, Math.max(0, matchedBase.length - (replaceBase.length - currentIndent.length)))
        : matchedBase + relativeExtra;
    return finalIndent + line.trimStart();
  });
}

/**
 * マッチ位置の周辺コンテキストを文字列で返す（LLMへのエラーフィードバック用）
 */
function surroundingContext(
  lines: string[],
  centerLine: number,
  radius = 5
): string {
  const start = Math.max(0, centerLine - radius);
  const end = Math.min(lines.length, centerLine + radius + 1);
  return lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4)}: ${l}`)
    .join("\n");
}

// ── コアロジック ──────────────────────────────────────────────────────────

function applySingleBlock(
  lines: string[],
  block: SearchReplaceBlock
): string[] | PatchFailure {
  const searchNorm = normalize(block.search);
  const replaceNorm = normalize(block.replace);
  const contentNorm = normalize(lines.join("\n"));

  if (searchNorm.trim() === "") {
    return {
      success: false,
      error: "SEARCH block is empty.",
      hint: "SEARCH block must contain at least one non-empty line.",
    };
  }

  const matchPositions: number[] = [];
  let pos = 0;
  while (true) {
    const idx = contentNorm.indexOf(searchNorm, pos);
    if (idx === -1) break;
    matchPositions.push(idx);
    pos = idx + 1;
  }

  if (matchPositions.length === 0) {
    const searchFirstLine = searchNorm.split("\n")[0];
    const partialMatchLine = lines.findIndex((l) =>
      normalize(l).includes(searchFirstLine.trim())
    );

    const contextSection =
      partialMatchLine !== -1
        ? `\nPartial match found at line ${partialMatchLine + 1}:\n${surroundingContext(lines, partialMatchLine)}`
        : `\nNo partial match found for first line: "${searchFirstLine}"`;

    return {
      success: false,
      error: `SEARCH block not found in file.${contextSection}`,
      hint: [
        "- Check exact whitespace and indentation (use the file content as-is)",
        "- CRLF vs LF differences are auto-handled, but tab vs space is not",
        "- Include at least 2-3 surrounding context lines for uniqueness",
        "- Re-read the file content before retrying",
      ].join("\n"),
    };
  }

  if (matchPositions.length > 1) {
    const matchedLineNumbers = matchPositions.map((charIdx) => {
      return contentNorm.slice(0, charIdx).split("\n").length;
    });

    return {
      success: false,
      error: `SEARCH block matched ${matchPositions.length} locations (lines: ${matchedLineNumbers.join(", ")}).`,
      hint: [
        "- Add more surrounding context lines to make the match unique",
        "- Include the full enclosing block (function, section, etc.)",
        `- Matched at lines: ${matchedLineNumbers.join(", ")}`,
      ].join("\n"),
    };
  }

  const searchLines = searchNorm.split("\n");
  const replaceLines = replaceNorm.split("\n");

  const matchCharIdx = matchPositions[0];
  const matchLineIdx = contentNorm.slice(0, matchCharIdx).split("\n").length - 1;
  const matchedLines = lines.slice(matchLineIdx, matchLineIdx + searchLines.length);

  const adjustedReplace = adjustIndent(searchLines, replaceLines, matchedLines);

  const before = lines.slice(0, matchLineIdx);
  const after = lines.slice(matchLineIdx + searchLines.length);

  return [...before, ...adjustedReplace, ...after];
}

// ── 公開API ───────────────────────────────────────────────────────────────

/**
 * 単一 Search/Replace ブロックを適用
 */
export function applyPatch(
  originalContent: string,
  block: SearchReplaceBlock
): PatchResult {
  const lines = normalize(originalContent).split("\n");
  const result = applySingleBlock(lines, block);

  if (Array.isArray(result)) {
    return {
      success: true,
      content: result.join(
        originalContent.includes("\r\n") ? "\r\n" : "\n"
      ),
    };
  }
  return result;
}

/**
 * 複数 Search/Replace ブロックを順番に適用
 * 1つでも失敗したら即停止（部分適用しない）
 */
export function applyPatches(
  originalContent: string,
  blocks: SearchReplaceBlock[]
): PatchResult {
  const lineEnding = originalContent.includes("\r\n") ? "\r\n" : "\n";
  let lines = normalize(originalContent).split("\n");

  for (let i = 0; i < blocks.length; i++) {
    const result = applySingleBlock(lines, blocks[i]);
    if (Array.isArray(result)) {
      lines = result;
    } else {
      return {
        success: false,
        error: `Block ${i + 1}/${blocks.length} failed: ${result.error}`,
        hint: result.hint,
      };
    }
  }

  return { success: true, content: lines.join(lineEnding) };
}

/**
 * LLMが出力した生テキストから SEARCH/REPLACE ブロックをパース
 *
 * 対応フォーマット:
 * <<<<<<< SEARCH
 * ...
 * =======
 * ...
 * >>>>>>> REPLACE
 */
export function parseBlocks(llmOutput: string): SearchReplaceBlock[] {
  const pattern =
    /<<<<<<< SEARCH\n([\s\S]*?)\n?=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;
  const blocks: SearchReplaceBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(llmOutput)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }

  return blocks;
}

/**
 * パース → 適用 をまとめてやる便利関数
 * エージェントループ内でこれ1つ呼ぶだけでOK
 */
export function applyLLMOutput(
  originalContent: string,
  llmOutput: string
): PatchResult {
  const blocks = parseBlocks(llmOutput);

  if (blocks.length === 0) {
    return {
      success: false,
      error: "No SEARCH/REPLACE blocks found in LLM output.",
      hint: [
        "Output must contain at least one block in this format:",
        "<<<<<<< SEARCH",
        "[exact content to find]",
        "=======",
        "[new content]",
        ">>>>>>> REPLACE",
      ].join("\n"),
    };
  }

  return applyPatches(originalContent, blocks);
}

// ── エージェントループ用のプロンプトテンプレート ──────────────────────────

/**
 * LLMに渡すシステムプロンプト（getToolDescription 相当）
 */
export const SYSTEM_PROMPT = `
You are an HTML editing agent. When modifying HTML, output ONLY Search/Replace blocks.

Format:
<<<<<<< SEARCH
[exact content to find, including whitespace and indentation]
=======
[new content to replace with]
>>>>>>> REPLACE

Rules:
1. SEARCH must match exactly (whitespace, indentation, quotes)
2. Include 2-3 surrounding context lines for uniqueness
3. If multiple edits are needed, output multiple blocks
4. Do NOT output the full file — only the changed sections
`.trim();

/**
 * 失敗時にLLMへ返すフィードバックを生成
 */
export function buildRetryPrompt(
  failure: PatchFailure,
  currentContent: string
): string {
  return [
    `The previous patch failed:`,
    ``,
    `Error: ${failure.error}`,
    ``,
    `Hints:`,
    failure.hint,
    ``,
    `Current file content:`,
    "```html",
    currentContent,
    "```",
    ``,
    `Please retry with a corrected SEARCH/REPLACE block.`,
  ].join("\n");
}
