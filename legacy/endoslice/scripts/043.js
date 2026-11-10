
/* TAREFA 4B — Filtros Endo Real (passo 0.5 + thumb compacto forte + teto 99) */
(function(){
  if(window._endoFiltrosInstalled)return; window._endoFiltrosInstalled=true;
  function pickCanvas(){var c=[];
    ['endo-axial','endo-coronal','endo-sagittal','endo-focus-viewport','axial-viewport','modal-viewport'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;var cv=el.querySelector('canvas');if(!cv)return;
      var r=cv.getBoundingClientRect();if(r.width>10&&r.height>10)c.push({cv:cv,area:r.width*r.height});});
    if(!c.length){var t=document.getElementById('tab-endo')||document;
      t.querySelectorAll('canvas').forEach(function(cv){var r=cv.getBoundingClientRect();if(r.width>10&&r.height>10)c.push({cv:cv,area:r.width*r.height});});}
    if(!c.length)return null;c.sort(function(a,b){return b.area-a.area;});return c[0].cv;}
  var DENT=[232,217,160], ESM=[220,230,244], GUTA=[232,137,107];
  function mix(c,f){return [c[0]*f,c[1]*f,c[2]*f];}
  function boxF(src,w,h){var O=new Float32Array(src.length);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var s=0;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var yy=y+dy,xx=x+dx;
        if(yy<0)yy=0;else if(yy>=h)yy=h-1;if(xx<0)xx=0;else if(xx>=w)xx=w-1;s+=src[yy*w+xx];}
      O[y*w+x]=s/9;}return O;}
  function injectThumb(){if(document.getElementById('lut-range-style'))return;
    var sty=document.createElement('style');sty.id='lut-range-style';
    sty.textContent='input.lut-range,body.theme-light-clinical input.lut-range[type="range"]{-webkit-appearance:none!important;appearance:none!important;height:5px!important;border-radius:3px!important;background:rgba(255,255,255,.3)!important;box-shadow:none!important;padding:0!important;}'
      +'input.lut-range::-webkit-slider-thumb,body.theme-light-clinical input.lut-range[type="range"]::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:16px!important;height:16px!important;border-radius:50%!important;background:#fff!important;border:none!important;box-shadow:0 1px 3px rgba(0,0,0,.5)!important;cursor:pointer!important;margin-top:0!important;}'
      +'input.lut-range::-moz-range-thumb{width:16px!important;height:16px!important;border-radius:50%!important;background:#fff!important;border:none!important;}';
    document.head.appendChild(sty);}
  window.endoFiltrosReais=function(){
    try{
      var src=pickCanvas(); if(!src){alert('Abra um corte no Endo antes dos Filtros.');return;}
      var cap=900,sw=src.width,sh=src.height,sc=Math.min(1,cap/Math.max(sw,sh));
      var ww=Math.max(1,Math.round(sw*sc)),wh=Math.max(1,Math.round(sh*sc));
      var work=document.createElement('canvas');work.width=ww;work.height=wh;
      work.getContext('2d').drawImage(src,0,0,ww,wh);
      var base=work.getContext('2d').getImageData(0,0,ww,wh),bd=base.data,n=ww*wh;
      var L=new Float32Array(n),hist=new Float64Array(256);
      for(var i=0,p=0;i<n;i++,p+=4){var l=(bd[p]*0.299+bd[p+1]*0.587+bd[p+2]*0.114)|0;L[i]=l;hist[l]++;}
      var cum=new Float64Array(256),acc=0;for(var h=0;h<256;h++){acc+=hist[h];cum[h]=acc;}
      function pctToVal(pct){var target=pct/100*n;for(var v=0;v<256;v++){if(cum[v]>=target)return v;}return 255;}
      var M=boxF(L,ww,wh),L2=new Float32Array(n);
      for(var a=0;a<n;a++)L2[a]=L[a]*L[a];
      var M2=boxF(L2,ww,wh),V=new Float32Array(n),Vmax=1;
      for(var b=0;b<n;b++){var vv=M2[b]-M[b]*M[b];if(vv<0)vv=0;V[b]=vv;if(vv>Vmax)Vmax=vv;}
      var vHist=new Float64Array(257);
      for(var e=0;e<n;e++){var bin=(V[e]/Vmax*256)|0;if(bin>256)bin=256;vHist[bin]++;}
      var vCum=new Float64Array(257),vacc=0;for(var gg=0;gg<257;gg++){vacc+=vHist[gg];vCum[gg]=vacc;}
      function vPctToVal(pct){if(pct>=100)return Infinity;var target=pct/100*n;for(var z=0;z<257;z++){if(vCum[z]>=target)return z/256*Vmax;}return Vmax;}
      var nativeUrl=work.toDataURL('image/png');
      function render(threshPct,refCanal,refBone){
        var cut=pctToVal(threshPct),range=Math.max(1,255-cut);
        var cutA=refCanal<=0?Infinity:vPctToVal(100-refCanal);
        var cutB=refBone<=0?Infinity:vPctToVal(100-refBone*0.30);
        var varCut=Math.min(cutA,cutB), gateOn=(refCanal>0||refBone>0);
        var out=document.createElement('canvas');out.width=ww;out.height=wh;
        var oc=out.getContext('2d'),od=oc.createImageData(ww,wh),o=od.data;
        for(var j=0,q=0;j<n;j++,q+=4){var l=L[j];
          if(l<cut){o[q]=o[q+1]=o[q+2]=l;o[q+3]=255;continue;}
          var t=(l-cut)/range;if(t>1)t=1;
          if(t<0.45&&gateOn&&V[j]>varCut){o[q]=o[q+1]=o[q+2]=l;o[q+3]=255;continue;}
          var col=t<0.45?DENT:(t<0.80?ESM:GUTA);
          var shade=0.55+0.55*(l/255);if(shade>1.15)shade=1.15;var c=mix(col,shade);
          o[q]=c[0]>255?255:c[0];o[q+1]=c[1]>255?255:c[1];o[q+2]=c[2]>255?255:c[2];o[q+3]=255;}
        oc.putImageData(od,0,0);return out.toDataURL('image/png');}
      showModal(nativeUrl,render);
    }catch(e){alert('Falha nos Filtros: '+e.message);}};
  function showModal(nativeUrl,render){
    injectThumb();
    var thr=65,refC=0,refB=0,cur=render(thr,refC,refB),showingNative=false;
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:14px;';
    var t=document.createElement('div');t.textContent='Filtros Endo Real · colorização interpretativa (não é segmentação)';
    t.style.cssText='color:#bfe;font:800 12px -apple-system,sans-serif;text-align:center;';
    var vp=document.createElement('div');vp.style.cssText='overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#000;touch-action:none;max-width:100%;max-height:50vh;display:flex;align-items:center;justify-content:center;';
    var im=document.createElement('img');im.src=cur;im.draggable=false;
    im.style.cssText='max-width:100%;max-height:50vh;transform-origin:center center;will-change:transform;user-select:none;';
    vp.appendChild(im);
    var st={s:1,tx:0,ty:0},pts={};
    function ap(){im.style.transform='translate('+st.tx+'px,'+st.ty+'px) scale('+st.s+')';}
    vp.addEventListener('wheel',function(e){e.preventDefault();var f=e.deltaY<0?1.15:1/1.15;st.s=Math.min(10,Math.max(1,st.s*f));if(st.s===1){st.tx=0;st.ty=0;}ap();},{passive:false});
    vp.addEventListener('pointerdown',function(e){vp.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};});
    vp.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var ids=Object.keys(pts);
      if(ids.length===1){var dx=e.clientX-pts[e.pointerId].x,dy=e.clientY-pts[e.pointerId].y;if(st.s>1){st.tx+=dx;st.ty+=dy;ap();}pts[e.pointerId]={x:e.clientX,y:e.clientY};}
      else if(ids.length===2){var A=pts[ids[0]],B=pts[ids[1]];var pd=Math.hypot(A.x-B.x,A.y-B.y);pts[e.pointerId]={x:e.clientX,y:e.clientY};var A2=pts[ids[0]],B2=pts[ids[1]];var nd=Math.hypot(A2.x-B2.x,A2.y-B2.y);if(pd>0){st.s=Math.min(10,Math.max(1,st.s*(nd/pd)));if(st.s===1){st.tx=0;st.ty=0;}ap();}}});
    function up(e){delete pts[e.pointerId];}vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
    function redraw(){cur=render(thr,refC,refB);if(!showingNative)im.src=cur;}
    function slider(labelTxt,min,max,step,def,onCh){
      var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;color:#cfe;font:700 10px sans-serif;width:min(460px,94%);';
      var l=document.createElement('span');l.textContent=labelTxt;l.style.cssText='min-width:122px;';
      var r=document.createElement('input');r.type='range';r.className='lut-range';r.min=min;r.max=max;r.value=def;r.style.cssText='flex:1;';
      var v=document.createElement('span');v.textContent=def;v.style.cssText='min-width:30px;text-align:right;';
      function paintLut(t){var p=(t.value-t.min)/((t.max-t.min)||1)*100;t.style.setProperty('background','linear-gradient(90deg,#4A90E2 '+p+'%,rgba(255,255,255,.28) '+p+'%) no-repeat center / 100% 6px','important');}
r.addEventListener('input',function(){v.textContent=r.value;paintLut(r);});paintLut(r);
      r.addEventListener('change',function(){onCh(parseFloat(r.value));});
      row.appendChild(l);row.appendChild(r);row.appendChild(v);return row;}
    var s1=slider('Limiar de tecido',40,99,0.5,65,function(val){thr=val;redraw();});
    var s2=slider('Refino (canal obturado)',0,100,1,0,function(val){refC=val;redraw();});
    var s3=slider('Refino (osso/dentina)',0,100,1,0,function(val){refB=val;redraw();});
    var leg=document.createElement('div');leg.innerHTML='<span style="color:#E8D9A0">■ dentina</span>  <span style="color:#DCE6F0">■ esmalte</span>  <span style="color:#E8896B">■ guta-percha</span>';
    leg.style.cssText='font:700 9px sans-serif;opacity:.9;';
    var bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
    function mk(txt,bg,fn){var b=document.createElement('button');b.textContent=txt;
      b.style.cssText='padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.14);font:800 12px sans-serif;cursor:pointer;touch-action:manipulation;'+bg;
      b.style.setProperty('color','#fff','important');
      b.onclick=fn;b.addEventListener('touchend',function(e){e.preventDefault();fn();},{passive:false});return b;}
    var natBtn=mk('Ver Nativa','background:rgba(40,48,62,.92);',function(){showingNative=!showingNative;im.src=showingNative?nativeUrl:cur;natBtn.textContent=showingNative?'Ver Filtro':'Ver Nativa';});
    bar.appendChild(natBtn);
    bar.appendChild(mk('Reset zoom','background:rgba(40,48,62,.92);',function(){st.s=1;st.tx=0;st.ty=0;ap();}));
    bar.appendChild(mk('Salvar no portfólio','background:#16a34a;',function(){
      try{if(typeof portfolioAddItem==='function')portfolioAddItem('Filtros Endo Real (colorização interpretativa)',cur,'Imagem derivada · '+new Date().toLocaleTimeString('pt-BR'),{},'');}catch(e){}
      if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    bar.appendChild(mk('Fechar','background:rgba(40,48,62,.92);',function(){if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    ov.appendChild(t);ov.appendChild(vp);ov.appendChild(s1);ov.appendChild(s2);ov.appendChild(s3);ov.appendChild(leg);ov.appendChild(bar);
    document.body.appendChild(ov);
  }
  function addLUT(el){if(!el||el.querySelector('.vp-lut-btn'))return;
    var b=document.createElement('button');b.className='vp-mirror-btn vp-lut-btn';b.textContent='LUT';b.title='Filtros Endo Real';
    var go=function(e){e.preventDefault();e.stopPropagation();if(window.endoFiltrosReais)endoFiltrosReais();};
    b.addEventListener('touchstart',go,{passive:false,capture:true});b.addEventListener('mousedown',go,{capture:true});el.appendChild(b);}
  function run(){['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){addLUT(document.getElementById(id));});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setTimeout(run,1500);setTimeout(run,4000);
})();
