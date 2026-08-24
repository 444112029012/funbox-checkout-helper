const DONATE = {
  paypal: "",
  ecpay: "",
};

const KEYS = {
  profile: "funboxHelperProfile",
  quantity: "funboxHelperQuantity",
  productUrl: "funboxHelperProductUrl",
  variantId: "funboxHelperVariantId",
  storeBrand: "funboxHelperStoreBrand",
  checkoutMode: "funboxHelperCheckoutMode",
  shippingMethod: "funboxHelperShippingMethod",
  pollSec: "funboxHelperPollSec",
  watchIfOos: "funboxHelperWatchIfOos",
  checkoutEntry: "funboxHelperCheckoutEntry",
};

const AUTO_SUBMIT = new Set(["seven_cod", "family_cod"]);
const POLL_SECS = [3, 5, 10, 15, 30];

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const statusLabelEl = document.getElementById("statusLabel");
const watchLiveEl = document.getElementById("watchLive");
const logsEl = document.getElementById("logs");
const donateLinksEl = document.getElementById("donateLinks");
const qtyHintEl = document.getElementById("qtyHint");
let watchLiveState = null;
let watchLiveTimer = null;

function selectedRadio(name, fallback) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function setRadio(name, value, fallback) {
  const next = value || fallback;
  const el =
    form.querySelector(`input[name="${name}"][value="${next}"]`) ||
    form.querySelector(`input[name="${name}"][value="${fallback}"]`);
  if (el) el.checked = true;
}

function pollSecValue() {
  const n = Number(form.pollSec.value);
  return POLL_SECS.includes(n) ? n : 10;
}

function profileFromForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    email: String(data.get("email") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    recipientName: String(data.get("recipientName") || "").trim(),
    recipientPhone: String(data.get("recipientPhone") || "").trim(),
    city: String(data.get("city") || "").trim(),
    district: String(data.get("district") || "").trim(),
    zip: String(data.get("zip") || "").trim(),
    address: String(data.get("address") || "").trim(),
    note: String(data.get("note") || "").trim(),
  };
}

