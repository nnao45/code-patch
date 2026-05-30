/**
 * HTMLファイルにSEARCH/REPLACEパッチを適用するCLI
 *
 * Usage:
 *   bun run server/apply-patch.ts <file.html> < patch.txt
 *
 * stdin に <<<<<<< SEARCH ... >>>>>>> REPLACE 形式のテキストを渡す。
 * 成功時: ファイルを上書きして exit 0
 * 失敗時: JSON { error, hint } を stderr に出力して exit 1
 */

import { applyLLMOutput } from "../src/index.ts";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: bun run server/apply-patch.ts <file.html>");
  process.exit(1);
}

const absPath = resolve(filePath);
const originalContent = readFileSync(absPath, "utf-8");
const llmOutput = await Bun.stdin.text();

const result = applyLLMOutput(originalContent, llmOutput);

if (result.success) {
  writeFileSync(absPath, result.content, "utf-8");
  console.log("✓ patch applied");
  process.exit(0);
} else {
  console.error(JSON.stringify({ error: result.error, hint: result.hint }));
  process.exit(1);
}
