(function (root) {
  function itemMatches(item, variantId) {
    const id = String(variantId);
    return String(item.variant_id_int) === id || String(item.id || "").startsWith(`${id}_`);
  }

  async function readCart() {
    const res = await fetch("/cart.js", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`讀取購物車失敗 HTTP ${res.status}`);
    return res.json();
  }

  async function findInCart(variantId) {
    const cart = await readCart();
    return ((cart && cart.items) || []).find((item) => itemMatches(item, variantId)) || null;
  }

  async function addToCart(variantId, quantity) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: Number(variantId) || variantId,
        quantity: Number(quantity) || 1,
      }),
    });
    const text = await res.text();
    if (/繼續操作前請註冊或者登錄|會員登入/.test(text) && /login/i.test(text)) {
      throw new Error("加入購物車失敗：需要先登入 Funbox 會員");
    }
    if (!res.ok) {
      const existing = await findInCart(variantId);
      if (existing) return existing;
      if (res.status === 409 || /超出庫存|庫存不足/.test(text)) {
        throw new Error("加入購物車失敗：庫存不足（HTTP 409）");
      }
      throw new Error(`加入購物車失敗 HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      if (/<!doctype html/i.test(text) || /繼續操作前請註冊或者登錄/.test(text)) {
        throw new Error("加入購物車失敗：需要先登入 Funbox 會員");
      }
      return { raw: text };
    }
  }

  async function ensureInCart(variantId, quantity) {
    const existing = await findInCart(variantId);
    if (existing && Number(existing.quantity) >= (Number(quantity) || 1)) return existing;
    try {
      return await addToCart(variantId, quantity);
    } catch (err) {
      const again = await findInCart(variantId);
      if (again) return again;
      throw err;
    }
  }

  function isLoginPage() {
    if (/\/account\/login/i.test(location.pathname)) return true;
    const text = (document.body && document.body.innerText) || "";
    return /繼續操作前請註冊或者登錄|會員登入/.test(text) && /\/account\/login/i.test(location.href);
  }

  function isCheckoutClosed() {
    const title = document.title || "";
    const text = (document.body && document.body.innerText) || "";
    return /網站結帳功能已關閉/.test(title) || /結帳功能已關閉/.test(text);
  }

  function isCheckoutPage() {
    return (
      /\/checkout\/?$/i.test(location.pathname) ||
      /\/checkouts\//i.test(location.pathname) ||
      /\/carts\/[A-Za-z0-9]+/i.test(location.pathname)
    );
  }

  function isCartPage() {
    return /\/cart\/?$/i.test(location.pathname);
  }

  function looksLoggedOut() {
    if (isLoginPage()) return true;
    if (document.querySelector('a[href*="/account/logout"]')) return false;
    const text = (document.body && document.body.innerText) || "";
    return /繼續操作前請註冊或者登錄/.test(text);
  }

  function checkoutTokenFromText(text) {
    const match = String(text || "").match(/\/carts\/([A-Za-z0-9]{8,})/i);
    return match ? `/carts/${match[1]}` : "";
  }

  function checkoutUrlFromCart(cart) {
    if (!cart || typeof cart !== "object") return "";
    const token = cart.token || cart.cart_token || cart.checkout_token;
    if (token && /^[A-Za-z0-9]{8,}$/.test(String(token))) return `/carts/${token}`;
    const keys = ["checkout_url", "cart_url", "url", "checkout_path", "token_url"];
    for (const key of keys) {
      const hit = checkoutTokenFromText(cart[key]);
      if (hit) return hit;
    }
    return checkoutTokenFromText(JSON.stringify(cart));
  }

  async function findCheckoutUrl() {
    if (typeof location !== "undefined" && /\/carts\/[A-Za-z0-9]+/i.test(location.pathname)) {
      return `${location.pathname}${location.search || ""}`;
    }
    try {
      const cart = await readCart();
      const hit = checkoutUrlFromCart(cart);
      if (hit) return hit;
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/cart.json", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const hit = checkoutUrlFromCart(data);
        if (hit) return hit;
      }
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/cart", {
        credentials: "include",
        redirect: "follow",
        headers: { Accept: "text/html" },
      });
      const hit = checkoutTokenFromText(res.url) || checkoutTokenFromText(res.headers.get("Location") || "");
      if (hit) return hit;
      const html = await res.text();
      return checkoutTokenFromText(html);
    } catch {
      return "";
    }
  }

  function checkoutNavButton() {
    const D = root.FunboxDom;
    if (!D) return null;
    return [...document.querySelectorAll("a, button")].find((el) => D.visible(el) && D.isCheckoutNavControl(el)) || null;
  }

  function verifyExpectedItem(cart, expected) {
    const wantQty = Math.max(1, Number(expected && expected.quantity) || 1);
    const items = (cart && cart.items) || [];
    const match = items.find((item) => {
      if (expected.variantId && itemMatches(item, expected.variantId)) return true;
      if (expected.handle && String(item.handle || "").toLowerCase() === String(expected.handle).toLowerCase()) return true;
      return false;
    });
    if (!match) {
      return { ok: false, reason: `結帳明細沒有預期商品（${(expected && (expected.handle || expected.variantId)) || "unknown"}）`, items };
    }
    const got = Number(match.quantity);
    if (got !== wantQty) {
      return { ok: false, reason: `結帳數量不符（購物車 ${got}，預期 ${wantQty}）`, item: match, items };
    }
    if (expected.variantId && !itemMatches(match, expected.variantId)) {
      return { ok: false, reason: "結帳明細規格與加車 SKU 不符", item: match, items };
    }
    const extras = items.filter((item) => item !== match);
    if (extras.length) {
      return {
        ok: false,
        reason: `購物車還有其他商品（${extras.length} 件），停止自動結帳`,
        item: match,
        items,
        extra: true,
      };
    }
    return { ok: true, item: match, items };
  }

  function checkoutListLooksRight(expected) {
    const text = (document.body && document.body.innerText) || "";
    const title = expected && expected.title ? String(expected.title) : "";
    const handle = expected && expected.handle ? String(expected.handle) : "";
    if (title && text.includes(title.slice(0, Math.min(10, title.length)))) return true;
    if (handle && text.toLowerCase().includes(handle.toLowerCase())) return true;
    return !title && !handle;
  }

  root.FunboxCart = {
    addToCart,
    ensureInCart,
    readCart,
    findInCart,
    isLoginPage,
    isCheckoutClosed,
    isCheckoutPage,
    isCartPage,
    looksLoggedOut,
    checkoutNavButton,
    findCheckoutUrl,
    checkoutTokenFromText,
    checkoutUrlFromCart,
    verifyExpectedItem,
    checkoutListLooksRight,
  };
})(globalThis);
