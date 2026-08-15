# DESIGN.md — Aidan

Aidan is a Turkish personal-assistant PWA (tasks, focus timer, nutrition, sleep, training).
Single-user product UI, mobile-first, used daily by a 16-year-old with ADHD.
Design priority: **calm, scannable, number-forward**. Never decorative.

---

## Theme

Dark only. There is no light mode.

The background is **warm charcoal, not blue-black**. This is deliberate — the previous
blue-black + amber combination read as "generic dev tool / crypto dashboard" and was replaced.

## Color tokens

Use these exact values. Do not substitute, tint, or "improve" them.

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#121211` | Page background |
| `--surface` | `#1e1c1a` | Cards, sheets |
| `--surface-raised` | `#24211d` | Elevated / selected rows |
| `--surface-input` | `#2c2823` | Input fields, wells |
| `--border` | `#3a352e` | All 1px borders |

### Action
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#e08a63` | Terracotta. Primary buttons, selected state, active tab |
| `--accent-hover` | `#eda07c` | Hover only |
| `--on-accent` | `#2a1408` | Text/icons **on** accent fills — dark, **never white** |

Accent is reserved for **action, selection, and state**. It is never used for decoration,
never for large fills, never for headings.

### Semantic
| Token | Hex | Meaning |
|---|---|---|
| `--warning` | `#e0a83c` | Warning / caution only |
| `--success` | `#5cbf7a` | Positive |
| `--danger` | `#ea5a52` | Destructive, error |
| `--info` | `#6fa8e8` | Neutral information |

> **Hard rule: one colour carries one meaning.**
> Action (`#e08a63`) and warning (`#e0a83c`) used to be the *same* hex. "Press me" and
> "be careful" were visually indistinguishable, and the user had to learn one colour with two
> meanings. They are now separate and must stay separate.

### Text
| Token | Hex | Use |
|---|---|---|
| `--text-strong` | `#f5f3ee` | Headings, key numbers |
| `--text` | `#e5e1d9` | Body |
| `--text-muted` | `#9a9389` | Labels, units, secondary |
| `--text-faint` | `#857e74` | Timestamps, hints |

Pure `#000` and `#fff` are never used. Every colour is slightly warmed.
Minimum contrast: WCAG AA — 4.5:1 body, 3:1 large text. Never grey text on a coloured fill.

---

## Typography

**One family only: Onest** (weights 400–800). No second family. No display font in UI labels,
buttons, or data. Hierarchy comes from size + weight + colour tone — never from a different typeface.

```css
body { font-variant-numeric: tabular-nums; }
```
Roughly half of every screen is numbers (kcal, kg, sets, grams, prices, scores). Misaligned
digits are the single loudest "amateur" signal in this product. Tabular numerals are mandatory
everywhere numbers appear.

Numbers are the hero. In any row that contains a value, the value is the largest and boldest
element in that row; its label is muted and smaller.

---

## Layout

- 8pt spacing grid. Vary the rhythm — do not use one uniform gap everywhere.
- Card radius **12–16px**. Never 20px+, never pill-shaped cards.
- **No nested cards.** A card inside a card is a failure of hierarchy.
- Do not centre things by default. Left-align text and labels; right-align numeric values.
- Information-dense is fine. Cramped is not.

---

## Motion

- `ease-out` (quart / quint / expo), **150–250ms**.
- No bounce, no elastic, no spring.
- Motion must communicate state change, never decorate.
- Every animation needs a `prefers-reduced-motion` alternative.

---

## Absolute prohibitions

These are not preferences. Output containing any of them is rejected.

1. **No coloured left/right border stripes** on cards, list items, callouts, or toasts.
   Use a full 1px border + a subtle background tint + a leading dot or icon instead.
2. No gradients — especially no purple/violet/neon gradients.
3. No glassmorphism, no `backdrop-filter: blur`, no frosted panels.
4. No glow, no drop-shadow used as decoration, no gradient text.
5. No custom scrollbars, no reinvented form controls.
6. No emoji in the UI. Use line icons (Lucide/Tabler style, 1.5–2px stroke).
7. Do not reach for a modal first — prefer inline / progressive disclosure.
8. No ghost cards: a 1px border and a ≥16px shadow never appear on the same element.
9. Fonts: no Inter, no Roboto, no Arial, no system-default stack.

---

## Voice

All user-facing copy is **Turkish**, lowercase-leaning, short, and non-judgemental.
The user has ADHD: no shaming language, no streak pressure, no long paragraphs.
Prefer "ertele" over "başarısız", "kaldığın yerden" over "geciken".

---

## Technical constraints for generated code

The app is vanilla HTML + a single CSS file, served under a strict Content-Security-Policy
(`script-src 'self'`). There is no build step and no bundler.

- **No Tailwind.** No `<script src="https://cdn.tailwindcss.com">`. It is blocked by CSP and
  the screen will render completely unstyled.
- No external scripts, no CDN links, no `@import`, no webfont imports (Onest is already loaded
  by the host page).
- Plain semantic HTML + vanilla CSS in one `<style>` block.
- **Prefix every class name** with a feature prefix (e.g. `dt-` for the diet/nutrition feature):
  `dt-sheet`, `dt-tab`, `dt-food-row`, `dt-macro-value`.
  Generic names — `card`, `btn`, `header`, `row`, `modal`, `input`, `chip` — will collide with an
  existing ~4900-line stylesheet and silently break unrelated screens.
- Wrap each screen in one root element and scope all selectors under it.
