const P='/sessions/serene-dreamy-galileo/mnt/claudedeneme';
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(P,'borsa/index.html'),'utf8');
const vc=new VirtualConsole();
vc.on('jsdomError',e=>console.log('JSDOM-ERR:',(e.detail&&e.detail.message)||e.message));
vc.on('error',(...a)=>console.log('CONSOLE-ERR:',...a));
vc.on('warn',(...a)=>console.log('CONSOLE-WARN:',...a));
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://aidanborsa.pages.dev/',virtualConsole:vc});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
w.navigator.serviceWorker={register:()=>new Promise(()=>{})};
w.localStorage.setItem('aidanborsa',JSON.stringify(require(P+'/tests/helpers/borsa').fixture()));
console.log('readyState (script eklemeden once):', w.document.readyState);
for(const f of ['shared.js','stocks.js','sync.js','app.js']){
  const s=w.document.createElement('script');
  s.textContent=fs.readFileSync(path.join(P,'borsa',f),'utf8');
  w.document.body.appendChild(s);
}
console.log('readyState (sonra):', w.document.readyState);
console.log('stocksList uzunluk:', (w.document.getElementById('stocksList')||{}).innerHTML?.length);
console.log('tradeJournal uzunluk:', (w.document.getElementById('tradeJournal')||{}).innerHTML?.length);
console.log('saat:', (w.document.getElementById('stocksModeClock')||{}).textContent);
try{ w.eval('renderStocks()'); console.log('elle renderStocks OK ->', w.document.getElementById('stocksList').innerHTML.length); }
catch(e){ console.log('elle renderStocks HATA:', e.message); }
w.close();
