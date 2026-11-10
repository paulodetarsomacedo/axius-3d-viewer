
(function(){
    'use strict';

    var IDS = ['endo-axial','endo-coronal','endo-sagittal'];

    function clamp01(v){
        v = Number(v);
        if (!isFinite(v)) return 0.5;
        return Math.max(0, Math.min(1, v));
    }

    function getFrac(el){
        if (!el) return 0.5;

        if (typeof el._progressFrac === 'number' && isFinite(el._progressFrac)) {
            return clamp01(el._progressFrac);
        }

        try {
            if (typeof volumeMeta !== 'undefined' && typeof crosshairState !== 'undefined') {
                if (el.id === 'endo-axial' && volumeMeta.z > 1) {
                    return clamp01((crosshairState.z || 0) / (volumeMeta.z - 1));
                }
                if (el.id === 'endo-coronal' && volumeMeta.y > 1) {
                    return clamp01((crosshairState.y || 0) / (volumeMeta.y - 1));
                }
                if (el.id === 'endo-sagittal' && volumeMeta.x > 1) {
                    return clamp01((crosshairState.x || 0) / (volumeMeta.x - 1));
                }
            }
        } catch(e) {}

        return 0.5;
    }

    function ensurePositioned(el){
        if (!el) return;
        try {
            if (getComputedStyle(el).position === 'static') {
                el.style.position = 'relative';
            }
        } catch(e) {
            el.style.position = 'relative';
        }
    }

    function removeBrokenOldTopSvg(el){
        if (!el) return;
        el.querySelectorAll(':scope > .vp-top-outline-svg').forEach(function(svg){
            svg.remove();
        });
    }

    function locatorMarkup(id){
        /* AXIAL:
           cabeça em plano lateral/perfil, letras S/I,
           uma linha horizontal que sobe/desce. */
        if (id === 'endo-axial') {
            return `
                <svg viewBox="0 0 48 48" aria-hidden="true">
                    <path class="mh-outline"
                          d="M15.2 6.8
                             C24.2 5.8,32.8 8.8,37.0 15.2
                             C41.4 22.0,39.6 30.8,34.0 36.4
                             C31.8 38.6,30.4 41.4,30.8 44.0
                             M15.2 6.8
                             C12.4 9.8,12.3 13.8,11.2 16.7
                             C10.4 18.8,9.3 21.1,9.8 23.2
                             C10.1 24.8,11.1 25.4,10.8 27.0
                             C10.4 29.2,8.7 31.2,7.3 33.0
                             C6.4 34.2,6.9 35.6,8.2 36.2
                             C9.2 36.7,11.0 36.5,11.7 37.5
                             C12.5 38.7,11.4 39.8,12.2 41.0
                             C12.8 41.9,14.1 41.8,14.4 42.5
                             C14.8 43.4,13.5 44.3,14.6 45.2
                             C16.1 46.4,20.7 45.3,23.4 45.4
                             C26.0 45.5,27.8 46.3,28.8 48.0"/>
                    <text class="mh-letter" x="24" y="5.4">S</text>
                    <text class="mh-letter" x="24" y="43.3">I</text>
                    <line class="mh-cut" x1="9.8" y1="24" x2="37.2" y2="24"></line>
                </svg>
            `;
        }

        /* CORONAL:
           esquema horizontal/axial da cabeça, letras A/P,
           uma linha horizontal que corre no eixo A-P. */
        if (id === 'endo-coronal') {
            return `
                <svg viewBox="0 0 48 48" aria-hidden="true">
                    <path class="mh-outline"
                          d="M24 6.7
                             C31.6 6.7,38.0 10.9,40.7 17.8
                             C42.9 23.4,41.6 31.0,37.5 36.2
                             C33.8 41.0,29.0 43.5,24 43.5
                             C19.0 43.5,14.2 41.0,10.5 36.2
                             C6.4 31.0,5.1 23.4,7.3 17.8
                             C10.0 10.9,16.4 6.7,24 6.7
                             M24 6.7
                             C23.6 9.4,22.0 11.1,20.1 12.1
                             M24 6.7
                             C24.4 9.4,26.0 11.1,27.9 12.1"/>
                    <text class="mh-letter" x="24" y="5.4">A</text>
                    <text class="mh-letter" x="24" y="43.3">P</text>
                    <line class="mh-cut" x1="8.6" y1="24" x2="39.4" y2="24"></line>
                </svg>
            `;
        }

        /* SAGITAL:
           cabeça em plano anterior/frontal, letras D/E,
           uma linha vertical que corre direita-esquerda. */
        return `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path class="mh-outline"
                      d="M24 5.5
                         C16.2 5.5,10.0 11.7,9.8 20.1
                         L9.8 24.4
                         C8.0 23.0,6.3 23.6,6.0 26.4
                         C5.7 29.0,7.0 31.4,8.4 33.2
                         C9.2 34.3,10.0 34.7,10.8 34.2
                         C11.2 38.2,13.6 41.0,16.5 42.8
                         C18.8 44.3,20.2 46.0,22.0 46.4
                         C22.8 46.6,23.4 46.6,24 46.5
                         C24.6 46.6,25.2 46.6,26.0 46.4
                         C27.8 46.0,29.2 44.3,31.5 42.8
                         C34.4 41.0,36.8 38.2,37.2 34.2
                         C38.0 34.7,38.8 34.3,39.6 33.2
                         C41.0 31.4,42.3 29.0,42.0 26.4
                         C41.7 23.6,40.0 23.0,38.2 24.4
                         L38.2 20.1
                         C38.0 11.7,31.8 5.5,24 5.5 Z"/>
                <text class="mh-letter" x="5.5" y="24">D</text>
                <text class="mh-letter" x="42.5" y="24">E</text>
                <line class="mh-cut" x1="24" y1="8.4" x2="24" y2="44.0"></line>
            </svg>
        `;
    }

    function ensureLocator(el){
        if (!el) return;
        ensurePositioned(el);

        var loc = el.querySelector(':scope > .mpr-head-locator');

        if (!loc) {
            loc = document.createElement('div');
            loc.className = 'mpr-head-locator';
            el.appendChild(loc);
        }

        if (loc.dataset.kind !== el.id) {
            loc.dataset.kind = el.id;
            loc.innerHTML = locatorMarkup(el.id);
        }

        el._mprHeadLocator = loc;
    }

    function updateLocator(el){
        if (!el) return;
        ensureLocator(el);

        var loc = el._mprHeadLocator;
        if (!loc) return;

        var cut = loc.querySelector('.mh-cut');
        if (!cut) return;

        var f = getFrac(el);

        if (el.id === 'endo-axial') {
            /* axial invertido: índice baixo = inferior, índice alto = superior */
            var yA = 34 - (f * 20);
            cut.setAttribute('x1', '9.8');
            cut.setAttribute('x2', '37.2');
            cut.setAttribute('y1', yA.toFixed(2));
            cut.setAttribute('y2', yA.toFixed(2));
            return;
        }

        if (el.id === 'endo-coronal') {
            /* coronal: A em cima, P embaixo */
            var yC = 14 + (f * 20);
            cut.setAttribute('x1', '8.6');
            cut.setAttribute('x2', '39.4');
            cut.setAttribute('y1', yC.toFixed(2));
            cut.setAttribute('y2', yC.toFixed(2));
            return;
        }

        /* sagital: D esquerda, E direita */
        var xS = 14 + (f * 20);
        cut.setAttribute('x1', xS.toFixed(2));
        cut.setAttribute('x2', xS.toFixed(2));
        cut.setAttribute('y1', '8.4');
        cut.setAttribute('y2', '44.0');
    }

    function updateAllMprHeadLocators(){
        IDS.forEach(function(id){
            var el = document.getElementById(id);
            if (!el) return;

            ensurePositioned(el);
            removeBrokenOldTopSvg(el);
            ensureLocator(el);
            updateLocator(el);
        });
    }

    function wire(el){
        if (!el || el._mprHeadFinalWired) return;
        el._mprHeadFinalWired = true;

        [
            'cornerstoneimagerendered',
            'cornerstonetoolsstackscroll',
            'touchstart',
            'touchmove',
            'mousedown',
            'mousemove'
        ].forEach(function(evt){
            el.addEventListener(evt, function(){
                requestAnimationFrame(updateAllMprHeadLocators);
            }, { passive:true });
        });
    }

    function boot(){
        IDS.forEach(function(id){
            var el = document.getElementById(id);
            if (!el) return;
            ensurePositioned(el);
            removeBrokenOldTopSvg(el);
            ensureLocator(el);
            updateLocator(el);
            wire(el);
        });
    }

    function wrapFunction(name){
        if (typeof window[name] !== 'function') return;
        if (window[name]._mprHeadFinalWrapped) return;

        var old = window[name];

        var wrapped = function(){
            var r = old.apply(this, arguments);
            requestAnimationFrame(updateAllMprHeadLocators);
            setTimeout(updateAllMprHeadLocators, 60);
            return r;
        };

        wrapped._mprHeadFinalWrapped = true;
        window[name] = wrapped;
    }

    wrapFunction('updateEndoSliceProgress');
    wrapFunction('synchronizeMobileViews');
    wrapFunction('updateObliqueViewports');
    wrapFunction('switchTab');
    wrapFunction('showTab');

    window.updateMprHeadLocators = updateAllMprHeadLocators;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('resize', function(){
        requestAnimationFrame(updateAllMprHeadLocators);
    });

    var tries = 0;
    var timer = setInterval(function(){
        boot();
        tries++;
        if (tries > 20) clearInterval(timer);
    }, 250);
})();
