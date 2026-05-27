import { describe, test, expect } from "vitest";
import { applyPatch, applyPatches, parseBlocks, applyLLMOutput } from "../src/index.js";

const html = `<!DOCTYPE html>
<html>
  <head>
    <title>My Page</title>
  </head>
  <body>
    <h1>Hello World</h1>
    <p>Some text here</p>
    <div class="card">
      <p>Card content</p>
    </div>
  </body>
</html>`;

const fullHtml = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="My site">
    <title>My Site</title>
    <link rel="stylesheet" href="/styles/main.css">
    <link rel="stylesheet" href="/styles/theme.css">
    <script src="/scripts/vendor.js" defer></script>
    <script src="/scripts/app.js" defer></script>
  </head>
  <body>
    <header class="site-header">
      <nav class="nav">
        <a href="/" class="nav__logo">Logo</a>
        <ul class="nav__list">
          <li><a href="/about">About</a></li>
          <li><a href="/work">Work</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>
    </header>
    <main>
      <section class="hero">
        <h1>Welcome</h1>
        <p>Hero text here</p>
        <a href="/start" class="btn btn--primary">Get Started</a>
      </section>
      <section class="features">
        <h2>Features</h2>
        <div class="feature-grid">
          <div class="feature-card">
            <h3>Fast</h3>
            <p>Lightning speed</p>
          </div>
          <div class="feature-card">
            <h3>Secure</h3>
            <p>Rock solid</p>
          </div>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <p>&copy; 2024 My Site</p>
    </footer>
  </body>
</html>`;

describe("基本動作", () => {
  test("単純な文字列置換", () => {
    const result = applyPatch(html, {
      search: "    <h1>Hello World</h1>",
      replace: "    <h1>こんにちは</h1>",
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<h1>こんにちは</h1>");
    }
  });

  test("コンテキスト行を含む置換", () => {
    const result = applyPatch(html, {
      search: `    <h1>Hello World</h1>
    <p>Some text here</p>`,
      replace: `    <h1>ようこそ</h1>
    <p>テキストです</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("ようこそ");
      expect(result.content).toContain("テキストです");
    }
  });
});

