
/* =====================================================================
   TAREFA 5.2 (ajuste) — Campo do DENTE chamativo + reforço de render
   - Glow dourado pulsante e discreto no campo do dente enquanto vazio,
     no idioma escuro/dourado do modal (some ao digitar).
   - Garante chips e strip atualizados ao abrir a Odontometria.
   ===================================================================== */
(function(){
    if (window._odontoDenteGlow52Installed) return;
    window._odontoDenteGlow52Installed = true;

    // CSS do glow (injetado uma vez)
    var st = document.createElement('style');
    st.textContent =
        '@keyframes odontoDentePulse{' +
        '0%{box-shadow:0 0 0 0 rgba(255,200,0,0.0),inset 0 0 6px rgba(255,200,0,0.25);border-color:rgba(255,200,0,0.55);}' +
        '50%{box-shadow:0 0 14px 3px rgba(255,200,0,0.55),inset 0 0 8px rgba(255,200,0,0.35);border-color:#ffd700;}' +
        '100%{box-shadow:0 0 0 0 rgba(255,200,0,0.0),inset 0 0 6px rgba(255,200,0,0.25);border-color:rgba(255,200,0,0.55);}}' +
        '#odonto-dente-input.odonto-dente-glow{animation:odontoDentePulse 1.6s ease-in-out infinite;outline:none;}' +
        '@keyframes odontoLabelPulse{0%,100%{opacity:.55;}50%{opacity:1;}}' +
        '#odonto-dente-input.odonto-dente-glow + #odonto-dente-nome:empty::before{' +
        'content:"\\2190 digite o dente";color:#ffd700;font-size:10px;font-weight:800;animation:odontoLabelPulse 1.6s ease-in-out infinite;}';
    document.head.appendChild(st);

    function applyGlow(){
        var di = document.getElementById('odonto-dente-input');
        if (!di) return;
        function refresh(){ if (di.value && String(di.value).trim()) di.classList.remove('odonto-dente-glow'); else di.classList.add('odonto-dente-glow'); }
        if (!di._glowBound){ di._glowBound = true; di.addEventListener('input', refresh); }
        refresh();
    }

    // Reaplica glow + render ao abrir o modal (roda após o wrapper da 5.1)
    if (typeof window.openOdontometria3D === 'function' && !window.openOdontometria3D._glowWrapped){
        var _open = window.openOdontometria3D;
        window.openOdontometria3D = function(){
            var r = _open.apply(this, arguments);
            try { applyGlow(); } catch(e){}
            try { if (window.endoCanalRenderChips) window.endoCanalRenderChips(); } catch(e){}
            try { if (window.endoCanalRenderLimaStrip) window.endoCanalRenderLimaStrip(); } catch(e){}
            return r;
        };
        window.openOdontometria3D._glowWrapped = true;
    }
})();
