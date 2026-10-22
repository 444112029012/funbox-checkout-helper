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
const PREVIEW_CATALOG = [
  { handle: "bb09728", title: "BEYBLADE X 戰鬥陀螺 CX-16 極限衝擊對戰組C", inStock: true, ignored: false, qty: 110 },
  { handle: "bb08568", title: "BEYBLADE X 戰鬥陀螺 CX-00 新世紀福音戰士改造組", inStock: false, ignored: false },
  { handle: "bb08062", title: "BEYBLADE X 戰鬥陀螺 CX-19 鱷魚裂甲 隨機強化組", inStock: false, ignored: false },
  { handle: "bbpr08914", title: "【APP兌換】交換票券_戰鬥陀螺 CX-00 龍神勇氣G4-70I 金屬塗裝：水藍", inStock: false, ignored: true },
  { handle: "bbpr07730", title: "【APP兌換】BEYBLADE X 戰鬥陀螺 CX-00 黃蜂要塞R7-60T 金屬塗裝：黃", inStock: false, ignored: true },
  { handle: "bbpr07733", title: "【APP兌換】BEYBLADE X 戰鬥陀螺 CX-00 海怪扭擺S3-70O 金屬塗裝：藍", inStock: false, ignored: true },
  { handle: "bbpr07736", title: "【APP兌換】BEYBLADE X 戰鬥陀螺 CX-00 雄鹿戰角B2-60D 金屬塗裝：橘", inStock: false, ignored: true },
  { handle: "bbpr07739", title: "【APP兌換】購買票券_戰鬥陀螺 CX-00 龍神勇氣G4-70I", inStock: false, ignored: true },
];

(function shimChromePreview() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && chrome.storage.onChanged) return;
  window.chrome = {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage: async () => ({ ok: true }),
    },
  };
})();

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const statusLabelEl = document.getElementById("statusLabel");
const watchLiveEl = document.getElementById("watchLive");
const logsEl = document.getElementById("logs");
const donateLinksEl = document.getElementById("donateLinks");
const qtyHintEl = document.getElementById("qtyHint");
const catalogEl = document.getElementById("catalog");
const catalogPanelEl = document.getElementById("catalogPanel");
let watchLiveState = null;
let lastWatch = null;
let watchLiveTimer = null;
let catalogTimer = null;
let catalogPollTimer = null;
let catalogFetchKey = "";
let catalogSignature = "";
let catalogItems = [];
let catalogOrdering = false;

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

function isExtensionPopup() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
}

function listingSignature(items, note) {
  const rows = (items || []).map((row) => `${row.handle}:${row.inStock ? 1 : 0}:${row.ignored ? 1 : 0}:${row.qty ?? ""}`).join("|");
  return `${currentTargetKind()}|${note || ""}|${rows}`;
}

function catalogGroupOpen(index, fallback) {
  const groups = catalogEl ? catalogEl.querySelectorAll("details.catalog-group") : [];
  if (groups[index]) return groups[index].open;
  return fallback;
}

function catalogItemHtml(row, kind) {
  const orderBtn =
    kind === "stock"
      ? `<button type="button" class="catalog-order" data-handle="${escapeHtml(row.handle)}" title="與商品頁右下角「加車並開結帳」相同">加車結帳</button>`
      : "";
  const qty =
    kind === "stock" && Number.isFinite(Number(row.qty))
      ? `<span class="catalog-qty">庫存 ${Number(row.qty)}</span>`
      : "";
  return `<article class="catalog-item" data-kind="${kind}"><div class="catalog-copy"><p class="catalog-title">${escapeHtml(row.title)}${qty}</p></div>${orderBtn}</article>`;
}

function catalogGroupHtml(label, kind, rows, open) {
  const body = rows.length
    ? rows.map((row) => catalogItemHtml(row, kind)).join("")
    : `<p class="catalog-empty">無</p>`;
  return `<details class="fold catalog-group"${open ? " open" : ""}><summary>${escapeHtml(label)} ${rows.length}</summary>${body}</details>`;
}

function updateCatalogHint() {
  const hint = document.getElementById("catalogHint");
  if (!hint) return;
  hint.textContent = `每 ${pollSecValue()} 秒讀分類 API，不必等頁面重整。現貨按鈕＝商品頁右下角「加車並開結帳」。分類監看仍不自動加現貨。`;
}

function renderCatalog(items, note) {
  catalogItems = items || [];
  if (!catalogPanelEl || !catalogEl) return;
  const listing = currentTargetKind() === "listing";
  const hasItems = catalogItems.length > 0;
  if (!listing && !hasItems) {
    catalogPanelEl.hidden = true;
    catalogSignature = "";
    return;
  }
  const sig = listingSignature(catalogItems, note || "");
  if (sig === catalogSignature) {
    updateCatalogHint();
    return;
  }
  const opened = [catalogGroupOpen(0, true), catalogGroupOpen(1, false), catalogGroupOpen(2, false)];
  catalogSignature = sig;
  catalogPanelEl.hidden = false;
  updateCatalogHint();
  const summary = document.getElementById("catalogSummary");
  if (!hasItems) {
    if (summary) summary.textContent = "分類商品";
    catalogEl.textContent = note || "讀取分類中…";
    return;
  }
  const groups = FunboxProduct.groupListingItems(catalogItems);
  if (summary) {
    summary.textContent = `分類商品（現貨 ${groups.stock.length} · 無庫存 ${groups.oos.length} · 排除 ${groups.excluded.length}）`;
  }
  catalogEl.innerHTML =
    catalogGroupHtml("現貨", "stock", groups.stock, opened[0]) +
    catalogGroupHtml("無庫存", "oos", groups.oos, opened[1]) +
    catalogGroupHtml("排除", "excluded", groups.excluded, opened[2]);
}

