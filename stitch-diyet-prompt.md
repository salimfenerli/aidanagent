# Stitch — Diyet/Yemek Ekleme Yeniden Tasarımı

## Nasıl çalışacağız (3 adım)

**1. Stitch'te üret** → https://stitch.withgoogle.com
Aşağıdaki prompt'u olduğu gibi yapıştır. Dark mode seç. 4 ekran isteniyor, hepsi tek prompt'ta.

**2. "Copy code" çıktısını bana ver** (ekran görüntüsü de at, karşılaştıracağım)

**3. Kodu doğrudan takarım** — Stitch'in HTML + CSS'i olduğu gibi kullanılacak.

### ⚠️ Ama iki teknik şart var — bunlar olmazsa kod canlıda ÇALIŞMAZ

**a) Tailwind YASAK.** Stitch varsayılan olarak Tailwind CDN'li HTML üretir:
```html
<script src="https://cdn.tailwindcss.com"></script>
```
Aidan'ın CSP'si (`_headers`) `script-src 'self'` — yani bu satır tarayıcı tarafından **bloklanır**, ekran tamamen stilsiz açılır. CSP'yi gevşetmek yerine Stitch'ten düz CSS istiyoruz (prompt'un sonuna eklendi). Alternatifi Tailwind'i self-host etmek olurdu: build adımı + ~300 KB, ilk yükleme bütçesi (204 KB) ikiye katlanır.

**b) Sınıf adları `dt-` ile başlamalı.** `styles.css` 4929 satır ve içinde **5 ayrı `:root` katmanı** var (STITCH → v7 → v8 → v9 → GECE v10). Stitch `.card`, `.btn`, `.header` gibi genel adlar üretirse mevcut kurallarla çakışır ve **uygulamanın başka yerlerini bozar** — hem de sessizce. Prefix'li olunca Stitch'in CSS'ini blok halinde sona ekleyip geçiyoruz.

> ⚠️ **Stitch'in üçüncü tuzağı:** koyu + amber üretmeye meyilli — yani dün "jenerik duruyor" dediğin tam o kalıp. Prompt'ta palet birebir sabitlendi. Yine de amber çıkarsa gelen kodda `#f5a524` / `#ffc640` ara, ben çeviririm.

---

## Stitch prompt'u (kopyala-yapıştır, İngilizce)

```
Design a mobile-first food logging flow for a Turkish nutrition tracking app. Dark theme. 4 screens.

STRICT COLOR PALETTE — use these exact hex values, do not substitute:
- Background: #121211 (warm charcoal, NOT blue-black)
- Surfaces: #1e1c1a (card), #24211d (raised), #2c2823 (input field)
- Border: #3a352e
- Primary action / accent: #e08a63 (terracotta). Text on accent fills: #2a1408 (dark, never white)
- Warning only: #e0a83c. Success: #5cbf7a. Danger: #ea5a52. Info: #6fa8e8
- Text: #f5f3ee (headings), #e5e1d9 (body), #9a9389 (muted), #857e74 (faint)
Accent is ONLY for actions and selected states — never decoration.

TYPOGRAPHY: single family "Onest", weights 400-800. Tabular numerals for all numbers.
Hierarchy through size + weight + color tone only.

STYLE RULES — these are hard constraints:
- No gradients, no glassmorphism, no blur, no glow, no neon
- No colored left-border stripes on cards. Use full 1px border + subtle background tint instead
- No nested cards
- Card radius 12-16px, 8pt spacing grid
- Numbers are the hero of every screen — they must be the largest, boldest element in their row

SCREEN 1 — "Add food" bottom sheet
Sticky header: meal slot name (e.g. "Öğle") + close X.
Segmented tab bar with 4 tabs: Ara (search) · Fotoğraf (photo) · Barkod (barcode) · Elle (manual).
Search tab active: search input at top, then grouped result lists with small uppercase section
headers: "Kendi besinlerim", "Daha önce yedin", "Temel besinler", "Paket / marka".
Each result row: food name on left (bold), unit hint in muted small text next to it,
calorie value right-aligned in tabular numbers. Tapping a row expands the portion editor inline
below it — not a new screen.

SCREEN 2 — Portion editor (inline, expanded state)
Selected food name at top with a small source badge ("Temel", "AI tahmini", "Paket").
A SEGMENTED TOGGLE with two options: "Porsiyon" and "Gram". This is the key element — make it prominent.
- In "Porsiyon" mode: a stepper (− 1 +) with unit label like "dilim", plus quick chips: ½, 1, 1½, 2
- In "Gram" mode: a large numeric input showing grams, plus quick chips: 30g, 50g, 100g, 150g, 200g
Below: live macro preview as a single row of 4 big tabular numbers with tiny labels underneath:
kcal / P / K / Y. Unknown macros show a muted "—" dash, NEVER a zero.
Full-width terracotta primary button at the bottom: "Öğle'ye ekle".

SCREEN 3 — Photo result review
Top: small thumbnail of the user's meal photo, and a warning banner in amber (#e0a83c) tinted
background reading "Tahmini değerler — gramları kontrol et".
Below: a list of detected food items. Each row is an editable card containing:
food name (bold), an inline gram input field with a stepper, and the resulting kcal right-aligned.
Each row has a small confidence chip: "yüksek" / "orta" / "düşük".
A row can be removed with an X, and there is a text button "+ eksik bir şey ekle".
Bottom: a summary bar with total kcal in very large tabular numbers, then a full-width
terracotta button "Onayla ve ekle" and a text-only secondary "Vazgeç".

SCREEN 4 — Daily diary
Vertical list of meal sections: Kahvaltı, Öğle, Akşam, Atıştırma.
Each section header: meal name left, section calorie total right in tabular numbers.
Under it, logged items as compact rows: food name + gram/portion in muted text, kcal right-aligned,
small X to delete. Each section ends with a low-emphasis dashed "＋ ekle" button.
Above everything: a compact daily summary strip showing 4 ring/bar indicators for
kcal, protein, carbs, fat — target vs consumed.

Turkish language for all labels. Clean, calm, information-dense but not cramped.

OUTPUT FORMAT — mandatory, the code must run inside a strict CSP with no external scripts:
- Plain semantic HTML plus vanilla CSS in a single <style> block. Do NOT use Tailwind.
  Do NOT include any <script src="..."> or any CDN link. No build step, no framework.
- Prefix EVERY class name with "dt-" (for example dt-sheet, dt-tab, dt-portion-toggle,
  dt-food-row, dt-macro-value). Do not use generic class names like card, btn, header, row,
  modal, input, chip — they will collide with an existing 4900-line stylesheet.
- Wrap each screen in a single root element and scope all CSS selectors under it.
- Use only system-safe CSS: flexbox, grid, custom properties. No @import, no external fonts
  (assume "Onest" is already loaded by the host page).
```

