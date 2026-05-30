インスペクタが選択した要素に対してHTMLファイルにパッチを適用してください。
パッチの適用は必ず `bun run server/apply-patch.ts` 経由で行うこと（Edit ツールで直接書き換えない）。

## 手順

### 1. コンテキスト読み込み
`.inspector-context.json` を Read ツールで読む。
ファイルが存在しない場合は「先に `bun run serve` でサーバを起動し、ブラウザで要素を選択してください」と伝えて終了。

### 2. 対象HTMLファイルの特定
`filename` フィールドのファイル名を使い、以下で探す:
```
find . -name "<filename>" -not -path "*/node_modules/*" -not -path "*/.git/*"
```
- 1件: そのファイルを使う
- 複数件: ユーザに選択を求める
- 0件: ユーザにパスを教えてもらう

### 3. HTMLファイルを読む
対象ファイルを Read ツールで読む。

### 4. SEARCH/REPLACE ブロックを生成
コンテキスト（selector / outerHTML / cssRules / jsLines）とユーザの指示を踏まえて、
以下のフォーマットで変更内容を作成する:

```
<<<<<<< SEARCH
[変更前の正確な文字列。空白・インデントを含めてファイルと完全一致させること]
=======
[変更後の文字列]
>>>>>>> REPLACE
```

ルール:
- SEARCH はファイルの内容と **完全一致** させること（空白・クォート・改行すべて）
- 一意に特定できるよう前後2〜3行のコンテキストを含めること
- 複数箇所変更する場合はブロックを複数並べること
- outerHTML をそのまま SEARCH に使うと一致しやすい

### 5. パッチを適用する
生成した SEARCH/REPLACE ブロックを `.inspector-patch.txt` に Write ツールで書き出し、
以下のコマンドで適用する:

```bash
bun run server/apply-patch.ts <htmlファイルのパス> < .inspector-patch.txt
```

### 6. 結果処理
- exit 0 (成功): 「✓ パッチを適用しました」と報告して `.inspector-patch.txt` を削除
- exit 1 (失敗): stderr の JSON から `error` と `hint` を読み取り、それに従って SEARCH/REPLACE を修正して手順 5 からリトライ（最大3回）

## ユーザの指示

$ARGUMENTS

指示が空の場合は、コンテキストの内容（selector・cssRules・jsLines）を要約してユーザに「何を変更しますか？」と聞く。
