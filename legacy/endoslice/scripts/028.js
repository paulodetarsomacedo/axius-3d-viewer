
/* =====================================================================
   TAREFA 5.2 — Lima Virtual por canal (costura Lima <-> chip de canal)
   ---------------------------------------------------------------------
   Princípio: NÃO alterar a mecânica da Lima (marcar/desenhar/calcular,
   em qual viewport, EndoTri/EndoFocus/modal). Aqui só fazemos o
   "vai-e-volta": ao entrar num canal, carregamos os pontos DELE no
   limaState (a Lima continua vendo um balde único); ao sair/medir,
   guardamos de volta no canal. Assim medir MV não apaga DV/P.
   ===================================================================== */
(function(){
    if (window._endoCanalLima52Installed) return;
    window._endoCanalLima52Installed = true;

    function _activeCanal(){ return (window.endoCanalGetActive ? window.endoCanalGetActive() : null); }
    function _clonePts(arr){
        return (arr || []).map(function(p){ return { imgX:p.imgX, imgY:p.imgY, label:p.label }; });
    }

    // ---- grava a medição atual do limaState no canal ATIVO ----
    window.endoCanalPersistActive = function(){
        try {
            var c = _activeCanal(); if (!c) return;
            if (typeof limaState === 'undefined') return;
            c.points = _clonePts(limaState.points);
            c.mode   = limaState.mode || 'reto';
            // mm: prioriza o valor finalizado do limaCalculate; senão o helper existente
            var mm = null;
            if (limaState.lastMeasurementMetrics && typeof limaState.lastMeasurementMetrics.totalMm === 'number')
                mm = limaState.lastMeasurementMetrics.totalMm;
            else if (typeof _limaGetLastMm === 'function') { try { mm = _limaGetLastMm(); } catch(e){} }
            if (typeof mm === 'number' && mm > 0 && c.points.length >= 2) c.mm = mm;
            c.viewportId = limaState.sourceViewportId || limaState.measurementViewportId || null;
            c.plane      = limaState.measurementPlane || null;
            try { if (typeof window.getCurrentSliceKeyForElement === 'function' && c.viewportId){
                var _el = document.getElementById(c.viewportId);
                if (_el) c.sliceKey = window.getCurrentSliceKeyForElement(_el);
            } } catch(e){}
            // referência viva do snapshot (usada pelo portfólio em 5.3)
            if (limaState.lastMeasurementSnapshot) c.snapshot = limaState.lastMeasurementSnapshot;
        } catch(e){}
    };

    // ---- restaura o botão MEDIR ao estado padrão SEM apagar pontos ----
    function _restoreMarkButton(){
        var btn = document.getElementById('lima-btn-mark');
        if (!btn) return;
        btn.style.display     = 'block';
        btn.style.background   = 'rgba(0,170,255,0.15)';
        btn.style.borderColor  = '#0af';
        btn.style.color        = '#0af';
        btn.innerText          = '✚ MEDIR';
    }

    // ---- carrega os pontos do canal id DENTRO do limaState (a Lima desenha normal) ----
    window.endoCanalLoadIntoLima = function(id){
        try {
            var c = window.endoCanalState.canals[id]; if (!c) return;
            if (typeof limaState === 'undefined') return;
            limaState.points  = _clonePts(c.points);
            limaState.marking = false;
            if (c.mode) { limaState.mode = c.mode; if (typeof limaUpdateModeButtons === 'function') limaUpdateModeButtons(); }
            if (c.viewportId) limaState.sourceViewportId = c.viewportId;
            _restoreMarkButton();
            try { if (typeof limaRedraw   === 'function') limaRedraw(); } catch(e){}
            try { if (typeof limaCalculate === 'function') limaCalculate(); } catch(e){}
        } catch(e){}
    };

    // ---- núcleo: troca o canal em edição (salva o atual, ativa o novo, carrega) ----
    function _switchTo(id, armIfEmpty){
        window.endoCanalPersistActive();                 // salva o que está na tela
        window.endoCanalSetActive(id);                   // ativa o novo
        window.endoCanalLoadIntoLima(id);                // traz os pontos do novo
        var c = window.endoCanalState.canals[id];
        if (armIfEmpty && c && (!c.points || c.points.length === 0)){
            try { if (typeof limaStartMark === 'function') limaStartMark(); } catch(e){}  // arma marcação
        }
        endoCanalRenderLimaStrip();
        try { window.endoCanalRenderChips(); } catch(e){}
    }

    // ---- entrada a partir do chip da ODONTOMETRIA: marca o canal na imagem grande ----
    window.endoCanalMarkOnImage = function(id){
        if (!window.endoCanalState.canals[id]) return;
        // fecha o modal da Odontometria p/ liberar a imagem grande
        var modal = document.getElementById('odontometria-modal');
        if (modal) modal.style.display = 'none';
        // garante a Lima aberta no contexto atual (EndoTri/EndoFocus)
        var limaAtiva = (typeof limaState !== 'undefined' && limaState.active);
        if (!limaAtiva && typeof limaOpen === 'function') {
            try { limaOpen(); } catch(e){}
        }
        _switchTo(id, true);
    };

    // ---- troca de canal a partir do strip no overlay da Lima (já na imagem) ----
    window.endoCanalSwitchOnImage = function(id){ _switchTo(id, true); };

    // expõe a ação primária do chip (consumida pelo render de 5.1)
    window.endoCanalChipPrimary = window.endoCanalMarkOnImage;

    // =====================================================================
    // STRIP DE CANAIS NO OVERLAY DA LIMA (imagem grande)
    // =====================================================================
    function endoCanalEnsureLimaStrip(){
        var controls = document.getElementById('lima-controls');
        if (!controls) return null;
        var strip = document.getElementById('lima-canal-strip');
        if (strip) return strip;
        strip = document.createElement('div');
        strip.id = 'lima-canal-strip';
        strip.style.cssText = 'display:none;flex-direction:column;gap:6px;margin-bottom:2px;';
        strip.innerHTML =
            '<div id="lima-canal-now" style="text-align:center;font-size:9px;font-weight:900;letter-spacing:1px;color:#ffd700;"></div>' +
            '<div id="lima-canal-chips" style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;"></div>';
        // insere logo após o título (segundo filho), antes do seletor de modo
        if (controls.children.length >= 2) controls.insertBefore(strip, controls.children[1]);
        else controls.appendChild(strip);
        return strip;
    }

    window.endoCanalRenderLimaStrip = function endoCanalRenderLimaStrip(){
        var strip = endoCanalEnsureLimaStrip();
        if (!strip) return;
        var st = window.endoCanalState;
        var ids = st ? Object.keys(st.canals) : [];
        if (!ids.length){ strip.style.display = 'none'; return; }
        strip.style.display = 'flex';
        var now = document.getElementById('lima-canal-now');
        var box = document.getElementById('lima-canal-chips');
        var act = st.activeCanalId && st.canals[st.activeCanalId] ? st.canals[st.activeCanalId] : null;
        if (now) now.textContent = (st.selectedTooth ? ('DENTE ' + st.selectedTooth + ' · ') : '') + 'MARCANDO: ' + (act ? act.nome : '—');
        if (!box) return;
        box.innerHTML = '';
        ids.forEach(function(id){
            var c = st.canals[id];
            var active = (st.activeCanalId === id);
            var done = (typeof c.mm === 'number' && c.mm > 0);
            var b = document.createElement('button');
            b.style.cssText =
                'padding:5px 8px;border-radius:14px;font-size:9px;font-weight:800;cursor:pointer;touch-action:manipulation;' +
                'border:1.5px solid ' + (active ? '#ffd700' : (done ? 'rgba(0,210,120,0.5)' : 'rgba(0,170,255,0.4)')) + ';' +
                'background:' + (active ? 'rgba(255,180,0,0.2)' : 'rgba(0,0,0,0.3)') + ';' +
                'color:' + (active ? '#ffd700' : (done ? '#4de' : '#0af')) + ';';
            b.textContent = c.nome + (done ? ' ' + c.mm.toFixed(1) : '');
            var go = function(e){ if(e){e.preventDefault();e.stopPropagation();} window.endoCanalSwitchOnImage(id); };
            b.addEventListener('click', go);
            b.addEventListener('touchend', go, { passive:false });
            box.appendChild(b);
        });
    };

    // mostra o strip sempre que a Lima abrir COM canais definidos
    if (typeof window.limaOpen === 'function' && !window.limaOpen._canalStripWrapped){
        var _origLimaOpen = window.limaOpen;
        window.limaOpen = function(){
            var r = _origLimaOpen.apply(this, arguments);
            try { endoCanalRenderLimaStrip(); } catch(e){}
            return r;
        };
        window.limaOpen._canalStripWrapped = true;
    }

    // =====================================================================
    // RE-RENDER DOS CHIPS DA ODONTOMETRIA (tap = marcar na imagem · ✎ renomeia · ✕ remove)
    // Sobrescreve o render de 5.1 mantendo o estado/CRUD; 5.1 segue válido sozinho.
    // =====================================================================
    window.endoCanalRenderChips = function endoCanalRenderChips(){
        var box = document.getElementById('odonto-canal-chips');
        if (!box) return;
        var st = window.endoCanalState;
        var ids = Object.keys(st.canals);
        box.innerHTML = '';
        if (!ids.length){
            box.innerHTML = '<span style="font-size:10px;color:rgba(255,255,255,0.3);">Digite o nº do dente para sugerir os canais.</span>';
            return;
        }
        ids.forEach(function(id){
            var c = st.canals[id];
            var active = (st.activeCanalId === id);
            var isAcc  = (c.tipo === 'acessorio');
            var done   = (typeof c.mm === 'number' && c.mm > 0);
            var chip = document.createElement('div');
            chip.style.cssText =
                'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:20px;cursor:pointer;' +
                'font-size:11px;font-weight:800;touch-action:manipulation;transition:all .15s;' +
                'border:1.5px solid ' + (active ? '#ffd700' : (done ? 'rgba(0,210,120,0.5)' : (isAcc ? 'rgba(0,180,255,0.35)' : 'rgba(255,255,255,0.15)'))) + ';' +
                'background:' + (active ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.03)') + ';' +
                'color:' + (active ? '#ffd700' : (done ? '#4de' : (isAcc ? '#3bf' : '#bbb'))) + ';';
            // rótulo (nome + mm se medido) — tap = marcar na imagem
            var label = document.createElement('span');
            label.textContent = c.nome + (isAcc ? ' ·acc' : '') + (done ? ' · ' + c.mm.toFixed(1) + 'mm' : '');
            var primary = function(e){ if(e){e.preventDefault();} (window.endoCanalChipPrimary || window.endoCanalSetActive)(id); };
            label.addEventListener('click', primary);
            label.addEventListener('touchend', primary, { passive:false });
            chip.appendChild(label);
            // ✎ renomear
            var pen = document.createElement('span');
            pen.textContent = '✎';
            pen.style.cssText = 'font-size:10px;opacity:.6;font-weight:900;';
            var doRen = function(ev){ ev.stopPropagation(); if(ev.preventDefault) ev.preventDefault();
                var nn = (typeof prompt==='function') ? prompt('Renomear canal:', c.nome) : null;
                if (nn !== null) window.endoCanalRename(id, nn);
                window.endoCanalRenderChips();
            };
            pen.addEventListener('click', doRen);
            pen.addEventListener('touchend', doRen, { passive:false });
            chip.appendChild(pen);
            // ✕ remover (não deixa remover o último)
            if (ids.length > 1){
                var x = document.createElement('span');
                x.textContent = '✕';
                x.style.cssText = 'font-size:10px;opacity:.65;font-weight:900;';
                var doRem = function(ev){ ev.stopPropagation(); if(ev.preventDefault) ev.preventDefault();
                    window.endoCanalRemove(id); window.endoCanalRenderChips(); };
                x.addEventListener('click', doRem);
                x.addEventListener('touchend', doRem, { passive:false });
                chip.appendChild(x);
            }
            box.appendChild(chip);
        });
    };
})();
