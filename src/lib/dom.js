(function (root) {
  const SUBMIT_RE =
    /送出訂單|成立訂單|確認送出|確認下單|完成訂單|立即付款|確認付款|結帳並付款|place\s*order|submit\s*order|pay\s*now/i;
  const CHECKOUT_NAV_RE = /立即結帳|前往結帳|去結帳|checkout/i;

  function normalizeTw(text) {
    return String(text || "")
      .replace(/台/g, "臺")
      .replace(/\s+/g, "")
      .trim();
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function labelText(el) {
    if (!el) return "";
    const bits = [];
    if (el.labels && el.labels.length) {
      bits.push([...el.labels].map((n) => n.innerText).join(" "));
    }
    bits.push(el.getAttribute("aria-label") || "");
    bits.push(el.getAttribute("placeholder") || "");
    bits.push(el.getAttribute("name") || "");
    bits.push(el.id || "");
    const wrap = el.closest("label, .form-group, .form-item, .ant-form-item, .el-form-item, li, tr, .field");
    if (wrap) bits.push((wrap.innerText || "").split("\n")[0]);
    const prev = el.previousElementSibling;
    if (prev) bits.push(prev.innerText || prev.textContent || "");
    return bits.join(" ").replace(/\s+/g, " ").trim();
  }

  function setNativeValue(el, value) {
    const tag = (el.tagName || "").toLowerCase();
    const proto =
      tag === "select"
        ? HTMLSelectElement.prototype
        : tag === "textarea"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  function optionValue(select, wanted) {
    const raw = String(wanted || "").trim();
    if (!raw) return "";
    const want = normalizeTw(raw);
    const options = [...select.options];
    const exact = options.find((o) => normalizeTw(o.text) === want || normalizeTw(o.value) === want);
    if (exact) return exact.value;
    const partial = options.find(
      (o) => normalizeTw(o.text).includes(want) || want.includes(normalizeTw(o.text))
    );
    return partial ? partial.value : "";
  }

  async function waitFor(fn, timeoutMs, stepMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    const step = stepMs || 200;
    let last;
    while (Date.now() < deadline) {
      last = fn();
      if (last) return last;
      await new Promise((r) => setTimeout(r, step));
    }
    return last || null;
  }

  function click(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.click();
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    return true;
  }

  function onCartsCheckout() {
    return /\/carts\/[A-Za-z0-9]+/i.test(location.pathname);
  }

  function isSubmitControl(el) {
    if (!el || !(el instanceof Element)) return false;
    const type = (el.getAttribute("type") || "").toLowerCase();
    const text = `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""}`;
    if (onCartsCheckout() && /立即結帳/.test(text)) return true;
    if (type === "submit" && (/立即結帳/.test(text) || SUBMIT_RE.test(text || "submit"))) return true;
    return SUBMIT_RE.test(text);
  }

  function isCheckoutNavControl(el) {
    if (!el || !(el instanceof Element)) return false;
    if (onCartsCheckout()) return false;
    const text = `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""}`;
    return CHECKOUT_NAV_RE.test(text) && !SUBMIT_RE.test(text);
  }

  root.FunboxDom = {
    SUBMIT_RE,
    CHECKOUT_NAV_RE,
    normalizeTw,
    visible,
    labelText,
    setNativeValue,
    optionValue,
    waitFor,
    click,
    isSubmitControl,
    isCheckoutNavControl,
  };
})(globalThis);
