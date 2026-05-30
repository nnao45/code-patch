import { readFileSync } from "fs";
import { resolve } from "path";

const INSPECTOR_JS = readFileSync(resolve(import.meta.dir, "inspector.js"), "utf-8");

// アップロードされたHTMLをメモリに保持
let uploadedHTML: string | null = null;
let uploadedFilename = "untitled.html";

// ── ランディングページ ────────────────────────────────────────────────────
const LANDING_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>code-patch inspector</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #09090b; color: #e4e4e7;
      font-family: ui-monospace, 'JetBrains Mono', monospace;
    }
    h1 { font-size: 1.4rem; margin-bottom: .4rem; color: #f4f4f5; }
    .sub { font-size: .8rem; color: #52525b; margin-bottom: 2.5rem; }
    .drop {
      border: 2px dashed #3f3f46; border-radius: 12px;
      padding: 3rem 5rem; cursor: pointer;
      transition: border-color .15s, background .15s;
      text-align: center;
    }
    .drop:hover, .drop.over { border-color: #60a5fa; background: rgba(96,165,250,.05); }
    .drop svg { width: 44px; height: 44px; color: #52525b; display: block; margin: 0 auto .8rem; }
    .label { font-size: .95rem; color: #a1a1aa; }
    .hint  { font-size: .75rem; color: #52525b; margin-top: .4rem; }
    .loading { color: #60a5fa !important; }
    input[type=file] { display: none; }
  </style>
</head>
<body>
  <div>
    <h1>code-patch inspector</h1>
    <p class="sub">HTMLを読み込んで要素を選択 → context を抽出</p>
    <div class="drop" id="drop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5
             m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
      </svg>
      <div class="label" id="label">HTMLファイルをドロップ</div>
      <div class="hint">または クリックして選択（.html / .htm）</div>
      <input type="file" id="file-input" accept=".html,.htm">
    </div>
  </div>
  <script>
    const drop  = document.getElementById('drop');
    const input = document.getElementById('file-input');
    const label = document.getElementById('label');

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover',  (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', ()  => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) upload(f);
    });
    input.addEventListener('change', () => { if (input.files[0]) upload(input.files[0]); });

    async function upload(file) {
      label.textContent = '読み込み中...';
      label.classList.add('loading');
      const html = await file.text();
      const res  = await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename: file.name }),
      });
      if (res.ok) location.href = '/preview';
      else label.textContent = '✗ アップロード失敗';
    }
  </script>
</body>
</html>`;

// ── Bun.serve ─────────────────────────────────────────────────────────────
const server = Bun.serve({
  port: 3000,

  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    // WebSocket アップグレード
    if (pathname === "/ws") {
      if (server.upgrade(req)) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // inspector.js 配信
    if (pathname === "/__inspector__.js") {
      return new Response(INSPECTOR_JS, {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    // HTMLアップロード受け取り
    if (req.method === "POST" && pathname === "/upload") {
      const body = (await req.json()) as { html: string; filename?: string };
      uploadedHTML = body.html;
      uploadedFilename = body.filename ?? "untitled.html";
      console.log(`[inspector] loaded: ${uploadedFilename}`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // プレビュー: inspector.js を注入してHTMLを配信
    if (pathname === "/preview") {
      if (!uploadedHTML) {
        return new Response(null, { status: 302, headers: { Location: "/" } });
      }
      const injection = `<script src="/__inspector__.js"></script>`;
      const html = uploadedHTML.includes("</body>")
        ? uploadedHTML.replace("</body>", `${injection}\n</body>`)
        : uploadedHTML + injection;
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ランディングページ
    return new Response(LANDING_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },

  websocket: {
    open(ws) {
      console.log("[inspector] client connected");
    },
    close(ws) {
      console.log("[inspector] client disconnected");
    },
    async message(ws, message) {
      try {
        const ctx = JSON.parse(message.toString()) as Record<string, unknown>;
        const outPath = resolve(process.cwd(), ".inspector-context.json");
        await Bun.write(outPath, JSON.stringify(ctx, null, 2));
        console.log(`[inspector] context saved → ${ctx.selector}`);
        ws.send(JSON.stringify({ ok: true, path: outPath }));
      } catch (e) {
        console.error("[inspector] error:", e);
        ws.send(JSON.stringify({ ok: false, error: String(e) }));
      }
    },
  },
});

console.log(`[inspector] http://localhost:${server.port}`);
console.log(`[inspector] context output → ${resolve(process.cwd(), ".inspector-context.json")}`);
