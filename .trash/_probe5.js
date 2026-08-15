const P='/sessions/serene-dreamy-galileo/mnt/claudedeneme';
const {loadBorsa}=require(P+'/tests/helpers/borsa');
const app=loadBorsa();
const h=app.window.document.getElementById('stocksList').innerHTML;
for(const pat of ['<img src=x onerror','<script>alert(2)','&lt;img','&lt;script']){
  const n=h.split(pat).length-1; console.log(pat.padEnd(24), n);
}
let i=-1; while((i=h.indexOf('<img',i+1))>=0) console.log('HAM <img @',i,':',JSON.stringify(h.slice(i,i+90)));
app.close();
