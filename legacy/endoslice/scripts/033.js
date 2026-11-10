
/* TAREFA 5.3 (ajuste) — Portfólio por canal: 📁 adiciona TODOS os canais medidos */
(function(){
    if (window._odontoPortfolioCanal53Installed) return;
    window._odontoPortfolioCanal53Installed = true;
    if (typeof window.odontoAddToPortfolio !== 'function') return;

    var _origAdd = window.odontoAddToPortfolio;   // versão original (1 item)
    function _recuoOf(c){ return (c && typeof c.recuo === 'number') ? c.recuo : 1.0; }

    function _addOne(c, dente, nome){
        var rec = _recuoOf(c);
        var crt = Math.max(0.1, c.mm - rec);
        // alimenta o que a função original lê (d + snapshot/pontos vêm do canal)
        window._odontometriaData = { CRD: c.mm, CRT: crt, lima: c.mm, recuo: rec, canal: c.nome, denteNum: dente, denteNome: nome };
        try {
            if (typeof limaState !== 'undefined'){
                if (c.snapshot) limaState.lastMeasurementSnapshot = c.snapshot;
                if (c.points && c.points.length) limaState.lastMeasurementPoints = c.points;
                if (c.viewportId) limaState.measurementViewportId = c.viewportId;
            }
        } catch(e){}
        try { _origAdd(); } catch(e){ window.dlog && window.dlog('[portfolio canal]', e); }
    }

    window.odontoAddToPortfolio = function(){
        var st = window.endoCanalState;
        var ids = st ? Object.keys(st.canals) : [];
        var measured = ids.filter(function(id){ var c = st.canals[id]; return c && typeof c.mm === 'number' && c.mm > 0; });
        if (!measured.length){ return _origAdd(); }   // sem canais -> comportamento legado

        var dente = (st && st.selectedTooth) || '';
        var nome  = (document.getElementById('odonto-dente-nome') || {}).innerText || '';
        var activeBefore = st.activeCanalId;
        measured.forEach(function(id){ _addOne(st.canals[id], dente, nome); });
        // restaura o canal ativo e os cartões
        try { window.endoCanalSetActive(activeBefore); window.endoCanalUpdateCards(); } catch(e){}
        try { if (typeof showToast === 'function') showToast('\ud83d\udcc1 ' + measured.length + ' canal(is) no portfólio'); } catch(e){}
    };
})();
