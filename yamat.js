/* Yamat · testata, menu, piede, comparse e micro dettagli comuni a tutte le pagine */
(function(){
const Y=window.YAMAT, here=(location.pathname.split('/').pop()||'index.html');
const PAGES=[['index.html','Il bosco'],['collezione.html','Collezione'],['fragranze.html','Fragranze'],['regali.html','Regali'],['laboratorio.html','Laboratorio'],['cura.html','Cura'],['assistenza.html','Assistenza']];
const cur=p=>here===p||(p==='collezione.html'&&here==='prodotto.html')?' aria-current="page"':'';

/* testata e menu */
const top=document.createElement('header');top.className='top';
top.innerHTML=`<a class="logo" href="index.html" aria-label="Yamat, il bosco"><img src="logo_yamat_light.png" alt="YAMÂT"></a>
<nav aria-label="Menu">${PAGES.map(([h,t])=>`<a href="${h}"${cur(h)}>${t}</a>`).join('')}</nav>
<div class="end"><a class="pill" href="${Y.shop}/shop" target="_blank" rel="noopener">Negozio ↗</a>
<button class="burger" type="button" aria-label="Apri il menu" aria-expanded="false" aria-controls="sheet"><i></i><i></i></button></div>`;
document.body.prepend(top);
const sheet=document.createElement('div');sheet.className='sheet';sheet.id='sheet';sheet.setAttribute('aria-hidden','true');
sheet.innerHTML=`<ol>${PAGES.map(([h,t])=>`<li><a href="${h}"${cur(h)}>${t}</a></li>`).join('')}</ol>
<div class="foot-s"><a href="${Y.shop}/shop" target="_blank" rel="noopener">Negozio ↗</a><a href="https://www.instagram.com/yamat_candle/" target="_blank" rel="noopener">@yamat_candle</a><span>Brescia</span></div>`;
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
  <div><h4>Collezione</h4><ul>${Y.products.map(p=>`<li><a href="prodotto.html?p=${p.id}">${p.name}</a></li>`).join('')}</ul></div>
  <div><h4>Yamat</h4><ul>${PAGES.map(([h,t])=>`<li><a href="${h}">${t}</a></li>`).join('')}<li><a href="${Y.shop}/gift-card" target="_blank" rel="noopener">Buono regalo ↗</a></li></ul></div>
  <div><h4>Scrivici</h4><ul><li><a href="mailto:yamatcandle@gmail.com">yamatcandle@gmail.com</a></li><li>Via Costalunga 34, Brescia</li><li><a href="https://www.instagram.com/yamat_candle/" target="_blank" rel="noopener">Instagram @yamat_candle</a></li></ul></div>
</div>
<div class="fine"><span>© 2026 Yamat Candle · Artigianato italiano, fatto a mano a Brescia · <a href="https://www.iubenda.com/privacy-policy/42851129" target="_blank" rel="noopener">Privacy</a> · <a href="https://www.iubenda.com/privacy-policy/42851129/cookie-policy" target="_blank" rel="noopener">Cookie</a></span><span>Le foto del bosco e delle stanze sono generate con l’IA dalle foto dei prodotti · Prototipo di studio</span></div>`}

/* schede prodotto riutilizzabili */
window.yCard=(p,i=0)=>`<a class="card up" href="prodotto.html?p=${p.id}" data-cursor="Vedi" style="transition-delay:${(i%4)*.08}s">
 <figure>${p.tag?`<span class="tag">${p.tag}</span>`:''}<img src="${p.img}" alt="${p.name}" loading="lazy"><img class="alt" src="${p.gallery[1]||p.img}" alt="" loading="lazy"></figure>
 <div class="row"><h3>${p.name}</h3><span class="price num">${p.price} €</span></div>
 <div class="row" style="border:0;padding:0;margin-top:-4px"><small>${p.short}</small><span class="buy">Scopri →</span></div></a>`;

/* comparse */
window.yReveal=()=>{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('shown');io.unobserve(e.target)}}),{threshold:.14,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.up:not(.shown),.mask:not(.shown),.head:not(.shown),.rvx:not(.shown)').forEach(el=>io.observe(el))};

/* parallasse leggera sulle immagini con data-par */
const pars=[];const par=()=>{const h=innerHeight;pars.forEach(el=>{const r=el.parentElement.getBoundingClientRect();if(r.bottom<0||r.top>h)return;const k=+el.dataset.par||.12;el.style.transform=`translate3d(0,${((r.top+r.height/2-h/2)*-k).toFixed(1)}px,0) scale(1.14)`})};
window.yPar=()=>{document.querySelectorAll('[data-par]').forEach(el=>pars.push(el));par()};
addEventListener('scroll',()=>requestAnimationFrame(par),{passive:true});

/* velo fra le pagine */
const veil=document.createElement('div');veil.className='veil';document.body.append(veil);
requestAnimationFrame(()=>requestAnimationFrame(()=>veil.classList.add('off')));
addEventListener('pageshow',e=>{if(e.persisted){veil.classList.remove('go');veil.classList.add('off')}});
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a||a.target==='_blank'||e.metaKey||e.ctrlKey||e.shiftKey)return;
  const h=a.getAttribute('href');if(!h||h.startsWith('#')||h.startsWith('mailto:')||/^https?:/.test(h))return;
  e.preventDefault();setMenu(false);veil.classList.remove('off');veil.classList.add('go');setTimeout(()=>location.href=h,480)});

/* niente cursore finto: resta la freccia normale; solo i bottoni magnetici */
if(matchMedia('(hover:hover)').matches){
  /* bottoni magnetici */
  document.addEventListener('mousemove',e=>{document.querySelectorAll('.btn,.pill').forEach(b=>{const r=b.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    b.style.transform=Math.hypot(dx,dy)<90?`translate(${dx*.18}px,${dy*.25}px)`:''})});
}
})();
