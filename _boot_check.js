// GERCEK ilk yukleme senaryosu: stocks.js ve program.js YOK.
const fs=require('fs'), path=require('path'), {JSDOM,VirtualConsole}=require('jsdom');
const ROOT='/sessions/adoring-optimistic-hawking/mnt/claudedeneme';
const html=fs.readFileSync(path.join(ROOT,'asistan.html'),'utf8');
const errs=[];
const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push('jsdomError: '+e.message));
vc.on('error',(...a)=>errs.push('console.error: '+a.join(' ')));
const dom=new JSDOM(html,{runScripts:'outside-only',virtualConsole:vc,url:'https://aidanapp.pages.dev/',pretendToBeVisual:true});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){}}));
w.scrollTo=()=>{};
for(const f of ['core.js','tasks.js','ui.js']){
  try{ w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')); }
  catch(e){ errs.push('YUKLEME HATASI '+f+': '+e.message); }
}
console.log('--- yukleme sonrasi hatalar:', errs.length?errs:'YOK');
// varsayilan sekme render oldu mu
const tl=w.document.getElementById('taskList');
console.log('--- Gorevler paneli aktif:', w.document.getElementById('tasks').classList.contains('active'));
console.log('--- kritik gorev fonksiyonlari tanimli:',
  ['toggleTask','deleteTask','editTask','addTask','addSubtask','startTaskNow','toggleMit','postponeTask']
    .filter(f=>typeof w[f]!=='function'));
console.log('--- paylasilan yardimcilar tanimli:',
  ['escapeHtml','sparkline','lineChart','donutChart','resizeImageToDataUrl','loadModule','moduleLoaded','setModuleLoading']
    .filter(f=>typeof w[f]!=='function'));
console.log('--- borsa fonksiyonu HENUZ tanimsiz olmali:', typeof w.renderStocks);
// gorev ekle + tamamla akisi calisiyor mu (stocks.js yokken)
try{
  w.document.getElementById('taskInput').value='test gorevi';
  w.addTask();
  const n=(w.data.tasks||[]).length;
  w.toggleTask(w.data.tasks[0].id);
  console.log('--- addTask/toggleTask calisti, gorev sayisi:', n, 'done:', w.data.tasks[0].done);
}catch(e){ console.log('--- GOREV AKISI PATLADI:', e.message); }
// sekme gecisi (borsa harici) patlamiyor mu
(async()=>{
  try{ await w.showTab('focus'); await w.showTab('settings'); await w.showTab('tasks');
       console.log('--- sekme gecisleri OK'); }
  catch(e){ console.log('--- SEKME GECISI PATLADI:', e.message); }
  // borsa: modul yok -> iskelet cikmali, comemeli
  try{ const p=w.showTab('stocks'); 
       console.log('--- borsa iskeleti:', (w.document.querySelector('#stocks .mod-loading')||{}).textContent||'YOK');
       p.catch(e=>console.log('   showTab reddetti:',e.message));
  }catch(e){ console.log('--- BORSA SEKMESI PATLADI:', e.message); }
  setTimeout(()=>{ console.log('--- toplam hata:', errs.length?errs.slice(0,5):'YOK'); process.exit(0); },300);
})();
