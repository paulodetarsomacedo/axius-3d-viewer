
/* =====================================================================
   TAREFA 5.2 (ajuste 2) — Separar VER x MARCAR + cartões por canal + cor
   ---------------------------------------------------------------------
   1. Pílula ATIVA agora é VERMELHA com texto branco (legível). Vale para
      os chips da Odontometria e para o strip no overlay da Lima.
   2. Tocar numa pílula = SELECIONAR o canal e mostrar CRD/CAD/CRT/LIMA
      dele nos cartões (fica no modal, para revisar) — não vai mais marcar.
   3. Botão dedicado "✚ Marcar / ✎ Remedir [canal] na imagem" para ir medir.
   4. Botão "📊 Ver comprimentos" no overlay da Lima volta ao modal.
   Sobrescreve os renderizadores anteriores (window.*) mantendo estado/CRUD.
   ===================================================================== */
(function(){
    if (window._endoCanalView52Installed) return;
    window._endoCanalView52Installed = true;

    // ---------- cartões CRD/CAD/CRT/LIMA refletem o canal ATIVO ----------
    window.endoCanalUpdateCards = function(){
        var c = window.endoCanalGetActive ? window.endoCanalGetActive() : null;
        function setc(id,v){ var e=document.getElementById(id); if(e) e.textContent = v; }
        if (c && typeof c.mm === 'number' && c.mm > 0){
            var CRD = c.mm, CAD = Math.max(0.1, CRD - 1.0), CRT = Math.max(0.1, CAD - 0.5);
            c.CRD = CRD; c.CAD = CAD; c.CRT = CRT; c.lima = CRD;   // guarda p/ o laudo (5.3)
            setc('odonto-crd', CRD.toFixed(1) + ' mm');
            setc('odonto-cad', CAD.toFixed(1) + ' mm');
            setc('odonto-crt', CRT.toFixed(1) + ' mm');
            setc('odonto-lima', CRD.toFixed(1) + ' mm');
            window._odontometriaData = {
                CRD: CRD, CAD: CAD, CRT: CRT, lima: CRD,
                denteNum: (window.endoCanalState && window.endoCanalState.selectedTooth) || '',
                denteNome: (document.getElementById('odonto-dente-nome') || {}).innerText || '',
                canal: c.nome
            };
        } else {
            setc('odonto-crd','-- mm'); setc('odonto-cad','-- mm');
            setc('odonto-crt','-- mm'); setc('odonto-lima','-- mm');
        }
        endoCanalUpdateMarkButton();
    };

    // ---------- selecionar canal NO MODAL (ver, não marcar) ----------
    window.endoCanalSelectInModal = function(id){
        try { window.endoCanalPersistActive && window.endoCanalPersistActive(); } catch(e){}
        window.endoCanalSetActive(id);
        window.endoCanalUpdateCards();
        try { window.endoCanalRenderChips(); } catch(e){}
    };
    // a ação primária do chip passa a ser SELECIONAR (não marcar)
    window.endoCanalChipPrimary = window.endoCanalSelectInModal;

    // ---------- botão "Marcar / Remedir [canal] na imagem" (dentro do modal) ----------
    function ensureMarkButton(){
        var strip = document.getElementById('odonto-canal-strip');
        if (!strip) return null;
        var btn = document.getElementById('odonto-canal-markbtn');
        if (btn) return btn;
        btn = document.createElement('button');
        btn.id = 'odonto-canal-markbtn';
        btn.style.cssText = 'width:100%;margin-top:10px;padding:10px;border-radius:10px;cursor:pointer;font-weight:900;font-size:12px;' +
            'background:linear-gradient(135deg,rgba(0,200,255,0.25),rgba(0,140,220,0.18));border:1.5px solid rgba(0,180,255,0.5);color:#aef;touch-action:manipulation;';
        var go = function(e){ if(e){e.preventDefault();}
            var st = window.endoCanalState;
            if (st && st.activeCanalId) window.endoCanalMarkOnImage(st.activeCanalId);
        };
        btn.addEventListener('click', go);
        btn.addEventListener('touchend', go, { passive:false });
        strip.appendChild(btn);
        return btn;
    }
    window.endoCanalUpdateMarkButton = function(){
        var btn = ensureMarkButton(); if (!btn) return;
        var c = window.endoCanalGetActive ? window.endoCanalGetActive() : null;
        if (!c){ btn.style.display = 'none'; return; }
        btn.style.display = 'block';
        var done = (typeof c.mm === 'number' && c.mm > 0);
        btn.textContent = (done ? '✎ Remedir ' : '✚ Marcar ') + c.nome + ' na imagem';
    };

    // ---------- cores (helper) ----------
    function chipStyle(active, done, isAcc){
        var border = active ? '#ff4757' : (done ? 'rgba(0,210,120,0.55)' : (isAcc ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.2)'));
        var bg     = active ? 'rgba(255,71,87,0.22)' : 'rgba(255,255,255,0.04)';
        var color  = active ? '#fff' : (done ? '#4de' : (isAcc ? '#3bf' : '#ccc'));
        return 'border:1.5px solid ' + border + ';background:' + bg + ';color:' + color + ';';
    }

    // ---------- OVERRIDE: chips da Odontometria ----------
    window.endoCanalRenderChips = function endoCanalRenderChips(){
        var box = document.getElementById('odonto-canal-chips');
        if (!box) return;
        var st = window.endoCanalState;
        var ids = Object.keys(st.canals);
        box.innerHTML = '';
        if (!ids.length){
            box.innerHTML = '<span style="font-size:10px;color:rgba(255,255,255,0.3);">Digite o nº do dente para sugerir os canais.</span>';
            endoCanalUpdateMarkButton();
            return;
        }
        ids.forEach(function(id){
            var c = st.canals[id];
            var active = (st.activeCanalId === id);
            var isAcc  = (c.tipo === 'acessorio');
            var done   = (typeof c.mm === 'number' && c.mm > 0);
            var chip = document.createElement('div');
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:20px;cursor:pointer;' +
                'font-size:11px;font-weight:800;touch-action:manipulation;transition:all .15s;' + chipStyle(active, done, isAcc);
            var label = document.createElement('span');
            label.textContent = c.nome + (isAcc ? ' ·acc' : '') + (done ? ' · ' + c.mm.toFixed(1) + 'mm' : '');
            var primary = function(e){ if(e){e.preventDefault();} (window.endoCanalChipPrimary || window.endoCanalSetActive)(id); };
            label.addEventListener('click', primary);
            label.addEventListener('touchend', primary, { passive:false });
            chip.appendChild(label);
            var pen = document.createElement('span');
            pen.textContent = '✎'; pen.style.cssText = 'font-size:10px;opacity:.6;font-weight:900;';
            var doRen = function(ev){ ev.stopPropagation(); if(ev.preventDefault) ev.preventDefault();
                var nn = (typeof prompt==='function') ? prompt('Renomear canal:', c.nome) : null;
                if (nn !== null) window.endoCanalRename(id, nn);
                window.endoCanalRenderChips();
            };
            pen.addEventListener('click', doRen);
            pen.addEventListener('touchend', doRen, { passive:false });
            chip.appendChild(pen);
            if (ids.length > 1){
                var x = document.createElement('span');
                x.textContent = '✕'; x.style.cssText = 'font-size:10px;opacity:.65;font-weight:900;';
                var doRem = function(ev){ ev.stopPropagation(); if(ev.preventDefault) ev.preventDefault();
                    window.endoCanalRemove(id); window.endoCanalUpdateCards(); window.endoCanalRenderChips(); };
                x.addEventListener('click', doRem);
                x.addEventListener('touchend', doRem, { passive:false });
                chip.appendChild(x);
            }
            box.appendChild(chip);
        });
        endoCanalUpdateMarkButton();
    };

    // ---------- OVERRIDE: strip no overlay da Lima (cor vermelha + "Ver comprimentos") ----------
    window.endoCanalRenderLimaStrip = function endoCanalRenderLimaStrip(){
        var controls = document.getElementById('lima-controls');
        if (!controls) return;
        var strip = document.getElementById('lima-canal-strip');
        if (!strip){
            strip = document.createElement('div');
            strip.id = 'lima-canal-strip';
            strip.style.cssText = 'display:none;flex-direction:column;gap:6px;margin-bottom:2px;';
            strip.innerHTML =
                '<div id="lima-canal-now" style="text-align:center;font-size:9px;font-weight:900;letter-spacing:1px;color:#ffd700;"></div>' +
                '<div id="lima-canal-chips" style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;"></div>' +
                '<button id="lima-canal-back" style="margin-top:2px;padding:5px 8px;border-radius:10px;font-size:9px;font-weight:800;cursor:pointer;' +
                'background:rgba(210,188,255,0.14);border:1px solid rgba(210,188,255,0.4);color:#d2bcff;touch-action:manipulation;">📊 Ver comprimentos</button>';
            if (controls.children.length >= 2) controls.insertBefore(strip, controls.children[1]);
            else controls.appendChild(strip);
            var back = strip.querySelector('#lima-canal-back');
            var goBack = function(e){ if(e){e.preventDefault();}
                try { window.endoCanalPersistActive && window.endoCanalPersistActive(); } catch(err){}
                if (typeof window.openOdontometria3D === 'function') window.openOdontometria3D();
            };
            back.addEventListener('click', goBack);
            back.addEventListener('touchend', goBack, { passive:false });
        }
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
            b.style.cssText = 'padding:5px 9px;border-radius:14px;font-size:9px;font-weight:800;cursor:pointer;touch-action:manipulation;' + chipStyle(active, done, false);
            b.textContent = c.nome + (done ? ' ' + c.mm.toFixed(1) : '');
            var go = function(e){ if(e){e.preventDefault();e.stopPropagation();} window.endoCanalSwitchOnImage(id); };
            b.addEventListener('click', go);
            b.addEventListener('touchend', go, { passive:false });
            box.appendChild(b);
        });
    };

    // ---------- atualizar cartões/chips ao abrir o modal ----------
    if (typeof window.openOdontometria3D === 'function' && !window.openOdontometria3D._viewWrapped){
        var _open = window.openOdontometria3D;
        window.openOdontometria3D = function(){
            var r = _open.apply(this, arguments);
            try { window.endoCanalUpdateCards(); } catch(e){}
            try { window.endoCanalRenderChips(); } catch(e){}
            return r;
        };
        window.openOdontometria3D._viewWrapped = true;
    }
})();
