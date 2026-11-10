
    // ===== ENDOTOOLS (2A.1) — controle do bottom sheet =====
    (function(){
      var sheet, backdrop, fab;
      function els(){
        sheet    = sheet    || document.getElementById('endotools-sheet');
        backdrop = backdrop || document.getElementById('endotools-backdrop');
        fab      = fab      || document.getElementById('endotools-fab');
      }
      // Oculta/restaura as gavetas via inline (vence qualquer especificidade)
      function setDrawersHidden(on){
        ['groupLeft','groupRight'].forEach(function(id){
          var g = document.getElementById(id);
          if(!g) return;
          if(on){
            g.style.setProperty('display','none','important');
          } else {
            g.style.removeProperty('display');
          }
        });
      }
      // Posição do FAB conforme o estado da dock: dock visível => acima dela;
      // dock oculta (.hidden) => mais baixo, livre do grip de 22px.
      function syncFabToDock(){
        els(); if(!fab) return;
        var dock = document.getElementById('dockNav');
        var hidden = dock && dock.classList.contains('hidden');
        fab.style.bottom = hidden
          ? 'calc(30px + var(--safe-bottom,0px))'
          : 'calc(108px + var(--safe-bottom,0px))';
      }
      window._endoToolsSyncFab = syncFabToDock;
      window._setDrawersHidden = setDrawersHidden;

      window.endoToolsOpen = function(){
        els(); if(!sheet) return;
        document.body.classList.add('endotools-open'); // some swipe-zones + FAB (via CSS)
        setDrawersHidden(true);                          // some gavetas (via inline)
        backdrop.classList.add('open');
        sheet.style.transform = '';        // limpa drag residual
        sheet.classList.add('open');
      };
      window.endoToolsClose = function(){
        els(); if(!sheet) return;
        sheet.classList.remove('open');
        sheet.style.transform = '';
        backdrop.classList.remove('open');
        document.body.classList.remove('endotools-open');
        setDrawersHidden(false);                         // restaura gavetas
      };
      window.endoToolsToggle = function(){
        els(); if(!sheet) return;
        if(sheet.classList.contains('open')) endoToolsClose(); else endoToolsOpen();
      };
      // Fecha o sheet e dispara o handler após a transição (para a ferramenta aparecer limpa)
      window.endoToolsRun = function(fn){
        endoToolsClose();
        setTimeout(function(){ try{ fn(); }catch(e){ console.warn('[EndoTools]', e); } }, 200);
      };
      // Visibilidade do FAB por aba + fecha o sheet ao sair da Endo
      window.endoToolsSetTabVisibility = function(id){
        if(id === 'endo'){ document.body.classList.add('endotab'); syncFabToDock(); }
        else {
          document.body.classList.remove('endotab');
          endoToolsClose();
          if(typeof window.endoFocusExit === 'function') window.endoFocusExit();
        }
      };

      // Arrastar para baixo → fechar (gesto iOS)
      document.addEventListener('DOMContentLoaded', function(){
        els(); if(!sheet) return;

        // Reposiciona o FAB sempre que a dock muda de estado (abre/fecha)
        var dock = document.getElementById('dockNav');
        if(dock && window.MutationObserver){
          new MutationObserver(syncFabToDock)
            .observe(dock, { attributes:true, attributeFilter:['class'] });
        }
        syncFabToDock();

        var startY=0, curY=0, dragging=false;
        var grab = document.getElementById('endotools-grabber');
        function onStart(y){ dragging=true; startY=y; curY=y; sheet.style.transition='none'; }
        function onMove(y){ if(!dragging) return; curY=y; var d=Math.max(0,y-startY); sheet.style.transform='translateY('+d+'px)'; }
        function onEnd(){ if(!dragging) return; dragging=false; sheet.style.transition='';
          if((curY-startY) > 90){ endoToolsClose(); } else { sheet.style.transform=''; } }
        var head = document.getElementById('endotools-head');
        [grab, head].forEach(function(h){
          if(!h) return;
          h.addEventListener('touchstart', function(e){ onStart(e.touches[0].clientY); }, {passive:true});
          h.addEventListener('touchmove',  function(e){ onMove(e.touches[0].clientY); }, {passive:true});
          h.addEventListener('touchend',   onEnd, {passive:true});
        });
      });
    })();
    