
/* TAREFA 4A — Endo SuperRes v3 (4x, unsharp multi-escala + slider + botão EndoFocus) */
(function(){
  if (window._endoSuperResInstalled) return;
  window._endoSuperResInstalled = true;
  function box(L,w,h){var O=new Float32Array(L.length);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var s=0;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var yy=y+dy,xx=x+dx;
        if(yy<0)yy=0;else if(yy>=h)yy=h-1;if(xx<0)xx=0;else if(xx>=w)xx=w-1;s+=L[yy*w+xx];}
      O[y*w+x]=s/9;}return O;}
  function upscaleStepped(cv,factor){var cur=cv,curF=1;
    while(curF<factor-0.001){var step=Math.min(2,factor/curF);
      var o=document.createElement('canvas');o.width=Math.round(cur.width*step);o.height=Math.round(cur.height*step);
      var c=o.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(cur,0,0,o.width,o.height);
      cur=o;curF*=step;}return cur;}
  function pickCanvas(){var cands=[];
    ['endo-axial','endo-coronal','endo-sagittal','endo-focus-viewport','axial-viewport','modal-viewport'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;var cv=el.querySelector('canvas');if(!cv)return;
      var r=cv.getBoundingClientRect();if(r.width>10&&r.height>10)cands.push({cv:cv,area:r.width*r.height});});
    if(!cands.length){var tab=document.getElementById('tab-endo')||document;
      tab.querySelectorAll('canvas').forEach(function(cv){var r=cv.getBoundingClientRect();if(r.width>10&&r.height>10)cands.push({cv:cv,area:r.width*r.height});});}
    if(!cands.length)return null;cands.sort(function(a,b){return b.area-a.area;});return cands[0].cv;}
  window.endoSuperRes=function(){
    try{
      var src=pickCanvas();if(!src){alert('Abra um corte no Endo antes de usar o SuperRes.');return;}
    var workCap=768,sw=src.width,sh=src.height,sc=Math.min(1,workCap/Math.max(sw,sh));
var ww=Math.max(1,Math.round(sw*sc)),wh=Math.max(1,Math.round(sh*sc));
var FACTOR=Math.min(6,3840/Math.max(ww,wh));if(FACTOR<1)FACTOR=1;
      var work=document.createElement('canvas');work.width=ww;work.height=wh;
      work.getContext('2d').drawImage(src,0,0,ww,wh);
      var base=work.getContext('2d').getImageData(0,0,ww,wh),n=ww*wh,L0=new Float32Array(n),bd=base.data;
      for(var i=0,p=0;i<n;i++,p+=4){L0[i]=bd[p]*0.299+bd[p+1]*0.587+bd[p+2]*0.114;}
      var B1=box(L0,ww,wh),B2=box(B1,ww,wh),B3=box(box(B2,ww,wh),ww,wh);
      function render(sharp){var s=sharp/45,k=1.12;
        var tmp=document.createElement('canvas');tmp.width=ww;tmp.height=wh;
        var tc=tmp.getContext('2d'),out=tc.createImageData(ww,wh),od=out.data;
        for(var j=0,q=0;j<n;j++,q+=4){var fine=L0[j]-B1[j],mid=B1[j]-B2[j],coarse=B2[j]-B3[j];
          var v=L0[j]+s*(1.15*fine+0.75*mid+0.40*coarse);v=(v-128)*k+128;if(v<0)v=0;else if(v>255)v=255;var g=v|0;
          od[q]=od[q+1]=od[q+2]=g;od[q+3]=255;}
        tc.putImageData(out,0,0);return upscaleStepped(tmp,FACTOR).toDataURL('image/png');}
      var beforeUrl=upscaleStepped(work,FACTOR).toDataURL('image/png');
      var afterUrl=render(60);
      showModal(beforeUrl,afterUrl,Math.round(ww*FACTOR),Math.round(wh*FACTOR),render);
    }catch(e){alert('Falha no SuperRes: '+e.message);}};
  function showModal(beforeUrl,afterUrl,outW,outH,render){
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;';
    var t=document.createElement('div');t.textContent='Endo SuperRes · nitidez assistida '+outW+'×'+outH+' (imagem derivada)';
    t.style.cssText='color:#cfe;font:800 12px -apple-system,sans-serif;text-align:center;';
    var hint=document.createElement('div');hint.textContent='Pinça/scroll = zoom · arraste = mover (sincronizado)';
    hint.style.cssText='color:#789;font:600 9px sans-serif;';
    var wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;max-width:100%;width:100%;justify-content:center;';
    var stt={scale:1,tx:0,ty:0},imgs=[],afterImg=null;
    function apply(){imgs.forEach(function(im){im.style.transform='translate('+stt.tx+'px,'+stt.ty+'px) scale('+stt.scale+')';});}
    function col(lbl,url,isAfter){var c=document.createElement('div');c.style.cssText='flex:1;min-width:0;max-width:48%;text-align:center;';
      var l=document.createElement('div');l.textContent=lbl;l.style.cssText='color:#9ab;font:700 10px sans-serif;margin-bottom:4px;letter-spacing:1px;';
      var vp=document.createElement('div');vp.style.cssText='overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#000;touch-action:none;height:56vh;display:flex;align-items:center;justify-content:center;';
      var im=document.createElement('img');im.src=url;im.draggable=false;
      im.style.cssText='max-width:100%;max-height:56vh;transform-origin:center center;will-change:transform;user-select:none;';
      vp.appendChild(im);c.appendChild(l);c.appendChild(vp);imgs.push(im);if(isAfter)afterImg=im;bindZoom(vp);return c;}
    function bindZoom(vp){var pts={};
      vp.addEventListener('wheel',function(e){e.preventDefault();var f=e.deltaY<0?1.15:1/1.15;stt.scale=Math.min(10,Math.max(1,stt.scale*f));if(stt.scale===1){stt.tx=0;stt.ty=0;}apply();},{passive:false});
      vp.addEventListener('pointerdown',function(e){vp.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};});
      vp.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var ids=Object.keys(pts);
        if(ids.length===1){var dx=e.clientX-pts[e.pointerId].x,dy=e.clientY-pts[e.pointerId].y;if(stt.scale>1){stt.tx+=dx;stt.ty+=dy;apply();}pts[e.pointerId]={x:e.clientX,y:e.clientY};}
        else if(ids.length===2){var o=pts[ids[0]],b=pts[ids[1]];var pd=Math.hypot(o.x-b.x,o.y-b.y);pts[e.pointerId]={x:e.clientX,y:e.clientY};var a=pts[ids[0]],c2=pts[ids[1]];var nd=Math.hypot(a.x-c2.x,a.y-c2.y);if(pd>0){stt.scale=Math.min(10,Math.max(1,stt.scale*(nd/pd)));if(stt.scale===1){stt.tx=0;stt.ty=0;}apply();}}});
      function up(e){delete pts[e.pointerId];}vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);}
    wrap.appendChild(col('ANTES',beforeUrl,false));wrap.appendChild(col('DEPOIS',afterUrl,true));
    var sl=document.createElement('div');sl.style.cssText='display:flex;align-items:center;gap:8px;color:#9cf;font:700 10px sans-serif;width:min(420px,92%);';
    var lab=document.createElement('span');lab.textContent='Nitidez';
   var rng=document.createElement('input');rng.type='range';rng.min='0';rng.max='180';rng.value='70';rng.style.cssText='flex:1;';
