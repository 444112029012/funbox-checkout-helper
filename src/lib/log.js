(function (root) {
  const LOG_KEY = "funboxHelperLogs";
  const MAX = 80;

  function sanitize(value) {
    let text = String(value == null ? "" : value);
    text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card]");
    text = text.replace(/password["']?\s*[:=]\s*["']?[^"'\s]+/gi, "password:[redacted]");
    text = text.replace(/cvv|cvc|cyberbizpay_token|payment_token/gi, "[secret]");
    return text.slice(0, 240);
  }

  async function log(step, detail, level) {
    const entry = {
      t: Date.now(),
      step: sanitize(step),
      detail: sanitize(detail || ""),
      level: level || "info",
    };
    try {
      const data = await chrome.storage.local.get(LOG_KEY);
      const logs = (data[LOG_KEY] || []).concat(entry).slice(-MAX);
      await chrome.storage.local.set({ [LOG_KEY]: logs });
    } catch {
      /* popup/content without storage */
    }
    return entry;
  }

  async function readLogs() {
    const data = await chrome.storage.local.get(LOG_KEY);
    return data[LOG_KEY] || [];
  }

  root.FunboxLog = { log, readLogs, LOG_KEY };
})(globalThis);
