
/* ============================================================
   HUD ENDOTRI — normalizeEndoTriHud()
   - Move .vp-mode-btn e .slice-info para um container .endo-left-hud
     (topo esquerdo, sob a barra de progresso)
   - Move a .mpr-label (A/C/S) para o canto inferior direito
     (.endo-plane-corner-label)
   MOVER preserva os listeners touchstart/mousedown criados em
   injectModeButtons() — nada é clonado, nada é re-vinculado.
   Idempotente: pode rodar várias vezes sem duplicar nada.
   ============================================================ */
(function () {
    'use strict';

    function normalizeEndoTriHud() {
        ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;

            /* ---- 1. HUD superior-esquerda: Stack/Scroll + contador ---- */
            var hud = el.querySelector(':scope > .endo-left-hud');
            if (!hud) {
                hud = document.createElement('div');
                hud.className = 'endo-left-hud';
                el.appendChild(hud);
            }
            var modeBtn = el.querySelector('.vp-mode-btn');
            if (modeBtn && modeBtn.parentElement !== hud) hud.appendChild(modeBtn);
            var info = el.querySelector('.slice-info');
            if (info && info.parentElement !== hud) hud.appendChild(info);

            /* ---- 2. Letra A/C/S -> canto inferior direito ---- */
            var label = el.querySelector('.mpr-label');
            if (label && label.parentElement !== el) {
                label.classList.add('endo-plane-corner-label');
                el.appendChild(label); // sai da .vp-topbar-left; Nativa/Expandir ficam onde estão
            } else if (label) {
                label.classList.add('endo-plane-corner-label');
            }
        });
    }
    window.normalizeEndoTriHud = normalizeEndoTriHud;

    // injectModeButtons() roda em DOMContentLoaded registrado ANTES deste script,
    // então nosso listener executa depois dele. O retry de 350ms cobre qualquer
    // injeção tardia (ex.: slice-info criado no primeiro render).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeEndoTriHud);
    } else {
        normalizeEndoTriHud();
    }
    setTimeout(normalizeEndoTriHud, 350);
    setTimeout(normalizeEndoTriHud, 1200);
})();