var val=document.createElement('span');val.textContent='70';val.style.minWidth='32px';
    rng.addEventListener('input',function(){val.textContent=rng.value;});
    rng.addEventListener('change',function(){if(afterImg){var u=render(parseInt(rng.value,10));afterImg.src=u;afterImg._url=u;}});
    sl.appendChild(lab);sl.appendChild(rng);sl.appendChild(val);
    var bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
    function mk(txt,css,fn){var b=document.createElement('button');b.textContent=txt;
      b.style.cssText='padding:10px 16px;border-radius:10px;border:none;font:800 12px sans-serif;cursor:pointer;touch-action:manipulation;'+css;
      b.onclick=fn;b.addEventListener('touchend',function(e){e.preventDefault();fn();},{passive:false});return b;}
    bar.appendChild(mk('Reset zoom','background:rgba(255,255,255,.12);color:#ddd;',function(){stt.scale=1;stt.tx=0;stt.ty=0;apply();}));
    bar.appendChild(mk('Salvar no portfólio','background:#16a34a;color:#fff;',function(){
      var u=(afterImg&&afterImg._url)||afterImg.src;
      try{if(typeof portfolioAddItem==='function')portfolioAddItem('Endo SuperRes (nitidez assistida)',u,'Imagem derivada '+outW+'x'+outH+'px · '+new Date().toLocaleTimeString('pt-BR'),{},'');}catch(e){}
      if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    bar.appendChild(mk('Fechar','background:rgba(255,255,255,.12);color:#ddd;',function(){if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    ov.appendChild(t);ov.appendChild(hint);ov.appendChild(wrap);ov.appendChild(sl);ov.appendChild(bar);
    document.body.appendChild(ov);}
  function srBtn(){var b=document.getElementById('ef-superres-btn');
    if(!b){b=document.createElement('button');b.id='ef-superres-btn';b.textContent='SR';b.title='Endo SuperRes';
      b.style.cssText='position:fixed;z-index:6000;display:none;width:36px;height:36px;border-radius:11px;'
        +'border:1.5px solid rgba(0,229,255,.6);background:rgba(8,16,24,.62);backdrop-filter:blur(6px);'
        +'color:#3fe8ff;font:900 13px -apple-system,sans-serif;letter-spacing:.5px;cursor:pointer;'
        +'box-shadow:0 4px 14px rgba(0,0,0,.45);touch-action:manipulation;';
      var go=function(e){if(e)e.preventDefault();if(window.endoSuperRes)endoSuperRes();};
      b.addEventListener('click',go);b.addEventListener('touchend',go,{passive:false});document.body.appendChild(b);}
    return b;}
  function posSR(){var tab=document.getElementById('tab-endo'),b=srBtn();
    var main=(tab&&tab.classList.contains('endo-focus-active'))?(tab.querySelector('.ef-main')||document.getElementById('endo-axial')):null;
    if(!main){b.style.display='none';return;}
    var r=main.getBoundingClientRect();if(r.width<24||r.height<24){b.style.display='none';return;}
    b.style.display='block';b.style.left=(r.right-44)+'px';b.style.top=(r.top+8)+'px';}
  setInterval(posSR,500);window.addEventListener('resize',posSR);/* listener de 'scroll' REMOVIDO: causava layout thrashing (getBoundingClientRect a cada scroll) e a tela branca no MPR/oblíquo. O interval de 500ms já reposiciona o badge. */
})();