function donateUrlReady(url) {
  const text = String(url || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  return !/YOUR_ID|YOUR_LINK|example\.com/i.test(text);
}

function renderDonateLinks() {
  if (!donateLinksEl) return;
  const parts = [];
  if (donateUrlReady(DONATE.paypal)) {
    parts.push(`<a href="${escapeHtml(DONATE.paypal)}" target="_blank" rel="noopener noreferrer">PayPal</a>`);
  }
  if (donateUrlReady(DONATE.ecpay)) {
    parts.push(`<a href="${escapeHtml(DONATE.ecpay)}" target="_blank" rel="noopener noreferrer">綠界收款連結</a>`);
  }
  donateLinksEl.innerHTML = parts.length ? `感謝贊助：${parts.join(" · ")}` : "作者尚未放上贊助連結。";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function currentTargetKind() {
  const url = String(form.productUrl.value || "").trim();
  if (!url) return "empty";
  if (typeof FunboxProduct !== "undefined" && FunboxProduct.parseTarget) {
    return FunboxProduct.parseTarget(url).kind || "unknown";
  }
  if (/\/products\//i.test(url)) return "product";
  if (/\/(categories|collections)\//i.test(url)) return "listing";
  return "unknown";
}

function jobFromForm(onlyFill) {
  const data = new FormData(form);
  let shippingMethod = selectedRadio("shippingMethod", "seven_cod");
  if (shippingMethod === "home_cod") shippingMethod = "home";
  const kind = currentTargetKind();
  const canSubmit = AUTO_SUBMIT.has(shippingMethod);
  const checkoutMode = canSubmit && selectedRadio("checkoutMode", "stop") === "submit" ? "submit" : "stop";
  return {
    productUrl: String(data.get("productUrl") || "").trim(),
    quantity: kind === "listing" ? 1 : Math.max(1, Number(data.get("quantity") || 1) || 1),
    variantId: String(data.get("variantId") || "").trim(),
    profile: profileFromForm(),
    shippingMethod,
    storeBrand: shippingMethod.startsWith("family") ? "family" : "seven",
    checkoutMode,
    checkoutEntry: selectedRadio("checkoutEntry", "api"),
    pollSec: pollSecValue(),
    watchIfOos: form.watchIfOos.checked,
    onlyFill: Boolean(onlyFill),
  };
}

function setStatus(text, kind) {
  if (statusLabelEl) statusLabelEl.hidden = true;
  statusEl.textContent = text || "";
  statusEl.className = `status ${kind || ""}`;
}

function watchIsLive(watch) {
  if (!watch || !watch.active) return false;
  if (watch.plannedReload) return true;
  return Number(watch.nextTickAt || 0) > Date.now();
}

function renderWatchLive(watch) {
  watchLiveState = watchIsLive(watch) ? watch : null;
  if (!watchLiveEl) return;
  if (!watchLiveState) {
    watchLiveEl.hidden = true;
    watchLiveEl.textContent = "";
    return;
  }
  const left = Math.max(0, Math.ceil((Number(watchLiveState.nextTickAt) - Date.now()) / 1000));
  const n = watchLiveState.tickCount || 0;
  const sec = watchLiveState.intervalSec || 0;
  watchLiveEl.hidden = false;
  watchLiveEl.textContent = `監看中 · 已查 ${n} 次 · 下次 ${left} 秒`;
}

function startWatchLiveClock() {
  if (watchLiveTimer) return;
  watchLiveTimer = setInterval(() => {
    if (watchLiveState) renderWatchLive(watchLiveState);
  }, 250);
}

function syncCheckoutMode() {
  const method = selectedRadio("shippingMethod", "seven_cod");
  const canSubmit = AUTO_SUBMIT.has(method);
  const submitEl = form.querySelector('input[name="checkoutMode"][value="submit"]');
  const submitLabel = document.getElementById("submitModeLabel") || (submitEl && submitEl.closest("label"));
  const hint = document.getElementById("submitModeHint");
  if (submitEl) {
    submitEl.disabled = !canSubmit;
    if (!canSubmit && submitEl.checked) setRadio("checkoutMode", "stop", "stop");
  }
  if (submitLabel) {
    submitLabel.classList.toggle("disabled", !canSubmit);
    submitLabel.title = canSubmit ? "僅超商貨到付款可送出。" : "宅配與先付款無法直接結帳。";
  }
  if (hint) {
    hint.textContent = canSubmit ? "僅限 7-11／全家貨到付款。" : "已改為非貨到付款，直接結帳已關閉。";
  }
}

function syncProfileRequired() {
  const method = selectedRadio("shippingMethod", "seven_cod");
  form.name.required = false;
  form.email.required = false;
  form.phone.required = false;
  syncCheckoutMode();
  const kind = currentTargetKind();
  const listing = kind === "listing";
  if (form.quantity) form.quantity.disabled = listing;
  if (qtyHintEl) {
    qtyHintEl.textContent = listing ? "分類頁固定加 1 件。" : "超商建議 1 件。";
  }
  const qty = Number(form.quantity.value) || 1;
  const cvs = method === "seven_cod" || method === "family_cod" || method === "seven_prepaid" || method === "family_prepaid";
  if (kind === "unknown") {
    setStatus("請填商品頁或分類頁網址。", "error");
  } else   if (cvs && qty > 1 && !listing) {
    setStatus("超商數量大於 1 時，以結帳頁可選配送為準。", "error");
  } else if (statusEl.classList.contains("error") && /體積限制|請填|實際可選配送|請填商品/.test(statusEl.textContent || "")) {
    setStatus("");
  }
}

function renderLogs(logs) {
  const rows = (logs || []).slice(-20).reverse();
  if (!rows.length) {
    logsEl.textContent = "尚無紀錄";
    return;
  }
  logsEl.innerHTML = rows
    .map((entry) => {
      const t = new Date(entry.t).toLocaleTimeString("zh-TW", { hour12: false });
      const detail = entry.detail ? ` — ${escapeHtml(entry.detail)}` : "";
      const level = escapeHtml(entry.level || "info");
      const step = escapeHtml(entry.step || "");
      return `<div class="log-row log-${level}"><div class="log-time">${t}</div><div class="log-step">[${level}] ${step}${detail}</div></div>`;
    })
    .join("");
}

async function save() {
  const job = jobFromForm(false);
  await chrome.storage.local.set({
    [KEYS.profile]: job.profile,
    [KEYS.quantity]: job.quantity,
    [KEYS.productUrl]: job.productUrl,
    [KEYS.variantId]: job.variantId,
    [KEYS.storeBrand]: job.storeBrand,
    [KEYS.checkoutMode]: job.checkoutMode,
    [KEYS.checkoutEntry]: job.checkoutEntry,
    [KEYS.shippingMethod]: job.shippingMethod,
    [KEYS.pollSec]: job.pollSec,
    [KEYS.watchIfOos]: job.watchIfOos,
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await save();
  setStatus("資料已儲存。", "ok");
});

form.addEventListener("change", () => {
  syncProfileRequired();
});
form.productUrl.addEventListener("input", () => {
  syncProfileRequired();
});

async function restore() {
  const data = await chrome.storage.local.get([...Object.values(KEYS), "funboxHelperJob", "funboxHelperLogs", "funboxHelperWatch"]);
  const profile = data[KEYS.profile] || {};
  form.productUrl.value = data[KEYS.productUrl] || "";
  form.quantity.value = data[KEYS.quantity] || 1;
  form.variantId.value = data[KEYS.variantId] || "";
  form.pollSec.value = String(POLL_SECS.includes(Number(data[KEYS.pollSec])) ? data[KEYS.pollSec] : 10);
  form.watchIfOos.checked = data[KEYS.watchIfOos] !== false;
  let shipping = data[KEYS.shippingMethod] || (data[KEYS.storeBrand] === "family" ? "family_cod" : "seven_cod");
  if (shipping === "home_cod") shipping = "home";
  setRadio("shippingMethod", shipping, "seven_cod");
  const storedMode = AUTO_SUBMIT.has(shipping) ? data[KEYS.checkoutMode] : "stop";
  setRadio("checkoutMode", storedMode, "stop");
  setRadio("checkoutEntry", data[KEYS.checkoutEntry], "api");
  for (const key of Object.keys(profile)) {
    if (form[key]) form[key].value = profile[key];
  }
  renderDonateLinks();
  syncProfileRequired();
  setStatus("");
  renderLogs(data.funboxHelperLogs);
  renderWatchLive(data.funboxHelperWatch);
  startWatchLiveClock();
}

function showJob(job) {
  if (!job || !job.message) return;
  const kind = job.status === "error" ? "error" : job.status === "filled" || job.status === "submitted" || job.status === "watching" ? "ok" : "";
  setStatus(job.message, kind);
}

async function start(openPageOnly) {
  syncProfileRequired();
  if (!form.reportValidity()) return;
  const kind = currentTargetKind();
  if (kind === "empty" || kind === "unknown") {
    setStatus("請填商品頁或分類頁網址。", "error");
    return;
  }
  await save();
  if (openPageOnly) {
    setStatus("開啟頁面…");
    const res = await chrome.runtime.sendMessage({
      type: "OPEN_PRODUCT",
      url: String(form.productUrl.value || "").trim(),
    });
    if (res && res.ok === false) setStatus(res.error || "無法開啟頁面", "error");
    else setStatus("已開啟商品／分類頁，未加車。", "ok");
    return;
  }
  const job = jobFromForm(false);
  setStatus("執行中…");
  const res = await chrome.runtime.sendMessage({ type: "OPEN_AND_RUN", job });
  if (res && res.ok === false) setStatus(res.error || "執行失敗", "error");
  else if (kind === "listing") {
    setStatus("開始監看。右下角可停止。", "ok");
  } else if (job.checkoutMode === "submit" && AUTO_SUBMIT.has(job.shippingMethod)) {
    setStatus("已送到官網。貨到付款且資料齊全才會送出。", "ok");
  } else setStatus("已送到官網，會停在結帳頁。", "ok");
}

document.getElementById("run").addEventListener("click", () => start(false));
document.getElementById("openProduct").addEventListener("click", () => start(true));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.funboxHelperJob) showJob(changes.funboxHelperJob.newValue);
  if (changes.funboxHelperLogs) renderLogs(changes.funboxHelperLogs.newValue);
  if (changes.funboxHelperWatch) renderWatchLive(changes.funboxHelperWatch.newValue);
});
restore();
