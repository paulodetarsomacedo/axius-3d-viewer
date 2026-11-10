
/* Lesão periapical v1 — detecção heurística de hipodensidade circular periapical em imagem renderizada
   Camada derivada segura: não altera volumeData, loaders, stack, ZIP, MPR, MAR ou 3D. */
(function(){
  if(window._endoPeriapicalInstalled)return; window._endoPeriapicalInstalled=true;

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function smooth01(t){ t=clamp(t,0,1); return t*t*(3-2*t); }

  if(!document.getElementById('endo-periapical-style')){
    var st=document.createElement('style');
    st.id='endo-periapical-style';
    st.textContent='\
      .endo-periapical-modal input[type="range"]{height:14px!important;}\
      .endo-periapical-modal input[type="range"]::-webkit-slider-runnable-track{height:14px!important;}\
      .endo-periapical-modal input[type="range"]::-webkit-slider-thumb{height:24px!important;width:24px!important;margin-top:-5px!important;}\
      .endo-periapical-modal button{touch-action:manipulation!important;}\
    ';
    document.head.appendChild(st);
  }

  function box(src,w,h,rad){
    rad=rad||1;
    var out=new Float32Array(src.length);
    for(var y=0;y<h;y++){
      var y0=Math.max(0,y-rad), y1=Math.min(h-1,y+rad);
      for(var x=0;x<w;x++){
        var x0=Math.max(0,x-rad), x1=Math.min(w-1,x+rad);
        var s=0,c=0;
        for(var yy=y0;yy<=y1;yy++){
          var off=yy*w;
          for(var xx=x0;xx<=x1;xx++){ s+=src[off+xx]; c++; }
        }
        out[y*w+x]=s/c;
      }
    }
    return out;
  }

  function histStats(gray,mask){
    var hist=new Uint32Array(256), n=0;
    for(var i=0;i<gray.length;i++){
      if(mask && !mask[i]) continue;
      hist[gray[i]]++; n++;
    }
    if(!n){ for(i=0;i<gray.length;i++){ hist[gray[i]]++; } n=gray.length; }
    function pct(p){
      var target=n*p/100, acc=0;
      for(var v=0;v<256;v++){ acc+=hist[v]; if(acc>=target)return v; }
      return 255;
    }
    return {n:n,p05:pct(5),p10:pct(10),p20:pct(20),p30:pct(30),p40:pct(40),p50:pct(50),p65:pct(65),p75:pct(75),p85:pct(85),p90:pct(90),p95:pct(95),p98:pct(98)};
  }

  function dilate(mask,w,h,r){
    var cur=mask;
    for(var it=0;it<r;it++){
      var out=new Uint8Array(cur.length);
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var on=0;
          for(var dy=-1;dy<=1 && !on;dy++){
            var yy=y+dy; if(yy<0||yy>=h)continue;
            var off=yy*w;
            for(var dx=-1;dx<=1;dx++){
              var xx=x+dx; if(xx<0||xx>=w)continue;
              if(cur[off+xx]){ on=1; break; }
            }
          }
          out[y*w+x]=on;
        }
      }
      cur=out;
    }
    return cur;
  }

  function erode(mask,w,h,r){
    var cur=mask;
    for(var it=0;it<r;it++){
      var out=new Uint8Array(cur.length);
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var on=1;
          for(var dy=-1;dy<=1 && on;dy++){
            var yy=y+dy; if(yy<0||yy>=h){on=0;break;}
            var off=yy*w;
            for(var dx=-1;dx<=1;dx++){
              var xx=x+dx; if(xx<0||xx>=w){on=0;break;}
              if(!cur[off+xx]){on=0;break;}
            }
          }
          out[y*w+x]=on;
        }
      }
      cur=out;
    }
    return cur;
  }

  function pickCanvas(){
    var active=document.querySelector('.module-tab.active')||document;
    var ids=['endo-focus-viewport','endo-axial','endo-coronal','endo-sagittal','axial-viewport','modal-viewport'];
    var cands=[];
    for(var k=0;k<ids.length;k++){
      var el=document.getElementById(ids[k]); if(!el)continue;
      var cv=el.querySelector('canvas:not([data-ov])')||el.querySelector('canvas'); if(!cv)continue;
      var r=cv.getBoundingClientRect();
      if(r.width>20&&r.height>20)cands.push({cv:cv,area:r.width*r.height,active:active.contains(cv)?1:0});
    }
    var cvs=active.querySelectorAll?active.querySelectorAll('canvas'):[];
    for(var i=0;i<cvs.length;i++){
      var cv2=cvs[i]; if(cv2.getAttribute('data-ov'))continue;
      var rr=cv2.getBoundingClientRect();
      if(rr.width>20&&rr.height>20)cands.push({cv:cv2,area:rr.width*rr.height,active:1});
    }
    if(!cands.length){
      cvs=document.querySelectorAll('canvas');
      for(i=0;i<cvs.length;i++){
        cv2=cvs[i]; if(cv2.getAttribute('data-ov'))continue;
        rr=cv2.getBoundingClientRect();
        if(rr.width>20&&rr.height>20)cands.push({cv:cv2,area:rr.width*rr.height,active:0});
      }
    }
    if(!cands.length)return null;
    cands.sort(function(a,b){ if(b.active!==a.active)return b.active-a.active; return b.area-a.area; });
    return cands[0].cv;
  }

  function capture(src,cap){
    var sw=src.width, sh=src.height;
    var sc=Math.min(1,cap/Math.max(sw,sh));
    var w=Math.max(1,Math.round(sw*sc)), h=Math.max(1,Math.round(sh*sc));
    var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    var cx=cv.getContext('2d',{willReadFrequently:true});
    cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high';
    cx.drawImage(src,0,0,w,h);
    var id=cx.getImageData(0,0,w,h), d=id.data, n=w*h;
    var gray=new Uint8Array(n);
    for(var i=0,p=0;i<n;i++,p+=4){ gray[i]=(d[p]*0.299+d[p+1]*0.587+d[p+2]*0.114+0.5)|0; }
    return {canvas:cv,width:w,height:h,gray:gray,imageData:id};
  }

  function componentAnalysis(mask,w,h,gray,local,rootNear,opts,stats,fov){
    var n=mask.length;
    var visited=new Uint8Array(n);
    var stack=new Int32Array(n);
    var comps=[];
    var minArea=Math.max(14,Math.round((opts.minSize||8)*(opts.minSize||8)*0.30));
    var maxArea=Math.max(minArea+20,Math.round((opts.maxSize||80)*(opts.maxSize||80)*3.2));
    for(var start=0;start<n;start++){
      if(!mask[start]||visited[start])continue;
      var top=0, count=0, sx=0, sy=0, sDark=0, sDef=0, sRoot=0;
      var minx=w, miny=h, maxx=0, maxy=0;
      visited[start]=1; stack[top++]=start;
      while(top){
        var idx=stack[--top];
        var y=(idx/w)|0, x=idx-y*w;
        count++; sx+=x; sy+=y; sDark+=255-gray[idx]; sDef+=Math.max(0,local[idx]-gray[idx]); if(rootNear&&rootNear[idx])sRoot++;
        if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
        var nb;
        if(x>0){ nb=idx-1; if(mask[nb]&&!visited[nb]){visited[nb]=1; stack[top++]=nb;} }
        if(x<w-1){ nb=idx+1; if(mask[nb]&&!visited[nb]){visited[nb]=1; stack[top++]=nb;} }
        if(y>0){ nb=idx-w; if(mask[nb]&&!visited[nb]){visited[nb]=1; stack[top++]=nb;} }
        if(y<h-1){ nb=idx+w; if(mask[nb]&&!visited[nb]){visited[nb]=1; stack[top++]=nb;} }
      }
      if(count<minArea||count>maxArea)continue;
      var bw=maxx-minx+1, bh=maxy-miny+1;
      if(bw<3||bh<3)continue;
      if(minx<2||miny<2||maxx>w-3||maxy>h-3)continue;
      var ratio=bw/bh; if(ratio<0.35||ratio>2.8)continue;
      var areaBox=bw*bh;
      var fill=count/areaBox;
      if(fill<0.18)continue;
      var eqR=Math.sqrt(count/Math.PI);
      var rx=bw/2, ry=bh/2;
      var roundness=Math.min(rx,ry)/Math.max(rx,ry);
      var circApprox=clamp(roundness*0.72+fill*0.55,0,1.25);
      var cx=sx/count, cy=sy/count;
      var ringRoot=0, ringFov=0, ringBright=0;
      var rad=Math.max(8,Math.round(Math.max(rx,ry)+10+(opts.proximity||55)*0.18));
      var x0=Math.max(0,Math.round(cx-rad)), x1=Math.min(w-1,Math.round(cx+rad));
      var y0=Math.max(0,Math.round(cy-rad)), y1=Math.min(h-1,Math.round(cy+rad));
      for(var yy=y0;yy<=y1;yy++){
        var off=yy*w;
        for(var xx=x0;xx<=x1;xx++){
          var dx=xx-cx, dy=yy-cy, dist=Math.sqrt(dx*dx+dy*dy);
          if(dist<Math.max(rx,ry)+1||dist>rad)continue;
          var ii=off+xx;
          if(fov&&fov[ii])ringFov++;
          if(rootNear&&rootNear[ii])ringRoot++;
          if(gray[ii]>=stats.p75)ringBright++;
        }
      }
      var proxScore=ringFov?clamp((ringRoot*2.0+ringBright*0.7)/Math.max(1,ringFov)*7.0,0,1):0;
      var darkMean=sDark/count;
      var defMean=sDef/count;
      var darkness=clamp((darkMean-70)/95,0,1);
      var deficit=clamp((defMean-7)/36,0,1);
      var sizeScore=clamp((eqR-(opts.minSize||8))/(Math.max(1,(opts.maxSize||80)-(opts.minSize||8))),0,1);
      sizeScore=1-Math.abs(sizeScore-0.46)*1.35; sizeScore=clamp(sizeScore,0,1);
      var score=(darkness*1.25+deficit*1.15+circApprox*1.10+proxScore*1.45+sizeScore*0.55);
      // Evita selecionar grandes sombras periféricas sem raiz próxima.
      if(proxScore<0.10)score*=0.34;
      if(circApprox<0.34)score*=0.55;
      comps.push({x:cx,y:cy,r:Math.max(rx,ry,eqR)*1.18,rx:Math.max(rx,eqR)*1.18,ry:Math.max(ry,eqR)*1.18,area:count,score:score,darkness:darkness,deficit:deficit,circularity:circApprox,proximity:proxScore,bbox:[minx,miny,maxx,maxy]});
    }
    comps.sort(function(a,b){return b.score-a.score;});
    return comps;
  }

  function detectLesion(gray,w,h,opt){
    var n=gray.length;
    var fov=new Uint8Array(n);
    for(var i=0;i<n;i++) fov[i]=gray[i]>5?1:0;
    fov=erode(dilate(fov,w,h,2),w,h,1);
    var stats=histStats(gray,fov);
    var lf=new Float32Array(n);
    for(i=0;i<n;i++)lf[i]=gray[i];
    var local=box(box(box(lf,w,h,2),w,h,2),w,h,2);
    var localWide=box(box(local,w,h,4),w,h,4);

    var rootT=Math.max(stats.p75,stats.p50+22,82);
    var root=new Uint8Array(n);
    var metalT=Math.max(stats.p98,210);
    for(i=0;i<n;i++){
      if(!fov[i])continue;
      // Estrutura densa provável: raiz/cortical/restauração. Mantém metal como âncora de proximidade também.
      if(gray[i]>=rootT)root[i]=1;
    }
    var rootNear=dilate(root,w,h,Math.max(3,Math.round(4+(opt.proximity||55)*0.09)));

    var sens=(opt.sensitivity||62)/100;
    var darkBase=stats.p30 + sens*18;
    var deficitBase=16 - sens*8;
    var dark=new Uint8Array(n);
    for(i=0;i<n;i++){
      if(!fov[i])continue;
      var g=gray[i];
      var def=localWide[i]-g;
      var d2=local[i]-g;
      var allow=(g<=darkBase || def>deficitBase || d2>deficitBase*0.75);
      if(!allow)continue;
      // Não deixa núcleo metálico virar lesão.
      if(g>=metalT)continue;
      // Remove fundo preto absoluto e áreas fora do volume.
      if(g<3)continue;
      dark[i]=1;
    }
    dark=erode(dilate(dark,w,h,1),w,h,1);
    var comps=componentAnalysis(dark,w,h,gray,localWide,rootNear,opt,stats,fov);

    var best=null;
    for(i=0;i<comps.length;i++){
      var c=comps[i];
      if(c.score<1.25)continue;
      best=c; break;
    }
    return {best:best,candidates:comps,stats:stats,root:root,rootNear:rootNear,fov:fov};
  }

  function renderOverlay(base,det,opt){
    var w=base.width,h=base.height;
    var out=document.createElement('canvas'); out.width=w; out.height=h;
    var ctx=out.getContext('2d');
    ctx.drawImage(base.canvas,0,0);
    if(det&&det.best){
      var c=det.best;
      var pad=1+(opt.padding||18)/100*6;
      var rx=clamp(c.rx*pad,5,Math.max(w,h));
      var ry=clamp(c.ry*pad,5,Math.max(w,h));
      var r=(rx+ry)/2;
      // Mantém círculo visual, como solicitado; usa raio médio da lesão circular.
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x,c.y,r,0,Math.PI*2,false);
      ctx.fillStyle='rgba(92, 0, 38, 0.48)';
      ctx.fill();
      ctx.lineWidth=Math.max(2,Math.round(Math.max(w,h)/260));
      ctx.strokeStyle='rgba(255, 0, 0, 0.98)';
      ctx.shadowColor='rgba(255,0,0,.55)'; ctx.shadowBlur=8;
      ctx.stroke();
      ctx.restore();
      // Pequena etiqueta discreta fora da lesão.
      ctx.save();
      ctx.font='800 '+Math.max(10,Math.round(Math.max(w,h)/58))+'px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.fillStyle='rgba(255,255,255,.95)';
      ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.lineWidth=3;
      var label='Lesão periapical?';
      var tx=clamp(c.x+r+8,4,w-ctx.measureText(label).width-4);
      var ty=clamp(c.y-r-8,18,h-6);
      ctx.strokeText(label,tx,ty); ctx.fillText(label,tx,ty);
      ctx.restore();
    }
    return out;
  }

  function bindZoom(vp,state,imgs){
    var pts={};
    function apply(){for(var i=0;i<imgs.length;i++)imgs[i].style.transform='translate('+state.tx+'px,'+state.ty+'px) scale('+state.scale+')';}
    vp.addEventListener('wheel',function(e){e.preventDefault();var f=e.deltaY<0?1.15:1/1.15;state.scale=clamp(state.scale*f,1,10);if(state.scale===1){state.tx=0;state.ty=0;}apply();},{passive:false});
    vp.addEventListener('pointerdown',function(e){vp.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};});
    vp.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var ids=Object.keys(pts);if(ids.length===1){var dx=e.clientX-pts[e.pointerId].x,dy=e.clientY-pts[e.pointerId].y;if(state.scale>1){state.tx+=dx;state.ty+=dy;apply();}pts[e.pointerId]={x:e.clientX,y:e.clientY};}else if(ids.length===2){var p0=pts[ids[0]],p1=pts[ids[1]],pd=Math.hypot(p0.x-p1.x,p0.y-p1.y);pts[e.pointerId]={x:e.clientX,y:e.clientY};p0=pts[ids[0]];p1=pts[ids[1]];var nd=Math.hypot(p0.x-p1.x,p0.y-p1.y);if(pd>0){state.scale=clamp(state.scale*(nd/pd),1,10);if(state.scale===1){state.tx=0;state.ty=0;}apply();}}});
    function up(e){delete pts[e.pointerId];}
    vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
  }

  function showModal(base,initialDet,initialUrl,rerender){
    var ov=document.createElement('div');
    ov.className='endo-periapical-modal';
    ov.style.cssText='position:fixed;inset:0;z-index:2147483603;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;';
    var closeX=document.createElement('button');
    closeX.type='button'; closeX.textContent='×';
    closeX.style.cssText='position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,24,32,.88);color:#EAF2FF;font:900 28px/1 -apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483604;box-shadow:0 8px 22px rgba(0,0,0,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);cursor:pointer;';
    closeX.onclick=function(){if(ov.parentNode)ov.parentNode.removeChild(ov);};
    closeX.addEventListener('touchend',function(e){e.preventDefault();e.stopPropagation();if(ov.parentNode)ov.parentNode.removeChild(ov);},{passive:false});
    var title=document.createElement('div'); title.textContent='Lesão periapical · hipodensidade circular apical · imagem derivada'; title.style.cssText='color:#EAF2FF;font:900 12px -apple-system,sans-serif;text-align:center;letter-spacing:.3px;';
    var sub=document.createElement('div'); sub.style.cssText='color:#a9bbcf;font:700 10px -apple-system,sans-serif;text-align:center;max-width:min(820px,94vw);line-height:1.35;';
    function setSub(det){
      if(det&&det.best){ sub.textContent='Candidato detectado: área '+det.best.area+' px · circularidade '+det.best.circularity.toFixed(2)+' · proximidade radicular '+det.best.proximity.toFixed(2)+' · score '+det.best.score.toFixed(2)+'. Revise clinicamente em múltiplos cortes.'; }
      else { sub.textContent='Nenhum candidato circular hipodenso periapical forte foi encontrado neste corte. Aumente a sensibilidade ou selecione um corte mais próximo do ápice.'; }
    }
    setSub(initialDet);
    var wrap=document.createElement('div'); wrap.style.cssText='display:flex;gap:8px;max-width:100%;width:100%;justify-content:center;';
    var imgs=[], state={scale:1,tx:0,ty:0}, afterImg=null;
    function col(lbl,url,isAfter){
      var c=document.createElement('div'); c.style.cssText='flex:1;min-width:0;max-width:48%;text-align:center;';
      var l=document.createElement('div'); l.textContent=lbl; l.style.cssText='color:#EAF2FF;font:900 10px sans-serif;margin-bottom:4px;letter-spacing:1px;';
      var vp=document.createElement('div'); vp.style.cssText='overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#000;touch-action:none;height:56vh;display:flex;align-items:center;justify-content:center;';
      var im=document.createElement('img'); im.src=url; im.draggable=false; im.style.cssText='max-width:100%;max-height:56vh;transform-origin:center center;will-change:transform;user-select:none;';
      vp.appendChild(im); c.appendChild(l); c.appendChild(vp); imgs.push(im); if(isAfter)afterImg=im; bindZoom(vp,state,imgs); return c;
    }
    wrap.appendChild(col('CORTE ORIGINAL',base.canvas.toDataURL('image/png'),false));
    wrap.appendChild(col('DETECÇÃO',initialUrl,true));
    var ctr=document.createElement('div'); ctr.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:8px;width:min(560px,94vw);background:rgba(20,24,32,.75);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;';
    var vals={sensitivity:62,minSize:8,maxSize:78,proximity:62,padding:18};
    var timer=null;
    function schedule(){ if(timer)clearTimeout(timer); timer=setTimeout(function(){ var out=rerender(vals); if(afterImg){afterImg.src=out.url; afterImg._url=out.url;} setSub(out.det); },90); }
    function mkSlider(lbl,min,max,step,key,tone){
      var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:8px;color:#EAF2FF;font:800 10px sans-serif;';
      var sp=document.createElement('span'); sp.textContent=lbl; sp.style.cssText='width:130px;color:#EAF2FF;';
      var rng=document.createElement('input'); rng.type='range'; rng.min=min; rng.max=max; rng.step=step; rng.value=vals[key]; rng.style.cssText='flex:1;accent-color:'+tone+';';
      var va=document.createElement('span'); va.textContent=vals[key]; va.style.cssText='min-width:34px;text-align:right;color:#fff;font-weight:900;';
      rng.addEventListener('input',function(){ vals[key]=+rng.value; va.textContent=rng.value; schedule(); });
      row.appendChild(sp);row.appendChild(rng);row.appendChild(va);ctr.appendChild(row);
    }
    mkSlider('Sensibilidade',0,100,1,'sensitivity','#ef4444');
    mkSlider('Tamanho mínimo',3,35,1,'minSize','#a855f7');
    mkSlider('Tamanho máximo',18,150,1,'maxSize','#a855f7');
    mkSlider('Proximidade raiz',0,100,1,'proximity','#22c55e');
    mkSlider('Margem do círculo',0,100,1,'padding','#f43f5e');
    var bar=document.createElement('div'); bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
    function btn(txt,css,fn){var b=document.createElement('button');b.textContent=txt;b.style.cssText='padding:10px 14px;border-radius:10px;border:none;font:900 12px sans-serif;cursor:pointer;color:#EAF2FF;'+css;b.onclick=fn;b.addEventListener('touchend',function(e){e.preventDefault();fn();},{passive:false});return b;}
    bar.appendChild(btn('Mais sensível','background:#b91c1c;',function(){vals.sensitivity=clamp(vals.sensitivity+18,0,100);vals.proximity=clamp(vals.proximity-12,0,100);var out=rerender(vals);if(afterImg){afterImg.src=out.url;afterImg._url=out.url;}setSub(out.det);}));
    bar.appendChild(btn('Reset zoom','background:rgba(255,255,255,.13);',function(){state.scale=1;state.tx=0;state.ty=0;for(var i=0;i<imgs.length;i++)imgs[i].style.transform='translate(0px,0px) scale(1)';}));
    bar.appendChild(btn('Salvar no portfólio','background:#16a34a;',function(){var u=(afterImg&&afterImg._url)||afterImg.src;try{if(typeof portfolioAddItem==='function'){portfolioAddItem('Lesão periapical (detecção heurística)',u,'Imagem derivada · hipodensidade circular apical · '+new Date().toLocaleTimeString('pt-BR'),{},'');}}catch(e){}if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    bar.appendChild(btn('Fechar','background:rgba(255,255,255,.13);',function(){if(ov.parentNode)ov.parentNode.removeChild(ov);}));
    ov.appendChild(closeX); ov.appendChild(title); ov.appendChild(sub); ov.appendChild(wrap); ov.appendChild(ctr); ov.appendChild(bar); document.body.appendChild(ov);
  }

  window.endoPeriapicalLesion=function(){
    try{
      var src=pickCanvas();
      if(!src){ alert('Abra um corte no Endo antes de usar Lesão periapical.'); return; }
      var base=capture(src,900);
      function render(opt){
        var det=detectLesion(base.gray,base.width,base.height,opt);
        var cv=renderOverlay(base,det,opt);
        return {url:cv.toDataURL('image/png'),det:det};
      }
      var init={sensitivity:62,minSize:8,maxSize:78,proximity:62,padding:18};
      var out=render(init);
      showModal(base,out.det,out.url,render);
    }catch(e){ console.error('[Lesão periapical]',e); alert('Falha na ferramenta Lesão periapical: '+(e&&e.message?e.message:e)); }
  };
})();
