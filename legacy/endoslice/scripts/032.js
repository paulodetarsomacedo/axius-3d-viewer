
/* =====================================================================
   TAREFA 5.3 — Recuo apical por canal + CRT + resumo + laudo por canal
   ---------------------------------------------------------------------
   Opção A (decidida): CRT = CRD − recuo. Recuo apical default 1,0 mm
   (valor mais citado na literatura), EDITÁVEL por canal — porque média
   fixa é clinicamente inaceitável (constrição varia 0–3+ mm do ápice).
   Cada canal guarda seu próprio recuo. Resumo e PDF passam a listar
   TODOS os canais. Rótulo honesto: estimativa pré-op por CBCT, confirmar
   com localizador apical. Sobrescreve endoCanalUpdateCards/gerarRelatorioPDF.
   ===================================================================== */
(function(){
    if (window._endoCanal53Installed) return;
    window._endoCanal53Installed = true;

    function _recuoOf(c){ return (c && typeof c.recuo === 'number') ? c.recuo : 1.0; }
    function _voxelStr(){
        try { if (typeof volumeMeta !== 'undefined' && volumeMeta && volumeMeta.pixelSpacing)
            return volumeMeta.pixelSpacing.toFixed(2) + ' mm'; } catch(e){}
        return 'n/d';
    }

    // ---------- recuo editável do canal ativo ----------
    window.endoCanalSetRecuo = function(val){
        var c = window.endoCanalGetActive ? window.endoCanalGetActive() : null;
        if (!c) return;
        var r = parseFloat(val);
        if (isNaN(r)) r = 1.0;
        r = Math.max(0, Math.min(3, r));   // piso/teto de segurança (não deixa CRT absurdo)
        c.recuo = r;
        if (typeof c.mm === 'number' && c.mm > 0) c.CRT = Math.max(0.1, c.mm - r);
        window.endoCanalUpdateCards();
        try { window.endoCanalRenderChips(); } catch(e){}
        try { window.endoCanalRenderSummary(); } catch(e){}
    };

    // ---------- cartões refletem o canal ATIVO (CRD, RECUO, CRT, LIMA) ----------
    window.endoCanalUpdateCards = function(){
        var c = window.endoCanalGetActive ? window.endoCanalGetActive() : null;
        function setc(id,v){ var e=document.getElementById(id); if(e) e.textContent = v; }
        var rec = _recuoOf(c);
        var recInput = document.getElementById('odonto-recuo');
        if (recInput) recInput.value = (typeof rec === 'number') ? rec : 1.0;
        if (c && typeof c.mm === 'number' && c.mm > 0){
            var CRD = c.mm, CRT = Math.max(0.1, CRD - rec);
            if (typeof c.recuo !== 'number') c.recuo = rec;   // grava o default p/ persistir
            c.CRD = CRD; c.CRT = CRT; c.lima = CRD;
            setc('odonto-crd',  CRD.toFixed(1) + ' mm');
            setc('odonto-crt',  CRT.toFixed(1) + ' mm');
            setc('odonto-lima', CRD.toFixed(1) + ' mm');
            window._odontometriaData = {
                CRD: CRD, CRT: CRT, lima: CRD, recuo: rec,
                denteNum: (window.endoCanalState && window.endoCanalState.selectedTooth) || '',
                denteNome: (document.getElementById('odonto-dente-nome') || {}).innerText || '',
                canal: c.nome
            };
        } else {
            setc('odonto-crd','-- mm'); setc('odonto-crt','-- mm'); setc('odonto-lima','-- mm');
        }
        try { window.endoCanalUpdateMarkButton && window.endoCanalUpdateMarkButton(); } catch(e){}
        try { window.endoCanalRenderSummary(); } catch(e){}
    };

    // ---------- RESUMO por canal (dentro do modal) ----------
    function ensureSummary(){
        var panel = document.getElementById('odonto-panel-comp');
        if (!panel) return null;
        var box = document.getElementById('odonto-canal-summary');
        if (box) return box;
        box = document.createElement('div');
        box.id = 'odonto-canal-summary';
        box.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:10px;color:#cfd;line-height:1.7;';
        var pdfBtn = panel.querySelector('button[onclick*="gerarRelatorioPDF"]');
        if (pdfBtn && pdfBtn.parentNode === panel) panel.insertBefore(box, pdfBtn);
        else panel.appendChild(box);
        return box;
    }
    window.endoCanalRenderSummary = function(){
        var box = ensureSummary(); if (!box) return;
        var st = window.endoCanalState;
        var ids = st ? Object.keys(st.canals) : [];
        if (!ids.length){ box.style.display = 'none'; return; }
        box.style.display = 'block';
        var dente = st.selectedTooth || '—';
        var nome  = (document.getElementById('odonto-dente-nome') || {}).innerText || '';
        var html = '<div style="font-weight:900;color:#ffd700;margin-bottom:4px;">RESUMO · Dente ' + dente + (nome ? ' (' + nome + ')' : '') + '</div>';
        ids.forEach(function(id){
            var c = st.canals[id];
            var rec = _recuoOf(c);
            if (typeof c.mm === 'number' && c.mm > 0){
                var crt = Math.max(0.1, c.mm - rec);
                html += '<div><b style="color:#fff;">' + c.nome + '</b>: CRD ' + c.mm.toFixed(1) +
                        ' · CRT <b style="color:#4de;">' + crt.toFixed(1) + '</b> mm <span style="color:rgba(255,255,255,0.4);">(recuo ' + rec.toFixed(1) + ')</span></div>';
            } else {
                html += '<div><b style="color:#fff;">' + c.nome + '</b>: <span style="color:rgba(255,255,255,0.35);">não medido</span></div>';
            }
        });
        box.innerHTML = html;
    };

    // ---------- LAUDO / PDF por canal (rótulo honesto + voxel) ----------
    window.gerarRelatorioPDF = function(){
        var st = window.endoCanalState;
        var ids = st ? Object.keys(st.canals) : [];
        var dateStr = new Date().toLocaleDateString('pt-BR');
        var dente = (st && st.selectedTooth) || '';
        var nome  = (document.getElementById('odonto-dente-nome') || {}).innerText || '';
        var vox = _voxelStr();

        // monta as linhas por canal; se não houver canais, usa _odontometriaData (legado)
        var rows = '';
        var measured = 0;
        if (ids.length){
            ids.forEach(function(id){
                var c = st.canals[id];
                var rec = _recuoOf(c);
                var crd = (typeof c.mm === 'number' && c.mm > 0) ? c.mm : null;
                var crt = (crd != null) ? Math.max(0.1, crd - rec) : null;
                if (crd != null) measured++;
                rows += '<tr>'
                    + '<td style="font-weight:800;">' + c.nome + (c.tipo === 'acessorio' ? ' <span style="color:#39f;font-size:9px;">(acessório)</span>' : '') + '<\/td>'
                    + '<td style="text-align:center;">' + (crd != null ? crd.toFixed(1) : '—') + '<\/td>'
                    + '<td style="text-align:center;">' + rec.toFixed(1) + '<\/td>'
                    + '<td style="text-align:center;font-weight:900;color:#1e9e3c;">' + (crt != null ? crt.toFixed(1) : '—') + '<\/td>'
                    + '<\/tr>';
            });
        } else {
            var d = window._odontometriaData;
            if (!d || !d.CRD) { alert('Meça ao menos um canal na Lima Virtual primeiro.'); return; }
            var rec0 = (typeof d.recuo === 'number') ? d.recuo : 1.0;
            var crt0 = Math.max(0.1, d.CRD - rec0);
            rows = '<tr><td style="font-weight:800;">Canal único<\/td><td style="text-align:center;">' + d.CRD.toFixed(1)
                 + '<\/td><td style="text-align:center;">' + rec0.toFixed(1)
                 + '<\/td><td style="text-align:center;font-weight:900;color:#1e9e3c;">' + crt0.toFixed(1) + '<\/td><\/tr>';
            measured = 1;
        }
        if (!measured){ alert('Nenhum canal medido ainda. Marque ao menos um canal na imagem.'); return; }

        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Odontometria CBCT<\/title>'
            + '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,Arial,sans-serif;background:#fff;color:#111;padding:28px;}'
            + '.hdr{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #007AFF;padding-bottom:12px;margin-bottom:16px;}'
            + '.logo{font-size:34px;}.ttl{font-size:18px;font-weight:900;color:#007AFF;}.sub{font-size:10px;color:#888;margin-top:2px;}'
            + '.tooth{font-size:13px;font-weight:900;color:#222;margin:6px 0 12px;}'
            + 'table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;}'
            + 'th,td{border:1px solid #e2e6ee;padding:8px 10px;}th{background:#f0f5ff;color:#234;font-size:10px;letter-spacing:1px;text-transform:uppercase;}'
            + '.fml{background:#f5f8ff;border-radius:8px;padding:12px;font-size:10px;color:#555;line-height:1.8;margin-bottom:10px;}'
            + '.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:9.5px;color:#9a3412;line-height:1.7;margin-bottom:16px;}'
            + '.ftr{font-size:8px;color:#bbb;border-top:1px solid #eee;padding-top:10px;margin-top:8px;}'
            + '@media print{.noprint{display:none;}}<\/style><\/head><body>'
            + '<div class="hdr"><div class="logo">&#129463;<\/div><div><div class="ttl">EndoScan &mdash; Odontometria CBCT<\/div><div class="sub">Gerado em ' + dateStr + ' &middot; voxel ' + vox + '<\/div><\/div><\/div>'
            + '<div class="tooth">Dente ' + (dente || '—') + (nome ? ' &mdash; ' + nome : '') + '<\/div>'
            + '<table><thead><tr><th>Canal<\/th><th>CRD (mm)<\/th><th>Recuo (mm)<\/th><th>CRT (mm)<\/th><\/tr><\/thead><tbody>' + rows + '<\/tbody><\/table>'
            + '<div class="fml"><b>Metodologia:<\/b> CRD = comprimento real medido na Lima Virtual (CBCT). CRT = CRD &minus; recuo apical (padrão 1,0 mm, ajustável por canal).<\/div>'
            + '<div class="warn"><b>Importante:<\/b> valores são <b>estimativa pré-operatória</b> por CBCT (voxel ' + vox + '). A constrição apical varia em relação ao ápice radiográfico; confirme o comprimento de trabalho com <b>localizador apical<\/b> no intraoperatório. CBCT não substitui a medição eletrônica.<\/div>'
            + '<div class="noprint" style="text-align:center;margin-bottom:14px;"><button onclick="window.print()" style="background:#007AFF;color:#fff;border:none;border-radius:8px;padding:10px 30px;font-size:13px;font-weight:800;cursor:pointer;">Imprimir \\/ Salvar PDF<\/button><\/div>'
            + '<div class="ftr">EndoScan CBCT &middot; Uso exclusivo diagnóstico<\/div>'
            + '<\/body><\/html>';
        var W = window.open('', '_blank', 'width=680,height=780');
        if (!W) { alert('Permita pop-ups neste site para gerar o PDF.'); return; }
        W.document.write(html); W.document.close();
        setTimeout(function(){ W.print(); }, 400);
    };
})();
