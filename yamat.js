/* Yamat · testata, menu, piede, comparse e micro dettagli comuni a tutte le pagine */
(function(){
const Y=window.YAMAT, here=(location.pathname.split('/').pop()||'index.html');
const PAGES=[['index.html','Il bosco'],['collezione.html','Collezione'],['fragranze.html','Fragranze'],['regali.html','Regali'],['laboratorio.html','Laboratorio'],['cura.html','Cura'],['assistenza.html','Assistenza']];
const cur=p=>here===p||(p==='collezione.html'&&(here==='prodotto.html'||Y.products.some(x=>x.page===here)))?' aria-current="page"':'';

/* testata e menu */
const top=document.createElement('header');top.className='top';
top.innerHTML=`<a class="logo" href="index.html" aria-label="Yamat, il bosco"><img src="logo_yamat_light.png" alt="YAMÂT"></a>
<nav aria-label="Menu">${PAGES.map(([h,t])=>`<a href="${h}"${cur(h)}>${t}</a>`).join('')}</nav>
<div class="end">
<button class="burger" type="button" aria-label="Apri il menu" aria-expanded="false" aria-controls="sheet"><i></i><i></i></button></div>`;
document.body.prepend(top);
const sheet=document.createElement('div');sheet.className='sheet';sheet.id='sheet';sheet.setAttribute('aria-hidden','true');
sheet.innerHTML=`<ol>${PAGES.map(([h,t])=>`<li><a href="${h}"${cur(h)}>${t}</a></li>`).join('')}</ol>
<div class="foot-s"><a href="collezione.html">Negozio</a><a href="https://www.instagram.com/yamat_candle/" target="_blank" rel="noopener">@yamat_candle</a><span>Brescia</span></div>`;
top.after(sheet);
const burger=top.querySelector('.burger');
const setMenu=o=>{document.documentElement.classList.toggle('menu-open',o);burger.setAttribute('aria-expanded',o);burger.setAttribute('aria-label',o?'Chiudi il menu':'Apri il menu');sheet.setAttribute('aria-hidden',!o)};
burger.addEventListener('click',()=>setMenu(!document.documentElement.classList.contains('menu-open')));
addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});

/* la testata si fa piena scorrendo e si nasconde quando si scende */
let lastY=scrollY;
const onScroll=()=>{const y=scrollY;top.classList.toggle('solid',y>60&&!document.body.dataset.clear);
  top.classList.toggle('hide',y>lastY+4&&y>400&&!document.documentElement.classList.contains('menu-open'));if(y<lastY-4)top.classList.remove('hide');lastY=y};
addEventListener('scroll',onScroll,{passive:true});onScroll();

/* piede */
const ft=document.querySelector('footer[data-auto]');
if(ft){ft.className='wrap';ft.innerHTML=`<div class="foot">
  <div><img src="logo_yamat_light.png" alt="YAMÂT" style="height:20px;width:auto"><img class="cow" src="logo_cow.png" alt="Call of Wood"></div>
  <div><h4>Collezione</h4><ul>${Y.products.map(p=>`<li><a href="${p.page}">${p.name}</a></li>`).join('')}</ul></div>
  <div><h4>Yamat</h4><ul>${PAGES.map(([h,t])=>`<li><a href="${h}">${t}</a></li>`).join('')}${(Y.checkout==='whatsapp'||(()=>{try{return sessionStorage.getItem('ymt_wa')==='1'}catch(e){return false}})())?'':`<li><a href="${Y.shop}/gift-card" target="_blank" rel="noopener">Buono regalo ↗</a></li>`}</ul></div>
  <div><h4>Scrivici</h4><ul><li><a href="mailto:yamatcandle@gmail.com">yamatcandle@gmail.com</a></li><li>Via Costalunga 34, Brescia</li><li><a href="https://www.instagram.com/yamat_candle/" target="_blank" rel="noopener">Instagram @yamat_candle</a></li></ul></div>
</div>
<div class="firma" aria-hidden="true"><i></i></div>
<div class="fine"><span>© 2026 Yamat Candle · Artigianato italiano, fatto a mano a Brescia · <a href="https://www.iubenda.com/privacy-policy/42851129" target="_blank" rel="noopener">Privacy</a> · <a href="https://www.iubenda.com/privacy-policy/42851129/cookie-policy" target="_blank" rel="noopener">Cookie</a></span><span>Le foto del bosco e delle stanze sono generate con l’IA dalle foto dei prodotti</span></div>`}

