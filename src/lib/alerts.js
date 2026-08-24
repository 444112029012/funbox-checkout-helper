(function (root) {
  const OFFICIAL_VOLUME_MSG = "商品總材積超過限制，本次訂單將無法提供超商配送。";
  const VOLUME_RE = /商品總材積超過限制[，,、]?\s*本次訂單將無法提供超商配送。?/;
  const STOCK_RE = /庫存不足|超出庫存|部分商品超出庫存|已售完|無庫存|sold\s*out/i;
  const LOGIN_RE = /請註冊或者登錄|請先登入|繼續操作前請註冊/;
  const CLOSED_RE = /結帳功能已關閉/;
  const ERROR_RE = /發生錯誤|系統忙碌|請稍後再試|加入購物車失敗|無法完成/;

  const TOAST_SEL = [
    ".alert",
    ".toast",
    ".notice",
    ".flash",
    ".error",
    ".el-message",
    ".ant-message",
    ".swal2-html-container",
    ".swal2-content",
    "[role=alert]",
    ".notify",
    ".notification",
    ".message-error",
    ".cart-error",
    ".checkout-error",
  ].join(",");

  const seen = new Set();
  let observer = null;
  let onHit = null;

  function extractVolumeMessage(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const full = raw.match(VOLUME_RE);
    if (full) {
      const sentence = full[0].replace(/。?$/, "。");
      return sentence;
    }
    if (/商品總材積超過限制/.test(raw) && /無法提供超商配送/.test(raw)) {
      return OFFICIAL_VOLUME_MSG;
    }
    return "";
  }

  function isVolumeLimit(text) {
    return Boolean(extractVolumeMessage(text));
  }

  function classify(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return null;
    const volumeText = extractVolumeMessage(raw);
    if (volumeText) return { kind: "volume", text: volumeText };
    const short = raw.length > 240 ? raw.slice(0, 240) : raw;
    if (STOCK_RE.test(short)) return { kind: "stock", text: short };
    if (LOGIN_RE.test(short)) return { kind: "login", text: short };
    if (CLOSED_RE.test(short)) return { kind: "closed", text: short };
    if (ERROR_RE.test(short) && short.length <= 240) return { kind: "error", text: short };
    return null;
  }

  function collectFromNodes() {
    const out = [];
    document.querySelectorAll(TOAST_SEL).forEach((el) => {
      if (!el) return;
      const hit = classify(el.innerText || el.textContent || "");
      if (hit) out.push(hit);
    });
    return out;
  }

  function collectFromBody() {
    const text = (document.body && document.body.innerText) || "";
    const volumeText = extractVolumeMessage(text);
    const out = [];
    if (volumeText) out.push({ kind: "volume", text: volumeText });
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.length > 80) continue;
      const hit = classify(line);
      if (hit && hit.kind !== "volume") out.push(hit);
    }
    return out;
  }

  function findVolumeMessage() {
    if (typeof document === "undefined" || !document) return "";
    const nodes = collectFromNodes();
    const fromNode = nodes.find((hit) => hit.kind === "volume");
    if (fromNode) return fromNode.text;
    return extractVolumeMessage((document.body && document.body.innerText) || "");
  }

  function scan() {
    const hits = collectFromNodes().concat(collectFromBody());
    const unique = [];
    const keys = new Set();
    for (const hit of hits) {
      const key = `${hit.kind}:${hit.text.slice(0, 80)}`;
      if (keys.has(key)) continue;
      keys.add(key);
      unique.push(hit);
    }
    return unique;
  }

  function emit(hit) {
    const key = `${hit.kind}:${hit.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (typeof onHit === "function") onHit(hit);
    return true;
  }

  function scanAndEmit() {
    const hits = scan();
    const fresh = [];
    for (const hit of hits) {
      if (emit(hit)) fresh.push(hit);
    }
    return { hits, fresh };
  }

  function start(handler) {
    onHit = handler || onHit;
    scanAndEmit();
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      scanAndEmit();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
  }

  root.FunboxAlerts = {
    scan,
    scanAndEmit,
    start,
    stop,
    classify,
    isVolumeLimit,
    extractVolumeMessage,
    findVolumeMessage,
    OFFICIAL_VOLUME_MSG,
    VOLUME_RE,
    STOCK_RE,
  };
})(globalThis);
