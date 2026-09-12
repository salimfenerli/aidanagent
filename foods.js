/**
 * foods.js — TEMEL BESİN VERİTABANI + ARAMA MOTORU (2 Eyl 2026)
 *
 * NEDEN AYRI DOSYA: 470 besinlik tablo tek başına 8.5 KB gzip ve core.js'in
 * içindeydi — yani her açılışta, Görevler sekmesinde bile iniyordu. Oysa
 * TEK kullanıcısı Diyet sekmesindeki yemek ekleme modalı. İlk yükleme bütçesi
 * (201 KB gzip, tests/13-lazy) besin ekleme iyileştirmeleriyle 204 KB'ye
 * çıkınca borç görünür oldu: doğru cevap eşiği yükseltmek değil, kritik
 * yolda işi olmayan tabloyu oradan çıkarmaktı.
 *
 * Diyet sekmesi açılınca program.js + nutrition.js + health.js ile birlikte
 * iner (tasks.js showTab). nutrition.js `nutFood()` ile buraya bağımlı,
 * core.js'teki çağrılar `typeof` kapısından geçiyor.
 *
 * ⚠️ Yeni modul eklersen 5 yeri guncelle: LAZY_MODULES · sw.js ASSETS ·
 *    aidan-pages-deploy.py INCLUDE · Actions paths · tests/07-hygiene.
 */

