const P='/sessions/serene-dreamy-galileo/mnt/claudedeneme';
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
let t=Date.now(); const lap=(m)=>{console.log(m, Date.now()-t,'ms'); t=Date.now();};
const html=fs.readFileSync(path.join(P,'borsa/index.html'),'utf8');
lap('read');
const vc=new VirtualConsole();
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://aidanborsa.pages.dev/',virtualConsole:vc});
lap('JSDOM ctor');
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
w.navigator.serviceWorker={register:()=>new Promise(()=>{})};
w.localStorage.setItem('aidanborsa',JSON.stringify(require(P+'/tests/helpers/borsa').fixture()));
lap('seed');
for(const f of ['shared.js','stocks.js','sync.js','app.js']){
  const s=w.document.createElement('script');
  s.textContent=fs.readFileSync(path.join(P,'borsa',f),'utf8');
  w.document.body.appendChild(s);
  lap('  script '+f);
}
w.close(); lap('close');
