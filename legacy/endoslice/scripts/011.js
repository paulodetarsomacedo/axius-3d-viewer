
/* ============================================================
   ENDOTRI HUD TEMPORÁRIO — contador e Nativa sob demanda
   - Contador (.slice-info): invisível; aparece ao navegar cortes
     no viewport e some ~1150ms após a última interação (fade).
   - Barra de progresso: fina/discreta em repouso; mais forte
     enquanto navega (mesma classe de estado).
   - Nativa (.vp-top-select): invisível; aparece ao tocar no
     viewport por ~2200ms; permanece enquanto o select está em uso.
   ZERO chamadas a Cornerstone — apenas classes CSS por viewport.
   Listeners próprios: coexistem com os handlers existentes.
   ============================================================ */
(function () {
    'use strict';

    var ENDO_IDS = ['endo-axial', 'endo-coronal', 'endo-sagittal'];

    /* ---- TAREFA 6: utilitários de estado ---- */
    window.markEndoViewportInteracting = function (viewportEl) {
        if (!viewportEl || !viewportEl.classList) return;
        viewportEl.classList.add('vp-show-counter', 'vp-is-scrolling');
        clearTimeout(viewportEl._endoCounterHideTimer);
        viewportEl._endoCounterHideTimer = setTimeout(function () {
            viewportEl.classList.remove('vp-show-counter', 'vp-is-scrolling');
        }, 1150);
    };

    window.showEndoNativaTemporarily = function (viewportEl) {
        if (!viewportEl || !viewportEl.classList) return;
        viewportEl.classList.add('vp-show-nativa');
        clearTimeout(viewportEl._endoNativaHideTimer);
        viewportEl._endoNativaHideTimer = setTimeout(function () {
            var active = document.activeElement;
            // select em uso (aberto/focado)? não esconde — re-agenda
            if (active && active.classList && active.classList.contains('vp-top-select') &&
                viewportEl.contains(active)) {
                window.showEndoNativaTemporarily(viewportEl);
                return;
            }
            viewportEl.classList.remove('vp-show-nativa');
        }, 2200);
    };

    /* ---- WIRING (idempotente; sem tocar no código existente) ---- */
    function wireEndoHud() {
        ENDO_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el._hudWired) return;
            el._hudWired = true;

            // 1) Navegação de cortes: o StackScroll do Cornerstone dispara este
            //    evento no próprio elemento — listener ADICIONAL, só marca classe.
            el.addEventListener('cornerstonetoolsstackscroll', function () {
                window.markEndoViewportInteracting(el);
            });
            // 1b) Arrastar a PRÓPRIA barra de progresso também acende
            //     (esse caminho muda fatias via crosshairState e não dispara
            //     o evento de stackscroll — delegação cobre, pois o hitbox da
            //     barra é criado on-demand e o touch borbulha até o viewport)
            ['touchstart', 'mousedown', 'touchmove'].forEach(function (evt) {
                el.addEventListener(evt, function (e) {
                    if (e.target && e.target.closest &&
                        e.target.closest('.vp-top-progress-hitbox')) {
                        window.markEndoViewportInteracting(el);
                    }
                }, { passive: true });
            });

            // 2) Toque no viewport mostra a Nativa (passive: não interfere em
            //    scroll/mira/zoom; não usa preventDefault).
            el.addEventListener('pointerdown', function () {
                window.showEndoNativaTemporarily(el);
            }, { passive: true });
            el.addEventListener('touchstart', function () {
                window.showEndoNativaTemporarily(el);
            }, { passive: true });

            // 3) Tocar no botão Stack/Scroll também pisca o contador
            //    (stopPropagation dos handlers existentes NÃO bloqueia
            //    listeners registrados no MESMO botão).
            var modeBtn = el.querySelector('.vp-mode-btn');
            if (modeBtn && !modeBtn._hudWired) {
                modeBtn._hudWired = true;
                ['touchstart', 'mousedown'].forEach(function (evt) {
                    modeBtn.addEventListener(evt, function (e) {
                        e.stopPropagation();            // não vaza p/ reset/barra
                        window.markEndoViewportInteracting(el);
                    }, { passive: true, capture: true });
                });
            }

            // 4) Select Nativa: mantém visível em uso; some pouco após usar.
            //    (focus/change/blur não são afetados pela blindagem da topbar)
            var sel = el.querySelector('.vp-top-select');
            if (sel && !sel._hudWired) {
                sel._hudWired = true;
                ['focus', 'pointerdown'].forEach(function (evt) {
                    sel.addEventListener(evt, function () {
                        clearTimeout(el._endoNativaHideTimer);
                        el.classList.add('vp-show-nativa');
                    });
                });
                ['change', 'blur'].forEach(function (evt) {
                    sel.addEventListener(evt, function () {
                        clearTimeout(el._endoNativaHideTimer);
                        el._endoNativaHideTimer = setTimeout(function () {
                            el.classList.remove('vp-show-nativa');
                        }, 400);
                    });
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireEndoHud);
    } else {
        wireEndoHud();
    }
    // retries cobrem injeções tardias (mode-btn/select criados depois)
    setTimeout(wireEndoHud, 400);
    setTimeout(wireEndoHud, 1400);
})();