describe("エラーハンドリング", () => {
  test("SEARCHが見つからない場合はfailureを返す", () => {
    const result = applyPatch(html, {
      search: "<h1>存在しないテキスト</h1>",
      replace: "<h1>置換後</h1>",
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  test("複数マッチの場合はfailureを返す", () => {
    const multiHtml = `<p>text</p>\n<p>text</p>`;
    const result = applyPatch(multiHtml, {
      search: "<p>text</p>",
      replace: "<p>replaced</p>",
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched 2 locations");
    }
  });

  test("空SEARCHはfailureを返す", () => {
    const result = applyPatch(html, {
      search: "   \n  ",
      replace: "<p>new</p>",
    });
    expect(result.success).toBeFalsy();
  });
});

describe("インデント補正", () => {
  test("インデントが異なっても補正される", () => {
    const result = applyPatch(html, {
      search: `    <h1>Hello World</h1>`,
      replace: `<h1>ようこそ</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("    <h1>ようこそ</h1>");
    }
  });

  test("ネストしたインデントが相対的に維持される", () => {
    const result = applyPatch(html, {
      search: `    <div class="card">
      <p>Card content</p>
    </div>`,
      replace: `<div class="card updated">
  <p>Updated content</p>
  <span>Extra</span>
</div>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('    <div class="card updated">');
      expect(result.content).toContain("      <p>Updated content</p>");
    }
  });
});

describe("複数ブロック適用", () => {
  test("複数ブロックを順番に適用", () => {
    const result = applyPatches(html, [
      { search: "    <title>My Page</title>", replace: "    <title>俺のページ</title>" },
      { search: "    <h1>Hello World</h1>", replace: "    <h1>こんにちは</h1>" },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("俺のページ");
      expect(result.content).toContain("こんにちは");
    }
  });

  test("途中のブロックが失敗したら即停止（部分適用しない）", () => {
    const result = applyPatches(html, [
      { search: "    <title>My Page</title>", replace: "    <title>変更済み</title>" },
      { search: "<存在しない>", replace: "<置換後>" },
      { search: "    <h1>Hello World</h1>", replace: "    <h1>ここは適用されない</h1>" },
    ]);
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("Block 2/3");
    }
  });
});

describe("LLM出力のパース", () => {
  test("LLM出力からブロックをパース", () => {
    const llmOutput = `
以下のように変更します。

<<<<<<< SEARCH
    <title>My Page</title>
=======
    <title>俺のページ</title>
>>>>>>> REPLACE

<<<<<<< SEARCH
    <h1>Hello World</h1>
=======
    <h1>こんにちは</h1>
>>>>>>> REPLACE
`;
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(2);
    expect(blocks[0].search).toBe("    <title>My Page</title>");
    expect(blocks[1].replace).toBe("    <h1>こんにちは</h1>");
  });

  test("applyLLMOutput でパースから適用まで一発", () => {
    const llmOutput = `
<<<<<<< SEARCH
    <h1>Hello World</h1>
=======
    <h1>ようこそ</h1>
>>>>>>> REPLACE
`;
    const result = applyLLMOutput(html, llmOutput);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("ようこそ");
    }
  });

  test("ブロックがない場合はfailureを返す", () => {
    const result = applyLLMOutput(html, "変更はありません。");
    expect(result.success).toBeFalsy();
  });
});

describe("改行コード", () => {
  test("CRLFファイルにも対応", () => {
    const crlfHtml = html.replace(/\n/g, "\r\n");
    const result = applyPatch(crlfHtml, {
      search: "    <h1>Hello World</h1>",
      replace: "    <h1>ようこそ</h1>",
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("\r\n");
    }
  });

  test("CRLFのSEARCHをLFファイルに当てても動く", () => {
    const result = applyPatch(html, {
      search: "    <h1>Hello World</h1>\r\n    <p>Some text here</p>",
      replace: "    <h1>ようこそ</h1>\r\n    <p>テキスト</p>",
    });
    expect(result.success).toBeTruthy();
  });
});

describe("行追加・削除", () => {
  test("行を追加する（replaceにsearchより多い行）", () => {
    const result = applyPatch(html, {
      search: "    <h1>Hello World</h1>",
      replace: `    <h1>Hello World</h1>
    <h2>サブタイトル</h2>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<h2>サブタイトル</h2>");
      expect(result.content).toContain("<h1>Hello World</h1>");
    }
  });

  test("行を削除する（replaceが空文字）", () => {
    const result = applyPatch(html, {
      search: `    <h1>Hello World</h1>
    <p>Some text here</p>`,
      replace: `    <h1>Hello World</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).not.toContain("Some text here");
      expect(result.content).toContain("<h1>Hello World</h1>");
      expect(result.content).toContain('<div class="card">');
    }
  });

  test("複数行をまとめて1行に圧縮", () => {
    const result = applyPatch(html, {
      search: `    <div class="card">
      <p>Card content</p>
    </div>`,
      replace: `    <div class="card"><p>Card content</p></div>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('<div class="card"><p>Card content</p></div>');
    }
  });
});

describe("属性・クラス操作", () => {
  test("属性を追加する", () => {
    const result = applyPatch(html, {
      search: `    <div class="card">`,
      replace: `    <div class="card" id="main-card" data-testid="card">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('id="main-card"');
      expect(result.content).toContain('data-testid="card"');
    }
  });

  test("クラスを書き換える", () => {
    const result = applyPatch(html, {
      search: `    <div class="card">`,
      replace: `    <div class="card card--highlighted">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('class="card card--highlighted"');
    }
  });

  test("scriptタグの挿入", () => {
    const result = applyPatch(html, {
      search: `</body>`,
      replace: `  <script src="app.js"></script>
</body>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('<script src="app.js">');
    }
  });
});

describe("エラーメッセージ品質", () => {
  test("見つからない場合に部分マッチのヒントが含まれる", () => {
    const result = applyPatch(html, {
      search: "    <h1>Wrong Text</h1>",
      replace: "    <h1>置換後</h1>",
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("No partial match found");
      expect(result.hint).toContain("Re-read the file");
    }
  });

  test("複数マッチ時に行番号が含まれる", () => {
    const dupHtml = `<p>dup</p>\n<p>dup</p>\n<p>dup</p>`;
    const result = applyPatch(dupHtml, {
      search: "<p>dup</p>",
      replace: "<p>unique</p>",
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched 3 locations");
    }
  });

  test("失敗時に hint フィールドが常に存在する", () => {
    const result = applyPatch(html, {
      search: "<存在しない/>",
      replace: "<置換後/>",
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(typeof result.hint).toBe("string");
      expect(result.hint.length > 0).toBeTruthy();
    }
  });

  test("複数ブロック失敗時にどのブロックが失敗したか分かる", () => {
    const result = applyPatches(html, [
      { search: "    <title>My Page</title>", replace: "    <title>OK</title>" },
      { search: "<存在しない/>", replace: "<置換後/>" },
      { search: "    <h1>Hello World</h1>", replace: "    <h1>未適用</h1>" },
    ]);
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("Block 2/3");
    }
  });
});

describe("HTML実践パターン", () => {
  test("meta タグの charset 変更", () => {
    const htmlWithMeta = `<head>\n  <meta charset="UTF-8">\n  <title>Test</title>\n</head>`;
    const result = applyPatch(htmlWithMeta, {
      search: `  <meta charset="UTF-8">`,
      replace: `  <meta charset="Shift_JIS">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('charset="Shift_JIS"');
    }
  });

  test("インラインスタイルの追加", () => {
    const result = applyPatch(html, {
      search: `    <h1>Hello World</h1>`,
      replace: `    <h1 style="color: red; font-size: 2rem;">Hello World</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("color: red");
    }
  });

  test("コメントを含むSEARCHブロック", () => {
    const htmlWithComment = `<div>\n  <!-- header -->\n  <h1>Title</h1>\n</div>`;
    const result = applyPatch(htmlWithComment, {
      search: `  <!-- header -->
  <h1>Title</h1>`,
      replace: `  <!-- updated header -->
  <h1>New Title</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("updated header");
      expect(result.content).toContain("New Title");
    }
  });

  test("同じ要素が近くにある場合はコンテキストで区別できる", () => {
    const twoCards = `<div class="card">
  <p>First</p>
</div>
<div class="card">
  <p>Second</p>
</div>`;
    const result = applyPatch(twoCards, {
      search: `<div class="card">
  <p>First</p>
</div>`,
      replace: `<div class="card card--primary">
  <p>First</p>
</div>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("card--primary");
      expect(result.content).toContain("Second");
    }
  });

  test("LLM出力に説明文が混じっていてもブロックを正しくパース", () => {
    const llmOutput = `
タイトルを変更します。

\`\`\`
<<<<<<< SEARCH
    <title>My Page</title>
=======
    <title>New Title</title>
>>>>>>> REPLACE
\`\`\`

以上です。
`;
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(1);
    expect(blocks[0].replace).toBe("    <title>New Title</title>");
  });

  test("replaceが空のブロック（要素削除）をパースできる", () => {
    const llmOutput = `<<<<<<< SEARCH
    <p>Some text here</p>
=======
>>>>>>> REPLACE`;
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(1);
    expect(blocks[0].replace).toBe("");
  });

  test("ファイル末尾への追記", () => {
    const result = applyPatch(html, {
      search: `</html>`,
      replace: `</html>\n<!-- generated -->`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<!-- generated -->");
    }
  });

  test("タブインデントのファイルにも対応", () => {
    const tabHtml = `<html>\n\t<body>\n\t\t<h1>Hello</h1>\n\t</body>\n</html>`;
    const result = applyPatch(tabHtml, {
      search: `\t\t<h1>Hello</h1>`,
      replace: `\t\t<h1>こんにちは</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("\t\t<h1>こんにちは</h1>");
    }
  });
});

describe("head/scriptタグ組み合わせパターン", () => {
  test("scriptタグを defer から async に変更", () => {
    const result = applyPatch(fullHtml, {
      search: `    <script src="/scripts/app.js" defer></script>`,
      replace: `    <script src="/scripts/app.js" async></script>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('src="/scripts/app.js" async');
      expect(result.content).toContain('src="/scripts/vendor.js" defer');
    }
  });

  test("scriptタグを複数まとめてtype=moduleに変更", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `    <script src="/scripts/vendor.js" defer></script>`,
        replace: `    <script src="/scripts/vendor.js" type="module"></script>`,
      },
      {
        search: `    <script src="/scripts/app.js" defer></script>`,
        replace: `    <script src="/scripts/app.js" type="module"></script>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('vendor.js" type="module"');
      expect(result.content).toContain('app.js" type="module"');
      expect(result.content).not.toContain("defer");
    }
  });

  test("headにインラインscriptを追加", () => {
    const result = applyPatch(fullHtml, {
      search: `    <script src="/scripts/app.js" defer></script>
  </head>`,
      replace: `    <script src="/scripts/app.js" defer></script>
    <script>
      window.__ENV__ = { API_URL: "https://api.example.com" };
    </script>
  </head>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("window.__ENV__");
      expect(result.content).toContain("API_URL");
    }
  });

  test("linkタグの間にpreloadを挿入", () => {
    const result = applyPatch(fullHtml, {
      search: `    <link rel="stylesheet" href="/styles/main.css">
    <link rel="stylesheet" href="/styles/theme.css">`,
      replace: `    <link rel="preload" href="/fonts/inter.woff2" as="font" crossorigin>
    <link rel="stylesheet" href="/styles/main.css">
    <link rel="stylesheet" href="/styles/theme.css">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('rel="preload"');
      expect(result.content).toContain("inter.woff2");
      expect(result.content).toContain("main.css");
      expect(result.content).toContain("theme.css");
    }
  });

  test("metaタグをまとめてOGP対応に拡張", () => {
    const result = applyPatch(fullHtml, {
      search: `    <meta name="description" content="My site">
    <title>My Site</title>`,
      replace: `    <meta name="description" content="My site">
    <meta property="og:title" content="My Site">
    <meta property="og:description" content="My site">
    <meta property="og:type" content="website">
    <title>My Site</title>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('property="og:title"');
      expect(result.content).toContain('property="og:type"');
      expect(result.content).toContain("<title>My Site</title>");
    }
  });

  test("scriptをheadからbody末尾に移動（2ブロック）", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `    <script src="/scripts/vendor.js" defer></script>
    <script src="/scripts/app.js" defer></script>
  </head>`,
        replace: `  </head>`,
      },
      {
        search: `  </body>`,
        replace: `    <script src="/scripts/vendor.js"></script>
    <script src="/scripts/app.js"></script>
  </body>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      const headEnd = result.content.indexOf("</head>");
      const scriptInHead = result.content.slice(0, headEnd).includes("<script");
      expect(scriptInHead).toBeFalsy();
      expect(result.content).toContain("vendor.js");
      expect(result.content).toContain("app.js");
    }
  });
});

describe("ナビ・ヘッダーパターン", () => {
  test("navにメニュー項目を追加", () => {
    const result = applyPatch(fullHtml, {
      search: `          <li><a href="/contact">Contact</a></li>
        </ul>`,
      replace: `          <li><a href="/contact">Contact</a></li>
          <li><a href="/blog">Blog</a></li>
        </ul>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('href="/blog"');
      expect(result.content).toContain('href="/about"');
    }
  });

  test("headerにダークモードトグルボタンを追加", () => {
    const result = applyPatch(fullHtml, {
      search: `      </nav>
    </header>`,
      replace: `        <button class="theme-toggle" aria-label="Toggle dark mode">🌙</button>
      </nav>
    </header>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("theme-toggle");
      expect(result.content).toContain("Toggle dark mode");
    }
  });

  test("navのlogoをimg+spanに変更", () => {
    const result = applyPatch(fullHtml, {
      search: `        <a href="/" class="nav__logo">Logo</a>`,
      replace: `        <a href="/" class="nav__logo">
          <img src="/logo.svg" alt="" width="32" height="32">
          <span>Logo</span>
        </a>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('src="/logo.svg"');
      expect(result.content).toContain("<span>Logo</span>");
    }
  });

  test("headerにskip linkを先頭追加（アクセシビリティ）", () => {
    const result = applyPatch(fullHtml, {
      search: `    <header class="site-header">`,
      replace: `    <a href="#main-content" class="skip-link">Skip to content</a>
    <header class="site-header">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("skip-link");
      expect(result.content).toContain("#main-content");
    }
  });
});

describe("セクション・コンポーネントパターン", () => {
  test("heroセクション丸ごと置換", () => {
    const result = applyPatch(fullHtml, {
      search: `      <section class="hero">
        <h1>Welcome</h1>
        <p>Hero text here</p>
        <a href="/start" class="btn btn--primary">Get Started</a>
      </section>`,
      replace: `      <section class="hero hero--dark">
        <h1>新しいヒーロー</h1>
        <p>キャッチコピーここ</p>
        <div class="hero__actions">
          <a href="/start" class="btn btn--primary">今すぐ始める</a>
          <a href="/demo" class="btn btn--ghost">デモを見る</a>
        </div>
      </section>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("hero--dark");
      expect(result.content).toContain("hero__actions");
      expect(result.content).toContain("デモを見る");
      expect(result.content).not.toContain("Hero text here");
    }
  });

  test("feature-cardを1枚追加", () => {
    const result = applyPatch(fullHtml, {
      search: `          <div class="feature-card">
            <h3>Secure</h3>
            <p>Rock solid</p>
          </div>
        </div>`,
      replace: `          <div class="feature-card">
            <h3>Secure</h3>
            <p>Rock solid</p>
          </div>
          <div class="feature-card">
            <h3>Simple</h3>
            <p>Easy to use</p>
          </div>
        </div>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<h3>Simple</h3>");
      expect(result.content).toContain("<h3>Fast</h3>");
      expect(result.content).toContain("<h3>Secure</h3>");
    }
  });

  test("footerをコピーライトとSNSリンク付きに拡張", () => {
    const result = applyPatch(fullHtml, {
      search: `    <footer class="site-footer">
      <p>&copy; 2024 My Site</p>
    </footer>`,
      replace: `    <footer class="site-footer">
      <div class="footer__inner">
        <p>&copy; 2024 My Site. All rights reserved.</p>
        <nav class="footer__social">
          <a href="https://twitter.com/example" rel="noopener">Twitter</a>
          <a href="https://github.com/example" rel="noopener">GitHub</a>
        </nav>
      </div>
    </footer>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("footer__inner");
      expect(result.content).toContain("footer__social");
      expect(result.content).toContain('rel="noopener"');
    }
  });
});

describe("複合・シーケンスパターン", () => {
  test("head + body + footer を一度に3ブロックで変更", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `    <title>My Site</title>`,
        replace: `    <title>新サイト | My Site</title>`,
      },
      {
        search: `        <h1>Welcome</h1>`,
        replace: `        <h1>ようこそ</h1>`,
      },
      {
        search: `      <p>&copy; 2024 My Site</p>`,
        replace: `      <p>&copy; 2025 My Site</p>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("新サイト | My Site");
      expect(result.content).toContain("ようこそ");
      expect(result.content).toContain("2025");
    }
  });

  test("scriptとmeta両方を同時変更", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `    <meta name="description" content="My site">`,
        replace: `    <meta name="description" content="Updated description">`,
      },
      {
        search: `    <script src="/scripts/app.js" defer></script>`,
        replace: `    <script src="/scripts/app.v2.js" defer></script>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("Updated description");
      expect(result.content).toContain("app.v2.js");
    }
  });

  test("LLM出力でhead・nav・heroを一発変更", () => {
    const llmOutput = `
<<<<<<< SEARCH
    <title>My Site</title>
=======
    <title>Awesome Site</title>
>>>>>>> REPLACE

<<<<<<< SEARCH
        <a href="/" class="nav__logo">Logo</a>
=======
        <a href="/" class="nav__logo">Awesome</a>
>>>>>>> REPLACE

<<<<<<< SEARCH
        <h1>Welcome</h1>
=======
        <h1>Awesome へようこそ</h1>
>>>>>>> REPLACE
`;
    const result = applyLLMOutput(fullHtml, llmOutput);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("Awesome Site");
      expect(result.content).toContain("Awesome へようこそ");
      expect(result.content).toContain(">Awesome<");
    }
  });

  test("同一タグでもコンテキストが違えば別々に当てられる（feature-card×2）", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `          <div class="feature-card">
            <h3>Fast</h3>
            <p>Lightning speed</p>
          </div>`,
        replace: `          <div class="feature-card feature-card--speed">
            <h3>⚡ Fast</h3>
            <p>Lightning speed</p>
          </div>`,
      },
      {
        search: `          <div class="feature-card">
            <h3>Secure</h3>
            <p>Rock solid</p>
          </div>`,
        replace: `          <div class="feature-card feature-card--security">
            <h3>🔒 Secure</h3>
            <p>Rock solid</p>
          </div>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("feature-card--speed");
      expect(result.content).toContain("feature-card--security");
      expect(result.content).toContain("⚡ Fast");
      expect(result.content).toContain("🔒 Secure");
    }
  });

  test("前のブロック適用後に行がズレても次のブロックが正しく当たる", () => {
    const result = applyPatches(fullHtml, [
      {
        search: `        <h1>Welcome</h1>`,
        replace: `        <span class="badge">NEW</span>
        <h1>Welcome</h1>
        <p class="hero__sub">最高のプロダクト</p>`,
      },
      {
        search: `        <a href="/start" class="btn btn--primary">Get Started</a>`,
        replace: `        <a href="/start" class="btn btn--primary">今すぐ始める</a>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("badge");
      expect(result.content).toContain("hero__sub");
      expect(result.content).toContain("今すぐ始める");
    }
  });

  test("html属性を lang=ja から lang=en に変更", () => {
    const result = applyPatch(fullHtml, {
      search: `<html lang="ja">`,
      replace: `<html lang="en">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('lang="en"');
      expect(result.content).not.toContain('lang="ja"');
    }
  });
});

describe("エッジケース", () => {
  test("SEARCHとREPLACEが同一でも成功する（no-op）", () => {
    const result = applyPatch(fullHtml, {
      search: `    <title>My Site</title>`,
      replace: `    <title>My Site</title>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toBe(fullHtml);
    }
  });

  test("SEARCHの末尾に余分なスペースがあると失敗する", () => {
    const result = applyPatch(fullHtml, {
      search: "    <title>My Site</title>   ",
      replace: "    <title>新タイトル</title>",
    });
    expect(result.success).toBeFalsy();
  });

  test("replaceが空文字列でブロック丸ごと削除できる", () => {
    const small = `<div>\n  <span>delete me</span>\n</div>`;
    const result = applyPatch(small, {
      search: `  <span>delete me</span>`,
      replace: ``,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).not.toContain("delete me");
      expect(result.content).toContain("<div>");
    }
  });

  test("SEARCHが1文字だと複数マッチになり失敗する", () => {
    const result = applyPatch(fullHtml, {
      search: `>`,
      replace: `/>`,
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched");
    }
  });

  test("HTMLエンティティ（&copy;）を含むSEARCHが正しくマッチする", () => {
    const result = applyPatch(fullHtml, {
      search: `      <p>&copy; 2024 My Site</p>`,
      replace: `      <p>&copy; 2025 My Site. All rights reserved.</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("2025");
      expect(result.content).toContain("All rights reserved");
    }
  });

  test("URLのダブルスラッシュを含むSEARCHが正しくマッチする", () => {
    const withUrl = `  <a href="https://example.com/path">Link</a>`;
    const result = applyPatch(withUrl, {
      search: `  <a href="https://example.com/path">Link</a>`,
      replace: `  <a href="https://example.com/new" rel="noopener">Link</a>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("example.com/new");
      expect(result.content).toContain('rel="noopener"');
    }
  });

  test("空行を含む複数行SEARCHが正しくマッチする", () => {
    const htmlWithBlank = `<section>\n\n  <h2>Title</h2>\n\n</section>`;
    const result = applyPatch(htmlWithBlank, {
      search: `<section>\n\n  <h2>Title</h2>`,
      replace: `<section>\n\n  <h2>新タイトル</h2>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("新タイトル");
    }
  });

  test("バッククォートを含むscriptタグのSEARCHが正しくマッチする", () => {
    const htmlWithBacktick = "<script>\n  const msg = `hello`;\n</script>";
    const result = applyPatch(htmlWithBacktick, {
      search: "  const msg = `hello`;",
      replace: "  const msg = `こんにちは`;",
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("こんにちは");
    }
  });

  test("replaceのインデントがsearchと全く違っても補正される", () => {
    const result = applyPatch(fullHtml, {
      search: `        <h1>Welcome</h1>`,
      replace: `<h1>ようこそ</h1>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("        <h1>ようこそ</h1>");
    }
  });

  test("1行だけのHTMLにパッチを当てられる", () => {
    const oneLiner = `<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hi</h1></body></html>`;
    const result = applyPatch(oneLiner, {
      search: `<title>T</title>`,
      replace: `<title>New</title>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<title>New</title>");
    }
  });

  test("長いdata属性値を含むSEARCHが正しくマッチする", () => {
    const longAttr = `<div data-config='{"key":"value","nested":{"a":1},"list":[1,2,3]}'>content</div>`;
    const result = applyPatch(longAttr, {
      search: `<div data-config='{"key":"value","nested":{"a":1},"list":[1,2,3]}'>content</div>`,
      replace: `<div data-config='{"key":"updated"}'>content</div>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('"key":"updated"');
    }
  });

  test("2番目のブロックが1番目の適用結果にマッチする（連鎖依存）", () => {
    const simple = `<div class="box">\n  <p>text</p>\n</div>`;
    const result = applyPatches(simple, [
      {
        search: `<div class="box">`,
        replace: `<div class="box box--active">`,
      },
      {
        search: `<div class="box box--active">`,
        replace: `<div class="box box--active" aria-expanded="true">`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('aria-expanded="true"');
      expect(result.content).toContain("box--active");
    }
  });

  test("DOCTYPE宣言を含む先頭行のSEARCHが正しくマッチする", () => {
    const result = applyPatch(fullHtml, {
      search: `<!DOCTYPE html>`,
      replace: `<!DOCTYPE html>\n<!-- generated by build tool -->`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("generated by build tool");
      expect(result.content).toContain("<html");
    }
  });

  test("REPLACEがSEARCHを内包していても正しく動く（無限ループにならない）", () => {
    const result = applyPatch(fullHtml, {
      search: `    <link rel="stylesheet" href="/styles/main.css">`,
      replace: `    <link rel="stylesheet" href="/styles/main.css">
    <link rel="stylesheet" href="/styles/main.css" media="print">`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('media="print"');
      const count = (result.content.match(/main\.css/g) ?? []).length;
      expect(count).toBe(2);
    }
  });

  test("正規表現の特殊文字を含むSEARCHが文字通りにマッチする", () => {
    const htmlWithRegex = `<input pattern="[A-Z]{3}-\\d+" value="" />`;
    const result = applyPatch(htmlWithRegex, {
      search: `<input pattern="[A-Z]{3}-\\d+" value="" />`,
      replace: `<input pattern="[A-Z]{3}-\\d+" value="ABC-123" />`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('value="ABC-123"');
    }
  });

  test("LLM出力がコードブロックでくるまれていてもパースできる", () => {
    const llmOutput = "変更します：\n\n```\n<<<<<<< SEARCH\n    <title>My Site</title>\n=======\n    <title>Wrapped Site</title>\n>>>>>>> REPLACE\n```\n";
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(1);
    expect(blocks[0].replace).toContain("Wrapped Site");
  });

  test("絵文字を含むSEARCHが正しくマッチする", () => {
    const emojiHtml = `<button class="like-btn">👍 いいね</button>`;
    const result = applyPatch(emojiHtml, {
      search: `<button class="like-btn">👍 いいね</button>`,
      replace: `<button class="like-btn" data-count="0">👍 いいね <span>0</span></button>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain('data-count="0"');
      expect(result.content).toContain("👍");
    }
  });

  test("1行のSEARCHを多数行のREPLACEで置換できる", () => {
    const result = applyPatch(fullHtml, {
      search: `        <h2>Features</h2>`,
      replace: [
        `        <div class="section-header">`,
        `          <h2>Features</h2>`,
        `          <p class="section-lead">我々の強み</p>`,
        `          <hr class="divider">`,
        `        </div>`,
      ].join("\n"),
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("section-header");
      expect(result.content).toContain("我々の強み");
      expect(result.content).toContain("feature-grid");
    }
  });

  test("コンテキストが不十分で同じ構造のsectionを区別できないと失敗する", () => {
    const twoSections = `<section>\n  <h2>Title</h2>\n  <p>Content A</p>\n</section>\n<section>\n  <h2>Title</h2>\n  <p>Content B</p>\n</section>`;
    const result = applyPatch(twoSections, {
      search: `  <h2>Title</h2>`,
      replace: `  <h2>新タイトル</h2>`,
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched 2 locations");
    }
  });

  test("コンテキスト行を足せば同じ構造の2つのsectionを区別できる", () => {
    const twoSections = `<section>\n  <h2>Title</h2>\n  <p>Content A</p>\n</section>\n<section>\n  <h2>Title</h2>\n  <p>Content B</p>\n</section>`;
    const result = applyPatch(twoSections, {
      search: `  <h2>Title</h2>\n  <p>Content B</p>`,
      replace: `  <h2>2つ目のタイトル</h2>\n  <p>Content B</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("2つ目のタイトル");
      expect(result.content).toContain("Content A");
      const count = (result.content.match(/Title/g) ?? []).length;
      expect(count).toBe(1);
    }
  });
});

describe("悪魔のエッジケース", () => {
  test("適用後にSEARCHと同一文字列が生まれても2回適用されない", () => {
    const src = `<p>AB</p>`;
    const result = applyPatch(src, {
      search: `<p>AB</p>`,
      replace: `<p>AB</p>\n<p>AB</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      const count = (result.content.match(/<p>AB<\/p>/g) ?? []).length;
      expect(count).toBe(2);
    }
  });

  test("ファイル末尾に改行がない状態でもマッチする", () => {
    const noTrailingNL = `<html>\n  <body>end</body>\n</html>`;
    const result = applyPatch(noTrailingNL, {
      search: `</html>`,
      replace: `</html>\n<!-- eof -->`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("<!-- eof -->");
    }
  });

  test("重複文字列の境界で複数マッチになり失敗する", () => {
    const src = `<div class="aa aa"></div>`;
    const result = applyPatch(src, {
      search: `aa`,
      replace: `bb`,
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched");
    }
  });

  test("複数ブロック適用でdelta補正が累積されても正しく当たる", () => {
    const src = `<ul>\n  <li>A</li>\n  <li>B</li>\n  <li>C</li>\n</ul>`;
    const result = applyPatches(src, [
      {
        search: `  <li>A</li>`,
        replace: `  <li>ZERO</li>\n  <li>A</li>`,
      },
      {
        search: `  <li>B</li>`,
        replace: `  <li>B-MINUS</li>\n  <li>B</li>`,
      },
      {
        search: `  <li>C</li>`,
        replace: `  <li>C-UPDATED</li>`,
      },
    ]);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("ZERO");
      expect(result.content).toContain("B-MINUS");
      expect(result.content).toContain("C-UPDATED");
      expect(result.content).toContain("<li>A</li>");
      expect(result.content).toContain("<li>B</li>");
    }
  });

  test("SEARCHもREPLACEも空文字列だと失敗する", () => {
    const result = applyPatch(fullHtml, {
      search: ``,
      replace: ``,
    });
    expect(result.success).toBeFalsy();
  });

  test("空白行だけのSEARCHは失敗する", () => {
    const result = applyPatch(fullHtml, {
      search: `   `,
      replace: `<p>inserted</p>`,
    });
    expect(result.success).toBeFalsy();
  });

  test("改行1文字だけのSEARCHはtrimで空とみなし失敗する", () => {
    const result = applyPatch(fullHtml, {
      search: `\n`,
      replace: `\n\n`,
    });
    expect(result.success).toBeFalsy();
  });

  test("マルチバイト文字を含むファイルで後続マッチ位置が正しい", () => {
    const jpHtml = `<p>あいう</p>\n<p>えおか</p>\n<p>target</p>`;
    const result = applyPatch(jpHtml, {
      search: `<p>target</p>`,
      replace: `<p>ターゲット</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("ターゲット");
      expect(result.content).toContain("あいう");
    }
  });

  test("SEARCHの先頭行と末尾行が同じでも正しくマッチする", () => {
    const src = `<div>\n  <hr>\n  <p>content</p>\n  <hr>\n</div>`;
    const result = applyPatch(src, {
      search: `  <hr>\n  <p>content</p>\n  <hr>`,
      replace: `  <hr>\n  <p>更新済み</p>\n  <hr>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("更新済み");
    }
  });

  test("applyLLMOutputを3回連続適用しても二重適用が起きない", () => {
    const llmOutput = `<<<<<<< SEARCH\n    <title>My Site</title>\n=======\n    <title>Updated</title>\n>>>>>>> REPLACE`;
    const r1 = applyLLMOutput(fullHtml, llmOutput);
    expect(r1.success).toBeTruthy();
    if (!r1.success) return;

    const r2 = applyLLMOutput(r1.content, llmOutput);
    expect(r2.success).toBeFalsy();
  });

  test("コンテンツ内に <<<<<<< SEARCH という文字列があっても正しくパースできる", () => {
    const llmOutput = `<<<<<<< SEARCH\n<p>text</p>\n=======\n<p><!-- <<<<<<< SEARCH is a marker -->replaced</p>\n>>>>>>> REPLACE`;
    const src = `<div>\n<p>text</p>\n</div>`;
    const result = applyLLMOutput(src, llmOutput);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("replaced");
    }
  });

  test("3ブロックのパース時に貪欲マッチせず各ブロックを独立してパースする", () => {
    const llmOutput = [
      `<<<<<<< SEARCH`,
      `<p>A</p>`,
      `=======`,
      `<p>AA</p>`,
      `>>>>>>> REPLACE`,
      `<<<<<<< SEARCH`,
      `<p>B</p>`,
      `=======`,
      `<p>BB</p>`,
      `>>>>>>> REPLACE`,
      `<<<<<<< SEARCH`,
      `<p>C</p>`,
      `=======`,
      `<p>CC</p>`,
      `>>>>>>> REPLACE`,
    ].join("\n");
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(3);
    expect(blocks[0].search).toBe("<p>A</p>");
    expect(blocks[1].search).toBe("<p>B</p>");
    expect(blocks[2].search).toBe("<p>C</p>");
    expect(blocks[0].replace).toBe("<p>AA</p>");
    expect(blocks[1].replace).toBe("<p>BB</p>");
    expect(blocks[2].replace).toBe("<p>CC</p>");
  });

  test("SEARCHがファイル全体と一致する場合も成功する", () => {
    const tiny = `<p>only</p>`;
    const result = applyPatch(tiny, {
      search: `<p>only</p>`,
      replace: `<p>replaced</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toBe(`<p>replaced</p>`);
    }
  });

  test("replaceの途中行がsearchより深いインデントのときも相対差が維持される", () => {
    const src = `    <nav>\n      <ul>\n        <li>item</li>\n      </ul>\n    </nav>`;
    const result = applyPatch(src, {
      search: `    <nav>\n      <ul>\n        <li>item</li>\n      </ul>\n    </nav>`,
      replace: `<nav>\n  <ul>\n    <li>item</li>\n    <li>extra</li>\n  </ul>\n</nav>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("    <nav>");
      expect(result.content).toContain("      <ul>");
      expect(result.content).toContain("        <li>extra</li>");
    }
  });

  test("前のブロックで削除された行を後のブロックが指すと失敗する", () => {
    const src = `<p>A</p>\n<p>B</p>\n<p>C</p>`;
    const result = applyPatches(src, [
      {
        search: `<p>A</p>\n<p>B</p>`,
        replace: `<p>AB merged</p>`,
      },
      {
        search: `<p>B</p>`,
        replace: `<p>B updated</p>`,
      },
    ]);
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("Block 2/2");
    }
  });

  test("CRLFとLFが混在するファイルはLFに統一されてマッチする", () => {
    const mixed = `<p>first</p>\r\n<p>second</p>\n<p>third</p>\r\n`;
    const result = applyPatch(mixed, {
      search: `<p>second</p>`,
      replace: `<p>2番目</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("2番目");
    }
  });

  test("ほぼ同じ行が連続する中の特定行にはコンテキストが必要", () => {
    const repetitive = [
      `<tr><td>Row 1</td><td>Value</td></tr>`,
      `<tr><td>Row 2</td><td>Value</td></tr>`,
      `<tr><td>Row 3</td><td>Value</td></tr>`,
      `<tr><td>Row 4</td><td>Value</td></tr>`,
      `<tr><td>Row 5</td><td>Value</td></tr>`,
    ].join("\n");

    const r1 = applyPatch(repetitive, {
      search: `<td>Value</td>`,
      replace: `<td>Updated</td>`,
    });
    expect(r1.success).toBeFalsy();

    const r2 = applyPatch(repetitive, {
      search: `<tr><td>Row 3</td><td>Value</td></tr>`,
      replace: `<tr><td>Row 3</td><td>Updated</td></tr>`,
    });
    expect(r2.success).toBeTruthy();
    if (r2.success) {
      expect(r2.content).toContain("Row 3</td><td>Updated");
      expect(r2.content).toContain("Row 1</td><td>Value");
      expect(r2.content).toContain("Row 5</td><td>Value");
    }
  });

  test("コンテンツ内の=======がブロック区切りと誤認されないか確認", () => {
    const llmOutput = `<<<<<<< SEARCH\n<p>old</p>\n=======\n<p>new with === separator ===</p>\n>>>>>>> REPLACE`;
    const blocks = parseBlocks(llmOutput);
    expect(blocks.length).toBe(1);
    if (blocks.length === 1) {
      expect(blocks[0].replace).toContain("=== separator ===");
    }
  });

  test("1000行超のHTMLの末尾付近にも正しくパッチが当たる", () => {
    const manyLines = Array.from({ length: 1000 }, (_, i) => `  <p>Line ${i}</p>`).join("\n");
    const bigHtml = `<div>\n${manyLines}\n  <p>target line</p>\n</div>`;
    const result = applyPatch(bigHtml, {
      search: `  <p>target line</p>`,
      replace: `  <p>パッチ適用済み</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("パッチ適用済み");
      expect(result.content).toContain("<p>Line 0</p>");
      expect(result.content).toContain("<p>Line 999</p>");
    }
  });

  test("applyPatchesに空配列を渡すと元のコンテンツがそのまま返る", () => {
    const result = applyPatches(fullHtml, []);
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toBe(fullHtml);
    }
  });

  test("適用後に生まれた文字列は別のパッチで後から変更できる", () => {
    const src = `<p>original</p>`;
    const r1 = applyPatch(src, {
      search: `<p>original</p>`,
      replace: `<p>clone</p>\n<p>original</p>`,
    });
    expect(r1.success).toBeTruthy();
    if (!r1.success) return;

    const r2 = applyPatch(r1.content, {
      search: `<p>original</p>`,
      replace: `<p>modified</p>`,
    });
    expect(r2.success).toBeTruthy();
    if (r2.success) {
      expect(r2.content).toContain("<p>clone</p>");
      expect(r2.content).toContain("<p>modified</p>");
      expect(r2.content).not.toContain("<p>original</p>");
    }
  });

  test("replaceが改行から始まっても正しく適用される", () => {
    const src = `<div>\n  <p>text</p>\n</div>`;
    const result = applyPatch(src, {
      search: `  <p>text</p>`,
      replace: `\n  <p>text with blank above</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("text with blank above");
    }
  });

  test("対称位置に2回マッチしても複数マッチとして正しく失敗する", () => {
    const symmetric = `<p>X</p>\n<p>mid</p>\n<p>X</p>`;
    const result = applyPatch(symmetric, {
      search: `<p>X</p>`,
      replace: `<p>Y</p>`,
    });
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("matched 2 locations");
    }
  });

  test("=======の後に余分なテキストがあるとパースできない（仕様通り）", () => {
    const llmOutput = `<<<<<<< SEARCH\n<p>old</p>\n======= here is the replacement\n<p>new</p>\n>>>>>>> REPLACE`;
    const blocks = parseBlocks(llmOutput);
    expect(typeof blocks.length).toBe("number");
  });

  test("nullやundefinedという文字列を含むSEARCHが正しくマッチする", () => {
    const src = `<p data-value="null">undefined</p>`;
    const result = applyPatch(src, {
      search: `<p data-value="null">undefined</p>`,
      replace: `<p data-value="0">defined</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toBe(`<p data-value="0">defined</p>`);
    }
  });

  test("同じSEARCHを2ブロックで使うと2番目は失敗する", () => {
    const src = `<p>target</p>`;
    const result = applyPatches(src, [
      { search: `<p>target</p>`, replace: `<p>first</p>` },
      { search: `<p>target</p>`, replace: `<p>second</p>` },
    ]);
    expect(result.success).toBeFalsy();
    if (!result.success) {
      expect(result.error).toContain("Block 2/2");
    }
  });

  test("10段階ネストのインデントでもインデント補正が正しく動く", () => {
    const deepNest = [
      `<div>`,
      `  <div>`,
      `    <div>`,
      `      <div>`,
      `        <div>`,
      `          <div>`,
      `            <div>`,
      `              <div>`,
      `                <div>`,
      `                  <p>deep</p>`,
      `                </div>`,
      `              </div>`,
      `            </div>`,
      `          </div>`,
      `        </div>`,
      `      </div>`,
      `    </div>`,
      `  </div>`,
      `</div>`,
    ].join("\n");

    const result = applyPatch(deepNest, {
      search: `                  <p>deep</p>`,
      replace: `<p>shallow written but should be deep</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("                  <p>shallow written but should be deep</p>");
    }
  });

  test("SEARCHの最終行だけがユニークな場合もマッチできる", () => {
    const src = `<div>\n  <p>common</p>\n  <p>unique-end</p>\n</div>`;
    const result = applyPatch(src, {
      search: `  <p>common</p>\n  <p>unique-end</p>`,
      replace: `  <p>updated-common</p>\n  <p>unique-end</p>`,
    });
    expect(result.success).toBeTruthy();
    if (result.success) {
      expect(result.content).toContain("updated-common");
      expect(result.content).toContain("unique-end");
    }
  });

  test("空ファイルへのパッチは失敗する", () => {
    const result = applyPatch(``, {
      search: `<p>text</p>`,
      replace: `<p>new</p>`,
    });
    expect(result.success).toBeFalsy();
  });
});
