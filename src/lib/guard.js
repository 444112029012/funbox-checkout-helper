(function (root) {
  const D = root.FunboxDom;
  const FLAG = "data-funbox-helper-guard";

  function onCheckout() {
    return root.FunboxCart && root.FunboxCart.isCheckoutPage();
  }

  function block(event) {
    const target = event.target instanceof Element ? event.target.closest("button, a, input, [role=button]") : null;
    if (!target) {
      if (event.type === "submit") {
        event.preventDefault();
        event.stopPropagation();
        if (root.FunboxOverlay) {
      root.FunboxOverlay.show("已攔截送出", "", "done");
        }
      }
      return;
    }
    if (!onCheckout()) return;
    if (D.isCheckoutNavControl(target)) return;
    if (!D.isSubmitControl(target) && event.type !== "submit") return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (root.FunboxOverlay) {
      root.FunboxOverlay.show("已攔截送出", "外掛不會送出訂單。欄位填好後請你自己按結帳。", "done");
    }
  }

  let allowSubmitOnce = false;

  function allowNextSubmit() {
    allowSubmitOnce = true;
  }

  function install() {
    if (document.documentElement.getAttribute(FLAG) === "1") return;
    document.documentElement.setAttribute(FLAG, "1");
    const opts = { capture: true };
    document.addEventListener(
      "click",
      (event) => {
        if (!onCheckout()) return;
        const target = event.target instanceof Element ? event.target.closest("button, a, input, [role=button]") : null;
        if (target && D.isSubmitControl(target) && event.isTrusted === false) {
          if (allowSubmitOnce) {
            allowSubmitOnce = false;
            return;
          }
          block(event);
        }
      },
      opts
    );
  }

  root.FunboxGuard = { install, block, allowNextSubmit };
})(globalThis);