/* schede prodotto riutilizzabili */
window.yCard=(p,i=0)=>`<a class="card up" href="${p.page}" data-cursor="Vedi" style="transition-delay:${(i%4)*.08}s">
 <figure><img src="${p.card||p.img}" alt="${p.name}" loading="lazy"${ySet(p.card||p.img,'(max-width:700px) 50vw, 30vw')}><img class="alt" src="${p.card?p.img:(p.gallery[1]||p.img)}" alt="" loading="lazy"${ySet(p.card?p.img:(p.gallery[1]||p.img),'(max-width:700px) 50vw, 30vw')}></figure>
 <div class="row"><span class="no num">N° ${String(window.YAMAT.products.findIndex(x=>x.id===p.id)+1).padStart(2,'0')}</span>${p.tag?`<em class="nota">${p.tag}</em>`:''}</div>
 <div class="row"><h3>${p.name}</h3><span class="price num">${p.price} €</span></div>
 <div class="row"><small>${p.short}</small></div></a>`;

/* comparse */
window.yReveal=()=>{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('shown');io.unobserve(e.target)}}),{threshold:.14,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.up:not(.shown),.mask:not(.shown),.head:not(.shown),.rvx:not(.shown)').forEach(el=>io.observe(el))};

/* parallasse leggera sulle immagini con data-par */
const pars=new Set();const par=()=>{const h=innerHeight;pars.forEach(el=>{const r=el.parentElement.getBoundingClientRect();if(r.bottom<0||r.top>h)return;const k=+el.dataset.par||.12;el.style.transform=`translate3d(0,${((r.top+r.height/2-h/2)*-k).toFixed(1)}px,0) scale(1.14)`})};
window.yPar=()=>{document.querySelectorAll('[data-par]').forEach(el=>pars.add(el));par()};
addEventListener('scroll',()=>requestAnimationFrame(par),{passive:true});

/* velo fra le pagine */
const veil=document.createElement('div');veil.className='veil';document.body.append(veil);
requestAnimationFrame(()=>requestAnimationFrame(()=>veil.classList.add('off')));
addEventListener('pageshow',e=>{if(e.persisted){veil.classList.remove('go');veil.classList.add('off')}});
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a||a.target==='_blank'||e.metaKey||e.ctrlKey||e.shiftKey)return;
  const h=a.getAttribute('href');if(!h||h.startsWith('#')||h.startsWith('mailto:')||/^https?:/.test(h))return;
  e.preventDefault();setMenu(false);veil.classList.remove('off');veil.classList.add('go');setTimeout(()=>location.href=h,480)});

/* ---------- carrello ----------
   Il sito parla direttamente col negozio Wix (Wix Headless, client "Sito Yamat", token da visitatore anonimo):
   catalogo, carrello e quantità si gestiscono qui; si esce dal sito solo per pagare, sulla cassa di Wix,
   che a ordine fatto riporta a grazie.html. */
