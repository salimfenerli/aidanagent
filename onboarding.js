/**
 * onboarding.js — İLK AÇILIŞ TURU (6 Eyl 2026'da ui.js'ten taşındı)
 *
 * ⚠️ NEDEN TEMBEL: bu tur hayatta BİR KEZ görülüyor (`aidan_onboarded`
 * bayrağı ya da zaten görev varsa hiç açılmıyor) ama her açılışta indiriliyor,
 * ayrıştırılıyor ve bellekte duruyordu. Yerel gün planlayıcı eklenince ilk
 * yükleme bütçeyi (185 KB) aştı; doğru cevap eşiği yükseltmek değil, kritik
 * yolda işi olmayanı çıkarmaktı.
 *
 * ⚠️ KAPI ui.js'te KALDI: `maybeShowOnboarding` yerine açılışta önce ucuz
 * kontrol yapılıyor (bayrak var mı, görev var mı) — modül YALNIZ gerçekten
 * gösterilecekse indiriliyor. Mevcut kullanıcı bu dosyayı hiç indirmiyor.
 */

// ============ ONBOARDING (ilk açılış turu) ============
const ONBOARD_STEPS = [
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>', title: 'Aidan\'a hoş geldin', body: 'Görev, odak, okul, borsa ve diyet — hepsi tek yerde. ADHD beynine göre: sade, parçalı, baskısız.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', title: 'Bugünün 3\'ü', body: 'Günde en fazla 3 önemli iş seç. Gerisi listede bekler, seni dağıtmaz. Bittikçe üstünü çiz.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>', title: 'Okul & sınavlar', body: 'Görevler sekmesindeki "Okul" panelinde ders programın ve sınav geri sayımların durur. Ödevleri görev olarak eklersin.' },
  { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>', title: 'Odak modu', body: 'Dağıldığında 25 dk odak sayacı başlat — telefon kilitliyken bile doğru sayar. İlk adımı at, gerisi gelir.' },
];
let _obStep = 0;

function maybeShowOnboarding() {
  try {
    if (localStorage.getItem('aidan_onboarded')) return;
    if ((data.tasks || []).length > 0) { localStorage.setItem('aidan_onboarded', '1'); return; }
  } catch (e) { return; }
  _obStep = 0;
  renderOnboard();
  const m = document.getElementById('onboardModal');
  if (m) m.classList.add('active');
}

function renderOnboard() {
  const last = _obStep === ONBOARD_STEPS.length - 1;
  const st = ONBOARD_STEPS[_obStep];
  const body = document.getElementById('onboardBody');
  if (body) body.innerHTML = `<div class="onboard-icon">${st.icon}</div><div class="onboard-title">${st.title}</div><div class="onboard-text">${st.body}</div>`;
  const dots = document.getElementById('onboardDots');
  if (dots) dots.innerHTML = ONBOARD_STEPS.map((_, i) => `<span class="onboard-dot ${i === _obStep ? 'active' : ''}"></span>`).join('');
  const act = document.getElementById('onboardActions');
  if (act) {
    if (!last) act.innerHTML = `<button class="secondary" onclick="finishOnboard(false)">Geç</button><button onclick="obNext()">Devam →</button>`;
    else act.innerHTML = `<button class="secondary" onclick="finishOnboard(false)">Boş başla</button><button onclick="finishOnboard(true)">Örnek görevlerle başla</button>`;
  }
}
function obNext() { if (_obStep < ONBOARD_STEPS.length - 1) { _obStep++; renderOnboard(); } }

function finishOnboard(addSamples) {
  try { localStorage.setItem('aidan_onboarded', '1'); } catch (e) {}
  const m = document.getElementById('onboardModal');
  if (m) m.classList.remove('active');
  if (addSamples && typeof makeTask === 'function') {
    const t1 = makeTask({ text: 'Matematik ödevini bitir', category: 'odev', priority: 'urgent', estimateMin: 30 });
    t1.mitDate = today();
    const t2 = makeTask({ text: 'Odayı topla', category: 'ev', estimateMin: 15 });
    const t3 = makeTask({ text: '10 dakika kitap oku', category: 'kisisel', estimateMin: 10 });
    data.tasks = data.tasks || [];
    data.tasks.push(t1, t2, t3);
    save();
    renderTasks();
    showToast('3 örnek görev eklendi — istediğini sil ya da düzenle', 'success', 4000);
  } else {
    showToast('Hazırsın — üstteki kutuya ilk görevini yaz', 'info', 3500);
  }
}
