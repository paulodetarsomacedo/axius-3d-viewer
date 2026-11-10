
/* Lesão periapical v2 — ROI manual ajustável + detecção heurística somente dentro do ROI.
   Não altera exame original, loaders, volumeData, MPR, 3D, ZIP, MAR ou outras funções. */
(function(){
  if(window._endoPeriapicalRoiV2Installed)return; window._endoPeriapicalRoiV2Installed=true;

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lerp(a,b,t){ return a + (b-a)*t; }

  if(!document.getElementById('endo-periapical-roi-style')){
    var st=document.createElement('style');
    st.id='endo-periapical-roi-style';
    st.textContent='      .endo-periapical-roi-modal{font-family:-apple-system,BlinkMacSystemFont,sans-serif;}      .endo-periapical-roi-modal input[type="range"]{height:14px!important;}      .endo-periapical-roi-modal input[type="range"]::-webkit-slider-runnable-track{height:14px!important;}      .endo-periapical-roi-modal input[type="range"]::-webkit-slider-thumb{height:24px!important;width:24px!important;margin-top:-5px!important;}      .endo-periapical-roi-modal button{touch-action:manipulation!important;}    ';
    document.head.appendChild(st);
  }

  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    return {canvas:cv,ctx:cx,width:w,height:h,gray:gray,imageData:id};
  }

  function histStats(arr){
    var hist=new Uint32Array(256), n=arr.length;
    for(var i=0;i<n;i++) hist[arr[i]]++;
    function pct(p){
      var target=n*p/100, acc=0;
      for(var v=0;v<256;v++){ acc+=hist[v]; if(acc>=target)return v; }
      return 255;
    }
    return {
      p05:pct(5), p10:pct(10), p15:pct(15), p20:pct(20), p25:pct(25), p30:pct(30), p35:pct(35),
      p40:pct(40), p45:pct(45), p50:pct(50), p60:pct(60), p70:pct(70), p75:pct(75), p80:pct(80),
      p85:pct(85), p90:pct(90), p95:pct(95)
    };
  }

  function blurBox(src,w,h,rad){
    if(rad<=0){
      var out0=new Float32Array(src.length);
      for(var i0=0;i0<src.length;i0++) out0[i0]=src[i0];
      return out0;
    }
    var tmp=new Float32Array(src.length);
    var out=new Float32Array(src.length);
    var x,y,i,sum,count,xx,yy;
    for(y=0;y<h;y++){
      var row=y*w;
      sum=0; count=0;
      for(xx=-rad;xx<=rad;xx++){
        var cx=clamp(xx,0,w-1);
        sum+=src[row+cx]; count++;
      }
      for(x=0;x<w;x++){
        tmp[row+x]=sum/count;
        var xOut=x-rad, xIn=x+rad+1;
        if(xOut>=0) sum-=src[row+xOut]; else sum-=src[row+0];
        if(xIn<w) sum+=src[row+xIn]; else sum+=src[row+w-1];
      }
    }
    for(x=0;x<w;x++){
      sum=0; count=0;
      for(yy=-rad;yy<=rad;yy++){
        var cy=clamp(yy,0,h-1);
        sum+=tmp[cy*w+x]; count++;
      }
      for(y=0;y<h;y++){
        out[y*w+x]=sum/count;
        var yOut=y-rad, yIn=y+rad+1;
        if(yOut>=0) sum-=tmp[yOut*w+x]; else sum-=tmp[0*w+x];
        if(yIn<h) sum+=tmp[yIn*w+x]; else sum+=tmp[(h-1)*w+x];
      }
    }
    return out;
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
              if(!cur[off+xx]){ on=0; break; }
            }
          }
          out[y*w+x]=on;
        }
      }
      cur=out;
    }
    return cur;
  }

  function closeMorph(mask,w,h,r){ return erode(dilate(mask,w,h,r),w,h,r); }
  function openMorph(mask,w,h,r){ return dilate(erode(mask,w,h,r),w,h,r); }

  function extractROI(base, roi){
    var x0=clamp(Math.round(roi.x),0,base.width-1);
    var y0=clamp(Math.round(roi.y),0,base.height-1);
    var size=clamp(Math.round(roi.size),18,Math.min(base.width-x0, base.height-y0));
    var arr=new Uint8Array(size*size);
    for(var y=0;y<size;y++){
      var srcOff=(y0+y)*base.width + x0;
      var dstOff=y*size;
      for(var x=0;x<size;x++) arr[dstOff+x]=base.gray[srcOff+x];
    }
    return {x:x0,y:y0,size:size,w:size,h:size,gray:arr};
  }

  function analyzeLesionInROI(roiData, opts){
    var w=roiData.w, h=roiData.h, gray=roiData.gray, n=gray.length;
    var stats=histStats(gray);
    var blurSmall=blurBox(gray,w,h,1);
    var blurWide=blurBox(gray,w,h,3);
    var candidate=new Uint8Array(n);
    var sensitivity=clamp(opts.sensitivity||62,0,100);
    var boneContrast=clamp(opts.boneContrast||58,0,100);
    var circularityNeed=clamp(opts.circularity||52,0,100);
    var thresholdAbs=Math.round(lerp(stats.p20, stats.p48, sensitivity/100));
    var needDeficit=lerp(18,6,boneContrast/100);

    for(var i=0;i<n;i++){
      var g=gray[i];
      var localDef=(blurWide[i]-g);
      if(g<=4){ candidate[i]=0; continue; }
      if(g<=thresholdAbs && localDef>=needDeficit) candidate[i]=1;
    }

    candidate=closeMorph(candidate,w,h,1);
    candidate=openMorph(candidate,w,h,1);

    var visited=new Uint8Array(n);
    var stack=new Int32Array(n);
    var comps=[];
    var roiArea=w*h;
    var minArea=Math.max(10, Math.round(roiArea*0.006));
    var maxArea=Math.max(minArea+8, Math.round(roiArea*0.42));
    var cxRef=w/2, cyRef=h/2, maxDist=Math.sqrt(cxRef*cxRef+cyRef*cyRef);

    for(var start=0;start<n;start++){
      if(!candidate[start] || visited[start]) continue;
      var top=0, area=0, sx=0, sy=0, darkSum=0, minx=w, miny=h, maxx=0, maxy=0, edgeTouch=0, perim=0;
      visited[start]=1; stack[top++]=start;
      while(top){
        var idx=stack[--top];
        var y=(idx/w)|0, x=idx-y*w;
        area++; sx+=x; sy+=y; darkSum += (255-gray[idx]);
        if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
        if(x===0||y===0||x===w-1||y===h-1) edgeTouch=1;
        var nbs=[[1,0],[-1,0],[0,1],[0,-1]];
        var k;
        for(k=0;k<4;k++){
          var xx=x+nbs[k][0], yy=y+nbs[k][1];
          if(xx<0||xx>=w||yy<0||yy>=h){ perim++; continue; }
          var nb=yy*w+xx;
          if(!candidate[nb]) perim++;
          else if(!visited[nb]){ visited[nb]=1; stack[top++]=nb; }
        }
      }
      if(area<minArea || area>maxArea) continue;
      var bw=maxx-minx+1, bh=maxy-miny+1;
      if(bw<3 || bh<3) continue;
      var fill=area/(bw*bh);
      var roundB=Math.min(bw,bh)/Math.max(bw,bh);
      var circularity=clamp((4*Math.PI*area)/(Math.max(1, perim*perim)),0,1.25);
      var circularBlend=clamp(circularity*0.7 + roundB*0.3,0,1);
      if(circularBlend < lerp(0.18,0.62,circularityNeed/100)) continue;
      var cx=sx/area, cy=sy/area;
      var centerDist=Math.sqrt((cx-cxRef)*(cx-cxRef)+(cy-cyRef)*(cy-cyRef));
      var centrality=1 - clamp(centerDist/Math.max(1,maxDist),0,1);

      var ringR = Math.max(4, Math.round(Math.max(bw,bh)*0.60));
      var ringCount=0, ringSum=0, innerCount=0, innerSum=0;
      var rx0=Math.max(0, Math.round(cx - bw/2 - ringR));
      var rx1=Math.min(w-1, Math.round(cx + bw/2 + ringR));
      var ry0=Math.max(0, Math.round(cy - bh/2 - ringR));
      var ry1=Math.min(h-1, Math.round(cy + bh/2 + ringR));
      for(var yy=ry0; yy<=ry1; yy++){
        var off=yy*w;
        for(var xx=rx0; xx<=rx1; xx++){
          var dx=(xx-cx)/(Math.max(1,bw*0.55));
          var dy=(yy-cy)/(Math.max(1,bh*0.55));
          var el=dx*dx+dy*dy;
          var ii=off+xx;
          if(el<=1.05){ innerCount++; innerSum+=gray[ii]; }
          else if(el<=2.0){ ringCount++; ringSum+=gray[ii]; }
        }
      }
      var innerMean=innerCount?innerSum/innerCount:0;
      var ringMean=ringCount?ringSum/ringCount:0;
      var ringContrast=clamp((ringMean-innerMean)/52,0,1.5);
      var darkness=clamp((darkSum/area - 70)/100,0,1.4);

      var score = darkness*1.45 + ringContrast*1.55 + circularBlend*1.15 + centrality*0.80 + fill*0.35;
      if(edgeTouch) score *= 0.55;
      comps.push({
        area:area, x:cx, y:cy, bbox:[minx,miny,maxx,maxy], fill:fill,
        circularity:circularBlend, ringContrast:ringContrast, darkness:darkness,
        centrality:centrality, score:score
      });
    }

    comps.sort(function(a,b){ return b.score-a.score; });
    var best=comps.length?comps[0]:null;
    var finalMask=new Uint8Array(n);
    if(best){
      // region growing restrained by local darkness inside bbox neighborhood
      var bx0=Math.max(0,best.bbox[0]-2), by0=Math.max(0,best.bbox[1]-2), bx1=Math.min(w-1,best.bbox[2]+2), by1=Math.min(h-1,best.bbox[3]+2);
      var roiMask=new Uint8Array(n), seeds=[];
      var growThr=Math.round(lerp(stats.p28, stats.p55, sensitivity/100));
      var growDef=lerp(15,5,boneContrast/100);
      for(var y=by0;y<=by1;y++){
        var off=y*w;
        for(var x=bx0;x<=bx1;x++){
          var ii=off+x;
          var dx=(x-best.x)/(Math.max(1,(best.bbox[2]-best.bbox[0]+1)*0.62));
          var dy=(y-best.y)/(Math.max(1,(best.bbox[3]-best.bbox[1]+1)*0.62));
          var el=dx*dx+dy*dy;
          if(el<=1.05 && gray[ii]<=growThr && (blurWide[ii]-gray[ii])>=growDef){ roiMask[ii]=1; seeds.push(ii); }
        }
      }
      // fallback: use thresholded component footprint if seeds too few
      if(seeds.length<6){
        for(var y2=by0;y2<=by1;y2++){
          var off2=y2*w;
          for(var x2=bx0;x2<=bx1;x2++){
            var ii2=off2+x2;
            var dx2=(x2-best.x)/(Math.max(1,(best.bbox[2]-best.bbox[0]+1)*0.54));
            var dy2=(y2-best.y)/(Math.max(1,(best.bbox[3]-best.bbox[1]+1)*0.54));
            var el2=dx2*dx2+dy2*dy2;
            if(el2<=1.0 && gray[ii2] <= Math.round((stats.p30+stats.p45)/2)){ roiMask[ii2]=1; }
          }
        }
      }
      roiMask=closeMorph(roiMask,w,h,1);
      roiMask=openMorph(roiMask,w,h,1);
      var expand=Math.max(0,Math.round((opts.expand||16)/20));
      if(expand>0) roiMask=dilate(roiMask,w,h,expand);
      finalMask=roiMask;
    }

    return {mask:finalMask, best:best, roi:roiData, stats:stats, components:comps};
  }

  function strokeMask(ctx, mask, w, h, ox, oy, strokeStyle, lineWidth){
    ctx.save();
    ctx.strokeStyle=strokeStyle; ctx.lineWidth=lineWidth||2;
    for(var y=0;y<h;y++){
      var off=y*w;
      for(var x=0;x<w;x++){
        var i=off+x;
        if(!mask[i]) continue;
        var edge = (x===0||!mask[i-1]||x===w-1||!mask[i+1]||y===0||!mask[i-w]||y===h-1||!mask[i+w]);
        if(edge){ ctx.strokeRect(ox+x, oy+y, 1, 1); }
      }
    }
    ctx.restore();
  }

  function renderPeriapicalOverlay(base, analysis, opts, roi){
    var out=document.createElement('canvas'); out.width=base.width; out.height=base.height;
    var ctx=out.getContext('2d');
    ctx.drawImage(base.canvas,0,0);
    var x0=analysis.roi.x, y0=analysis.roi.y, size=analysis.roi.size;

    // desenha ROI sutil
    ctx.save();
    ctx.strokeStyle='rgba(66,153,225,0.95)';
    ctx.lineWidth=2;
    ctx.setLineDash([7,5]);
    ctx.strokeRect(x0+0.5,y0+0.5,size,size);
    ctx.setLineDash([]);
    ctx.restore();

    if(analysis.best){
      var mask=analysis.mask, w=analysis.roi.w, h=analysis.roi.h;
      var alphaFill = clamp((opts.fillOpacity||62)/100,0.18,0.85);
      var img=ctx.getImageData(x0,y0,w,h), d=img.data;
      for(var i=0;i<mask.length;i++){
        if(!mask[i]) continue;
        var p=i*4;
        // preenchimento vermelho vivo translúcido
        d[p]   = Math.round(d[p]*(1-alphaFill) + 235*alphaFill);
        d[p+1] = Math.round(d[p+1]*(1-alphaFill) + 34*alphaFill);
        d[p+2] = Math.round(d[p+2]*(1-alphaFill) + 62*alphaFill);
      }
      ctx.putImageData(img,x0,y0);
      // contorno vinho
      strokeMask(ctx, mask, w, h, x0, y0, 'rgba(120,0,28,0.98)', 2);

      var b=analysis.best;
      var label='Lesão detectada';
      ctx.save();
      ctx.font='900 12px -apple-system, sans-serif';
      ctx.fillStyle='rgba(255,255,255,0.96)';
      ctx.strokeStyle='rgba(0,0,0,0.72)';
      ctx.lineWidth=3;
      var tx=clamp(x0+b.x+12, 8, base.width-120);
      var ty=clamp(y0+b.y-10, 18, base.height-8);
      ctx.strokeText(label,tx,ty); ctx.fillText(label,tx,ty);
      ctx.restore();
    }
    return out;
  }

  function showPeriapicalModal(base){
    var roi={
      size: Math.round(Math.min(base.width,base.height)*0.24),
      x: Math.round(base.width*0.38),
      y: Math.round(base.height*0.52)
    };
    roi.size=clamp(roi.size,64,Math.round(Math.min(base.width,base.height)*0.45));
    roi.x=clamp(roi.x,0,base.width-roi.size);
    roi.y=clamp(roi.y,0,base.height-roi.size);

    var vals={sensitivity:66,boneContrast:60,circularity:56,expand:14,fillOpacity:62};

    var ov=document.createElement('div');
    ov.className='endo-periapical-roi-modal';
    ov.style.cssText='position:fixed;inset:0;z-index:2147483605;background:rgba(0,0,0,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;';

    var closeX=document.createElement('button');
    closeX.type='button'; closeX.textContent='×';
    closeX.style.cssText='position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,24,32,.88);color:#EAF2FF;font:900 28px/1 -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483606;box-shadow:0 8px 22px rgba(0,0,0,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);cursor:pointer;';
    closeX.onclick=function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); };
    closeX.addEventListener('touchend', function(e){ e.preventDefault(); e.stopPropagation(); if(ov.parentNode) ov.parentNode.removeChild(ov); }, {passive:false});

    var title=document.createElement('div');
    title.textContent='Lesão periapical · ROI ajustável no ápice';
    title.style.cssText='color:#EAF2FF;font:900 13px -apple-system,sans-serif;text-align:center;letter-spacing:.3px;';

    var sub=document.createElement('div');
    sub.style.cssText='color:#a9bbcf;font:700 10px -apple-system,sans-serif;text-align:center;max-width:min(860px,94vw);line-height:1.35;';
    sub.textContent='Posicione o quadrado sobre o ápice radicular. A detecção roda somente dentro desse ROI e pinta apenas a área hipodensa circular sugerindo lesão periapical.';

    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;gap:8px;max-width:100%;width:100%;justify-content:center;flex-wrap:wrap;';

    var leftCol=document.createElement('div');
    leftCol.style.cssText='flex:1;min-width:min(320px,48vw);max-width:48%;text-align:center;';
    var leftLabel=document.createElement('div');
    leftLabel.textContent='AJUSTE O ROI NO ÁPICE';
    leftLabel.style.cssText='color:#EAF2FF;font:900 10px sans-serif;margin-bottom:4px;letter-spacing:1px;';
    var leftVp=document.createElement('div');
    leftVp.style.cssText='overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#000;touch-action:none;height:56vh;display:flex;align-items:center;justify-content:center;position:relative;';
    var leftCanvas=document.createElement('canvas');
    leftCanvas.width=base.width; leftCanvas.height=base.height;
    leftCanvas.style.cssText='max-width:100%;max-height:56vh;display:block;touch-action:none;';
    leftVp.appendChild(leftCanvas); leftCol.appendChild(leftLabel); leftCol.appendChild(leftVp);

    var rightCol=document.createElement('div');
    rightCol.style.cssText='flex:1;min-width:min(320px,48vw);max-width:48%;text-align:center;';
    var rightLabel=document.createElement('div');
    rightLabel.textContent='DETECÇÃO DA LESÃO';
    rightLabel.style.cssText='color:#EAF2FF;font:900 10px sans-serif;margin-bottom:4px;letter-spacing:1px;';
    var rightVp=document.createElement('div');
    rightVp.style.cssText='overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#000;touch-action:none;height:56vh;display:flex;align-items:center;justify-content:center;';
    var rightImg=document.createElement('img');
    rightImg.draggable=false; rightImg.style.cssText='max-width:100%;max-height:56vh;display:block;';
    rightVp.appendChild(rightImg); rightCol.appendChild(rightLabel); rightCol.appendChild(rightVp);

    wrap.appendChild(leftCol); wrap.appendChild(rightCol);

    var ctr=document.createElement('div');
    ctr.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:8px;width:min(620px,94vw);background:rgba(20,24,32,.78);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;';

    var roiInfo=document.createElement('div');
    roiInfo.style.cssText='color:#EAF2FF;font:800 10px sans-serif;line-height:1.4;';
    ctr.appendChild(roiInfo);

    function mkSlider(lbl,min,max,step,key,tone){
      var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:8px;color:#EAF2FF;font:800 10px sans-serif;';
      var sp=document.createElement('span'); sp.textContent=lbl; sp.style.cssText='width:152px;color:#EAF2FF;';
      var rng=document.createElement('input'); rng.type='range'; rng.min=min; rng.max=max; rng.step=step; rng.value=vals[key]; rng.style.cssText='flex:1;accent-color:'+tone+';';
      var va=document.createElement('span'); va.textContent=vals[key]; va.style.cssText='min-width:34px;text-align:right;color:#fff;font-weight:900;';
      rng.addEventListener('input',function(){ vals[key]=+rng.value; va.textContent=rng.value; scheduleRender(); });
      row.appendChild(sp); row.appendChild(rng); row.appendChild(va); ctr.appendChild(row);
    }

    mkSlider('Sensibilidade',0,100,1,'sensitivity','#ef4444');
    mkSlider('Contraste com osso',0,100,1,'boneContrast','#f59e0b');
    mkSlider('Circularidade mínima',0,100,1,'circularity','#8b5cf6');
    mkSlider('Expandir máscara',0,40,1,'expand','#22c55e');
    mkSlider('Opacidade do preench.',20,85,1,'fillOpacity','#dc2626');

    var sizeRow=document.createElement('div');
    sizeRow.style.cssText='display:flex;align-items:center;gap:8px;color:#EAF2FF;font:800 10px sans-serif;';
    var sizeLabel=document.createElement('span'); sizeLabel.textContent='Tamanho do ROI'; sizeLabel.style.cssText='width:152px;color:#EAF2FF;';
    var sizeRange=document.createElement('input'); sizeRange.type='range'; sizeRange.min=48; sizeRange.max=Math.round(Math.min(base.width,base.height)*0.54); sizeRange.step=1; sizeRange.value=roi.size; sizeRange.style.cssText='flex:1;accent-color:#3b82f6;';
    var sizeVal=document.createElement('span'); sizeVal.textContent=roi.size; sizeVal.style.cssText='min-width:52px;text-align:right;color:#fff;font-weight:900;';
    sizeRange.addEventListener('input', function(){
      roi.size=clamp(+sizeRange.value, 48, Math.min(base.width,base.height));
      roi.x=clamp(roi.x,0,base.width-roi.size);
      roi.y=clamp(roi.y,0,base.height-roi.size);
      sizeVal.textContent=Math.round(roi.size)+' px';
      drawLeft();
      scheduleRender();
    });
    sizeRow.appendChild(sizeLabel); sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeVal); ctr.appendChild(sizeRow);

    var bar=document.createElement('div'); bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
    function btn(txt,css,fn){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='padding:10px 14px;border-radius:10px;border:none;font:900 12px sans-serif;cursor:pointer;color:#EAF2FF;'+css; b.onclick=fn; b.addEventListener('touchend',function(e){e.preventDefault();fn();},{passive:false}); return b; }

    var lastRender=null;
    function setSummary(analysis){
      if(analysis && analysis.best){
        roiInfo.innerHTML='ROI: <b>'+analysis.roi.size+'×'+analysis.roi.size+' px</b> · centro aproximado do achado: <b>'+analysis.best.x.toFixed(1)+', '+analysis.best.y.toFixed(1)+'</b> · área detectada: <b>'+analysis.best.area+' px</b> · circularidade: <b>'+analysis.best.circularity.toFixed(2)+'</b> · contraste com osso: <b>'+analysis.best.ringContrast.toFixed(2)+'</b> · score: <b>'+analysis.best.score.toFixed(2)+'</b>.';
        sub.textContent='Detecção dentro do ROI: lesão hipodensa circular delimitada pela diferença de densidade com o osso circundante. Revise em múltiplos cortes.';
      } else {
        roiInfo.innerHTML='ROI: <b>'+roi.size+'×'+roi.size+' px</b> · nenhum candidato forte encontrado no quadrado atual. Posicione melhor o ROI sobre o ápice ou aumente a sensibilidade.';
        sub.textContent='Nenhuma lesão circular hipodensa forte foi reconhecida no ROI atual. Ajuste o quadrado sobre o ápice e revise a sensibilidade/contraste.';
      }
    }

    function renderDetection(){
      var roiData=extractROI(base, roi);
      var analysis=analyzeLesionInROI(roiData, vals);
      var outCanvas=renderPeriapicalOverlay(base, analysis, vals, roi);
      var url=outCanvas.toDataURL('image/png');
      rightImg.src=url; rightImg._url=url;
      lastRender={analysis:analysis,url:url};
      setSummary(analysis);
    }

    var timer=null;
    function scheduleRender(){
      if(timer) clearTimeout(timer);
      timer=setTimeout(renderDetection, 80);
    }

    function drawLeft(){
      var ctx=leftCanvas.getContext('2d');
      ctx.clearRect(0,0,leftCanvas.width,leftCanvas.height);
      ctx.drawImage(base.canvas,0,0);
      ctx.save();
      ctx.strokeStyle='rgba(52,152,219,0.96)';
      ctx.lineWidth=2.5;
      ctx.setLineDash([8,6]);
      ctx.strokeRect(roi.x+0.5, roi.y+0.5, roi.size, roi.size);
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(52,152,219,0.12)';
      ctx.fillRect(roi.x, roi.y, roi.size, roi.size);
      // crosshair center
      ctx.beginPath();
      ctx.moveTo(roi.x+roi.size/2-10, roi.y+roi.size/2);
      ctx.lineTo(roi.x+roi.size/2+10, roi.y+roi.size/2);
      ctx.moveTo(roi.x+roi.size/2, roi.y+roi.size/2-10);
      ctx.lineTo(roi.x+roi.size/2, roi.y+roi.size/2+10);
      ctx.strokeStyle='rgba(52,152,219,0.96)';
      ctx.lineWidth=1.5; ctx.stroke();
      // resize handle
      ctx.fillStyle='rgba(255,255,255,0.96)';
      ctx.strokeStyle='rgba(52,152,219,0.96)';
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.rect(roi.x+roi.size-9, roi.y+roi.size-9, 14, 14);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      sizeVal.textContent=Math.round(roi.size)+' px';
    }

    var dragMode=null, dragStart=null, roiStart=null;
    function eventToImage(e){
      var rect=leftCanvas.getBoundingClientRect();
      return {
        x: (e.clientX-rect.left) * (leftCanvas.width/rect.width),
        y: (e.clientY-rect.top) * (leftCanvas.height/rect.height)
      };
    }
    function pointerDown(e){
      e.preventDefault();
      var p=eventToImage(e);
      var hx=roi.x+roi.size, hy=roi.y+roi.size;
      var nearHandle=Math.abs(p.x-hx)<=18 && Math.abs(p.y-hy)<=18;
      var inside=(p.x>=roi.x && p.x<=roi.x+roi.size && p.y>=roi.y && p.y<=roi.y+roi.size);
      if(!nearHandle && !inside) return;
      dragMode=nearHandle?'resize':'move';
      dragStart={x:p.x,y:p.y};
      roiStart={x:roi.x,y:roi.y,size:roi.size};
      try{ leftCanvas.setPointerCapture(e.pointerId); }catch(err){}
    }
    function pointerMove(e){
      if(!dragMode) return;
      e.preventDefault();
      var p=eventToImage(e);
      if(dragMode==='move'){
        roi.x = clamp(roiStart.x + (p.x-dragStart.x), 0, base.width-roi.size);
        roi.y = clamp(roiStart.y + (p.y-dragStart.y), 0, base.height-roi.size);
      } else {
        var ns = clamp(Math.max(p.x-roiStart.x, p.y-roiStart.y), 48, Math.min(base.width-roiStart.x, base.height-roiStart.y));
        roi.size = ns;
        roi.x = clamp(roiStart.x, 0, base.width-roi.size);
        roi.y = clamp(roiStart.y, 0, base.height-roi.size);
        sizeRange.value = Math.round(roi.size);
      }
      drawLeft();
      scheduleRender();
    }
    function pointerUp(e){
      dragMode=null; dragStart=null; roiStart=null;
      try{ leftCanvas.releasePointerCapture(e.pointerId); }catch(err){}
    }
    leftCanvas.addEventListener('pointerdown', pointerDown, {passive:false});
    leftCanvas.addEventListener('pointermove', pointerMove, {passive:false});
    leftCanvas.addEventListener('pointerup', pointerUp, {passive:false});
    leftCanvas.addEventListener('pointercancel', pointerUp, {passive:false});

    bar.appendChild(btn('Detectar agora','background:#b91c1c;', function(){ renderDetection(); }));
    bar.appendChild(btn('Centralizar ROI','background:rgba(255,255,255,.13);', function(){ roi.x=Math.round((base.width-roi.size)/2); roi.y=Math.round((base.height-roi.size)*0.58); drawLeft(); renderDetection(); }));
    bar.appendChild(btn('Salvar no portfólio','background:#16a34a;', function(){ var u=(rightImg&&rightImg._url)||rightImg.src; try{ if(typeof portfolioAddItem==='function'){ portfolioAddItem('Lesão periapical (ROI manual)',u,'Imagem derivada · ROI apical com detecção heurística de hipodensidade · '+new Date().toLocaleTimeString('pt-BR'),{},''); } }catch(e){} if(ov.parentNode)ov.parentNode.removeChild(ov); }));
    bar.appendChild(btn('Fechar','background:rgba(255,255,255,.13);', function(){ if(ov.parentNode)ov.parentNode.removeChild(ov); }));

    ov.appendChild(closeX);
    ov.appendChild(title);
    ov.appendChild(sub);
    ov.appendChild(wrap);
    ov.appendChild(ctr);
    ov.appendChild(bar);
    document.body.appendChild(ov);

    drawLeft();
    renderDetection();
  }

  window.endoPeriapicalLesion=function(){
    try{
      var src=pickCanvas();
      if(!src){ alert('Abra um corte no Endo antes de usar Lesão periapical.'); return; }
      var base=capture(src, isIOS()?820:980);
      showPeriapicalModal(base);
    }catch(e){
      console.error('[Lesão periapical v2 ROI]', e);
      alert('Falha na ferramenta Lesão periapical: '+(e&&e.message?e.message:e));
    }
  };
})();
