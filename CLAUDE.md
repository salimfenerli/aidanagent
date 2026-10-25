# Aidan — ADHD Asistanı

## 📏 BU DOSYANIN KURALI (5 Eki 2026 — KALICI, teste bağlı)

Bu dosya **her oturumda Claude'un bağlamına otomatik yüklenir**. Büyüdükçe asıl kurallar gürültüde kaybolur ve her oturum pahalılaşır (Eki 2026'da 347 KB'a çıkmıştı — ~90 bin token).

- **Tavan 30 KB.** `tests/52-claude-md.test.js` aşılırsa CI'ı kırmızı yapar → deploy çıkmaz. Eşik YÜKSELTİLMEZ; yer açmak için eski/eskimiş madde silinir ya da birleştirilir.
- **Buraya yalnız KALICI kural girer:** "bunu yapma, çünkü şu bozuldu", mimari gerçek, tuzak. Kim ne zaman ne yaptı → **CHANGELOG.md** (otomatik yüklenmez, gerekirse Grep'le).
- **Seans sonu:** CHANGELOG.md'nin EN ÜSTÜNE kısa günlük; buraya en fazla 1-3 satırlık kural. Aynı konuda kural varsa YENİ MADDE AÇMA, var olanı güncelle.
- Sayı/hex/satır sayısı gibi hızla eskiyen ayrıntı yazma — doğru kaynağı göster (`styles.css`, `DESIGN.md`, kodun kendisi).

---

## 👤 Kullanıcı ve üslup

- **Salim**, 16 yaş, lise öğrencisi, ADHD. **Kod bilmiyor**; terminal/Python kuramaz. Windows PC + iPhone (Safari PWA).
- Türkçe, kısa, eylem odaklı, taranabilir (madde + kalın). "Şuraya tıkla, şunu yaz" netliği.
- "Sence ne?" → tek öneri + gerekçe. Aynı şeyi iki kez açıklatma.
- Kodu ben yazarım; tarayıcı tıklamaları (Cloudflare/Supabase paneli) ona adım adım anlatılır.
- TaskCreate/TaskUpdate kullan (ilerlemeyi görsün). Tek karar gerekiyorsa AskUserQuestion.
- **Orkestratör kuralı (10 Tem, KALICI):** basit iş (boilerplate, küçük düzenleme, test, doküman) → `model: "sonnet"` subagent; mimari/karmaşık debug → ana model. Bağlam aktarmak işten pahalıysa inline yap. Seçimi tek satırla söyle.

## 🧱 Mimari

**İki site, tek repo, tek `git push`:**
- **Aidan** — `aidanapp.pages.dev` · kök klasör · görev/plan/odak/diyet/sohbet/hedefler.
- **Borsa** — `aidanborsa.pages.dev` · `borsa/` · kendi Pages projesi, PWA'sı, `aidan_stocks` tablosu. Sıra: `shared.js` → `stocks.js` (motor) → `sync.js` (çakışma korumalı senkron) → `app.js`.
- Ortak tek şey **Worker** `aidan-pusher.fenerlisalim04.workers.dev` (`aidan-worker/worker.js`) — iki origin de konuşur.

**Aidan istemcisi** (`asistan.html` → Pages'te `/index.html`):
- Statik sıra: `core.js` (diyet + uyku + `escapeHtml` + `loadModule`) → `tasks.js` (sekmeler, gün planı, quick-capture) → `ui.js` (render, ayarlar, auth, sohbet; en altta İLK RENDER).
- **Tembel modüller** (`core.js` → `LAZY_MODULES`): `supabase` · `program` · `nutrition` · `health` · `foods` · `school` · `onboarding` · `karne` · `hafiza` (+ davet + yedek listesi) · `hedefler` · `ajan` · `hafta` · `harcama` (panel `<details>` açılınca iner — `ontoggle`) · `bugun` (Görevler tepesindeki Bugün kartı; eski kalabalığı silmez, en alttaki "Ayrıntılar"a TAŞIR — id'ler korunur; `renderTasks`'ı sarmalar) · `ayarlar` (Ayarlar + global arama; ui.js'te `_lz` yer tutucuları) · `ogun` (Bugün kartının altındaki öğün kartı: Yedim / Farklı yedim / tek satır giriş).
- ⚠️ **Yeni tembel modül = 7 yer:** `LAZY_MODULES` · `sw.js` ASSETS · `aidan-pages-deploy.py` INCLUDE · `.github/workflows/deploy.yml` paths · `.gitattributes` · `package.json` `check` · `tests/07-hygiene` + `tests/13-lazy` listeleri. Biri eksikse modül 404 olur ya da deploy tetiklenmez — **sessiz arıza**.
- **İlk yükleme bütçesi** (`13-lazy`, 183 KB): ~1 KB pay. Taşıma kalıbı: fonksiyonu tembel modüle al, ui.js'te `function ad() { return _lz('modul', 'ad', arguments); }` bırak (67 testi her yer tutucunun gerçeğini arar). Yeni özellik eşiği YÜKSELTEREK geçirilmez; nadir açılan kod tembel modüle taşınır, CSS modülün içine enjekte edilir (`hafiza.js`/`hedefler.js` deseni).
- Veri: `localStorage 'aidan'` = Supabase `aidan_data.data` (tek JSON blob, debounced push + realtime pull). Şekil için `core.js` varsayılanlarına bak.

**⚠️ TEK TAKVİM — hafta çekirdeği** (`hafta.js` ↔ `worker.js` İKİZ, `54-hafta`): `hfGun(d, tarih)` okul + kurs (`diet.nut.duzen`) + `fixedSchedule` + antrenman (`program.days`) + uyku (`settings.sleepGoal`) + sınav (`school.exams` tek seferlik, `school.haftalikSinav` her hafta) → bloklar, boş dk, **ödev kapasitesi** (yarının sınavına tekrar süresi düşülmüş). ⚠️ Haftalık (rutin) sınav "sınav haftası"/"ağır antrenman" alarmı ÜRETMEZ — her hafta çalan alarm gürültüdür; yalnız tekrar süresi ayırır. `hfCakismalar` çapraz kurallar. Yeni bir özellik "o gün ne kadar boş / sınav var mı / antrenman var mı" soruyorsa BUNU çağırır, kendi hesabını yazmaz. Öncelik: **OKUL > UYKU > ANTRENMAN** (5 Eki, varsayılan). Kullananlar: ödev dağıtımı (`hwSpread` kapasite), gün planı (`fixedBlocksFor*`, `gymDayLine`), beslenme bugünün gün tipi (`hfGunTipi`), hedef ajanı (`goalFitDue` kapasite kilidi), sohbet ajanı, sabah brifingi, Pazar 20:00 **haftalık PRO koç** (`runHaftaOzet` → `data.haftaKoc`), Haftam paneli.
- **Haftalık ayar** `program.ayarlar[tarih] = {mod:'hafif'|'dinlen'|'kaydir', hedef}` — Haftam'daki düğmeler yazar; ŞABLON (`program.days`) değişmez, yalnız o tarih. Hafta çekirdeği okuduğu için beslenme/plan/brifing aynı anda uyar. 14 günden eski ayar silinir. Her uyarının `eylemler` listesi var (hafif/dinlen/kaydir/yeniden/dengele); "dengele" ödevi yalnız ÖNCEKİ günlere alır (son tarih geçilmez).

**Supabase** (`fluhzvzulrnfyqogrgfi`) tabloları: `aidan_data` (blob) · `aidan_stocks` · `aidan_backups` · `aidan_memory` · `aidan_goals` · `aidan_screen` (PC ekran süresi, gün+cihaz başı tek satır) · davet tabloları.
- ⚠️ **Yeni tablo = RLS + GRANT.** Supabase public tablolara otomatik yetki VERMİYOR (27 Eyl: yedek 5 hafta hiç alınmamıştı, borsa senkronu ölüydü). `authenticated` + `service_role`'a CRUD ver; doğrula: `has_table_privilege('authenticated','public.<t>','INSERT')`. Politikalar `(select auth.uid())` + `to authenticated`, UPDATE'te `with check`.
- ⚠️ **Worker cron'u `aidan_data` blob'una yazarsa PWA senkronuyla çakışabilir.** Worker'ın sık yazacağı veri AYRI tabloya (`aidan_memory`, `aidan_goals` deseni).

**AI = Google Gemini** (`aiRun` / `visionRun`, `env.GEMINI_API_KEY`). **MODEL KARARI (5 Eki, Salim):** Flash = `gemini-3.8-flash` (mekanik/hızlı işler), Pro = `gemini-3.1-pro-preview` (sohbet ajanı, haftalık koç, hedef ajanı, diyet/program/sağlık düğmeleri). ⚠️ Model adı değiştirmeden önce Google model listesinden DOĞRULA — eski `3.5-pro` yoktu, PRO aylarca sessizce ücretsize düştü (`55-model-maliyet`). `env.GEMINI_MODEL(_PRO)` tanımlıysa varsayılanı ezer. **Maliyet ölçülür:** `aiRun` → `usageMetadata` → `aiCostLog` → RPC `ai_cost_add` → `aidan_ai_cost` (Ayarlar'da aylık $); fiyat tablosu `AI_FIYAT`.

**MCP:** `aidan-mcp/server.py` (FastMCP, PC'de, Claude Desktop'a bağlı) — Supabase'e doğrudan görev/seri işlemleri. `.env` asla commit edilmez.

## 🚀 Deploy ve git

- **Deploy = `git push`** → GitHub Actions: Aidan Pages + Borsa Pages + Worker birlikte. Netlify / drag-drop / ntfy / Telegram ASLA önerme (hepsi emekli).
- Workflow yalnız `deploy.yml` `paths`'teki dosyalar değişince tetiklenir — yeni dosya eklersen listeye ekle.
- Kullanıcıya görünen değişiklikte `sw.js` `CACHE` sürümünü artır (`aidan-v7-NNN`).
- ⚠️ **Yeşil test ≠ yayınlanmış kod.** Canlıyı **cache kırıcıyla** doğrula: `curl "https://aidanapp.pages.dev/sw.js?cb=$(date +%s)" | head -1` (çıplak istek bayat sürüm döndürebiliyor). CI kırmızıysa Actions özet sayfasında düşen adım yazılı.
- ⚠️ **Sandbox/uzak kabuktan ASLA `git` komutu çalıştırma** (`status`/`diff` dahil). `.git/index.lock` bırakıyor, silinemiyor → Salim'in GitHub Desktop'ı "lock file exists" diyor (4 Eki'de yine oldu). Değişen dosyaları dosya araçlarıyla gör. Kaza olursa: silme izni varsa `rm .git/index.lock`, yoksa `mv .git/index.lock .git/index.lock.eski`.
- **PUSH KARARI (11 Eki, Salim):** bulut oturumunda Claude **kendi ayrı klonundan** (Salim'in klasörü DEĞİL) testler yeşilse doğrudan `main`'e push eder; Salim yalnız GitHub Desktop'ta Fetch → Pull yapar. Salim'in yerel klasöründe git komutu yasağı aynen geçerli. Push öncesi `git fetch` + `HEAD..origin/main` boş mu bak (Salim de push etmiş olabilir).
- ⚠️ **`.gitignore`'da eğik çizgisiz desen tehlikeli:** `app.js` satırı `borsa/app.js`'i de yuttu, dosya hiç push edilmedi. Kökü kastediyorsan `/app.js`.
- ⚠️ **Satır sonu `.gitattributes`'ta sabit.** Kökte **yalnız `styles.css` LF**, diğer kök dosyalar CRLF (CLAUDE.md dahil); **`borsa/` tamamen LF**. `.gitattributes`'ta sıra önemli — `borsa/**` bloğu en sonda. (Ağu'da EOL yüzünden 5 gün hiç deploy çıkmadı.)
- Manuel yedek deploy (token varsa): `py aidan-pages-deploy.py` / `py aidan-worker/deploy.py`. Wrangler yok.

## ✏️ Düzenleme ve test

- Büyük dosyalarda **Python string-replace** (`assert s.count(old)==1`) + **`node --check`**. EOL'ü koru (`\r\n` varsa `\r\n` yaz). `.bak` OLUŞTURMA; geri alma = git.
- Tarih: yeni kodda `new Date().toISOString().slice(0,10)` **ASLA** (UTC kayması) → `today()` / `isoLocal()` / `shiftDateStr()`; tarih aritmetiği `'T12:00:00'` öğlen demirli. Worker'da `trToday()` / `trDate(n)`.
- Init sırasında çağrılan fonksiyonun kullandığı `const`/`let` o çağrıdan ÖNCE tanımlı olmalı (hoisting `const`'u kurtarmaz — 6 Ağu sohbet çökmesi).
- `escapeHtml` `core.js`'te. HTML'e giren her kullanıcı/AI metni kaçışlı. ⚠️ `onclick="f('...')"` içine ham değer koyma — `escapeHtml` tırnağı `&#39;` yapar ama tarayıcı bunu JS'e geri çözer; değeri `data-*` özniteliğiyle geçir.
- **Testler** (`npm test`, `node --test`, ~1450 test): Salim'in makinesinde/uzak kabukta 3 dk'yı aşar → tam suite'i **projenin kopyasını konteynere alıp** ya da CI'da koş; yerelde dosya dosya.
  - jsdom penceresi paylaşan test dosyası `after(() => A.close())` kullanır; `process.on('exit')` ASLA.
  - vm bağlamından dönen nesnede `deepStrictEqual` KULLANMA (farklı realm) → `JSON.parse(JSON.stringify(x))` ya da `join`.
  - Top-level `let/const` window'a yazılmaz → testte `A.evalIn('data')`.
  - Saate bağlı test yazma (gece koşunca kırmızı olan `32-yerel-plan`/`31-odev-paketi` dersleri) — saati parametre yap.
- ⚠️ **Testi kapıya da yaz, yalnız motora değil.** "Program kur" düğmesi 22 gün çalışmadı; 4 test dosyası motoru ölçüyordu, düğmenin motoru çağırdığını kimse ölçmüyordu.

## ⚙️ Worker kuralları

- ⚠️ **TEK cron:** `*/5 * * * *`. Cloudflare ücretsiz plan worker başına 3 cron kabul eder, fazlası **sessizce** düşer (Ağu'da 6 özellik aylarca ölüydü). Yeni zamanlı iş `wrangler.toml`'a DEĞİL, `scheduled()` içine `if (at(h, m)) jobs.push(...)` olarak (TR saati, 5 dk pencere). Takvim: 08:00 sabah brifingi+plan+çakışma+son tarihler · 19:30 hedef ajanı (yalnız yeni öneride) · 21:00 "Günü kapat" (`/?ac=sohbet` sohbeti açar)+Hevy+yarının planı · Pazar 20:00 sağlık raporu SESSİZ → PRO koç TEK push · Pzt 03:00 yedek. ⚠️ **Günde 2 bildirim (Faz 3, 13 Eki)** — 09:00 deadline / 12:00 öğle / Pazar ayrı haftalık push'u geri EKLEME (`62-faz3`) · her tur sabit hatırlatıcı + plan blok bildirimi + **öğün bekçisi** (18 Eki, Salim öğün unutuyordu: plan saatinde push, Yedim'e kadar ana öğün 3 / ara 2; kullanıcı ihtiyacı — Faz 3 sayısına girmez) + **hareket molası** (25 Eki, Salim istedi: evdeki boş saatte günde ≤3 mola, her molada havuzdan farklı hareket, dokun = yaptım, antrenman günü o bölge dinlenir; tablo worker `HAREKET_TUR` ↔ `ogun.js` `HAREKET_TUR_I` birebir ikiz, `70`).
- **AI katmanları** (`AI_TIERS`): `light` · `normal` · `deep` (ücretsiz model, derin düşünme) · `heavy` (PRO; `env.GEMINI_MODEL_PRO`).
  - ⚠️ **PRO MALİYET KURALI:** `heavy` yalnız ① cron (günde sabit sayıda) ② kullanıcının düğmeye basmasıyla ③ **sohbet — yalnız SAHİBE, günde `CHAT_PRO_DAILY` (40) tavanıyla** (5 Eki, Salim'in bilinçli kararı; sayaç `aidan_usage`, okunamazsa tavan dolu sayılır, yalnız gerçekten PRO yanıt verdiyse artar). Başka serbest akışlı özellik ASLA `heavy` almaz → `deep`. Kullanıcı ucunda çıplak `heavy` yok: `aiTierForUser(env, user, 'heavy')` (sahip dışı → `deep`). Model adını yalnız tier `heavy` kalırsa geç.
  - `geminiModelFor` bilerek eski davranışta: secret yoksa ücretsiz. Toplu ücretliye geçiş Salim'in vermediği maliyet kararıdır.
  - ⚠️ Düşünme token'ları ÇIKIŞ bütçesinden yenir → düşük `max_tokens` + yüksek düşünme = **boş cevap**. Katmanların `minOut` tabanı var, altına inme.
- **Prompt sırası:** sistem prompt → `memoryBlock(...)` → `instructionsBlock(...)` (talimat EN SONDA). Talimat üslubu belirler, hafıza bağlamı; ikisi de güvenlik kurallarını ezemez.
- ⚠️ **Makine sözleşmeli çağrılar talimat ALMAZ** (`/split`, `/food-macros`, `/ai` tool-use, görsel OCR, haber sınıflama, hedef ajanı JSON'u) — "madde madde yaz" JSON'u bozar. `splitPrompt` hafıza da almaz.
- **CORS:** `allowOrigin(request)` + `Vary: Origin` (iki origin var; sabit origin diğerini bloklar).
- **Auth:** her uç Supabase token (`verifyUser` + `allowUser`) ya da secret ister. Bilinçli istisnalar: `/config` (zaten public değerler), `/signup` (davet kodu doğrulamalı). `/body` ve `/health` iOS Kısayol, `/screen` Windows görevi için `X-Aidan-Secret` (yanlışta 404).
- Kullanıcı ucunda kullanıcının KENDİ token'ıyla oku (RLS korur). Service key yalnız cron'da (`hasServiceKey`); yoksa `AIDAN_EMAIL` tek-kullanıcı fallback (`u._legacyToken`).
- Uç listesi: `worker.js` → `fetch()` yönlendirmesi (`url.pathname === ...`). Burada kopyalanmaz.

## 🧠 Ürün ilkeleri (her modülde)

- **Sayıyı kod hesaplar, AI uydurmaz.** AI'a doğrulanmış gerçekler (`facts`) gider; AI yorumlar/doldurur.
- **AI çıktısı kod kapısından geçmeden kaydedilmez:** `nutAiValidate` (diyet), `progCfgUygula` beyaz listesi (antrenman ayarı), `memoryParseOps` (hafıza), `goalParseAgent` (hedef). Prompt bir ricadır, garanti değil.
- **Onay kapısı:** arka plan ajanı kullanıcının listesine kendiliğinden görev EKLEMEZ, önerir (hedef ajanı).
- **Veri yoksa uydurma:** taban oturmadan skor üretme (`ready:false`), bayat ölçüm "veri yok"tan kötüdür, makrosu bilinmeyen kaleme makro yazma, eşleşmeyen aramada boş dön.
- ⚠️ **16 YAŞ KİLİTLERİ (gevşetilmez, her biri teste bağlı):** kalori kısıtlama / kilo verme diyeti YASAK · kişisel kısıt kaloriyi DÜŞÜRMEZ, yalnız dağılımı değiştirir · aşırı antrenman teşviki YASAK · 1RM denemesi önerilmez, geçmiş yoksa ağırlık `null` · teşhis/ilaç/takviye önerisi YASAK · vücut şekli yorumu ve "ideal yağ oranı" YASAK · en fazla 2 sağlık önerisi · borsa: al/sat/tut tavsiyesi ve fiyat tahmini YASAK. Sohbete `CHAT_HEALTH_GUARD` ile taşınır.
- **İkiz çekirdek:** `health.js` ↔ `worker.js` paylaşılan sağlık çekirdeği (`hcBMR`, `hcBaseline`, `hcLoad`, `hcRecovery`, …) **byte-byte aynı** — birini düzenlersen ikisini düzenle (`02-twins`). BMR hesaplayan TEK yer `hcBMR`; formül kopyalanmaz.

## 🗂️ Modül tuzakları

**Görev / plan**
- MIT günde en fazla 3 (kasıtlı). Gün planı AI'sız da kurulur; sıra: MIT → acil → gecikmiş → bugün teslim → yakın → tarihsiz. Dünün planı bugüne sızmaz (`dayPlan.date === today()`).
- Aynı ms'de çok görev üretirken `Date.now()` id'si çakışır → sayaç ekle.
- Hızlı giriş: "her salı X" tekrar kuralıdır, yalın "hafta sonu" tarihtir; yazılmamış yıl yalnız tarih 30+ gün geride kalırsa ileri atlar.
- `pruneOldData`: 180 günden eski BİTMİŞ görev + diyet günü, 60 günden eski sohbet atılır; sohbet "kayıtlar"ına dokunulmaz.

**Sohbet ajanı** (5 Eki — `/chat` + `ajan.js`)
- Araçlar: `odev_plani` (okul / özel ders ödevlerini tek pakette) · `gorev_ekle` · `gorev_tamamla` · `gorev_ertele` · **11 Eki TEK GİRİŞ KAPISI:** `harcama_ekle` · `ogun_ekle` · `uyku_kaydet` · `kilo_kaydet` · **14 Eki `program_kaydet`** (her hafta tekrar eden program: okul→`duzen.okul`, ek ders→`duzen.ders`+`ad`, dövüş/sabit→`fixedSchedule`; model ANLAR, kart hfGun önce/sonra ETKİYİ gösterir, `64`) (mesaj başı en fazla `AGENT_MAX_ACTIONS` 12). Worker `agentSanitizeActions` ile temizler (uydurma görev id'si → eylem yok, geçmiş tarih → null, tutar/kilo Türk biçimi `agentNum` + sınır, kayıt tarihi en fazla 7 gün geri); `actions` döner, blob'a YAZMAZ.
- ⚠️ **Öğün kalorisi modelden ASLA gelmez:** `ogun_ekle` yalnız metin taşır; `ajan.js` `ajanYemekCoz` besin veritabanından (foods.js) ölçekler, eşleşme yoksa kcal `null`. Sohbetin kayıt soruları yalnız `agentKayitlar` (kod hesaplar) bölümünden cevaplanır.
- `ajan.js` kart çizer; **Uygula'ya basılmadan veri değişmez**. 2+ bekleyen eylemde "Hepsini uygula" + tek Geri al. Ödev planı uygulama ANINDA `hwWorkDays`+`hwSpread` (school.js, ödev paketiyle aynı motor) ile yeniden hesaplanır. Bölünmüş ödev `seq` KULLANMAZ (`hwFixSeq` tüm seq'leri tek grup sayar) → `ajanFixParts`.
- Bağlam: bugün+gün adı, açık görevler `[id]`, ders programı (`data.school.timetable`), sabit program (özel ders). Meta-öğrenme modunda araç yok.

**Hafıza / hedef ajanı** (4 Eki)
- `aidan_memory`: sohbetten `light` çıkarım (`ctx.waitUntil`, cevabı geciktirmez). Tavan 60; 48'de `auto` maddeler birleştirilir, `seed`/`user` dokunulmaz. Her uç `MEM_SCOPE` ile yalnız kendi kategorilerini görür. Cron okuyucu `memoryFetchForCron` asla fırlatmaz.
- `aidan_goals` + `hedefler.js`: 19:30 `runGoalAgent` (`deep`), "Şimdi düşün" `/goal-think` (`aiTierForUser`, aynı hedefe 2 dk'da bir). En fazla 3 öneri; hedefin 3+ açık görevi varsa öneri yok; reddedilen tekrar önerilmez; cevapsız taze öneri varken model çağrılmaz. Onaylanan görev `goalId` taşır.

**Diyet / beslenme** (`nutrition.js` motoru, `foods.js` DB)
- Öğün saatlerini MOTOR kurar (`nutMealTimes`, deterministik), AI yalnız hedefi doldurur. Düzen AI'a ayrı alan olarak gider.
- Hedef kaynağı TEK: motor kazanır; hesaplayıcı yalnız profil toplar. Kilo en yeni tartıdan okunur.
- Sıralama: gün kalorisi hedefin %95 altındayken protein kapısı sert tavan. `proteinMaxPerKg 2.5` azalan getiri noktasıdır (güvenlik eşiği değil). Gün proteini hedefin %8-18 üstünde bitebilir — bilinen, ekranda yazılı.
- Öğün payı sorunu oran oynatarak değil ŞABLON HAVUZUNU genişleterek çözülür (oran denemesi geri alındı). Vejetaryen seçenek bilerek yok (havuzda çapa kalmıyor). Tercih özelliği alerji DEĞİL.
- Besin DB: `g` alanı ölçülmüş olmalı (türetilmiş gram 3 kat kaydı); "yulaf ezmesi" KURU değerdir; Türkiye'de süt D ile zenginleştirilmez (düşük D doğru). Kompozit Türk yemekleri tahmindir (±%15). "baldo/basmati" tek başına sade haşlanmış.
- Öğün çözücü (`parseFoodQuery` + `_olcuDonustur`, sohbet ve yemek penceresi ORTAK): birimi sayı taşıyan besinde ("10 adet") söylenen sayı TANE sayısıdır; avuç ≈30 g; "yarım ekmek" somun, tam sayı "2 ekmek" dilim (bilerek); sondaki miktar ("pizza 2 dilim") okunur; son kelime "dürüm" addır (`68-ogun-giris-alisveris`).
- Miktarlı sorgu ("200 gr X") gram tabanından ölçeklenir; hiçbir sorgu tek dokunuşta 5000 kcal üstü kayıt üretmez (`38-gram-sorgusu`). Ölçekleme tek birim tabanından; `input[type=number]` virgülü siler.
- **Günlük menü** (18 Eki, `nutGunluk*`): 7 gün ileri, kova başına yazıldığı TARİH tutulur (`diet.nut.gunluk.yazildi`); tarih değişince yalnız bayat kova tazelenir. Satırlar saat önekli — bekçiyle sözleşme (`66-gunluk-menu`). Gün = 8(+8) aday içinden makro sapması + tekrar cezası en düşük olan (`nutGunPuan`). ⚠️ Ana öğün havuzuna 1 porsiyonu >~40 g protein olan çapa ekleme — bant reddeder, şablon ölü kalır. ⚠️ İlk yükleme bütçesi ~185/185: ui.js/core.js/tasks.js'e ekleme yapmadan önce yer aç.
- **Öğün bekçisi** (17 Eki): saat PLAN kalem adındaki `HH:MM · ` önekinden okunur (`ogunGruplari`, worker) — önek formatını değiştirirsen bekçi susar (`65-ogun-bekci`). İstemci tarafı `ajan.js` (`ogunBekciAksiyon`), ilk yükleme bütçesi dolu olduğu için. ⚠️ **Bildirime dokunmak = Yedim** (25 Eki; soru kartı 12 pingte 0 işaret aldı) — kart yalnız Geri al / Henüz yemedim / Atladım sunar; iki dokunuşlu akışa geri dönme.
- `nutFood()` foods.js yoksa `null` → motor sessizce boş öğün üretir; diyet sekmesi `program`+`nutrition`+`health`(+`foods`) modüllerini birlikte bekler.

**Antrenman** (`program.js` motoru)
- Programı AI YAZMAZ — deterministik motor. İzinli ağ ucu tam iki: `HEVY_ROUTINES_ENDPOINT`, `PROG_AI_ENDPOINT` (serbest metin → AYAR, `progCfgUygula`'dan geçer). `buildProgram` içinde `fetch`/`await` olamaz.
- Gün seçimi iki katmanlı (`programAssignDays` seçer, `programGunCezasi` sıralar) — okul saati cezası ikisine de girmeli. Isınmaya sıçrama konmaz; temas bütçesi şiddet ağırlıklı (`plyoW`). Leg press squat ailesi değildir.
- Hevy API **Hevy Pro** ister; 403 = rutin limiti. Zorlanamayan kurallar rutin NOTUNA yazılır.
- Kurulum kutuları kalıcı (`data.progIstek` 600 ms gecikmeli) — form her çip tıklamasında yeniden çiziliyor, DOM'da duran metin kaybolur.

**Sağlık / uyku**
- Fitbit verisi: Google Health → Apple Sağlık → **Health Auto Export** (önerilen, `haeToItems` biçimi otomatik tanır) ya da iOS Kısayol → `POST /health`. `/health` yalnız sleep + health + `diet.weights` yazar. ⚠️ Fitbit/Google Health API'sine dönme (restricted scope, CASA denetimi) — tekrar araştırma.
- **PC ekran süresi (11 Eki):** ActivityWatch (yerel, AFK sayılmaz) → `pc/aidan-ekran.ps1` (Görev Zamanlayıcı 30 dk, `kur.bat` kurar) → `/screen` → `aidan_screen` → sohbet [KAYITLAR]. ⚠️ `pc/` betikleri ASCII + CRLF (PowerShell 5.1 BOM'suz dosyayı ANSI okur); `/pc/ayar.txt` gizli anahtar, `.gitignore`'da. iPhone ekran süresi Apple kuralı gereği ÇEKİLEMEZ — tekrar araştırma.
- **Teşhis (25 Eki, `71`):** `/health` son gönderimin sonucunu + boş gelen grupları `data.saglikTani`'ye yazar (yalnız durum değişince/günde 1), Ayarlar tek cümleyle ne yapılacağını söyler. Kısayol sorununda önce `saglikTani`'ye bak, ekran görüntüsü isteme.
- Toparlanma skorları kişisel tabana göre (medyan+MAD); 14 gün taban oturmadan skor yok. Dinlenme nabzında işaret ters.
- Bayat tartı: ardışık 2+ gün aynı değer → uyarı; toplu dolgu ve tarihli gönderim muaf. İçe aktarma ile `/health` doğrulama aralıkları birebir aynı (`28-saglik-import`). Apple `export.xml` DOMParser'sız (100 MB+).

**Borsa** (11 Eki: Aidan'dan ÇIKTI — Salim "uygulamayı karışık yapıyor". Site ayrı yaşar; Aidan'a borsa bildirimi, sohbet bağlamı, menü geri EKLENMEZ — Salim'in kararı olmadan)
- Tarama/eleme/skor PWA'da; worker sıralamaz. Türetilmiş ROE (`PD/DD ÷ F/K`) tek yıllıktır — yalnız ön eleme. Buffett skoru `close` kullanır (`adjclose` temettüyü çift sayar). Yahoo 4 yıl verir; 2-3 yıllık tabloda "güçlü kalite" etiketi yok.
- `BIST_UNIVERSE` elle tutulan liste — endeks değişince güncelle. İş Yatırım ucu yalnız hisse kartında (taramada IP engeli riski).
- Accent olmayan amberler (TA uyarı rozeti, karbonhidrat serisi) veri rengidir, palet değişiminde çevrilmez.

**Sohbet**
- Fotoğraf: tam boy yalnız worker'a, sohbette ~8 KB thumb saklanır. `/pro` tek seferlik heavy. Meta-öğrenme modları ve görselli mesaj hafızaya yazılmaz.

## 🎨 Tasarım

- **Kaynak: `DESIGN.md`** + `styles.css`'in SON `:root` bloğu (5 katman var, sonuncusu kazanır; palet bloğu EN SONDA kalmalı). Hex'i JS'e yazma (`25-gorsel-dil` kırar).
- **Impeccable standardı (KALICI):** framework `C:\Users\Salim\Downloads\impeccable-main\` (`SKILL.md` + `reference/product.md`). Yasaklar: mor/neon gradyan, glassmorphism, glow, gradient-text · **renkli yan-şerit kenarlık ASLA** (tam kenar + tint + nokta/ikon) · iç içe kart · özel scrollbar · bounce/elastik animasyon · saf #000/#fff · dekoratif emoji (SVG ikon kullan: `icon(...)`). Tek font ailesi; hareket 150-250 ms ease-out + `prefers-reduced-motion`.
- **Akıcılık (20 Eki, `69`):** görev yakalama/kısayol/bildirim bandı yalnız Görevler'de (`body[data-tab]`); modül inerken `.panel.yukleniyor` iskeleti gizler — tembel modül eklerken bu kalıbı koru, kartı geç `setTimeout`'la sonradan ekleyip içeriği zıplatma.
- Dokunma hedefi ≥44px (`::after` ile görünmez alan). iOS'ta odak dokunmadan sonra kalır — `:focus-visible` halkası beyaza yakın accent'le parlamasın.
- Bir renk tek anlam taşır: accent ≠ uyarı.

## ❌ Kaldırılanlar — yeniden ÖNERME

Mood/check-in · streak · hyperfocus uyarısı · hafta takvimi · rutinler sekmesi · body doubling · motivasyon banner · pomodoro trend grafiği · düşük öncelik · weekdays/weekends tekrar · magic link · şifreleme (master password) · Telegram bot · ntfy · Netlify · Fitbit API. Gerekçeler CHANGELOG.md'de.

## 🔧 Pratik notlar

- Canlı uç testi: `aidan-mcp/.env` ile Supabase password login → token; isteğe `User-Agent: Mozilla/...` + `Origin: https://aidanapp.pages.dev` ekle (yoksa Cloudflare 1010).
- Türk sayı formatı "2.145,00" → `parseNum()`; AI'dan sayıyı görseldeki haliyle STRING iste.
- iOS PWA: arka planda JS yok (zamanlayıcı timestamp bazlı); Yahoo BIST ~15 dk gecikmeli. Push sorununda: Worker `Urgency: high` + SW her push'ta `showNotification` + Ayarlar → "Push'u sıfırla".
- Preview testinde SW cache eski modülü gizleyebilir → SW unregister + `caches.delete()`.
- Cloudflare account `dd37c3eb3e7fbab35ee16f1a6db4cce1`; secret'lar yalnız `.env` / Worker Variables. Worker env: `SUPABASE_URL/KEY/SERVICE_KEY`, `AIDAN_EMAIL/PASSWORD`, `WEBHOOK_SECRET`, `VAPID_*`, `GEMINI_API_KEY`, `GEMINI_MODEL(_PRO)`.

## ⏳ Açık işler

- **YOL HARİTASI (11 Eki, Salim onayı — ayrıntı CHANGELOG):** Faz 1 sohbet = tek giriş kapısı (harcama/öğün/uyku/kilo/görev bitti, tek kart + Uygula) + Health Auto Export · Faz 2 tek "Bugün" ekranı · Faz 3 sabah/akşam tek bildirim + ders bloğu uygulama engeli (Kısayol) · Faz 5 iPhone köprü uygulaması (yalnız kullanım kanıtlanırsa). ⚠️ Faz 1-2 bitmeden YENİ MODÜL YOK — fikir listeye yazılır.
- Muse planı: ✅ hafıza her yerde · ✅ hedef ajanı · ✅ sohbet ajanı (ödev planı) · ✅ Haftam (tek takvim, çapraz kurallar, tek dokunuşla düzeltme, uyku→antrenman, haftalık PRO koç) · ⏳ toparlanma skoru (`hcRecovery`) da az-uyku kuralına girsin · ⏳ hedef önerisini sohbetten onayla · ⏳ brifinge hedef satırı · ⏳ öneri kabul oranı (<%40 → önce prompt) · ⏳ web okuma (KAP, Cloudflare Browser Rendering, yalnız okuma).
- Supabase "sızdırılmış şifre koruması" kapalı (panelden tek tık).
- Antrenman kurulumunda "şu günler sabit" seçimi yok (serbest metin bunu `uygulanamayan`'a yazıyor).
- Görev karnesi aylık görünüm · fotoğraftan öğün ekleme (altyapı hazır: `resizeImageToDataUrl` + `visionRun` + `/food-macros`).
- Beslenme denetiminden kalanlar: çinko/magnezyum `NUT_MICRO` · uyku öncesi kazein · takviye sertifika notu · ergen sporcu RMR (Reale 2020) alternatifi.
- Harcama (`data.harcama`, AI'sız): ⏳ sabah brifingine/Pazar koçuna satır · ⏳ sohbetten "bu hafta yemeğe ne harcadım" · ⏳ banka SMS'inden otomatik.
- `icon.png` mascot paletle uyumsuz; kalan buton-glyph emojileri SVG'ye.
