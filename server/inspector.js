(function () {
  "use strict";

  let active = false;

  // ── UI要素生成 ──────────────────────────────────────────────────────────
  // all:initial でページのCSSリセットを避ける
  const BASE =
    "all:initial;position:fixed;z-index:2147483647;font-family:ui-monospace,monospace;font-size:13px;";

  const btn = document.createElement("button");
  btn.setAttribute(
    "style",
    BASE +
      "top:12px;right:12px;padding:5px 14px;" +
      "background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;" +
      "border-radius:6px;cursor:pointer;"
  );
  btn.textContent = "Inspector OFF";

  const hl = document.createElement("div");
  hl.setAttribute(
    "style",
    BASE +
      "pointer-events:none;display:none;" +
      "outline:2px solid #60a5fa;background:rgba(96,165,250,0.1);" +
      "border-radius:2px;"
  );

  const info = document.createElement("div");
  info.setAttribute(
    "style",
    BASE +
      "bottom:12px;left:12px;padding:10px 14px;" +
      "background:#18181b;color:#a1a1aa;border:1px solid #3f3f46;" +
      "border-radius:8px;line-height:1.6;display:none;" +
      "max-width:520px;white-space:pre-wrap;"
  );

  document.body.appendChild(btn);
  document.body.appendChild(hl);
  document.body.appendChild(info);

  // ── WebSocket ────────────────────────────────────────────────────────────
  const ws = new WebSocket("ws://" + location.host + "/ws");
  ws.onerror = () => {
    info.style.display = "block";
    info.textContent = "✗ WebSocket 接続失敗 (サーバが起動しているか確認)";
  };

  // ── トグル ───────────────────────────────────────────────────────────────
  btn.addEventListener("click", toggle);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active) toggle();
  });

  function toggle() {
    active = !active;
    btn.textContent = active ? "Inspector ON" : "Inspector OFF";
    btn.style.background = active ? "#1d4ed8" : "#18181b";
    btn.style.borderColor = active ? "#3b82f6" : "#3f3f46";
    document.body.style.cursor = active ? "crosshair" : "";
    if (!active) {
      hl.style.display = "none";
      info.style.display = "none";
    }
  }

  // canvas/svg 内部要素など、ライブラリが動的生成する要素タグ
  const OPAQUE_TAGS = new Set(["CANVAS", "SVG", "PATH", "G", "CIRCLE", "RECT",
    "LINE", "POLYLINE", "POLYGON", "ELLIPSE", "TEXT", "TSPAN", "USE", "DEFS",
    "CLIPPATH", "LINEARGRADIENT", "RADIALGRADIENT", "STOP", "SYMBOL", "MASK"]);

  /**
   * EChartsなどが生成した内部要素の場合、id を持つ意味のある祖先まで bubble up する。
   * 祖先が見つからなければ元の要素をそのまま返す。
   */
  function findMeaningfulElement(el) {
    if (!OPAQUE_TAGS.has(el.tagName)) return { el, bubbled: false };
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      if (cur.id) return { el: cur, bubbled: true };
      cur = cur.parentElement;
    }
    return { el, bubbled: false };
  }

  // ── ホバーハイライト ──────────────────────────────────────────────────────
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!active || isOwn(e.target)) return;
      const { el } = findMeaningfulElement(e.target);
      const r = el.getBoundingClientRect();
      Object.assign(hl.style, {
        display: "block",
        top: r.top + "px",
        left: r.left + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
    },
    true
  );

  // ── クリックで抽出 ───────────────────────────────────────────────────────
  document.addEventListener(
    "click",
    (e) => {
      if (!active || isOwn(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const { el, bubbled } = findMeaningfulElement(e.target);
      const ctx = extract(el, bubbled);
      showInfo(ctx);
      send(ctx);
    },
    true
  );

  // ── ヘルパー ─────────────────────────────────────────────────────────────
  function isOwn(el) {
    return el === btn || el === hl || el === info || btn.contains(el) || info.contains(el);
  }

  function showInfo(ctx) {
    const preview = ctx.outerHTML.replace(/\s+/g, " ").slice(0, 60);
    info.style.display = "block";
    info.textContent =
      (ctx.bubbled ? `⬆ bubbled to parent\n` : "") +
      `selector : ${ctx.selector}\n` +
      `html     : ${preview}...\n` +
      `css rules: ${ctx.cssRules.length}\n` +
      `js lines : ${ctx.jsLines.length}\n` +
      `→ sending...`;
  }

  function send(ctx) {
    if (ws.readyState !== WebSocket.OPEN) {
      info.textContent = info.textContent.replace("→ sending...", "✗ WebSocket 未接続");
      return;
    }
    ws.send(JSON.stringify(ctx));
    ws.onmessage = (ev) => {
      try {
        const res = JSON.parse(ev.data);
        info.textContent = info.textContent.replace(
          "→ sending...",
          res.ok ? "✓ .inspector-context.json に保存" : `✗ ${res.error}`
        );
      } catch (_) {}
    };
  }

  function getSelector(el) {
    if (el.id) return "#" + el.id;
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList).join(".");
    return cls ? `${tag}.${cls}` : tag;
  }

  function getCSSRules(el) {
    const found = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!rule.selectorText) continue;
          const matched = rule.selectorText.split(",").some((s) => {
            try { return el.matches(s.trim()); } catch (_) { return false; }
          });
          if (matched) found.push(rule.cssText);
        }
      } catch (_) {
        // cross-origin sheet はスキップ
      }
    }
    return found;
  }

  function getJSLines(el) {
    const ids = [el.id, ...Array.from(el.classList)].filter(Boolean);
    if (!ids.length) return [];

    const lines = new Set();
    // script[src] は外部ファイルなのでスキップ、inline scriptのみ対象
    for (const script of document.querySelectorAll("script:not([src])")) {
      for (const line of script.textContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && ids.some((id) => trimmed.includes(id))) {
          lines.add(trimmed);
        }
      }
    }
    return [...lines];
  }

  function extract(el, bubbled = false) {
    return {
      selector: getSelector(el),
      outerHTML: el.outerHTML,
      cssRules: getCSSRules(el),
      jsLines: getJSLines(el),
      bubbled,
      timestamp: new Date().toISOString(),
    };
  }
})();