// ===== Temel Türk besinleri tohumu (birim başına yaklaşık değerler; n=ad, u=birim, k=kcal, p/c/f=makro) =====
const TURK_FOODS = [
  // --- Kahvaltı / süt ürünleri / yağlar ---
  { n: 'Yumurta', u: 'adet', g: 50, k: 72, p: 6.3, c: 0.4, f: 4.8 },
  { n: 'Haşlanmış yumurta', u: 'adet', g: 50, k: 72, p: 6.3, c: 0.4, f: 4.8 },
  { n: 'Omlet', u: '2 yumurta', g: 120, k: 185, p: 12.7, c: 0.7, f: 14.3 },
  { n: 'Menemen', u: 'porsiyon', g: 250, k: 263, p: 13.8, c: 11.3, f: 18 },
  { n: 'Sucuklu yumurta', u: 'porsiyon', g: 180, k: 378, p: 22.5, c: 2.7, f: 30.6 },
  { n: 'Beyaz peynir', u: 'dilim', g: 30, k: 79, p: 5.1, c: 0.5, f: 6.3 },
  { n: 'Kaşar peyniri', u: 'dilim', g: 30, k: 107, p: 7.5, c: 0.6, f: 8.3, a: ['kaşar', 'cheddar'] },
  { n: 'Lor peyniri', u: 'kaşık', g: 25, k: 25, p: 3.3, c: 0.9, f: 1 },
  { n: 'Labne', u: 'kaşık', g: 15, k: 37, p: 0.8, c: 0.6, f: 3.5 },
  { n: 'Krem peynir', u: 'kaşık', g: 15, k: 51, p: 0.9, c: 0.8, f: 5.1 },
  { n: 'Yoğurt', u: 'kase', g: 200, k: 122, p: 7, c: 9.4, f: 6.6 },
  { n: 'Süzme yoğurt', u: 'kase', g: 150, k: 146, p: 13.5, c: 6, f: 7.5, a: ['greek yogurt', 'labneli yoğurt'] },
  { n: 'Süt', u: 'bardak', g: 200, k: 122, p: 6.4, c: 9.6, f: 6.6 },
  { n: 'Ayran', u: 'bardak', g: 200, k: 76, p: 4, c: 5.6, f: 4.2 },
  { n: 'Tereyağı', u: 'kaşık', g: 10, k: 72, p: 0.1, c: 0, f: 8.1 },
  { n: 'Zeytinyağı', u: 'kaşık', g: 13.5, k: 119, p: 0, c: 0, f: 13.5 },
  { n: 'Bal', u: 'kaşık', g: 21, k: 64, p: 0.1, c: 17.3, f: 0 },
  { n: 'Reçel', u: 'kaşık', g: 20, k: 50, p: 0.1, c: 13, f: 0 },
  { n: 'Pekmez', u: 'kaşık', g: 20, k: 59, p: 0.2, c: 14.8, f: 0 },
  { n: 'Tahin', u: 'kaşık', g: 15, k: 89, p: 2.6, c: 3.2, f: 8.1 },
  { n: 'Kaymak', u: 'kaşık', g: 15, k: 68, p: 0.5, c: 0.5, f: 7.1 },
  { n: 'Zeytin', u: '5 adet', g: 20, k: 23, p: 0.2, c: 1.3, f: 2.1 },
  { n: 'Ekmek', u: 'dilim', g: 30, k: 80, p: 2.7, c: 14.7, f: 1 },
  { n: 'Tam buğday ekmek', u: 'dilim', g: 30, k: 74, p: 3.9, c: 12.3, f: 1 },
  { n: 'Simit', u: 'adet', g: 110, k: 352, p: 11, c: 63.8, f: 5.5 },
  { n: 'Poğaça', u: 'adet', g: 70, k: 245, p: 4.9, c: 28, f: 12.6 },
  { n: 'Açma', u: 'adet', g: 80, k: 264, p: 6, c: 35.2, f: 11.2 },
  { n: 'Su böreği', u: 'dilim', g: 120, k: 300, p: 10.8, c: 30, f: 14.4 },
  { n: 'Sigara böreği', u: 'adet', g: 25, k: 80, p: 2, c: 7, f: 4.8 },
  { n: 'Gözleme', u: 'adet', g: 180, k: 432, p: 14.4, c: 57.6, f: 16.2 },
  { n: 'Tost', u: 'adet', g: 130, k: 345, p: 15.6, c: 35.1, f: 16.3 },
  { n: 'Yulaf ezmesi', u: 'porsiyon', g: 200, k: 142, p: 5, c: 24, f: 3, a: ['yulaf', 'oatmeal', 'yulaf lapası'] },
  { n: 'Mısır gevreği', u: 'kase', g: 40, k: 151, p: 3, c: 33.6, f: 0.4 },
  { n: 'Granola', u: 'porsiyon', g: 45, k: 212, p: 4.5, c: 28.8, f: 9 },
  // --- Çorbalar ---
  { n: 'Mercimek çorbası', u: 'kase', g: 250, k: 150, p: 8, c: 22, f: 3.5 },
  { n: 'Ezogelin çorbası', u: 'kase', g: 250, k: 160, p: 7, c: 24, f: 4 },
  { n: 'Tavuk çorbası', u: 'kase', g: 250, k: 120, p: 8, c: 12, f: 4 },
  { n: 'Domates çorbası', u: 'kase', g: 250, k: 130, p: 4, c: 18, f: 5 },
  { n: 'Yayla çorbası', u: 'kase', g: 250, k: 140, p: 6, c: 16, f: 6 },
  { n: 'İşkembe çorbası', u: 'kase', g: 250, k: 180, p: 12, c: 8, f: 11 },
  { n: 'Çorba', u: 'kase', g: 250, k: 120, p: 5, c: 15, f: 4 },
  // --- Et / tavuk / balık ---
  { n: 'Tavuk göğsü', u: 'porsiyon', g: 150, k: 248, p: 46.5, c: 0, f: 5.4, a: ['tavuk göğüs', 'tavuk fileto', 'chicken breast'] },
  { n: 'Tavuk but', u: 'porsiyon', g: 150, k: 314, p: 39, c: 0, f: 16.4 },
  { n: 'Tavuk şiş', u: 'porsiyon', g: 150, k: 263, p: 43.5, c: 3, f: 8.3 },
  { n: 'Tavuk döner', u: 'porsiyon', g: 150, k: 323, p: 36, c: 4.5, f: 18 },
  { n: 'Et döner', u: 'porsiyon', g: 150, k: 360, p: 33, c: 3, f: 24 },
  { n: 'İskender', u: 'porsiyon', g: 350, k: 753, p: 38.5, c: 56, f: 40.3 },
  { n: 'Adana kebap', u: 'porsiyon', g: 180, k: 477, p: 34.2, c: 3.6, f: 36.9 },
  { n: 'Urfa kebap', u: 'porsiyon', g: 180, k: 441, p: 36, c: 3.6, f: 32.4 },
  { n: 'Şiş kebap', u: 'porsiyon', g: 180, k: 360, p: 48.6, c: 1.8, f: 18 },
  { n: 'Köfte', u: 'adet', g: 35, k: 81, p: 6, c: 1.1, f: 5.6 },
  { n: 'İzgara köfte', u: 'porsiyon', g: 150, k: 323, p: 27, c: 5.3, f: 21 },
  { n: 'Dana bonfile', u: 'porsiyon', g: 150, k: 318, p: 45, c: 0, f: 14.7 },
  { n: 'Dana kıyma', u: 'porsiyon', g: 120, k: 300, p: 31.2, c: 0, f: 18, a: ['kıyma', 'ground beef'] },
  { n: 'Kuzu pirzola', u: 'porsiyon', g: 150, k: 441, p: 37.5, c: 0, f: 31.5 },
  { n: 'Kavurma', u: 'porsiyon', g: 100, k: 320, p: 28, c: 1, f: 23 },
  { n: 'Somon', u: 'porsiyon', g: 150, k: 309, p: 33.2, c: 0, f: 18.6 },
  { n: 'Levrek', u: 'porsiyon', g: 150, k: 186, p: 35.4, c: 0, f: 3.9 },
  { n: 'Çupra', u: 'porsiyon', g: 150, k: 218, p: 33, c: 0, f: 9 },
  { n: 'Hamsi tava', u: 'porsiyon', g: 150, k: 353, p: 30, c: 9, f: 21.8 },
  { n: 'Ton balığı', u: 'kutu', g: 80, k: 93, p: 20.4, c: 0, f: 0.65, a: ['tuna', 'ton konservesi'] },
  { n: 'Hindi eti', u: 'porsiyon', g: 150, k: 203, p: 45, c: 0, f: 1.1 },
  { n: 'Sosis', u: 'adet', g: 35, k: 105, p: 4.2, c: 1.1, f: 9.1 },
  { n: 'Sucuk', u: 'dilim', g: 12, k: 55, p: 2.6, c: 0.1, f: 4.9 },
  { n: 'Salam', u: 'dilim', g: 15, k: 40, p: 2.4, c: 0.3, f: 3.2 },
  { n: 'Tavuk nugget', u: 'adet', g: 17, k: 50, p: 2.6, c: 3.1, f: 3.1 },
  { n: 'Schnitzel', u: 'porsiyon', g: 180, k: 441, p: 32.4, c: 27, f: 21.6 },
  // --- Tahıl / baklagil / makarna ---
  { n: 'Pilav', u: 'porsiyon', g: 150, k: 255, p: 4.8, c: 48, f: 4.5, a: ['pirinç', 'beyaz pirinç', 'pirinç pilavı', 'tereyağlı pilav'] },
  { n: 'Bulgur pilavı', u: 'porsiyon', g: 150, k: 200, p: 5.7, c: 36, f: 3.8, a: ['bulgur'] },
  { n: 'Sebzeli bulgur', u: 'porsiyon', g: 150, k: 188, p: 5.3, c: 33, f: 3.8 },
  { n: 'Makarna', u: 'porsiyon', g: 180, k: 284, p: 10.4, c: 55.6, f: 1.6, a: ['spagetti', 'penne', 'pasta', 'erişte'] },
  { n: 'Kremalı makarna', u: 'porsiyon', g: 250, k: 463, p: 15, c: 60, f: 17.5 },
  { n: 'Mantı', u: 'porsiyon', g: 250, k: 500, p: 20, c: 67.5, f: 16.3 },
  { n: 'Erişte', u: 'porsiyon', g: 180, k: 288, p: 9.9, c: 50.4, f: 4.5 },
  { n: 'Nohut', u: 'porsiyon', g: 220, k: 319, p: 16.5, c: 46.2, f: 7.7 },
  { n: 'Etli nohut', u: 'porsiyon', g: 250, k: 388, p: 23.8, c: 42.5, f: 13.8 },
  { n: 'Kuru fasulye', u: 'porsiyon', g: 220, k: 286, p: 15.4, c: 44, f: 4.4 },
  { n: 'Etli kuru fasulye', u: 'porsiyon', g: 250, k: 363, p: 21.3, c: 42.5, f: 11.3 },
  { n: 'Mercimek yemeği', u: 'porsiyon', g: 220, k: 253, p: 13.2, c: 37.4, f: 4.4 },
  // --- Sebze yemekleri ---
  { n: 'Zeytinyağlı fasulye', u: 'porsiyon', g: 200, k: 150, p: 4, c: 16, f: 8 },
  { n: 'Türlü', u: 'porsiyon', g: 250, k: 200, p: 5.5, c: 22.5, f: 9.5 },
  { n: 'İmambayıldı', u: 'porsiyon', g: 200, k: 220, p: 3.2, c: 18, f: 15 },
  { n: 'Karnıyarık', u: 'porsiyon', g: 250, k: 288, p: 11.3, c: 18.8, f: 18.8 },
  { n: 'Yaprak sarma', u: 'adet', g: 25, k: 40, p: 0.8, c: 5, f: 1.9 },
  { n: 'Biber dolması', u: 'adet', g: 120, k: 132, p: 3.6, c: 16.8, f: 5.4 },
  { n: 'Ispanak yemeği', u: 'porsiyon', g: 250, k: 150, p: 7.5, c: 13.8, f: 7.5 },
  { n: 'Mücver', u: 'adet', g: 50, k: 88, p: 2.3, c: 6.5, f: 5.8 },
  { n: 'Musakka', u: 'porsiyon', g: 250, k: 275, p: 13.8, c: 18.8, f: 16.3 },
  // --- Salata / patates ---
  { n: 'Çoban salata', u: 'porsiyon', g: 150, k: 68, p: 1.5, c: 6, f: 4.2 },
  { n: 'Mevsim salata', u: 'porsiyon', g: 150, k: 60, p: 1.5, c: 6, f: 3.6 },
  { n: 'Domates', u: 'adet', g: 120, k: 22, p: 1.1, c: 4.7, f: 0.2 },
  { n: 'Salatalık', u: 'adet', g: 130, k: 21, p: 0.9, c: 4.7, f: 0.3 },
  { n: 'Haşlanmış patates', u: 'adet', g: 135, k: 117, p: 2.6, c: 27.1, f: 0.1 },
  { n: 'Patates kızartması', u: 'porsiyon', g: 150, k: 468, p: 5.1, c: 61.5, f: 22.5 },
  { n: 'Avokado', u: 'yarım', g: 100, k: 160, p: 2, c: 8.5, f: 14.7 },
  // --- Meyveler ---
  { n: 'Muz', u: 'adet', g: 118, k: 105, p: 1.3, c: 26.9, f: 0.4 },
  { n: 'Elma', u: 'adet', g: 150, k: 78, p: 0.5, c: 20.7, f: 0.3 },
  { n: 'Portakal', u: 'adet', g: 130, k: 61, p: 1.2, c: 15.3, f: 0.1 },
  { n: 'Mandalina', u: 'adet', g: 90, k: 48, p: 0.7, c: 12, f: 0.3 },
  { n: 'Armut', u: 'adet', g: 165, k: 94, p: 0.7, c: 25.1, f: 0.2 },
  { n: 'Üzüm', u: 'kase', g: 150, k: 104, p: 1.1, c: 27.2, f: 0.3 },
  { n: 'Çilek', u: 'kase', g: 150, k: 48, p: 1.1, c: 11.6, f: 0.5 },
  { n: 'Karpuz', u: 'dilim', g: 280, k: 84, p: 1.7, c: 21.3, f: 0.6 },
  { n: 'Kavun', u: 'dilim', g: 200, k: 68, p: 1.6, c: 16.4, f: 0.4 },
  { n: 'Kiraz', u: 'kase', g: 150, k: 95, p: 1.7, c: 24, f: 0.3 },
  { n: 'Şeftali', u: 'adet', g: 150, k: 59, p: 1.4, c: 14.3, f: 0.5 },
  { n: 'Kayısı', u: 'adet', g: 35, k: 17, p: 0.5, c: 3.9, f: 0.1 },
  { n: 'İncir', u: 'adet', g: 50, k: 37, p: 0.4, c: 9.6, f: 0.2 },
  { n: 'Nar', u: 'adet', g: 150, k: 125, p: 2.6, c: 28.1, f: 1.8 },
  { n: 'Kivi', u: 'adet', g: 75, k: 46, p: 0.8, c: 11, f: 0.4 },
  // --- Kuruyemiş / atıştırma ---
  { n: 'Fındık', u: '10 adet', g: 12, k: 75, p: 1.8, c: 2, f: 7.3 },
  { n: 'Badem', u: '10 adet', g: 12, k: 69, p: 2.5, c: 2.6, f: 6 },
  { n: 'Ceviz', u: '2 yarım', g: 5, k: 33, p: 0.8, c: 0.7, f: 3.3 },
  { n: 'Antep fıstığı', u: 'avuç', g: 30, k: 168, p: 6.1, c: 8.2, f: 13.6 },
  { n: 'Yer fıstığı', u: 'avuç', g: 30, k: 170, p: 7.7, c: 4.8, f: 14.8 },
  { n: 'Leblebi', u: 'avuç', g: 30, k: 111, p: 6.3, c: 18, f: 1.8 },
  { n: 'Kuru üzüm', u: 'avuç', g: 30, k: 90, p: 0.9, c: 23.8, f: 0.2 },
  { n: 'Kuru kayısı', u: 'adet', g: 8, k: 19, p: 0.3, c: 5, f: 0 },
  { n: 'Hurma', u: 'adet', g: 10, k: 28, p: 0.2, c: 7.5, f: 0 },
  // --- Tatlılar / atıştırmalık ---
  { n: 'Baklava', u: 'dilim', g: 60, k: 258, p: 3.3, c: 30, f: 13.8 },
  { n: 'Künefe', u: 'porsiyon', g: 150, k: 480, p: 11.3, c: 57, f: 23.3 },
  { n: 'Sütlaç', u: 'kase', g: 200, k: 220, p: 6, c: 38, f: 5 },
  { n: 'Kazandibi', u: 'porsiyon', g: 150, k: 233, p: 6, c: 40.5, f: 5.3 },
  { n: 'Dondurma', u: 'top', g: 60, k: 124, p: 2.1, c: 14.4, f: 6.6 },
  { n: 'Kek', u: 'dilim', g: 80, k: 280, p: 3.6, c: 40.8, f: 11.2 },
  { n: 'Kurabiye', u: 'adet', g: 15, k: 71, p: 0.8, c: 9, f: 3.5 },
  { n: 'Lokum', u: 'adet', g: 10, k: 34, p: 0.1, c: 8.4, f: 0 },
  { n: 'Tahin helva', u: 'dilim', g: 40, k: 206, p: 5, c: 18.4, f: 12.6 },
  { n: 'Profiterol', u: 'porsiyon', g: 120, k: 348, p: 6, c: 38.4, f: 19.2 },
  { n: 'Çikolata', u: 'parça', g: 10, k: 54, p: 0.7, c: 5.9, f: 3 },
  { n: 'Çikolatalı gofret', u: 'adet', g: 25, k: 125, p: 1.4, c: 15, f: 6.5 },
  { n: 'Bisküvi', u: 'adet', g: 10, k: 47, p: 0.7, c: 7, f: 1.8 },
  { n: 'Kraker', u: 'adet', g: 3, k: 13, p: 0.3, c: 2.1, f: 0.4 },
  { n: 'Patlamış mısır', u: 'kase', g: 25, k: 97, p: 3.2, c: 19.5, f: 1.1 },
  { n: 'Cips', u: 'paket', g: 30, k: 161, p: 2, c: 15.9, f: 10.4 },
  // --- Fast food / sokak ---
  { n: 'Döner (ekmek arası)', u: 'adet', g: 250, k: 588, p: 30, c: 60, f: 25 },
  { n: 'Tavuk dürüm', u: 'adet', g: 250, k: 488, p: 30, c: 55, f: 16.3 },
  { n: 'Pizza', u: 'dilim', g: 110, k: 293, p: 12.1, c: 36.3, f: 11 },
  { n: 'Hamburger', u: 'adet', g: 180, k: 450, p: 23.4, c: 43.2, f: 20.7 },
  { n: 'Lahmacun', u: 'adet', g: 130, k: 299, p: 12.4, c: 39, f: 9.8 },
  { n: 'Kıymalı pide', u: 'porsiyon', g: 250, k: 600, p: 26.3, c: 70, f: 23.8 },
  { n: 'Kumpir', u: 'adet', g: 350, k: 578, p: 14, c: 77, f: 22.8 },
  { n: 'Tantuni', u: 'porsiyon', g: 250, k: 475, p: 27.5, c: 50, f: 18.8 },
  { n: 'Çiğ köfte dürüm', u: 'adet', g: 180, k: 315, p: 9, c: 57.6, f: 4.5 },
  { n: 'Midye dolma', u: 'adet', g: 25, k: 39, p: 1, c: 5.5, f: 1.4 },
  { n: 'Tavuk kanat', u: 'adet', g: 30, k: 87, p: 8.1, c: 0, f: 5.9 },
  // --- İçecekler ---
  { n: 'Çay', u: 'bardak', g: 200, k: 2, p: 0, c: 0.4, f: 0 },
  { n: 'Türk kahvesi', u: 'fincan', g: 70, k: 5, p: 0.2, c: 0.8, f: 0 },
  { n: 'Filtre kahve', u: 'bardak', g: 200, k: 4, p: 0.4, c: 0.6, f: 0 },
  { n: 'Latte', u: 'bardak', g: 300, k: 129, p: 6.9, c: 10.5, f: 6.9 },
  { n: 'Cappuccino', u: 'bardak', g: 200, k: 80, p: 4.4, c: 6.4, f: 4.2 },
  { n: 'Kola', u: 'kutu', g: 330, k: 139, p: 0, c: 35, f: 0 },
  { n: 'Kola (light)', u: 'kutu', g: 330, k: 1, p: 0, c: 0, f: 0, a: ['diyet kola', 'zero kola', 'cola zero'] },
  { n: 'Meyve suyu', u: 'bardak', g: 200, k: 90, p: 1, c: 21, f: 0.2 },
  { n: 'Limonata', u: 'bardak', g: 250, k: 100, p: 0.3, c: 25, f: 0 },
  { n: 'Soda', u: 'şişe', g: 200, k: 0, p: 0, c: 0, f: 0 },
  { n: 'Su', u: 'bardak', g: 200, k: 0, p: 0, c: 0, f: 0 },
  { n: 'Şalgam', u: 'bardak', g: 200, k: 20, p: 0.8, c: 4, f: 0 },
  { n: 'Milkshake', u: 'bardak', g: 300, k: 336, p: 10.5, c: 52.5, f: 9 },
  { n: 'Enerji içeceği', u: 'kutu', g: 250, k: 113, p: 0, c: 27.5, f: 0 },
  { n: 'Bira', u: 'şişe', g: 330, k: 142, p: 1.7, c: 11.9, f: 0 },
  { n: 'Şarap', u: 'kadeh', g: 150, k: 125, p: 0.2, c: 3.9, f: 0 },
  { n: 'Rakı', u: 'kadeh', g: 50, k: 123, p: 0, c: 0, f: 0 },
  { n: 'Şeker', u: 'küp', g: 3, k: 12, p: 0, c: 3, f: 0 },
  { n: 'Sahanda yumurta', u: 'adet', g: 55, k: 108, p: 7.5, c: 0.4, f: 8.4 },
  { n: 'Çılbır', u: 'porsiyon', g: 250, k: 295, p: 16.3, c: 8.8, f: 21.3 },
  { n: 'Tulum peyniri', u: 'dilim', g: 25, k: 93, p: 6, c: 0.4, f: 7.5 },
  { n: 'Dil peyniri', u: 'dilim', g: 25, k: 75, p: 5.8, c: 0.4, f: 5.5 },
  { n: 'Çökelek', u: 'porsiyon', g: 60, k: 66, p: 9.6, c: 1.8, f: 2.1 },
  { n: 'Kefir', u: 'bardak', g: 200, k: 110, p: 6.6, c: 9, f: 5 },
  { n: 'Bazlama', u: 'dilim', g: 60, k: 161, p: 4.8, c: 31.2, f: 1.8 },
  { n: 'Krep', u: 'adet', g: 60, k: 132, p: 3.6, c: 16.8, f: 5.1 },
  { n: 'Pankek', u: 'adet', g: 50, k: 114, p: 3.2, c: 14.2, f: 4.9 },
  { n: 'Waffle', u: 'adet', g: 80, k: 232, p: 5.2, c: 26.4, f: 11.6 },
  { n: 'Yumurta akı', u: 'adet', g: 33, k: 17, p: 3.6, c: 0.2, f: 0.1, a: ['yumurta beyazı', 'egg white', 'yumurtanın beyazı'] },
  { n: 'Chia puding', u: 'kase', g: 200, k: 210, p: 7, c: 24, f: 10 },
  { n: 'Müsli', u: 'kase', g: 50, k: 190, p: 5, c: 33, f: 4 },
  { n: 'Kahvaltı tabağı', u: 'porsiyon', g: 300, k: 530, p: 24, c: 33, f: 33 },
  { n: 'Peynirli börek', u: 'dilim', g: 100, k: 285, p: 8.5, c: 27, f: 15.5 },
  { n: 'Tarhana çorbası', u: 'kase', g: 250, k: 138, p: 5, c: 22.5, f: 3 },
  { n: 'Mantar çorbası', u: 'kase', g: 250, k: 110, p: 3, c: 12, f: 6 },
  { n: 'Düğün çorbası', u: 'kase', g: 250, k: 163, p: 7.5, c: 12.5, f: 8.8 },
  { n: 'Brokoli çorbası', u: 'kase', g: 250, k: 113, p: 4.5, c: 12.5, f: 5.5 },
  { n: 'Şehriye çorbası', u: 'kase', g: 250, k: 125, p: 4.5, c: 21.3, f: 2.5 },
  { n: 'Tavuk pirzola', u: 'porsiyon', g: 150, k: 293, p: 39, c: 2.3, f: 14.3 },
  { n: 'Tavuk sote', u: 'porsiyon', g: 220, k: 330, p: 37.4, c: 11, f: 15.4 },
  { n: 'Et sote', u: 'porsiyon', g: 220, k: 385, p: 38.5, c: 11, f: 20.9 },
  { n: 'Ciğer tava', u: 'porsiyon', g: 120, k: 276, p: 26.4, c: 9.6, f: 13.8 },
  { n: 'Kokoreç', u: 'porsiyon', g: 120, k: 330, p: 18, c: 6, f: 26.4 },
  { n: 'Köri tavuk', u: 'porsiyon', g: 250, k: 388, p: 35, c: 15, f: 21.3 },
  { n: 'Kuzu tandır', u: 'porsiyon', g: 150, k: 383, p: 37.5, c: 0, f: 25.5 },
  { n: 'Beyti kebap', u: 'porsiyon', g: 200, k: 460, p: 32, c: 20, f: 28 },
  { n: 'Çöp şiş', u: 'şiş', g: 30, k: 66, p: 7.2, c: 0.3, f: 3.9 },
  { n: 'Etli ekmek', u: 'dilim', g: 100, k: 235, p: 11, c: 27, f: 9 },
  { n: 'Karides', u: 'porsiyon', g: 100, k: 99, p: 24, c: 0.2, f: 0.3 },
  { n: 'Kalamar tava', u: 'porsiyon', g: 150, k: 345, p: 24.8, c: 22.5, f: 17.3 },
  { n: 'Midye tava', u: 'porsiyon', g: 150, k: 368, p: 18, c: 33, f: 18.8 },
  { n: 'Balık ızgara', u: 'porsiyon', g: 150, k: 218, p: 34.5, c: 0, f: 8.3 },
  { n: 'Uskumru', u: 'porsiyon', g: 150, k: 393, p: 35.9, c: 0, f: 26.7 },
  { n: 'Palamut', u: 'porsiyon', g: 150, k: 293, p: 36, c: 0, f: 15.8 },
  { n: 'Tavuk haşlama', u: 'porsiyon', g: 150, k: 248, p: 46.5, c: 0, f: 5.4 },
  { n: 'Kinoa', u: 'porsiyon', g: 150, k: 180, p: 6.6, c: 32, f: 2.9, a: ['quinoa'] },
  { n: 'Kahverengi pilav', u: 'porsiyon', g: 150, k: 185, p: 4.1, c: 38.4, f: 1.5, a: ['esmer pirinç', 'kahverengi pirinç', 'brown rice', 'tam tahıllı pirinç'] },
  { n: 'Tam buğday makarna', u: 'porsiyon', g: 180, k: 223, p: 9.5, c: 47.7, f: 0.9, a: ['kepekli makarna', 'whole wheat pasta'] },
  { n: 'Kuskus', u: 'porsiyon', g: 150, k: 168, p: 5.7, c: 34.8, f: 0.3 },
  { n: 'Fırın makarna', u: 'porsiyon', g: 250, k: 438, p: 20, c: 50, f: 17.5 },
  { n: 'Lazanya', u: 'porsiyon', g: 250, k: 413, p: 21.3, c: 37.5, f: 18.8 },
  { n: 'Mercimek köftesi', u: 'adet', g: 30, k: 45, p: 1.5, c: 7.2, f: 1.1 },
  { n: 'Falafel', u: 'adet', g: 17, k: 57, p: 2.3, c: 5.4, f: 3 },
  { n: 'Humus', u: 'porsiyon', g: 80, k: 133, p: 6.3, c: 11.4, f: 7.7 },
  { n: 'Kısır', u: 'porsiyon', g: 150, k: 218, p: 5.3, c: 36, f: 6 },
  { n: 'Noodle', u: 'porsiyon', g: 200, k: 280, p: 9, c: 44, f: 8 },
  { n: 'İçli köfte', u: 'adet', g: 70, k: 140, p: 5.6, c: 15.4, f: 6.3 },
  { n: 'Lahmacun dürüm', u: 'adet', g: 200, k: 365, p: 16, c: 48, f: 12 },
  { n: 'Brokoli', u: 'porsiyon', g: 150, k: 53, p: 3.6, c: 10.8, f: 0.6 },
  { n: 'Karnabahar', u: 'porsiyon', g: 200, k: 50, p: 3.8, c: 10, f: 0.6 },
  { n: 'Kabak yemeği', u: 'porsiyon', g: 250, k: 138, p: 3.8, c: 15, f: 7.5 },
  { n: 'Bezelye yemeği', u: 'porsiyon', g: 250, k: 188, p: 8.8, c: 25, f: 6.3 },
  { n: 'Enginar', u: 'porsiyon', g: 200, k: 120, p: 4, c: 18, f: 3 },
  { n: 'Pırasa yemeği', u: 'porsiyon', g: 250, k: 150, p: 3.8, c: 20, f: 7.5 },
  { n: 'Lahana sarma', u: 'adet', g: 40, k: 52, p: 1.4, c: 6, f: 2.4 },
  { n: 'Közlenmiş patlıcan', u: 'porsiyon', g: 200, k: 110, p: 2.4, c: 12, f: 6 },
  { n: 'Sebze sote', u: 'porsiyon', g: 200, k: 150, p: 4, c: 17, f: 7.6 },
  { n: 'Etli kabak', u: 'porsiyon', g: 250, k: 213, p: 13.8, c: 13.8, f: 11.3 },
  { n: 'Roka salata', u: 'porsiyon', g: 150, k: 60, p: 2.3, c: 4.5, f: 3.8 },
  { n: 'Sezar salata', u: 'porsiyon', g: 200, k: 290, p: 12, c: 12, f: 22 },
  { n: 'Ton balıklı salata', u: 'porsiyon', g: 200, k: 220, p: 20, c: 10, f: 11 },
  { n: 'Yeşil salata', u: 'porsiyon', g: 150, k: 60, p: 2, c: 5.3, f: 3.8 },
  { n: 'Patates püresi', u: 'porsiyon', g: 200, k: 220, p: 4, c: 30, f: 9 },
  { n: 'Fırın patates', u: 'porsiyon', g: 150, k: 140, p: 3.8, c: 31.8, f: 0.2 },
  { n: 'Tatlı patates', u: 'porsiyon', g: 150, k: 135, p: 3, c: 31.1, f: 0.2 },
  { n: 'Ananas', u: 'dilim', g: 120, k: 60, p: 0.6, c: 15.7, f: 0.1 },
  { n: 'Mango', u: 'adet', g: 200, k: 120, p: 1.6, c: 30, f: 0.8 },
  { n: 'Böğürtlen', u: 'kase', g: 150, k: 65, p: 2.1, c: 14.4, f: 0.8 },
  { n: 'Yaban mersini', u: 'kase', g: 150, k: 86, p: 1.1, c: 21.8, f: 0.5 },
  { n: 'Greyfurt', u: 'adet', g: 230, k: 97, p: 1.8, c: 24.6, f: 0.2 },
  { n: 'Erik', u: 'adet', g: 65, k: 30, p: 0.5, c: 7.4, f: 0.2 },
  { n: 'Vişne', u: 'kase', g: 150, k: 75, p: 1.5, c: 18.3, f: 0.5 },
  { n: 'Ahududu', u: 'kase', g: 150, k: 78, p: 1.8, c: 17.9, f: 1.1 },
  { n: 'Limon', u: 'adet', g: 58, k: 17, p: 0.6, c: 5.4, f: 0.2 },
  { n: 'Kaju', u: 'avuç', g: 30, k: 166, p: 5.5, c: 9.1, f: 13.2 },
  { n: 'Ay çekirdeği', u: 'avuç', g: 30, k: 175, p: 6.2, c: 6, f: 15.5 },
  { n: 'Kabak çekirdeği', u: 'avuç', g: 30, k: 168, p: 9.1, c: 3.2, f: 14.7 },
  { n: 'Karışık kuruyemiş', u: 'avuç', g: 30, k: 178, p: 5.7, c: 6.3, f: 15.3 },
  { n: 'Protein bar', u: 'adet', g: 50, k: 200, p: 20, c: 20, f: 7 },
  { n: 'Granola bar', u: 'adet', g: 30, k: 120, p: 2.4, c: 19.8, f: 3.9 },
  { n: 'Meyveli yoğurt', u: 'kase', g: 125, k: 119, p: 4.3, c: 18.8, f: 3.1 },
  { n: 'Protein tozu', u: 'ölçek', g: 30, k: 117, p: 23.4, c: 2.4, f: 1.5, a: ['whey', 'protein shake', 'protein tozu konsantre'] },
  { n: 'Revani', u: 'dilim', g: 80, k: 264, p: 3.6, c: 44, f: 8 },
  { n: 'Şekerpare', u: 'adet', g: 50, k: 150, p: 2, c: 26, f: 4.5 },
  { n: 'Tulumba', u: 'adet', g: 40, k: 140, p: 1.2, c: 22, f: 5.2 },
  { n: 'Aşure', u: 'kase', g: 200, k: 250, p: 5, c: 52, f: 4 },
  { n: 'Güllaç', u: 'porsiyon', g: 150, k: 218, p: 4.5, c: 39, f: 4.5 },
  { n: 'Supangle', u: 'kase', g: 150, k: 263, p: 5.3, c: 36, f: 10.5 },
  { n: 'Trileçe', u: 'dilim', g: 100, k: 320, p: 5, c: 40, f: 15 },
  { n: 'Magnolia', u: 'kase', g: 150, k: 345, p: 6, c: 49.5, f: 14.3 },
  { n: 'Cheesecake', u: 'dilim', g: 100, k: 320, p: 6, c: 30, f: 20 },
  { n: 'Brownie', u: 'adet', g: 60, k: 280, p: 3.6, c: 36, f: 13.8 },
  { n: 'Tiramisu', u: 'porsiyon', g: 120, k: 340, p: 5.4, c: 32.4, f: 20.4 },
  { n: 'Muffin', u: 'adet', g: 70, k: 264, p: 3.9, c: 36.4, f: 11.6 },
  { n: 'Donut', u: 'adet', g: 60, k: 253, p: 3, c: 30.6, f: 13.2 },
  { n: 'İrmik helvası', u: 'porsiyon', g: 100, k: 330, p: 4, c: 52, f: 12 },
  { n: 'Ekmek kadayıfı', u: 'porsiyon', g: 150, k: 450, p: 6, c: 72, f: 16.5 },
  { n: 'Sushi', u: 'porsiyon', g: 200, k: 290, p: 12, c: 52, f: 3 },
  { n: 'Wrap', u: 'adet', g: 220, k: 462, p: 22, c: 52.8, f: 18.7 },
  { n: 'Club sandviç', u: 'porsiyon', g: 250, k: 613, p: 30, c: 60, f: 28.8 },
  { n: 'Sandviç', u: 'adet', g: 180, k: 414, p: 18, c: 50.4, f: 15.3 },
  { n: 'Sosisli sandviç', u: 'adet', g: 140, k: 350, p: 12.6, c: 33.6, f: 18.2 },
  { n: 'Kaşarlı pide', u: 'porsiyon', g: 250, k: 613, p: 23.8, c: 67.5, f: 26.3 },
  { n: 'Kuşbaşılı pide', u: 'porsiyon', g: 250, k: 563, p: 27.5, c: 60, f: 23.8 },
  { n: 'Sucuklu pide', u: 'porsiyon', g: 250, k: 588, p: 25, c: 60, f: 27.5 },
  { n: 'Cheeseburger', u: 'adet', g: 200, k: 520, p: 27, c: 48, f: 26 },
  { n: 'Tavuk burger', u: 'adet', g: 200, k: 470, p: 26, c: 48, f: 20 },
  { n: 'Balık ekmek', u: 'adet', g: 220, k: 440, p: 26.4, c: 48.4, f: 15.4 },
  { n: 'Çiğ köfte', u: 'porsiyon', g: 120, k: 204, p: 5.4, c: 39.6, f: 2.4 },
  { n: 'Smoothie', u: 'bardak', g: 300, k: 180, p: 3.9, c: 37.5, f: 1.8 },
  { n: 'Yeşil çay', u: 'bardak', g: 200, k: 2, p: 0, c: 0.4, f: 0 },
  { n: 'Bitki çayı', u: 'bardak', g: 200, k: 2, p: 0, c: 0.4, f: 0 },
  { n: 'Sıcak çikolata', u: 'bardak', g: 250, k: 225, p: 7.5, c: 32.5, f: 7.5 },
  { n: 'Salep', u: 'bardak', g: 200, k: 180, p: 5, c: 32, f: 4 },
  { n: 'Boza', u: 'bardak', g: 200, k: 130, p: 2, c: 28, f: 0.4 },
  { n: 'Soğuk kahve', u: 'bardak', g: 300, k: 135, p: 4.5, c: 18, f: 5.4 },
  { n: 'Americano', u: 'bardak', g: 200, k: 4, p: 0.4, c: 0.6, f: 0 },
  { n: 'Espresso', u: 'fincan', g: 30, k: 3, p: 0.1, c: 0.5, f: 0.1 },
  { n: 'Bubble tea', u: 'bardak', g: 300, k: 270, p: 1.8, c: 57, f: 3.6 },
  { n: 'Maden suyu', u: 'şişe', g: 200, k: 0, p: 0, c: 0, f: 0 },
  // === Genisletme (Tem 2026) — yaygin Turk yemekleri, per-porsiyon ===
  { n: 'Sahanda sucuk', u: 'porsiyon', g: 60, k: 276, p: 13.2, c: 0.6, f: 24.6 },
  { n: 'Peynirli omlet', u: 'porsiyon', g: 150, k: 285, p: 18.8, c: 2.3, f: 22.5 },
  { n: 'Kaygana', u: 'porsiyon', g: 120, k: 228, p: 8.4, c: 18, f: 13.8 },
  { n: 'Bal kaymak', u: 'porsiyon', g: 100, k: 375, p: 3, c: 27, f: 28.5 },
  { n: 'Sucuklu tost', u: 'adet', g: 150, k: 428, p: 18.8, c: 37.5, f: 23.3 },
  { n: 'Karışık tost', u: 'adet', g: 150, k: 413, p: 18.8, c: 33, f: 24 },
  { n: 'Yumurtalı ekmek', u: 'porsiyon', g: 120, k: 262, p: 10.2, c: 21.6, f: 13.5 },
  { n: 'Pişi', u: 'adet', g: 40, k: 120, p: 2.8, c: 15.2, f: 5.2 },
  { n: 'Lavaş', u: 'adet', g: 60, k: 165, p: 5.1, c: 33, f: 1.2 },
  { n: 'Yufka', u: 'adet', g: 40, k: 120, p: 3.4, c: 24, f: 1 },
  { n: 'Ramazan pidesi', u: 'dilim', g: 60, k: 162, p: 5.1, c: 31.2, f: 1.5 },
  { n: 'Mısır ekmeği', u: 'dilim', g: 35, k: 93, p: 2.3, c: 17.5, f: 1.4 },
  { n: 'Sebze çorbası', u: 'kase', g: 250, k: 100, p: 3.3, c: 15, f: 3 },
  { n: 'Paça çorbası', u: 'kase', g: 250, k: 150, p: 12.5, c: 2.5, f: 10 },
  { n: 'Analı kızlı', u: 'kase', g: 250, k: 263, p: 11.3, c: 35, f: 8.8 },
  { n: 'Balık çorbası', u: 'kase', g: 250, k: 138, p: 12.5, c: 8.8, f: 5.5 },
  { n: 'Hünkar beğendi', u: 'porsiyon', g: 250, k: 388, p: 25, c: 17.5, f: 23.8 },
  { n: 'Tas kebabı', u: 'porsiyon', g: 250, k: 350, p: 27.5, c: 13.8, f: 20 },
  { n: 'Orman kebabı', u: 'porsiyon', g: 250, k: 363, p: 25, c: 17.5, f: 21.3 },
  { n: 'Güveç', u: 'porsiyon', g: 250, k: 325, p: 25, c: 20, f: 16.3 },
  { n: 'Saç kavurma', u: 'porsiyon', g: 200, k: 360, p: 30, c: 8, f: 23 },
  { n: 'Ali nazik', u: 'porsiyon', g: 250, k: 388, p: 22.5, c: 13.8, f: 26.3 },
  { n: 'Çökertme kebabı', u: 'porsiyon', g: 300, k: 570, p: 30, c: 42, f: 30 },
  { n: 'Testi kebabı', u: 'porsiyon', g: 250, k: 388, p: 27.5, c: 16.3, f: 23.8 },
  { n: 'Cağ kebabı', u: 'porsiyon', g: 150, k: 330, p: 33, c: 1.5, f: 21 },
  { n: 'Patlıcan kebabı', u: 'porsiyon', g: 250, k: 375, p: 21.3, c: 16.3, f: 25 },
  { n: 'Yoğurtlu kebap', u: 'porsiyon', g: 300, k: 525, p: 28.5, c: 39, f: 28.5 },
  { n: 'Kadınbudu köfte', u: 'porsiyon', g: 150, k: 330, p: 20.3, c: 13.5, f: 21.8 },
  { n: 'İzmir köfte', u: 'porsiyon', g: 250, k: 338, p: 21.3, c: 15, f: 20 },
  { n: 'Terbiyeli köfte', u: 'porsiyon', g: 250, k: 363, p: 26.3, c: 17.5, f: 20 },
  { n: 'Etli patates', u: 'porsiyon', g: 250, k: 300, p: 16.3, c: 27.5, f: 13.8 },
  { n: 'Etli bamya', u: 'porsiyon', g: 250, k: 213, p: 12.5, c: 16.3, f: 11.3 },
  { n: 'Kapuska', u: 'porsiyon', g: 250, k: 238, p: 12.5, c: 20, f: 11.3 },
  { n: 'Lahana yemeği', u: 'porsiyon', g: 250, k: 200, p: 8.8, c: 18.8, f: 10 },
  { n: 'Köfte ekmek', u: 'porsiyon', g: 220, k: 460, p: 25, c: 50, f: 19 },
  { n: 'Tavuklu pilav', u: 'porsiyon', g: 250, k: 438, p: 23.8, c: 55, f: 13.8 },
  { n: 'Nohutlu pilav', u: 'porsiyon', g: 200, k: 380, p: 10, c: 60, f: 11 },
  { n: 'İç pilav', u: 'porsiyon', g: 200, k: 370, p: 7, c: 58, f: 12 },
  { n: 'Şehriyeli pilav', u: 'porsiyon', g: 200, k: 350, p: 7, c: 60, f: 9 },
  { n: 'Perde pilavı', u: 'porsiyon', g: 250, k: 525, p: 16.3, c: 60, f: 25 },
  { n: 'Zeytinyağlı barbunya', u: 'porsiyon', g: 200, k: 210, p: 9, c: 28, f: 7 },
  { n: 'Zeytinyağlı pırasa', u: 'porsiyon', g: 200, k: 140, p: 3, c: 18, f: 7 },
  { n: 'Kuru bamya', u: 'porsiyon', g: 250, k: 175, p: 7.5, c: 20, f: 7.5 },
  { n: 'Semizotu yemeği', u: 'porsiyon', g: 250, k: 163, p: 6.3, c: 13.8, f: 8.8 },
  { n: 'Kereviz yemeği', u: 'porsiyon', g: 250, k: 150, p: 3.8, c: 20, f: 6.3 },
  { n: 'Bakla yemeği', u: 'porsiyon', g: 200, k: 190, p: 9, c: 24, f: 6 },
  { n: 'Barbunya pilaki', u: 'porsiyon', g: 200, k: 220, p: 10, c: 30, f: 7 },
  { n: 'Şakşuka', u: 'porsiyon', g: 200, k: 260, p: 4, c: 18, f: 19 },
  { n: 'Patlıcan kızartması', u: 'porsiyon', g: 150, k: 248, p: 3, c: 16.5, f: 18.8 },
  { n: 'Kabak kızartması', u: 'porsiyon', g: 200, k: 260, p: 4, c: 20, f: 18 },
  { n: 'Biber kızartması', u: 'porsiyon', g: 200, k: 240, p: 3, c: 16, f: 18 },
  { n: 'Fırında sebze', u: 'porsiyon', g: 250, k: 213, p: 6.3, c: 25, f: 10 },
  { n: 'Karnabahar kızartma', u: 'porsiyon', g: 200, k: 270, p: 7, c: 22, f: 17 },
  { n: 'Börülce yemeği', u: 'porsiyon', g: 200, k: 200, p: 10, c: 26, f: 6 },
  { n: 'Fava', u: 'porsiyon', g: 150, k: 195, p: 9, c: 22.5, f: 7.5 },
  { n: 'Piyaz', u: 'porsiyon', g: 200, k: 240, p: 10, c: 24, f: 12 },
  { n: 'Haydari', u: 'porsiyon', g: 60, k: 105, p: 3.6, c: 2.4, f: 9 },
  { n: 'Acılı ezme', u: 'porsiyon', g: 100, k: 55, p: 1.2, c: 6, f: 3 },
  { n: 'Patlıcan salatası', u: 'porsiyon', g: 150, k: 135, p: 2.3, c: 9, f: 9.8 },
  { n: 'Rus salatası', u: 'porsiyon', g: 150, k: 233, p: 3, c: 16.5, f: 17.3 },
  { n: 'Cacık', u: 'kase', g: 200, k: 90, p: 4.4, c: 7, f: 4.8 },
  { n: 'Közlenmiş biber', u: 'porsiyon', g: 150, k: 83, p: 1.5, c: 9, f: 4.5 },
  { n: 'Balık buğulama', u: 'porsiyon', g: 200, k: 240, p: 36, c: 6, f: 8 },
  { n: 'Karides güveç', u: 'porsiyon', g: 250, k: 288, p: 27.5, c: 12.5, f: 13.8 },
  { n: 'Alabalık', u: 'porsiyon', g: 150, k: 222, p: 31.2, c: 0, f: 9.9 },
  { n: 'Sardalya', u: 'porsiyon', g: 100, k: 208, p: 24.6, c: 0, f: 11.5 },
  { n: 'İstavrit tava', u: 'porsiyon', g: 150, k: 315, p: 30, c: 9, f: 17.3 },
  { n: 'Lüfer', u: 'porsiyon', g: 150, k: 239, p: 38.6, c: 0, f: 8.3 },
  { n: 'Kızarmış tavuk', u: 'porsiyon', g: 150, k: 390, p: 36, c: 13.5, f: 21.8 },
  { n: 'Çıtır tavuk', u: 'porsiyon', g: 150, k: 398, p: 30, c: 21, f: 21.8 },
  { n: 'Et dürüm', u: 'dürüm', g: 280, k: 560, p: 30.8, c: 61.6, f: 22.4 },
  { n: 'Adana dürüm', u: 'dürüm', g: 280, k: 602, p: 30.8, c: 58.8, f: 28 },
  { n: 'Nachos', u: 'porsiyon', g: 80, k: 384, p: 5.6, c: 41.6, f: 20.8 },
  { n: 'Quesadilla', u: 'porsiyon', g: 180, k: 522, p: 22.5, c: 45, f: 27 },
  { n: 'Burrito', u: 'porsiyon', g: 250, k: 538, p: 22.5, c: 65, f: 20 },
  { n: 'Taco', u: 'adet', g: 90, k: 198, p: 8.6, c: 18, f: 9.9 },
  { n: 'Kadayıf', u: 'porsiyon', g: 150, k: 480, p: 7.5, c: 63, f: 22.5 },
  { n: 'Şöbiyet', u: 'porsiyon', g: 70, k: 301, p: 4.9, c: 29.4, f: 18.2 },
  { n: 'Kalburabastı', u: 'adet', g: 50, k: 170, p: 2, c: 26, f: 6.5 },
  { n: 'Lokma', u: 'porsiyon', g: 60, k: 204, p: 2.7, c: 30, f: 8.4 },
  { n: 'Höşmerim', u: 'porsiyon', g: 120, k: 318, p: 9.6, c: 32.4, f: 16.8 },
  { n: 'Katmer', u: 'porsiyon', g: 120, k: 480, p: 9.6, c: 45.6, f: 28.8 },
  { n: 'Cezerye', u: 'adet', g: 20, k: 75, p: 0.7, c: 12.4, f: 2.4 },
  { n: 'Pişmaniye', u: 'porsiyon', g: 40, k: 192, p: 2, c: 24, f: 9.6 },
  { n: 'Kabak tatlısı', u: 'porsiyon', g: 150, k: 225, p: 1.5, c: 45, f: 4.5 },
  { n: 'Ayva tatlısı', u: 'porsiyon', g: 150, k: 203, p: 0.8, c: 48, f: 2.3 },
  { n: 'İncir tatlısı', u: 'porsiyon', g: 120, k: 240, p: 3, c: 48, f: 4.8 },
  { n: 'Muhallebi', u: 'porsiyon', g: 150, k: 180, p: 4.5, c: 31.5, f: 3.8 },
  { n: 'Keşkül', u: 'porsiyon', g: 150, k: 218, p: 5.3, c: 33, f: 6.8 },
  { n: 'Tavuk göğsü tatlısı', u: 'porsiyon', g: 150, k: 203, p: 6, c: 34.5, f: 3.8 },
  { n: 'Kemalpaşa tatlısı', u: 'porsiyon', g: 60, k: 192, p: 3.3, c: 33, f: 4.8 },
  { n: 'Vezir parmağı', u: 'porsiyon', g: 60, k: 204, p: 2.4, c: 31.2, f: 7.8 },
  { n: 'Şıra', u: 'bardak', g: 200, k: 120, p: 0.8, c: 30, f: 0 },
  { n: 'Hoşaf', u: 'kase', g: 200, k: 110, p: 0.6, c: 27, f: 0 },
  { n: 'Komposto', u: 'kase', g: 200, k: 110, p: 0.6, c: 27, f: 0 },
  { n: 'Nescafe (sütlü)', u: 'bardak', g: 200, k: 70, p: 2.4, c: 11, f: 2 },
  { n: 'Kestane', u: 'porsiyon', g: 80, k: 196, p: 2.6, c: 42.4, f: 1.8 },
  { n: 'Grissini', u: 'porsiyon', g: 30, k: 120, p: 3.6, c: 21.6, f: 2.1 },
  { n: 'Fıstık ezmesi', u: 'kaşık', g: 16, k: 94, p: 4, c: 3.2, f: 8.1 },
  { n: 'Fındık kreması', u: 'kaşık', g: 20, k: 108, p: 1.1, c: 11.5, f: 6.2, a: ['kakaolu fındık kreması', 'nutella'] },
  { n: 'Kuru incir', u: 'adet', g: 20, k: 50, p: 0.7, c: 12.8, f: 0.2 },
  { n: 'Kuru erik', u: 'adet', g: 9, k: 22, p: 0.2, c: 5.8, f: 0 },
  { n: 'Trabzon hurması', u: 'adet', g: 170, k: 119, p: 1, c: 31.6, f: 0.3 },
  { n: 'Ayva', u: 'adet', g: 200, k: 114, p: 0.8, c: 30.6, f: 0.2 },
  { n: 'Dut', u: 'porsiyon', g: 150, k: 65, p: 2.1, c: 14.7, f: 0.6 },
  { n: 'Kızılcık', u: 'porsiyon', g: 150, k: 69, p: 0.6, c: 18.3, f: 0.2 },
  // === Genisletme (Tem 2026, 2) — ekmek cesitleri + yaygin kahvaltilik ===
  { n: 'Kepekli ekmek', u: 'dilim', g: 30, k: 75, p: 3, c: 13.2, f: 0.9 },
  { n: 'Çavdar ekmeği', u: 'dilim', g: 30, k: 78, p: 2.6, c: 14.4, f: 1 },
  { n: 'Tost ekmeği', u: 'dilim', g: 25, k: 69, p: 2.3, c: 12.5, f: 0.9 },
  { n: 'Sandviç ekmeği', u: 'adet', g: 80, k: 216, p: 7.2, c: 40, f: 2.4 },
  { n: 'Hamburger ekmeği', u: 'adet', g: 60, k: 168, p: 5.4, c: 30, f: 2.7 },
  { n: 'Baget ekmek', u: 'dilim', g: 35, k: 95, p: 3.2, c: 18.2, f: 0.7 },
  { n: 'Pita ekmeği', u: 'adet', g: 60, k: 165, p: 5.5, c: 33.4, f: 0.7 },
  { n: 'Kruvasan', u: 'adet', g: 60, k: 244, p: 4.9, c: 27.5, f: 12.6 },
  { n: 'Glutensiz ekmek', u: 'dilim', g: 30, k: 80, p: 1.1, c: 14.1, f: 1.8 },
  { n: 'Ekşi mayalı ekmek', u: 'dilim', g: 30, k: 78, p: 2.9, c: 15, f: 0.5 },
  { n: 'Yulaf sütü', u: 'bardak', g: 200, k: 90, p: 2, c: 14, f: 3 },
  { n: 'Badem sütü', u: 'bardak', g: 200, k: 44, p: 1.2, c: 4, f: 3 },
  { n: 'Çiğ köfte (bol)', u: 'porsiyon', g: 200, k: 340, p: 9, c: 66, f: 4 },
  { n: 'Peynirli poğaça', u: 'adet', g: 75, k: 263, p: 6.8, c: 28.5, f: 13.1 },
  { n: 'Zeytinli poğaça', u: 'adet', g: 75, k: 255, p: 5.3, c: 30.8, f: 12 },
  { n: 'Çikolatalı kek', u: 'dilim', g: 80, k: 296, p: 3.6, c: 40, f: 13.6 },
  { n: 'Yumurtalı sandviç', u: 'adet', g: 180, k: 360, p: 17.1, c: 37.8, f: 14.4 },
  // --- Diyet / light / yüksek proteinli ürünler ---
  // Süt ürünlerinin light karşılıkları: aynı kalsiyum, düşük yağ.
  { n: 'Süt (yağsız)', u: 'bardak', g: 200, k: 68, p: 7, c: 10, f: 0 },
  { n: 'Süt (yarım yağlı)', u: 'bardak', g: 200, k: 92, p: 7, c: 10, f: 3 },
  { n: 'Yoğurt (yağsız)', u: 'kase', g: 200, k: 112, p: 11.4, c: 15.4, f: 0.4 },
  { n: 'Yunan yoğurdu (yağsız)', u: 'kase', g: 200, k: 118, p: 20, c: 7, f: 0, a: ['greek yogurt light', 'yoğurt yağsız yunan'] },
  { n: 'Protein yoğurt', u: 'kase', g: 200, k: 130, p: 20, c: 8, f: 2 },
  { n: 'Ayran (light)', u: 'bardak', g: 200, k: 60, p: 6, c: 6, f: 1 },
  { n: 'Kefir (light)', u: 'bardak', g: 200, k: 80, p: 7, c: 9, f: 1 },
  { n: 'Beyaz peynir (light)', u: 'dilim', g: 30, k: 48, p: 5.7, c: 0.5, f: 2.6 },
  { n: 'Kaşar peyniri (light)', u: 'dilim', g: 30, k: 78, p: 8.4, c: 0.6, f: 4.8 },
  { n: 'Labne (light)', u: 'kaşık', g: 20, k: 35, p: 3, c: 1, f: 2 },
  { n: 'Krem peynir (light)', u: 'kaşık', g: 15, k: 30, p: 1.2, c: 0.9, f: 2.4 },
  { n: 'Cottage peyniri', u: 'porsiyon', g: 100, k: 98, p: 11.1, c: 3.4, f: 4.3, a: ['süzme peynir', 'cottage cheese'] },
  // Yumurtanın ayrılmış hâlleri — ak neredeyse saf protein, sarı yağ + D vitamini.
  { n: 'Yumurta sarısı', u: 'adet', g: 17, k: 55, p: 2.7, c: 0.6, f: 4.5, a: ['egg yolk', 'yumurtanın sarısı'] },
  { n: 'Sıvı yumurta akı', u: 'bardak', g: 200, k: 104, p: 21.8, c: 1.4, f: 0.4 },
  // Takviye / hazır protein
  { n: 'Whey protein (izolat)', u: 'ölçek', g: 30, k: 112, p: 26, c: 1, f: 1, a: ['izolat', 'izole protein', 'whey isolate'] },
  { n: 'Kazein tozu', u: 'ölçek', g: 30, k: 110, p: 24, c: 3, f: 1 },
  { n: 'Protein süt', u: 'şişe', g: 250, k: 150, p: 25, c: 10, f: 2, a: ['high protein süt', 'proteinli süt'] },
  { n: 'Protein puding', u: 'kutu', g: 200, k: 160, p: 20, c: 15, f: 2 },
  // Yağsız et / şarküteri
  { n: 'Hindi füme', u: 'dilim', g: 20, k: 22, p: 4, c: 1, f: 0, a: ['hindi jambon', 'turkey ham'] },
  { n: 'Tavuk göğsü füme', u: 'dilim', g: 20, k: 24, p: 4, c: 0, f: 1 },
  { n: 'Ton balığı (yağda)', u: 'kutu', g: 80, k: 149, p: 21.2, c: 0, f: 6.6 },
  // Düşük kalorili karbonhidrat / atıştırma
  { n: 'Diyet galeta', u: 'adet', g: 10, k: 38, p: 1.2, c: 7.2, f: 0.4, a: ['galeta', 'diyet kraker', 'grissini'] },
  { n: 'Pirinç patlağı galeta', u: 'adet', g: 9, k: 35, p: 0.7, c: 7.3, f: 0.3, a: ['pirinç keki', 'rice cake'] },
  { n: 'Mısır patlağı (yağsız)', u: 'avuç', g: 20, k: 78, p: 2, c: 16, f: 1, a: ['patlamış mısır', 'popcorn', 'mısır patlağı'] },
  { n: 'Şirataki makarna', u: 'porsiyon', g: 200, k: 20, p: 0, c: 4, f: 0, a: ['konjac', 'shirataki', 'zero makarna'] },
  { n: 'Light dondurma', u: 'top', g: 60, k: 66, p: 2.4, c: 12, f: 1.2 },
  { n: 'Bitter çikolata (%85)', u: 'kare', g: 10, k: 60, p: 1, c: 3, f: 5 },
  { n: 'Şekersiz reçel', u: 'kaşık', g: 20, k: 18, p: 0, c: 4.4, f: 0 },
  { n: 'Light mayonez', u: 'kaşık', g: 15, k: 35, p: 0.1, c: 0.8, f: 3.3 },
  { n: 'Ketçap', u: 'kaşık', g: 17, k: 17, p: 0.2, c: 4.4, f: 0 },
  { n: 'Hardal', u: 'kaşık', g: 15, k: 10, p: 0.6, c: 0.9, f: 0.5 },
  // Şekersiz içecekler — sıfıra yakın, günlük sayımda görünür olsun diye var.
  { n: 'Gazoz (light)', u: 'kutu', g: 330, k: 3, p: 0, c: 0, f: 0 },
  { n: 'Şekersiz ice tea', u: 'kutu', g: 330, k: 3, p: 0, c: 0, f: 0 },
  { n: 'Enerji içeceği (şekersiz)', u: 'kutu', g: 250, k: 8, p: 0, c: 2, f: 0, a: ['zero enerji', 'sugar free energy'] },
  { n: 'Badem sütü (şekersiz)', u: 'bardak', g: 200, k: 28, p: 1, c: 1, f: 2 },
  { n: 'Tatlandırıcı', u: 'adet', g: 1, k: 0, p: 0, c: 0, f: 0 },
  { n: 'Şekersiz sakız', u: 'adet', g: 2, k: 3, p: 0, c: 1.4, f: 0 },
  // --- Pirinç ailesi (pişmiş, 1 porsiyon = 150 g; ham ölçüm için "Pirinç (çiğ)") ---
  // Pilav ile farkı: bunlar SADE haşlanmış, yağ eklenmemiş. 'Pilav' tereyağlı.
  { n: 'Pirinç', u: 'porsiyon', g: 150, k: 195, p: 4, c: 42, f: 0, a: ['sade pirinç', 'beyaz pirinç', 'haşlanmış pirinç', 'pişmiş pirinç', 'white rice'] },
  { n: 'Basmati pirinç', u: 'porsiyon', g: 150, k: 190, p: 4, c: 41, f: 0, a: ['basmati', 'hint pirinci'] },
  { n: 'Yasemin pirinç', u: 'porsiyon', g: 150, k: 200, p: 4, c: 44, f: 0, a: ['jasmine', 'jasmine rice', 'tayland pirinci'] },
  { n: 'Esmer pirinç', u: 'porsiyon', g: 150, k: 165, p: 4, c: 34, f: 1, a: ['kahverengi pirinç', 'brown rice', 'tam tahıl pirinç'] },
  { n: 'Kırmızı pirinç', u: 'porsiyon', g: 150, k: 170, p: 4, c: 35, f: 1, a: ['red rice', 'kızıl pirinç'] },
  { n: 'Siyah pirinç', u: 'porsiyon', g: 150, k: 180, p: 5, c: 36, f: 1, a: ['black rice', 'yasak pirinç', 'forbidden rice'] },
  { n: 'Yabani pirinç', u: 'porsiyon', g: 150, k: 150, p: 6, c: 32, f: 1, a: ['wild rice', 'vahşi pirinç'] },
  { n: 'Arborio pirinç', u: 'porsiyon', g: 150, k: 200, p: 4, c: 44, f: 0, a: ['risotto pirinci', 'italyan pirinci'] },
  { n: 'Baldo pirinç', u: 'porsiyon', g: 150, k: 195, p: 4, c: 43, f: 0, a: ['baldo'] },
  { n: 'Osmancık pirinç', u: 'porsiyon', g: 150, k: 195, p: 4, c: 43, f: 0, a: ['osmancık', 'türk pirinci'] },
  { n: 'Sushi pirinci', u: 'porsiyon', g: 150, k: 210, p: 4, c: 46, f: 0, a: ['sushi rice', 'yapışkan pirinç'] },
  { n: 'Risotto', u: 'porsiyon', g: 220, k: 363, p: 8.8, c: 48.4, f: 14.3, a: ['mantarlı risotto'] },
  { n: 'Pirinç (çiğ)', u: 'su bardağı', g: 180, k: 650, p: 13, c: 143, f: 1, a: ['çiğ pirinç', 'pişmemiş pirinç', 'kuru pirinç'] },
  // --- Diyet ürünleri, 2. parti ---
  { n: 'Üçgen peynir (light)', u: 'adet', g: 17, k: 30, p: 2, c: 1, f: 1.9, a: ['light üçgen peynir', 'labne üçgen light'] },
  { n: 'Yulaf kepeği', u: 'kaşık', g: 8, k: 20, p: 1.4, c: 5.3, f: 0.6, a: ['oat bran'] },
  { n: 'Keten tohumu', u: 'kaşık', g: 10, k: 53, p: 1.8, c: 2.9, f: 4.2, a: ['flaxseed', 'zeyrek'] },
  { n: 'Chia tohumu', u: 'kaşık', g: 12, k: 58, p: 2, c: 5.1, f: 3.7, a: ['chia'] },
  { n: 'Şekersiz kakao', u: 'kaşık', g: 5, k: 11, p: 1, c: 2.9, f: 0.7, a: ['kakao tozu', 'acı kakao'] },
  { n: 'Fırında cips', u: 'avuç', g: 25, k: 115, p: 1.5, c: 16.3, f: 4.5, a: ['diyet cips', 'light cips', 'fırın cips'] },
  { n: 'Şekersiz şurup', u: 'kaşık', g: 15, k: 5, p: 0, c: 1, f: 0, a: ['zero şurup', 'diyet şurup'] },
  { n: 'Ton balığı (suda)', u: 'kutu', g: 80, k: 93, p: 20.4, c: 0, f: 0.6, a: ['suda ton', 'light tuna'] },
  { n: 'Soya sütü (şekersiz)', u: 'bardak', g: 200, k: 66, p: 7, c: 3, f: 3, a: ['soy milk', 'soya sütü'] },
  { n: 'Nohut (haşlanmış)', u: 'porsiyon', g: 150, k: 246, p: 13.4, c: 41.1, f: 3.9, a: ['haşlanmış nohut', 'chickpea'] },
  // --- Genisletme (10 Eyl 2026) — denetim sirasinda EKSIK oldugu gorulen
  //     yaygin kalemler. Degerler per-100g referanstan porsiyona cevrildi;
  //     'g' OLCULMUS porsiyon agirligi (bkz. 22-gram testi). ---
  { n: 'Pastırma', u: '3 dilim', g: 15, k: 36, p: 6, c: 0.3, f: 1.2, a: ['pastirma'] },
  { n: 'Hellim', u: 'dilim', g: 30, k: 96, p: 6.6, c: 0.7, f: 7.5, a: ['halloumi', 'hellim peyniri'] },
  { n: 'Muhammara', u: 'porsiyon', g: 60, k: 168, p: 3, c: 10.8, f: 12.6, a: ['acuka'] },
  { n: 'Ezme', u: 'porsiyon', g: 80, k: 48, p: 1.2, c: 5.6, f: 2.4, a: ['acılı ezme salata'] },
  { n: 'Pilav üstü döner', u: 'porsiyon', g: 300, k: 600, p: 36, c: 66, f: 22.5, a: ['pilav ustu doner', 'porsiyon döner'] },
  { n: 'Islak hamburger', u: 'adet', g: 110, k: 308, p: 12.1, c: 30.8, f: 15.4, a: ['ıslak burger'] },
  { n: 'Kuru köfte', u: 'porsiyon', g: 150, k: 368, p: 30, c: 9, f: 24, a: ['kurukofte'] },
  { n: 'Tavuk ciğeri', u: 'porsiyon', g: 120, k: 206, p: 29.4, c: 1.2, f: 8.4, a: ['tavuk cigeri tava'] },
  { n: 'Somon füme', u: 'dilim', g: 20, k: 23, p: 3.6, c: 0, f: 0.9, a: ['füme somon', 'smoked salmon'] },
  { n: 'Muzlu süt', u: 'bardak', g: 250, k: 188, p: 7.5, c: 27.5, f: 6.3, a: ['muzlu sut'] },
  { n: 'Kuzu şiş', u: 'porsiyon', g: 150, k: 353, p: 39, c: 0, f: 21, a: ['kuzu sis kebap'] },
  { n: 'Dana rosto', u: 'porsiyon', g: 120, k: 228, p: 36, c: 1.2, f: 8.4, a: ['rosto', 'dana haslama'] },
];

