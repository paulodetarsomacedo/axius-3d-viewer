
/* ==========================================================
   ENDOFOCUS TOOLBAR LAYOUT v3
   ----------------------------------------------------------
   Reorganiza SOMENTE a posição visual dos botões no viewport
   principal do EndoFocus.

   Ordem:
   Stack/Scroll > Espelhar > SR > ANR > 8K > LUT > Nativa > X

   Importante:
   - NÃO altera função do EndoFocus
   - NÃO altera função do EndoTri
   - NÃO altera função do LUT
   - NÃO altera função do SR
   - NÃO altera função do ANR
   - NÃO altera função do 8K
   - NÃO mexe em MPR, RAR, medidas, 3D ou oblíquo
   ========================================================== */
(function(){
    if (window._endoFocusToolbarLayoutV3Installed) return;
    window._endoFocusToolbarLayoutV3Installed = true;

    var managed = [];
    var raf = null;

    function isFocusActive(){
        var tab = document.getElementById('tab-endo');

        return !!(
            tab &&
            (
                tab.classList.contains('endo-focus-active') ||
                document.body.classList.contains('endo-focusing')
            )
        );
    }

    function textOf(el){
        return (el && el.textContent ? el.textContent : '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function remember(el){
        if (!el) return;

        if (managed.indexOf(el) === -1) {
            managed.push(el);
        }
    }

    function clearManagedInlineStyles(){
        managed.forEach(function(el){
            if (!el) return;

            [
                'position',
                'left',
                'top',
                'right',
                'bottom',
                'width',
                'height',
                'min-width',
                'min-height',
                'max-width',
                'max-height',
                'z-index',
                'display',
                'align-items',
                'justify-content',
                'pointer-events',
                'font',
                'font-size',
                'font-weight',
                'line-height',
                'letter-spacing',
                'padding',
                'margin',
                'border-radius',
                'transform',
                'opacity'
            ].forEach(function(prop){
                try {
                    el.style.removeProperty(prop);
                } catch(e) {}
            });
        });
    }

    function hardHideFocusOnlyButtons(){
        document.querySelectorAll('#tab-endo .vp-8k-btn, #tab-endo .vp-anr-btn').forEach(function(b){
            b.style.setProperty('display', 'none', 'important');
            b.style.setProperty('pointer-events', 'none', 'important');
            b.style.setProperty('opacity', '0', 'important');
            b.style.setProperty('position', 'absolute', 'important');
        });
    }

    function getMainViewport(){
        var tab = document.getElementById('tab-endo');
        if (!tab) return null;

        var main =
            tab.querySelector('.viewport-element.ef-main') ||
            tab.querySelector('.ef-main.viewport-element') ||
            tab.querySelector('.ef-main');

        if (main) return main;

        var els = Array.prototype.slice.call(
            tab.querySelectorAll('.viewport-element')
        ).filter(function(el){
            var r = el.getBoundingClientRect();
            return r.width > 80 && r.height > 80;
        });

        if (!els.length) return null;

        els.sort(function(a,b){
            var ra = a.getBoundingClientRect();
            var rb = b.getBoundingClientRect();

            return (rb.width * rb.height) - (ra.width * ra.height);
        });

        return els[0];
    }

    function visibleEnough(el){
        if (!el) return false;

        var r = el.getBoundingClientRect();

        return r.width > 1 && r.height > 1;
    }

    function findExactButton(txt){
        txt = String(txt || '').toUpperCase();

        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        var best = null;
        var bestScore = -1;

        btns.forEach(function(b){
            if (textOf(b) !== txt) return;

            var r = b.getBoundingClientRect();
            var score = 0;

            if (visibleEnough(b)) score += 1000;
            if (b.closest && b.closest('#tab-endo')) score += 500;
            score += Math.max(0, r.width * r.height);

            if (score > bestScore) {
                best = b;
                bestScore = score;
            }
        });

        return best;
    }

    function findButtonContaining(words){
        var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
        var best = null;
        var bestScore = -1;

        btns.forEach(function(b){
            var t = textOf(b);
            var ok = false;

            for (var i = 0; i < words.length; i++) {
                if (t.indexOf(String(words[i]).toUpperCase()) >= 0) {
                    ok = true;
                    break;
                }
            }

            if (!ok) return;

            var r = b.getBoundingClientRect();
            var score = 0;

            if (visibleEnough(b)) score += 1000;
            if (b.closest && b.closest('#tab-endo')) score += 500;
            score += Math.max(0, r.width * r.height);

            if (score > bestScore) {
                best = b;
                bestScore = score;
            }
        });

        return best;
    }

    function findStackScroll(main){
        if (!main) return null;

        return main.querySelector('.vp-mode-btn') ||
               main.querySelector('[data-mode-toggle]') ||
               main.querySelector('[data-stack-scroll]') ||
               findButtonContaining(['STACK', 'SCROLL']);
    }

    function findMirror(main){
        if (!main) return null;

        return main.querySelector(
            '.vp-mirror-btn:not(.vp-sr-btn):not(.vp-lut-btn):not(.vp-anr-btn):not(.vp-8k-btn)'
        );
    }

    function findSR(main){
        if (!main) return null;

        return main.querySelector('.vp-sr-btn');
    }

    function findANR(main){
        if (!main) return null;

        return main.querySelector('.vp-anr-btn');
    }

    function find8K(main){
        if (!main) return null;

        return main.querySelector('.vp-8k-btn');
    }

    function findLUT(){
        return findExactButton('LUT');
    }

    function findNative(main){
        if (!main) return null;

        return main.querySelector('.vp-top-select') ||
               main.querySelector('.vp-select-thickness') ||
               main.querySelector('.vp-sel-float') ||
               main.querySelector('select') ||
               findButtonContaining(['NATIVA', 'NATIVO']);
    }

    function findExit(){
        return document.getElementById('endofocus-exit') ||
               findButtonContaining(['SAIR DO FOCO', 'SAIR', 'FECHAR FOCO']);
    }

    function styleButton(el, x, y, w, h, opts){
        if (!el) return;

        opts = opts || {};
        remember(el);

        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('left', Math.round(x) + 'px', 'important');
        el.style.setProperty('top', Math.round(y) + 'px', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('bottom', 'auto', 'important');

        el.style.setProperty('width', w + 'px', 'important');
        el.style.setProperty('height', h + 'px', 'important');
        el.style.setProperty('min-width', w + 'px', 'important');
        el.style.setProperty('min-height', h + 'px', 'important');
        el.style.setProperty('max-width', w + 'px', 'important');
        el.style.setProperty('max-height', h + 'px', 'important');

        el.style.setProperty('z-index', opts.z || '5310', 'important');
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('pointer-events', 'auto', 'important');
        el.style.setProperty('opacity', '1', 'important');

        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('line-height', '1', 'important');
        el.style.setProperty('border-radius', opts.radius || '8px', 'important');
        el.style.setProperty('background', 'rgba(10,14,26,0.35)', 'important');
el.style.setProperty('border', '1px solid rgba(255,255,255,0.16)', 'important');
el.style.setProperty('box-shadow', '0 4px 10px rgba(0,0,0,0.5)', 'important');
el.style.setProperty('backdrop-filter', 'blur(8px)', 'important');
el.style.setProperty('-webkit-backdrop-filter', 'blur(8px)', 'important');
        

        if (opts.font) {
            el.style.setProperty('font', opts.font, 'important');
        }

        if (opts.color) {
            el.style.setProperty('color', opts.color, 'important');
        }
    }

    function normalizeExitButton(exit){
        if (!exit) return;

        if (!exit._endoOriginalHTMLSaved) {
            exit._endoOriginalHTMLSaved = true;
            exit._endoOriginalHTML = exit.innerHTML;
        }

        exit.innerHTML = '×';
        exit.title = 'Sair do EndoFocus';
        exit.setAttribute('aria-label', 'Sair do EndoFocus');
    }

    function restoreExitButton(exit){
        if (!exit) return;

        if (exit._endoOriginalHTMLSaved && exit._endoOriginalHTML) {
            exit.innerHTML = exit._endoOriginalHTML;
        }
    }

        function ensureFocusExtraButtons(main){
        /* BUG 2 — cria uma única vez os botões Odontometria e Oblíquo do EndoFocus.
           Odontometria chama openOdontometria3D() direto (sem o switch Endo);
           Oblíquo chama toggleObliqueMode(). Ficam ocultos fora do foco. */
        var odonto = document.getElementById('ef-odonto-btn');
        if (!odonto) {
            odonto = document.createElement('button');
            odonto.id = 'ef-odonto-btn';
            odonto.type = 'button';
            odonto.textContent = 'Odontometria';
            odonto.title = 'Odontometria';
            odonto.style.cssText = 'display:none;white-space:nowrap;';
            var goOdo = function(e){
                if (e) { e.preventDefault(); e.stopPropagation(); }
                try { if (window.openOdontometria3D) window.openOdontometria3D(); } catch(err){}
            };
            odonto.addEventListener('click', goOdo);
            odonto.addEventListener('touchend', goOdo, { passive: false });
            document.body.appendChild(odonto);
        }

        var oblique = document.getElementById('ef-oblique-btn');
        if (!oblique) {
            oblique = document.createElement('button');
            oblique.id = 'ef-oblique-btn';
            oblique.type = 'button';
            oblique.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16 8 10 10 8 16 14 14"/></svg>';
            oblique.title = 'Oblíquo';
            oblique.style.cssText = 'display:none;';
            var goObl = function(e){
                if (e) { e.preventDefault(); e.stopPropagation(); }
                try { if (window.toggleObliqueMode) window.toggleObliqueMode(); } catch(err){}
            };
            oblique.addEventListener('click', goObl);
            oblique.addEventListener('touchend', goObl, { passive: false });
            document.body.appendChild(oblique);
        }

        return { odonto: odonto, oblique: oblique };
    }


    function syncToolbar(){
        var focusing = isFocusActive();
        var exit = findExit();
if (!focusing) {
            clearManagedInlineStyles();
            hardHideFocusOnlyButtons();
            restoreExitButton(exit);
            /* BUG: Odontometria/Oblíquo são exclusivos do EndoFocus.
               hardHideFocusOnlyButtons não os conhece, então escondemos aqui
               (vale p/ EndoTri, aba 3D e ao sair do foco). */
            var _odo = document.getElementById('ef-odonto-btn'); if (_odo) _odo.style.setProperty('display','none','important');
            var _obl = document.getElementById('ef-oblique-btn'); if (_obl) _obl.style.setProperty('display','none','important');
            return;
        }

        var main = getMainViewport();

        if (!main) return;

        var r = main.getBoundingClientRect();

        if (r.width < 80 || r.height < 80) return;

        var x = r.left + 8;
        var y = r.top + 8;
        var h = 28;
        var gap = 6;

        var stack = findStackScroll(main);
        var mirror = findMirror(main);
        var sr = findSR(main);
        var anr = findANR(main);
        var btn8k = find8K(main);
        var lut = findLUT();
        var nativeControl = findNative(main);

        normalizeExitButton(exit);

  if (stack) {
    styleButton(stack, x, y, 28, h, {
        font: '900 13px/1 -apple-system,BlinkMacSystemFont,sans-serif',
        z: '5310'
    });

    /*
      Mantém a cor original do próprio botão/ícone.
      Não força cinza.
    */
    stack.style.removeProperty('color');

    stack.querySelectorAll('svg, svg *, span, i').forEach(function(n){
        try {
            n.style.removeProperty('color');
            n.style.removeProperty('stroke');
            n.style.removeProperty('fill');
            n.style.removeProperty('font-size');
        } catch(e) {}
    });

    x += 28 + gap;
}

        if (mirror) {
            styleButton(mirror, x, y, 28, h, {
                font: '900 15px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#ff9f43',
                z: '5311'
            });
            x += 28 + gap;
        }

        if (sr) {
            styleButton(sr, x, y, 28, h, {
                font: '900 9px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#00e5ff',
                z: '5312'
            });
            x += 28 + gap;
        }

        if (anr) {
            styleButton(anr, x, y, 30, h, {
                font: '900 7.4px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#7dd3fc',
                z: '5313'
            });
            x += 30 + gap;
        }

        if (btn8k) {
            styleButton(btn8k, x, y, 28, h, {
                font: '900 8px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#facc15',
                z: '5314'
            });
            x += 28 + gap;
        }

  /* BUG 2 — LUT removido do EndoFocus (passa a viver no bottom sheet › Diagnóstico) */
        if (lut) {
            lut.style.setProperty('display', 'none', 'important');
        }

        /* BUG 2 — Odontometria (chama a função direto) + Oblíquo, à direita do 8K */
        var extras = ensureFocusExtraButtons(main);

        if (extras.odonto) {
            styleButton(extras.odonto, x, y, 68, h, {
                font: '900 7.5px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#a78bfa',
                z: '5315'
            });
            x += 68 + gap;
        }

        if (extras.oblique) {
            styleButton(extras.oblique, x, y, 28, h, {
                font: '900 12px/1 -apple-system,BlinkMacSystemFont,sans-serif',
                color: '#cbd5e1',
                z: '5316'
            });
            x += 28 + gap;
        }

     /*
  Nativa e X ficam fixos no canto superior direito do viewport principal.
  Não dependem da sequência da esquerda.
*/
var nativeW = 44;
var exitW = 30;
var rightPad = 8;

var exitX = r.right - rightPad - exitW;
var nativeX = exitX - gap - nativeW;

/*
  Nativa e X ficam fixos no canto superior direito do viewport principal.
  Não dependem da sequência da esquerda.
*/
var nativeW = 36;
var exitW = 30;
var rightPad = 8;

var exitX = r.right - rightPad - exitW;
var nativeX = exitX - 14 - nativeW;

if (nativeControl) {
    styleButton(nativeControl, nativeX, y, nativeW, h, {
        font: '900 7.4px/1 -apple-system,BlinkMacSystemFont,sans-serif',
        color: '#e5e7eb',
        z: '5316'
    });
}

if (exit) {
    styleButton(exit, exitX, y, exitW, h, {
        font: '900 20px/1 -apple-system,BlinkMacSystemFont,sans-serif',
        color: '#ffffff',
        radius: '8px',
        z: '5317'
    });
}
    }

    function schedule(){
        if (raf) cancelAnimationFrame(raf);

        raf = requestAnimationFrame(function(){
            raf = null;
            syncToolbar();
        });
    }

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', function(){
        setTimeout(schedule, 250);
        setTimeout(schedule, 750);
    });

    try {
        var mo = new MutationObserver(schedule);
        mo.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    } catch(e) {}

    setInterval(schedule, 900);

    setTimeout(schedule, 250);
    setTimeout(schedule, 800);
    setTimeout(schedule, 1600);
})();
