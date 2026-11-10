
/* ==========================================================
   ENDOTRI — HUD temporário nos viewports menores
   ----------------------------------------------------------
   - Um toque em coronal/sagital mostra Stack, Espelhar e Nativa.
   - Ao começar arrasto/scroll, esconde esses botões.
   - Não bloqueia eventos existentes.
   - Não usa preventDefault.
   - Não chama Cornerstone.
   - Não mexe no EndoFocus.
   ========================================================== */
(function(){
    if (window._endoTriMiniHudTouchV1Installed) return;
    window._endoTriMiniHudTouchV1Installed = true;

    var IDS = ['endo-coronal', 'endo-sagittal'];
    var timers = {};

    function isEndoTriActive(){
        var tab = document.getElementById('tab-endo');

        return !!(
            tab &&
            tab.classList.contains('active') &&
            !tab.classList.contains('endo-focus-active') &&
            !document.body.classList.contains('endo-focusing')
        );
    }

    function showMiniHud(el){
        if (!el || !isEndoTriActive()) return;

        el.classList.add('mini-hud-visible');

        if (timers[el.id]) {
            clearTimeout(timers[el.id]);
        }

        timers[el.id] = setTimeout(function(){
            el.classList.remove('mini-hud-visible');
        }, 2600);
    }

    function hideMiniHud(el){
        if (!el) return;

        el.classList.remove('mini-hud-visible');

        if (timers[el.id]) {
            clearTimeout(timers[el.id]);
            timers[el.id] = null;
        }
    }

    function install(el){
        if (!el || el._endoMiniHudTouchInstalled) return;

        el._endoMiniHudTouchInstalled = true;

        var downX = 0;
        var downY = 0;
        var moved = false;

        function getPoint(e){
            if (e.touches && e.touches.length) {
                return {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            }

            if (e.changedTouches && e.changedTouches.length) {
                return {
                    x: e.changedTouches[0].clientX,
                    y: e.changedTouches[0].clientY
                };
            }

            return {
                x: e.clientX || 0,
                y: e.clientY || 0
            };
        }

        function start(e){
            if (!isEndoTriActive()) return;

            var p = getPoint(e);

            downX = p.x;
            downY = p.y;
            moved = false;
        }

        function move(e){
            if (!isEndoTriActive()) return;

            var p = getPoint(e);
            var dx = Math.abs(p.x - downX);
            var dy = Math.abs(p.y - downY);

            if (dx + dy > 8) {
                moved = true;
                hideMiniHud(el);
            }
        }

        function end(){
            if (!isEndoTriActive()) return;

            if (!moved) {
                showMiniHud(el);
            }
        }

        /*
          Capture = true para detectar antes do canvas,
          mas sem bloquear os handlers originais.
        */
        el.addEventListener('pointerdown', start, true);
        el.addEventListener('pointermove', move, true);
        el.addEventListener('pointerup', end, true);
        el.addEventListener('pointercancel', function(){ hideMiniHud(el); }, true);

        el.addEventListener('touchstart', start, { capture:true, passive:true });
        el.addEventListener('touchmove', move, { capture:true, passive:true });
        el.addEventListener('touchend', end, { capture:true, passive:true });
        el.addEventListener('touchcancel', function(){ hideMiniHud(el); }, { capture:true, passive:true });

        el.addEventListener('wheel', function(){
            hideMiniHud(el);
        }, { passive:true });
    }

    function run(){
        IDS.forEach(function(id){
            install(document.getElementById(id));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }

    setTimeout(run, 400);
    setTimeout(run, 1200);
})();
