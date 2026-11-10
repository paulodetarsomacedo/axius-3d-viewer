
/* ==========================================================
   BUG 1 — Dispara o contador do topo em cada mudança de corte.
   Reaproveita updateEndoSliceProgress(id, index, max), que já
   é chamado a cada scroll. Só atua no EndoTri e só quando o
   índice realmente muda (evita piscar os 3 ao mesmo tempo).
   ========================================================== */
(function () {
    'use strict';
    if (window._endoTriTopCounterV1) return;
    window._endoTriTopCounterV1 = true;

    function isEndoTri() {
        var tab = document.getElementById('tab-endo');
        return !!(tab &&
            tab.classList.contains('active') &&
            !tab.classList.contains('endo-focus-active') &&
            !document.body.classList.contains('endo-focusing'));
    }

    var hideTimers = {};
    var lastIdx = {};

    function ensureCounter(el) {
        var c = el.querySelector(':scope > .endo-top-counter');
        if (!c) {
            c = document.createElement('div');
            c.className = 'endo-top-counter';
            c.innerHTML = '<span></span>';
            el.appendChild(c);
        }
        return c;
    }

    function flash(id, index, max) {
        if (!isEndoTri()) return;
        if (lastIdx[id] === index) return;
        lastIdx[id] = index;

        var el = document.getElementById(id);
        if (!el) return;
        var c = ensureCounter(el);
        c.firstChild.innerHTML =
            '<span class="etc-cur">' + (index + 1) + '</span>' +
            '<span class="etc-sep"> / </span>' +
            '<span class="etc-tot">' + max + '</span>';

        el.classList.add('endo-top-counter-show');
        clearTimeout(hideTimers[id]);
        hideTimers[id] = setTimeout(function () {
            el.classList.remove('endo-top-counter-show');
        }, 1300);
    }

    function wrap() {
        if (typeof window.updateEndoSliceProgress !== 'function') return;
        if (window.updateEndoSliceProgress._topCounterWrapped) return;
        var orig = window.updateEndoSliceProgress;
        window.updateEndoSliceProgress = function (id, index, max) {
            var r = orig.apply(this, arguments);
            try { flash(id, index, max); } catch (e) {}
            return r;
        };
        window.updateEndoSliceProgress._topCounterWrapped = true;
    }

    wrap();
    setTimeout(wrap, 500);
    setTimeout(wrap, 1500);
    setTimeout(wrap, 3000);
})();
