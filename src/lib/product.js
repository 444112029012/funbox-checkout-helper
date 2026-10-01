(function (root) {
  const ORIGIN = "https://shop.funbox.com.tw";
  const POLL_SECS = [3, 5, 10, 15, 30];

  function normalizePollSec(value) {
    const n = Number(value);
    return POLL_SECS.includes(n) ? n : 10;
  }

  function isFunboxUrl(text) {
    const raw = String(text || "");
    if (!raw || !/https?:\/\//i.test(raw)) return true;
    return /shop\.funbox\.com\.tw/i.test(raw);
  }

  function isVariantInStock(variant) {
    if (!variant) return false;
    if (variant.available === false) return false;
    const qty = Number(variant.inventory_quantity);
    if (Number.isFinite(qty)) return qty > 0;
    if (variant.available === true) return true;
    return String(variant.inventory_policy || "").toLowerCase() === "continue";
  }

  function parseHandle(url) {
    const text = String(url || "");
    const match = text.match(/\/products\/([A-Za-z0-9_-]+)/i);
    if (!match) return "";
    if (!isFunboxUrl(text)) return "";
    return match[1].replace(/\.json$/i, "");
  }

  function parseTarget(url) {
    const text = String(url || "");
    if (text && !isFunboxUrl(text)) return { kind: "unknown" };
    const product = text.match(/\/products\/([A-Za-z0-9_-]+)/i);
    if (product) {
      return { kind: "product", handle: product[1].replace(/\.json$/i, "") };
    }
    const listing = text.match(/\/(categories|collections)\/([^?#]+)/i);
    if (listing) {
      const listingPath = listing[2].replace(/\/+$/, "").replace(/\.json$/i, "");
      if (!listingPath) return { kind: "unknown" };
      return {
        kind: "listing",
        listingType: listing[1].toLowerCase(),
        listingPath,
      };
    }
    return { kind: "unknown" };
  }

  function productJsonUrl(handle) {
    return `${ORIGIN}/products/${handle}.json`;
  }

  function listingJsonUrl(target) {
    if (!target || target.kind !== "listing") return "";
    return `${ORIGIN}/${target.listingType}/${target.listingPath}.json`;
  }

  function pickVariant(product, preferredId) {
    const variants = (product && product.variants) || [];
    if (!variants.length) return null;
    if (preferredId) {
      const wanted = String(preferredId);
      const hit = variants.find((v) => String(v.id) === wanted || String(v.sku) === wanted);
      if (hit) return hit;
    }
    const inStock = variants.find((v) => isVariantInStock(v));
    return inStock || variants[0];
  }

  async function loadProduct(handle) {
    const res = await fetch(productJsonUrl(handle), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`讀取商品失敗 HTTP ${res.status}`);
    const data = await res.json();
    return data.product || data;
  }

  async function loadListing(target) {
    const href = listingJsonUrl(target);
    if (!href) throw new Error("找不到分類／系列網址（需要 /categories/... 或 /collections/...）");
    const res = await fetch(href, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`讀取分類失敗 HTTP ${res.status}`);
    return res.json();
  }

  function isAppRedemption(item, handleHint) {
    const handle = String(
      handleHint || handleFromListingItem(item) || (item && item.handle) || ""
    ).replace(/\.json$/i, "");
    const tags = item && Array.isArray(item.tags) ? item.tags.join(" ") : String((item && item.tags) || "");
    const blob = `${(item && item.title) || ""} ${(item && item.brief) || ""} ${(item && item.slogan) || ""} ${tags} ${handle}`;
    if (/APP\s*兌換/i.test(blob)) return true;
    if (/^bbpr/i.test(handle)) return true;
    return false;
  }

  function handleFromListingItem(item) {
    if (!item) return "";
    const fromUrl = parseHandle(item.url || "");
    if (fromUrl) return fromUrl;
    if (item.handle) {
      const h = String(item.handle).replace(/\.json$/i, "");
      if (h && !/[\\/]/.test(h)) return h;
    }
    return "";
  }

  function normalizeListing(data) {
    const arr = Array.isArray(data) ? data : (data && (data.products || data.items)) || [];
    return arr
      .map((item) => {
        const handle = handleFromListingItem(item);
        const variants = item.variants || [];
        const ignored = isAppRedemption({ ...item, handle });
        const inStock = ignored
          ? false
          : variants.length
            ? variants.some((v) => isVariantInStock(v))
            : item.available === true;
        return {
          handle,
          title: item.title || handle,
          url: item.url || (handle ? `/products/${handle}` : ""),
          variants,
          inStock,
          ignored,
        };
      })
      .filter((row) => row.handle);
  }

  function findNewInStock(items, seenHandles) {
    const seen = new Set((seenHandles || []).map((h) => String(h).toLowerCase()));
    return (items || []).find((row) => row.inStock && row.handle && !row.ignored && !seen.has(String(row.handle).toLowerCase())) || null;
  }

  function stockKey(handle) {
    return String(handle || "").toLowerCase();
  }

  function listingStockMap(items) {
    const map = {};
    for (const row of items || []) {
      if (!row.handle) continue;
      map[stockKey(row.handle)] = Boolean(row.inStock);
    }
    return map;
  }

  function findPurchasable(items, stockMap) {
    const map = stockMap || {};
    return (items || []).find((row) => row.handle && !row.ignored && row.inStock && map[stockKey(row.handle)] !== true) || null;
  }

  function markListingOutOfStock(stockMap, handle) {
    return { ...(stockMap || {}), [stockKey(handle)]: false };
  }

  function mergeListingStock(stockMap, items) {
    const map = { ...(stockMap || {}) };
    for (const row of items || []) {
      if (!row.handle) continue;
      if (!row.inStock) map[stockKey(row.handle)] = false;
    }
    return map;
  }

  function variantInventoryCap(variant) {
    if (!variant) return null;
    const policy = String(variant.inventory_policy || "").toLowerCase();
    if (policy === "continue") return null;
    const qty = Number(variant.inventory_quantity);
    if (!Number.isFinite(qty) || qty < 0) return null;
    return qty;
  }

  function readPageBuyLimit() {
    if (typeof document === "undefined" || !document) return null;
    const caps = [];
    const body = (document.body && document.body.innerText) || "";
    const patterns = [/限購\s*(\d+)/, /最多購買\s*(\d+)/, /單筆[上最]限\s*(\d+)/, /每次限購\s*(\d+)/, /購買上限\s*(\d+)/];
    for (const re of patterns) {
      const match = body.match(re);
      if (match) caps.push(Number(match[1]));
    }
    document.querySelectorAll("input[name=quantity], input.item-quantity").forEach((el) => {
      const max = Number(el.getAttribute("max"));
      if (Number.isFinite(max) && max > 0) caps.push(max);
    });
    document.querySelectorAll("[data-max-quantity], [data-quantity-max]").forEach((el) => {
      const n = Number(el.getAttribute("data-max-quantity") || el.getAttribute("data-quantity-max"));
      if (Number.isFinite(n) && n > 0) caps.push(n);
    });
    const selected = document.querySelector("option[selected][data-quantity], option:checked[data-quantity]");
    if (selected) {
      const n = Number(selected.getAttribute("data-quantity") || (selected.dataset && selected.dataset.quantity));
      if (Number.isFinite(n) && n > 0) caps.push(n);
    }
    return caps.length ? Math.min(...caps.filter((n) => Number.isFinite(n) && n > 0)) : null;
  }

  function clampQuantity(wanted, variant, extra) {
    const asked = Math.max(1, Number(wanted) || 1);
    const caps = [];
    const inv = variantInventoryCap(variant);
    if (inv !== null) caps.push(inv);
    const pageLimit = extra && Object.prototype.hasOwnProperty.call(extra, "pageLimit") ? extra.pageLimit : readPageBuyLimit();
    if (pageLimit != null && Number(pageLimit) > 0) caps.push(Number(pageLimit));
    if (extra && extra.cap != null && Number(extra.cap) > 0) caps.push(Number(extra.cap));
    if (!caps.length) return { quantity: asked, adjusted: false, cap: null, asked };
    const cap = Math.min(...caps);
    if (!Number.isFinite(cap) || cap < 1) return { quantity: 0, adjusted: true, cap, asked };
    const quantity = Math.min(asked, cap);
    return { quantity, adjusted: quantity !== asked, cap, asked };
  }

  function isProductPage() {
    return /\/products\/[A-Za-z0-9_-]+/i.test(location.pathname);
  }

  function isListingPage() {
    return /\/(categories|collections)\//i.test(location.pathname);
  }

  function productPageUrl(handle) {
    return `${ORIGIN}/products/${handle}`;
  }

  root.FunboxProduct = {
    ORIGIN,
    POLL_SECS,
    parseHandle,
    parseTarget,
    productJsonUrl,
    listingJsonUrl,
    productPageUrl,
    pickVariant,
    loadProduct,
    loadListing,
    normalizeListing,
    findNewInStock,
    listingStockMap,
    findPurchasable,
    markListingOutOfStock,
    mergeListingStock,
    handleFromListingItem,
    isAppRedemption,
    isProductPage,
    isListingPage,
    isVariantInStock,
    normalizePollSec,
    variantInventoryCap,
    readPageBuyLimit,
    clampQuantity,
  };
})(globalThis);
