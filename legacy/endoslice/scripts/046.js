
/* Lesão periapical v3 — ROI manual compacto + detecção mais direta por hipodensidade circular.
   Substitui a função anterior sem mexer em ZIP, MPR, MAR, 3D, volumeData ou demais ferramentas. */
(function(){
  if(window._endoPeriapicalV3Override)return; window._endoPeriapicalV3Override=true;

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lerp(a,b,t){ return a+(b-a)*t; }

  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function pickCanvas(){
    var active=document.querySelector('.module-tab.active') || document;
    var ids=['endo-focus-viewport','endo-axial','endo-coronal','endo-sagittal','axial-viewport','modal-viewport'];
    var cands=[];
    for(var k=0;k<ids.length;k++){
      var el=document.getElementById(ids[k]); if(!el)continue;
      var cv=el.querySelector('canvas:not([data-ov])') || el.querySelector('canvas'); if(!cv)continue;
      var r=cv.getBoundingClientRect();
      if(r.width>20 && r.height>20)cands.push({cv:cv,area:r.width*r.height,active:active.contains(cv)?1:0});
    }
    var cvs=active.querySelectorAll?active.querySelectorAll('canvas'):[];
    for(var i=0;i<cvs.length;i++){
      var cv2=cvs[i]; if(cv2.getAttribute('data-ov'))continue;
      var rr=cv2.getBoundingClientRect();
      if(rr.width>20 && rr.height>20)cands.push({cv:cv2,area:rr.width*rr.height,active:1});
    }
    if(!cands.length){
      cvs=document.querySelectorAll('canvas');
      for(i=0;i<cvs.length;i++){
        cv2=cvs[i]; if(cv2.getAttribute('data-ov'))continue;
        rr=cv2.getBoundingClientRect();
        if(rr.width>20 && rr.height>20)cands.push({cv:cv2,area:rr.width*rr.height,active:0});
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
    cx.imageSmoothingEnabled=true;
    cx.imageSmoothingQuality='high';
    cx.drawImage(src,0,0,w,h);
    var id=cx.getImageData(0,0,w,h), d=id.data, n=w*h;
    var gray=new Uint8Array(n);
    for(var i=0,p=0;i<n;i++,p+=4){
      gray[i]=(d[p]*0.299+d[p+1]*0.587+d[p+2]*0.114+0.5)|0;
    }
    return {canvas:cv,width:w,height:h,gray:gray};
  }

  function histStats(gray){
    var hist=new Uint32Array(256);
    for(var i=0;i<gray.length;i++)hist[gray[i]]++;
    function pct(p){
      var target=gray.length*p/100, acc=0;
      for(var v=0;v<256;v++){acc+=hist[v]; if(acc>=target)return v;}
      return 255;
    }
    return {
      p05:pct(5),p10:pct(10),p15:pct(15),p20:pct(20),p25:pct(25),p30:pct(30),
      p35:pct(35),p40:pct(40),p45:pct(45),p50:pct(50),p55:pct(55),p60:pct(60),
      p70:pct(70),p75:pct(75),p80:pct(80),p85:pct(85),p90:pct(90),p95:pct(95)
    };
  }

  function blurBox(src,w,h,rad){
    var out=new Float32Array(src.length);
    for(var y=0;y<h;y++){
      var y0=Math.max(0,y-rad), y1=Math.min(h-1,y+rad);
      for(var x=0;x<w;x++){
        var x0=Math.max(0,x-rad), x1=Math.min(w-1,x+rad);
        var s=0,c=0;
        for(var yy=y0;yy<=y1;yy++){
          var off=yy*w;
          for(var xx=x0;xx<=x1;xx++){s+=src[off+xx];c++;}
        }
        out[y*w+x]=s/c;
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
              if(cur[off+xx]){on=1;break;}
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

  function closeMorph(mask,w,h,r){return erode(dilate(mask,w,h,r),w,h,r);}
  function openMorph(mask,w,h,r){return dilate(erode(mask,w,h,r),w,h,r);}

  function extractROI(base,roi){
    var size=Math.round(clamp(roi.size,32,Math.min(base.width,base.height)));
    var x0=Math.round(clamp(roi.x,0,base.width-size));
    var y0=Math.round(clamp(roi.y,0,base.height-size));
    var gray=new Uint8Array(size*size);
    for(var y=0;y<size;y++){
      var srcOff=(y0+y)*base.width+x0;
      var dstOff=y*size;
      for(var x=0;x<size;x++)gray[dstOff+x]=base.gray[srcOff+x];
    }
    return {x:x0,y:y0,size:size,w:size,h:size,gray:gray};
  }

  function components(mask,w,h,gray,wide,stats,vals){
    var n=mask.length, visited=new Uint8Array(n), stack=new Int32Array(n), list=[];
    var minArea=Math.max(8,Math.round(n*0.004));
    var maxArea=Math.max(minArea+8,Math.round(n*0.58));
    var cx0=w/2, cy0=h/2, maxD=Math.sqrt(cx0*cx0+cy0*cy0);
    for(var s=0;s<n;s++){
      if(!mask[s]||visited[s])continue;
      var top=0, area=0, sx=0, sy=0, dark=0, def=0, minx=w, miny=h, maxx=0, maxy=0, per=0, edgeTouch=0;
      visited[s]=1; stack[top++]=s;
      while(top){
        var idx=stack[--top], y=(idx/w)|0, x=idx-y*w;
        area++; sx+=x; sy+=y; dark+=255-gray[idx]; def+=Math.max(0,wide[idx]-gray[idx]);
        if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
        if(x===0||y===0||x===w-1||y===h-1)edgeTouch=1;
        var nb;
        if(x>0){nb=idx-1;if(mask[nb]&&!visited[nb]){visited[nb]=1;stack[top++]=nb;}else if(!mask[nb])per++;}
        else per++;
        if(x<w-1){nb=idx+1;if(mask[nb]&&!visited[nb]){visited[nb]=1;stack[top++]=nb;}else if(!mask[nb])per++;}
        else per++;
        if(y>0){nb=idx-w;if(mask[nb]&&!visited[nb]){visited[nb]=1;stack[top++]=nb;}else if(!mask[nb])per++;}
        else per++;
        if(y<h-1){nb=idx+w;if(mask[nb]&&!visited[nb]){visited[nb]=1;stack[top++]=nb;}else if(!mask[nb])per++;}
        else per++;
      }
      if(area<minArea || area>maxArea)continue;
      var bw=maxx-minx+1, bh=maxy-miny+1;
      if(bw<3||bh<3)continue;
      var fill=area/(bw*bh);
      if(fill<0.10)continue;
      var ratio=Math.min(bw,bh)/Math.max(bw,bh);
      var circ=(4*Math.PI*area)/Math.max(1,per*per);
      circ=clamp(circ,0,1.2);
      var circBlend=clamp(circ*0.72+ratio*0.28,0,1);
      var circNeed=lerp(0.10,0.62,(vals.circularity||50)/100);
      if(circBlend<circNeed)continue;
      var cx=sx/area, cy=sy/area;
      var center=1-clamp(Math.sqrt((cx-cx0)*(cx-cx0)+(cy-cy0)*(cy-cy0))/Math.max(1,maxD),0,1);

      var ringPad=Math.max(4,Math.round(Math.max(bw,bh)*0.75));
      var x0=Math.max(0,minx-ringPad), x1=Math.min(w-1,maxx+ringPad), y0=Math.max(0,miny-ringPad), y1=Math.min(h-1,maxy+ringPad);
      var innerSum=0, innerN=0, ringSum=0, ringN=0;
      var rx=Math.max(1,bw/2), ry=Math.max(1,bh/2);
      for(var yy=y0;yy<=y1;yy++){
        var off=yy*w;
        for(var xx=x0;xx<=x1;xx++){
          var dx=(xx-cx)/rx, dy=(yy-cy)/ry, e=dx*dx+dy*dy, ii=off+xx;
          if(e<=1.05){innerSum+=gray[ii];innerN++;}
          else if(e<=2.65){ringSum+=gray[ii];ringN++;}
        }
      }
      var inner=innerN?innerSum/innerN:0, ring=ringN?ringSum/ringN:0;
      var ringContrast=clamp((ring-inner)/55,0,1.5);
      var darkness=clamp(((dark/area)-70)/105,0,1.4);
      var deficit=clamp(((def/area)-4)/35,0,1.4);
      var score=darkness*1.20+deficit*1.10+ringContrast*1.70+circBlend*1.20+center*0.82+fill*0.35;
      if(edgeTouch)score*=0.72;
      list.push({area:area,x:cx,y:cy,bbox:[minx,miny,maxx,maxy],circularity:circBlend,ringContrast:ringContrast,darkness:darkness,deficit:deficit,center:center,score:score,edgeTouch:edgeTouch});
    }
    list.sort(function(a,b){return b.score-a.score;});
    return list;
  }

  function detectInROI(roiData,vals){
    var w=roiData.w,h=roiData.h,gray=roiData.gray,n=gray.length,stats=histStats(gray);
    var f32=new Float32Array(n);
    for(var i=0;i<n;i++)f32[i]=gray[i];
    var wide=blurBox(blurBox(f32,w,h,3),w,h,3);
    var sensitivity=clamp(vals.sensitivity||66,0,100);
    var contrast=clamp(vals.boneContrast||60,0,100);

    var thr=lerp(stats.p18,stats.p50,sensitivity/100);
    var defNeed=lerp(20,3,contrast/100);
    var mask=new Uint8Array(n);

    for(i=0;i<n;i++){
      var g=gray[i], def=wide[i]-g;
      if(g <= thr && def >= defNeed)mask[i]=1;
    }
    mask=closeMorph(mask,w,h,1);
    mask=openMorph(mask,w,h,1);

    var comps=components(mask,w,h,gray,wide,stats,vals);

    // fallback mais permissivo: escolhe área preta/cinza escura circular dentro do ROI.
    if(!comps.length){
      var mask2=new Uint8Array(n);
      var thr2=lerp(stats.p25,stats.p58,sensitivity/100);
      for(i=0;i<n;i++){
        if(gray[i] <= thr2)mask2[i]=1;
      }
      mask2=closeMorph(mask2,w,h,1);
      comps=components(mask2,w,h,gray,wide,stats,{sensitivity:sensitivity,boneContrast:contrast,circularity:Math.max(0,(vals.circularity||50)-18)});
      mask=mask2;
    }

    var best=comps.length?comps[0]:null;
    var finalMask=new Uint8Array(n);

    if(best){
      var bx0=Math.max(0,best.bbox[0]-2), by0=Math.max(0,best.bbox[1]-2), bx1=Math.min(w-1,best.bbox[2]+2), by1=Math.min(h-1,best.bbox[3]+2);
      var growThr=lerp(stats.p28,stats.p60,sensitivity/100);
      var growDef=lerp(16,2,contrast/100);
      var rx=Math.max(2,(best.bbox[2]-best.bbox[0]+1)*0.58), ry=Math.max(2,(best.bbox[3]-best.bbox[1]+1)*0.58);
      for(var y=by0;y<=by1;y++){
        var off=y*w;
        for(var x=bx0;x<=bx1;x++){
          var ii=off+x;
          var dx=(x-best.x)/rx, dy=(y-best.y)/ry, e=dx*dx+dy*dy;
          if(e<=1.35 && gray[ii]<=growThr && (wide[ii]-gray[ii])>=growDef)finalMask[ii]=1;
        }
      }
      if(finalMask.reduce){
        // nothing, just keeps old browsers safe below
      }
      var count=0; for(i=0;i<finalMask.length;i++)if(finalMask[i])count++;
      if(count<6){
        for(y=by0;y<=by1;y++){
          off=y*w;
          for(x=bx0;x<=bx1;x++){
            ii=off+x;
            dx=(x-best.x)/rx; dy=(y-best.y)/ry; e=dx*dx+dy*dy;
            if(e<=1.15 && gray[ii]<=lerp(stats.p35,stats.p62,sensitivity/100))finalMask[ii]=1;
          }
        }
      }
      finalMask=closeMorph(finalMask,w,h,1);
      var exp=Math.max(0,Math.round((vals.expand||12)/18));
      if(exp>0)finalMask=dilate(finalMask,w,h,exp);
    }
    return {roi:roiData,mask:finalMask,best:best,components:comps,stats:stats};
  }

  function drawMaskContour(ctx,mask,w,h,ox,oy){
    ctx.save();
    ctx.fillStyle='rgba(110,0,32,0.98)';
    for(var y=0;y<h;y++){
      var off=y*w;
      for(var x=0;x<w;x++){
        var i=off+x;
        if(!mask[i])continue;
        var edge=(x===0||!mask[i-1]||x===w-1||!mask[i+1]||y===0||!mask[i-w]||y===h-1||!mask[i+w]);
        if(edge)ctx.fillRect(ox+x-0.5,oy+y-0.5,2,2);
      }
    }
    ctx.restore();
  }

  function renderResult(base,analysis,roi,vals){
    var out=document.createElement('canvas');out.width=base.width;out.height=base.height;
    var ctx=out.getContext('2d');
    ctx.drawImage(base.canvas,0,0);
    var x0=analysis.roi.x,y0=analysis.roi.y,w=analysis.roi.w,h=analysis.roi.h,mask=analysis.mask;

    ctx.save();
    ctx.strokeStyle='rgba(52,152,219,0.72)';
    ctx.lineWidth=1.8;
    ctx.setLineDash([7,5]);
    ctx.strokeRect(x0+0.5,y0+0.5,w,h);
    ctx.restore();

    if(analysis.best){
      var img=ctx.getImageData(x0,y0,w,h),d=img.data;
      var alpha=clamp((vals.fillOpacity||64)/100,0.18,0.88);
      for(var i=0;i<mask.length;i++){
        if(!mask[i])continue;
        var p=i*4;
        d[p]=Math.round(d[p]*(1-alpha)+235*alpha);
        d[p+1]=Math.round(d[p+1]*(1-alpha)+20*alpha);
        d[p+2]=Math.round(d[p+2]*(1-alpha)+45*alpha);
      }
      ctx.putImageData(img,x0,y0);
      drawMaskContour(ctx,mask,w,h,x0,y0);
    }
    return out;
  }

  function fitCanvasToBox(canvas, box, base){
    canvas.width=base.width; canvas.height=base.height;
    canvas.style.maxWidth='100%';
    canvas.style.maxHeight='100%';
  }

  window.endoPeriapicalLesion=function(){
    try{
      var src=pickCanvas();
      if(!src){alert('Abra um corte antes de usar Lesão periapical.');return;}
      var base=capture(src,isIOS()?820:980);

      var old=document.querySelector('.endo-peri-v3-modal');
      if(old&&old.parentNode)old.parentNode.removeChild(old);

      var ov=document.createElement('div');
      ov.className='endo-peri-v3-modal';
      ov.style.cssText='position:fixed;inset:0;z-index:2147483605;background:rgba(0,0,0,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;';

      var closeX=document.createElement('button');
      closeX.type='button';closeX.textContent='×';
      closeX.style.cssText='position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,24,32,.88);color:#EAF2FF;font:900 28px/1 -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483607;box-shadow:0 8px 22px rgba(0,0,0,.55);cursor:pointer;';
      closeX.onclick=function(){if(ov.parentNode)ov.parentNode.removeChild(ov);};
      closeX.addEventListener('touchend',function(e){e.preventDefault();e.stopPropagation();if(ov.parentNode)ov.parentNode.removeChild(ov);},{passive:false});

      var title=document.createElement('div');
      title.textContent='Lesão periapical · ROI manual no ápice';
      title.style.cssText='color:#EAF2FF;font:900 13px -apple-system,sans-serif;text-align:center;letter-spacing:.3px;padding-right:54px;';

      var sub=document.createElement('div');
      sub.style.cssText='color:#a9bbcf;font:700 10px -apple-system,sans-serif;text-align:center;max-width:min(880px,94vw);line-height:1.35;';
      sub.textContent='Arraste o quadrado sobre o ápice. A heurística detecta somente a hipodensidade circular dentro do ROI e pinta a área em vermelho com contorno vinho.';

      var panels=document.createElement('div');panels.className='endo-peri-v3-panels';

      var p1=document.createElement('div');p1.className='endo-peri-v3-panel';
      var l1=document.createElement('div');l1.className='endo-peri-v3-label';l1.textContent='1 · POSICIONE O ROI';
      var vp1=document.createElement('div');vp1.className='endo-peri-v3-vp';
      var work=document.createElement('canvas');fitCanvasToBox(work,vp1,base);vp1.appendChild(work);p1.appendChild(l1);p1.appendChild(vp1);

      var p2=document.createElement('div');p2.className='endo-peri-v3-panel';
      var l2=document.createElement('div');l2.className='endo-peri-v3-label';l2.textContent='2 · DETECÇÃO DA LESÃO';
      var vp2=document.createElement('div');vp2.className='endo-peri-v3-vp';
      var result=document.createElement('img');vp2.appendChild(result);p2.appendChild(l2);p2.appendChild(vp2);

      panels.appendChild(p1);panels.appendChild(p2);

      var controls=document.createElement('div');controls.className='endo-peri-v3-controls';
      var summary=document.createElement('div');
      summary.style.cssText='color:#EAF2FF;font:800 10px/1.45 -apple-system,sans-serif;';
      controls.appendChild(summary);

      var vals={sensitivity:72,boneContrast:64,circularity:42,expand:10,fillOpacity:66};
      var roi={size:Math.round(clamp(Math.min(base.width,base.height)*0.21,54,170)),x:Math.round(base.width*0.39),y:Math.round(base.height*0.50)};
      roi.x=clamp(roi.x,0,base.width-roi.size);roi.y=clamp(roi.y,0,base.height-roi.size);

      function row(label,min,max,step,key,color){
        var r=document.createElement('div');r.className='endo-peri-v3-row';
        var sp=document.createElement('span');sp.textContent=label;
        var inp=document.createElement('input');inp.type='range';inp.min=min;inp.max=max;inp.step=step;inp.value=vals[key];inp.style.accentColor=color;
        var val=document.createElement('span');val.textContent=vals[key];val.style.cssText='min-width:38px;text-align:right;color:#fff;font-weight:900;';
        inp.addEventListener('input',function(){vals[key]=+inp.value;val.textContent=inp.value;schedule();});
        r.appendChild(sp);r.appendChild(inp);r.appendChild(val);controls.appendChild(r);
      }
      row('Sensibilidade',0,100,1,'sensitivity','#ef4444');
      row('Contraste lesão/osso',0,100,1,'boneContrast','#f59e0b');
      row('Circularidade',0,100,1,'circularity','#8b5cf6');
      row('Expandir máscara',0,40,1,'expand','#22c55e');
      row('Opacidade vermelho',20,88,1,'fillOpacity','#dc2626');

      var sizeRow=document.createElement('div');sizeRow.className='endo-peri-v3-row';
      var sLab=document.createElement('span');sLab.textContent='Tamanho do ROI';
      var sInp=document.createElement('input');sInp.type='range';sInp.min=42;sInp.max=Math.round(Math.min(base.width,base.height)*0.50);sInp.step=1;sInp.value=roi.size;sInp.style.accentColor='#3b82f6';
      var sVal=document.createElement('span');sVal.textContent=roi.size+' px';sVal.style.cssText='min-width:56px;text-align:right;color:#fff;font-weight:900;';
      sInp.addEventListener('input',function(){roi.size=+sInp.value;roi.x=clamp(roi.x,0,base.width-roi.size);roi.y=clamp(roi.y,0,base.height-roi.size);sVal.textContent=Math.round(roi.size)+' px';drawWork();schedule();});
      sizeRow.appendChild(sLab);sizeRow.appendChild(sInp);sizeRow.appendChild(sVal);controls.appendChild(sizeRow);

      var bar=document.createElement('div');bar.className='endo-peri-v3-bar';
      function btn(txt,css,fn){var b=document.createElement('button');b.textContent=txt;b.style.cssText=css;b.onclick=fn;b.addEventListener('touchend',function(e){e.preventDefault();fn();},{passive:false});return b;}
      bar.appendChild(btn('Detectar agora','background:#b91c1c;',function(){renderNow();}));
      bar.appendChild(btn('ROI menor','background:rgba(255,255,255,.13);',function(){roi.size=clamp(roi.size*0.82,42,Math.min(base.width,base.height));roi.x=clamp(roi.x,0,base.width-roi.size);roi.y=clamp(roi.y,0,base.height-roi.size);sInp.value=Math.round(roi.size);sVal.textContent=Math.round(roi.size)+' px';drawWork();renderNow();}));
      bar.appendChild(btn('Salvar','background:#16a34a;',function(){try{if(typeof portfolioAddItem==='function'){portfolioAddItem('Lesão periapical (ROI manual)',result._url||result.src,'Imagem derivada · ROI apical com hipodensidade pintada em vermelho · '+new Date().toLocaleTimeString('pt-BR'),{},'');}}catch(e){}if(ov.parentNode)ov.parentNode.removeChild(ov);}));
      bar.appendChild(btn('Fechar','background:rgba(255,255,255,.13);',function(){if(ov.parentNode)ov.parentNode.removeChild(ov);}));
      controls.appendChild(bar);

      ov.appendChild(closeX);ov.appendChild(title);ov.appendChild(sub);ov.appendChild(panels);ov.appendChild(controls);
      document.body.appendChild(ov);

      function drawWork(){
        var ctx=work.getContext('2d');
        ctx.clearRect(0,0,work.width,work.height);
        ctx.drawImage(base.canvas,0,0);
        ctx.save();
        ctx.fillStyle='rgba(52,152,219,0.10)';
        ctx.fillRect(roi.x,roi.y,roi.size,roi.size);
        ctx.strokeStyle='rgba(52,152,219,0.95)';
        ctx.lineWidth=2.4;
        ctx.setLineDash([8,6]);
        ctx.strokeRect(roi.x+0.5,roi.y+0.5,roi.size,roi.size);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(roi.x+roi.size/2-10,roi.y+roi.size/2);
        ctx.lineTo(roi.x+roi.size/2+10,roi.y+roi.size/2);
        ctx.moveTo(roi.x+roi.size/2,roi.y+roi.size/2-10);
        ctx.lineTo(roi.x+roi.size/2,roi.y+roi.size/2+10);
        ctx.strokeStyle='rgba(52,152,219,0.96)';
        ctx.lineWidth=1.6;ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,0.96)';
        ctx.strokeStyle='rgba(52,152,219,0.96)';
        ctx.lineWidth=2;
        ctx.fillRect(roi.x+roi.size-9,roi.y+roi.size-9,15,15);
        ctx.strokeRect(roi.x+roi.size-9,roi.y+roi.size-9,15,15);
        ctx.restore();
      }

      var timer=null;
      function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(renderNow,90);}
      function renderNow(){
        var roiData=extractROI(base,roi);
        var det=detectInROI(roiData,vals);
        var cv=renderResult(base,det,roi,vals);
        var url=cv.toDataURL('image/png');
        result.src=url;result._url=url;
        if(det.best){
          summary.innerHTML='Candidato no ROI: <b>'+det.best.area+' px</b> · circularidade <b>'+det.best.circularity.toFixed(2)+'</b> · contraste lesão/osso <b>'+det.best.ringContrast.toFixed(2)+'</b> · score <b>'+det.best.score.toFixed(2)+'</b>.';
        }else{
          summary.innerHTML='Nenhuma hipodensidade circular forte no ROI atual. Reposicione o quadrado sobre o ápice ou aumente sensibilidade/contraste.';
        }
      }

      function evPoint(e){
        var r=work.getBoundingClientRect();
        return {x:(e.clientX-r.left)*(work.width/r.width),y:(e.clientY-r.top)*(work.height/r.height)};
      }
      var mode=null,start=null,roi0=null;
      work.addEventListener('pointerdown',function(e){
        e.preventDefault();
        var p=evPoint(e), hx=roi.x+roi.size, hy=roi.y+roi.size;
        var inside=p.x>=roi.x&&p.x<=roi.x+roi.size&&p.y>=roi.y&&p.y<=roi.y+roi.size;
        var handle=Math.abs(p.x-hx)<22&&Math.abs(p.y-hy)<22;
        if(!inside&&!handle)return;
        mode=handle?'resize':'move';start=p;roi0={x:roi.x,y:roi.y,size:roi.size};
        try{work.setPointerCapture(e.pointerId);}catch(err){}
      },{passive:false});
      work.addEventListener('pointermove',function(e){
        if(!mode)return;
        e.preventDefault();
        var p=evPoint(e);
        if(mode==='move'){
          roi.x=clamp(roi0.x+p.x-start.x,0,base.width-roi.size);
          roi.y=clamp(roi0.y+p.y-start.y,0,base.height-roi.size);
        }else{
          var ns=clamp(Math.max(p.x-roi0.x,p.y-roi0.y),42,Math.min(base.width-roi0.x,base.height-roi0.y));
          roi.size=ns;sInp.value=Math.round(roi.size);sVal.textContent=Math.round(roi.size)+' px';
        }
        drawWork();schedule();
      },{passive:false});
      function up(e){mode=null;start=null;roi0=null;try{work.releasePointerCapture(e.pointerId);}catch(err){}}
      work.addEventListener('pointerup',up,{passive:false});
      work.addEventListener('pointercancel',up,{passive:false});

      drawWork();
      renderNow();
    }catch(e){
      console.error('[Lesão periapical v3]',e);
      alert('Falha na ferramenta Lesão periapical: '+(e&&e.message?e.message:e));
    }
  };
})();
