
(function(){
    'use strict';

    var IDS = ['endo-axial', 'endo-coronal', 'endo-sagittal'];

    function clamp01(v) {
        v = Number(v);
        if (!isFinite(v)) return 0.5;
        return Math.max(0, Math.min(1, v));
    }

    function planeOfId(id) {
        if (id === 'endo-axial') return 'axial';
        if (id === 'endo-coronal') return 'coronal';
        if (id === 'endo-sagittal') return 'sagittal';
        return '';
    }

    function ensureLocator(el) {
        if (!el || el.querySelector('.mpr-locator-glass')) return;

        var box = document.createElement('div');
        box.className = 'mpr-locator-glass';

box.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect class="loc-shell" x="5.5" y="5.5" width="37" height="37" rx="10"></rect>
        <rect class="loc-inner" x="10" y="10" width="28" height="28" rx="6"></rect>
        <path class="loc-grid" d="M10 19H38M10 29H38M19 10V38M29 10V38"></path>

        <line class="loc-plane loc-a" x1="10" y1="24" x2="38" y2="24"></line>
        <line class="loc-plane loc-c" x1="24" y1="10" x2="24" y2="38"></line>
        <line class="loc-plane loc-s" x1="18" y1="10" x2="30" y2="38"></line>

        <text class="loc-letter loc-top"    x="24" y="5.8"></text>
        <text class="loc-letter loc-bottom" x="24" y="42.2"></text>
        <text class="loc-letter loc-left"   x="5.7" y="24"></text>
        <text class="loc-letter loc-right"  x="42.3" y="24"></text>
    </svg>
`;

        el.appendChild(box);
    }

    function getLocatorFractions() {
        var mx = (window.volumeMeta && volumeMeta.x) ? volumeMeta.x : 1;
        var my = (window.volumeMeta && volumeMeta.y) ? volumeMeta.y : 1;
        var mz = (window.volumeMeta && volumeMeta.z) ? volumeMeta.z : 1;

        var sx = crosshairState && isFinite(crosshairState.x) ? crosshairState.x : mx / 2;
        var sy = crosshairState && isFinite(crosshairState.y) ? crosshairState.y : my / 2;
        var sz = crosshairState && isFinite(crosshairState.z) ? crosshairState.z : mz / 2;

        // Em oblíquo, mostra a posição efetiva de cada plano:
        // baseIndex + scroll isolado daquela viewport.
        if (window.obliqueState && obliqueState.isActive) {
            try {
                var bo = obliqueState.baseIndices || {};
                var of = obliqueState.sliceOffsets || {};
                if (isFinite(bo.sagittal)) sx = bo.sagittal + (of.sagittal || 0);
                if (isFinite(bo.coronal))  sy = bo.coronal  + (of.coronal  || 0);
                if (isFinite(bo.axial))    sz = bo.axial    + (of.axial    || 0);
            } catch(e) {}
        }

        return {
            s: clamp01(sx / Math.max(1, mx - 1)),
            c: clamp01(sy / Math.max(1, my - 1)),
            a: clamp01(sz / Math.max(1, mz - 1))
        };
    }


function updateLocatorOrientationLetters(el, loc) {
    if (!el || !loc) return;

    // Remove qualquer texto antigo das letras anatômicas antigas
    ['.loc-top', '.loc-bottom', '.loc-left', '.loc-right'].forEach(function(sel) {
        var node = loc.querySelector(sel);
        if (node) node.textContent = '';
    });

    // Remove o label antigo com setas, caso ele já exista
    var oldAxisLabel = loc.querySelector('.loc-axis-label');
    if (oldAxisLabel) oldAxisLabel.textContent = '';

    var svg = loc.querySelector('svg');
    if (!svg) return;

    // Cria uma letra de movimento apenas uma vez
    function ensureMoveLetter(cls, x, y) {
        var node = loc.querySelector('.' + cls);
        if (!node) {
            node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            node.setAttribute('class', 'loc-move-letter ' + cls);
            svg.appendChild(node);
        }
        node.setAttribute('x', x);
        node.setAttribute('y', y);
        return node;
    }

    var top    = ensureMoveLetter('loc-move-top',    24, 5.7);
    var bottom = ensureMoveLetter('loc-move-bottom', 24, 42.3);
    var left   = ensureMoveLetter('loc-move-left',   5.7, 24);
    var right  = ensureMoveLetter('loc-move-right',  42.3, 24);

    // Limpa tudo antes de aplicar o plano atual
    top.textContent = '';
    bottom.textContent = '';
    left.textContent = '';
    right.textContent = '';

    /*
      Letras agora representam o EIXO DE MOVIMENTO do plano no volume:

      AXIAL:
      - O plano axial corre superior/inferior.
      - No locator, o traço vermelho horizontal sobe/desce.
      - Portanto: S em cima, I embaixo.

      CORONAL:
      - O plano coronal corre anterior/posterior.
      - No locator, o traço azul vertical desloca lateralmente.
      - Portanto: A de um lado, P do outro.

      SAGITAL:
      - O plano sagital corre direita/esquerda.
      - No locator, o traço amarelo desloca lateralmente.
      - Portanto: D de um lado, E do outro.
    */
    if (el.id === 'endo-axial') {
        top.textContent = 'S';
        bottom.textContent = 'I';
    } else if (el.id === 'endo-coronal') {
        left.textContent = 'A';
        right.textContent = 'P';
    } else if (el.id === 'endo-sagittal') {
        left.textContent = 'D';
        right.textContent = 'E';
    }
}

    function updateOne(el) {
        if (!el) return;
        ensureLocator(el);

        var loc = el.querySelector('.mpr-locator-glass');
        if (!loc) return;

        var f = getLocatorFractions();

        var yA = 38 - f.a * 28;
        var xC = 10 + f.c * 28;
        var xS = 10 + f.s * 28;

        var a = loc.querySelector('.loc-a');
        var c = loc.querySelector('.loc-c');
        var s = loc.querySelector('.loc-s');

        if (a) {
            a.setAttribute('x1', 10);
            a.setAttribute('x2', 38);
            a.setAttribute('y1', yA);
            a.setAttribute('y2', yA);
        }

        if (c) {
            c.setAttribute('x1', xC);
            c.setAttribute('x2', xC);
            c.setAttribute('y1', 10);
            c.setAttribute('y2', 38);
        }

        // Sagital em diagonal leve, para diferenciar de coronal.
        if (s) {
            s.setAttribute('x1', xS - 6);
            s.setAttribute('y1', 10);
            s.setAttribute('x2', xS + 6);
            s.setAttribute('y2', 38);
        }

        updateLocatorOrientationLetters(el, loc);

        loc.classList.toggle('is-oblique', !!(window.obliqueState && obliqueState.isActive));

        loc.classList.remove('active-a', 'active-c', 'active-s');
        var plane = planeOfId(el.id);
        if (plane === 'axial') loc.classList.add('active-a');
        if (plane === 'coronal') loc.classList.add('active-c');
        if (plane === 'sagittal') loc.classList.add('active-s');
    }

    window.updateMprLocatorGlass = function() {
        IDS.forEach(function(id) {
            updateOne(document.getElementById(id));
        });
    };

    function boot() {
        window.updateMprLocatorGlass();

        // Atualiza em renders/scrolls sem tocar na lógica clínica.
        IDS.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || el._mprLocatorWired) return;
            el._mprLocatorWired = true;

            el.addEventListener('cornerstoneimagerendered', function() {
                requestAnimationFrame(window.updateMprLocatorGlass);
            });

            el.addEventListener('cornerstonetoolsstackscroll', function() {
                requestAnimationFrame(window.updateMprLocatorGlass);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    setTimeout(boot, 500);
    setTimeout(boot, 1500);

    // Wrapper seguro: quando a barra/progresso atualiza, o locator acompanha.
    if (typeof window.updateEndoSliceProgress === 'function' && !window.updateEndoSliceProgress._mprLocatorWrapped) {
        var _oldProgress = window.updateEndoSliceProgress;
        window.updateEndoSliceProgress = function() {
            var r = _oldProgress.apply(this, arguments);
            requestAnimationFrame(window.updateMprLocatorGlass);
            return r;
        };
        window.updateEndoSliceProgress._mprLocatorWrapped = true;
    }

    // Wrapper seguro: quando o oblíquo atualiza, o locator inclina e acompanha offsets.
    if (typeof window.updateObliqueViewports === 'function' && !window.updateObliqueViewports._mprLocatorWrapped) {
        var _oldOblique = window.updateObliqueViewports;
        window.updateObliqueViewports = function() {
            var r = _oldOblique.apply(this, arguments);
            setTimeout(window.updateMprLocatorGlass, 30);
            return r;
        };
        window.updateObliqueViewports._mprLocatorWrapped = true;
    }
})();