// ===== BESİN ARAMA MOTORU (2 Eyl 2026) =====
// ⚠️ ESKİ DAVRANIŞ VE NEDEN DEĞİŞTİ: eşleşme "sorgunun TAMAMI adın içinde
// geçiyor mu" idi. Bu yüzden `yağsız süt` HİÇBİR ŞEY bulmuyordu — ad
// "Süt (yağsız)", yani kelimeler var ama SIRA tutmuyor. Aynı şekilde tek
// harflik yazım hatası (`yogrt`) sonucu sıfırlıyordu. İkisinde de kullanıcı
// buluttaki AI aramasına düşüyordu: ağ + oturum + birkaç saniye. Besin
// eklerken hissedilen friction'ın kaynağı buydu.
// YENİ SÖZLEŞME: (1) kelime bazlı VE — her sorgu kelimesi adın ya da takma
// adın bir kelimesiyle eşleşmeli, sıra önemsiz. (2) 4+ harfli kelimede 1
// harf (7+ harfte 2) yazım toleransı. 3 harfte YOK — 'bal'/'dal'/'tal'
// birbirine 1 uzaklıkta, tolerans orada gürültü üretir.
function _foodTokens(s) {
  return trNorm(s).replace(/[()%,.\/]/g, ' ').split(/\s+/).filter(Boolean);
}
// Levenshtein <= lim mi? Satır minimumu limiti aşarsa erken çıkar.
function _editLE(a, bb, lim) {
  if (Math.abs(a.length - bb.length) > lim) return false;
  const m = a.length, n = bb.length;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j2 = 0; j2 <= n; j2++) prev[j2] = j2;
  for (let i2 = 1; i2 <= m; i2++) {
    cur[0] = i2;
    let best = cur[0];
    for (let j2 = 1; j2 <= n; j2++) {
      const c = a[i2 - 1] === bb[j2 - 1] ? 0 : 1;
      cur[j2] = Math.min(cur[j2 - 1] + 1, prev[j2] + 1, prev[j2 - 1] + c);
      if (cur[j2] < best) best = cur[j2];
    }
    if (best > lim) return false;
    const t = prev; prev = cur; cur = t;
  }
  return prev[n] <= lim;
}
// Tek sorgu kelimesinin ad kelimeleriyle en iyi eşleşme puanı (0 = eşleşmedi)
// Diyet işaretleyicileri birbirinin yerine geçer: "light yoğurt" arayan
// "Yoğurt (yağsız)"ı görmeli. Her ürüne tek tek takma ad yazmak yerine kural.
const _DIET_WORDS = ['light', 'diyet', 'yagsiz', 'zero', 'sekersiz', 'sade'];
function _tokenScore(qt, adTokens) {
  let best = 0;
  if (_DIET_WORDS.indexOf(qt) >= 0) {
    for (const nt of adTokens) if (_DIET_WORDS.indexOf(nt) >= 0) { best = 70; break; }
  }
  for (const nt of adTokens) {
    let sc = 0;
    if (nt === qt) sc = 100;
    else if (nt.startsWith(qt)) sc = 80;
    else if (qt.length >= 4 && nt.includes(qt)) sc = 55;
    else if (qt.length >= 4 && _editLE(qt, nt, qt.length >= 7 ? 2 : 1)) sc = 35;
    if (sc > best) best = sc;
  }
  return best;
}
/**
 * Bir besin adının sorguya alaka puanı. 0 = eşleşme yok.
 * takmaAdlar yalnız ARAMADA kullanılır; ekranda hiçbir yerde geçmez.
 */
