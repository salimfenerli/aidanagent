const P='/sessions/serene-dreamy-galileo/mnt/claudedeneme';
const {loadBorsa}=require(P+'/tests/helpers/borsa');
const app=loadBorsa();
const h=app.window.document.getElementById('stocksList').innerHTML;
const i=h.indexOf('img src=x');
console.log('bulundu mu:', i);
if(i>=0) console.log('BAGLAM:\n', h.slice(Math.max(0,i-300), i+200));
// gercekten script calisti mi?
console.log('script etiketi sayisi:', app.window.document.querySelectorAll('#stocksList script').length);
console.log('img etiketi sayisi:', app.window.document.querySelectorAll('#stocksList img').length);
app.close();