const CID='1c374c8c-0f07-48b1-9f03-073b605be53e',API='https://www.wixapis.com',STORES='215238eb-22a5-4c36-9e7b-e7c08025e04e',TK='ymt_tok';
let tok=null;try{tok=JSON.parse(localStorage.getItem(TK))}catch(e){}
const keep=t=>{tok=t;try{localStorage.setItem(TK,JSON.stringify(t))}catch(e){}};
async function token(body){const r=await fetch(API+'/oauth2/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error('token');const d=await r.json();keep({a:d.access_token,r:d.refresh_token||(tok&&tok.r),e:Date.now()+(d.expires_in-120)*1000});return tok.a}
async function auth(){if(tok&&tok.a&&tok.e>Date.now())return tok.a;
  if(tok&&tok.r){try{return await token({refresh_token:tok.r,grantType:'refresh_token'})}catch(e){}}   // stesso visitatore, stesso carrello
  return token({clientId:CID,grantType:'anonymous'})}
async function wix(path,method='GET',body,again=true){const r=await fetch(API+path,{method,headers:{'Authorization':await auth(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(r.status===401&&again){if(tok)tok.e=0;return wix(path,method,body,false)}
  const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.message||('Errore '+r.status));e.status=r.status;throw e}return d}
const eur=a=>(+a).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const byWid=Object.fromEntries(Y.products.map(p=>[p.wid,p]));
let cart=null,busy=false;
/* ---------- modalità WhatsApp (senza Wix) ----------
   Si attiva con Y.checkout==='whatsapp' (data.js) oppure, per provarla, con ?wa=1 (resta per la sessione; ?wa=0 la spegne).
   Catalogo da data.js, carrello nel browser, ordine = messaggio WhatsApp già scritto. Niente cassa, niente Wix. */
const WAP=new URLSearchParams(location.search);
if(WAP.has('wa')){try{sessionStorage.setItem('ymt_wa',WAP.get('wa'))}catch(e){}}
let WAON=Y.checkout==='whatsapp';try{const f=sessionStorage.getItem('ymt_wa');if(f==='1')WAON=true;if(f==='0')WAON=false}catch(e){}
const WA_NUM=Y.whatsapp||'393933325473';
const MINIMO=20;   // ordine minimo in euro (22/10: sopra i 20 € la spedizione in Italia è gratuita)
const WK='ymt_wa_cart';
const waLines=()=>{try{return JSON.parse(localStorage.getItem(WK))||[]}catch(e){return[]}};
const waSave=L=>{try{localStorage.setItem(WK,JSON.stringify(L))}catch(e){}};
const priceNum=p=>parseFloat(String(p.price).replace('.','').replace(',','.'));
const waCart=()=>{const L=waLines();let sub=0;
  const items=L.map(l=>{const p=byWid[l.wid];const unit=p?priceNum(p):0;const tot=unit*l.q;sub+=tot;
    return {id:l.k,name:{original:l.name},quantityInfo:{requestedQuantity:l.q},
      attributes:{descriptionLines:Object.entries(l.o||{}).map(([n,v])=>({name:{original:n},plainText:{original:v}})),image:{url:p?p.img:''}},
      pricing:{totalPrice:{amount:tot}},source:{catalogReference:{catalogItemId:l.wid}}}});
  return {lineItems:items,subtotal:{amount:sub}}};
const waCat=()=>Y.products.map(p=>({id:p.wid,name:p.name,stock:{inStock:true},manageVariants:false,variants:[],
  productOptions:p.options.map(([n,v])=>({name:n,choices:v.map(x=>({description:x,inStock:true,visible:true}))}))}));
const waMsg=()=>{const L=waLines();let tot=0;
  const righe=L.map(l=>{const p=byWid[l.wid];const t=(p?priceNum(p):0)*l.q;tot+=t;
    const o=Object.entries(l.o||{}).map(([n,v])=>n+': '+v).join(', ');
    return '• '+l.name+(l.q>1?' ×'+l.q:'')+(o?' ('+o+')':'')+' — '+eur(t)}).join('\n');
  return 'Ciao Yamat! Vorrei ordinare:\n\n'+righe+'\n\nTotale: '+eur(tot)+'\nSpedizione gratuita in Italia.\n\nNome e cognome:\nIndirizzo di consegna:\nTelefono:\n\nGrazie!'};
const CWA={
  async products(){return waCat()},
  async load(){cart=waCart();paint()},
  async add(wid,options,qty=1){const p=byWid[wid];const o=(options&&options.options)||{};
    const L=waLines(),k=wid+'|'+JSON.stringify(o);const f=L.find(x=>x.k===k);
    if(f)f.q+=qty;else L.push({k,wid,name:p?p.name:'Candela',o,q:qty});waSave(L);cart=waCart();paint();open()},
  async qty(id,n){let L=waLines();const f=L.find(x=>x.k===id);if(f){f.q=n;if(n<=0)L=L.filter(x=>x.k!==id)}waSave(L);cart=waCart();paint()},
  async pay(){if(!waLines().length)return;location.href='https://wa.me/'+WA_NUM+'?text='+encodeURIComponent(waMsg())}
};
const C={
  /* catalogo vivo del negozio (opzioni, varianti, disponibilità), tenuto per la sessione */
  async products(){try{const c=JSON.parse(sessionStorage.getItem('ymt_cat'));if(c&&c.t>Date.now()-6e5)return c.p}catch(e){}
    const d=await wix('/stores/v1/products/query','POST',{query:{paging:{limit:100}},includeVariants:true});
    try{sessionStorage.setItem('ymt_cat',JSON.stringify({t:Date.now(),p:d.products}))}catch(e){}return d.products},
  async load(){if(!tok){cart=null;paint();return}
    try{cart=(await wix('/ecom/v2/carts/current')).cart}catch(e){cart=null}paint()},
  async add(wid,options,qty=1){const ref={catalogItemId:wid,appId:STORES};if(options)ref.options=options;
    cart=(await wix('/ecom/v2/carts/current/add-line-items','POST',{catalogItems:[{catalogReference:ref,quantity:qty}]})).cart;paint();open()},
  async qty(id,n){busy=true;paint();try{cart=(n>0?await wix('/ecom/v2/carts/current/update-line-items','POST',{lineItems:[{lineItemId:id,quantity:{newQuantity:n}}]})
      :await wix('/ecom/v2/carts/current/remove-line-items','POST',{lineItemIds:[id]})).cart}finally{busy=false;paint()}},
  async pay(){busy=true;paint();
    try{const live=/yamatcandle\.com$/.test(location.hostname),home=live?location.origin:'https://www.yamatcandle.com';
      const {checkoutId}=await wix('/ecom/v1/carts/current/create-checkout','POST',{channelType:'WEB'});
      const s=await wix('/_api/redirects-api/v1/redirect-session','POST',{ecomCheckout:{checkoutId},callbacks:{postFlowUrl:home+'/',thankYouPageUrl:home+'/grazie.html',cartPageUrl:home+'/collezione.html?carrello=1'}});
      location.href=s.redirectSession.fullUrl}
    catch(e){busy=false;paint();note('La cassa non risponde. Riprova tra un momento.')}}
};
if(WAON)Object.assign(C,CWA);
window.yCart=C;

/* pannello del carrello */
const cb=document.createElement('button');cb.type='button';cb.className='pill cartb';cb.setAttribute('aria-controls','cart');
cb.innerHTML='Carrello <span class="n num">0</span>';top.querySelector('.end').insertBefore(cb,burger);
const pane=document.createElement('div');pane.className='cart';pane.id='cart';pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');pane.setAttribute('aria-label','Carrello');pane.setAttribute('aria-hidden','true');
pane.innerHTML=`<div class="cart-bg"></div><aside data-lenis-prevent><header><span class="label">Il tuo carrello</span><button type="button" class="x">Chiudi</button></header>
<div class="items"></div><p class="cmsg" role="status"></p>
<footer><div class="tot"><span>Subtotale</span><b class="price num">0,00 €</b></div><p class="minimo"></p><p>Ordine minimo 20 €, spedizione gratuita in Italia. Le spese per l’estero si calcolano alla cassa.</p>
<button type="button" class="btn go">Vai alla cassa</button></footer></aside>`;
document.body.append(pane);
if(WAON){const f=pane.querySelector('footer');f.querySelector('p:not(.minimo)').textContent='Ordine minimo 20 €, spedizione gratuita in Italia. Ti si apre WhatsApp con l’ordine già scritto: ci rispondiamo per conferma, pagamento e spedizione.';f.querySelector('.go').textContent='Ordina su WhatsApp'}
const open=()=>{setMenu(false);pane.setAttribute('aria-hidden','false');document.documentElement.classList.add('cart-open');pane.querySelector('.x').focus({preventScroll:true})};
const shut=()=>{pane.setAttribute('aria-hidden','true');document.documentElement.classList.remove('cart-open')};
const note=t=>{const m=pane.querySelector('.cmsg');m.textContent=t;clearTimeout(note.t);note.t=setTimeout(()=>m.textContent='',6000)};
C.open=open;C.note=note;
cb.addEventListener('click',open);pane.querySelector('.x').addEventListener('click',shut);pane.querySelector('.cart-bg').addEventListener('click',shut);
addEventListener('keydown',e=>{if(e.key==='Escape')shut()});
function paint(){const L=(cart&&cart.lineItems)||[],n=L.reduce((a,l)=>a+(l.quantityInfo.requestedQuantity||0),0);
  cb.querySelector('.n').textContent=n;cb.classList.toggle('has',n>0);
  pane.classList.toggle('busy',busy);
  pane.querySelector('.items').innerHTML=L.length?L.map(l=>{const p=byWid[l.source.catalogReference.catalogItemId],q=l.quantityInfo.requestedQuantity;
    const opts=(l.attributes.descriptionLines||[]).map(d=>`<small>${d.name.original}: ${d.plainText?d.plainText.original:''}</small>`).join('');
    return `<div class="it"><a href="${p?p.page:'collezione.html'}"><img src="${p?p.img:l.attributes.image.url}" alt=""></a>
      <div><a class="nm" href="${p?p.page:'collezione.html'}">${l.name.original}</a>${opts}
      <div class="q"><button type="button" data-q="${encodeURIComponent(l.id)}" data-n="${q-1}" aria-label="Uno in meno">−</button><span class="num">${q}</span><button type="button" data-q="${encodeURIComponent(l.id)}" data-n="${q+1}" aria-label="Uno in più">+</button>
      <button type="button" class="rm" data-q="${encodeURIComponent(l.id)}" data-n="0">Togli</button></div></div>
      <b class="price num">${eur(l.pricing.totalPrice.amount)}</b></div>`}).join('')
    :`<div class="empty"><p>Il carrello è vuoto.</p><a class="lnk" href="collezione.html">Scopri la collezione</a></div>`;
  pane.querySelector('.tot b').textContent=eur(cart&&cart.subtotal?cart.subtotal.amount:0);
  /* ordine minimo 20 €: sotto, il pulsante si spegne e si dice quanto manca */
  const sub=cart&&cart.subtotal?+cart.subtotal.amount:0,manca=Math.max(0,MINIMO-sub);
  pane.querySelector('.minimo').textContent=manca>0?'Ordine minimo 20 €: aggiungi ancora '+eur(manca)+'.':'';
  pane.querySelector('.go').disabled=manca>0||busy;
  pane.querySelector('footer').style.display=L.length?'':'none'}
pane.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(!b||busy)return;C.qty(decodeURIComponent(b.dataset.q),+b.dataset.n).catch(()=>note('Non sono riuscito a cambiare il carrello. Riprova.'))});
pane.querySelector('.go').addEventListener('click',()=>{const sub=cart&&cart.subtotal?+cart.subtotal.amount:0;if(sub<MINIMO){note('L’ordine minimo è di 20 €.');return}if(!busy)C.pay()});
C.load().then(()=>{if(new URLSearchParams(location.search).has('carrello'))open()});
addEventListener('pageshow',e=>{if(e.persisted){busy=false;C.load()}});   // tornando indietro dalla cassa il carrello si riallinea

/* ---------- LUME: il movimento del sito ----------
   Un'idea sola: la candela. Dove passa il visitatore la luce si scalda, le foto respirano con lo scorrimento,
   le schede si inclinano verso la mano, la firma Yamat si accende in fondo. Con «Riduci movimento» resta tutto fermo. */
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches,FINE=matchMedia('(hover:hover) and (pointer:fine)').matches,HOME=!!document.body.dataset.clear;
const root=document.documentElement;

/* filo d'oro in cima: quanto manca alla fine della pagina */
const filo=document.createElement('div');filo.className='filo';filo.setAttribute('aria-hidden','true');document.body.append(filo);
const filoUp=()=>{const h=root.scrollHeight-innerHeight;filo.style.transform=`scaleX(${h>0?Math.min(1,Math.max(0,scrollY/h)).toFixed(4):0})`};
addEventListener('scroll',()=>requestAnimationFrame(filoUp),{passive:true});addEventListener('resize',filoUp);filoUp();

/* le foto grandi respirano con lo scorrimento (dentro la loro cornice) */
const autoPar=()=>{document.querySelectorAll('.split figure img,.big figure img,.feature .bg img,.inbosco .bg img,.phead .bg img').forEach(i=>{if(!i.dataset.par)i.dataset.par=i.closest('.phead')?'.06':'.08'});window.yPar()};
if(!RM){autoPar();addEventListener('load',autoPar)}

/* la firma in fondo si accende quando arriva */
const firma=document.querySelector('.firma');
if(firma){if(RM)firma.classList.add('shown');else new IntersectionObserver((es,o)=>es.forEach(e=>{if(e.isIntersecting){firma.classList.add('shown');o.disconnect()}}),{threshold:.35}).observe(firma)}

/* il nastro delle parole accelera quando si scorre in fretta */
const tick=[...document.querySelectorAll('.ticker div')];
if(tick.length&&!RM){let ly=scrollY,v=0;addEventListener('scroll',()=>{v=Math.max(v,Math.abs(scrollY-ly));ly=scrollY},{passive:true});
  (function tv(){v*=.92;const r=1+Math.min(5,v*.18);tick.forEach(d=>d.getAnimations().forEach(a=>a.playbackRate=r));requestAnimationFrame(tv)})()}

if(FINE&&!RM){
  /* scorrimento morbido (non nel bosco: lì la camera ha già il suo) */
  if(!HOME){const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/lenis@1.3.27/dist/lenis.min.js';
    sc.onload=()=>{try{const l=new window.Lenis({lerp:.09,wheelMultiplier:.95,anchors:true});window.yLenis=l;
      (function r(t){l.raf(t);requestAnimationFrame(r)})(performance.now());
      new MutationObserver(()=>{root.classList.contains('menu-open')||root.classList.contains('cart-open')?l.stop():l.start()}).observe(root,{attributes:true,attributeFilter:['class']});
      }catch(e){}};document.head.append(sc)}

  /* la luce della candela segue la mano */
  const lume=document.createElement('div');lume.className='lume';lume.setAttribute('aria-hidden','true');document.body.append(lume);
  let lx=innerWidth/2,ly2=innerHeight/2,tx=lx,ty=ly2,on=0,ton=0;
  addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;ton=1},{passive:true});
  document.addEventListener('pointerleave',()=>ton=0);addEventListener('blur',()=>ton=0);
  (function lu(t){lx+=(tx-lx)*.1;ly2+=(ty-ly2)*.1;on+=(ton-on)*.04;
    const fl=1+Math.sin(t*.0091)*.035+Math.sin(t*.0157+1.3)*.02;   // il respiro irregolare di una fiamma
    lume.style.transform=`translate3d(${lx.toFixed(1)}px,${ly2.toFixed(1)}px,0) translate(-50%,-50%) scale(${fl.toFixed(3)})`;
    lume.style.opacity=(on*(.86+Math.sin(t*.0113)*.07)).toFixed(3);requestAnimationFrame(lu)})(0);

  /* le schede si inclinano verso la mano, con un riflesso caldo */
  let tf=null;const free=f=>{if(!f)return;f.style.transform='';f.classList.remove('tilt')};
  document.addEventListener('pointermove',e=>{const f=e.target.closest&&e.target.closest('.card figure');if(tf&&tf!==f)free(tf);tf=f;if(!f)return;
    const r=f.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;f.classList.add('tilt');
    f.style.transform=`perspective(1000px) rotateY(${((px-.5)*5).toFixed(2)}deg) rotateX(${((.5-py)*5).toFixed(2)}deg)`;
    f.style.setProperty('--gx',(px*100).toFixed(1)+'%');f.style.setProperty('--gy',(py*100).toFixed(1)+'%')},{passive:true});
  document.addEventListener('pointerleave',()=>{free(tf);tf=null});
}