function foodMatchScore(ad, takmaAdlar, q) {
  const nq = trNorm(q);
  if (nq.length < 2) return 0;
  const nn = trNorm(ad);
  if (nn === nq) return 100000;
  const qt = _foodTokens(q);
  if (!qt.length) return 0;
  let adTokens = _foodTokens(ad);
  for (const ta of (takmaAdlar || [])) adTokens = adTokens.concat(_foodTokens(ta));
  let enZayif = Infinity, toplam = 0;
  for (const t of qt) {
    const sc = _tokenScore(t, adTokens);
    if (!sc) return 0;                    // VE: bir kelime bile tutmazsa eşleşme yok
    if (sc < enZayif) enZayif = sc;
    toplam += sc;
  }
  // Taban en ZAYIF kelime: bir kelimesi zorlama eşleşen sonuç geride kalsın.
  let puan = enZayif * 100 + Math.round(toplam / qt.length);
  // 🔴 12 Eyl 2026 — SIRALAMA TERSTI. Tek bonus "ad sorguyla BASLIYOR" idi ve
  // 30.000 ile her seyi eziyordu: "peynir" arayan ilk uc sonucta PEYNIR GORMUYOR,
  // "Peynirli börek / Peynirli omlet / Peynirli poğaça" goruyordu — cunku
  // 'peynirli' kelimesi sorguyla basliyor, 'Beyaz peynir'de ise TAM kelime
  // eslesmesi var ama ad 'beyaz' ile basliyor. Tam kelime eslesmesi, adin
  // sorguyla baslamasindan DAHA guclu bir sinyaldir: sira bu yuzden degisti.
  const tamKelime = qt.every(t => adTokens.indexOf(t) >= 0);
  if (tamKelime) puan += 40000;
  if (nn.startsWith(nq)) puan += 10000;
  else if (adTokens[0] && adTokens[0].startsWith(qt[0])) puan += 2000;
  return puan;
}
// Temel besin DB araması — kelime bazlı VE + yazım toleransı + takma ad.
function seedFoodMatches(q, limit) {
  const nq = parseFoodQuery(q).core || trNorm(q);
  if (nq.length < 2) return [];
  const scored = [];
  for (const f of TURK_FOODS) {
    const sc = foodMatchScore(f.n, f.a, nq);
    // Kısa ad daha jeneriktir: 'Pirinç (haşlanmış)' > 'Pirinç patlağı galeta'
    if (sc > 0) scored.push({ f, score: sc });
  }
  scored.sort((a, b) => b.score - a.score || a.f.n.length - b.f.n.length);
  return scored.slice(0, limit || 10).map(x => x.f);
}

