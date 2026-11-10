
(function() {
    'use strict';

    // 3. SVGs 100% isolados. Os traços da cabeça estão confinados no centro (12 a 36),
    // enquanto as letras ficam cravadas nas bordas externas (5 e 43). NUNCA vão se tocar.
    const CLEAN_SVGS = {
        // AXIAL (Cabeça de perfil olhando para esquerda)
        'endo-axial': `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path class="mh-outline" d="M 26 12 C 20 12 16 15 16 19 C 16 20 13 22 13 24 C 13 26 16 27 16 29 C 16 33 20 36 26 36 C 32 36 36 31 36 24 C 36 17 32 12 26 12 Z" />
                <text class="mh-letter" x="24" y="6">S</text>
                <text class="mh-letter" x="24" y="44">I</text>
                <line class="mh-cut" x1="6" y1="24" x2="42" y2="24"></line>
            </svg>
        `,
        // CORONAL (Cabeça vista de cima, nariz para cima)
        'endo-coronal': `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path class="mh-outline" d="M 24 12 C 22 12 21 14 21 15 C 15 17 12 21 12 27 C 12 33 16 36 24 36 C 32 36 36 33 36 27 C 36 21 33 17 27 15 C 27 14 26 12 24 12 Z" />
                <text class="mh-letter" x="24" y="6">A</text>
                <text class="mh-letter" x="24" y="44">P</text>
                <line class="mh-cut" x1="6" y1="24" x2="42" y2="24"></line>
            </svg>
        `,
        // SAGITAL (Rosto visto de frente)
        'endo-sagittal': `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path class="mh-outline" d="M 24 12 C 18 12 15 16 15 21 C 13 21 12 22 12 24 C 12 26 13 27 15 27 C 15 32 18 36 24 36 C 30 36 33 32 33 27 C 35 27 36 26 36 24 C 36 22 35 21 33 21 C 33 16 30 12 24 12 Z" />
                <text class="mh-letter" x="6" y="25">D</text>
                <text class="mh-letter" x="42" y="25">E</text>
                <line class="mh-cut" x1="24" y1="6" x2="24" y2="42"></line>
            </svg>
        `
    };

    function replaceUglySVGs() {
        ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const loc = el.querySelector('.mpr-head-locator');
            if (!loc) return;
            
            // Backup da posição animada da linha da mira, para não quebrar a funcionalidade
            const oldCut = loc.querySelector('.mh-cut');
            let cx1, cy1, cx2, cy2;
            if (oldCut) {
                cx1 = oldCut.getAttribute('x1'); cy1 = oldCut.getAttribute('y1');
                cx2 = oldCut.getAttribute('x2'); cy2 = oldCut.getAttribute('y2');
            }

            // Injeta o SVG limpo
            loc.innerHTML = CLEAN_SVGS[id];

            // Restaura a posição matemática da linha
            if (oldCut) {
                const newCut = loc.querySelector('.mh-cut');
                if (newCut) {
                    if (cx1) newCut.setAttribute('x1', cx1);
                    if (cy1) newCut.setAttribute('y1', cy1);
                    if (cx2) newCut.setAttribute('x2', cx2);
                    if (cy2) newCut.setAttribute('y2', cy2);
                }
            }
        });
    }

    // Interceptador invisível: substitui o SVG sem estragar a lógica JS do arquivo
    if (typeof window.updateMprHeadLocators === 'function') {
        const originalUpdate = window.updateMprHeadLocators;
        window.updateMprHeadLocators = function() {
            originalUpdate.apply(this, arguments);
            replaceUglySVGs();
        };
    }

    // Aplicação forçada logo ao abrir a tela
    setTimeout(replaceUglySVGs, 300);
    setTimeout(replaceUglySVGs, 1200);
})();