---

## Prompt'un neden böyle yazıldığı (kısa)

| Satır | Sebep |
|---|---|
| "warm charcoal, NOT blue-black" | Stitch varsayılanı `#0c0d11` gibi maviye çalan zemin üretir — dün terk ettiğimiz ton |
| "Text on accent fills: #2a1408, never white" | Terracotta üzerine beyaz metin okunmuyor, kontrast AA'nın altında |
| "Warning only: #e0a83c" | v7-156'nın en önemli bulgusu: aksiyon ile uyarı **aynı renkti**. Stitch'e bu ayrımı zorla |
| "No colored left-border stripes" | Impeccable'ın mutlak yasağı, Stitch bunu sürekli üretir |
| "Unknown macros show —, NEVER a zero" | Şu anki gerçek bug'ın tasarım karşılığı (aşağıda) |
| "SEGMENTED TOGGLE ... make it prominent" | Asıl istediğin özellik bu; Stitch'e vurgulamazsan küçük bir yan alan yapar |
| Ekran 3'teki amber banner | %40-70 hata payı **ekranda görünmek zorunda**, dipnotta değil |

---

## Bu arada — kodda bulduğum 2 gerçek sorun

**1. Makrolar sıfır yazılıyor (veri bozan bug).**
`core.js` → `addAiFood()`:
```js
protein: Math.round((_aiFood.protein || 0) * m)
```
AI ya da temel besin protein değeri **bilmiyorsa** (`null`), veritabanına **0** yazılıyor.
Sonuç zinciri: `hcNutritionStats` makro kapsamasını "protein != null" ile sayıyor → 0 da "girilmiş" sayılıyor → protein ortalaman düşük çıkıyor → sağlık koçu **"protein yetersiz"** diyor. Halbuki veri yok, sıfır değil.
Paket ürün yolunda (`scaleFood`) bu doğru yapılmış (`v != null ? ... : null`) — yalnız AI/seed yolunda bozuk.

**2. Gram girişi mimari olarak yok.**
410 temel besinin hiçbirinde gram karşılığı yok — sadece `{ n: 'Yumurta', u: 'adet', k: 72 }`.
Çözüm için birim→gram tablosu kuracağım (`dilim: 25g`, `bardak: 200g`, `kaşık: 15g`, `adet` besine göre) + sapan besinlerde tek tek override. 410 sayıyı elle yazmaktan çok daha az hataya açık.

---

## Fotoğraftan kalori — 2025 verisi

Bunu bilerek karar ver: en iyi modeller bile **kalori tahmininde ~%40 hata** yapıyor, **Gemini %65-70** (Aidan'ın kullandığı model). Makrolarda hata %42-110, **protein tahmininde her model %60'ın üstünde**.

Yemeği **tanımak** iyi çalışıyor; bozulan şey **porsiyon tahmini**. O yüzden Ekran 3'te AI'ın işi "tabakta ne var + kaç gram olabilir" demek, kalori kararını gram düzenlemesi veriyor.