// ===========================================================================
// YEMEK EKLEME MODALI + KISISEL BESIN KATMANI (2 Eyl 2026'da core.js'ten geldi)
// ===========================================================================
// Bu blogun TAMAMI Diyet sekmesine ozel: arama modali, porsiyon editoru,
// barkod/Open Food Facts, kendi besinlerim, tarifler, takviyeler, ogun
// duzenleme. core.js'te 48.6 KB kaynak / 14 KB gzip tutuyordu ve Gorevler
// sekmesinde bile iniyordu. Cagri yerlerinin hepsi renderDiet/renderDiary
// icinden ya da modalin kendi HTML'inden; ikisi de foods.js inmeden
// calismiyor (tasks.js showTab dordunu Promise.all ile bekliyor).
// ⚠️ trNorm() da burada: core.js'te kalan hicbir yer kullanmiyordu.
// ===========================================================================

function openFoodModal(slot, tab) {
  if (slot) { _mealSlot = slot; syncMealSlotChips(); }
  _foodPick = null; _foodResults = []; _pickQty = null; _pickGram = false;   // onceki aramanin miktari chip'e sizmasin
  const m = document.getElementById('foodModal');
  if (!m) return;
  syncFoodModalTitle();
  const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
  const fl = document.getElementById('foodLocal'); if (fl) fl.innerHTML = '';
  const fsi = document.getElementById('foodSearchInput'); if (fsi) fsi.value = '';
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  m.classList.add('active');
  renderFrequentMeals();
  renderRecentFoods();
  renderCustomManage();
  foodModalTab(tab || 'ara');
}
function closeFoodModal() {
  stopBarcodeScan();
  const m = document.getElementById('foodModal');
  if (m) m.classList.remove('active');
  const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
}
function foodModalTab(tab) {
  ['ara', 'barkod', 'elle'].forEach(t => {
    const pane = document.getElementById('foodPane-' + t);
    const btn = document.getElementById('foodTab-' + t);
    if (pane) pane.style.display = (t === tab) ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab !== 'barkod') stopBarcodeScan();
  if (tab === 'ara') { const i = document.getElementById('foodSearchInput'); if (i) setTimeout(() => i.focus(), 50); }
}
function syncMealSlotChips() {
  document.querySelectorAll('#mealSlotChips .slot-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-slot') === _mealSlot);
  });
  syncFoodModalTitle();
}

// --- Open Food Facts arama ---
function parseOffProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const name = (p.product_name_tr || p.product_name || '').trim();
  if (!name) return null;
  const kcal100 = n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : (n['energy-kcal'] != null ? n['energy-kcal'] : null);
  return {
    name, brand: (p.brands || '').split(',')[0].trim(), code: p.code || '',
    kcal100: kcal100 != null ? Number(kcal100) : null,
    p100: n.proteins_100g != null ? Number(n.proteins_100g) : null,
    c100: n.carbohydrates_100g != null ? Number(n.carbohydrates_100g) : null,
    f100: n.fat_100g != null ? Number(n.fat_100g) : null
  };
}
function scaleFood(p, grams) {
  const f = (Number(grams) || 0) / 100;
  const rnd = v => v != null ? Math.round(v * f) : null;
  return { kcal: rnd(p.kcal100), protein: rnd(p.p100), carb: rnd(p.c100), fat: rnd(p.f100) };
}
async function offSearch(q) {
  const url = OFF_BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_tr,brands,nutriments,code';
  const r = await fetch(url);
  if (!r.ok) throw new Error('ağ hatası ' + r.status);
  const j = await r.json();
  return (j.products || []).map(parseOffProduct).filter(Boolean);
}
async function offBarcode(code) {
  const url = OFF_BASE + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=product_name,product_name_tr,brands,nutriments,code';
  const r = await fetch(url);
  if (!r.ok) { if (r.status === 404) return null; throw new Error('ağ hatası ' + r.status); }
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return parseOffProduct(j.product);
}
// i: arama sonucundaki index VEYA doğrudan ürün objesi (barkod akışı)
function pickFood(i) {
  const p = (typeof i === 'number') ? _foodResults[i] : i;
  if (!p) return;
  _foodPick = p;
  const por = document.getElementById('foodPortion');
  por.style.display = 'block';
  por.innerHTML = `<div class="portion-pick">${escapeHtml(p.name)}${p.brand ? ' · ' + escapeHtml(p.brand) : ''}</div>` +
    `<div class="portion-row"><label>Miktar (g)</label><input id="portionGrams" type="number" inputmode="numeric" value="100" min="1" oninput="updatePortionPreview()"></div>` +
    `<div class="portion-preview" id="portionPreview"></div>` +
    `<button class="portion-add" onclick="addPickedFood()">${MEAL_SLOTS[_mealSlot] || 'Öğün'}'e ekle</button>`;
  updatePortionPreview();
  por.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updatePortionPreview() {
  if (!_foodPick) return;
  const g = document.getElementById('portionGrams').value;
  const sc = scaleFood(_foodPick, g);
  document.getElementById('portionPreview').innerHTML = `${sc.kcal != null ? sc.kcal + ' kcal' : '? kcal'} · P${sc.protein || 0} K${sc.carb || 0} Y${sc.fat || 0}`;
}
function addPickedFood() {
  if (!_foodPick) return;
  const g = document.getElementById('portionGrams').value;
  const sc = scaleFood(_foodPick, g);
  const day = dietDay();
  const gv = Math.round(Number(g) || 0);
  const label = _foodPick.name + (gv && gv !== 100 ? ` (${gv}g)` : '');
  // ⚠️ IKIZ YOL: bu blok 2 Eyl'de hizli ekleme tasinirken GERIDE KALDI —
  // Date.now() id (ayni ms'de catisir, geri alma yanlis kaydi siler) ve
  // geri alma yoktu. Kayit uretimi artik _mealId() + showUndoToast ile ayni
  // disipline bagli.
  const rec = { id: _mealId(), slot: _mealSlot, name: label, kcal: sc.kcal, protein: sc.protein, carb: sc.carb, fat: sc.fat, at: mealNow() };
  day.meals.push(rec);
  save(); renderDiet(); closeFoodModal();
  _mealUndoToast(rec);
}

// --- Barkod tarama (html5-qrcode, CDN'den tembel yüklenir) ---
function loadBarcodeLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (_barcodeLibLoading) return _barcodeLibLoading;
  _barcodeLibLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = '/html5-qrcode.min.js';  // self-host (jsdelivr yerine, CSP tam kapali)
    sc.onload = () => res();
    sc.onerror = () => { _barcodeLibLoading = null; rej(new Error('tarayıcı kütüphanesi yüklenemedi')); };
    document.head.appendChild(sc);
  });
  return _barcodeLibLoading;
}
async function startBarcodeScan() {
  const st = document.getElementById('barcodeStatus');
  if (st) st.textContent = 'Kamera hazırlanıyor…';
  try {
    await loadBarcodeLib();
    if (_barcodeScanner) { try { await _barcodeScanner.stop(); } catch (e) {} _barcodeScanner = null; }
    const F = Html5QrcodeSupportedFormats;
    const fmts = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E];
    _barcodeScanner = new Html5Qrcode('barcodeReader', { formatsToSupport: fmts, verbose: false });
    await _barcodeScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 140 } },
      (txt) => { onBarcodeDecoded(txt); }, () => {});
    if (st) st.textContent = 'Barkodu çerçeveye getir.';
    const sb = document.getElementById('barcodeStartBtn'); if (sb) sb.style.display = 'none';
    const tb = document.getElementById('barcodeStopBtn'); if (tb) tb.style.display = 'inline-flex';
  } catch (e) {
    if (st) st.textContent = 'Kamera açılamadı (' + e.message + '). Barkod numarasını elle yazabilirsin.';
  }
}
async function stopBarcodeScan() {
  if (_barcodeScanner) { try { await _barcodeScanner.stop(); } catch (e) {} try { _barcodeScanner.clear(); } catch (e) {} _barcodeScanner = null; }
  const sb = document.getElementById('barcodeStartBtn'); if (sb) sb.style.display = 'inline-flex';
  const tb = document.getElementById('barcodeStopBtn'); if (tb) tb.style.display = 'none';
}
async function onBarcodeDecoded(code) {
  await stopBarcodeScan();
  lookupBarcode(code);
}
async function lookupBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  const st = document.getElementById('barcodeStatus');
  if (st) st.textContent = 'Ürün aranıyor… (' + code + ')';
  try {
    const p = await offBarcode(code);
    if (!p) {
      // OFF'ta yoksa akış kopmasın: doğrudan "Elle" sekmesine geç, ada odaklan
      if (st) st.textContent = 'Bu barkod veritabanında yok (' + code + ').';
      foodModalTab('elle');
      const nm = document.getElementById('mealName');
      if (nm) { nm.value = ''; setTimeout(() => nm.focus(), 80); }
      showToast('Barkod bulunamadı — elle ekleyebilirsin', 'info');
      return;
    }
    if (st) st.textContent = 'Bulundu: ' + p.name;
    foodModalTab('ara');
    const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
    pickFood(p);
  } catch (e) {
    if (st) st.textContent = 'Sorgu başarısız: ' + e.message;
  }
}
function barcodeManualLookup() {
  const v = (document.getElementById('barcodeManual').value || '').trim();
  if (!v) return;
  lookupBarcode(v);
}

