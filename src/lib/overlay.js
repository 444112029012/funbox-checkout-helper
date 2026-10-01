(function (root) {
  const ID = "funbox-helper-overlay";
  const OVERLAY_Z = "2147483646";
  const BTN_Z = "2147483645";
  const EDGE = 16;
  const GAP = 8;

  const FONT =
    '"Segoe UI Variable", "Segoe UI", "Microsoft JhengHei UI", "Noto Sans TC", sans-serif';
  const STYLE_ID = "funbox-helper-overlay-css";

  function overlayBox() {
    return {
      position: "fixed",
      zIndex: OVERLAY_Z,
      top: "auto",
      right: `${EDGE}px`,
      bottom: `${EDGE}px`,
      left: "auto",
      maxWidth: "240px",
      padding: "10px 12px",
      borderRadius: "12px",
      background: "#18181b",
      color: "#f4f4f5",
      font: `12px/1.45 ${FONT}`,
      boxShadow: "0 12px 28px -18px rgba(24, 24, 27, 0.45)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      display: "none",
      pointerEvents: "none",
    };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      `#funbox-helper-overlay [data-part="title"]{font-weight:700;letter-spacing:-0.02em}` +
      `#funbox-helper-overlay [data-part="detail"]{margin-top:4px;color:#a1a1aa;white-space:pre-wrap}` +
      `#funbox-helper-overlay [data-part="count"]{margin-top:8px;font-size:20px;font-weight:800;letter-spacing:0.02em;color:#f4f4f5}` +
      `#funbox-helper-stop-watch-btn,#funbox-helper-checkout-btn,#funbox-helper-product-btn{border:0;border-radius:8px;padding:8px 12px;font:600 13px/1.1 ${FONT};color:#fff;cursor:pointer;transition:transform 120ms cubic-bezier(0.22,1,0.36,1)}` +
      `#funbox-helper-stop-watch-btn:active,#funbox-helper-checkout-btn:active,#funbox-helper-product-btn:active{transform:scale(0.98)}`;
    document.documentElement.appendChild(style);
  }

  function ensure() {
    ensureStyles();
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = ID;
    el.setAttribute("data-funbox-helper", "overlay");
    Object.assign(el.style, overlayBox());
    el.innerHTML =
      '<div data-part="title"></div>' +
      '<div data-part="detail" style="display:none"></div>' +
      '<div data-part="count" style="display:none"></div>';
    document.documentElement.appendChild(el);
    return el;
  }

  function fabList() {
    return [
      document.getElementById("funbox-helper-stop-watch-btn"),
      document.getElementById("funbox-helper-checkout-btn"),
      document.getElementById("funbox-helper-product-btn"),
    ].filter(Boolean);
  }

  function placeOverlay(el, fabBottom) {
    if (!el) return;
    const above = typeof fabBottom === "number" ? fabBottom : EDGE;
    el.style.top = "auto";
    el.style.right = `${EDGE}px`;
    el.style.left = "auto";
    el.style.bottom = `${above}px`;
    el.style.zIndex = OVERLAY_Z;
    el.style.maxWidth = "240px";
    el.style.pointerEvents = "none";
  }

  function layoutButtons() {
    const fabs = fabList();
    let bottom = EDGE;
    fabs.forEach((btn) => {
      btn.style.position = "fixed";
      btn.style.right = `${EDGE}px`;
      btn.style.left = "auto";
      btn.style.top = "auto";
      btn.style.bottom = `${bottom}px`;
      btn.style.zIndex = BTN_Z;
      bottom += Math.max(btn.offsetHeight || 40, 40) + GAP;
    });
    const overlay = document.getElementById(ID);
    if (overlay && overlay.style.display !== "none") {
      placeOverlay(overlay, bottom);
    } else if (overlay) {
      placeOverlay(overlay, EDGE);
    }
  }

  let countdownTimer = null;
  let countdownUntil = 0;
  let countdownMeta = { title: "", detail: "", tone: "" };

  function toneColor(tone) {
    return tone === "error" ? "#fb7185" : tone === "done" ? "#6ee7b7" : "#f4f4f5";
  }

  function paint(title, detail, tone, countdownText) {
    const el = ensure();
    const titleEl = el.querySelector('[data-part="title"]');
    const detailEl = el.querySelector('[data-part="detail"]');
    const countEl = el.querySelector('[data-part="count"]');
    const firstShow = el.style.display !== "block";
    if (titleEl) {
      titleEl.style.color = toneColor(tone);
      titleEl.textContent = String(title || "").trim();
    }
    const body = String(detail || "").trim();
    if (detailEl) {
      detailEl.textContent = body;
      detailEl.style.display = body ? "block" : "none";
    }
    if (countEl) {
      countEl.textContent = countdownText || "";
      countEl.style.display = countdownText ? "block" : "none";
    }
    el.style.display = "block";
    if (firstShow) layoutButtons();
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    countdownUntil = 0;
    countdownMeta.busy = false;
  }

  function remainSec() {
    return Math.max(0, Math.ceil((countdownUntil - Date.now()) / 1000));
  }

  function paintCountdown() {
    if (!countdownUntil && !countdownMeta.busy) return;
    const countText = countdownMeta.busy ? "偵測中…" : `下次 ${remainSec()} 秒`;
    paint(countdownMeta.title, countdownMeta.detail, countdownMeta.tone, countText);
  }

  function show(title, detail, tone) {
    stopCountdown();
    paint(title, detail, tone);
  }

  function showCountdown(title, detail, nextAt, tone) {
    countdownMeta = {
      title: title || countdownMeta.title || "",
      detail: detail || countdownMeta.detail || "",
      tone: tone || "",
      busy: false,
    };
    countdownUntil = Number(nextAt) || Date.now();
    paintCountdown();
    if (!countdownTimer) countdownTimer = setInterval(paintCountdown, 250);
  }

  function setBusy(busy) {
    if (!countdownMeta.title && !document.getElementById(ID)) return;
    countdownMeta.busy = Boolean(busy);
    if (countdownMeta.busy || countdownUntil) paintCountdown();
  }

  function hide() {
    stopCountdown();
    const el = document.getElementById(ID);
    if (el) el.style.display = "none";
    layoutButtons();
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function addActionButton(id, text, onClick, title, colors) {
    if (document.getElementById(id)) {
      layoutButtons();
      return;
    }
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.textContent = text;
    if (title) btn.title = title;
    const bg = (colors && colors.background) || "#245c8f";
    const shadow = (colors && colors.shadow) || "0 12px 28px -18px rgba(24, 24, 27, 0.45)";
    Object.assign(btn.style, {
      position: "fixed",
      zIndex: BTN_Z,
      right: `${EDGE}px`,
      bottom: `${EDGE}px`,
      padding: "8px 12px",
      border: "0",
      borderRadius: "8px",
      background: bg,
      color: "#fff",
      font: `600 13px/1.1 ${FONT}`,
      cursor: "pointer",
      boxShadow: shadow,
    });
    btn.addEventListener("click", onClick);
    document.documentElement.appendChild(btn);
    layoutButtons();
  }

  function removeWatchButton() {
    const btn = document.getElementById("funbox-helper-watch-btn");
    if (btn) btn.remove();
    layoutButtons();
  }

  function addStopWatchButton(onClick) {
    addActionButton(
      "funbox-helper-stop-watch-btn",
      "停止監看",
      onClick,
      "停止 API 偵測與每分鐘頁面重整。",
      { background: "#be123c", shadow: "0 12px 28px -18px rgba(190, 18, 60, 0.45)" }
    );
  }

  function removeStopWatchButton() {
    const btn = document.getElementById("funbox-helper-stop-watch-btn");
    if (btn) btn.remove();
    layoutButtons();
  }

  function setWatchLabel(watching) {
    removeWatchButton();
    if (!watching) removeStopWatchButton();
  }

  function addProductButton(onClick) {
    addActionButton("funbox-helper-product-btn", "加車並開結帳", onClick, "使用已儲存設定：加車並打開結帳頁。改配送或是否直接結帳請點工具列圖示。");
  }

  function addCheckoutButton(onClick) {
    addActionButton("funbox-helper-checkout-btn", "只選配送方式", onClick, "不改設定，只在此結帳頁選已儲存的配送方式。改選項請點工具列圖示。");
  }

  root.FunboxOverlay = {
    show,
    showCountdown,
    setBusy,
    stopCountdown,
    hide,
    addProductButton,
    addCheckoutButton,
    addStopWatchButton,
    removeStopWatchButton,
    removeWatchButton,
    setWatchLabel,
    layoutButtons,
  };
})(globalThis);
