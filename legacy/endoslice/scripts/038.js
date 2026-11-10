
/* ==========================================================
   ANR — Active Noise Reduction
   ----------------------------------------------------------
   Redução ativa de ruído/granulação para cortes Endo.
   Camada pós-renderização, igual ao SuperRes:
   - NÃO altera volumeData
   - NÃO altera DICOM original
   - NÃO altera stack Cornerstone
   - NÃO mexe em ZIP/RAR/MPR/Oblíquo/3D/Medidas
   - Atua apenas sobre o canvas visível e mostra modal Antes/Depois
   ========================================================== */
(function(){
  if (window._endoANRInstalled) return;
  window._endoANRInstalled = true;

  function clamp(v,a,b){
    return v < a ? a : (v > b ? b : v);
  }

  function smooth01(t){
    t = clamp(t,0,1);
    return t*t*(3 - 2*t);
  }

  function pickCanvas(){
    var cands = [];

    [
      'endo-focus-viewport',
      'endo-axial',
      'endo-coronal',
      'endo-sagittal',
      'axial-viewport',
      'modal-viewport'
    ].forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;

      var cv =
        el.querySelector('canvas:not([data-ov])') ||
        el.querySelector('canvas');

      if (!cv) return;

      var r = cv.getBoundingClientRect();

      if (r.width > 10 && r.height > 10) {
        cands.push({
          cv: cv,
          area: r.width * r.height
        });
      }
    });

    if (!cands.length) {
      var tab = document.getElementById('tab-endo') || document;

      tab.querySelectorAll('canvas:not([data-ov])').forEach(function(cv){
        var r = cv.getBoundingClientRect();

        if (r.width > 10 && r.height > 10) {
          cands.push({
            cv: cv,
            area: r.width * r.height
          });
        }
      });
    }

    if (!cands.length) return null;

    cands.sort(function(a,b){
      return b.area - a.area;
    });

    return cands[0].cv;
  }

  function box3(src,w,h){
    var out = new Float32Array(src.length);

    for (var y=0; y<h; y++) {
      for (var x=0; x<w; x++) {
        var s = 0;

        for (var dy=-1; dy<=1; dy++) {
          var yy = y + dy;

          if (yy < 0) yy = 0;
          else if (yy >= h) yy = h - 1;

          for (var dx=-1; dx<=1; dx++) {
            var xx = x + dx;

            if (xx < 0) xx = 0;
            else if (xx >= w) xx = w - 1;

            s += src[yy*w + xx];
          }
        }

        out[y*w + x] = s / 9;
      }
    }

    return out;
  }