// ===== Ara sekmesi: USDA+AI akıllı arama (jenerik besin + adet/porsiyon) =====
let _aiFood = null;
function aiFoodSearch() {
  const q = (document.getElementById('foodSearchInput').value || '').trim();
  const out = document.getElementById('foodSearchResults');
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  if (!q) { document.getElementById('foodSearchInput').focus(); return; }
  // ⚠️ Bu mesaj "arama calismiyor" gibi okunuyordu; oysa YEREL arama (470
  // besin + kendi besinlerin + gecmisin) yazarken zaten calisiyor ve bulut
  // istemiyor. Buluta yalniz marka/paket urunu icin gidiliyor.
  if (!window._supa || !window._user) { out.innerHTML = '<div class="diet-empty">Marka/paket araması bulut girişi ister (Ayarlar). Temel besinler yukarıda, yazarken çıkıyor.</div>'; return; }
  out.innerHTML = '<div class="diet-empty">Aranıyor… birkaç sn.</div>';
  (async () => {
    // Marka/paket icin Open Food Facts + jenerik/coklu icin AI — PARALEL
    const offProm = offSearch(q).catch(() => []);
    const aiProm = (async () => {
      const { data: sess } = await window._supa.auth.getSession();
      const token = sess && sess.session && sess.session.access_token;
      if (!token) throw new Error('oturum yok');
      const r = await fetch(FOOD_MACROS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ query: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || ('hata ' + r.status));
      return j;
    })().catch(e => ({ __err: e.message }));
    const [offRes, aiJson] = await Promise.all([offProm, aiProm]);
    renderSearchResults(q, offRes, aiJson);
    pushRecentFood(q);
  })();
}
// OFF (marka/paket) + AI (jenerik/coklu) sonuclarini tek listede goster.
// Marka urunleri ambalaj makrosuyla (per-100g, gram porsiyon) gelir; AI satiri adet/porsiyon.
function renderSearchResults(q, offRes, aiJson) {
  const out = document.getElementById('foodSearchResults');
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  const qn = (typeof trNorm === 'function') ? trNorm(q) : q.toLowerCase();
  const qwords = qn.split(/\s+/).filter(w => w.length > 2);
  // OFF: makrosu olan + sorguyla alakali (ad/marka sorgu kelimesini icersin) ilk 6
  const off = (offRes || []).filter(p => {
    if (!p || p.kcal100 == null) return false;
    if (!qwords.length) return true;
    const nm = (typeof trNorm === 'function') ? trNorm((p.name || '') + ' ' + (p.brand || '')) : ((p.name || '') + ' ' + (p.brand || '')).toLowerCase();
    return qwords.some(w => nm.includes(w));
  }).slice(0, 6);
  _foodResults = off; // pickFood(i) bunu indeksler
  let html = '';
  if (off.length) {
    html += '<div class="freq-head">Paket / marka</div><div class="food-results">' +
      off.map((p, i) => `<button class="food-result" onclick="pickFood(${i})"><span class="food-result-name">${escapeHtml(p.name)}${p.brand ? ` <span class="food-result-brand">${escapeHtml(p.brand)}</span>` : ''}</span><span class="food-result-kcal">${Math.round(p.kcal100)} kcal/100g</span></button>`).join('') +
      '</div>';
  }
  const base = aiJson && !aiJson.__err && (aiJson.ai || aiJson.db);
  if (base && base.kcal != null) {
    _aiFood = {
      name: q, kcal: base.kcal, protein: base.protein, carb: base.carb, fat: base.fat,
      multi: !!(aiJson.items && aiJson.items.length > 1), items: aiJson.items || [], source: aiJson.source
    };
    _aiFood._srcLbl = aiJson.source === 'usda' ? 'Veritabanı' : (aiJson.source === 'mixed' ? 'Veritabanı + AI' : (_aiFood.multi ? 'Toplam' : 'AI tahmini'));
    _aiFood._bd = _aiFood.multi ? `<div class="macro-note">${_aiFood.items.map(it => `${escapeHtml(it.name)} · ${it.kcal} kcal${(it.source === 'usda' || it.source === 'curated') ? '' : ' (tahmin)'}`).join('  +  ')}</div>` : '';
    html += '<div class="freq-head">Jenerik / hesap</div><div class="food-results">' +
      `<button class="food-result" onclick="pickAiRow()"><span class="food-result-name">${escapeHtml(q)} <span class="food-result-brand">${_aiFood._srcLbl}</span></span><span class="food-result-kcal">${base.kcal} kcal</span></button>` +
      '</div>';
  }
  if (!html) { out.innerHTML = '<div class="diet-empty">Sonuç yok. "Elle" sekmesinden kalori girebilirsin.</div>'; return; }
  out.innerHTML = html;
  // Marka eslesme yoksa tek AI sonucunu otomatik ac (hizli ekleme)
  if (!off.length && base && base.kcal != null) pickAiRow();
}
function pickAiRow() {
  if (!_aiFood) return;
  showAiPortion(_aiFood.name, _aiFood._srcLbl || '', _aiFood._bd || '');
}
// Ortak porsiyon/adet arayüzü (AI sonucu + kişisel hafıza ikisi de kullanır)
// Çoklu yemek (zaten miktarlı, ör "4 yumurta 2 ekmek") → adet çarpanı GİZLENİR (çift sayım önlenir),
// tek jenerik besinde (ör "yumurta") adet çarpanı kalır.
// Porsiyon <-> Gram. Gram kipi YALNIZCA besinin gram karsiligi biliniyorsa
// acilir (_aiFood.grams) — bilinmeyen bir gram uydurmak, kullanicinin
// duzelttigini sandigi ama aslinda yanlis olcege oturan bir sayi uretir.
let _portionMode = 'porsiyon';
function portionUnitLabel() {
  const u = (_aiFood && _aiFood.unit) ? _aiFood.unit : 'porsiyon';
  return u.replace(/^\d+\s*/, '');
}
function setPortionMode(mode) {
  if (!_aiFood) return;
  if (mode === 'gram' && !_aiFood.grams) return;
  const el = document.getElementById('aiQty');
  const cur = el ? Number(el.value) : 1;
  // Kip degisince miktar KORUNUR: 1.5 porsiyon -> 75 g gibi.
  if (mode === 'gram' && _portionMode !== 'gram') {
    if (el) { el.value = Math.round((isFinite(cur) ? cur : 1) * _aiFood.grams); el.step = '5'; el.min = '1'; }
  } else if (mode === 'porsiyon' && _portionMode === 'gram') {
    const v = (isFinite(cur) ? cur : _aiFood.grams) / _aiFood.grams;
    if (el) { el.value = Math.round(v * 4) / 4; el.step = '0.25'; el.min = '0.25'; }
  }
  _portionMode = mode;
  document.querySelectorAll('#foodPortion .dt-seg-btn').forEach(x =>
    x.classList.toggle('active', x.getAttribute('data-mode') === mode));
  const ul = document.getElementById('dtUnitLabel');
  if (ul) ul.textContent = (mode === 'gram') ? 'g' : portionUnitLabel();
  renderPortionChips();
  updateAiPreview();
}
// Miktari 1 BIRIM cinsinden carpana cevirir (gram kipinde gram / birim-grami).
function _portionMult() {
  const el = document.getElementById('aiQty');
  const v = el ? Number(el.value) : 1;
  if (!isFinite(v) || v <= 0) return 0;
  if (_portionMode === 'gram' && _aiFood && _aiFood.grams) return v / _aiFood.grams;
  return v;
}
function renderPortionChips() {
  const el = document.getElementById('dtChips'); if (!el) return;
  const vals = (_portionMode === 'gram') ? [30, 50, 100, 150, 200] : [0.5, 1, 1.5, 2];
  el.innerHTML = vals.map(v =>
    `<button class="dt-chip" onclick="setPortionValue(${v})">${_portionMode === 'gram' ? v + 'g' : String(v).replace('.', ',')}</button>`
  ).join('');
}
function setPortionValue(v) {
  const el = document.getElementById('aiQty'); if (!el) return;
  el.value = v; updateAiPreview();
}
function showAiPortion(q, srcLbl, bd) {
  const out = document.getElementById('foodSearchResults'); if (out) out.innerHTML = '';
  const fl = document.getElementById('foodLocal'); if (fl) fl.innerHTML = '';
  const fp = document.getElementById('foodPortion');
  fp.style.display = 'block';
  const multi = !!(_aiFood && _aiFood.multi);
  const hasG = !!(_aiFood && _aiFood.grams);
  _portionMode = 'porsiyon';
  const seg = (multi || !hasG) ? '' :
    `<div class="dt-seg" role="group" aria-label="Miktar birimi">
      <button class="dt-seg-btn active" data-mode="porsiyon" onclick="setPortionMode('porsiyon')">Porsiyon</button>
      <button class="dt-seg-btn" data-mode="gram" onclick="setPortionMode('gram')">Gram</button>
    </div>`;
  const numRow = multi
    ? '<div class="portion-note">Yazdığın miktarlar zaten hesaba katıldı — aşağıdaki toplam eklenir.</div>'
    : `<div class="dt-pe-num">
        <input id="aiQty" type="number" inputmode="decimal" value="1" min="0.25" step="0.25" oninput="updateAiPreview()" aria-label="Miktar">
        <span class="dt-pe-unit" id="dtUnitLabel">${escapeHtml(portionUnitLabel())}</span>
      </div>` +
      (hasG ? `<div class="dt-pe-eq">1 ${escapeHtml(portionUnitLabel())} ≈ ${_aiFood.grams} g</div>` : '') +
      '<div class="dt-chips" id="dtChips"></div>';
  fp.innerHTML = `<div class="portion-pick">${escapeHtml(q)} <span class="ai-src">${srcLbl}</span></div>` +
    (bd || '') + seg + numRow +
    `<div class="dt-macros" id="aiPreview"></div>` +
    `<button class="portion-add" onclick="addAiFood()">${MEAL_SLOTS[_mealSlot] || 'Öğün'}'e ekle</button>`;
  renderPortionChips();
  updateAiPreview();
  fp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// Kisisel besinlerde de ayni arama motoru — foods.js inmemisse (modal ancak
// Diyet sekmesinden acilir, yani pratikte inmis olur) duz icerik kontrolune duser.
function _adPuan(ad, nq) {
  if (typeof foodMatchScore === 'function') return foodMatchScore(ad, null, nq);
  return trNorm(ad).includes(nq) ? 1 : 0;
}
function _adUyuyor(ad, nq) { return _adPuan(ad, nq) > 0; }
// ===== Kişisel öğrenen besin DB — geçmişte loglanan yemeklerden anlık lokal eşleşme =====
function foodMemoryMatches(q, limit) {
  ensureDiet();
  // Kisisel gecmis de temel besinlerle AYNI motoru kullanir: "yumurta beyazi"
  // yazip kendi kaydini bulamamak, temel besinde bulup burada bulamamaktan
  // daha kotu — kullanici kendi yazdigi adi hatirlamak zorunda kaliyordu.
  const nq = parseFoodQuery(q).core || trNorm(q);
  if (nq.length < 2) return [];
  const days = data.diet.days || {}, map = new Map();
  for (const dk of Object.keys(days).sort()) {
    for (const m of (days[dk].meals || [])) {
      const name = String(m.name || '').trim();
      if (!name || !_adUyuyor(name, nq)) continue;
      const key = name.toLocaleLowerCase('tr');
      const e = map.get(key) || { name, count: 0, kcal: null, protein: null, carb: null, fat: null };
      e.count++; e.name = name;
      if (m.kcal != null) e.kcal = m.kcal;
      if (m.protein != null) e.protein = m.protein;
      if (m.carb != null) e.carb = m.carb;
      if (m.fat != null) e.fat = m.fat;
      map.set(key, e);
    }
  }
  const out = [...map.values()].filter(e => e.kcal != null).sort((a, b) => b.count - a.count).slice(0, limit || 6);
  // 🔴 GRAM TABANINI TEMEL BESINDEN DEVRAL (12 Eyl 2026). Hafiza satirlarinda
  // gram alani yoktu, oysa kullanicinin en cok kullandigi satirlar BUNLAR —
  // "200 gr tavuk göğsü" ilk kullanimda calisip ikincisinde sessizce 1 porsiyon
  // ekliyordu (cunku artik hafizadan geliyordu). Ad temel besinle ayniysa ve
  // kcal de ayniysa gram tabani BILINIYOR demektir; uydurma degil, devralma.
  for (const e of out) {
    const saf = _miktarAyikla(e.name).ad.toLocaleLowerCase('tr');
    const sf = (typeof TURK_FOODS !== 'undefined' ? TURK_FOODS : []).find(f => f.n.toLocaleLowerCase('tr') === saf);
    if (!sf || !sf.g) continue;
    const beklenen = _miktarAyikla(e.name).gram ? null : sf.k;   // etiketli kayitta kcal zaten olcekli
    if (beklenen != null && Math.abs(e.kcal - beklenen) > Math.max(2, beklenen * 0.02)) continue;
    e.grams = sf.g; e.unit = sf.u;
  }
  return out;
}
let _foodInputTimer = null, _localMatches = [], _seedMatches = [], _customMatches = [], _pickQty = null, _pickGram = false;
function onFoodSearchInput() { clearTimeout(_foodInputTimer); _foodInputTimer = setTimeout(renderLocalMatches, 180); }
function renderLocalMatches() {
  const el = document.getElementById('foodLocal'); if (!el) return;
  const raw = (document.getElementById('foodSearchInput').value || '').trim();
  // '2 dilim ekmek' → miktar 2 + çekirdek 'ekmek'; miktar seçilen besinin adedine önyüklenir
  const parsed = parseFoodQuery(raw);
  _pickQty = parsed.qty;
  _pickGram = !!parsed.gram;
  const q = (parsed.core && parsed.core.length >= 2) ? parsed.core : raw;
  _customMatches = customFoodMatches(q, 6);
  const customNames = new Set(_customMatches.map(m => m.name.toLocaleLowerCase('tr')));
  _localMatches = foodMemoryMatches(q, 6).filter(m => !customNames.has(m.name.toLocaleLowerCase('tr')));
  const personalNames = new Set([...customNames, ..._localMatches.map(m => m.name.toLocaleLowerCase('tr'))]);
  // 🔴 GRAM SORGUSUNDA TEKRAR AYIKLAMA YAPILMAZ. Normalde "daha once yedin"
  // satiri temel besin ikizini gizler (ayni seyi iki kez gostermemek icin).
  // Ama hafiza satiri gram tabanini bilmeyebilir: "100 gr yumurta" yazanda
  // ayiklama, gramı UYGULAYABILEN tek satiri listeden siliyordu.
  const gramOnce = !!(_pickGram && _pickQty > 0);
  _seedMatches = seedFoodMatches(q, 10)
    .filter(sf => gramOnce || !personalNames.has(sf.n.toLocaleLowerCase('tr')));
  let html = '';
  // Gram sorgusunda gram tabanini bilen liste one gecer (yukaridaki gerekce).
  const bolumler = [];
  if (_customMatches.length) {
    bolumler.push('<div class="freq-head">Kendi besinlerim</div><div class="food-results">' +
      _customMatches.map((m, i) => _foodRow(
        `<button class="food-result" onclick="pickCustomFood(${i})"><span class="food-result-name">${escapeHtml(m.name)}${m.unit ? ` <span class="food-result-brand">${escapeHtml(m.unit)}</span>` : ''}</span><span class="food-result-kcal">${m.kcal} kcal</span></button>`,
        `quickAddCustom(${i})`)).join('') +
      '</div>');
  }
  if (_localMatches.length) {
    bolumler.push('<div class="freq-head">Daha önce yedin</div><div class="food-results">' +
      _localMatches.map((m, i) => _foodRow(
        `<button class="food-result" onclick="pickPersonalFood(${i})"><span class="food-result-name">${escapeHtml(m.name)}</span><span class="food-result-kcal">${m.kcal} kcal</span></button>`,
        `quickAddPersonal(${i})`)).join('') +
      '</div>');
  }
  if (_seedMatches.length) {
    const sb = '<div class="freq-head">Temel besinler</div><div class="food-results">' +
      _seedMatches.map((sf, i) => _foodRow(
        `<button class="food-result" onclick="pickSeedFood(${i})"><span class="food-result-name">${escapeHtml(sf.n)} <span class="food-result-brand">${escapeHtml(sf.u)}</span></span><span class="food-result-kcal">${sf.k} kcal</span></button>`,
        `quickAddSeed(${i})`)).join('') +
      '</div>';
    if (gramOnce) bolumler.unshift(sb); else bolumler.push(sb);
  }
  html += bolumler.join('');
  // ⚠️ SIFIR SONUCTA BOS EKRAN BIRAKMA. Onceden hicbir sey yazmiyordu:
  // kullanici yazdigi seyin bulunamadigini mi yoksa uygulamanin donduğunu mu
  // anlamiyordu ve cikis yolu (bulut / elle) gorunmuyordu.
  if (!html && q && q.length >= 2) {
    html = '<div class="food-none">' +
      `<div class="food-none-t">“${escapeHtml(raw)}” burada yok.</div>` +
      '<div class="food-none-btns">' +
      '<button class="small primary" onclick="aiFoodSearch()">Bulutta ara</button>' +
      `<button class="small" onclick="elleGir()">Elle gir</button>` +
      '</div></div>';
  }
  el.innerHTML = html;
}
// Aramada yazdigini "Elle" sekmesine TASIR. Onceden sekmeyi degistirince
// yazdigin siliniyordu, yani bulunamayan besini bir daha yazmak gerekiyordu.
function elleGir() {
  const raw = (document.getElementById('foodSearchInput').value || '').trim();
  foodModalTab('elle');
  const mn = document.getElementById('mealName');
  if (mn) { mn.value = raw; setTimeout(() => mn.focus(), 60); }
}


/**
 * HIZLI EKLE (2 Eyl 2026) — sonuç satırındaki "+".
 *
 * NEDEN: bir besin eklemek en iyi durumda 4 dokunuştu (modal aç → yaz →
 * sonuca dokun → "Öğüne ekle"), ve son iki dokunuş arasında porsiyon
 * editörü açılıp listeyi kapatıyordu. Arka arkaya 5 kalem giren biri bunu
 * 5 kez yaşıyor. "+" 1 birimi doğrudan ekler, MODAL AÇIK KALIR ve arama
 * kutusu temizlenip odaklanır — yani ikinci kalem sadece yazmakla ekleniyor.
 * Miktar/gram gerektiğinde satırın gövdesine dokunmak eski akışı açar.
 *
 * Yanlış dokunuşun bedeli: kayıt geri alınabilir olmalı — showUndoToast.
 * Sessizce eklemek, "eklemedim sanıp ikinci kez eklemek"le sonuçlanır.
 */
function _foodRow(btnHtml, quickCall) {
  return `<div class="food-row">${btnHtml}` +
    `<button class="food-quick" onclick="${quickCall}" title="1 birim ekle" aria-label="hızlı ekle">+</button></div>`;
}
// Eklenen kaydi geri alinabilir bildirimle duyur. Porsiyon editoru ve barkod
// yolunda 12 Eyl 2026'ya kadar geri alma YOKTU: yanlis dokunus elle silmeyi
// gerektiriyordu, o da "eklemedim sandim" -> ikinci kez ekleme uretiyordu.
function _mealUndoToast(rec) {
  if (!rec) return;
  const geriAl = () => {
    const d = dietDay();
    d.meals = (d.meals || []).filter(x => x.id !== rec.id);
    save(); renderDiet();
  };
  document.querySelectorAll('#toastContainer .toast').forEach(t => t.remove());
  if (typeof showUndoToast === 'function') showUndoToast(rec.name + ' eklendi', geriAl);
  else showToast(rec.name + ' eklendi', 'success');
}
// Ayni milisaniyede iki ekleme id catisir; geri alma yanlis kaydi siler.
let _lastMealId = 0;
function _mealId() { const t = Math.max(Date.now(), _lastMealId + 1); _lastMealId = t; return t; }
/**
 * Kayit adinda miktar ZATEN yaziyor mu — ve ne kadar?
 *
 * "Daha once yedin" satirindaki kcal O MIKTARIN kalorisidir: 'Ekmek ×2 / 160 kcal'
 * iki dilimin degeri, 'Tavuk göğsü (200g) / 331 kcal' 200 gramin degeri. 12 Eyl
 * 2026'ya kadar bu satira yeni bir carpan BINIYORDU ('Ekmek ×2 ×2') ve zincir
 * 14.880.000 kcal uretti. Cozum miktari yok saymak DEGIL: etiket zaten tabani
 * soyluyor, o tabandan yeniden olcekle. Boylece "300 gram tavuk" yazip hafizada
 * 200 g kaydi bulan kullanici 300 g alir — 200 de almaz, 60.000 de.
 * Dondurur: { ad, kat, gram } — kat = uygulanmis porsiyon carpani, gram = etiketteki gram.
 */
function _miktarAyikla(ad) {
  const str = String(ad || '');
  let m = str.match(/^(.*?)\s*\(([0-9]+(?:[.,][0-9]+)?)\s*g\)\s*$/);
  if (m) return { ad: m[1].trim(), kat: 0, gram: Number(m[2].replace(',', '.')) };
  m = str.match(/^(.*?)\s*×\s?([0-9]+(?:[.,][0-9]+)?)\s*$/);
  if (m) return { ad: m[1].trim(), kat: Number(m[2].replace(',', '.')), gram: 0 };
  return { ad: str.trim(), kat: 0, gram: 0 };
}
/**
 * HIZLI EKLE cekirdegi.
 *
 * 🔴 GRAM SORGUSU PORSIYON CARPANI DEGILDIR (12 Eyl 2026). "200 gr tavuk göğsü"
 * yazip + basan biri 200 PORSIYON aliyordu (49.600 kcal) — sessizce, geri
 * alinabilir ama fark edilmesi zor bir sekilde. Motor zaten gram biliyordu
 * (`TURK_FOODS[].g` + porsiyon editorunun Gram kipi); eksik olan KAPIYDI:
 * parseFoodQuery birim kelimesini atiyordu. Artik gram sorgusu gram olarak
 * uygulanir; gram tabani BILINMIYORSA carpma YAPILMAZ (1 birim eklenir),
 * cunku uydurulmus bir olcek hic olcmemekten kotudur.
 */
function _quickAddFood(o) {
  const day = dietDay();
  const haz = _miktarAyikla(o.name);
  // Kalemin 1 BIRIMINE in: etiketteki miktar varsa once onu geri al.
  const taban = haz.gram ? (1 / haz.gram) : (haz.kat ? (1 / haz.kat) : 1);
  // Gram tabani: kalemin kendi gram alani, yoksa etiketteki gram.
  const gramTaban = Number(o.grams) > 0 ? Number(o.grams) : (haz.gram || 0);
  const istek = (_pickQty > 0) ? _pickQty : 0;
  const gramIstendi = !!(_pickGram && istek);
  let qty, gramEtiket = 0;
  if (gramIstendi && gramTaban) {
    // 'taban' 1 grama indirir ((200g) kaydinda 1/200), carpan istenen gram.
    qty = haz.gram ? (taban * istek) : (istek / gramTaban);
    gramEtiket = istek;
  } else if (!gramIstendi && istek) {
    // Porsiyon istegi: etiketli kayitta etiketli miktarin KATI demektir.
    qty = haz.gram ? istek : (taban * istek);
    if (haz.gram) gramEtiket = haz.gram * istek;
  } else {
    qty = 1;                                    // miktar yazilmadi: kaydi oldugu gibi ekle
    gramEtiket = haz.gram || 0;
  }
  // Etiketteki ×N yerine gosterilecek YENI kat (kcal carpani qty, etiket birimKat).
  const birimKat = haz.kat ? qty * haz.kat : qty;
  const kStr = (birimKat % 1) ? String(Math.round(birimKat * 100) / 100).replace('.', ',') : String(birimKat);
  const ek = gramEtiket ? ` (${Math.round(gramEtiket)}g)` : (birimKat !== 1 ? ` ×${kStr}` : '');
  const rec = {
    id: _mealId(), slot: _mealSlot,
    name: haz.ad + ek,
    kcal: _mScale(o.kcal, qty), protein: _mScale(o.protein, qty),
    carb: _mScale(o.carb, qty), fat: _mScale(o.fat, qty), at: mealNow()
  };
  day.meals.push(rec);
  save(); renderDiet();
  _pickQty = null; _pickGram = false;
  const inp = document.getElementById('foodSearchInput');
  // ⚠️ "Son aramalar" FIILEN OLUYDU: pushRecentFood yalniz bulut aramasindan
  // cagriliyordu, yani yerel arama yaygilastiginca hic dolmuyordu.
  if (inp && inp.value.trim()) pushRecentFood(inp.value.trim());
  if (inp) { inp.value = ''; inp.focus(); }
  const fp = document.getElementById('foodPortion'); if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }
  const sr = document.getElementById('foodSearchResults'); if (sr) sr.innerHTML = '';
  renderLocalMatches();
  const geriAl = () => {
    const d = dietDay();
    d.meals = (d.meals || []).filter(x => x.id !== rec.id);
    save(); renderDiet();
  };
  // Arka arkaya 5 kalem girerken 5 toast ust uste yigiliyordu ve listeyi
  // kapatiyordu — her yeni ekleme oncekini kapatir, ekranda tek toast kalir.
  document.querySelectorAll('#toastContainer .toast').forEach(t => t.remove());
  // Gram istendi ama bu kalemin gram tabani yok: 1 birim eklendi, SESSIZ KALMA.
  const mesaj = (gramIstendi && !gramTaban)
    ? rec.name + ' eklendi — gram bilinmiyor, 1 ' + (o.unit || 'birim') + ' yazildi'
    : rec.name + ' eklendi';
  if (typeof showUndoToast === 'function') showUndoToast(mesaj, geriAl);
  else showToast(mesaj, 'success');
}
function quickAddSeed(i) {
  const sf = _seedMatches[i]; if (!sf) return;
  // grams/unit GECIYOR: gram sorgusunu gram olarak uygulayan tek bilgi bu.
  _quickAddFood({ name: sf.n, kcal: sf.k, protein: sf.p, carb: sf.c, fat: sf.f, grams: sf.g || 0, unit: sf.u });
}
function quickAddPersonal(i) {
  const m = _localMatches[i]; if (!m) return;
  _quickAddFood({ name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, grams: m.grams || 0, unit: m.unit });
}
function quickAddCustom(i) {
  const m = _customMatches[i]; if (!m) return;
  _quickAddFood({ name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat });
}


