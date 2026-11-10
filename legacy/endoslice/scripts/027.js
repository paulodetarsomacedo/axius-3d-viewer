
/* =====================================================================
   TAREFA 5.1 — Arquitetura por dente/canal (FUNDAÇÃO + chips na Odontometria)
   ---------------------------------------------------------------------
   - Cria window.endoCanalState (substitui o estado único p/ múltiplos canais).
   - Schema clínico FDI -> canais sugeridos (editável, nunca trava).
   - CRUD de canal: add / renomear / remover / acessório / ativo.
   - Injeta um "chip strip" de canais na Odontometria, logo abaixo do
     seletor de dente, com sugestão automática ao digitar o nº FDI.
   NÃO altera ainda a Lima nem o cálculo CRD/CAD/CRT (vem em 5.2/5.3).
   100% aditivo — fluxo de um canal continua funcionando como hoje.
   ===================================================================== */
(function(){
    if (window._endoCanalState51Installed) return;
    window._endoCanalState51Installed = true;

    // ---------------- ESTADO GLOBAL ----------------
    window.endoCanalState = window.endoCanalState || { selectedTooth: '', activeCanalId: null, canals: {} };

    var _canalSeq = 1;
    function _newCanalId(){ return 'c' + (_canalSeq++) + '_' + Date.now().toString(36); }

    function _blankCanal(nome, tipo){
        return {
            id: _newCanalId(),
            nome: nome || 'Canal',
            tipo: tipo || 'principal',   // 'principal' | 'acessorio'
            points: [],                  // pontos da Lima (preenchido em 5.2)
            viewportId: null,
            sliceKey: null,
            mm: null,                    // comprimento medido (mm)
            CRD: null, CAD: null, CRT: null, lima: null,
            obs: ''
        };
    }

    // ---------------- SCHEMA FDI -> CANAIS SUGERIDOS ----------------
    // Segue estritamente o briefing; o que não estiver listado nasce como
    // "Canal único" e pode ser ajustado manualmente (nunca trava clinicamente).
    // ---------------- SCHEMA FDI -> CANAIS SUGERIDOS ----------------
    // Configuração MAIS COMUM por dente (editável, nunca trava clinicamente).
    // Baseado em revisões sistemáticas/CBCT:
    //  - 1º molar sup. (16/26): MB2 presente em ~70% -> MV, MV2, DV, P (4).
    //  - 2º/3º molar sup.: MV, DV, P (MB2 ~33% no 2º -> fica como acessório editável).
    //  - Molares inf. (2 raízes): raiz mesial c/ 2 canais (MV, ML) + distal (D) -> 3 canais
    //    (prevalência de 3 canais ~78%; ~40% têm 2º canal distal, adicionável).
    //  - 1º pré-molar sup. (14/24): V, P (2). 2º pré sup. (15/25): variável (1-2).
    //  - Incisivos/caninos e pré-molares inferiores: normalmente 1 canal.
    window.endoCanalSuggestForTooth = function(num){
        num = String(num == null ? '' : num).trim();
        var molarSup1  = ['16','26'];                        // MV, MV2, DV, P
        var molarSup23 = ['17','18','27','28'];              // MV, DV, P
        var molarInf   = ['36','37','38','46','47','48'];    // MV, ML, D
        var premolarVP = ['14','24'];                        // V, P
        var premolar2  = ['15','25'];                        // Canal 1, Canal 2 (variável)
        var unicos     = ['11','21','12','22','13','23',      // incisivos/caninos sup.
                          '31','41','32','42','33','43',      // incisivos/caninos inf.
                          '34','44','35','45'];               // pré-molares inferiores
        if (molarSup1.indexOf(num)   >= 0) return ['MV','MV2','DV','P'];
        if (molarSup23.indexOf(num)  >= 0) return ['MV','DV','P'];
        if (molarInf.indexOf(num)    >= 0) return ['MV','ML','D'];
        if (premolarVP.indexOf(num)  >= 0) return ['V','P'];
        if (premolar2.indexOf(num)   >= 0) return ['Canal 1','Canal 2'];
        if (unicos.indexOf(num)      >= 0) return ['Canal único'];
        return ['Canal único']; // default editável (dentes não enumerados / decíduos)
    };


    // ---------------- CRUD DE CANAL ----------------
    window.endoCanalAdd = function(nome, tipo){
        var c = _blankCanal(nome, tipo);
        window.endoCanalState.canals[c.id] = c;
        if (!window.endoCanalState.activeCanalId) window.endoCanalState.activeCanalId = c.id;
        return c.id;
    };
    window.endoCanalRename = function(id, novoNome){
        var c = window.endoCanalState.canals[id];
        if (c && novoNome && novoNome.trim()) c.nome = novoNome.trim();
    };
    window.endoCanalRemove = function(id){
        var st = window.endoCanalState;
        if (!st.canals[id]) return;
        delete st.canals[id];
        if (st.activeCanalId === id){
            var ids = Object.keys(st.canals);
            st.activeCanalId = ids.length ? ids[0] : null;
        }
    };
    window.endoCanalSetActive = function(id){
        if (window.endoCanalState.canals[id]) window.endoCanalState.activeCanalId = id;
    };
    window.endoCanalGetActive = function(){
        var st = window.endoCanalState;
        return (st.activeCanalId && st.canals[st.activeCanalId]) ? st.canals[st.activeCanalId] : null;
    };
    window.endoCanalAddAccessory = function(){
        var nome = (typeof prompt === 'function') ? prompt('Nome do canal acessório (ex.: MV2, lateral, secundário):', 'MV2') : 'MV2';
        if (nome === null) return;                 // cancelado
        nome = (nome || '').trim() || 'acessório';
        var id = window.endoCanalAdd(nome, 'acessorio');
        window.endoCanalSetActive(id);
        window.endoCanalRenderChips();
    };

    // Aplica um dente: se mudou de dente, regenera os canais sugeridos.
    // Mantém os canais se o usuário re-digitar o MESMO dente (não apaga trabalho).
    window.endoCanalApplyTooth = function(num){
        num = String(num == null ? '' : num).trim();
        var st = window.endoCanalState;
        if (st.selectedTooth === num && Object.keys(st.canals).length){
            window.endoCanalRenderChips();
            return;
        }
        st.selectedTooth = num;
        st.canals = {};
        st.activeCanalId = null;
        var sugeridos = window.endoCanalSuggestForTooth(num);
        sugeridos.forEach(function(nome){ window.endoCanalAdd(nome, 'principal'); });
        var ids = Object.keys(st.canals);
        st.activeCanalId = ids.length ? ids[0] : null;
        window.endoCanalRenderChips();
    };

    // ---------------- UI: CHIP STRIP NA ODONTOMETRIA ----------------
    // Cria (uma vez) o contêiner de chips logo após o seletor de dente.
    window.endoCanalEnsureUI = function(){
        var modal = document.getElementById('odontometria-modal');
        if (!modal) return;
        if (document.getElementById('odonto-canal-strip')) return;
        var input = document.getElementById('odonto-dente-input');
        if (!input) return;
        // sobe até o "cartão" do seletor de dente (a div com fundo/borda)
        var anchor = input.closest ? input.closest('div') : input.parentElement;
        if (!anchor) return;

        var wrap = document.createElement('div');
        wrap.id = 'odonto-canal-strip';
        wrap.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.04);padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);';
        wrap.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
                '<label style="color:#aaa;font-size:10px;font-weight:900;letter-spacing:1px;">CANAIS</label>' +
                '<button id="odonto-canal-add-acc" style="background:rgba(0,180,255,0.12);border:1px solid rgba(0,180,255,0.35);color:#3bf;font-size:9px;font-weight:800;cursor:pointer;border-radius:8px;padding:5px 9px;touch-action:manipulation;">+ Canal acessório</button>' +
            '</div>' +
            '<div id="odonto-canal-chips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>' +
            '<div id="odonto-canal-hint" style="font-size:8px;color:rgba(255,255,255,0.32);margin-top:7px;line-height:1.5;">Toque para ativar · toque 2× para renomear · ✕ remove</div>';
        anchor.parentNode.insertBefore(wrap, anchor.nextSibling);

        var addBtn = document.getElementById('odonto-canal-add-acc');
        if (addBtn){
            var addAcc = function(e){ if(e){e.preventDefault();} window.endoCanalAddAccessory(); };
            addBtn.addEventListener('click', addAcc);
            addBtn.addEventListener('touchend', addAcc, { passive:false });
        }
        window.endoCanalRenderChips();
    };

    var _lastTapId = null, _lastTapAt = 0;
    window.endoCanalRenderChips = function(){
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
            var isAcc = (c.tipo === 'acessorio');
            var chip = document.createElement('div');
            chip.dataset.canalId = id;
            chip.style.cssText =
                'display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:20px;cursor:pointer;' +
                'font-size:11px;font-weight:800;touch-action:manipulation;transition:all .15s;' +
                'border:1.5px solid ' + (active ? '#ffd700' : (isAcc ? 'rgba(0,180,255,0.35)' : 'rgba(255,255,255,0.15)')) + ';' +
                'background:' + (active ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.03)') + ';' +
                'color:' + (active ? '#ffd700' : (isAcc ? '#3bf' : '#bbb')) + ';';
            var label = document.createElement('span');
            label.textContent = c.nome + (isAcc ? ' ·acc' : '');
            chip.appendChild(label);
            // botão remover (não deixa remover o último canal)
            if (ids.length > 1){
                var x = document.createElement('span');
                x.textContent = '✕';
                x.style.cssText = 'font-size:10px;opacity:.65;font-weight:900;';
                x.addEventListener('click', function(ev){ ev.stopPropagation(); window.endoCanalRemove(id); window.endoCanalRenderChips(); });
                x.addEventListener('touchend', function(ev){ ev.stopPropagation(); ev.preventDefault(); window.endoCanalRemove(id); window.endoCanalRenderChips(); }, { passive:false });
                chip.appendChild(x);
            }
            // tap = ativar; tap duplo = renomear
            var onTap = function(ev){
                if (ev) ev.preventDefault();
                var now = Date.now();
                if (_lastTapId === id && (now - _lastTapAt) < 320){
                    _lastTapAt = 0; _lastTapId = null;
                    var nn = (typeof prompt === 'function') ? prompt('Renomear canal:', c.nome) : null;
                    if (nn !== null) { window.endoCanalRename(id, nn); }
                    window.endoCanalRenderChips();
                    return;
                }
                _lastTapId = id; _lastTapAt = now;
                window.endoCanalSetActive(id);
                window.endoCanalRenderChips();
            };
            chip.addEventListener('click', onTap);
            chip.addEventListener('touchend', onTap, { passive:false });
            box.appendChild(chip);
        });
    };

    // ---------------- WIRES (sem editar as funções originais) ----------------
    // Ao abrir a Odontometria, garante a UI de canais e re-renderiza os chips.
    if (typeof window.openOdontometria3D === 'function' && !window.openOdontometria3D._canalWrapped){
        var _origOpen = window.openOdontometria3D;
        window.openOdontometria3D = function(){
            var r = _origOpen.apply(this, arguments);
            try {
                window.endoCanalEnsureUI();
                // se já há nº de dente no input, aplica o schema
                var di = document.getElementById('odonto-dente-input');
                if (di && di.value) window.endoCanalApplyTooth(di.value);
                else window.endoCanalRenderChips();
            } catch(e){}
            return r;
        };
        window.openOdontometria3D._canalWrapped = true;
    }

    // ---------------- LIMPEZA (novo exame / casinha) ----------------
    window.clearEndoCanalState = function(){
        window.endoCanalState = { selectedTooth: '', activeCanalId: null, canals: {} };
        try { window.endoCanalRenderChips(); } catch(e){}
    };
    if (typeof window._newExamSession === 'function' && !window._newExamSession._canalWrapped){
        var _ns = window._newExamSession;
        window._newExamSession = function(){ try{ window.clearEndoCanalState(); }catch(e){} return _ns.apply(this, arguments); };
        window._newExamSession._canalWrapped = true;
    }
    if (typeof window.returnToHub === 'function' && !window.returnToHub._canalWrapped){
        var _hub = window.returnToHub;
        window.returnToHub = function(){ var r = _hub.apply(this, arguments); try{ window.clearEndoCanalState(); }catch(e){} return r; };
        window.returnToHub._canalWrapped = true;
    }
})();
