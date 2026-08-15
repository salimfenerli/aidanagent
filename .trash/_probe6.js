const P='/sessions/serene-dreamy-galileo/mnt/claudedeneme';
const {loadBorsa,fixture}=require(P+'/tests/helpers/borsa');
const seed=fixture();
seed.watchlist=[{symbol:"A');alert(1);//",ySymbol:'X',market:'bist',price:1,prevClose:1,changePct:0,currency:'TRY'}];
const app=loadBorsa({seed});
const btns=[...app.window.document.querySelectorAll('#stocksList button[onclick]')];
console.log('buton sayisi:',btns.length);
btns.forEach(b=>console.log(JSON.stringify(b.getAttribute('onclick').slice(0,80))));
app.close();