/**
 * Enter tusu (2 Eyl 2026). ONCEDEN Enter DOGRUDAN BULUTA gidiyordu —
 * yerel listede aradigi sey duruyor olsa bile. "yaz + Enter" en dogal
 * hareket ve en yavas yola bagliydi; bulut girisi yoksa uyari bile veriyordu.
 * Artik: yerel sonuc varsa Enter ILK SONUCU ekler (ekrana hic dokunmadan
 * arka arkaya kalem girilebilir), yoksa buluta sorar.
 */
function foodSearchEnter() {
  const ilkQuick = document.querySelector('#foodLocal .food-row .food-quick');
  if (ilkQuick) { ilkQuick.click(); return; }
  aiFoodSearch();
}

// ===== Kendi besinlerim (özel besin kaydı) =====
function customFoodMatches(q, limit) {
  ensureDiet();
  q = (q || '').trim().toLocaleLowerCase('tr');
  const list = data.diet.customFoods || [];
  const nq = parseFoodQuery(q).core || trNorm(q);
  if (nq.length < 2) return list.slice(0, limit || 6);   // bos arama = kendi besinlerim listesi
  const arr = list.map(c => ({ c, s: _adPuan(c.name, nq) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length);
  return arr.slice(0, limit || 6).map(x => x.c);
}
function pickCustomFood(i) {
  const m = _customMatches[i]; if (!m) return;
  _aiFood = { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, multi: false, items: [], source: 'custom' };
  showAiPortion(m.name, 'Kendi besinim' + (m.unit ? ' · ' + m.unit : ''), '');
  applyPickQty();
}
// Elle formundaki ad/kcal/makroları kalıcı "kendi besinim" olarak kaydet (bugüne EKLEMEZ)
function saveCustomFood() {
  ensureDiet();
  const name = (document.getElementById('mealName').value || '').trim();
  if (!name) { showToast('Önce besin adını yaz', 'info'); document.getElementById('mealName').focus(); return; }
  const kcalEl = document.getElementById('mealKcal');
  const kcal = kcalEl.value !== '' ? Math.max(0, parseInt(kcalEl.value, 10) || 0) : null;
  if (kcal == null) { showToast('Kalori gir (1 porsiyon için)', 'info'); kcalEl.focus(); return; }
  const rec = { id: Date.now(), name, unit: 'porsiyon', kcal, protein: _optMacro('mealP'), carb: _optMacro('mealC'), fat: _optMacro('mealF') };
  const low = name.toLocaleLowerCase('tr');
  const ex = data.diet.customFoods.find(c => String(c.name || '').toLocaleLowerCase('tr') === low);
  if (ex) { ex.kcal = rec.kcal; ex.protein = rec.protein; ex.carb = rec.carb; ex.fat = rec.fat; }
  else data.diet.customFoods.push(rec);
  save();
  renderCustomManage();
  showToast(name + ' besinlerine kaydedildi', 'success');
}
function deleteCustomFood(id) {
  ensureDiet();
  data.diet.customFoods = data.diet.customFoods.filter(c => c.id !== id);
  save(); renderCustomManage(); renderLocalMatches();
}
function renderCustomManage() {
  const el = document.getElementById('customFoodList'); if (!el) return;
  ensureDiet();
  const list = data.diet.customFoods || [];
  if (!list.length) { el.innerHTML = '<div class="diet-empty">Henüz özel besin yok. Yukarıya ad + kcal (+makro) yazıp "Besinime kaydet" de.</div>'; return; }
  el.innerHTML = list.map(c => {
    const macro = (c.protein != null || c.carb != null || c.fat != null) ? ` · P${c.protein || 0} K${c.carb || 0} Y${c.fat || 0}` : '';
    return `<div class="meal-item"><span class="meal-name">${escapeHtml(c.name)}</span><span class="meal-kcal-tag">${c.kcal} kcal${macro}</span><button class="meal-del" onclick="deleteCustomFood(${c.id})" title="Sil" aria-label="Sil">✕</button></div>`;
  }).join('');
}

// ===== Tariflerim / öğün paketleri (bir günün öğünlerini tek pakete kaydet, tek tıkla ekle) =====
let _recipeEdit = false;
function toggleRecipeEdit() { _recipeEdit = !_recipeEdit; renderRecipes(); }
async function saveRecipeFromDay() {
  ensureDiet();
  const day = dietDay(false);
  if (!day.meals.length) { showToast('Önce bu güne öğün ekle, sonra paket olarak kaydet', 'info'); return; }
  const name = await aidanPrompt('Tarif / öğün paketi', 'İsim (örn. Kahvaltım)', '');
  if (!name || !name.trim()) return;
  const items = day.meals.map(m => ({
    slot: m.slot, name: m.name,
    kcal: m.kcal != null ? m.kcal : null,
    protein: m.protein != null ? m.protein : null,
    carb: m.carb != null ? m.carb : null,
    fat: m.fat != null ? m.fat : null,
  }));
  data.diet.recipes.push({ id: Date.now(), name: name.trim(), items });
  save(); renderRecipes();
  showToast(name.trim() + ' kaydedildi (' + items.length + ' öğün)', 'success');
}
function addRecipe(id) {
  ensureDiet();
  const rec = data.diet.recipes.find(r => r.id === id);
  if (!rec) return;
  const day = dietDay(true);
  const base = Date.now();
  rec.items.forEach((it, k) => {
    day.meals.push({
      id: base + k, slot: it.slot || 'atistirma', name: it.name,
      kcal: it.kcal != null ? it.kcal : null,
      protein: it.protein != null ? it.protein : null,
      carb: it.carb != null ? it.carb : null,
      fat: it.fat != null ? it.fat : null,
      at: mealNow(),
    });
  });
  save(); renderDiet();
  showToast(rec.name + ' eklendi (' + rec.items.length + ' öğün)', 'success');
}
function deleteRecipe(id) {
  ensureDiet();
  data.diet.recipes = data.diet.recipes.filter(r => r.id !== id);
  save(); renderRecipes();
}
function renderRecipes() {
  const el = document.getElementById('recipeList'); if (!el) return;
  ensureDiet();
  const list = data.diet.recipes || [];
  if (!list.length) { el.innerHTML = '<div class="diet-empty">Henüz paket yok. Bir güne öğünlerini ekle, sonra "Bu günü kaydet" ile tek pakette topla — ertesi gün tek dokunuşla eklersin.</div>'; _recipeEdit = false; return; }
  const head = `<div class="freq-head">Dokun → bugüne ekle <button class="freq-editbtn" onclick="toggleRecipeEdit()">${_recipeEdit ? 'bitti' : 'düzenle'}</button></div>`;
  const chips = list.map(r => {
    const kcal = r.items.reduce((s, it) => s + (Number(it.kcal) || 0), 0);
    if (_recipeEdit) {
      return `<span class="freq-chip-edit"><span class="freq-chip-name">${escapeHtml(r.name)} · ${r.items.length} öğün</span><button class="freq-hide" onclick="deleteRecipe(${r.id})" title="Sil">✕</button></span>`;
    }
    return `<button class="freq-chip" onclick="addRecipe(${r.id})" title="Bugüne ekle">${escapeHtml(r.name)}${kcal ? ` · ${kcal} kcal` : ''}</button>`;
  }).join('');
  el.innerHTML = head + '<div class="freq-chips">' + chips + '</div>';
}
function pickPersonalFood(i) {
  const m = _localMatches[i]; if (!m) return;
  // grams devralindiysa porsiyon editorunde Gram kipi de acilir.
  _aiFood = { name: m.name, kcal: m.kcal, protein: m.protein, carb: m.carb, fat: m.fat, multi: false, items: [], source: 'memory', unit: m.unit || null, grams: m.grams || null };
  showAiPortion(m.name, 'Hafızandan' + (m.unit ? ' · ' + m.unit : ''), '');
  applyPickQty();
}
// Türkçe diakritik-duyarsız normalize (kofte→kofte=köfte, doner→döner). Hızlı yazımda eşleşsin.
function trNorm(str) {
  return String(str || '').toLocaleLowerCase('tr')
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u').trim();
}
// Miktar+birim kelimeleri (trNorm edilmiş halleriyle) — arama sorgusundan ayıklamak için
// 'bardagi/kasigi/...' iyelik ekli hâller de burada: "1 su bardağı pirinç"
// yazan biri 'bardagi' kelimesinin sonuçları daraltmasını beklemiyor.
const _FOOD_UNITS = ['dilim', 'dilimi', 'adet', 'adedi', 'tane', 'tanesi', 'bardak', 'bardagi', 'kase', 'kasede', 'kasesi', 'kasik', 'kasigi', 'porsiyon', 'porsiyonu', 'avuc', 'tabak', 'tabagi', 'top', 'kutu', 'kutusu', 'sise', 'fincan', 'durum', 'parca', 'kup', 'paket', 'olcek', 'kadeh', 'dal', 'yaprak', 'lokma', 'su', 'gr', 'gram', 'grami', 'ml', 'mililitre'];
const _FOOD_WORDNUM = { yarim: 0.5, ceyrek: 0.25, bucuk: 1.5, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20 };
// GRAM sayan birim kelimeleri. Bunlar PORSIYON CARPANI DEGIL — "200 gr tavuk"
// 200 porsiyon tavuk demek degildir. 12 Eyl 2026'ya kadar parseFoodQuery birim
// kelimesini atip yalniz sayiyi donduruyordu; hizli ekle de o sayiyi carpan
// sanip 200 porsiyon (49.600 kcal) yaziyordu. Birim artik KAYBEDILMIYOR.
const _FOOD_GRAM_UNITS = ['g', 'gr', 'gram', 'grami', 'ml'];
// Sorgudan baştaki miktar + birim kelimelerini ayıkla:
//   '2 dilim ekmek' -> {qty:2, unit:'dilim', gram:false, core:'ekmek'}
//   '200 gr tavuk'  -> {qty:200, unit:'gr',  gram:true,  core:'tavuk'}
function parseFoodQuery(q) {
  let words = trNorm(q).split(/\s+/).filter(Boolean);
  let qty = null, unit = null;
  // sadece baştaki kelime miktar olabilir (yemek adındaki sayıları bozmasın)
  if (words.length > 1) {
    const w0 = words[0];
    // '150g' / '2adet' gibi bitişik yazımlar da miktar sayılır
    const yapisik = w0.match(/^([0-9]+([.,][0-9]+)?)(g|gr|gram|adet|dilim|ml)$/);
    if (/^[0-9]+([.,][0-9]+)?$/.test(w0)) { qty = Number(w0.replace(',', '.')); words = words.slice(1); }
    else if (yapisik) { qty = Number(yapisik[1].replace(',', '.')); unit = yapisik[3]; words = words.slice(1); }
    else if (_FOOD_WORDNUM[w0] != null) { qty = _FOOD_WORDNUM[w0]; words = words.slice(1); }
  }
  // birim kelimelerini çıkar (kalan çekirdek terim) — hepsi birimse ayıklama yapma
  const birimler = words.filter(w => _FOOD_UNITS.includes(w));
  if (!unit && birimler.length) unit = birimler[0];
  const kept = words.filter(w => !_FOOD_UNITS.includes(w));
  return {
    qty: (qty && qty > 0) ? qty : null,
    unit: unit || null,
    gram: !!(unit && _FOOD_GRAM_UNITS.includes(unit)),
    core: (kept.length ? kept : words).join(' ').trim()
  };
}

function pickSeedFood(i) {
  const sf = _seedMatches[i]; if (!sf) return;
  _aiFood = { name: sf.n, kcal: sf.k, protein: sf.p, carb: sf.c, fat: sf.f, multi: false, items: [], source: 'seed', unit: sf.u, grams: sf.g || null };
  showAiPortion(sf.n, 'Temel · ' + sf.u, '');
  applyPickQty();
}
/**
 * Aramada yazılan miktarı seçilen besinin kutusuna önyükle.
 * '2 dilim ekmek' → adet kutusu 2.
 * '200 gr tavuk göğsü' → GRAM kipine gecer ve 200 yazar (adet kutusuna 200
 * yazmak 200 porsiyon demekti — hizli eklemedeki ayni hatanin yavas yoldaki
 * ikizi). Gram tabani yoksa kip degismez, miktar da onyuklenmez.
 */
function applyPickQty() {
  if (!_pickQty || _pickQty <= 0) return;
  const el = document.getElementById('aiQty');
  if (!el) return;
  if (_pickGram) {
    if (!(_aiFood && _aiFood.grams)) return;   // gram tabani yok: uydurma
    setPortionMode('gram');
    el.value = _pickQty;
  } else {
    el.value = _pickQty;
  }
  updateAiPreview();
}
// Bilinmeyen makro 0 DEGILDIR. 0 yazmak "olcduk, sifir cikti" demektir;
// hcNutritionStats bunu girilmis sayip protein ortalamasini asagi cekiyor
// ve saglik kocu haksiz yere "protein yetersiz" diyordu. scaleFood zaten
// dogru kaliba sahipti, yalniz AI/temel besin yolu bozuktu.
function _mScale(v, m) { return (v == null) ? null : Math.round(v * m); }
function _mShow(v) { return (v == null) ? '\u2014' : v; }
function _aiQtyVal() { const el = document.getElementById('aiQty'); if (!el) return 1; const v = Number(el.value); return (isFinite(v) && v > 0) ? v : 0; }
function updateAiPreview() {
  if (!_aiFood) return;
  const el = document.getElementById('aiPreview'); if (!el) return;
  const m = _aiFood.multi ? 1 : _portionMult();
  const cell = (lab, val, unit) =>
    `<div class="dt-macro"><span class="dt-macro-val">${_mShow(val)}</span><span class="dt-macro-lab">${lab}</span></div>`;
  el.innerHTML =
    cell('kcal', _mScale(_aiFood.kcal, m)) +
    cell('protein', _mScale(_aiFood.protein, m)) +
    cell('karb', _mScale(_aiFood.carb, m)) +
    cell('yağ', _mScale(_aiFood.fat, m));
}
function addAiFood() {
  if (!_aiFood) return;
  const m = _aiFood.multi ? 1 : _portionMult();
  if (!m) { showToast(_portionMode === 'gram' ? 'Gram gir' : 'Adet gir', 'info'); return; }
  const day = dietDay();
  const el = document.getElementById('aiQty');
  const raw = el ? Number(el.value) : 1;
  let label;
  if (_portionMode === 'gram' && _aiFood.grams) {
    label = _aiFood.name + ` (${Math.round(raw)}g)`;
  } else {
    const qStr = (m % 1) ? m.toString().replace('.', ',') : String(m);
    label = _aiFood.name + (m !== 1 ? ` ×${qStr}` : '');
  }
  day.meals.push({
    id: _mealId(), slot: _mealSlot, name: label,
    kcal: _mScale(_aiFood.kcal, m),
    protein: _mScale(_aiFood.protein, m),
    carb: _mScale(_aiFood.carb, m),
    fat: _mScale(_aiFood.fat, m),
    at: mealNow()
  });
  save(); renderDiet(); closeFoodModal();
  _mealUndoToast(day.meals[day.meals.length - 1]);
}

// ===== TAKVİYELER (push hatırlatıcı — mevcut data.reminders + Worker 15dk cron) =====
function renderSupplements() {
  const el = document.getElementById('suppList'); if (!el) return;
  const supps = (data.reminders || []).filter(r => r.kind === 'supp').sort((a, b) => (a.time || a.startTime || '').localeCompare(b.time || b.startTime || ''));
  const meta = document.getElementById('suppMeta');
  const t = today();
  if (meta) meta.textContent = supps.length ? `${supps.filter(r => suppTakenOn(r, t)).length}/${supps.length} alındı` : '';
  if (!supps.length) { el.innerHTML = '<div class="diet-empty">Henüz takviye yok. Aşağıdan ekle — saatinde bildirim gelir.</div>'; return; }
  el.innerHTML = supps.map(r => {
    const taken = suppTakenOn(r, t);
    const timeStr = r.mode === 'interval' ? `${r.startTime}–${r.endTime}` : (r.time || '–');
    const daysStr = (r.days === 'weekdays' ? 'Hafta içi' : 'Her gün') + (r.mode === 'interval' ? ` · ${suppEveryLabel(+r.everyMin || 60)}` : (r.nagEvery ? ` · ${r.nagEvery} dk'da bir, işaretleyene kadar` : ''));
    return `<div class="supp-item${r.enabled === false ? ' off' : ''}${taken ? ' taken' : ''}">` +
      `<button class="supp-check${taken ? ' on' : ''}" onclick="markSuppTaken(${r.id})" title="${taken ? 'işareti kaldır' : 'aldım'}" aria-label="aldım">${taken ? '✓' : ''}</button>` +
      `<span class="supp-time">${escapeHtml(timeStr)}</span>` +
      `<span class="supp-name">${escapeHtml(r.label || '')}${suppLast7(r)}</span>` +
      `<span class="supp-days">${daysStr}</span>` +
      `<input type="checkbox" ${r.enabled !== false ? 'checked' : ''} onchange="toggleSupplement(${r.id})" aria-label="Aç/kapa">` +
      `<button class="supp-del" onclick="deleteSupplement(${r.id})" aria-label="Sil">✕</button></div>`;
  }).join('');
}
let _suppMode = 'single';
function setSuppMode(m) {
  _suppMode = m;
  const bs = document.getElementById('suppModeSingle'), bi = document.getElementById('suppModeInterval');
  if (bs) bs.classList.toggle('active', m === 'single');
  if (bi) bi.classList.toggle('active', m === 'interval');
  const rs = document.getElementById('suppSingleRow'), ri = document.getElementById('suppIntervalRow');
  if (rs) rs.style.display = (m === 'single') ? '' : 'none';
  if (ri) ri.style.display = (m === 'interval') ? '' : 'none';
}
// Nag penceresinin sonu: baslangictan 6 saat sonra, en gec 23:00.
// Sinir sart — "alinana kadar" sinirsiz olsaydi gece boyu bildirim yagardi.
function suppNagUntil(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return null;
  const end = Math.min((+m[1]) * 60 + (+m[2]) + 180, 23 * 60);
  return String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0');
}
function suppEveryLabel(m) { return m === 30 ? "30 dk'da bir" : m === 60 ? 'saatte bir' : `${Math.round(m / 60)} saatte bir`; }
function addSupplement() {
  const name = (document.getElementById('suppName').value || '').trim();
  const days = document.getElementById('suppDays').value;
  if (!name) { showToast('Takviye adı yaz', 'info'); return; }
  data.reminders = data.reminders || [];
  if (_suppMode === 'interval') {
    // Aralıklı mod: uyku düzeni değişkenken tek saat yerine aralık + periyot
    const start = document.getElementById('suppStart').value;
    const end = document.getElementById('suppEnd').value;
    const every = +document.getElementById('suppEvery').value || 60;
    if (!start || !end) { showToast('Başlangıç ve bitiş saati seç', 'info'); return; }
    if (start === end) { showToast('Başlangıç ve bitiş aynı olamaz', 'info'); return; }
    data.reminders.push({ id: Date.now(), label: name, mode: 'interval', startTime: start, endTime: end, everyMin: every, days, enabled: true, lastFired: null, kind: 'supp' });
    document.getElementById('suppStart').value = ''; document.getElementById('suppEnd').value = '';
    showToast(`${start}–${end} arası ${suppEveryLabel(every)} — ${name} kuruldu`, 'success');
  } else {
    const time = document.getElementById('suppTime').value;
    if (!time) { showToast('Saat seç', 'info'); return; }
    const nagOn = (document.getElementById('suppNag') || {}).checked;
    const rec = { id: Date.now(), label: name, time, days, enabled: true, lastFired: null, kind: 'supp' };
    // "Isaretleyene kadar" modu: alindi isaretlenene dek 15 dk'da bir hatirlatir (worker tarafi)
    if (nagOn) { rec.nagEvery = 15; rec.nagUntil = suppNagUntil(time); }
    data.reminders.push(rec);
    document.getElementById('suppTime').value = '';
    showToast(nagOn ? `${time}'dan itibaren ${name} — işaretleyene kadar hatırlatır` : `${time} — ${name} kuruldu`, 'success');
  }
  document.getElementById('suppName').value = '';
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
}
function toggleSupplement(id) { const r = (data.reminders || []).find(x => x.id === id); if (!r) return; r.enabled = (r.enabled === false); save(); renderSupplements(); }
function deleteSupplement(id) {
  data.reminders = (data.reminders || []).filter(x => x.id !== id);
  save(); renderSupplements();
  if (typeof renderFixedReminders === 'function') renderFixedReminders();
  showToast('Takviye silindi', 'info');
}
// "Aldım" artık geçmiş tutar: takenLog[] son 30 gün — uyum şeridi + sabah "dün özeti" bundan okur.
// takenDate eski tek-günlük alan, geriye uyumluluk için senkron tutulur.
function suppTakenOn(r, d) { return (r.takenLog || []).includes(d) || r.takenDate === d; }
function markSuppTaken(id) {
  const r = (data.reminders || []).find(x => x.id === id); if (!r) return;
  const t = today();
  r.takenLog = r.takenLog || [];
  if (r.takenDate && !r.takenLog.includes(r.takenDate)) r.takenLog.push(r.takenDate);
  if (r.takenLog.includes(t)) { r.takenLog = r.takenLog.filter(d => d !== t); r.takenDate = null; }
  else { r.takenLog.push(t); r.takenDate = t; }
  r.takenLog.sort();
  if (r.takenLog.length > 30) r.takenLog = r.takenLog.slice(-30);
  save(); renderSupplements();
}
// Son 7 gün uyum şeridi — nötr gösterim (streak DEĞİL): dolu=alındı, boş=alınmadı, soluk=kapsam dışı
// (hafta içi takviyesinde hafta sonu + takviye eklenmeden önceki günler sayılmaz)
function suppLast7(r) {
  const created = r.id ? isoLocal(new Date(r.id)) : null;
  let out = '';
  for (let i = 6; i >= 0; i--) {
    const d = shiftDateStr(today(), -i);
    const dow = new Date(d + 'T12:00:00').getDay();
    const na = (created && d < created) || (r.days === 'weekdays' && (dow === 0 || dow === 6));
    out += `<span class="supp-dot${na ? ' na' : (suppTakenOn(r, d) ? ' on' : '')}"${i === 0 ? ' data-today="1"' : ''}></span>`;
  }
  return `<span class="supp-dots" title="son 7 gün">${out}</span>`;
}

// ===== Loglanan öğünü düzenle =====
let _editMealId = null, _editMealSlot = 'kahvalti';
// MIKTAR DUZENLEME (6 Eyl 2026) — bkz. editMeal() basindaki not.
let _editMealBase = null;   // { kcal, protein, carb, fat } — TEK BIRIM basina
let _editMealBirim = 'porsiyon';

/** "Yumurta ×3" / "Ekmek (180g)" → { ad, qty, birim }. */
function _editMealParse(name) {
  const t = String(name || '');
  let m = t.match(/^(.*?)\s*\((\d+(?:[.,]\d+)?)\s*g\)\s*$/i);
  if (m) return { ad: m[1].trim(), qty: parseFloat(m[2].replace(',', '.')) || 1, birim: 'g' };
  m = t.match(/^(.*?)\s*×\s*([\d,.]+)\s*$/);
  if (m) return { ad: m[1].trim(), qty: parseFloat(m[2].replace(',', '.')) || 1, birim: 'porsiyon' };
  return { ad: t.trim(), qty: 1, birim: 'porsiyon' };
}
/** Ad + miktar → kayitta duracak isim. Ekleme akisindaki bicimle BIREBIR. */
function _editMealAdla(ad, qty, birim) {
  if (birim === 'g') return `${ad} (${Math.round(qty)}g)`;
  if (!(qty > 0) || qty === 1) return ad;
  const q = (qty % 1) ? String(qty).replace('.', ',') : String(qty);
  return `${ad} ×${q}`;
}
function _editMealQtyVal() {
  const e = document.getElementById('editMealQty');
  const v = e ? parseFloat(String(e.value).replace(',', '.')) : NaN;
  return (isFinite(v) && v > 0) ? v : 0;
}
/**
 * Miktar degisince kalori + 3 makro TEK BIRIM tabanindan yeniden olcekleniyor.
 * ⚠️ Ekrandaki degerden degil tabandan: art arda 1→3→2 yapinca yuvarlama
 * hatasi birikmesin. Kullanici alani elle yazarsa o deger kaliyor (kaydetme
 * alanlardan okuyor), yani elle duzeltme miktar ayarini eziyor — dogru sira.
 */
function editMealQtyChanged() {
  if (!_editMealBase) return;
  const q = _editMealQtyVal(); if (!q) return;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = (v == null) ? '' : Math.round(v * q); };
  set('editMealKcal', _editMealBase.kcal);
  set('editMealP', _editMealBase.protein);
  set('editMealC', _editMealBase.carb);
  set('editMealF', _editMealBase.fat);
}
function editMealQtyStep(d) {
  const e = document.getElementById('editMealQty'); if (!e) return;
  const adim = (_editMealBirim === 'g') ? 10 : 0.5;
  const yeni = Math.max(adim, Math.round((_editMealQtyVal() + d * adim) / adim) * adim);
  // ⚠️ input[type=number] virgullu degeri GECERSIZ sayip alani BOSALTIR
  // (3,5 -> ""). Ekranda nokta durur; virgul yalniz KAYIT adinda kullanilir.
  e.value = String(yeni);
  editMealQtyChanged();
}
function editMeal(id) {
  const day = dietDay(false); const m = (day.meals || []).find(x => x.id === id); if (!m) return;
  _editMealId = id; _editMealSlot = m.slot || 'kahvalti';
  // ⚠️ 6 Eyl 2026 — DUZENLEMENIN EN SIK SEBEBI MIKTAR, isim degil. Onceden
  // modalda yalniz ad + kcal + 3 makro vardi: "1 yumurta"i 3'e cikarmak dort
  // sayiyi ELLE yeniden hesaplamak demekti (320→960, 22→66, 4→12, 24→72) ve
  // adin sonundaki "×2" ekini de elle duzeltmek gerekiyordu. Artik miktar
  // ayri bir alan; ad alaninda yalniz ADIN kendisi duruyor.
  const pr = _editMealParse(m.name || '');
  _editMealBirim = pr.birim;
  const bir = (v) => (v == null) ? null : (v / (pr.qty || 1));
  _editMealBase = { kcal: bir(m.kcal), protein: bir(m.protein), carb: bir(m.carb), fat: bir(m.fat) };
  document.getElementById('editMealName').value = pr.ad;
  const qEl = document.getElementById('editMealQty');
  if (qEl) qEl.value = String(pr.qty);
  const uEl = document.getElementById('editMealQtyUnit');
  if (uEl) uEl.textContent = (pr.birim === 'g') ? 'g' : 'porsiyon';
  document.getElementById('editMealKcal').value = (m.kcal != null ? m.kcal : '');
  document.getElementById('editMealP').value = (m.protein != null ? m.protein : '');
  document.getElementById('editMealC').value = (m.carb != null ? m.carb : '');
  document.getElementById('editMealF').value = (m.fat != null ? m.fat : '');
  document.querySelectorAll('#editMealSlotChips .slot-chip').forEach(c => c.classList.toggle('active', c.getAttribute('data-slot') === _editMealSlot));
  document.getElementById('mealEditModal').classList.add('active');
  setTimeout(() => document.getElementById('editMealName').focus(), 50);
}
function selectEditMealSlot(slot, btn) { _editMealSlot = slot; btn.parentElement.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); }
function closeMealEdit() { document.getElementById('mealEditModal').classList.remove('active'); _editMealId = null; }
function saveMealEdit() {
  if (_editMealId == null) return;
  const day = dietDay(); const m = (day.meals || []).find(x => x.id === _editMealId); if (!m) { closeMealEdit(); return; }
  const name = (document.getElementById('editMealName').value || '').trim();
  if (!name) { showToast('İsim boş olamaz', 'info'); return; }
  const kv = document.getElementById('editMealKcal').value;
  const q = _editMealQtyVal() || 1;
  m.name = _editMealAdla(name, q, _editMealBirim);
  m.kcal = (kv !== '' ? Math.max(0, parseInt(kv, 10) || 0) : null); m.slot = _editMealSlot;
  m.protein = _optMacro('editMealP'); m.carb = _optMacro('editMealC'); m.fat = _optMacro('editMealF');
  save(); renderDiet(); closeMealEdit();
}
function deleteMealFromEdit() { if (_editMealId != null) removeMeal(_editMealId); closeMealEdit(); }

