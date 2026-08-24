(function (root) {
  const D = root.FunboxDom;

  const FIELD_RULES = [
    { key: "email", re: /電子?郵件|e-?mail|信箱/i, extra: (el) => (el.type || "").toLowerCase() === "email" },
    { key: "phone", re: /手機|電話|連絡電話|聯絡電話|mobile|tel/i },
    { key: "zip", re: /郵遞區號|郵區|zip|postal/i },
    { key: "address", re: /詳細地址|街道地址|地址|路名/i },
    { key: "city", re: /縣市|城市|city/i },
    { key: "district", re: /鄉鎮|市區|區域|地區|區鄉鎮/i },
    { key: "note", re: /備註|備注|note|留言/i },
    { key: "name", re: /姓名|名稱|name/i },
  ];

  function deepQuery(selector, root) {
    const out = [];
    const walk = (node) => {
      if (!node || !node.querySelectorAll) return;
      out.push(...node.querySelectorAll(selector));
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    };
    walk(root || document);
    return out;
  }

  function controls() {
    return deepQuery("input, select, textarea").filter((el) => {
      if (!D.visible(el)) return false;
      const type = (el.type || "").toLowerCase();
      return !["hidden", "submit", "button", "image", "file", "reset"].includes(type);
    });
  }

  function classify(el) {
    const blob = `${D.labelText(el)} ${el.name || ""} ${el.id || ""} ${el.className || ""}`;
    for (const rule of FIELD_RULES) {
      if (rule.re.test(blob) || (rule.extra && rule.extra(el))) return rule.key;
    }
    return "";
  }

  function named(el, patterns) {
    const blob = `${el.name || ""} ${el.id || ""}`.toLowerCase();
    return patterns.some((p) => blob.includes(p));
  }

  function fillControl(el, value) {
    if (value == null || value === "") return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "select") {
      const next = D.optionValue(el, value);
      if (!next) return false;
      D.setNativeValue(el, next);
      return true;
    }
    D.setNativeValue(el, String(value));
    return true;
  }

  function clickChoice(patterns) {
    const nodes = deepQuery("label, button, [role='radio'], [role='option'], li, span, div");
    for (const node of nodes) {
      if (!D.visible(node)) continue;
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 80) continue;
      if (!patterns.some((re) => re.test(text))) continue;
      if (D.SUBMIT_RE.test(text) || /立即結帳/.test(text)) continue;
      const input = node.control || node.querySelector("input[type=radio], input[type=checkbox]");
      if (input) {
        if (!input.checked) D.click(input);
        return text;
      }
      D.click(node);
      return text;
    }
    return "";
  }

  async function pickDropdown(labelRe, wanted) {
    if (!wanted) return false;
    const want = D.normalizeTw(wanted);
    const hosts = deepQuery("[role='combobox'], .el-select, .ant-select, .v-select");
    const host = hosts.find((el) => {
      if (!D.visible(el)) return false;
      const blob = `${D.labelText(el)} ${(el.closest("label, .el-form-item, .ant-form-item, .form-item") || el).innerText || ""}`;
      return labelRe.test(blob);
    });
    if (!host) return false;
    D.click(host.querySelector("input, .el-input, .ant-select-selector") || host);
    const option = await D.waitFor(() => {
      const items = deepQuery("[role='option'], .el-select-dropdown__item, .ant-select-item, li");
      return items.find((item) => D.visible(item) && D.normalizeTw(item.innerText || "").includes(want));
    }, 2500, 80);
    if (!option) return false;
    D.click(option);
    return true;
  }

  function uncheckSameRecipientIfNeeded(profile) {
    const same = !profile.recipientName || profile.recipientName === profile.name;
    if (same && (!profile.recipientPhone || profile.recipientPhone === profile.phone)) return;
    const nodes = deepQuery("label, span, div");
    for (const node of nodes) {
      const text = (node.innerText || "").replace(/\s+/g, "");
      if (/同購買人|與購買人相同|收件人同/.test(text) && text.length < 30) {
        const input =
          node.control ||
          node.querySelector("input[type=checkbox]") ||
          (node.closest("label") && node.closest("label").querySelector("input"));
        if (input && input.checked) D.click(input);
        return;
      }
    }
  }

  async function fillCityDistrict(profile) {
    const selects = deepQuery("select").filter(D.visible);
    const cityEl = selects.find((el) => classify(el) === "city") || selects.find((el) => named(el, ["city", "county", "province"]));
    const distEl =
      selects.find((el) => classify(el) === "district") ||
      selects.find((el) => named(el, ["district", "area", "town", "region"]));
    if (cityEl && profile.city) {
      fillControl(cityEl, profile.city);
      await D.waitFor(() => distEl && distEl.options && distEl.options.length > 1, 4000, 150);
    } else if (profile.city) {
      await pickDropdown(/縣市|城市|city/i, profile.city);
    }
    if (distEl && profile.district) fillControl(distEl, profile.district);
    else if (profile.district) await pickDropdown(/鄉鎮|市區|區域|地區/i, profile.district);
  }

  const SENSITIVE_RE = /password|passwd|credit|cardnumber|card_number|cvv|cvc|cyberbizpay/i;
  const SHIPPING_METHODS = [
    {
      id: "seven_cod",
      tab: "超商",
      title: "7-11 貨到付款",
      label: "7-11 貨到付款",
      group: "cvs",
      brand: "seven",
      autoSubmit: true,
      needsStore: true,
      prepaid: false,
      storeIdAttr: "seven_store_id",
    },
    {
      id: "family_cod",
      tab: "超商",
      title: "全家貨到付款",
      label: "全家貨到付款",
      group: "cvs",
      brand: "family",
      autoSubmit: true,
      needsStore: true,
      prepaid: false,
      storeIdAttr: "family_store_id",
    },
    {
      id: "seven_prepaid",
      tab: "超商",
      title: "7-11 取貨(先付款)",
      label: "7-11 取貨（先付款）",
      titleAlts: ["7-11 取貨(先付款)", "7-11取貨(先付款)"],
      group: "cvs",
      brand: "seven",
      autoSubmit: false,
      needsStore: true,
      prepaid: true,
      storeIdAttr: "seven_store_id",
    },
    {
      id: "family_prepaid",
      tab: "超商",
      title: "全家取貨(先付款)",
      label: "全家取貨（先付款）",
      titleAlts: ["全家取貨(先付款)", "全家 取貨(先付款)"],
      group: "cvs",
      brand: "family",
      autoSubmit: false,
      needsStore: true,
      prepaid: true,
      storeIdAttr: "family_store_id",
    },
    {
      id: "home",
      tab: "宅配",
      title: "一般宅配",
      label: "一般宅配",
      titleAlts: ["一般宅配", "宅配"],
      group: "home",
      autoSubmit: false,
      needsStore: false,
      prepaid: true,
    },
  ];

  function getMethod(id) {
    return SHIPPING_METHODS.find((item) => item.id === id) || SHIPPING_METHODS[0];
  }

  function normalizeMethodId(job) {
    let id = job && job.shippingMethod;
    if (id === "home_cod") id = "home";
    if (id && SHIPPING_METHODS.some((item) => item.id === id)) return id;
    if (job && job.storeBrand === "family") return "family_cod";
    return "seven_cod";
  }

  function brandInfo(brand) {
    return getMethod(brand === "family" ? "family_cod" : "seven_cod");
  }

  function dumpFields() {
    return controls().map((el) => {
      const blob = `${el.name || ""} ${el.id || ""} ${el.type || ""}`;
      const secret = SENSITIVE_RE.test(blob);
      const key = classify(el);
      const personal = key === "name" || key === "email" || key === "phone" || key === "address";
      return {
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        key,
        label: D.labelText(el).slice(0, 80),
        value: secret || personal ? "[redacted]" : String(el.value || "").slice(0, 40),
      };
    });
  }

  function identityKey(el) {
    let key = classify(el);
    if (key) return key;
    if (named(el, ["customer_email", "email"])) return "email";
    if (named(el, ["customer_phone", "customer_tel", "mobile", "phone", "billing_address_attributes][phone"])) return "phone";
    if (named(el, ["customer_name", "full_name", "billing_address_attributes][name"])) return "name";
    return "";
  }

  function identityLooksFilled() {
    const seen = { name: "", email: "", phone: "" };
    for (const el of controls()) {
      const key = identityKey(el);
      if ((key === "name" || key === "email" || key === "phone") && !seen[key]) {
        seen[key] = String(el.value || "").trim();
      }
    }
    const hasName = seen.name.length >= 2;
    const hasContact = seen.phone.replace(/\D/g, "").length >= 8 || /@/.test(seen.email);
    return {
      filled: hasName && hasContact,
      name: Boolean(seen.name),
      email: Boolean(seen.email),
      phone: Boolean(seen.phone),
    };
  }

  function hasIdentityProfile(profile) {
    const p = profile || {};
    return Boolean(String(p.name || "").trim() || String(p.email || "").trim() || String(p.phone || "").trim());
  }

  async function fillMinimumIdentity(profile) {
    const filled = {};
    const names = [];
    const phones = [];
    for (const el of controls()) {
      const key = identityKey(el);
      if (key === "name") names.push(el);
      else if (key === "phone") phones.push(el);
      else if (key === "email" && profile.email && !String(el.value || "").trim()) {
        if (fillControl(el, profile.email)) filled.email = true;
      }
    }
    const nameEl = names.find((el) => !String(el.value || "").trim()) || null;
    const phoneEl = phones.find((el) => !String(el.value || "").trim()) || null;
    if (nameEl && fillControl(nameEl, profile.name)) filled.name = true;
    if (phoneEl && fillControl(phoneEl, profile.phone)) filled.phone = true;
    return filled;
  }

  async function fillProfile(profile, options) {
    const filled = {};
    const methodId = (options && options.shippingMethod) || normalizeMethodId(options || {});
    const method = getMethod(methodId);
    const fillPersonal = Boolean(options && options.fillPersonal);
    const fillIfEmpty = !options || options.fillIfEmpty !== false;
    const skipIdentityFill = Boolean(options && options.skipIdentityFill);
    const auto =
      options && typeof options.funboxAutoFilled === "boolean"
        ? { filled: options.funboxAutoFilled, name: options.funboxAutoFilled, email: options.funboxAutoFilled, phone: options.funboxAutoFilled }
        : identityLooksFilled();
    filled.funboxAutoFilled = auto.filled;
    filled.identityDetected = auto;
    if (!skipIdentityFill && !auto.filled && (fillPersonal || fillIfEmpty) && hasIdentityProfile(profile)) {
      const wrote = await fillMinimumIdentity(profile || {});
      Object.assign(filled, wrote);
      filled.helperFilledPersonal = Boolean(wrote.name || wrote.email || wrote.phone);
    } else {
      filled.helperFilledPersonal = false;
    }
    const ship = await selectShipping(method.id);
    Object.assign(filled, ship);
    filled.filledPersonal = Boolean(filled.helperFilledPersonal);
    filled.dump = dumpFields();
    return filled;
  }

  function clickTab(label) {
    if (label === "超商") {
      const cvs = document.querySelector("#cvs-shipping-tab");
      if (cvs) {
        D.click(cvs);
        return true;
      }
    }
    if (label === "宅配") {
      const home = document.querySelector("#homeDelivery-shipping-tab");
      if (home) {
        D.click(home);
        return true;
      }
    }
    const tabs = deepQuery("#cvs-shipping-tab, #homeDelivery-shipping-tab, [role='tab'], .tab, a.tab");
    const tab = tabs.find((el) => {
      if (!D.visible(el)) return false;
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      return text === label;
    });
    if (tab) D.click(tab);
    return Boolean(tab);
  }

  function normLabel(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split("已達")[0]
      .trim();
  }

  function titleLooksMixed(text) {
    const title = text || "";
    return /先付款/.test(title) && /貨到付款/.test(title);
  }

  function shippingTitleForButton(btn) {
    if (!btn) return "";
    const inBtn = btn.querySelector && btn.querySelector(".title");
    if (inBtn) {
      const title = normLabel(inBtn.innerText);
      if (title && !titleLooksMixed(title)) return title;
    }
    const own = normLabel(btn.innerText || btn.textContent || "");
    if (own && own.length <= 48 && !titleLooksMixed(own) && !/7-11.*7-11|全家.*全家/.test(own)) return own;
    const wrap = btn.closest && btn.closest(".grid-button");
    if (wrap) {
      const titles = [...wrap.querySelectorAll(".title")];
      const buttons = [...wrap.querySelectorAll("button")];
      if (titles.length === 1 && buttons.length <= 1) return normLabel(titles[0].innerText);
      const idx = buttons.indexOf(btn);
      if (idx >= 0 && titles[idx] && !titleLooksMixed(normLabel(titles[idx].innerText))) {
        return normLabel(titles[idx].innerText);
      }
      const near = titles.find((el) => btn.contains(el) || el.nextElementSibling === btn || el.previousElementSibling === btn);
      if (near) return normLabel(near.innerText);
    }
    return own;
  }

  function cardTitle(el) {
    if (!el) return "";
    if ((el.tagName || "").toLowerCase() === "button" || (el.id && /shipping-button/i.test(el.id))) {
      return shippingTitleForButton(el);
    }
    const title = el.querySelector && el.querySelector(".title");
    if (title) {
      const text = normLabel(title.innerText);
      if (text && !titleLooksMixed(text)) return text;
    }
    return shippingTitleForButton(el);
  }

  function isPrepaidLabel(text) {
    return /先付款/.test(text || "");
  }

  function isCodLabel(text) {
    return /貨到付款/.test(text || "") && !/先付款/.test(text || "");
  }

  function controlLooksDisabled(el) {
    if (!el) return true;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return true;
    const card = el.closest(".grid-button");
    if (card && /\bdisabled\b|\bunavailable\b/.test(card.className || "")) return true;
    const style = window.getComputedStyle(el);
    if (style.pointerEvents === "none") return true;
    const opacity = Number(style.opacity);
    if (Number.isFinite(opacity) && opacity > 0 && opacity < 0.45) return true;
    return false;
  }

  function titleFitsMethod(title, method) {
    if (!title || titleLooksMixed(title) || title.length > 80) return false;
    if (method.group === "cvs") {
      if (method.brand === "seven" && !/7-?11/.test(title)) return false;
      if (method.brand === "family" && !/全家/.test(title)) return false;
      if (method.prepaid) return isPrepaidLabel(title) && !isCodLabel(title);
      return isCodLabel(title);
    }
    if (method.id === "home") {
      return /一般宅配/.test(title) || (/宅配/.test(title) && !isCodLabel(title));
    }
    return title === method.title || title.startsWith(method.title);
  }

  function matchShippingButton(method) {
    const byId = deepQuery('[id^="cvs-shipping-button"], [id^="homeDelivery-shipping-button"]');
    const byGrid = deepQuery(".grid-button button.form-control, .grid-button button");
    const seen = new Set();
    const buttons = byId.concat(byGrid).filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      if (!D.visible(el)) return false;
      if (/payment-button/i.test(el.id || "")) return false;
      if (el.closest("[data-payment-name]")) return false;
      return true;
    });
    const scored = [];
    for (const btn of buttons) {
      const title = shippingTitleForButton(btn);
      if (!titleFitsMethod(title, method)) continue;
      const exact = title === method.title || (method.titleAlts || []).some((alt) => title === alt);
      scored.push({ btn, title, exact });
    }
    scored.sort((a, b) => Number(b.exact) - Number(a.exact));
    return scored[0] ? scored[0].btn : null;
  }

  function clickConfirmShipping() {
    const btn = deepQuery("button, a, input[type=button]").find((el) => {
      if (!D.visible(el)) return false;
      const text = (el.innerText || el.value || "").replace(/\s+/g, " ").trim();
      if (text !== "確認配送方式" && text !== "確認運送方式") return false;
      if (D.isSubmitControl(el) || /立即結帳|送出訂單/.test(text)) return false;
      return true;
    });
    if (!btn) return false;
    D.click(btn);
    return true;
  }

  function clickGridOption(exactTitle) {
    const methodish = {
      prepaid: /先付款/.test(exactTitle),
      title: exactTitle,
      group: /宅配/.test(exactTitle) ? "home" : "cvs",
      brand: /全家/.test(exactTitle) ? "family" : /7-?11/.test(exactTitle) ? "seven" : "",
      id: /一般宅配/.test(exactTitle) ? "home" : "",
    };
    const hit = matchShippingButton(methodish);
    if (!hit || controlLooksDisabled(hit)) return "";
    D.click(hit);
    return shippingTitleForButton(hit) || exactTitle;
  }

  async function selectShipping(methodId) {
    const method = getMethod(methodId);
    const wantCod = Boolean(method.autoSubmit && !method.prepaid);
    const result = {
      method: method.id,
      methodLabel: method.label || method.title,
      autoSubmit: Boolean(method.autoSubmit),
      storeReady: !method.needsStore,
    };
    if (method.tab === "超商") clickTab("超商");
    else if (method.tab === "宅配") clickTab("宅配");
    else if (method.tab) clickTab(method.tab);
    await D.waitFor(() => matchShippingButton(method), 8000, 120);
    const found = matchShippingButton(method);
    if (found && controlLooksDisabled(found)) {
      result.shippingMissing = true;
      result.shippingDisabled = true;
      result.unselectableReason = "disabled";
      result.shippingTitle = shippingTitleForButton(found);
      result.shippingButtonId = found.id || "";
    } else if (!found) {
      result.shippingMissing = true;
      result.unselectableReason = "not_found";
    } else {
      result.shippingButtonId = found.id || "";
      D.click(found);
      result.shipping = shippingTitleForButton(found) || method.title;
      await D.waitFor(() => {
        if (wantCod) return isCvsCodSelected(method.brand);
        const title = selectedShippingTitle();
        return titleFitsMethod(title, method) || shippingRateValue();
      }, 2500, 80);
    }
    result.shippingRate = shippingRateValue();
    result.shippingTitle = selectedShippingTitle() || result.shippingTitle || result.shipping || "";
    result.codSelected = wantCod && isCvsCodSelected(method.brand);
    if (wantCod && !result.codSelected && found) {
      D.click(found);
      await D.waitFor(() => isCvsCodSelected(method.brand), 1800, 80);
      result.codSelected = isCvsCodSelected(method.brand);
      result.shippingRate = shippingRateValue();
      result.shippingTitle = selectedShippingTitle() || result.shipping || "";
    }
    if (result.shippingMissing) {
      const official =
        (root.FunboxAlerts && root.FunboxAlerts.findVolumeMessage && root.FunboxAlerts.findVolumeMessage()) ||
        (root.FunboxAlerts && root.FunboxAlerts.extractVolumeMessage
          ? root.FunboxAlerts.extractVolumeMessage((document.body && document.body.innerText) || "")
          : "");
      if (official) {
        result.cvsBlocked = true;
        result.volumeMessage = official;
      }
    }
    result.prepaid = Boolean(method.prepaid) || (wantCod ? false : isPrepaidOrGateway());
    result.wrongPrepaid = Boolean(
      wantCod &&
        !result.codSelected &&
        (isPrepaidLabel(result.shippingTitle || "") || /prepaid/i.test(result.shippingRate || ""))
    );
    if (found && !result.shippingMissing && !result.wrongPrepaid && (!wantCod || result.codSelected)) {
      result.confirmedShipping = clickConfirmShipping();
    } else {
      result.confirmedShipping = false;
    }
    if (!method.needsStore) return result;
    if (wantCod && !result.codSelected) {
      result.storeReady = false;
      return result;
    }
    const store = selectedCvsStore(method.brand);
    if (store) {
      result.store = store.name || store.id;
      result.storeReady = true;
      return result;
    }
    const picker = await openStorePicker();
    Object.assign(result, picker);
    result.storeReady = false;
    return result;
  }

  async function selectCvsCod(brand) {
    return selectShipping(brand === "family" ? "family_cod" : "seven_cod");
  }

  async function selectSevenElevenCod() {
    return selectShipping("seven_cod");
  }

  async function openStorePicker() {
    const existing = describeStorePicker();
    if (existing && (existing.storePickerIframe || existing.storePickerBlocked)) {
      return { storePickerOpened: true, ...existing };
    }
    const pick = document.querySelector("#cvs-pick-button");
    const result = { storePickerOpened: false };
    if (!pick || !D.visible(pick)) {
      result.storePickerMissing = true;
      const picker = describeStorePicker();
      if (picker) Object.assign(result, picker);
      return result;
    }
    const iframeCount = document.querySelectorAll("iframe").length;
    D.click(pick);
    result.storePickerOpened = true;
    await new Promise((r) => setTimeout(r, 700));
    const picker = describeStorePicker(iframeCount);
    if (picker) Object.assign(result, picker);
    return result;
  }

  function describeStorePicker(prevIframeCount) {
    const iframes = [...document.querySelectorAll("iframe")];
    const cvs = iframes.filter((frame) => {
      const blob = `${frame.src || ""} ${frame.id || ""} ${frame.name || ""} ${frame.className || ""}`;
      return /ezship|ecmap|ibon|famiport|presco|emap\.pcsc|seven-11|familymart/i.test(blob);
    });
    if (cvs.length) return { storePickerIframe: true, storePickerKind: "iframe" };
    if (typeof prevIframeCount === "number" && iframes.length > prevIframeCount) {
      return { storePickerIframe: true, storePickerKind: "iframe" };
    }
    const text = (document.body && document.body.innerText) || "";
    if (/彈出視窗|pop-?up|已被封鎖|無法開啟/.test(text) && /門市|超商|地圖/.test(text)) {
      return { storePickerBlocked: true, storePickerKind: "blocked" };
    }
    return null;
  }

  function selectedCvsStore(brand) {
    const chosen = brand === "family" ? "family" : "seven";
    const info = brandInfo(chosen);
    const name = document.querySelector('[name="order[shipping_address_attributes][store_name]"]');
    const id = document.querySelector(`[name="order[shipping_address_attributes][${info.storeIdAttr}]"]`);
    const rate = document.querySelector('[name="order[shipping_rate]"]');
    const rateVal = (rate && rate.value) || "";
    const rateOk = chosen === "family" ? /family/i.test(rateVal) : /seven/i.test(rateVal);
    const label = (document.body.innerText.match(/已選擇的門市[：:]\s*([^\n]+)/) || [])[1];
    const storeId = (id && id.value) || "";
    const storeName = (name && name.value) || "";
    if (/請選擇/.test(storeName) || /請選擇/.test(label || "")) {
      if (!storeId) return null;
    }
    if (storeId) return { name: storeName || (label && label.trim()) || storeId, id: storeId };
    if (storeName && !/請選擇/.test(storeName) && (!rateVal || rateOk)) {
      return { name: storeName, id: "" };
    }
    if (label && !/請選擇/.test(label) && rateOk) return { name: label.trim(), id: "" };
    return null;
  }

  function shippingRateValue() {
    const rate = document.querySelector('[name="order[shipping_rate]"]');
    return (rate && rate.value) || "";
  }

  function selectedShippingTitle() {
    const activeShip = [...document.querySelectorAll(".grid-button.active, .grid-button.selected")].find((el) => {
      return el.querySelector("[id*=shipping-button], .shipping-label");
    });
    if (activeShip) {
      const title = activeShip.querySelector(".title") || activeShip;
      return (title.innerText || "").replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function isPrepaidOrGateway() {
    const rate = shippingRateValue();
    if (/seven_cod|family_cod/i.test(rate)) return false;
    if (/prepaid/i.test(rate)) return true;
    if (/credit|line_?pay|atm|jko|neweb|cyberbizpay/i.test(rate)) return true;
    const title = selectedShippingTitle();
    if (isCodLabel(title)) return false;
    if (/先付款/.test(title)) return true;
    const iframe = document.querySelector(
      'iframe[src*="cyberbizpay"], iframe[id*="cyberbizpay"], iframe[name*="cyberbizpay"], #cyberbizpay-main-iframe'
    );
    if (iframe && D.visible(iframe)) return true;
    const payText = [...document.querySelectorAll("label, .payment, .grid-button.selected")].some((el) => {
      if (!D.visible(el)) return false;
      const text = (el.innerText || "").replace(/\s+/g, " ");
      return /信用卡|LINE\s*Pay|ATM|街口|先付款/.test(text) && (el.matches("label") ? el.querySelector("input:checked") : el.classList.contains("selected"));
    });
    return Boolean(payText);
  }

  function isCvsCodSelected(brand) {
    const rate = shippingRateValue();
    if (brand === "family") {
      if (/family_cod/i.test(rate)) return true;
      if (/family_prepaid/i.test(rate)) return false;
    } else {
      if (/seven_cod/i.test(rate)) return true;
      if (/seven_prepaid/i.test(rate)) return false;
    }
    if (isPrepaidOrGateway()) return false;
    const title = selectedShippingTitle() || "";
    const want = brand === "family" ? /全家/ : /7-?11/;
    return want.test(title) && isCodLabel(title);
  }

  function placeOrderButton() {
    return (
      [...document.querySelectorAll("button, a, [role=button], input[type=submit]")].find((el) => {
        return D.visible(el) && D.isSubmitControl(el);
      }) || null
    );
  }

  async function waitAndFill(profile, timeoutMs, options) {
    const deadline = Date.now() + (timeoutMs || 20000);
    let last = {};
    while (Date.now() < deadline) {
      if (checkoutLooksReady()) {
        const detected = identityLooksFilled();
        const opts = { ...(options || {}), funboxAutoFilled: detected.filled };
        last = await fillProfile(profile || {}, opts);
        const helperFilled = Boolean(last.helperFilledPersonal);
        await new Promise((r) => setTimeout(r, 350));
        last = await fillProfile(profile || {}, { ...opts, skipIdentityFill: true });
        last.funboxAutoFilled = detected.filled;
        last.helperFilledPersonal = helperFilled;
        last.filledPersonal = helperFilled;
        return last;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return last;
  }

  function checkoutLooksReady() {
    if (root.FunboxCart && root.FunboxCart.isCheckoutClosed()) return false;
    if (document.querySelector('[name="order[billing_address_attributes][name]"]')) return true;
    if (/\/carts\/[A-Za-z0-9]+/i.test(location.pathname) && /購買人資訊|7-11|全家/.test(document.body.innerText || "")) {
      return true;
    }
    const fields = controls();
    return fields.some((el) => {
      const key = classify(el);
      return key === "name" || key === "email" || key === "phone" || key === "address";
    });
  }

  root.FunboxFill = {
    fillProfile,
    waitAndFill,
    checkoutLooksReady,
    controls,
    classify,
    dumpFields,
    selectShipping,
    selectCvsCod,
    selectSevenElevenCod,
    selectedCvsStore,
    placeOrderButton,
    describeStorePicker,
    brandInfo,
    isPrepaidOrGateway,
    isCvsCodSelected,
    SHIPPING_METHODS,
    getMethod,
    normalizeMethodId,
    identityLooksFilled,
    hasIdentityProfile,
  };
})(globalThis);
