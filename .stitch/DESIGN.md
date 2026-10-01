# Design System: Funbox 結帳助手
**Skill:** stitch-design-taste

---

## Configuration

| Dial | Level | Why |
|------|-------|-----|
| **Creativity** | `5` | 工具列設定面板，不是行銷頁。清楚、有性格，不做標題內嵌圖。 |
| **Density** | `8` | Chrome popup 固定 760×640，屬駕駛艙密度：分區清楚，不堆三欄等寬卡片。 |
| **Variance** | `4` | 軟體 UI。標題列不對稱（品牌左、免責右），內容用 1.2fr / 0.8fr，不要花式破版。 |
| **Motion Intent** | `4` | 按鈕按壓縮放、選取態、監看狀態點微脈動。禁止霓虹光暈與進場瀑布。 |

---

## 1. Visual Theme & Atmosphere

A cockpit-dense, trustworthy checkout console. Clinical like a well-lit workshop, not a SaaS landing page. Surfaces sit on warm zinc canvas; one navy accent marks the only primary action. Hierarchy comes from weight, placement, and selected chips — never from glow, emoji, or invented metrics.

## 2. Color Palette & Roles

- **Canvas Zinc** (#F4F4F5) — Popup background. Warm-neutral, not blue-gray.
- **Pure Surface** (#FFFFFF) — Panels, fields, log rows.
- **Charcoal Ink** (#18181B) — Titles and primary labels. Never `#000000`.
- **Steel Secondary** (#71717A) — Hints, metadata, body support.
- **Muted Slate** (#94A3B8) — Disabled, timestamps, tertiary.
- **Whisper Border** (rgba(226,232,240,0.72)) — 1px structure.
- **Harbor Navy** (#245C8F) — Sole accent. Saturation under 80%. Primary CTA, selected chip, focus ring, live watch dot.

Functional only (not a second brand accent):
- **Success Moss** (#047857) — Saved / watching confirmation.
- **Alert Rose** (#BE123C) — Validation and log errors.
- **Legal Amber** (#9A3412 on #FFF7ED) — Disclaimer surface.

## 3. Typography Rules

- **UI:** `"Segoe UI Variable", "Segoe UI", "Microsoft JhengHei UI", "Noto Sans TC", sans-serif` — Instant popup paint; no webfont round-trip. Not Inter.
- **Mono:** `"Cascadia Mono", "Consolas", ui-monospace, monospace` — Log times, poll interval, quantity.
- **Display:** 18px / 700 / tracking `-0.02em`. Compact for density 8.
- **Section:** 11px / 700 / `0.06em` uppercase-style labels in Steel, not shouting H1.
- **Body:** 13px / 1.5. Hints 12px / Steel.
- **Banned:** Inter, Georgia/Times, gradient headlines, `LABEL // YEAR`.

## 4. Component Stylings

- **Buttons:** Flat. One primary (Harbor Navy, white text). Ghost/outline for Save and Open-page. Active: `scale(0.98)`. Hover: 6% darker fill, no outer glow. Min height 40px.
- **Choice chips:** White + whisper border. Selected: 1px Harbor Navy + 8% navy tint. Disabled: 48% opacity, no pointer.
- **Panels:** Softly rounded (12px), white fill, whisper border, no 2.5rem cards (too large at this density). Padding 10–12px.
- **Inputs:** Label above. 8px radius. Focus: 2px Harbor ring, 2px offset. Error text below in Alert Rose.
- **Status:** Quiet strip under header. Live watch row uses a pulsing 8px Harbor dot.
- **Logs:** High-density list. Empty: centered Steel copy already written by JS (`尚無紀錄`). Error rows: rose tint, not neon.

## 5. Layout Principles

- **Window lock:** `html` min-width 760px, `body` width 760px, max-height 640px. Do not change the Chrome action popup size.
- **Header:** Asymmetric 1fr / auto. Brand + icon left; disclaimer chip right. Open disclaimer spans full width.
- **Command strip:** Status then actions. Primary CTA visually heavier (`1fr 1.7fr 1fr`), not three equal cards.
- **Workspace:** CSS Grid `1.2fr 0.8fr`. Left: URL, shipping, checkout. Right: donate, PII, logs.
- **No overlapping.** No 3-equal feature cards. No centered hero.

## 6. Motion & Interaction

- Interactive: `transform` / `opacity` only.
- Watch live dot: 1.6s ease-in-out pulse.
- No linear-only theatrical easing on the panel. No spinner. No custom cursor.

## 7. Anti-Patterns (Banned)

- No emojis, Inter, pure black, neon glow, purple gradients.
- No copy clichés (Elevate / Seamless / Unleash).
- No fabricated metrics.
- No changing `popup.js`, background, content, overlay placement, field `name`/`id`, or popup window size.