/* niente cursore finto: resta la freccia normale; solo i bottoni magnetici */
if(matchMedia('(hover:hover)').matches){
  /* bottoni magnetici */
  document.addEventListener('mousemove',e=>{document.querySelectorAll('.btn,.pill').forEach(b=>{const r=b.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    b.style.transform=Math.hypot(dx,dy)<90?`translate(${dx*.18}px,${dy*.25}px)`:''})});
}
})();

/* passaggio tra le pagine: la foto della card cliccata vola al posto della foto grande del prodotto, e al ritorno torna nella sua card */
(()=>{let fig=null;const path=u=>new URL(u,location.href).pathname.replace(/\/index\.html$/,'/');
  document.addEventListener('click',e=>{const a=e.target.closest('a.card');fig=a?a.querySelector('figure'):null},true);
  addEventListener('pageswap',e=>{if(!e.viewTransition)return;
    document.querySelectorAll('.gal>figure:first-child').forEach(f=>f.style.viewTransitionName='none');
    if(fig&&e.activation&&path(e.activation.entry.url)===path(fig.closest('a').href))fig.style.viewTransitionName='prod';});
  addEventListener('pageshow',()=>{document.querySelectorAll('[style*="view-transition-name"]').forEach(f=>f.style.viewTransitionName='');fig=null});
  addEventListener('pagereveal',e=>{const from=window.navigation&&navigation.activation&&navigation.activation.from;
    if(!e.viewTransition||!from||document.querySelector('.gal'))return;
    const a=[...document.querySelectorAll('a.card')].find(a=>path(a.href)===path(from.url));if(!a)return;
    const f=a.querySelector('figure');f.style.viewTransitionName='prod';e.viewTransition.finished.finally(()=>f.style.viewTransitionName='')});
})();

/* telefono (niente mouse): la seconda foto della card compare da sola quando la card passa a metà schermo */
if(matchMedia('(hover:none)').matches&&'IntersectionObserver' in window){
  const vio=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('vivo',e.isIntersecting)),{rootMargin:'-40% 0px -40% 0px'});
  const r0=window.yReveal;window.yReveal=(...a)=>{r0(...a);document.querySelectorAll('a.card:not([data-vivo])').forEach(c=>{c.dataset.vivo=1;vio.observe(c)})}}