function renderANRFromBase(base, ww, wh, amount, detailAmount){
    var bd = base.data;
    var n = ww * wh;

    var L0 = new Float32Array(n);
    var L2 = new Float32Array(n);

    for (var i = 0, p = 0; i < n; i++, p += 4) {
        var l = bd[p] * 0.299 + bd[p + 1] * 0.587 + bd[p + 2] * 0.114;
        L0[i] = l;
        L2[i] = l * l;
    }

    var B1 = box3(L0, ww, wh);
    var B2 = box3(B1, ww, wh);
    var B3 = box3(B2, ww, wh);

    var M2 = box3(L2, ww, wh);

    var outCanvas = document.createElement('canvas');
    outCanvas.width = ww;
    outCanvas.height = wh;

    var ctx = outCanvas.getContext('2d');
    var out = ctx.createImageData(ww, wh);
    var od = out.data;

    var a = clamp(amount / 100, 0, 1);
    var d = clamp(detailAmount / 100, 0, 1);

    for (var j = 0, q = 0; j < n; j++, q += 4) {
        var l0 = L0[j];

        var fine = l0 - B1[j];
        var mid = B1[j] - B2[j];
        var coarse = B2[j] - B3[j];

        var localVar = M2[j] - B1[j] * B1[j];
        if (localVar < 0) localVar = 0;

        var localStd = Math.sqrt(localVar);

        /*
          Proteções clínicas:
          - bordas reais / cortical / interface radicular
          - canal / lâmina dura
          - altas densidades (metal / guta / restaurações)
          - regiões muito escuras
        */
        var edgeScore =
            Math.abs(fine) * 0.65 +
            Math.abs(mid) * 0.95 +
            Math.abs(coarse) * 0.40;

        var varianceProtect = smooth01((localStd - 4.5) / 22.0);
        var edgeProtect = smooth01(edgeScore / 18.0);
        var brightProtect = smooth01((l0 - 214.0) / 24.0);
        var darkProtect = smooth01((22.0 - l0) / 20.0) * 0.42;

        var protect = Math.max(
            varianceProtect,
            edgeProtect,
            brightProtect,
            darkProtect
        );

        /*
          Redução de ruído:
          mais forte que a versão anterior,
          porém ainda guiada por máscara para não “lavar”.
        */
        var noiseTarget =
            B1[j] * 0.58 +
            B2[j] * 0.28 +
            B3[j] * 0.14;

        var noiseMask = 1.0 - protect;

        var reduction = a * 1.08 * noiseMask;
        reduction = clamp(reduction, 0, 0.96);

        var denoised = l0 + (noiseTarget - l0) * reduction;

        /*
          Definição:
          devolve microdetalhe e detalhe médio
          preferencialmente onde há estrutura real.
        */
        var structureMask = Math.max(
            protect,
            smooth01((edgeScore - 4.0) / 18.0)
        );

        var fineGain = d * (0.18 + structureMask * 0.46);
        var midGain = d * (0.06 + structureMask * 0.18);

        var v = denoised;
        v += fine * fineGain;
        v += mid * midGain;

        /*
          Pequeno realce de contraste local em áreas estruturais
          para deixar o resultado mais “bonito” e definido,
          sem virar sharpen agressivo.
        */
        var localContrast = (B1[j] - B3[j]);
        v += localContrast * d * structureMask * 0.06;

        /*
          Proteção extra contra oversharpen e halo
        */
        if (brightProtect > 0.55) {
            v -= Math.max(0, fine) * d * 0.08;
        }

        v = clamp(v, 0, 255);

        var ratio = v / Math.max(1, l0);

        od[q]     = clamp(bd[q]     * ratio, 0, 255);
        od[q + 1] = clamp(bd[q + 1] * ratio, 0, 255);
        od[q + 2] = clamp(bd[q + 2] * ratio, 0, 255);
        od[q + 3] = bd[q + 3];
    }

    ctx.putImageData(out, 0, 0);

    return outCanvas.toDataURL('image/jpeg', 0.94);
}

  function makeImageColumn(label, url, isAfter){
    var col = document.createElement('div');

    col.style.cssText =
      'flex:1;min-width:min(320px,46vw);max-width:48%;text-align:center;';

    var title = document.createElement('div');

    title.textContent = label;
    title.style.cssText =
      'color:#EAF2FF;font:900 14px -apple-system,BlinkMacSystemFont,sans-serif;' +
      'margin-bottom:8px;letter-spacing:1.2px;text-shadow:0 2px 8px rgba(0,0,0,.8);';

    var vp = document.createElement('div');

    vp.style.cssText =
      'overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.16);' +
      'background:#000;touch-action:none;height:58vh;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 12px 28px rgba(0,0,0,.55);';

    var img = document.createElement('img');

    img.src = url;
    img.draggable = false;
    img.style.cssText =
      'max-width:100%;max-height:58vh;display:block;touch-action:none;user-select:none;-webkit-user-select:none;';

    vp.appendChild(img);
    col.appendChild(title);
    col.appendChild(vp);

    if (isAfter) col._img = img;

    return col;
  }

  function installModalPanZoom(vp, img){
    var st = {
      scale: 1,
      tx: 0,
      ty: 0,
      dragging: false,
      x: 0,
      y: 0,
      lastDist: 0
    };

    function apply(){
      img.style.transform =
        'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')';
      img.style.transformOrigin = 'center center';
    }

    vp.addEventListener('wheel', function(e){
      e.preventDefault();

      var delta = e.deltaY < 0 ? 1.08 : 0.92;
      st.scale = clamp(st.scale * delta, 0.5, 8);

      apply();
    }, { passive:false });

    vp.addEventListener('mousedown', function(e){
      st.dragging = true;
      st.x = e.clientX;
      st.y = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', function(e){
      if (!st.dragging) return;

      st.tx += e.clientX - st.x;
      st.ty += e.clientY - st.y;
      st.x = e.clientX;
      st.y = e.clientY;

      apply();
    });

    window.addEventListener('mouseup', function(){
      st.dragging = false;
    });

    vp.addEventListener('touchstart', function(e){
      if (e.touches.length === 1) {
        st.dragging = true;
        st.x = e.touches[0].clientX;
        st.y = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        st.dragging = false;

        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;

        st.lastDist = Math.sqrt(dx*dx + dy*dy);
      }

      e.preventDefault();
    }, { passive:false });

    vp.addEventListener('touchmove', function(e){
      if (e.touches.length === 1 && st.dragging) {
        st.tx += e.touches[0].clientX - st.x;
        st.ty += e.touches[0].clientY - st.y;
        st.x = e.touches[0].clientX;
        st.y = e.touches[0].clientY;

        apply();
      } else if (e.touches.length === 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        var d = Math.sqrt(dx*dx + dy*dy);

        if (st.lastDist > 0) {
          st.scale = clamp(st.scale * (d / st.lastDist), 0.5, 8);
          apply();
        }

        st.lastDist = d;
      }

      e.preventDefault();
    }, { passive:false });

    vp.addEventListener('touchend', function(e){
      if (e.touches.length === 0) {
        st.dragging = false;
        st.lastDist = 0;
      }

      e.preventDefault();
    }, { passive:false });

    return {
      reset: function(){
        st.scale = 1;
        st.tx = 0;
        st.ty = 0;
        apply();
      }
    };
  }

  window.endoANR = function(){
    try {
      var src = pickCanvas();

      if (!src) {
        alert('Abra um corte no Endo antes de usar o ANR.');
        return;
      }

      var cap = 960;
      var sw = src.width;
      var sh = src.height;
      var sc = Math.min(1, cap / Math.max(sw, sh));

      var ww = Math.max(1, Math.round(sw * sc));
      var wh = Math.max(1, Math.round(sh * sc));

      var work = document.createElement('canvas');
      work.width = ww;
      work.height = wh;

      var wctx = work.getContext('2d');
      wctx.imageSmoothingEnabled = true;
      wctx.imageSmoothingQuality = 'high';
      wctx.drawImage(src, 0, 0, ww, wh);

      var base = wctx.getImageData(0, 0, ww, wh);

    var beforeUrl = work.toDataURL('image/jpeg', 0.94);
var defaultAmount = 62;
var defaultDetail = 28;
var afterUrl = renderANRFromBase(base, ww, wh, defaultAmount, defaultDetail);

      var ov = document.createElement('div');

      ov.id = 'endo-anr-modal';
      ov.style.cssText =
        'position:fixed;inset:0;z-index:2100000;background:rgba(0,0,0,.92);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'padding:calc(12px + env(safe-area-inset-top,0px)) 12px calc(18px + env(safe-area-inset-bottom,0px));' +
        'gap:10px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);';

      var title = document.createElement('div');

      title.innerHTML =
        '<span style="color:#7dd3fc;">ANR</span> · Active Noise Reduction';

      title.style.cssText =
        'color:#fff;font:900 15px -apple-system,BlinkMacSystemFont,sans-serif;' +
        'letter-spacing:.8px;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.8);';

      var hint = document.createElement('div');

      hint.textContent =
        'Redução clínica de granulação preservando cortical, canal, lâmina dura, guta e interfaces de alta densidade.';

      hint.style.cssText =
        'color:rgba(230,240,255,.72);font:700 10px -apple-system,BlinkMacSystemFont,sans-serif;' +
        'text-align:center;max-width:720px;line-height:1.35;margin-top:-4px;';

      var wrap = document.createElement('div');

      wrap.style.cssText =
        'display:flex;gap:10px;align-items:center;justify-content:center;width:min(96vw,1180px);';

      var beforeCol = makeImageColumn('WITHOUT ANR', beforeUrl, false);
      var afterCol = makeImageColumn('WITH ANR', afterUrl, true);

      wrap.appendChild(beforeCol);
      wrap.appendChild(afterCol);

      var afterImg = afterCol._img;

      var beforeVp = beforeCol.querySelector('div:nth-child(2)');
      var afterVp = afterCol.querySelector('div:nth-child(2)');

      var beforePan = installModalPanZoom(beforeVp, beforeCol.querySelector('img'));
      var afterPan = installModalPanZoom(afterVp, afterImg);

      var controls = document.createElement('div');

      controls.style.cssText =
        'width:min(720px,94vw);background:rgba(15,20,30,.78);border:1px solid rgba(255,255,255,.10);' +
        'border-radius:15px;padding:11px 12px;display:flex;flex-direction:column;gap:10px;' +
        'box-shadow:0 10px 26px rgba(0,0,0,.45);';

      var row = document.createElement('div');

      row.style.cssText =
        'display:flex;align-items:center;gap:9px;color:#EAF2FF;font:800 10px -apple-system,BlinkMacSystemFont,sans-serif;';

      var lab = document.createElement('span');

      lab.textContent = 'Redução de ruído';
      lab.style.cssText = 'width:126px;color:#EAF2FF;';

      var rng = document.createElement('input');

      rng.type = 'range';
      rng.min = '0';
      rng.max = '100';
      rng.value = String(defaultAmount);
      rng.style.cssText = 'flex:1;accent-color:#7dd3fc;';

      var val = document.createElement('span');

      val.textContent = String(defaultAmount);
      val.style.cssText = 'min-width:34px;text-align:right;color:#fff;font-weight:900;';

      var renderTimer = null;

      function scheduleRender(){
        val.textContent = rng.value;

        if (renderTimer) clearTimeout(renderTimer);

        renderTimer = setTimeout(function(){
          var u = renderANRFromBase(base, ww, wh, parseInt(rng.value, 10) || 0);

          if (afterImg) {
            afterImg.src = u;
            afterImg._url = u;
          }
        }, 90);
      }

      rng.addEventListener('input', scheduleRender);

      row.appendChild(lab);
      row.appendChild(rng);
      row.appendChild(val);

      var bar = document.createElement('div');

      bar.style.cssText =
        'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';

      function mk(txt, css, fn){
        var b = document.createElement('button');

        b.textContent = txt;
        b.style.cssText =
          'padding:10px 14px;border-radius:11px;border:none;font:900 12px -apple-system,BlinkMacSystemFont,sans-serif;' +
          'cursor:pointer;touch-action:manipulation;' + css;

        b.onclick = fn;

        b.addEventListener('touchend', function(e){
          e.preventDefault();
          fn();
        }, { passive:false });

        return b;
      }

      bar.appendChild(mk('Reset zoom', 'background:rgba(255,255,255,.12);color:#ddd;', function(){
        beforePan.reset();
        afterPan.reset();
      }));

      bar.appendChild(mk('Salvar no portfólio', 'background:#16a34a;color:#fff;', function(){
        var u = (afterImg && afterImg._url) || afterImg.src;

        try {
          if (typeof portfolioAddItem === 'function') {
            portfolioAddItem(
              'ANR · Active Noise Reduction',
              u,
              'Imagem derivada ' + ww + 'x' + wh + 'px · redução ' + rng.value + '% · ' + new Date().toLocaleTimeString('pt-BR'),
              {},
              ''
            );
          }
        } catch(e) {}

        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }));

      bar.appendChild(mk('Fechar', 'background:rgba(255,255,255,.12);color:#ddd;', function(){
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }));

   var controls = document.createElement('div');

controls.style.cssText =
  'width:min(720px,94vw);background:rgba(15,20,30,.78);border:1px solid rgba(255,255,255,.10);' +
  'border-radius:15px;padding:11px 12px;display:flex;flex-direction:column;gap:10px;' +
  'box-shadow:0 10px 26px rgba(0,0,0,.45);';

var rowNoise = document.createElement('div');

rowNoise.style.cssText =
  'display:flex;align-items:center;gap:9px;color:#EAF2FF;font:800 10px -apple-system,BlinkMacSystemFont,sans-serif;';

var labNoise = document.createElement('span');
labNoise.textContent = 'Redução de ruído';
labNoise.style.cssText = 'width:126px;color:#EAF2FF;';

var rngNoise = document.createElement('input');
rngNoise.type = 'range';
rngNoise.min = '0';
rngNoise.max = '100';
rngNoise.value = String(defaultAmount);
rngNoise.style.cssText = 'flex:1;accent-color:#7dd3fc;';

var valNoise = document.createElement('span');
valNoise.textContent = String(defaultAmount);
valNoise.style.cssText = 'min-width:34px;text-align:right;color:#fff;font-weight:900;';

rowNoise.appendChild(labNoise);
rowNoise.appendChild(rngNoise);
rowNoise.appendChild(valNoise);

var rowDetail = document.createElement('div');

rowDetail.style.cssText =
  'display:flex;align-items:center;gap:9px;color:#EAF2FF;font:800 10px -apple-system,BlinkMacSystemFont,sans-serif;';

var labDetail = document.createElement('span');
labDetail.textContent = 'Definição';
labDetail.style.cssText = 'width:126px;color:#EAF2FF;';

var rngDetail = document.createElement('input');
rngDetail.type = 'range';
rngDetail.min = '0';
rngDetail.max = '100';
rngDetail.value = String(defaultDetail);
rngDetail.style.cssText = 'flex:1;accent-color:#f59e0b;';

var valDetail = document.createElement('span');
valDetail.textContent = String(defaultDetail);
valDetail.style.cssText = 'min-width:34px;text-align:right;color:#fff;font-weight:900;';

rowDetail.appendChild(labDetail);
rowDetail.appendChild(rngDetail);
rowDetail.appendChild(valDetail);

var renderTimer = null;

function scheduleRender(){
  valNoise.textContent = rngNoise.value;
  valDetail.textContent = rngDetail.value;

  if (renderTimer) clearTimeout(renderTimer);

  renderTimer = setTimeout(function(){
    var u = renderANRFromBase(
      base,
      ww,
      wh,
      parseInt(rngNoise.value, 10) || 0,
      parseInt(rngDetail.value, 10) || 0
    );

    if (afterImg) {
      afterImg.src = u;
      afterImg._url = u;
    }
  }, 90);
}

rngNoise.addEventListener('input', scheduleRender);
rngDetail.addEventListener('input', scheduleRender);

var bar = document.createElement('div');

bar.style.cssText =
  'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';

function mk(txt, css, fn){
  var b = document.createElement('button');

  b.textContent = txt;
  b.style.cssText =
    'padding:10px 14px;border-radius:11px;border:none;font:900 12px -apple-system,BlinkMacSystemFont,sans-serif;' +
    'cursor:pointer;touch-action:manipulation;' + css;

  b.onclick = fn;

  b.addEventListener('touchend', function(e){
    e.preventDefault();
    fn();
  }, { passive:false });

  return b;
}

bar.appendChild(mk('Reset zoom', 'background:rgba(255,255,255,.12);color:#ddd;', function(){
  beforePan.reset();
  afterPan.reset();
}));

bar.appendChild(mk('Salvar no portfólio', 'background:#16a34a;color:#fff;', function(){
  var u = (afterImg && afterImg._url) || afterImg.src;

  try {
    if (typeof portfolioAddItem === 'function') {
      portfolioAddItem(
        'ANR · Active Noise Reduction',
        u,
        'Imagem derivada ' + ww + 'x' + wh + 'px · redução ' + rngNoise.value + '% · definição ' + rngDetail.value + '% · ' + new Date().toLocaleTimeString('pt-BR'),
        {},
        ''
      );
    }
  } catch(e) {}

  if (ov.parentNode) ov.parentNode.removeChild(ov);
}));

bar.appendChild(mk('Fechar', 'background:rgba(255,255,255,.12);color:#ddd;', function(){
  if (ov.parentNode) ov.parentNode.removeChild(ov);
}));

controls.appendChild(rowNoise);
controls.appendChild(rowDetail);
controls.appendChild(bar);

      ov.appendChild(title);
      ov.appendChild(hint);
      ov.appendChild(wrap);
      ov.appendChild(controls);

      document.body.appendChild(ov);

    } catch(e) {
      console.error('[ANR] erro:', e);
      alert('Erro no ANR: ' + (e && e.message ? e.message : e));
    }
  };

