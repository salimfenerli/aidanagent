# Aidan — Kod Tabanlı Kıyas Denetimi (7 Temmuz 2026)

> İlk rapor eski CLAUDE.md'ye (14 Haz) dayanıyordu ve yanlıştı. Bu sürüm **gerçek koda** (v7-87, yüklenen 5 modül: supabase/core/tasks/stocks/ui.js) bakılarak yazıldı.

## Ana bulgu

**Aidan özellik olarak referans uygulamaları yakalamış — hatta çoğu yerde geçmiş.** "Kanıtlanmış blueprint'te var, bizde yok" diye aradığım şeylerin neredeyse tamamı zaten kodda. Eksik değil, fazla.

---

## 🥗 Diyet — vs MyFitnessPal / FatSecret / Yazio

| Blueprint özelliği | Aidan | Durum |
|---|---|---|
| Barkod tarayıcı | `startBarcodeScan` + html5-qrcode + Open Food Facts | ✅ Var (dün) |
| Porsiyon ölçekleme (g) | `scaleFood` + canlı önizleme | ✅ Var |
| Yemek arama (metin) | OFF `offSearch` + AI/USDA `aiFoodSearch` | ✅ Var |
| Doğrulanmış/Türk DB | `seedFoodMatches` gömülü Türk DB + `trNorm` | ✅ Var |
| Kayıtlı/özel yemek | `saveCustomFood` | ✅ Var |
| **Tarif oluşturucu** (Yazio) | `addRecipe` / `saveRecipeFromDay` | ✅ Var |
| **Kalori hesaplayıcı (BMR/TDEE)** | `calcGoals` (cinsiyet/hedef) | ✅ Var |
| **Çoklu + haftalık diyet programı** | `newPlan`/`switchPlan`/`togglePlanWeekly` | ✅ Var |
| Makro görselleştirme | `renderMacroBars` + `renderMacroDonut` | ✅ Var |
| **Takviye/vitamin takibi** | `addSupplement` / `markSuppTaken` | ✅ Var |
| Gün kopyala | `copyPrevDay` / `copyMealToNextDay` | ✅ Var |
| Foto→kalori (MFP Premium) | `dietPlanFromImage` + AI | ✅ Var (bedava) |
| **Aralıklı oruç 16:8 timer** (Yazio imza) | — | ❌ **Gerçekten yok** |
| **Egzersiz/adım = yakılan kalori** | — | ❌ **Gerçekten yok** (marjinal iz var) |

**Sonuç:** Diyet, MyFitnessPal + Yazio'nun birleşimi kadar dolu. Tek eksik: oruç timer + egzersiz dengesi (ikisi de küçük).

---

## 📈 Borsa — vs TradingView / Investing.com / Midas

| Blueprint özelliği | Aidan | Durum |
|---|---|---|
| Watchlist + alarm | `addStock` / `setStockAlarm` | ✅ Var |
| Portföy K/Z + görselden ekle | `setPosition` / `handlePortfolioPhoto` | ✅ Var |
| **Hisse haber akışı** | `loadStockNews` + `aiStockNews` | ✅ Var |
| **Tam teknik analiz** (SMA/EMA/RSI/MACD/Bollinger/ATR/Stoch/ADX/OBV) | `computeStockTA` + 15 gösterge | ✅ Var (TradingView seviyesi) |
| **Mum grafik + Fibonacci** | `candleChartTA` / `computeFibLevels` | ✅ Var |
| **AI taktik sinyal + analiz** | `buildTacticalSignals` / `aiStockAnalysis` | ✅ Var |
| BIST100 kıyas + donut dağılım | `renderBist100Compare` / `renderPortfolioPie` | ✅ Var |
| **Temettü takibi** | — | ❌ Gerçekten yok (minör) |
| **Bilanço/ekonomik takvim** | — | ❌ Gerçekten yok (minör) |

**Sonuç:** Borsa modülü Investing.com'u geçmiş, TA tarafında TradingView'a yaklaşmış. Eksik denecek şey neredeyse yok.

---

## ✅ Görev/Plan — vs Todoist / TickTick / Sunsama

| Blueprint özelliği | Aidan | Durum |
|---|---|---|
| Doğal dil hızlı ekleme | `parseQuickInput` + `quickCaptureAI` | ✅ Var |
| MIT + akıllı öneri | `suggestMitTasks` / `acceptMitSuggestion` | ✅ Var |
| **Sunsama günü planla (zaman bloklama)** | `planMyDay` + `addPlanBlock` + gün şeridi | ✅ Var |
| **Takvim entegrasyonu (ICS sync)** | `createCalendarLink` / `calendarUrl` | ✅ Var |
| Pomodoro + odağı göreve bağla | `startTimer` / `bindFocusTask` | ✅ Var |
| Akşam yansıma / günlük | `submitJournal` | ✅ Var |
| Haftalık review | `renderKarne` + `renderWeeklyInsight` | ✅ Var |
| **AI sohbet asistanı** (ChatGPT tarzı) | `sendChat` / `renderChatMessages` | ✅ Var |
| Şablon / seri / geri sayım | `applyTemplate` / `showSeries` / `renderCountdowns` | ✅ Var |

**Sonuç:** Görev tarafı Todoist + TickTick + Sunsama'nın özelliklerini topluca içeriyor. Boşluk yok.

---

## Karar: ne yapmalı

**Özellik ekleme dönemi bitti.** Aidan referans uygulamalardan özellik olarak geri değil, ileride. "Eksiği olmasın" hedefin zaten tutmuş. Kalan 3 gerçek boşluk (oruç timer, egzersiz-kalori, temettü/bilanço takvimi) küçük ve opsiyonel.

Bu yoğunlukta bir uygulamada asıl risk **eksik özellik değil, bu kadar özelliğin telefonunda gerçekten çalışıp çalışmadığı + tutarlılık.** Öncelik önerim:

**🥇 1. Kalite kontrol (QA) turu.** 5 modül, ~onlarca özellik. Barkod (dün eklendi), TA suite, çoklu plan, calendar sync — bunlar telefonunda test edildi mi? Kırık/yarım olanı bulup düzeltmek, yeni özellikten değerli.

**🥈 2. CLAUDE.md'yi güncelle.** Belge 17 sürüm + 6-dosya refactor geride. Güncel değilken her yeni sohbet biteni tekrar öneriyor (bugün olan tam bu). 20 dk, gelecekteki tüm işi hızlandırır.

**🥉 3. İstersen 3 minör gerçek eksik** — oruç timer / egzersiz dengesi / temettü. Ama bunlar "olmasa da olur".

**Öneri:** Önce **QA turu** — sen telefonda neyin çalışıp neyin bozuk olduğunu söyle, ben kod tarafını düzelteyim. Feature bolluğunda kalite, yeni özellikten önemli.
