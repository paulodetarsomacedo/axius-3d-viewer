
/* ==========================================================
   8K SMART UPSCALE — EndoFocus
   ----------------------------------------------------------
   Ferramenta premium pós-renderização para cortes Endo:
   - upscaling progressivo inteligente
   - redução clínica de ruído/granulação
   - definição anatômica protegida
   - microcontraste local discreto
   - modal vertical para celular: normal em cima, 8K embaixo
   - zoom/pan/pinch sincronizados entre as duas imagens

   Segurança:
   - NÃO altera volumeData
   - NÃO altera DICOM original
   - NÃO altera stack Cornerstone
   - NÃO mexe em RAR/ZIP/MPR/Oblíquo/Medidas/3D
   - NÃO usa .vp-mirror-btn, portanto não interfere no Espelhar
   ========================================================== */
(function(){
    if (window._endo8KInstalled) return;
    window._endo8KInstalled = true;

    function clamp(v, a, b) {
        return v < a ? a : (v > b ? b : v);
    }

    function smooth01(t) {
        t = clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
    }

    function isMobileDevice() {
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

function getSafeLimits() {
    var mobile = isMobileDevice();

    return {
        /*
          v3:
          baseCap maior para o algoritmo trabalhar com mais informação.
          Isso melhora detalhe antes do upscale final.
        */
        baseCap: mobile ? 1480 : 2200,

        /*
          Mantém limite seguro no iPhone para não travar Safari.
          O ganho visual agora vem também da reconstrução multiescala,
          não apenas de canvas gigante.
        */
        outputMaxSide: mobile ? 4096 : 7168,

        hardCanvasSide: mobile ? 4096 : 7680,
        jpegQuality: mobile ? 0.93 : 0.95
    };
}

    function pickCanvas8K() {
        var cands = [];

        [
            'endo-focus-viewport',
            'endo-axial',
            'endo-coronal',
            'endo-sagittal',
            'axial-viewport',
            'modal-viewport'
        ].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;

            var cv =
                el.querySelector('canvas:not([data-ov])') ||
                el.querySelector('canvas.cornerstone-canvas') ||
                el.querySelector('canvas');

            if (!cv) return;

            var r = cv.getBoundingClientRect();

            if (r.width > 10 && r.height > 10 && cv.width > 10 && cv.height > 10) {
                cands.push({
                    cv: cv,
                    area: r.width * r.height
                });
            }
        });

        if (!cands.length) {
            var tab = document.getElementById('tab-endo') || document;

            tab.querySelectorAll('canvas:not([data-ov])').forEach(function(cv) {
                var r = cv.getBoundingClientRect();

                if (r.width > 10 && r.height > 10 && cv.width > 10 && cv.height > 10) {
                    cands.push({
                        cv: cv,
                        area: r.width * r.height
                    });
                }
            });
        }

        if (!cands.length) return null;

        cands.sort(function(a, b) {
            return b.area - a.area;
        });

        return cands[0].cv;
    }

function _endo8KFirstNumber(v, fallback) {
    if (v == null) return fallback;

    if (Array.isArray(v)) {
        if (!v.length) return fallback;
        v = v[0];
    }

    var n = Number(v);

    return isFinite(n) ? n : fallback;
}

function _endo8KIsElementVisible(el) {
    if (!el) return false;

    var r = el.getBoundingClientRect();

    return r.width > 10 && r.height > 10 && el.offsetParent !== null;
}

function _endo8KFindBestCornerstoneElement() {
    try {
        if (typeof cornerstone === 'undefined' || !cornerstone.getEnabledElements) {
            return null;
        }

        var enabled = cornerstone.getEnabledElements();
        var cands = [];

        enabled.forEach(function(item) {
            var el = item && item.element;

            if (!el) return;
            if (!_endo8KIsElementVisible(el)) return;

            var isEndo =
                el.id === 'endo-axial' ||
                el.id === 'endo-coronal' ||
                el.id === 'endo-sagittal' ||
                el.id === 'axial-viewport' ||
                el.id === 'modal-viewport' ||
                (el.closest && el.closest('#tab-endo'));

            if (!isEndo) return;

            var r = el.getBoundingClientRect();

            var score = r.width * r.height;

            /*
              No EndoFocus, prioriza o viewport principal.
              Não mexe em classe, layout nem DOM; só escolhe fonte.
            */
            if (
                el.classList.contains('ef-main') ||
                (el.closest && el.closest('.ef-main'))
            ) {
                score += 100000000;
            }

            cands.push({
                el: el,
                score: score
            });
        });

        if (!cands.length) return null;

        cands.sort(function(a, b) {
            return b.score - a.score;
        });

        return cands[0].el;

    } catch (e) {
        return null;
    }
}

function _endo8KApplyViewportTransformToCanvas(srcCanvas, viewport) {
    try {
        if (!srcCanvas || !viewport) return srcCanvas;

        var rotation = Number(viewport.rotation || 0);

        if (!isFinite(rotation)) rotation = 0;

        rotation = ((rotation % 360) + 360) % 360;

        var hflip = !!viewport.hflip;
        var vflip = !!viewport.vflip;

        if (!rotation && !hflip && !vflip) {
            return srcCanvas;
        }

        var swap = rotation === 90 || rotation === 270;

        var out = document.createElement('canvas');

        out.width = swap ? srcCanvas.height : srcCanvas.width;
        out.height = swap ? srcCanvas.width : srcCanvas.height;

        var ctx = out.getContext('2d');

        ctx.save();

        ctx.translate(out.width / 2, out.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.scale(hflip ? -1 : 1, vflip ? -1 : 1);
        ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);

        ctx.restore();

        return out;

    } catch (e) {
        console.warn('[8K] falha ao aplicar transformação do viewport:', e);
        return srcCanvas;
    }
}

function _endo8KRenderCornerstoneImageToCanvas(el) {
    try {
        if (!el) return null;
        if (typeof cornerstone === 'undefined') return null;
        if (!cornerstone.getImage || !cornerstone.getViewport) return null;

        var image = cornerstone.getImage(el);
        var viewport = cornerstone.getViewport(el);

        if (!image || !image.width || !image.height) return null;
        if (!image.getPixelData || typeof image.getPixelData !== 'function') return null;

        var w = image.width;
        var h = image.height;
        var n = w * h;

        if (!w || !h || n <= 0) return null;

        var pd = image.getPixelData();

        if (!pd || !pd.length) return null;

        var out = document.createElement('canvas');
        out.width = w;
        out.height = h;

        var ctx = out.getContext('2d');
        var imgData = ctx.createImageData(w, h);
        var od = imgData.data;

        /*
          Caso raro: imagem RGB/RGBA.
          Para CBCT normalmente não acontece, mas fica seguro.
        */
        if (pd.length >= n * 4 && image.color) {
            for (var i4 = 0, p4 = 0; i4 < n; i4++, p4 += 4) {
                od[p4] = pd[p4];
                od[p4 + 1] = pd[p4 + 1];
                od[p4 + 2] = pd[p4 + 2];
                od[p4 + 3] = 255;
            }

            ctx.putImageData(imgData, 0, 0);

return _endo8KApplyViewportTransformToCanvas(out, viewport);
        }

        var slope = _endo8KFirstNumber(image.slope, 1);
        var intercept = _endo8KFirstNumber(image.intercept, 0);

        var voi = viewport && viewport.voi ? viewport.voi : {};

        var ww = _endo8KFirstNumber(
            voi.windowWidth,
            _endo8KFirstNumber(image.windowWidth, null)
        );

        var wc = _endo8KFirstNumber(
            voi.windowCenter,
            _endo8KFirstNumber(image.windowCenter, null)
        );

        var minV = _endo8KFirstNumber(image.minPixelValue, null);
        var maxV = _endo8KFirstNumber(image.maxPixelValue, null);

        /*
          Se window/level não estiver confiável, calcula range.
          Usa todos os pixels porque matriz CBCT aqui costuma ser manejável.
        */
        if (!isFinite(minV) || !isFinite(maxV) || minV === maxV) {
            minV = Infinity;
            maxV = -Infinity;

            for (var mi = 0; mi < n; mi++) {
                var mv = pd[mi] * slope + intercept;

                if (mv < minV) minV = mv;
                if (mv > maxV) maxV = mv;
            }

            if (!isFinite(minV) || !isFinite(maxV) || minV === maxV) {
                minV = 0;
                maxV = 255;
            }
        } else {
            minV = minV * slope + intercept;
            maxV = maxV * slope + intercept;
        }

        if (!isFinite(ww) || ww <= 0) {
            ww = Math.max(1, maxV - minV);
        }

        if (!isFinite(wc)) {
            wc = (minV + maxV) / 2;
        }

        var low = wc - ww / 2;
        var high = wc + ww / 2;

        if (!isFinite(low) || !isFinite(high) || high <= low) {
            low = minV;
            high = maxV;
        }

        var inv = false;

        try {
            inv = !!(
                (viewport && viewport.invert) ||
                image.invert ||
                image.photometricInterpretation === 'MONOCHROME1'
            );
        } catch (eInv) {
            inv = false;
        }

        var denom = high - low;

        if (!isFinite(denom) || denom <= 0) denom = 1;

        for (var i = 0, p = 0; i < n; i++, p += 4) {
            var v = pd[i] * slope + intercept;
            var g = ((v - low) / denom) * 255;

            if (g < 0) g = 0;
            else if (g > 255) g = 255;

            if (inv) g = 255 - g;

            g = g + 0.5 | 0;

            od[p] = g;
            od[p + 1] = g;
            od[p + 2] = g;
            od[p + 3] = 255;
        }

     ctx.putImageData(imgData, 0, 0);

return _endo8KApplyViewportTransformToCanvas(out, viewport);

    } catch (e) {
        console.warn('[8K] fonte Cornerstone indisponível, usando canvas visível:', e);
        return null;
    }
}

function build8KSourceCanvas() {
    /*
      v4:
      Primeiro tenta fonte fiel do Cornerstone, usando pixelData e VOI atual.
      Se falhar, mantém 100% compatibilidade e usa o canvas visível antigo.
    */
    var el = _endo8KFindBestCornerstoneElement();
    var hi = _endo8KRenderCornerstoneImageToCanvas(el);

    if (hi && hi.width > 10 && hi.height > 10) {
        window._endo8KLastSourceMode = 'cornerstone';
        return {
            canvas: hi,
            element: el,
            mode: 'cornerstone'
        };
    }

    var cv = pickCanvas8K();

    if (cv) {
        window._endo8KLastSourceMode = 'canvas';
        return {
            canvas: cv,
            element: null,
            mode: 'canvas'
        };
    }

    window._endo8KLastSourceMode = 'none';

    return null;
}

    function box3Float(src, w, h) {
        var out = new Float32Array(src.length);

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var s = 0;

                for (var dy = -1; dy <= 1; dy++) {
                    var yy = y + dy;

                    if (yy < 0) yy = 0;
                    else if (yy >= h) yy = h - 1;

                    for (var dx = -1; dx <= 1; dx++) {
                        var xx = x + dx;

                        if (xx < 0) xx = 0;
                        else if (xx >= w) xx = w - 1;

                        s += src[yy * w + xx];
                    }
                }

                out[y * w + x] = s / 9;
            }
        }

        return out;
    }

    function box5Float(src, w, h) {
        var out = new Float32Array(src.length);

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var s = 0;
                var n = 0;

                for (var dy = -2; dy <= 2; dy++) {
                    var yy = y + dy;

                    if (yy < 0) yy = 0;
                    else if (yy >= h) yy = h - 1;

                    for (var dx = -2; dx <= 2; dx++) {
                        var xx = x + dx;

                        if (xx < 0) xx = 0;
                        else if (xx >= w) xx = w - 1;

                        s += src[yy * w + xx];
                        n++;
                    }
                }

                out[y * w + x] = s / n;
            }
        }

        return out;
    }

 function makeBaseCanvas(src, limits) {
    var sw = src.width;
    var sh = src.height;

    /*
      v3 High Source Base:
      antes, se o canvas visível fosse pequeno/mole, o 8K trabalhava
      em cima de pouca informação. Agora criamos uma base intermediária
      maior e progressiva antes da etapa clínica.

      Isso não altera DICOM, volumeData nem viewport.
      É só uma cópia de trabalho para o modal 8K.
    */
    var sourceMax = Math.max(sw, sh);

    var preBoost = isMobileDevice() ? 1.85 : 2.10;

    var targetMax = Math.min(
        limits.baseCap,
        Math.max(sourceMax, Math.round(sourceMax * preBoost))
    );

    var scale = targetMax / sourceMax;

    if (!isFinite(scale) || scale <= 0) scale = 1;

    var bw = Math.max(1, Math.round(sw * scale));
    var bh = Math.max(1, Math.round(sh * scale));

    /*
      Upscale progressivo para evitar serrilhado.
    */
    var cur = document.createElement('canvas');
    cur.width = sw;
    cur.height = sh;

    var curCtx = cur.getContext('2d');
    curCtx.imageSmoothingEnabled = true;
    curCtx.imageSmoothingQuality = 'high';
    curCtx.drawImage(src, 0, 0, sw, sh);

    while (cur.width < bw - 1 || cur.height < bh - 1) {
        var nextW = Math.min(bw, Math.round(cur.width * 1.55));
        var nextH = Math.min(bh, Math.round(cur.height * 1.55));

        if (nextW === cur.width && nextH === cur.height) break;

        var next = document.createElement('canvas');
        next.width = nextW;
        next.height = nextH;

        var nctx = next.getContext('2d');
        nctx.imageSmoothingEnabled = true;
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(cur, 0, 0, nextW, nextH);

        cur = next;
    }

    return cur;
}


