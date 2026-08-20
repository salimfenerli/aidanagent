# DESIGN.md — Aidan

Aidan is a Turkish personal-assistant PWA (tasks, focus timer, nutrition, sleep, training).
Single-user product UI, mobile-first, used daily by a 16-year-old with ADHD.
Design priority: **calm, scannable, number-forward**. Never decorative.

---

## Theme

Dark only. There is no light mode.

The palette is **v11 MONOKROM** (styles.css, last `:root` — five exist, the last one wins).
The accent **carries no hue**: it is light grey. That is the whole idea — if the action colour
is neutral, the entire colour scale is left over for *meaning*: green = good, amber = careful,
red = bad. The earlier warm-charcoal + terracotta layer (v10 GECE) was deleted on 20 Aug 2026;
it defined the same 35 tokens v11 redefines, so it shipped to every user and painted nothing.

## Color tokens

Read the values from the last `:root` in `styles.css` — that file is the source of truth.
Never write a hex literal in JavaScript. `25-gorsel-dil.test.js` fails the build if you do.

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--bg-elev` | `#0e0e0e` | Folded sections, subtle wells |
| `--surface` | `#131313` | Cards, sheets |
| `--surface-mid` | `#1c1b1b` | Elevated / selected rows, auth panels |
| `--surface-high` | `#20201f` | Input fields |
| `--border` | `#333333` | All 1px borders |

### Action
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#e2e2e2` | Primary buttons, selected state, active tab |
| `--accent-hover` | `#f4f4f4` | Hover only |
| `--accent-soft` | `rgba(226,226,226,0.10)` | Tinted badge / chip background |
| `--on-accent` | `#2f3131` | Text/icons **on** accent fills — dark, **never white** |

Accent is reserved for **action, selection, and state**. Never decoration, never large fills,
never headings.

### Semantic
| Token | Hex | Meaning |
|---|---|---|
| `--warning` | `#e0a83c` | Warning / caution only |
| `--success` | `#5cbf7a` | Positive |
| `--danger` | `#ff4444` | Destructive, error |
| `--info` | `#6fa8e8` | Neutral information |

Each has a `-soft` rgba twin (`--danger-soft`, …) for tinted badge backgrounds. Use the twin —
a filled semantic block with light text is the pattern the auth screen used, and it was wrong.

> **Hard rule: one colour carries one meaning.**
> Action and warning were once the *same* hex; "press me" and "be careful" were indistinguishable.
> They are separate and must stay separate. The test asserts the macro series never collides
> with a semantic value either.

### Data series (macro chart only)
| Token | Hex | Use |
|---|---|---|
| `--macro-pro` | `#6fa8e8` | Protein |
| `--macro-carb` | `#a78bda` | Carbohydrate |
| `--macro-fat` | `#e0726e` | Fat |
| `--macro-other` | `#3a3a3a` | Unlogged / fibre remainder |

These are the **only** hues allowed outside the semantic set, and only in the macro donut/bars.
Carbohydrate was the retired amber `#f5a524` until 20 Aug 2026 — a chart slice must not be
confusable with a warning.

### Text
| Token | Hex | Use |
|---|---|---|
| `--text-strong` | `#f4f4f4` | Headings, key numbers |
| `--text` | `#e5e2e1` | Body |
| `--text-muted` | `#a0a0a0` | Labels, units, secondary |
| `--text-faint` | `#8e9192` | Timestamps, hints |

Pure `#000` and `#fff` are never used. Minimum contrast: WCAG AA — 4.5:1 body, 3:1 large text.
Never light text on a coloured fill.

### Colour in JavaScript

JS names a *meaning*, CSS owns the *value*.

- DOM inline style → `var(--token)` directly.
- SVG presentation attribute (`stroke="…"`, `stop-color="…"`) → `cssVar('--success', '#5cbf7a')`;
  `var()` is not reliable there. This is the only place a hex literal may appear, and it must
  equal the token.
- Status messages → a tone name, not a colour: `showSupaStatus(msg, 'hata' | 'uyari' | 'ok' |
  'bilgi' | 'sus')`. The mapping lives once, in `SB_TONE`.


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
6. No emoji in the UI. Use line icons (Lucide/Tabler style, 1.5–2px stroke) via
   `icon('saat'|'sure'|'kum')` — the registry is `ICON_PATHS` in `core.js`. In a text
   channel (`textContent`, `escapeHtml`) an icon cannot be injected, so the emoji is
   dropped, not replaced. Two exceptions: ⚠️ on a safety note, and the emoji section
   markers inside AI prompt strings — those go to the model, not the screen.
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
