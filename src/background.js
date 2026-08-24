const FUNBOX_ORIGIN = "https://shop.funbox.com.tw";
const READY_NOTE = "funbox-checkout-ready";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  if (message.type === "OPEN_AND_RUN") {
    clearReadyHint();
    openAndRun(message.job)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
  if (message.type === "OPEN_PRODUCT") {
    openProductPage(message.url)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
  if (message.type === "JOB_UPDATE") {
    handleJobUpdate(message.job, sender && sender.tab).catch(() => {});
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id !== READY_NOTE) return;
  focusCheckoutTab().catch(() => {});
});

async function handleJobUpdate(job, tab) {
  if (!job) return;
  if (job.status === "submitted" || job.status === "watching" || job.status === "running") {
    if (job.status !== "watching") await clearReadyHint();
    return;
  }
  if (job.status !== "filled") return;
  const href = (job.extra && job.extra.checkoutHref) || (tab && tab.url) || "";
  await showReadyHint(job.message || "結帳頁已準備好，請自行確認並下單。", href, tab);
}

async function showReadyHint(message, href, tab) {
  if (tab && tab.windowId) {
    await chrome.windows.update(tab.windowId, { drawAttention: true }).catch(() => {});
  }
  try {
    await chrome.notifications.create(READY_NOTE, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Funbox 結帳助手",
      message: String(message || "可以回到結帳頁確認並下單。").slice(0, 180),
      contextMessage: href && /\/carts\//i.test(href) ? "點這裡回到結帳分頁" : "請回到 Funbox 分頁",
      priority: 2,
      requireInteraction: true,
    });
  } catch {
    /* notifications permission or platform */
  }
}

async function clearReadyHint() {
  await chrome.action.setBadgeText({ text: "" }).catch(() => {});
  try {
    await chrome.notifications.clear(READY_NOTE);
  } catch {
    /* ignore */
  }
}

async function focusCheckoutTab() {
  const carts = await chrome.tabs.query({ url: `${FUNBOX_ORIGIN}/carts/*` });
  const tab = carts[0];
  if (!tab) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
  await clearReadyHint();
}

async function openProductPage(url) {
  const targetUrl = String(url || "").trim() || `${FUNBOX_ORIGIN}/`;
  if (!/^https:\/\/shop\.funbox\.com\.tw\//i.test(targetUrl)) {
    throw new Error("請填 Funbox 官網商品或分類網址。");
  }
  const tabs = await chrome.tabs.query({ url: `${FUNBOX_ORIGIN}/*` });
  const tab = tabs.find((item) => item.active) || tabs[0];
  if (!tab) {
    await chrome.tabs.create({ url: targetUrl, active: true });
    return;
  }
  await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
}

async function openAndRun(job) {
  const targetUrl = job.productUrl || `${FUNBOX_ORIGIN}/`;
  const tabs = await chrome.tabs.query({ url: `${FUNBOX_ORIGIN}/*` });
  let tab = tabs.find((item) => item.active) || tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: targetUrl, active: true });
    await waitForComplete(tab.id);
  } else {
    const needsNav = Boolean(job.productUrl) && !samePath(tab.url, job.productUrl);
    await chrome.tabs.update(tab.id, needsNav ? { url: job.productUrl, active: true } : { active: true });
    if (needsNav) await waitForComplete(tab.id);
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "RUN", job });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "src/lib/dom.js",
        "src/lib/overlay.js",
        "src/lib/product.js",
        "src/lib/cart.js",
        "src/lib/log.js",
        "src/lib/alerts.js",
        "src/lib/fill.js",
        "src/lib/guard.js",
        "src/content.js",
      ],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "RUN", job });
  }
}

function samePath(current, next) {
  try {
    return new URL(current).pathname === new URL(next).pathname;
  } catch {
    return false;
  }
}

function waitForComplete(tabId) {
  return new Promise((resolve) => {
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, 20000);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

clearReadyHint().catch(() => {});