function injectANRStyle(){
    var old = document.getElementById('endo-anr-style');
    if (old && old.parentNode) {
        old.parentNode.removeChild(old);
    }

    var st = document.createElement('style');

    st.id = 'endo-anr-style';
    st.textContent = ''
      /*
        ANR é independente.
        NÃO usa .vp-mirror-btn.
        NÃO altera botão Espelhar.
        Escondido por padrão.
      */
      + '#tab-endo .vp-anr-btn{'
      + '  display:none !important;'
      + '  pointer-events:none !important;'
      + '  position:absolute !important;'
      + '  top:8px !important;'
      + '  left:112px !important;'
      + '  width:28px !important;'
      + '  height:28px !important;'
      + '  min-width:28px !important;'
      + '  min-height:28px !important;'
      + '  z-index:5012 !important;'
      + '  align-items:center !important;'
      + '  justify-content:center !important;'
      + '  background:rgba(10,14,26,0.8) !important;'
      + '  border:1px solid rgba(255,255,255,0.15) !important;'
      + '  border-radius:8px !important;'
      + '  color:#7dd3fc !important;'
      + '  font:900 8px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;'
      + '  letter-spacing:-0.45px !important;'
      + '  text-align:center !important;'
      + '  padding:0 !important;'
      + '  margin:0 !important;'
      + '  cursor:pointer !important;'
      + '  touch-action:manipulation !important;'
      + '  backdrop-filter:blur(8px) !important;'
      + '  -webkit-backdrop-filter:blur(8px) !important;'
      + '  box-shadow:0 4px 10px rgba(0,0,0,0.5) !important;'
      + '}'

      + '#tab-endo .vp-anr-btn:active{'
      + '  transform:scale(0.92) !important;'
      + '}'

      /*
        ANR aparece SOMENTE no viewport principal do EndoFocus.
        Não aparece no EndoTri.
        Não aparece nos mini-viewports do EndoFocus.
      */
      + '#tab-endo.endo-focus-active .ef-main .vp-anr-btn{'
      + '  display:flex !important;'
      + '  pointer-events:auto !important;'
      + '}'

      + '#tab-endo.endo-focus-active .ef-mini .vp-anr-btn{'
      + '  display:none !important;'
      + '  pointer-events:none !important;'
      + '}'

      + '#tab-endo:not(.endo-focus-active) .vp-anr-btn{'
      + '  display:none !important;'
      + '  pointer-events:none !important;'
      + '}'

      /*
        Modal ANR em iPhone: empilha as imagens.
      */
      + '@media (max-width:720px){'
      + '  #endo-anr-modal{justify-content:flex-start !important;overflow:auto !important;}'
      + '  #endo-anr-modal > div:nth-child(3){'
      + '    flex-direction:column !important;'
      + '    width:min(94vw,520px) !important;'
      + '    gap:8px !important;'
      + '  }'
      + '  #endo-anr-modal > div:nth-child(3) > div{'
      + '    max-width:100% !important;'
      + '    width:100% !important;'
      + '    min-width:0 !important;'
      + '  }'
      + '  #endo-anr-modal > div:nth-child(3) > div > div:nth-child(2){'
      + '    height:31dvh !important;'
      + '    min-height:205px !important;'
      + '    max-height:290px !important;'
      + '  }'
      + '  #endo-anr-modal img{'
      + '    max-height:31dvh !important;'
      + '  }'
      + '}';

    document.head.appendChild(st);
}

 function addANR(el){
    if (!el) return;

    var existing = el.querySelector('.vp-anr-btn');

    if (existing) {
        existing.classList.remove('vp-mirror-btn');
        existing.classList.add('vp-anr-btn');
        existing.textContent = 'ANR';
        return;
    }

    var b = document.createElement('button');

    /*
      CRÍTICO:
      ANR NÃO pode herdar .vp-mirror-btn.
      Essa era a causa da sobreposição e do conflito com o botão Espelhar.
    */
    b.className = 'vp-anr-btn';
    b.type = 'button';
    b.textContent = 'ANR';
    b.title = 'ANR · Active Noise Reduction';

    var go = function(e){
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (window.endoANR) window.endoANR();
    };

    b.addEventListener('touchstart', go, { passive:false, capture:true });
    b.addEventListener('mousedown', go, { capture:true });

    el.appendChild(b);
}

  function run(){
    injectANRStyle();

    [
      'endo-axial',
      'endo-coronal',
      'endo-sagittal'
    ].forEach(function(id){
      addANR(document.getElementById(id));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  setTimeout(run, 800);
  setTimeout(run, 1500);
  setTimeout(run, 4000);

})();
