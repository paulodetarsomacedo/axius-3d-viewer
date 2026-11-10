
/* Endo MAR v2 — supressão perceptual forte de bandas/raios escuros e claros por máscara metálica + distância + correção direcional.
   Camada conservadora: pós-renderização, em modal Antes/Depois, sem mexer em volumeData, loaders MPR, ZIP, seletor Normal/MAR ou stack Cornerstone. */
(function(){
  if(window._endoMarInstalledV2)return; window._endoMarInstalledV2=true;
  // substitui a versão anterior se ela existir
  window._endoMarInstalled = true;

  function clamp(v,a,b){ return v < a ? a : (v > b ? b : v); }
  function smooth01(t){ t = clamp(t,0,1); return t*t*(3-2*t); }
  function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  function histStats(gray){
    var hist = new Uint32Array(256), n = gray.length, i;
    for(i=0;i<n;i++) hist[gray[i]]++;
    function pct(p){
      var target = n * p / 100, acc = 0;
      for(var v=0; v<256; v++){ acc += hist[v]; if(acc >= target) return v; }
      return 255;
    }
    return {
      hist:hist,
      p01:pct(1), p02:pct(2), p05:pct(5), p10:pct(10), p20:pct(20),
      p50:pct(50), p80:pct(80), p90:pct(90), p95:pct(95), p98:pct(98),
      p99:pct(99), p995:pct(99.5), p998:pct(99.8), p999:pct(99.9)
    };
  }

  function grayToFloat(gray){
    var f = new Float32Array(gray.length);
    for(var i=0;i<gray.length;i++) f[i] = gray[i];
    return f;
  }

  function boxRadius(src,w,h,r){
    r = Math.max(1, r|0);
    var iw = w + 1, ih = h + 1;
    var integral = new Float32Array(iw * ih);
    var x,y,idx,rowSum;
    for(y=0;y<h;y++){
      rowSum = 0;
      for(x=0;x<w;x++){
        rowSum += src[y*w+x];
        integral[(y+1)*iw + (x+1)] = integral[y*iw + (x+1)] + rowSum;
      }
    }
    var out = new Float32Array(src.length);
    for(y=0;y<h;y++){
      var y0 = Math.max(0, y-r), y1 = Math.min(h-1, y+r);
      var iy0 = y0, iy1 = y1 + 1;
      for(x=0;x<w;x++){
        var x0 = Math.max(0, x-r), x1 = Math.min(w-1, x+r);
        var ix0 = x0, ix1 = x1 + 1;
        var sum = integral[iy1*iw+ix1] - integral[iy0*iw+ix1] - integral[iy1*iw+ix0] + integral[iy0*iw+ix0];
        out[y*w+x] = sum / ((x1-x0+1)*(y1-y0+1));
      }
    }
    return out;
  }

  function erodeBody(mask,w,h){
    var out = new Uint8Array(mask.length);
    for(var y=1;y<h-1;y++){
      for(var x=1;x<w-1;x++){
        var idx=y*w+x;
        if(mask[idx] && mask[idx-1] && mask[idx+1] && mask[idx-w] && mask[idx+w]) out[idx]=1;
      }
    }
    return out;
  }

  function distanceFromMask(mask,w,h){
    var INF = 1e9, n=w*h, dist = new Float32Array(n);
    var x,y,idx;
    for(idx=0;idx<n;idx++) dist[idx] = mask[idx] ? 0 : INF;
    for(y=0;y<h;y++){
      for(x=0;x<w;x++){
        idx=y*w+x;
        var d=dist[idx];
        if(x>0) d = Math.min(d, dist[idx-1] + 1);
        if(y>0) d = Math.min(d, dist[idx-w] + 1);
        if(x>0 && y>0) d = Math.min(d, dist[idx-w-1] + 1.4142);
        if(x<w-1 && y>0) d = Math.min(d, dist[idx-w+1] + 1.4142);
        dist[idx]=d;
      }
    }
    for(y=h-1;y>=0;y--){
      for(x=w-1;x>=0;x--){
        idx=y*w+x;
        var d2=dist[idx];
        if(x<w-1) d2 = Math.min(d2, dist[idx+1] + 1);
        if(y<h-1) d2 = Math.min(d2, dist[idx+w] + 1);
        if(x<w-1 && y<h-1) d2 = Math.min(d2, dist[idx+w+1] + 1.4142);
        if(x>0 && y<h-1) d2 = Math.min(d2, dist[idx+w-1] + 1.4142);
        dist[idx]=d2;
      }
    }
    return dist;
  }

  function pickCanvas(){
    var cands=[];
    ['endo-focus-viewport','endo-axial','endo-coronal','endo-sagittal','axial-viewport','modal-viewport'].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      var cv=el.querySelector('canvas:not([data-ov])') || el.querySelector('canvas'); if(!cv) return;
      var r=cv.getBoundingClientRect();
      if(r.width>20 && r.height>20) cands.push({cv:cv,area:r.width*r.height,id:id});
    });
    if(!cands.length){
      var cvs=document.querySelectorAll('canvas');
      for(var i=0;i<cvs.length;i++){
        var rr=cvs[i].getBoundingClientRect();
        if(rr.width>20 && rr.height>20) cands.push({cv:cvs[i],area:rr.width*rr.height,id:'canvas'});
      }
    }
    if(!cands.length) return null;
    cands.sort(function(a,b){ return b.area-a.area; });
    return cands[0].cv;
  }

  function captureGray(src, cap){
    var sw=src.width, sh=src.height;
    var maxDim = Math.max(sw,sh);
    var sc=Math.min(1, cap/maxDim);
    var w=Math.max(1, Math.round(sw*sc)), h=Math.max(1, Math.round(sh*sc));
    var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    var cx=cv.getContext('2d', { willReadFrequently:true });
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src,0,0,w,h);
    var id=cx.getImageData(0,0,w,h), d=id.data, n=w*h;
    var gray = new Uint8Array(n);
    for(var i=0,p=0;i<n;i++,p+=4){ gray[i] = (d[p]*0.299 + d[p+1]*0.587 + d[p+2]*0.114 + 0.5)|0; }
    return { canvas:cv, width:w, height:h, gray:gray };
  }

  function grayToCanvas(gray,w,h){
    var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    var cx=cv.getContext('2d');
    var id=cx.createImageData(w,h), d=id.data;
    for(var i=0,p=0;i<gray.length;i++,p+=4){ var g=gray[i]; d[p]=d[p+1]=d[p+2]=g; d[p+3]=255; }
    cx.putImageData(id,0,0);
    return cv;
  }

  function detectMetal(gray,w,h,stats,opt){
    var n=gray.length;
    var t = Math.max(170, stats.p995 - 4 + (opt.metal/100)*10);
    if(stats.p998 > 210) t = Math.max(t, stats.p998 - 8);
    if(t>250) t=250;
    var m = new Uint8Array(n), count=0, i;
    for(i=0;i<n;i++){
      if(gray[i] >= t){ m[i]=1; count++; }
    }
    if(count < 12){
      t = Math.max(165, stats.p99 - 2);
      count=0;
      for(i=0;i<n;i++){ m[i] = gray[i] >= t ? 1 : 0; if(m[i]) count++; }
    }
    return { mask:m, threshold:t, count:count };
  }

  function applyMAR(gray,w,h,opt){
    var n=gray.length, stats=histStats(gray), lf=grayToFloat(gray);
    var metalInfo = detectMetal(gray,w,h,stats,opt);
    var metal = metalInfo.mask;
    var metalCount = metalInfo.count;

    // Sem metal detectável: aplica correção global muito fraca só para não parecer morto, mas avisa pelo info.
    if(metalCount < 4){
      return { gray:new Uint8Array(gray), threshold:metalInfo.threshold, metalCount:metalCount, changed:0 };
    }

    var body = new Uint8Array(n);
    var bodyT = Math.max(5, stats.p02 - 2);
    for(var i=0;i<n;i++) body[i] = gray[i] > bodyT ? 1 : 0;
    body = erodeBody(body,w,h);

    var dist = distanceFromMask(metal,w,h);
    var coreR = 1.15 + (opt.core/100)*2.2;
    var bandR = 24 + (opt.reach/100)*52;

    var rMid = 5 + ((opt.shadow/100)*8)|0;
    var rBroad = 16 + ((opt.shadow/100)*30)|0;
    var mid = boxRadius(lf,w,h,rMid);
    var broad = boxRadius(lf,w,h,rBroad);

    var dirs=[ [1,0], [0,1], [1,1], [1,-1], [2,1], [2,-1], [1,2], [1,-2], [3,1], [3,-1], [1,3], [1,-3] ];
    var r1 = 2 + ((opt.streak/100)*3)|0;
    var r2 = 6 + ((opt.streak/100)*7)|0;

    var out = new Uint8Array(gray);
    var weights = new Float32Array(n);
    var preserve = opt.preserve/100;
    var darkGain = 0.65 + (opt.streak/100)*1.85;
    var brightGain = 0.25 + (opt.bright/100)*1.25;
    var shadowGain = 0.35 + (opt.shadow/100)*1.55;
    var changed=0;

    for(var y=1;y<h-1;y++){
      for(var x=1;x<w-1;x++){
        var idx=y*w+x;
        var d0=dist[idx];
        if(d0 <= coreR || d0 > bandR) continue;
        if(!body[idx]) continue;

        var g0=gray[idx];
        var local = mid[idx]*0.55 + broad[idx]*0.45;
        var radial = smooth01((bandR - d0) / bandR);
        radial = Math.pow(radial, 0.55);

        var gx = Math.abs(gray[idx+1]-gray[idx-1]);
        var gy = Math.abs(gray[idx+w]-gray[idx-w]);
        var grad = gx + gy;
        var edgeKeep = 1 - smooth01((grad - (10 + preserve*12)) / (34 + preserve*58));
        edgeKeep = clamp(edgeKeep, 0.08, 1);

        var bestDarkScore=0, bestDarkTarget=local;
        var bestBrightScore=0, bestBrightTarget=local;

        for(var di=0; di<dirs.length; di++){
          var dx=dirs[di][0], dy=dirs[di][1];
          var x1=x+dx*r1, y1=y+dy*r1, x2=x-dx*r1, y2=y-dy*r1;
          var x3=x+dx*r2, y3=y+dy*r2, x4=x-dx*r2, y4=y-dy*r2;
          if(x1<0||x1>=w||y1<0||y1>=h||x2<0||x2>=w||y2<0||y2>=h||x3<0||x3>=w||y3<0||y3>=h||x4<0||x4>=w||y4<0||y4>=h) continue;
          var i1=y1*w+x1, i2=y2*w+x2, i3=y3*w+x3, i4=y4*w+x4;
          if(dist[i1]<=coreR || dist[i2]<=coreR || dist[i3]<=coreR || dist[i4]<=coreR) continue;
          var a=gray[i1], b=gray[i2], c=gray[i3], e=gray[i4];
          var avg=(a+b+c+e)*0.25;
          var coh=(Math.abs(a-b)+Math.abs(c-e))*0.5;
          var darkScore=(avg-g0)-coh*0.22;
          var brightScore=(g0-avg)-coh*0.22;
          if(darkScore>bestDarkScore){ bestDarkScore=darkScore; bestDarkTarget=avg; }
          if(brightScore>bestBrightScore){ bestBrightScore=brightScore; bestBrightTarget=avg; }
        }

        var darkDef = local - g0;
        var brightDef = g0 - local;
        var wDark = smooth01((Math.max(darkDef, bestDarkScore) - 2) / 22) * darkGain;
        var wShadow = smooth01((darkDef - 1) / 30) * shadowGain;
        var wBright = smooth01((Math.max(brightDef, bestBrightScore) - 8) / 42) * brightGain;

        var target = g0;
        var wMix = 0;
        if(wDark + wShadow > wBright){
          target = Math.max(local, bestDarkTarget, broad[idx] - 2);
          wMix = clamp((wDark + wShadow) * radial * edgeKeep, 0, 0.98);
          if(target < g0) target = g0;
        }else if(wBright > 0.02){
          target = Math.min(local, bestBrightTarget, broad[idx] + 4);
          wMix = clamp(wBright * radial * edgeKeep, 0, 0.82);
          if(target > g0) target = g0;
        }

        if(wMix <= 0.012) continue;
        var corr = g0 + wMix*(target-g0);
        corr = clamp(corr, 0, 255);
        out[idx] = corr|0;
        weights[idx] = wMix;
        changed++;
      }
    }

    // Pós-refino: só nos pixels corrigidos, para apagar manchas sem borrar tudo.
    var sm = new Uint8Array(out);
    var smoothK = 0.20 + (1-preserve)*0.22;
    for(y=1;y<h-1;y++){
      for(x=1;x<w-1;x++){
        idx=y*w+x;
        if(weights[idx] < 0.10 || dist[idx] <= coreR) continue;
        var sum=0,cnt=0;
        for(var yy=-1;yy<=1;yy++){
          for(var xx=-1;xx<=1;xx++){
            var ii=(y+yy)*w+(x+xx);
            if(dist[ii] <= coreR) continue;
            sum += out[ii]; cnt++;
          }
        }
        if(cnt){ sm[idx] = clamp((out[idx]*(1-smoothK)+(sum/cnt)*smoothK+0.5)|0,0,255); }
      }
    }

    return { gray:sm, threshold:metalInfo.threshold, metalCount:metalCount, changed:changed };
  }

  function bindZoom(vp,state,imgs){
    var pts={};
    function apply(){ for(var i=0;i<imgs.length;i++){ imgs[i].style.transform='translate('+state.tx+'px,'+state.ty+'px) scale('+state.scale+')'; } }
    vp.addEventListener('wheel', function(e){ e.preventDefault(); var f=e.deltaY<0?1.15:1/1.15; state.scale=clamp(state.scale*f,1,12); if(state.scale===1){ state.tx=0; state.ty=0; } apply(); }, { passive:false });
    vp.addEventListener('pointerdown', function(e){ try{vp.setPointerCapture(e.pointerId);}catch(_){} pts[e.pointerId]={x:e.clientX,y:e.clientY}; });
    vp.addEventListener('pointermove', function(e){
      if(!pts[e.pointerId]) return;
      var ids=Object.keys(pts);
      if(ids.length===1){
        var dx=e.clientX-pts[e.pointerId].x, dy=e.clientY-pts[e.pointerId].y;
        if(state.scale>1){ state.tx += dx; state.ty += dy; apply(); }
        pts[e.pointerId]={x:e.clientX,y:e.clientY};
      }else if(ids.length===2){
        var p0=pts[ids[0]], p1=pts[ids[1]];
        var pd=Math.hypot(p0.x-p1.x,p0.y-p1.y);
        pts[e.pointerId]={x:e.clientX,y:e.clientY};
        p0=pts[ids[0]]; p1=pts[ids[1]];
        var nd=Math.hypot(p0.x-p1.x,p0.y-p1.y);
        if(pd>0){ state.scale=clamp(state.scale*(nd/pd),1,12); if(state.scale===1){ state.tx=0; state.ty=0; } apply(); }
      }
    });
    function up(e){ delete pts[e.pointerId]; }
    vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  }

  function showMarModal(beforeUrl, afterUrl, info, rerender, initialMeta){
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:2147483601;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;';
    var t=document.createElement('div');
    t.textContent='Endo MAR v2 · bandas e raios metálicos · imagem derivada';
    t.style.cssText='color:#dff;font:900 12px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;letter-spacing:.4px;';
    var s=document.createElement('div');
    s.textContent=info;
    s.style.cssText='color:#9fb3c8;font:700 10px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;max-width:min(760px,94vw);';
    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;gap:8px;width:100%;max-width:1100px;justify-content:center;';
    var stt={scale:1,tx:0,ty:0}, imgs=[], afterImg=null;
    function mkCol(lbl,url,isAfter){
      var c=document.createElement('div'); c.style.cssText='flex:1;min-width:0;max-width:49%;text-align:center;';
      var l=document.createElement('div'); l.textContent=lbl; l.style.cssText='color:#b9c8d8;font:800 10px sans-serif;margin-bottom:4px;letter-spacing:1px;';
      var vp=document.createElement('div'); vp.style.cssText='overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#000;touch-action:none;height:50vh;display:flex;align-items:center;justify-content:center;';
      var im=document.createElement('img'); im.src=url; im.draggable=false; im._url=url; im.style.cssText='max-width:100%;max-height:50vh;transform-origin:center center;will-change:transform;user-select:none;';
      vp.appendChild(im); c.appendChild(l); c.appendChild(vp); imgs.push(im); if(isAfter) afterImg=im; bindZoom(vp,stt,imgs); return c;
    }
    wrap.appendChild(mkCol('ANTES',beforeUrl,false)); wrap.appendChild(mkCol('DEPOIS',afterUrl,true));
    var ctr=document.createElement('div');
    ctr.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:7px;width:min(560px,94vw);background:rgba(20,24,32,.80);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:11px;';
    var timer=null, lastMeta=initialMeta || {};
    function mkSlider(lbl,min,max,step,value,tone){
      var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:8px;color:#cfe;font:800 10px sans-serif;';
      var sp=document.createElement('span'); sp.textContent=lbl; sp.style.cssText='width:128px;color:#a9bbcf;';
      var rng=document.createElement('input'); rng.type='range'; rng.min=min; rng.max=max; rng.step=step; rng.value=value; rng.style.cssText='flex:1;accent-color:'+tone+';';
      var val=document.createElement('span'); val.textContent=value; val.style.cssText='min-width:32px;text-align:right;color:#fff;';
      rng.addEventListener('input', function(){ val.textContent=rng.value; schedule(); });
      row.appendChild(sp); row.appendChild(rng); row.appendChild(val); ctr.appendChild(row); return rng;
    }
    var rMetal = mkSlider('Metal',0,100,1,58,'#f59e0b');
    var rStreak = mkSlider('Raios escuros',0,100,1,92,'#22c55e');
    var rBright = mkSlider('Raios brancos',0,100,1,54,'#eab308');
    var rShadow = mkSlider('Bandas/sombras',0,100,1,86,'#38bdf8');
    var rReach = mkSlider('Alcance',0,100,1,78,'#fb7185');
    var rPres = mkSlider('Preservar bordas',0,100,1,55,'#a78bfa');
    var rCore = mkSlider('Proteger metal',0,100,1,45,'#94a3b8');
    var status=document.createElement('div'); status.style.cssText='color:#8fa3b8;font:700 10px sans-serif;text-align:center;';
    status.textContent='Metal: '+(lastMeta.metalCount||0)+' px · corrigidos: '+(lastMeta.changed||0)+' px';
    ctr.appendChild(status);
    function currentParams(){ return { metal:+rMetal.value, streak:+rStreak.value, bright:+rBright.value, shadow:+rShadow.value, reach:+rReach.value, preserve:+rPres.value, core:+rCore.value }; }
    function schedule(){
      if(timer) clearTimeout(timer);
      timer=setTimeout(function(){
        var rr=rerender(currentParams());
        if(afterImg){ afterImg.src = rr.url; afterImg._url = rr.url; }
        lastMeta=rr.meta||{};
        status.textContent='Metal: '+(lastMeta.metalCount||0)+' px · corrigidos: '+(lastMeta.changed||0)+' px';
      }, isIOS()?160:80);
    }
    var bar=document.createElement('div'); bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
    function mkBtn(txt,css,fn){
      var b=document.createElement('button'); b.textContent=txt; b.style.cssText='padding:10px 14px;border-radius:10px;border:none;font:900 12px sans-serif;cursor:pointer;touch-action:manipulation;'+css;
      b.onclick=fn; b.addEventListener('touchend',function(e){ e.preventDefault(); fn(); },{passive:false}); return b;
    }
    bar.appendChild(mkBtn('Forte','background:#0ea5e9;color:#fff;',function(){ rStreak.value=100; rBright.value=70; rShadow.value=100; rReach.value=92; rPres.value=42; schedule(); }));
    bar.appendChild(mkBtn('Equilibrado','background:rgba(255,255,255,.13);color:#eee;',function(){ rStreak.value=92; rBright.value=54; rShadow.value=86; rReach.value=78; rPres.value=55; schedule(); }));
    bar.appendChild(mkBtn('Reset zoom','background:rgba(255,255,255,.13);color:#eee;',function(){ stt.scale=1; stt.tx=0; stt.ty=0; for(var i=0;i<imgs.length;i++) imgs[i].style.transform='translate(0px,0px) scale(1)'; }));
    bar.appendChild(mkBtn('Salvar no portfólio','background:#16a34a;color:#fff;',function(){ var u=(afterImg&&afterImg._url)||afterImg.src; try{ if(typeof portfolioAddItem==='function'){ portfolioAddItem('Endo MAR v2 (bandas/raios metálicos)',u,'Imagem derivada · artefato metálico · '+new Date().toLocaleTimeString('pt-BR'),{},''); } }catch(e){} if(ov.parentNode) ov.parentNode.removeChild(ov); }));
    bar.appendChild(mkBtn('Fechar','background:rgba(255,255,255,.13);color:#eee;',function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }));
    ov.appendChild(t); ov.appendChild(s); ov.appendChild(wrap); ov.appendChild(ctr); ov.appendChild(bar);
    var closeX=document.createElement('button');
    closeX.textContent='✕'; closeX.setAttribute('aria-label','Fechar');
    closeX.style.cssText='position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:14px;z-index:6;width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(20,24,32,.78);color:#fff;font:900 18px -apple-system,sans-serif;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);';
    var closeMar=function(e){ if(e){ e.preventDefault(); e.stopPropagation(); } if(ov.parentNode) ov.parentNode.removeChild(ov); };
    closeX.onclick=closeMar; closeX.addEventListener('touchend',closeMar,{passive:false});
    ov.appendChild(closeX);
    document.body.appendChild(ov);
  
  }

  window.endoMetalMAR = function(){
    try{
      var src=pickCanvas();
      if(!src){ alert('Abra um corte no Endo ou Axial antes de usar o MAR.'); return; }
      var base=captureGray(src, isIOS()?760:940);
      var beforeUrl=base.canvas.toDataURL('image/png');
      function renderObj(params){
        var res=applyMAR(base.gray,base.width,base.height,params);
        var cv=grayToCanvas(res.gray,base.width,base.height);
        return { url:cv.toDataURL('image/png'), meta:res };
      }
      var initialParams={ metal:58, streak:92, bright:54, shadow:86, reach:78, preserve:55, core:45 };
      var first=renderObj(initialParams);
      showMarModal(beforeUrl,first.url,'Objetivo: reduzir bandas escuras, raios pretos e raios brancos irradiados de áreas metálicas. O corte original não é alterado; esta é uma imagem derivada para comparação/salvamento.',renderObj,first.meta);
    }catch(e){ console.error('[Endo MAR v2]',e); alert('Falha no MAR: '+(e&&e.message?e.message:e)); }
  };
})();
