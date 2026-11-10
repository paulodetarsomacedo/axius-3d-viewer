
/* ==========================================================
   BUG 6 — EndoFocus: HUD temporário nos MINIS
   ----------------------------------------------------------
   - Um único toque (sem arrasto) em um mini mostra Stack + Espelhar.
   - Some após 3s.
   - Some imediatamente ao arrastar / rolar / dar zoom (pinch/wheel).
   - Não usa preventDefault, não chama Cornerstone, não usa
     MutationObserver. Espelha o padrão do endotri-mini-hud-touch-v1.
   ========================================================== */
(function () {
    'use strict';
    if (window._endoFocusMiniHudV1) return;
    window._endoFocusMiniHudV1 = true;

    var IDS = ['endo-axial', 'endo-coronal', 'endo-sagittal'];
    var timers = {};

    function isFocusActive() {
        var tab = document.getElementById('tab-endo');
        return !!(tab &&
            tab.classList.contains('endo-focus-active') &&
            document.body.classList.contains('endo-focusing'));
    }
    function isMini(el) {
        return !!(el && el.classList.contains('ef-mini'));
    }
    function show(el) {
        if (!el || !isFocusActive() || !isMini(el)) return;
        el.classList.add('ef-mini-hud-visible');
        if (timers[el.id]) clearTimeout(timers[el.id]);
        timers[el.id] = setTimeout(function () {
            el.classList.remove('ef-mini-hud-visible');
        }, 3000);
    }
    function hide(el) {
        if (!el) return;
        el.classList.remove('ef-mini-hud-visible');
        if (timers[el.id]) { clearTimeout(timers[el.id]); timers[el.id] = null; }
    }
    function install(el) {
        if (!el || el._efMiniHudInstalled) return;
        el._efMiniHudInstalled = true;

        var dx = 0, dy = 0, moved = false;

        function pt(e) {
            if (e.touches && e.touches.length)
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches.length)
                return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX || 0, y: e.clientY || 0 };
        }
        function start(e) {
            if (!isFocusActive() || !isMini(el)) return;
            var p = pt(e); dx = p.x; dy = p.y; moved = false;
        }
        function move(e) {
            if (!isFocusActive() || !isMini(el)) return;
            var p = pt(e);
            if (Math.abs(p.x - dx) + Math.abs(p.y - dy) > 8) { moved = true; hide(el); }
        }
        function end() {
            if (!isFocusActive() || !isMini(el)) return;
            if (!moved) show(el);
        }

        el.addEventListener('pointerdown', start, true);
        el.addEventListener('pointermove', move, true);
        el.addEventListener('pointerup', end, true);
        el.addEventListener('pointercancel', function () { hide(el); }, true);
        el.addEventListener('touchstart', start, { capture: true, passive: true });
        el.addEventListener('touchmove', move, { capture: true, passive: true });
        el.addEventListener('touchend', end, { capture: true, passive: true });
        el.addEventListener('touchcancel', function () { hide(el); }, { capture: true, passive: true });
        el.addEventListener('wheel', function () { hide(el); }, { passive: true });
        el.addEventListener('gesturestart', function () { hide(el); }, { passive: true });
    }
    function boot() { IDS.forEach(function (id) { install(document.getElementById(id)); }); }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setTimeout(boot, 400);
    setTimeout(boot, 1400);
})();
