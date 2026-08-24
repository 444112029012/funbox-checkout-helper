(function () {
  const JOB_KEY = "funboxHelperJob";
  const PREPAID_MSG = "先付款無法自動結帳，本外掛不處理金流。";
  const COD_ONLY_MSG = "自動送出僅限 7-11／全家超商貨到付款。";
  const HAND_OFF_MSG = "直接結帳無法完成，請自行處理";
  const VERIFY_MSG = "已補填個資，請自行核對下單";
  const VOLUME_MSG = "超商因體積限制無法結帳";
  const VOLUME_STOP = "超商因體積限制無法結帳。已停在結帳頁，不會送出訂單。";
  const isTop = window.top === window;
  const WATCH_RELOAD_MS = 60000;
  const RELOAD_RESUME_MS = 20000;
  let watchTimer = null;
  let watchReloadTimer = null;
  let watchStop = false;
  let watchTickCount = 0;
  let volumeBlocked = false;
  let volumeOfficial = "";

  function isCvsMethod(job) {
    const method = methodInfo(job);
    return method && method.group === "cvs";
  }

  function addQuantity(job, restock) {
    if (restock || (job && job.fromListing)) return 1;
    const n = Number(job && job.quantity);
    return n > 0 ? n : 1;
  }

  function officialVolumeText(hit) {
    const fromHit = hit && hit.kind === "volume" ? String(hit.text || "").trim() : "";
    if (fromHit && typeof FunboxAlerts !== "undefined" && FunboxAlerts.isVolumeLimit(fromHit)) return fromHit;
    if (typeof FunboxAlerts !== "undefined" && FunboxAlerts.findVolumeMessage) {
      return FunboxAlerts.findVolumeMessage() || "";
    }
    if (typeof FunboxAlerts !== "undefined" && FunboxAlerts.extractVolumeMessage) {
      return FunboxAlerts.extractVolumeMessage((document.body && document.body.innerText) || "");
    }
    return "";
  }

  async function stopForVolume(official, extra) {
    const quote = official || volumeOfficial || officialVolumeText();
    if (!quote) return false;
    volumeBlocked = true;
    volumeOfficial = quote;
    await stopWatch();
    await logStep("volume_blocked", quote, "error");
    if (isTop && typeof FunboxOverlay !== "undefined") FunboxOverlay.show("官網：超商材積超限", "", "error");
    await done("官網：超商材積超限", { volume: true, official: quote, overlay: "官網：超商材積超限", ...(extra || {}) }, "error");
    return true;
  }

  async function surfaceSiteMessage(hit) {
    if (!hit) return;
    if (hit.kind === "volume") {
      const quote = officialVolumeText(hit);
      if (!quote) return;
      volumeBlocked = true;
      volumeOfficial = quote;
      await logStep("site_message", `volume: ${quote}`, "error");
      if (isTop) FunboxOverlay.show("官網：超商材積超限", "", "error");
      return;
    }
    await logStep("site_message", `${hit.kind}: ${hit.text}`, hit.kind === "stock" ? "error" : "info");
    if (hit.kind === "stock") {
      if (isTop) FunboxOverlay.show("官網庫存訊息", "", "error");
    } else if (isTop) {
      FunboxOverlay.show("官網訊息", "", "error");
    }
  }

  function startAlertWatch() {
    if (!isTop || typeof FunboxAlerts === "undefined") return;
    FunboxAlerts.start((hit) => {
      surfaceSiteMessage(hit).catch(() => {});
    });
  }

  function modeOf(job) {
    const method = FunboxFill.getMethod(FunboxFill.normalizeMethodId(job || {}));
    if (!method || !method.autoSubmit) return "stop";
    return job && job.checkoutMode === "submit" ? "submit" : "stop";
  }

  function methodOf(job) {
    return FunboxFill.normalizeMethodId(job || {});
  }

  function methodInfo(job) {
    return FunboxFill.getMethod(methodOf(job));
  }

  function pollSecOf(job) {
    return FunboxProduct.normalizePollSec(job && job.pollSec);
  }

  async function setWatchState(patch) {
    const prev = ((await chrome.storage.local.get("funboxHelperWatch")).funboxHelperWatch) || {};
    await chrome.storage.local.set({
      funboxHelperWatch: { ...prev, ...patch, updatedAt: Date.now() },
    });
  }

  function showStopWatchButton() {
    if (!isTop || typeof FunboxOverlay === "undefined" || !FunboxOverlay.addStopWatchButton) return;
    FunboxOverlay.addStopWatchButton(() => {
      stopWatch().then(() => {
        FunboxOverlay.show("已停止監看", "不會再偵測，也不會重整頁面。", "done");
      });
    });
  }

  function scheduleWatchReload() {
    if (watchReloadTimer) clearTimeout(watchReloadTimer);
    watchReloadTimer = setTimeout(() => {
      reloadForSession().catch(() => {});
    }, WATCH_RELOAD_MS);
  }

  async function reloadForSession() {
    if (watchStop || !isTop) return;
    await logStep("watch_reload", "重整頁面以維持登入（每 1 分鐘）");
    await setWatchState({
      active: true,
      plannedReload: true,
      plannedReloadAt: Date.now(),
      tickCount: watchTickCount,
    });
    location.reload();
  }

  function beginWatchCountdown(title, detail, sec) {
    const nextAt = Date.now() + sec * 1000;
    if (typeof FunboxOverlay !== "undefined" && FunboxOverlay.showCountdown) {
      FunboxOverlay.showCountdown(title, detail, nextAt);
    } else if (typeof FunboxOverlay !== "undefined") {
      FunboxOverlay.show(title, `${detail}\n下次 ${sec} 秒`);
    }
    return nextAt;
  }

  async function logStep(step, detail, level) {
    if (typeof FunboxLog !== "undefined") {
      try {
        await FunboxLog.log(step, detail, level);
      } catch {
        /* ignore */
      }
    }
  }

  async function getJob() {
    const data = await chrome.storage.local.get(JOB_KEY);
    return data[JOB_KEY] || null;
  }

  async function setJob(job) {
    await chrome.storage.local.set({ [JOB_KEY]: job });
    chrome.runtime.sendMessage({ type: "JOB_UPDATE", job }).catch(() => {});
  }

  async function fail(message) {
    await logStep("error", message, "error");
    if (isTop && typeof FunboxOverlay !== "undefined") FunboxOverlay.show(message, "", "error");
    await setJob({ active: false, status: "error", message, updatedAt: Date.now() });
  }

  function markCheckoutTab() {
    if (!isTop) return;
    if (!/\/carts\/[A-Za-z0-9]+/i.test(location.pathname)) return;
    const prefix = "【可結帳】 ";
    if (!document.title.startsWith(prefix)) {
      document.title = prefix + document.title.replace(/^【可結帳】\s*/, "");
    }
  }

  async function done(message, extra, tone) {
    const line = (extra && extra.overlay) || message;
    if (typeof FunboxOverlay !== "undefined") {
      FunboxOverlay.show(line, "", tone === "error" ? "error" : "done");
    }
    const submitted = Boolean(extra && extra.submitted);
    if (!submitted) markCheckoutTab();
    await setJob({
      active: false,
      status: submitted ? "submitted" : "filled",
      message,
      extra: {
        ...(extra || {}),
        checkoutHref: /\/carts\//i.test(location.pathname) ? location.href : "",
        readyToCheckout: !submitted,
      },
      updatedAt: Date.now(),
    });
  }

  function entryOf(job) {
    const value = job && job.checkoutEntry;
    if (value === "click" || value === "api_then_click") return value;
    return "api";
  }

  function clickAddToCartButton() {
    const D = typeof FunboxDom !== "undefined" ? FunboxDom : null;
    if (!D) return false;
    const hit = [...document.querySelectorAll("button, a, input[type=button], input[type=submit]")].find((el) => {
      if (!D.visible(el)) return false;
      const text = `${el.innerText || ""} ${el.value || ""} ${el.className || ""} ${el.id || ""}`;
      if (/立即結帳|送出訂單/.test(text)) return false;
      return /加入購物車|addToCart|btn_to_cart|add-to-cart|btn_to_cart/i.test(text);
    });
    if (!hit) return false;
    D.click(hit);
    return true;
  }

  async function addViaApi(variantId, qty) {
    return FunboxCart.ensureInCart(variantId, qty);
  }

  async function addViaClickThenApi(variantId, qty) {
    const clicked = clickAddToCartButton();
    if (clicked) {
      await new Promise((r) => setTimeout(r, 450));
      const item = await FunboxCart.findInCart(variantId);
      if (item && Number(item.quantity) >= qty) return { item, via: "click" };
    }
    const item = await FunboxCart.ensureInCart(variantId, qty);
    return { item, via: clicked ? "click_then_api" : "api" };
  }

  async function resolveCheckoutHref(entry) {
    if (entry === "click") return { href: "/cart", via: "cart_click" };
    const href = await FunboxCart.findCheckoutUrl();
    if (href) return { href, via: "token" };
    return { href: "/cart", via: entry === "api_then_click" ? "api_then_click" : "cart_page" };
  }

  async function addAndOpenCheckout(job) {
    const entry = entryOf(job);
    await logStep("detect_product", `${job.productUrl || location.href} entry=${entry}`);
    const target = FunboxProduct.parseTarget(job.productUrl || location.href);
    if (!target || target.kind === "unknown") {
      throw new Error("請填 Funbox 商品頁（/products/商品代號）或分類／系列頁（/categories/...、/collections/...）");
    }
    if (target.kind === "listing" && !job.skipWatch) {
      await startListingWatch(job, target);
      return { watching: true };
    }
    const handle = target.kind === "product" ? target.handle : FunboxProduct.parseHandle(job.productUrl || location.href);
    if (!handle) throw new Error("找不到 Funbox 商品網址（需要 /products/...）");
    FunboxOverlay.show("讀取商品", handle);
    const product = await FunboxProduct.loadProduct(handle);
    const variant = FunboxProduct.pickVariant(product, job.variantId);
    if (!variant) throw new Error("找不到可加入購物車的規格");
    if (!job.skipWatch && !FunboxProduct.isVariantInStock(variant) && job.watchIfOos !== false) {
      await startWatch(job, handle, variant);
      return { watching: true };
    }
    if (!FunboxProduct.isVariantInStock(variant)) {
      throw new Error("加入購物車失敗：目前缺貨。");
    }
    const wanted = addQuantity(job, Boolean(job.fromRestock) || Boolean(job.fromListing));
    const pageLimit = FunboxProduct.readPageBuyLimit();
    const clamped = FunboxProduct.clampQuantity(wanted, variant, { pageLimit });
    if (!clamped.quantity) {
      throw new Error("加入購物車失敗：目前缺貨或購買上限為 0。");
    }
    const qty = clamped.quantity;
    if (clamped.adjusted) {
      await logStep("qty_clamped", `${wanted} → ${qty}`, "info");
    }
    const listingNote = job.fromListing ? `（新上架 ${handle}，固定 1 件）` : "";
    const clampNote = clamped.adjusted ? `。受庫存或購買限制調整為 ${qty}` : "";
    FunboxOverlay.show("加入購物車", `${product.title || handle}${listingNote}${clampNote}`);
    const addStarted = Date.now();
    let addVia = "api";
    try {
      if (entry === "click") {
        const added = await addViaClickThenApi(variant.id, qty);
        addVia = added.via;
      } else {
        try {
          await addViaApi(variant.id, qty);
          addVia = "api";
        } catch (err) {
          if (entry !== "api_then_click") throw err;
          const added = await addViaClickThenApi(variant.id, qty);
          addVia = added.via || "click";
        }
      }
    } catch (err) {
      const text = err && err.message ? err.message : String(err);
      if (typeof FunboxAlerts !== "undefined") {
        const hit = FunboxAlerts.classify(text);
        if (hit) await surfaceSiteMessage(hit);
      }
      if (/409|庫存/.test(text)) throw new Error("加入購物車失敗：庫存不足（HTTP 409）。");
      if (/登入/.test(text)) throw new Error("加入購物車失敗：需要先登入 Funbox 會員。");
      throw err;
    }
    const addMs = Date.now() - addStarted;
    const cart = await FunboxCart.readCart();
    const check = FunboxCart.verifyExpectedItem(cart, { variantId: variant.id, handle, quantity: qty });
    if (!check.ok) {
      await logStep("cart_mismatch", check.reason, "error");
      throw new Error(check.reason);
    }
    await logStep("add_cart", `${handle} · ${variant.id} ×${qty} via=${addVia} add_ms=${addMs}`);
    const openStarted = Date.now();
    const alreadyCarts = /\/carts\/[A-Za-z0-9]+/i.test(location.pathname);
    let openVia = "already_checkout";
    let checkoutHref = `${location.pathname}${location.search || ""}`;
    if (!alreadyCarts) {
      const open = await resolveCheckoutHref(entry);
      openVia = open.via;
      checkoutHref = open.href;
    }
    const openMs = Date.now() - openStarted;
    await logStep("open_checkout", `path=${entry} via=${openVia} href=${checkoutHref} add_ms=${addMs} open_checkout_ms=${openMs}`);
    await setJob({
      ...job,
      active: true,
      status: "checkout",
      handle,
      variantId: variant.id,
      addedTitle: product.title || handle,
      quantity: qty,
      cartCount: cart.item_count,
      fromListing: Boolean(job.fromListing),
      checkoutEntry: entry,
      addMs,
      openVia,
      updatedAt: Date.now(),
    });
    if (!alreadyCarts) {
      location.assign(checkoutHref);
      return { navigated: true };
    }
    return { navigated: false, product, variant, cart };
  }

  async function startListingWatch(job, target) {
    watchStop = false;
    watchTickCount = 0;
    const sec = pollSecOf(job);
    const data = await FunboxProduct.loadListing(target);
    const items = FunboxProduct.normalizeListing(data);
    const seen = items.map((row) => row.handle);
    const label = `${target.listingType}/${target.listingPath}`;
    await logStep("watch_listing", `${label} · 已記錄 ${seen.length} 件現有商品，只會加新上架的 1 件 · 每 ${sec} 秒 API 偵測，每 1 分鐘重整頁面以免登入過期`);
    await setJob({
      ...job,
      active: true,
      status: "watching",
      message: seen.length ? `監看新上架中（目前 ${seen.length} 件）。補貨靠 API 偵測；每 1 分鐘重整以免登入過期。` : "分類目前是空的，開始監看新上架。補貨靠 API 偵測；每 1 分鐘重整以免登入過期。",
      updatedAt: Date.now(),
    });
    const nextJob = {
      ...job,
      productUrl: job.productUrl || location.href,
      listingSeenHandles: seen,
      listingType: target.listingType,
      listingPath: target.listingPath,
    };
    await setWatchState({
      active: true,
      kind: "listing",
      listingType: target.listingType,
      listingPath: target.listingPath,
      intervalSec: sec,
      productUrl: nextJob.productUrl,
      listingSeenHandles: seen,
      tickCount: 0,
      title: "監看新上架",
      lastDetail: `${label} · API 偵測中`,
      plannedReload: false,
    });
    showStopWatchButton();
    scheduleWatchReload();
    await watchTick(nextJob);
  }

  async function startWatch(job, handle, variant) {
    watchStop = false;
    watchTickCount = 0;
    const sec = pollSecOf(job);
    await logStep("watch_start", `每 ${sec} 秒 API 偵測 ${handle}；每 1 分鐘重整頁面以免登入過期`);
    await setJob({
      ...job,
      active: true,
      status: "watching",
      message: "商品缺貨，開始監看庫存。補貨靠 API 偵測；每 1 分鐘重整以免登入過期。",
      updatedAt: Date.now(),
    });
    await setWatchState({
      active: true,
      kind: "product",
      handle,
      variantId: variant.id,
      intervalSec: sec,
      productUrl: job.productUrl || location.href,
      tickCount: 0,
      title: "監看庫存",
      lastDetail: variant.title || String(variant.id),
      plannedReload: false,
    });
    showStopWatchButton();
    scheduleWatchReload();
    await watchTick({ ...job, productUrl: job.productUrl || location.href, variantId: variant.id });
  }

  async function stopWatch() {
    watchStop = true;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = null;
    if (watchReloadTimer) clearTimeout(watchReloadTimer);
    watchReloadTimer = null;
    if (typeof FunboxOverlay !== "undefined") {
      if (FunboxOverlay.stopCountdown) FunboxOverlay.stopCountdown();
      if (FunboxOverlay.removeStopWatchButton) FunboxOverlay.removeStopWatchButton();
      if (FunboxOverlay.setWatchLabel) FunboxOverlay.setWatchLabel(false);
    }
    await setWatchState({ active: false, nextTickAt: 0, plannedReload: false, plannedReloadAt: 0 });
  }

  async function watchTick(job) {
    if (watchStop) return;
    const target = FunboxProduct.parseTarget(job.productUrl || location.href);
    const sec = pollSecOf(job);
    const title = target.kind === "listing" ? "監看新上架" : "監看庫存";
    try {
      if (target.kind === "listing") {
        const data = await FunboxProduct.loadListing(target);
        const items = FunboxProduct.normalizeListing(data);
        const found = FunboxProduct.findNewInStock(items, job.listingSeenHandles || []);
        if (found) {
          if (volumeBlocked) {
            await logStep("watch_skip", "已因體積限制停止，不再重試加車", "error");
            await stopWatch();
            return;
          }
          await logStep("listing_new", found.handle);
          FunboxOverlay.show("偵測到新商品", `將加入 1 件：${found.handle}${found.title ? `（${found.title}）` : ""}。之後可改填商品頁網址鎖定這件。`);
          await stopWatch();
          const result = await addAndOpenCheckout({
            ...job,
            productUrl: FunboxProduct.productPageUrl(found.handle),
            handle: found.handle,
            skipWatch: true,
            fromRestock: true,
            fromListing: true,
          });
          if (result.navigated || result.watching) return;
          await fillWhenReady({ ...job, productUrl: FunboxProduct.productPageUrl(found.handle), handle: found.handle, fromListing: true, fromRestock: true });
          return;
        }
        watchTickCount += 1;
        const label = `${target.listingType}/${target.listingPath}`;
        const detail = `${label} · 尚無新品 · 已查 ${watchTickCount} 次 · 每 ${sec} 秒偵測，每 1 分鐘重整以免登入過期`;
        await logStep("watch_tick", detail);
        const nextAt = beginWatchCountdown(title, detail, sec);
        await setWatchState({
          active: true,
          kind: "listing",
          tickCount: watchTickCount,
          nextTickAt: nextAt,
          title,
          lastDetail: detail,
          intervalSec: sec,
        });
      } else {
        const handle = target.kind === "product" ? target.handle : FunboxProduct.parseHandle(job.productUrl || location.href);
        const product = await FunboxProduct.loadProduct(handle);
        const variant = FunboxProduct.pickVariant(product, job.variantId);
        if (variant && FunboxProduct.isVariantInStock(variant)) {
          if (volumeBlocked) {
            await logStep("watch_skip", "已因體積限制停止，不再重試加車", "error");
            await stopWatch();
            return;
          }
          await logStep("stock_found", String(variant.id));
          await stopWatch();
          const result = await addAndOpenCheckout({ ...job, skipWatch: true, fromRestock: true });
          if (result.navigated || result.watching) return;
          await fillWhenReady(job);
          return;
        }
        watchTickCount += 1;
        const detail = `${handle || "商品"} · 仍缺貨 · 已查 ${watchTickCount} 次 · 每 ${sec} 秒偵測，每 1 分鐘重整以免登入過期`;
        await logStep("watch_tick", detail);
        const nextAt = beginWatchCountdown(title, detail, sec);
        await setWatchState({
          active: true,
          kind: "product",
          tickCount: watchTickCount,
          nextTickAt: nextAt,
          title,
          lastDetail: detail,
          intervalSec: sec,
        });
      }
    } catch (err) {
      await logStep("watch_error", err && err.message ? err.message : String(err), "error");
      FunboxOverlay.show("監看出錯", err && err.message ? err.message : String(err), "error");
    }
    watchTimer = setTimeout(() => watchTick(job), sec * 1000);
  }

  async function verifyCheckoutAfterOpen(job) {
    const expectedQty = addQuantity(job, Boolean(job.fromRestock) || Boolean(job.fromListing));
    let cart;
    try {
      cart = await FunboxCart.readCart();
    } catch (err) {
      await logStep("cart_read_error", err && err.message ? err.message : String(err), "error");
      return { ok: false, reason: "無法讀取購物車核對結帳明細。" };
    }
    const check = FunboxCart.verifyExpectedItem(cart, {
      variantId: job.variantId,
      handle: job.handle,
      quantity: expectedQty,
    });
    if (!check.ok) {
      await logStep("checkout_mismatch", check.reason, "error");
      return check;
    }
    const title = job.addedTitle || (check.item && check.item.title) || "";
    if (FunboxCart.isCheckoutPage() && !FunboxCart.checkoutListLooksRight({ title, handle: job.handle })) {
      const reason = "結帳頁上看不到預期商品明細，停止自動結帳。";
      await logStep("checkout_mismatch", reason, "error");
      return { ok: false, reason };
    }
    await logStep("checkout_items", `${job.handle || job.variantId} ×${expectedQty}`);
    return check;
  }

  async function goCartThenCheckout(job) {
    await logStep("open_cart", "/cart（結帳頁顯示已關閉）");
    await setJob({ ...job, active: true, status: "checkout", triedCart: true, updatedAt: Date.now() });
    location.assign("/cart");
  }

  async function maybePlaceOrder(job, filled) {
    const mode = modeOf(job);
    const method = methodInfo(job);
    if (mode !== "submit") {
      const note = filled && filled.helperFilledPersonal ? "已補填個資，未按送出" : filled && filled.funboxAutoFilled ? "官網已帶入個資，未按送出" : "未按送出";
      await logStep("stop", `停在結帳頁，${note}（${method.label}）`);
      return { submitted: false, stopped: true };
    }
    if (filled && filled.helperFilledPersonal) {
      await logStep("submit_blocked", "官網未帶入個資，已補填後交給使用者核對下單", "error");
      return { submitted: false, needsVerify: true };
    }
    if (filled && !filled.funboxAutoFilled) {
      await logStep("submit_blocked", "官網未帶入個資且無法補填，交給使用者處理", "error");
      return { submitted: false, handoff: true };
    }
    const officialNow = officialVolumeText();
    if (officialNow) {
      await stopForVolume(officialNow);
      return { submitted: false, volume: true };
    }
    if (!method.autoSubmit) {
      await logStep("submit_blocked", COD_ONLY_MSG, "error");
      return { submitted: false, codOnly: true };
    }
    if (FunboxFill.isPrepaidOrGateway() || !FunboxFill.isCvsCodSelected(method.brand)) {
      await logStep("prepaid_blocked", PREPAID_MSG, "error");
      return { submitted: false, prepaid: true };
    }
    if (!filled || !filled.storeReady) {
      await logStep("submit_blocked", "尚未選擇門市，不會送出訂單", "error");
      return { submitted: false, needStore: true };
    }
    const button = FunboxFill.placeOrderButton();
    if (!button) {
      await logStep("submit_blocked", "找不到立即結帳按鈕，交給使用者處理", "error");
      return { submitted: false, handoff: true };
    }
    if (typeof FunboxGuard !== "undefined" && FunboxGuard.allowNextSubmit) FunboxGuard.allowNextSubmit();
    FunboxDom.click(button);
    await logStep("submit", `已按立即結帳（${method.label}）`);
    return { submitted: true };
  }

  async function fillWhenReady(job) {
    if (FunboxProduct.isListingPage() && !job.fromListing) return;
    if (FunboxProduct.isProductPage() && !job.onlyFill && !job.fromRestock && !job.skipWatch) return;
    FunboxGuard.install();
    const mode = modeOf(job);
    const method = methodInfo(job);
    if (FunboxCart.isLoginPage()) {
      if (isTop) await fail("Funbox 結帳需要先登入會員。請在這個 Chrome 登入後，再按一次開始。");
      return;
    }
    if (FunboxCart.isCartPage()) {
      const nav = FunboxCart.checkoutNavButton();
      if (nav) {
        FunboxOverlay.show("前往結帳", "");
        await logStep("open_checkout", `click 立即結帳 on /cart entry=${entryOf(job)}`);
        FunboxDom.click(nav);
        return;
      }
    }
    if (FunboxCart.isCheckoutClosed()) {
      if (isTop && !job.triedCart) {
        await goCartThenCheckout(job);
        return;
      }
      if (isTop) await fail("結帳頁顯示已關閉（通常是未登入、購物車是空的，或開到 /checkout 而不是 /carts/{token}）。請先登入 Funbox 會員。");
      return;
    }
    if (/\/carts\/[A-Za-z0-9]+/i.test(location.pathname)) {
      await logStep("open_checkout", location.pathname);
      if (job.variantId || job.handle) {
        const verified = await verifyCheckoutAfterOpen(job);
        if (!verified.ok) {
          await fail(verified.reason || "結帳明細與加車商品不符。");
          return;
        }
      }
    }
    const alerts = typeof FunboxAlerts !== "undefined" ? FunboxAlerts.scan() : [];
    const volumeHit = alerts.find((hit) => hit.kind === "volume");
    if (volumeHit && volumeHit.text) await logStep("site_message", `volume_seen: ${volumeHit.text}`, "info");
    if (isCvsMethod(job) && addQuantity(job, false) > 1) {
      await logStep("qty_warn", "超商取貨數量大於 1，請以結帳頁實際可選配送為準", "info");
    }
    if (isTop) FunboxOverlay.show(`選擇${method.label}`, "", "");
    let filled = {};
    try {
      filled = await FunboxFill.waitAndFill(job.profile || {}, 20000, {
        shippingMethod: method.id,
        fillPersonal: false,
        fillIfEmpty: true,
        storeBrand: method.brand,
      });
      if (filled.helperFilledPersonal) {
        await logStep("fill_fields", "官網未帶入個資，已補填；請自行核對後下單");
      } else if (filled.funboxAutoFilled) {
        await logStep("identity", "官網已自動帶入個資，未覆寫");
      } else {
        await logStep("identity", "官網未帶入個資，彈出視窗也無資料可補填");
      }
      await logStep("select_shipping", mode === "submit" ? "直接結帳路徑，選配送後視結果決定是否送出" : "停在結帳頁，不自動下單");
    } catch (err) {
      throw new Error(`選擇配送／填寫失敗：${err && err.message ? err.message : err}`);
    }
    if (!FunboxFill.checkoutLooksReady()) {
      if (!isTop) return;
      const current = await getJob();
      if (current && (current.status === "filled" || current.status === "submitted")) return;
      await fail("結帳表單還沒出現");
      return;
    }
    const officialAfter = filled.volumeMessage || officialVolumeText();
    if (officialAfter && isCvsMethod(job)) {
      await stopForVolume(officialAfter, { filled });
      return;
    }
    if (filled.cvsBlocked || volumeBlocked) {
      const quote = filled.volumeMessage || officialVolumeText() || volumeOfficial;
      if (quote && (await stopForVolume(quote, { filled }))) return;
    }
    if (filled.shippingDisabled || filled.wrongPrepaid || filled.shippingMissing) {
      const why = filled.shippingDisabled ? "disabled" : filled.wrongPrepaid ? "still_prepaid" : "not_found";
      await logStep("shipping_unselectable", `${method.label} ${why}`, "error");
      const line = `${method.label}無法選取`;
      await fail(line);
      return;
    }
    await logStep(
      "select_method",
      `${filled.shipping || method.label} id=${filled.shippingButtonId || ""} rate=${filled.shippingRate || ""} title=${filled.shippingTitle || filled.shipping || ""}`
    );
    if (filled.storePickerBlocked) {
      await fail("門市選擇視窗被擋住或無法開啟。請允許彈出視窗後再選門市。");
      return;
    }
    if (filled.storePickerIframe) {
      await logStep("store_picker", "門市選擇在 iframe 內，交給你手動選");
    } else if (filled.storePickerOpened) {
      await logStep("store_picker", "已打開門市選擇");
    }
    await chrome.storage.local.set({ funboxHelperDump: filled && filled.dump ? filled.dump : [] });

    if (mode === "submit" && !method.autoSubmit) {
      await maybePlaceOrder(job, filled);
      await done(HAND_OFF_MSG, { filled, codOnly: true, overlay: HAND_OFF_MSG }, "error");
      return;
    }
    if (mode === "submit" && (FunboxFill.isPrepaidOrGateway() || filled.wrongPrepaid || !FunboxFill.isCvsCodSelected(method.brand))) {
      await maybePlaceOrder(job, filled);
      await done(HAND_OFF_MSG, { filled, prepaid: true, overlay: "先付款無法自動結帳" }, "error");
      return;
    }

    if (method.needsStore && !filled.storeReady) {
      await logStep("store_picker", "尚無已選門市，交給使用者");
      await maybePlaceOrder(job, filled);
      await done("請選擇門市", { filled, needStore: true, overlay: "請選擇門市" }, "error");
      return;
    }

    if (filled.store) await logStep("store_selected", filled.store);
    const order = await maybePlaceOrder(job, filled);
    if (order.volume) return;
    if (order.needsVerify) {
      await done(VERIFY_MSG, { filled, overlay: VERIFY_MSG }, "error");
      return;
    }
    if (order.handoff) {
      await done(HAND_OFF_MSG, { filled, overlay: HAND_OFF_MSG }, "error");
      return;
    }
    if (order.prepaid) {
      await done(HAND_OFF_MSG, { filled, prepaid: true, overlay: "先付款無法自動結帳" }, "error");
      return;
    }
    if (order.codOnly) {
      await done(HAND_OFF_MSG, { filled, codOnly: true, overlay: HAND_OFF_MSG }, "error");
      return;
    }
    if (order.submitted) {
      FunboxOverlay.show("已送出結帳", "", "done");
      await setJob({
        active: false,
        status: "submitted",
        message: "已按下立即結帳。",
        extra: { filled, submitted: true },
        updatedAt: Date.now(),
      });
      return;
    }
    const stopMsg = filled.helperFilledPersonal ? VERIFY_MSG : `已選 ${method.label}，請自行確認`;
    await done(stopMsg, { filled, overlay: stopMsg });
  }

  async function run(job) {
    try {
      if (!isTop && !job.onlyFill) return;
      job.shippingMethod = methodOf(job);
      job.storeBrand = methodInfo(job).brand || "seven";
      job.checkoutMode = modeOf(job);
      job.pollSec = pollSecOf(job);
      startAlertWatch();
      await setJob({ ...job, active: true, status: "running", updatedAt: Date.now() });
      await logStep("run", `method=${job.shippingMethod} mode=${job.checkoutMode} poll=${job.pollSec}s`);
      if (FunboxCart.isLoginPage()) {
        await fail("請先登入 Funbox 會員，購物車與結帳頁都需要登入。");
        return;
      }
      if (job.onlyFill) {
        await fillWhenReady(job);
        return;
      }
      if (!isTop) return;
      const result = await addAndOpenCheckout(job);
      if (result.navigated || result.watching) return;
      await fillWhenReady(job);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      await fail(message);
    }
  }

  async function resumeOrAbandonWatch() {
    if (!isTop) return;
    const watch = ((await chrome.storage.local.get("funboxHelperWatch")).funboxHelperWatch) || {};
    if (!watch.active) return;
    const planned = watch.plannedReload && Date.now() - Number(watch.plannedReloadAt || 0) < RELOAD_RESUME_MS;
    if (!planned) {
      await chrome.storage.local.set({
        funboxHelperWatch: { ...watch, active: false, nextTickAt: 0, plannedReload: false, plannedReloadAt: 0, updatedAt: Date.now() },
      });
      return;
    }
    await setWatchState({ plannedReload: false, plannedReloadAt: 0 });
    watchStop = false;
    watchTickCount = Number(watch.tickCount || 0);
    const stored = await storedJob(false);
    const job = {
      ...stored,
      productUrl: watch.productUrl || location.href,
      variantId: watch.variantId || stored.variantId,
      listingSeenHandles: watch.listingSeenHandles || [],
      listingType: watch.listingType,
      listingPath: watch.listingPath,
      pollSec: watch.intervalSec || stored.pollSec,
    };
    showStopWatchButton();
    scheduleWatchReload();
    await logStep("watch_resume", `頁面已重整以維持登入 · 已查 ${watchTickCount} 次 · 繼續偵測`);
    await setJob({
      ...job,
      active: true,
      status: "watching",
      message: "監看中（頁面已重整以維持登入）。補貨靠 API 偵測。",
      updatedAt: Date.now(),
    });
    await watchTick(job);
  }

  async function resumeIfNeeded() {
    const job = await getJob();
    if (!job || !job.active) return;
    if (FunboxProduct.isListingPage() || FunboxProduct.isProductPage()) return;
    if (job.status === "checkout" || job.status === "running") {
      if (FunboxCart.isCheckoutPage() || FunboxCart.isCartPage() || FunboxCart.isLoginPage() || FunboxCart.isCheckoutClosed() || FunboxFill.checkoutLooksReady()) {
        await fillWhenReady(job);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "RUN") return;
    run(message.job || {}).then(() => sendResponse({ ok: true })).catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  });

  async function storedJob(onlyFill) {
    const stored = await chrome.storage.local.get([
      "funboxHelperProfile",
      "funboxHelperQuantity",
      "funboxHelperStoreBrand",
      "funboxHelperCheckoutMode",
      "funboxHelperShippingMethod",
      "funboxHelperPollSec",
      "funboxHelperWatchIfOos",
      "funboxHelperCheckoutEntry",
    ]);
    return {
      productUrl: location.href,
      quantity: stored.funboxHelperQuantity || 1,
      profile: stored.funboxHelperProfile || {},
      storeBrand: stored.funboxHelperStoreBrand || "seven",
      shippingMethod: stored.funboxHelperShippingMethod === "home_cod" ? "home" : stored.funboxHelperShippingMethod || "",
      checkoutMode: stored.funboxHelperCheckoutMode || "stop",
      checkoutEntry: stored.funboxHelperCheckoutEntry || "api",
      pollSec: stored.funboxHelperPollSec || 10,
      watchIfOos: stored.funboxHelperWatchIfOos !== false,
      onlyFill,
    };
  }

  async function startFromPage(onlyFill) {
    await run(await storedJob(onlyFill));
  }

  FunboxGuard.install();
  startAlertWatch();
  resumeOrAbandonWatch();
  resumeIfNeeded();

  if (isTop && FunboxOverlay.removeWatchButton) FunboxOverlay.removeWatchButton();

  if (isTop && FunboxProduct.isProductPage()) {
    FunboxOverlay.addProductButton(() => startFromPage(false));
    if (FunboxCart.looksLoggedOut()) {
      FunboxOverlay.show("請先登入 Funbox", "購物車與結帳頁都需要會員。登入後再按右下角按鈕。", "error");
    }
  }

  if (isTop && FunboxCart.isCheckoutPage() && !FunboxCart.isCheckoutClosed()) {
    FunboxOverlay.addCheckoutButton(() => startFromPage(true));
  }
})();