function watchListingItems(watch) {
  if (!watch || watch.kind !== "listing" || !Array.isArray(watch.listingItems) || !watch.listingItems.length) return null;
  const target = FunboxProduct.parseTarget(String(form.productUrl.value || "").trim());
  if (target.kind === "listing") {
    if (watch.listingType && String(watch.listingType) !== String(target.listingType || "")) return null;
    if (watch.listingPath && String(watch.listingPath).toLowerCase() !== String(target.listingPath || "").toLowerCase()) return null;
  }
  return watch.listingItems;
}

async function loadCatalogFromUrl(force) {
  const liveWatch = watchIsLive(watchLiveState);
  const fromWatch = watchListingItems(watchLiveState) || watchListingItems(lastWatch);
  if (fromWatch && (liveWatch || !force)) {
    renderCatalog(fromWatch);
    return;
  }
  if (currentTargetKind() !== "listing") {
    renderCatalog([]);
    return;
  }
  if (!isExtensionPopup()) {
    renderCatalog(PREVIEW_CATALOG);
    return;
  }
  const target = FunboxProduct.parseTarget(String(form.productUrl.value || "").trim());
  const key = FunboxProduct.listingJsonUrl(target);
  if (!key) {
    renderCatalog([], "找不到分類網址。");
    return;
  }
  if (!force && key === catalogFetchKey && catalogItems.length) {
    renderCatalog(catalogItems);
    return;
  }
  catalogFetchKey = key;
  if (!catalogItems.length) renderCatalog([], "讀取分類中…");
  try {
    const data = await FunboxProduct.loadListing(target);
    renderCatalog(FunboxProduct.normalizeListing(data));
  } catch (err) {
    catalogFetchKey = "";
    renderCatalog([], err && err.message ? err.message : "無法讀取分類");
  }
}

function scheduleCatalogRefresh() {
  if (catalogTimer) clearTimeout(catalogTimer);
  catalogTimer = setTimeout(() => {
    loadCatalogFromUrl(true);
  }, 350);
}

function startCatalogClock() {
  if (catalogPollTimer) clearInterval(catalogPollTimer);
  catalogPollTimer = setInterval(() => {
    if (currentTargetKind() !== "listing") return;
    if (watchIsLive(watchLiveState)) return;
    loadCatalogFromUrl(true);
  }, pollSecValue() * 1000);
}

async function orderListingItem(handle) {
  if (!handle || catalogOrdering) return;
  if (FunboxProduct.isAppRedemption({ handle }, handle)) {
    setStatus("APP兌換限定商品，已略過。", "error");
    return;
  }
  catalogOrdering = true;
  try {
    await save();
    const job = jobFromForm(false);
    job.productUrl = FunboxProduct.productPageUrl(handle);
    job.quantity = Math.max(1, Number(form.quantity.value) || 1);
    job.variantId = "";
    job.onlyFill = false;
    setStatus("加車並開結帳…");
    const res = await chrome.runtime.sendMessage({ type: "OPEN_AND_RUN", job });
    if (res && res.ok === false) setStatus(res.error || "執行失敗", "error");
    else if (job.checkoutMode === "submit" && AUTO_SUBMIT.has(job.shippingMethod)) {
      setStatus("已送到官網。貨到付款且資料齊全才會送出。", "ok");
    } else setStatus("已送到官網，會停在結帳頁。", "ok");
  } catch (err) {
    setStatus(err && err.message ? err.message : "執行失敗", "error");
  } finally {
    catalogOrdering = false;
  }
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
  if (watch) lastWatch = watch;
  watchLiveState = watchIsLive(watch) ? watch : null;
  const items = watchListingItems(watch) || watchListingItems(lastWatch);
  if (items) renderCatalog(items);
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
    qtyHintEl.textContent = listing ? "分類頁固定加 1 件，且不加重複現貨。" : "超商建議 1 件。";
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
      return `<article class="log-row log-${level}"><div class="log-meta"><time class="log-time">${t}</time><span class="log-level">${level}</span></div><p class="log-step">${step}${detail}</p></article>`;
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
  startCatalogClock();
  updateCatalogHint();
});
form.productUrl.addEventListener("input", () => {
  syncProfileRequired();
  catalogFetchKey = "";
  catalogSignature = "";
  scheduleCatalogRefresh();
  startCatalogClock();
});
if (catalogEl) {
  catalogEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".catalog-order");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    orderListingItem(btn.getAttribute("data-handle"));
  });
}

async function restore() {
  const data = await chrome.storage.local.get([...Object.values(KEYS), "funboxHelperJob", "funboxHelperLogs", "funboxHelperWatch"]);
  const profile = data[KEYS.profile] || {};
  form.productUrl.value = data[KEYS.productUrl] || "";
  if (!isExtensionPopup() && !form.productUrl.value) {
    form.productUrl.value = "https://shop.funbox.com.tw/categories/XI/KB";
  }
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
  startCatalogClock();
  await loadCatalogFromUrl(true);
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