// ---- BUG 7: blur separável O(n) para contraste local de raio grande (CLAHE-like) ----
 function boxBlurSep8K(src, w, h, r) {
    if (r < 1) return src.slice(0);
    var n = w * h;
    var tmp = new Float32Array(n);
    var out = new Float32Array(n);
    var inv = 1 / (2 * r + 1);
    var x, y, i;
    for (y = 0; y < h; y++) {
        var row = y * w;
        var acc = src[row] * (r + 1);
        for (i = 0; i < r; i++) acc += src[row + Math.min(i, w - 1)];
        for (x = 0; x < w; x++) {
            acc += src[row + Math.min(x + r, w - 1)] - src[row + Math.max(x - r - 1, 0)];
            tmp[row + x] = acc * inv;
        }
    }
    for (x = 0; x < w; x++) {
        var acc2 = tmp[x] * (r + 1);
        for (i = 0; i < r; i++) acc2 += tmp[Math.min(i, h - 1) * w + x];
        for (y = 0; y < h; y++) {
            acc2 += tmp[Math.min(y + r, h - 1) * w + x] - tmp[Math.max(y - r - 1, 0) * w + x];
            out[y * w + x] = acc2 * inv;
        }
    }
    return out;
}


  function enhanceClinical8K(baseCanvas, noiseAmount, detailAmount, clarityAmount) {
    /*
      BUG 4 · 8K v6 — SR-BASED CLEAN UPSCALE
      Reaproveita EXATAMENTE o núcleo de realce do Endo SuperRes
      (unsharp multiescala 1.15/0.75/0.40 + contraste leve (v-128)*k+128),
      que já é limpo e bem calibrado — a função SR NÃO é tocada.
      Diferenças da 8K p/ ser SUPERIOR à SR:
        - denoise edge-preserving opcional (suaviza SÓ área homogênea,
          preserva bordas anatômicas) => menos granulação que a SR;
        - saída em cinza clínico;
        - o upscale grande (6–8x) fica no render8KPipeline.
      Sem CLAHE, sem realce agressivo: é isso que gerava o "sandy look".
    */
    var w = baseCanvas.width;
    var h = baseCanvas.height;
    var n = w * h;
    var ctx0 = baseCanvas.getContext('2d');
    var img = ctx0.getImageData(0, 0, w, h);
    var bd = img.data;

    var L0 = new Float32Array(n);
    for (var i = 0, p = 0; i < n; i++, p += 4) {
        L0[i] = bd[p] * 0.299 + bd[p + 1] * 0.587 + bd[p + 2] * 0.114;
    }

    // 1) Denoise edge-preserving (só no liso; preserva definição/bordas)
    var Bp = box3Float(L0, w, h);
    var dn = clamp(noiseAmount / 100, 0, 1);
    var L = new Float32Array(n);
    for (var a = 0; a < n; a++) {
        var f0 = L0[a] - Bp[a];
        var flat = 1 - smooth01(Math.abs(f0) / 7.0);
        L[a] = L0[a] + (Bp[a] - L0[a]) * (dn * 0.5 * flat);
    }

    // 2) Núcleo Endo SuperRes (idêntico ao SR): unsharp multiescala + contraste
    var B1 = box3Float(L, w, h);
    var B2 = box3Float(B1, w, h);
    var B3 = box3Float(box3Float(B2, w, h), w, h);

    var s = clamp(detailAmount / 100, 0, 2.4);          // Definição
    var k = 1.06 + clamp(clarityAmount / 100, 0, 2.0) * 0.06; // Microcontraste

    var outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    var ctx = outCanvas.getContext('2d');
    var out = ctx.createImageData(w, h);
    var od = out.data;

    for (var j = 0, q = 0; j < n; j++, q += 4) {
        var fine = L[j] - B1[j];
        var mid = B1[j] - B2[j];
        var coarse = B2[j] - B3[j];
        var v = L[j] + s * (1.15 * fine + 0.75 * mid + 0.40 * coarse);
        v = (v - 128) * k + 128;
        if (v < 0) v = 0; else if (v > 255) v = 255;
        var g = v | 0;
        od[q] = g; od[q + 1] = g; od[q + 2] = g; od[q + 3] = 255;
    }

    ctx.putImageData(out, 0, 0);
    return outCanvas;
}


    function upscaleStepped8K(cv, targetW, targetH) {
        var cur = cv;

        while (cur.width < targetW - 1 || cur.height < targetH - 1) {
            var nextW = Math.min(targetW, Math.round(cur.width * 1.75));
            var nextH = Math.min(targetH, Math.round(cur.height * 1.75));

            if (nextW === cur.width && nextH === cur.height) break;

            var o = document.createElement('canvas');
            o.width = nextW;
            o.height = nextH;

            var c = o.getContext('2d');
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            c.drawImage(cur, 0, 0, nextW, nextH);

            cur = o;
        }

        return cur;
    }

 function finalMicroPolish8K(cv, strength) {
    var w = cv.width;
    var h = cv.height;

    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;

    var ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(cv, 0, 0);

    var s = clamp(strength / 100, 0, 1.5);

    /*
      Polimento visual final:
      aumenta definição perceptual no canvas final sem criar arrays gigantes.
      É mais forte que a versão anterior.
    */
    if (s > 0.01) {
        ctx.save();
        ctx.globalAlpha = 0.18 * s;
        ctx.filter =
            'contrast(' + (1 + 0.18 * s) + ') ' +
            'brightness(' + (1 + 0.018 * s) + ')';
        ctx.drawImage(cv, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.10 * s;
        ctx.filter = 'contrast(' + (1 + 0.30 * s) + ')';
        ctx.drawImage(cv, 0, 0);
        ctx.restore();
    }

    return out;
}

    function canvasToUrlSafe(cv, quality) {
        try {
            return cv.toDataURL('image/jpeg', quality);
        } catch (e) {
            try {
                return cv.toDataURL('image/png');
            } catch (e2) {
                throw e;
            }
        }
    }
function render8KPipeline(src, params) {
    var limits = getSafeLimits();

    /*
      BUG 4 · base de trabalho LIMPA (como no SR): reduz a escala primeiro,
      o que elimina a granulação de origem ANTES do realce. Depois aplica o
      núcleo SuperRes e sobe 6–8x com interpolação suave.
    */
    var workCap = isMobileDevice() ? 820 : 1280;

    var sw = src.width;
    var sh = src.height;
    var sc = Math.min(1, workCap / Math.max(sw, sh));
    var ww = Math.max(1, Math.round(sw * sc));
    var wh = Math.max(1, Math.round(sh * sc));

    var work = document.createElement('canvas');
    work.width = ww;
    work.height = wh;
    var wctx = work.getContext('2d');
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(src, 0, 0, ww, wh);

    // Realce base-SR (limpo). Sliders entram diretos (sem boost por força).
    var enhanced = enhanceClinical8K(work, params.noise, params.detail, params.clarity);

    // Upscale 6–8x (Força 8K), limitado pelo canvas seguro do device
    var maxSide = Math.min(
        limits.outputMaxSide,
        limits.hardCanvasSide,
        Math.max(ww, wh) * params.upscale
    );

    var factor = clamp(maxSide / Math.max(ww, wh), 1, params.upscale);

    var outW = Math.max(1, Math.round(ww * factor));
    var outH = Math.max(1, Math.round(wh * factor));

    var up = upscaleStepped8K(enhanced, outW, outH);

    return {
        canvas: up,
        url: canvasToUrlSafe(up, limits.jpegQuality),
        width: up.width,
        height: up.height,
        factor: factor,
        requestedForce: params.upscale,
        forceNorm: 0,
        safeMaxSide: limits.outputMaxSide
    };
}


    function make8KPane(label, url, accent) {
        var block = document.createElement('div');

        block.style.cssText =
            'width:min(96vw,980px);display:flex;flex-direction:column;gap:6px;';

        var title = document.createElement('div');

        title.textContent = label;
        title.style.cssText =
            'color:' + accent + ';font:900 12px -apple-system,BlinkMacSystemFont,sans-serif;' +
            'letter-spacing:1px;text-align:left;padding-left:4px;text-shadow:0 2px 8px rgba(0,0,0,.8);';

        var vp = document.createElement('div');

        vp.style.cssText =
            'height:34dvh;min-height:220px;max-height:420px;width:100%;' +
            'overflow:hidden;border-radius:14px;border:1px solid rgba(255,255,255,.14);' +
            'background:#000;display:flex;align-items:center;justify-content:center;' +
            'touch-action:none;box-shadow:0 12px 30px rgba(0,0,0,.55);position:relative;';

        var img = document.createElement('img');

        img.src = url;
        img.draggable = false;
        img.style.cssText =
            'max-width:100%;max-height:100%;display:block;touch-action:none;' +
            'user-select:none;-webkit-user-select:none;transform-origin:center center;';

        vp.appendChild(img);
        block.appendChild(title);
        block.appendChild(vp);

        block._vp = vp;
        block._img = img;

        return block;
    }

    function installSyncedPanZoom8K(panes) {
        var st = {
            scale: 1,
            tx: 0,
            ty: 0,
            dragging: false,
            x: 0,
            y: 0,
            lastDist: 0,
            lastTap: 0
        };

        function apply() {
            panes.forEach(function(pane) {
                var img = pane._img;

                if (!img) return;

                img.style.transform =
                    'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.scale + ')';
                img.style.transformOrigin = 'center center';
            });
        }

        function reset() {
            st.scale = 1;
            st.tx = 0;
            st.ty = 0;
            st.dragging = false;
            st.lastDist = 0;
            apply();
        }

        function bind(pane) {
            var vp = pane._vp;

            if (!vp) return;

            vp.addEventListener('wheel', function(e) {
                e.preventDefault();

                var delta = e.deltaY < 0 ? 1.10 : 0.91;

                st.scale = clamp(st.scale * delta, 0.5, 10);

                apply();
            }, { passive:false });

            vp.addEventListener('mousedown', function(e) {
                st.dragging = true;
                st.x = e.clientX;
                st.y = e.clientY;

                e.preventDefault();
            });

            vp.addEventListener('mousemove', function(e) {
                if (!st.dragging) return;

                st.tx += e.clientX - st.x;
                st.ty += e.clientY - st.y;
                st.x = e.clientX;
                st.y = e.clientY;

                apply();
                e.preventDefault();
            });

            vp.addEventListener('mouseup', function(e) {
                st.dragging = false;
                e.preventDefault();
            });

            vp.addEventListener('mouseleave', function() {
                st.dragging = false;
            });

            vp.addEventListener('dblclick', function(e) {
                reset();
                e.preventDefault();
            });

            vp.addEventListener('touchstart', function(e) {
                var now = Date.now();

                if (e.touches.length === 1) {
                    if (now - st.lastTap < 280) {
                        reset();
                        st.lastTap = 0;
                        e.preventDefault();
                        return;
                    }

                    st.lastTap = now;
                    st.dragging = true;
                    st.x = e.touches[0].clientX;
                    st.y = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    st.dragging = false;

                    var dx = e.touches[0].clientX - e.touches[1].clientX;
                    var dy = e.touches[0].clientY - e.touches[1].clientY;

                    st.lastDist = Math.sqrt(dx * dx + dy * dy);
                }

                e.preventDefault();
            }, { passive:false });

            vp.addEventListener('touchmove', function(e) {
                if (e.touches.length === 1 && st.dragging) {
                    st.tx += e.touches[0].clientX - st.x;
                    st.ty += e.touches[0].clientY - st.y;
                    st.x = e.touches[0].clientX;
                    st.y = e.touches[0].clientY;

                    apply();
                } else if (e.touches.length === 2) {
                    var dx = e.touches[0].clientX - e.touches[1].clientX;
                    var dy = e.touches[0].clientY - e.touches[1].clientY;
                    var d = Math.sqrt(dx * dx + dy * dy);

                    if (st.lastDist > 0) {
                        st.scale = clamp(st.scale * (d / st.lastDist), 0.5, 10);
                        apply();
                    }

                    st.lastDist = d;
                }

                e.preventDefault();
            }, { passive:false });

            vp.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                    st.dragging = false;
                    st.lastDist = 0;
                }

                e.preventDefault();
            }, { passive:false });
        }

        panes.forEach(bind);

        return {
            reset: reset,
            apply: apply,
            getState: function() {
                return {
                    scale: st.scale,
                    tx: st.tx,
                    ty: st.ty
                };
            },
            setImages: function(urlNormal, url8K) {
                if (panes[0] && panes[0]._img && urlNormal) panes[0]._img.src = urlNormal;
                if (panes[1] && panes[1]._img && url8K) panes[1]._img.src = url8K;
                apply();
            }
        };
    }

    function makeSliderRow(label, min, max, value, accent) {
        var row = document.createElement('div');

        row.style.cssText =
            'display:flex;align-items:center;gap:9px;color:#EAF2FF;' +
            'font:800 10px -apple-system,BlinkMacSystemFont,sans-serif;';

        var lab = document.createElement('span');

        lab.textContent = label;
        lab.style.cssText = 'width:116px;color:#EAF2FF;';

        var rng = document.createElement('input');

        rng.type = 'range';
        rng.min = String(min);
        rng.max = String(max);
        rng.value = String(value);
        rng.style.cssText = 'flex:1;accent-color:' + accent + ';';

        var val = document.createElement('span');

        val.textContent = String(value);
        val.style.cssText = 'min-width:36px;text-align:right;color:#fff;font-weight:900;';

        row.appendChild(lab);
        row.appendChild(rng);
        row.appendChild(val);

        row._range = rng;
        row._value = val;

        return row;
    }

    window.endo8K = function() {
     try {
    var sourceInfo = build8KSourceCanvas();
    var src = sourceInfo && sourceInfo.canvas ? sourceInfo.canvas : null;

    if (!src) {
        alert('Abra um corte no EndoFocus antes de usar o 8K.');
        return;
    }

    var limits = getSafeLimits();

    var normalBase = makeBaseCanvas(src, limits);
            var normalUrl = canvasToUrlSafe(normalBase, limits.jpegQuality);

 var params = {
upscale: 6.0,
    noise: 50,
    detail: 145,
    clarity: 70,
    polish: 70
};

            var ov = document.createElement('div');

            ov.id = 'endo-8k-modal';
            ov.style.cssText =
                'position:fixed;inset:0;z-index:2200000;background:rgba(0,0,0,.94);' +
                'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;' +
                'padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(16px + env(safe-area-inset-bottom,0px));' +
                'gap:8px;overflow:auto;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);';

            var title = document.createElement('div');

            title.innerHTML =
                '<span style="color:#facc15;">8K</span> · Smart Clinical Upscale';

            title.style.cssText =
                'color:#fff;font:900 15px -apple-system,BlinkMacSystemFont,sans-serif;' +
                'letter-spacing:.8px;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.8);';

            var hint = document.createElement('div');

            hint.textContent =
                'Upscaling progressivo com redução de granulação, definição anatômica e microcontraste local. Normal em cima, 8K embaixo. Zoom e arrasto sincronizados.';

            hint.style.cssText =
                'color:rgba(230,240,255,.72);font:700 10px -apple-system,BlinkMacSystemFont,sans-serif;' +
                'text-align:center;max-width:860px;line-height:1.35;margin-top:-3px;';

            var status = document.createElement('div');

            status.textContent = 'Processando 8K...';
            status.style.cssText =
                'color:#facc15;font:900 11px -apple-system,BlinkMacSystemFont,sans-serif;' +
                'text-align:center;min-height:14px;';

            var normalPane = make8KPane('NORMAL', normalUrl, '#cbd5e1');
            var enhancedPane = make8KPane('8K ENHANCED', normalUrl, '#facc15');

            var sync = installSyncedPanZoom8K([normalPane, enhancedPane]);

            var controls = document.createElement('div');

            controls.style.cssText =
                'width:min(96vw,820px);background:rgba(15,20,30,.82);' +
                'border:1px solid rgba(255,255,255,.10);border-radius:15px;' +
                'padding:10px 12px;display:flex;flex-direction:column;gap:9px;' +
                'box-shadow:0 10px 26px rgba(0,0,0,.45);';

            var rowUpscale = makeSliderRow('Força 8K', 2, 8, Math.round(params.upscale * 10) / 10, '#facc15');
            rowUpscale._range.step = '0.5';

            var rowNoise = makeSliderRow('Limpeza ruído', 0, 100, params.noise, '#7dd3fc');
var rowDetail = makeSliderRow('Definição', 0, 200, params.detail, '#fb923c');
var rowClarity = makeSliderRow('Microcontraste', 0, 200, params.clarity, '#a78bfa');

            controls.appendChild(rowUpscale);
            controls.appendChild(rowNoise);
            controls.appendChild(rowDetail);
            controls.appendChild(rowClarity);

            var bar = document.createElement('div');

            bar.style.cssText =
                'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:2px;';

            function mk(txt, css, fn) {
                var b = document.createElement('button');

                b.textContent = txt;
                b.style.cssText =
                    'padding:10px 14px;border-radius:11px;border:none;' +
                    'font:900 12px -apple-system,BlinkMacSystemFont,sans-serif;' +
                    'cursor:pointer;touch-action:manipulation;' + css;

                b.onclick = fn;

                b.addEventListener('touchend', function(e) {
                    e.preventDefault();
                    fn();
                }, { passive:false });

                return b;
            }

            var lastResult = null;
            var renderTimer = null;
            var renderToken = 0;

            function readParams() {
                params.upscale = parseFloat(rowUpscale._range.value) || 4;
                params.noise = parseInt(rowNoise._range.value, 10) || 0;
                params.detail = parseInt(rowDetail._range.value, 10) || 0;
                params.clarity = parseInt(rowClarity._range.value, 10) || 0;
                params.polish = Math.max(35, Math.min(130, Math.round((params.detail + params.clarity) / 2)));

                rowUpscale._value.textContent = String(params.upscale);
                rowNoise._value.textContent = String(params.noise);
                rowDetail._value.textContent = String(params.detail);
                rowClarity._value.textContent = String(params.clarity);
            }

            function renderNow() {
                readParams();

                var myToken = ++renderToken;

                status.textContent = 'Processando 8K...';

                setTimeout(function() {
                    try {
                        var result = render8KPipeline(src, params);

                        if (myToken !== renderToken) return;

                        lastResult = result;
                        enhancedPane._img.src = result.url;
                        enhancedPane._img._url = result.url;

                      status.textContent =
    'Saída: ' + result.width + ' × ' + result.height +
    ' px · força ' + result.requestedForce +
    'x · fator real ' + result.factor.toFixed(2) +
    'x · fonte ' + (window._endo8KLastSourceMode || 'canvas') +
    ' · limite seguro ' + result.safeMaxSide + ' px';

                        sync.apply();

                    } catch (e) {
                        console.error('[8K] erro no processamento:', e);
                        status.textContent = 'Erro no 8K: ' + (e && e.message ? e.message : e);
                    }
                }, 40);
            }

            function scheduleRender() {
                readParams();

                if (renderTimer) clearTimeout(renderTimer);

                status.textContent = 'Ajustando...';

                renderTimer = setTimeout(renderNow, 180);
            }

            [
                rowUpscale,
                rowNoise,
                rowDetail,
                rowClarity
            ].forEach(function(row) {
                row._range.addEventListener('input', scheduleRender);
            });

            bar.appendChild(mk('Reset zoom', 'background:rgba(255,255,255,.12);color:#ddd;', function() {
                sync.reset();
            }));

            bar.appendChild(mk('Salvar no portfólio', 'background:#16a34a;color:#fff;', function() {
                var u = lastResult && lastResult.url ? lastResult.url : enhancedPane._img.src;

                try {
                    if (typeof portfolioAddItem === 'function') {
                        portfolioAddItem(
                            '8K · Smart Clinical Upscale',
                            u,
                            'Imagem derivada ' +
                            (lastResult ? lastResult.width + 'x' + lastResult.height + 'px' : '') +
                            ' · 8K ' + params.upscale +
                            'x · ruído ' + params.noise +
                            '% · definição ' + params.detail +
                            '% · microcontraste ' + params.clarity +
                            '% · ' + new Date().toLocaleTimeString('pt-BR'),
                            {},
                            ''
                        );
                    }
                } catch (e) {}

                if (ov.parentNode) ov.parentNode.removeChild(ov);
            }));

            bar.appendChild(mk('Fechar', 'background:rgba(255,255,255,.12);color:#ddd;', function() {
                if (ov.parentNode) ov.parentNode.removeChild(ov);
            }));

            controls.appendChild(bar);

            ov.appendChild(title);
            ov.appendChild(hint);
            ov.appendChild(status);
            ov.appendChild(normalPane);
            ov.appendChild(enhancedPane);
            ov.appendChild(controls);

            document.body.appendChild(ov);

            renderNow();

        } catch (e) {
            console.error('[8K] erro:', e);
            alert('Erro no 8K: ' + (e && e.message ? e.message : e));
        }
    };

    function inject8KStyle() {
        var old = document.getElementById('endo-8k-style');

        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }

        var st = document.createElement('style');

        st.id = 'endo-8k-style';
        st.textContent = ''
            + '#tab-endo .vp-8k-btn{'
            + '  display:none !important;'
            + '  pointer-events:none !important;'
            + '  position:absolute !important;'
            + '  top:8px !important;'
            + '  left:230px !important;'
            + '  width:28px !important;'
            + '  height:28px !important;'
            + '  min-width:28px !important;'
            + '  min-height:28px !important;'
            + '  z-index:5013 !important;'
            + '  align-items:center !important;'
            + '  justify-content:center !important;'
            + '  background:rgba(10,14,26,0.82) !important;'
            + '  border:1px solid rgba(255,255,255,0.16) !important;'
            + '  border-radius:8px !important;'
            + '  color:#facc15 !important;'
            + '  font:900 8px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;'
            + '  letter-spacing:-0.35px !important;'
            + '  text-align:center !important;'
            + '  padding:0 !important;'
            + '  margin:0 !important;'
            + '  cursor:pointer !important;'
            + '  touch-action:manipulation !important;'
            + '  backdrop-filter:blur(8px) !important;'
            + '  -webkit-backdrop-filter:blur(8px) !important;'
            + '  box-shadow:0 4px 10px rgba(0,0,0,0.5) !important;'
            + '}'

            + '#tab-endo .vp-8k-btn:active{'
            + '  transform:scale(0.92) !important;'
            + '}'

            /*
              8K aparece SOMENTE no viewport principal do EndoFocus.
              Não aparece no EndoTri.
              Não aparece nos mini-viewports.
              Não usa .vp-mirror-btn, então não mexe no Espelhar.
            */
            + '#tab-endo.endo-focus-active .ef-main .vp-8k-btn{'
            + '  display:flex !important;'
            + '  pointer-events:auto !important;'
            + '}'

            + '#tab-endo.endo-focus-active .ef-mini .vp-8k-btn{'
            + '  display:none !important;'
            + '  pointer-events:none !important;'
            + '}'

            + '#tab-endo:not(.endo-focus-active) .vp-8k-btn{'
            + '  display:none !important;'
            + '  pointer-events:none !important;'
            + '}'

            + '@media (max-width:720px){'
            + '  #endo-8k-modal{'
            + '    padding-left:8px !important;'
            + '    padding-right:8px !important;'
            + '  }'
            + '  #endo-8k-modal input[type="range"]{'
            + '    height:14px !important;'
            + '  }'
            + '  #endo-8k-modal input[type="range"]::-webkit-slider-thumb{'
            + '    width:26px !important;'
            + '    height:26px !important;'
            + '    margin-top:-6px !important;'
            + '  }'
            + '}';

        document.head.appendChild(st);
    }

    function add8K(el) {
        if (!el) return;

        var existing = el.querySelector('.vp-8k-btn');

        if (existing) {
            existing.classList.remove('vp-mirror-btn');
            existing.classList.add('vp-8k-btn');
            existing.textContent = '8K';
            return;
        }

        var b = document.createElement('button');

        b.className = 'vp-8k-btn';
        b.type = 'button';
        b.textContent = '8K';
        b.title = '8K · Smart Clinical Upscale';

        var go = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            if (window.endo8K) window.endo8K();
        };

        b.addEventListener('touchstart', go, { passive:false, capture:true });
        b.addEventListener('mousedown', go, { capture:true });

        el.appendChild(b);
    }

    function run() {
        inject8KStyle();

        [
            'endo-axial',
            'endo-coronal',
            'endo-sagittal'
        ].forEach(function(id) {
            add8K(document.getElementById(id));
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