// ===== Kilo detay modalı =====
function openWeightDetail() {
  // Yalnız kilosu OLAN kayıtlar: yağ oranı girilip kilo girilmemiş gün NaN üretiyordu
  const all = (data.diet.weights || []);
  const arr = all.filter(w => w && w.kg != null);
  const modal = document.getElementById('weightDetailModal'); if (!modal) return;
  const body = document.getElementById('weightDetailBody');
  if (!arr.length) { body.innerHTML = '<div class="diet-empty">Henüz kilo kaydı yok.</div>'; modal.classList.add('active'); return; }
  const vals = arr.map(w => w.kg);
  const min = Math.min(...vals), max = Math.max(...vals), last = vals[vals.length - 1], first = vals[0];
  const diff = +(last - first).toFixed(1), sign = diff > 0 ? '+' : '';
  const chart = arr.length >= 2 ? `<div class="wd-chart">${lineChart(vals, diff > 0)}</div>` : '<div class="diet-empty">En az 2 kayıt olunca grafik çıkar.</div>';
  const rows = [...all].slice(-12).reverse().map(w => `<div class="wd-row"><span>${new Date(w.date + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' })}</span><span class="wd-kg">${w.kg != null ? w.kg + ' kg' : '—'}${w.fat != null ? ' · %' + w.fat : ''}</span></div>`).join('');
  body.innerHTML = chart +
    `<div class="wd-stats"><div><span class="wd-num">${last}</span><span class="wd-lbl">son (kg)</span></div>` +
    `<div><span class="wd-num ${diff > 0 ? 'wt-up' : (diff < 0 ? 'wt-down' : '')}">${sign}${diff}</span><span class="wd-lbl">değişim</span></div>` +
    `<div><span class="wd-num">${min}</span><span class="wd-lbl">en düşük</span></div>` +
    `<div><span class="wd-num">${max}</span><span class="wd-lbl">en yüksek</span></div></div>` +
    `<div class="wd-list">${rows}</div>`;
  modal.classList.add('active');
}
function closeWeightDetail() { document.getElementById('weightDetailModal').classList.remove('active'); }

// ===== Son aramalar (Ara sekmesi) =====
function pushRecentFood(q) {
  q = (q || '').trim(); if (!q) return; ensureDiet();
  const low = q.toLocaleLowerCase('tr');
  data.diet.recentFoods = (data.diet.recentFoods || []).filter(x => x.toLocaleLowerCase('tr') !== low);
  data.diet.recentFoods.unshift(q);
  data.diet.recentFoods = data.diet.recentFoods.slice(0, 8);
  save(); renderRecentFoods();
}
function renderRecentFoods() {
  const el = document.getElementById('foodRecent'); if (!el) return;
  const rec = (data.diet.recentFoods || []);
  if (!rec.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="freq-head">Son aramalar</div><div class="freq-chips">' +
    rec.map(q => `<button class="freq-chip" data-q="${escapeHtml(q)}" onclick="recentFoodSearch(this.dataset.q)">${escapeHtml(q)}</button>`).join('') + '</div>';
}
// Cip YEREL arar. Onceden aiFoodSearch() cagiriyordu: bir cipe dokunmak
// oturum + ag bekletiyordu, halbuki sonuc zaten yerel veritabaninda.
function recentFoodSearch(q) {
  const i = document.getElementById('foodSearchInput');
  if (!i) return;
  i.value = q; i.focus();
  renderLocalMatches();
}

