
    // ===== ENDOFOCUS REFACTOR, SMART COUNTERS E INJEÇÃO DOS BOTÕES DE MODO =====
    (function(){
      // 1. SMART COUNTERS - Atualiza Verde e Branco dinamicamente
      function initSmartCounters() {
          var spans = document.querySelectorAll('#tab-endo .slice-info span');
          spans.forEach(function(span) {
              var updateHTML = function() {
                  var text = span.textContent;
                  if (text.indexOf('/') !== -1 && !span.querySelector('.c-green')) {
                      var parts = text.split('/');
                      if (parts.length === 2) {
                          span.innerHTML = '<span class="c-green">' + parts[0].trim() + '</span> <span class="c-white">/ ' + parts[1].trim() + '</span>';
                      }
                  }
              };
              
              updateHTML();
              var observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(m) {
                      if (m.type === 'childList' || m.type === 'characterData') {
                          observer.disconnect(); 
                          updateHTML();
                          observer.observe(span, { childList: true, characterData: true, subtree: true });
                      }
                  });
              });
              observer.observe(span, { childList: true, characterData: true, subtree: true });
          });
      }

      // 2. INJEÇÃO DOS NOVOS BOTÕES (Destrói Sliders e Anexa Botão Flutuante e Contador)
      function injectModeButtons() {
          ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
              var el = document.getElementById(id);
              if (!el || el.dataset.buttonsInjected) return;
              el.dataset.buttonsInjected = 'true';

              // Remove o lixo do Slider antigo (Resolve a Faixa Transparente)
              var oldSlider = el.querySelector('.slice-slider-container');
              if (oldSlider) oldSlider.remove();
              
              // Garante/Resgata a caixa do contador e a pendura direto na imagem
              var sliceInfo = el.querySelector('.slice-info');
              if (!sliceInfo) {
                  sliceInfo = document.createElement('div');
                  sliceInfo.className = 'slice-info';
                  sliceInfo.innerHTML = '<span></span>';
              }
              el.appendChild(sliceInfo);

              // Cria o Botão Flutuante (Apenas ícone)
              var btn = document.createElement('button');
              btn.className = 'vp-mode-btn mode-scroll';
              btn.innerHTML = '↕'; // BUG 2: começa em SCROLL (navegar fatias)
              
              var toggleFunc = function(e) { 
                  e.preventDefault(); e.stopPropagation(); 
                  window.toggleEndoMode(id, btn); 
              };
              btn.addEventListener('touchstart', toggleFunc, {passive: false, capture: true});
              btn.addEventListener('mousedown', toggleFunc, {capture: true});

              el.appendChild(btn);
              el._modeBtn = btn;            // referência p/ sincronizar com a mira
              el.dataset.touchMode = 'scroll';

              // #2: Botão ESPELHAR por viewport (inverte SÓ este corte; aparece só no oblíquo)
              var mirrorBtn = document.createElement('button');
              mirrorBtn.className = 'vp-mirror-btn';
              mirrorBtn.innerHTML = '⇋';
              mirrorBtn.title = 'Espelhar este corte';
              mirrorBtn.style.display = 'none';
              var mirrorFunc = function(e) {
                  e.preventDefault(); e.stopPropagation();
                  window.toggleViewportMirror(id, mirrorBtn);
              };
              mirrorBtn.addEventListener('touchstart', mirrorFunc, {passive: false, capture: true});
              mirrorBtn.addEventListener('mousedown', mirrorFunc, {capture: true});
              el.appendChild(mirrorBtn);
              el._mirrorBtn = mirrorBtn;

              // Garante que o StackScrollTool do Cornerstone é ativado/adicionado
              el.addEventListener('cornerstoneimagerendered', function() {
                  if (!el.dataset.stackScrollAdded) {
                      try { cornerstoneTools.addToolForElement(el, cornerstoneTools.StackScrollTool); } catch(e) {}
                      el.dataset.stackScrollAdded = 'true';
                      // BUG 2: garante SCROLL realmente ATIVO já no início (não WW/WC),
                      // exceto quando a mira/obliquo estiver ligada.
                      if (!isCrosshairActive) {
                          try {
                              cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 1, isTouchActive: true });
                              cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
                          } catch(e) {}
                      }
                  }
              });

  // Intercepta a rolagem para sincronizar 3D, Miras, e demais views
              el.addEventListener('cornerstonetoolsstackscroll', function(e) {
                  var currentIndex = e.detail.newImageIdIndex;
                  var plane = (id === 'endo-axial') ? 'axial' : (id === 'endo-coronal') ? 'coronal' : 'sagittal';

                  if (obliqueState && obliqueState.isActive) {
                      // BUG 6: rolar UM corte muda só o offset daquele plano e re-renderiza
                      // só a imagem dele; os outros dois apenas redesenham as linhas (updateImage),
                      // sem trocar de fatia e sem recentralizar a mira.
                      obliqueState.sliceOffsets[plane] = currentIndex - obliqueState.baseIndices[plane];
                      if (typeof updateObliqueViewports === 'function') updateObliqueViewports(plane);
                      ['axial','coronal','sagittal'].forEach(function(pl){
                          if (pl === plane) return;
                          var oel = document.getElementById('endo-'+pl);
                          if (!oel) return;
                          try { if (cornerstone.getEnabledElements().some(function(en){return en.element===oel;})) cornerstone.updateImage(oel); } catch(err){}
                      });
                  } else {
                      if (id === 'endo-axial') crosshairState.z = currentIndex;
                      else if (id === 'endo-coronal') crosshairState.y = currentIndex;
                      else if (id === 'endo-sagittal') crosshairState.x = currentIndex;

                      if (typeof synchronizeMobileViews === 'function') synchronizeMobileViews();
                  }
              });
          });
      }

      // Aplica o modo de toque a um viewport endo (mira / scroll / wwwc)
      window.applyEndoTouchMode = function(el, btn, mode) {
          if (!el || !btn) return;
          btn.classList.remove('mode-mira', 'mode-scroll', 'mode-wwwc');
          if (mode === 'scroll') {
              btn.classList.add('mode-scroll'); btn.innerHTML = '↕';
              try {
                  cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 1, isTouchActive: true });
                  cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
              } catch(e) {}
          } else if (mode === 'wwwc') {
              btn.classList.add('mode-wwwc'); btn.innerHTML = '◑';
              try {
                  cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
                  cornerstoneTools.setToolDisabledForElement(el, 'StackScroll');
              } catch(e) {}
          } else { // 'mira' — o dedo controla a mira/planos oblíquos
              btn.classList.add('mode-mira'); btn.innerHTML = '🎯';
              try {
                  cornerstoneTools.setToolDisabledForElement(el, 'StackScroll');
                  cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
              } catch(e) {}
          }
          el.dataset.touchMode = mode;
          try { cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {}); cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {}); } catch(e){}
      };

      // 3. FUNÇÃO DE TROCA DE MODO
      //    - SEM mira: alterna Scroll <-> WW/WC (comportamento original)
      //    - COM mira/oblíquo ativos: cicla Mira -> Scroll -> WW/WC -> Mira
      //      (permite usar WL e scroll sem mover a mira; em "Mira" o dedo move a mira)
      window.toggleEndoMode = function(viewportId, btn) {
          var el = document.getElementById(viewportId);
          if (!el) return;

          if (isCrosshairActive) {
              var cur = el.dataset.touchMode || 'mira';
              var next = (cur === 'mira') ? 'scroll' : (cur === 'scroll') ? 'wwwc' : 'mira';
              window.applyEndoTouchMode(el, btn, next);
              return;
          }

          var isWwwc = btn.classList.contains('mode-wwwc');
          if (isWwwc) {
              btn.classList.remove('mode-wwwc');
              btn.classList.add('mode-scroll');
              btn.innerHTML = '↕';
              el.dataset.touchMode = 'scroll';
              try {
                  cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 1, isTouchActive: true });
                  cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
              } catch(e) {}
          } else {
              btn.classList.remove('mode-scroll');
              btn.classList.add('mode-wwwc');
              btn.innerHTML = '◑';
              el.dataset.touchMode = 'wwwc';
              try {
                  cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
                  cornerstoneTools.setToolDisabledForElement(el, 'StackScroll');
              } catch(e) {}
          }
          try { cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {}); cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {}); } catch(e){}
      };

      // #2: espelha SOMENTE o viewport indicado (independente dos demais)
      window.toggleViewportMirror = function(viewportId, btn) {
          var el = document.getElementById(viewportId);
          if (!el) return;
          try {
              var enabled = cornerstone.getEnabledElements().some(function(e){ return e.element === el; });
              if (enabled) {
                  var vp = cornerstone.getViewport(el);
                  vp.hflip = !vp.hflip;
                  cornerstone.setViewport(el, vp);
              }
          } catch(e) {}
          if (btn) btn.classList.toggle('active-mirror', el && (function(){ try { return cornerstone.getViewport(el).hflip; } catch(e){ return false; } })());
      };

      // #2: mostra/oculta os botões espelhar (um por viewport) conforme o oblíquo
      window.setViewportMirrorButtonsVisible = function(show) {
          ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
              var el = document.getElementById(id);
              if (!el || !el._mirrorBtn) return;
              el._mirrorBtn.style.display = show ? 'flex' : 'none';
              if (!show) {
                  // ao sair do oblíquo, desfaz o espelhamento deste viewport
                  el._mirrorBtn.classList.remove('active-mirror');
                  try {
                      var enabled = cornerstone.getEnabledElements().some(function(e){ return e.element === el; });
                      if (enabled) {
                          var vp = cornerstone.getViewport(el);
                          if (vp.hflip) { vp.hflip = false; cornerstone.setViewport(el, vp); }
                      }
                  } catch(e) {}
              }
          });
      };

      // 4. LÓGICA CORE DO ENDOFOCUS (Mecânica de telas)
      var ID2PLANE = { 'endo-axial':'axial', 'endo-coronal':'coronal', 'endo-sagittal':'sagittal' };
      var endoFocusActive = false;
      var endoFocusPlane = null;

      function tab(){ return document.getElementById('tab-endo'); }

      function endoApplyHierarchy(principal){
        var map = {'endo-axial':'axial','endo-coronal':'coronal','endo-sagittal':'sagittal'};
        Object.keys(map).forEach(function(id){
          var el = document.getElementById(id); if(!el) return;
          var isP = (map[id] === principal);
          el.classList.toggle('vp-principal', isP);
          el.classList.toggle('vp-mini', !isP);
        });
      }
      window.endoApplyHierarchy = endoApplyHierarchy;

      // Impede canvas de amassar ou expandir as imagens via CSS (Bug do Safari vs Cornerstone)
      function safeResizeViewports() {
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
              var el = document.getElementById(id);
              if (!el) return;
              try {
                var cvs = el.querySelectorAll('canvas');
                cvs.forEach(function(cv) {
                  cv.style.width = '';
                  cv.style.height = '';
                });

                if (cornerstone.getEnabledElements().some(function(e){ return e.element === el; })) {
                  // ANTI-PISCADA: snapshot antes do resize (que limpa o canvas);
                  // o placeholder cobre o frame até o redraw interno do Cornerstone
                  var cvP = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
                  var hadFrame = cvP && cvP.width > 0;
                  if (hadFrame) {
                      var tmpP = el._snapCv || (el._snapCv = document.createElement('canvas'));
                      if (tmpP.width !== cvP.width || tmpP.height !== cvP.height) {
                          tmpP.width = cvP.width; tmpP.height = cvP.height;
                      }
                      tmpP.getContext('2d').drawImage(cvP, 0, 0);
                  }
                  cornerstone.resize(el, true);
                  if (hadFrame) {
                      try {
                          cvP.getContext('2d').drawImage(el._snapCv, 0, 0,
                              el._snapCv.width, el._snapCv.height, 0, 0, cvP.width, cvP.height);
                      } catch (e3) {}
                  }
                  cornerstone.updateImage(el);
                }
              } catch(e) {}
            });
          });
        });
      }

// --- ENDOFOCUS DYNAMIC RESIZER PATCH (4-WAY + DOUBLE TAP RESET + UNCHAINED) ---
      window.endoFocusFr = 1.0; // #1: abre no MESMO tamanho do EndoTri (sem salto = sem faixa)
      window.endoFocusColLeft = 1;
      window.endoFocusColRight = 1;
      
      (function() {
          let focusLongPressTimer = null;
          let isDraggingFocus = false;
          let startY = 0;
          let startX = 0;
          let resizeFocusRAF = null;
          let lastHitboxTap = 0;

          window.resetEndoFocusProportions = function() {
              window.endoFocusFr = 1.0; // reset volta ao tamanho de abertura (igual EndoTri)
              window.endoFocusColLeft = 1;
              window.endoFocusColRight = 1;
              
              const tab = document.getElementById('tab-endo');
              if (tab) {
                  tab.style.setProperty('--endo-focus-main-fr', '1fr');
                  tab.style.setProperty('--endo-focus-col-left', '1fr');
                  tab.style.setProperty('--endo-focus-col-right', '1fr');
              }
              
              if (navigator.vibrate) navigator.vibrate([30, 50, 30]); 
              window.updateEndoFocusResizerPos();
              
              if (typeof safeResizeViewports === 'function') {
                  safeResizeViewports();
                  setTimeout(function(){ if (window.forceEndoCornerstoneResize) window.forceEndoCornerstoneResize(); }, 80);
              }
              
              const handle = document.getElementById('endo-focus-resizer-handle');
              if (handle) {
                  handle.classList.add('visible');
                  setTimeout(() => handle.classList.remove('visible'), 300);
              }
          };

          window.updateEndoFocusResizerPos = function() {
              const tab = document.getElementById('tab-endo');
              const mainEl = tab ? tab.querySelector('.ef-main') : null;
              const hitbox = document.getElementById('endo-focus-resizer-hitbox');
              if (!mainEl || !hitbox || !document.body.classList.contains('endo-focusing')) return;

              const tabRect = tab.getBoundingClientRect();
              const mainRect = mainEl.getBoundingClientRect();
              
              const minis = Array.from(tab.querySelectorAll('.ef-mini'));
              if (minis.length < 2) return;
              minis.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
              const leftMini = minis[0];

              const style = window.getComputedStyle(tab);
              const rowGap = parseFloat(style.rowGap) || 8;
              const colGap = parseFloat(style.columnGap) || 8;

              const topPos = mainRect.bottom - tabRect.top + (rowGap / 2);
              const leftPos = leftMini.getBoundingClientRect().right - tabRect.left + (colGap / 2);
              
              hitbox.style.top = topPos + 'px';
              hitbox.style.left = leftPos + 'px';
          };

          var _focusSettleTO = null;   // janela de finalização cancelável entre gestos
          var _lastGentleResize = 0;   // (legado; gentle resize não roda mais no drag)
          // ── DRAG 60FPS: estado por gesto ──
          var dragMetrics = null;      // métricas cacheadas no início do gesto
          var lastClientX = 0, lastClientY = 0;
          var pendingRAF = false;
          var _gentleRR = 0; // round-robin: 1 viewport por tique (custo/frame = 1/3)
          var _GENTLE_IDS = ['endo-axial', 'endo-coronal', 'endo-sagittal'];

          function _endoGentleResizeOne(id) {
              var el = document.getElementById(id);
              if (!el) return;
              var cv = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
              if (!cv) return;
              var w = el.clientWidth, h = el.clientHeight;
              if (Math.abs(cv.width - w) <= 2 && Math.abs(cv.height - h) <= 2) return;
              try {
                  if (!cornerstone.getEnabledElements().some(function (e) { return e.element === el; })) return;
                  // snapshot em canvas CACHEADO (sem alocação por tique = sem pico de GC)
                  var tmp = el._snapCv || (el._snapCv = document.createElement('canvas'));
                  if (tmp.width !== cv.width || tmp.height !== cv.height) {
                      tmp.width = cv.width; tmp.height = cv.height;
                  }
                  tmp.getContext('2d').drawImage(cv, 0, 0);
                  cornerstone.resize(el, true);
                  cv.getContext('2d').drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, cv.width, cv.height);
                  cornerstone.updateImage(el);
              } catch (e) {}
          }

      // DESATIVADO NO DRAG: o gentle resize (snapshot+resize+drawImage a
          // cada ~110ms) era a causa do "anda-para". _endoGentleResizeOne fica
          // definido acima para uso futuro, mas NINGUÉM o chama durante o gesto.
          // Esta função permanece só por compatibilidade com chamadas externas.
          function throttledFocusResize() {
              if (window._endoFocusDragging) return; // ZERO cornerstone no drag
              if (resizeFocusRAF) return;
              resizeFocusRAF = requestAnimationFrame(() => {
                  window.updateEndoFocusResizerPos();
                  resizeFocusRAF = null;
              });
          }

          window.injectEndoFocusResizer = function() {
              if (document.getElementById('endo-focus-resizer-hitbox')) return;
              const tab = document.getElementById('tab-endo');
              if (!tab) return;
              
              const hitbox = document.createElement('div');
              hitbox.id = 'endo-focus-resizer-hitbox';
              
              const handle = document.createElement('div');
              handle.id = 'endo-focus-resizer-handle';
              handle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="#00E5FF" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
                  '<polyline points="12 5 12 2 9 5"></polyline>' +
                  '<polyline points="12 5 12 2 15 5"></polyline>' +
                  '<polyline points="12 19 12 22 9 19"></polyline>' +
                  '<polyline points="12 19 12 22 15 19"></polyline>' +
                  '<polyline points="5 12 2 12 5 9"></polyline>' +
                  '<polyline points="5 12 2 12 5 15"></polyline>' +
                  '<polyline points="19 12 22 12 19 9"></polyline>' +
                  '<polyline points="19 12 22 12 19 15"></polyline>' +
                  '<line x1="2" y1="12" x2="22" y2="12"></line>' +
                  '<line x1="12" y1="2" x2="12" y2="22"></line>' +
              '</svg>';
              
              hitbox.appendChild(handle);
              tab.appendChild(hitbox);
              
              const onStart = (e) => {
                  if (!document.body.classList.contains('endo-focusing')) return;
                  if (e.touches && e.touches.length > 1) return;
                  
                  const now = Date.now();
                  if (now - lastHitboxTap < 350) {
                      if (focusLongPressTimer) clearTimeout(focusLongPressTimer);
                      window.resetEndoFocusProportions();
                      lastHitboxTap = 0;
                      return; 
                  }
                  lastHitboxTap = now;
                  
                  e.preventDefault();
                  e.stopPropagation();
                  
                  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                  startX = clientX;
                  startY = clientY;
                  
                  if (focusLongPressTimer) clearTimeout(focusLongPressTimer);
                  
                  focusLongPressTimer = setTimeout(() => {
                      isDraggingFocus = true;
                      window._endoFocusDragging = true; // flag p/ watchdog externo
                      handle.classList.add('visible', 'active-drag');
                      // RESIZE FLUIDO: durante o arrasto o canvas é esticado por CSS
                      // (object-fit) p/ a imagem nunca sumir; o resize real roda no fim.
                      // Novo gesto CANCELA a janela de finalização do gesto anterior
                      // (senão o setTimeout pendente removia a classe no meio do
                      // novo arrasto e a imagem parava de acompanhar o box).
                      if (_focusSettleTO) { clearTimeout(_focusSettleTO); _focusSettleTO = null; }
                      window._endoFocusSuppressRO = false;
                      document.body.classList.add('endo-live-resize');
                      window._endoFocusSuppressRO = true; // RO mudo já no início do gesto
                      if (window.snapshotEndoResizeState) {
  window.snapshotEndoResizeState();
}

                      // ── CACHE DE MÉTRICAS (1 leitura por GESTO, não por toque) ──
                      // Elimina getBoundingClientRect/getComputedStyle do onMove:
                      // era leitura de layout a cada touchmove = reflow forçado.
                      (function cacheDragMetrics() {
                          var r = tab.getBoundingClientRect();
                          var cs = window.getComputedStyle(tab);
                          var hb = document.getElementById('endo-focus-resizer-hitbox');
                          var hbCS = hb ? window.getComputedStyle(hb) : null;
                          dragMetrics = {
                              top: r.top, left: r.left,
                              pt: parseFloat(cs.paddingTop) || 8,
                              pb: parseFloat(cs.paddingBottom) || 8,
                              pl: parseFloat(cs.paddingLeft) || 8,
                              pr: parseFloat(cs.paddingRight) || 8,
                              rowGap: parseFloat(cs.rowGap) || 8,
                              colGap: parseFloat(cs.columnGap) || 8,
                              // posição-base do hitbox (deltas via translate3d)
                              hbTop0: hb ? (parseFloat(hb.style.top) || 0) : 0,
                              hbLeft0: hb ? (parseFloat(hb.style.left) || 0) : 0,
                              hbBaseTransform: (hbCS && hbCS.transform !== 'none') ? hbCS.transform : ''
                          };
                          dragMetrics.totalH = r.height - dragMetrics.pt - dragMetrics.pb - dragMetrics.rowGap;
                          dragMetrics.totalW = r.width  - dragMetrics.pl - dragMetrics.pr - dragMetrics.colGap;
                          if (hb) hb.style.willChange = 'transform';
                      })();
                      lastClientX = startX; lastClientY = startY;
                      pendingRAF = false;
                      if (navigator.vibrate) navigator.vibrate(50);
                      
                      document.querySelectorAll('#tab-endo .viewport-element').forEach(el => {
                          el.style.pointerEvents = 'none';
                      });
                  }, 400); 
                  
                  window.addEventListener('touchmove', onMove, { passive: false });
                  window.addEventListener('mousemove', onMove, { passive: false });
                  window.addEventListener('touchend', onEnd);
                  window.addEventListener('mouseup', onEnd);
                  // #1 FIX: iOS dispara touchcancel (notificação, ligação, gesto de
                  // borda) no meio do arrasto — sem este listener, o onEnd nunca
                  // rodava, a classe endo-live-resize ficava PRESA no body e o
                  // canvas ficava esticado com bitmap velho (as faixas cinzas).
                  window.addEventListener('touchcancel', onEnd);
              };

              // ── REFIT LOW-RES DURANTE O DRAG ──
              // Re-renderiza o corte no tamanho REAL do box, com bitmap a 55%
              // da resolução (≈30% do custo) — o CSS estica de volta. Snapshot
              // como placeholder = zero frame em branco. Resolução cheia volta
              // no settle do onEnd (inalterado).
              var _lastLowResRefit = 0;
              var LOWRES_FACTOR = 0.55;   // knob: 0.45 = mais leve, 0.7 = mais nítido
              var LOWRES_EVERY  = 130;    // ms entre refits (knob de fluidez)

            function _endoLowResRefitAll() {
    var preserveObliqueViewport = false;

    try {
        preserveObliqueViewport =
            typeof obliqueState !== 'undefined' &&
            obliqueState &&
            obliqueState.isActive === true;
    } catch (e) {
        preserveObliqueViewport = false;
    }

    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.offsetWidth === 0) return;

        var cv = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
        if (!cv) return;

        var targetW = Math.max(32, Math.round(el.clientWidth * LOWRES_FACTOR));
        var targetH = Math.max(32, Math.round(el.clientHeight * LOWRES_FACTOR));

        // Só refaz se o box mudou de verdade desde o último refit.
        if (Math.abs(cv.width - targetW) <= 6 && Math.abs(cv.height - targetH) <= 6) return;

        try {
            var enabled = cornerstone.getEnabledElements().some(function (e) {
                return e.element === el;
            });

            if (!enabled) return;

            var oldViewport = null;

            if (preserveObliqueViewport) {
                try {
                    oldViewport = cornerstone.getViewport(el);
                } catch (e0) {
                    oldViewport = null;
                }
            }

            // Snapshot cacheado = placeholder sem frame vazio.
            var tmp = el._snapCv || (el._snapCv = document.createElement('canvas'));

            if (tmp.width !== cv.width || tmp.height !== cv.height) {
                tmp.width = cv.width;
                tmp.height = cv.height;
            }

            try {
                tmp.getContext('2d').drawImage(cv, 0, 0);
            } catch (e1) {}

            cv.width = targetW;
            cv.height = targetH;

            if (preserveObliqueViewport && oldViewport) {
                // No modo oblíquo, NÃO chama fitToWindow durante o drag.
                // Isso preserva o zoom/pan que o usuário aplicou para preencher o viewport.
                cornerstone.setViewport(el, oldViewport);
            } else {
                // Comportamento original preservado para EndoTri/EndoFocus normal.
                cornerstone.fitToWindow(el);
            }

            try {
                cv.getContext('2d').drawImage(
                    tmp,
                    0,
                    0,
                    tmp.width,
                    tmp.height,
                    0,
                    0,
                    targetW,
                    targetH
                );
            } catch (e2) {}

            cornerstone.updateImage(el);

        } catch (e) {}
    });
}
           // ── FRAME DO DRAG: toda a matemática + escrita no DOM, 1× por frame,
              //    só com métricas cacheadas. ZERO leitura de layout, ZERO Cornerstone.
              function applyLiveResizeFrame() {
                  pendingRAF = false;
                  if (!isDraggingFocus || !dragMetrics) return;
                  var m = dragMetrics;
                  var dTop = 0, dLeft = 0;

                  // --- EIXO Y (mesma matemática/limites de antes: 12%–88%, fr 0.15–6.0) ---
                  if (m.totalH > 0) {
                      var relativeY = lastClientY - m.top - m.pt;
                      var clampedY = Math.max(m.totalH * 0.12, Math.min(m.totalH * 0.88, relativeY));
                      var ratioY = clampedY / m.totalH;
                      var newFr = Math.max(0.15, Math.min(6.0, ratioY / (1 - ratioY)));
                      window.endoFocusFr = newFr;
                      tab.style.setProperty('--endo-focus-main-fr', newFr + 'fr');
                      dTop = (clampedY + m.pt + m.rowGap / 2) - m.hbTop0;
                  }

                  // --- EIXO X (10%–90%) ---
                  if (m.totalW > 0) {
                      var relativeX = lastClientX - m.left - m.pl;
                      var clampedX = Math.max(m.totalW * 0.10, Math.min(m.totalW * 0.90, relativeX));
                      var ratioX = clampedX / m.totalW;
                      window.endoFocusColLeft = ratioX;
                      window.endoFocusColRight = 1 - ratioX;
                      tab.style.setProperty('--endo-focus-col-left', ratioX + 'fr');
                      tab.style.setProperty('--endo-focus-col-right', (1 - ratioX) + 'fr');
                      dLeft = (clampedX + m.pl + m.colGap / 2) - m.hbLeft0;
                  }

                  // hitbox/handle por translate3d (camada GPU; top/left intocados),
                  // composto sobre o transform base p/ não perder centralização
                  hitbox.style.transform =
                      (m.hbBaseTransform ? m.hbBaseTransform + ' ' : '') +
                      'translate3d(' + dLeft + 'px, ' + dTop + 'px, 0)';
                      // refit periódico em baixa resolução: o corte acompanha o
                  // tamanho REAL do box durante todo o arrasto
                  var nowLR = Date.now();
                  if (nowLR - _lastLowResRefit > LOWRES_EVERY) {
                      _lastLowResRefit = nowLR;
                      _endoLowResRefitAll();
                  }
              }

              const onMove = (e) => {
                  if (!document.body.classList.contains('endo-focusing')) return;

                  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                  if (!isDraggingFocus) {
                      if (Math.abs(clientY - startY) > 10 || Math.abs(clientX - startX) > 10) {
                          clearTimeout(focusLongPressTimer);
                      }
                      return;
                  }

                  e.preventDefault();
                  e.stopPropagation();

                  // onMove SÓ captura coordenadas e agenda 1 frame — nada mais.
                  lastClientX = clientX;
                  lastClientY = clientY;
                  if (!pendingRAF) {
                      pendingRAF = true;
                      requestAnimationFrame(applyLiveResizeFrame);
                  }
              };

              const onEnd = (e) => {
                  if (focusLongPressTimer) clearTimeout(focusLongPressTimer);
                  
                  window.removeEventListener('touchmove', onMove);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('touchend', onEnd);
                  window.removeEventListener('mouseup', onEnd);
                  window.removeEventListener('touchcancel', onEnd);
                  
                  if (isDraggingFocus) {
                    // ANTI-PISCADA: canvas acompanha o box por CSS durante o gap de layout
        document.body.classList.add('endo-transitioning');
        setTimeout(function(){ document.body.classList.remove('endo-transitioning'); }, 480);
                      isDraggingFocus = false;
                      window._endoFocusDragging = false;

                      // FLICKER FIX: suprime o ResizeObserver durante a janela de
                      // estabilização; a classe endo-live-resize SÓ sai depois do
                      // resize real — a imagem nunca fica num frame "pelado".
                      window._endoFocusSuppressRO = true;

                      handle.classList.remove('visible', 'active-drag');
                      // limpa o delta do drag e reposiciona o hitbox UMA vez
                      // pelo caminho normal (top/left via updateEndoFocusResizerPos)
                      hitbox.style.transform = dragMetrics && dragMetrics.hbBaseTransform
                          ? dragMetrics.hbBaseTransform : '';
                      hitbox.style.willChange = '';
                      dragMetrics = null;
                      pendingRAF = false;
                      if (window.updateEndoFocusResizerPos) window.updateEndoFocusResizerPos();

                      document.querySelectorAll('#tab-endo .viewport-element').forEach(el => {
                          el.style.pointerEvents = 'auto';
                      });

requestAnimationFrame(function() {
  requestAnimationFrame(function() {
    if (window.forceEndoResizeAndWaitPaint) {
      window.forceEndoResizeAndWaitPaint(function() {
        _focusSettleTO = null;

        if (window._endoFocusDragging) return;

        document.body.classList.remove('endo-live-resize');

        requestAnimationFrame(function() {
          window._endoFocusSuppressRO = false;

          document.querySelectorAll('#tab-endo .viewport-element').forEach(function(el) {
            delete el._endoResizeBefore;
          });
        });
      });
    }
  });
});
                  }
              };

              hitbox.addEventListener('touchstart', onStart, { passive: false });
              hitbox.addEventListener('mousedown', onStart);
          };
      })();

  window.endoFocusEnter = function(plane) {
        var t = tab(); if (!t) return;
        
        // 1. MÁGICA AQUI: Salva o estado exato de Zoom/Pan ANTES do grid quebrar
        if (window.snapshotEndoResizeState) window.snapshotEndoResizeState();

        // 2. Aciona o modo de transição (o CSS segura o canvas pela GPU)
        document.body.classList.add('endo-transitioning');
        setTimeout(function(){ document.body.classList.remove('endo-transitioning'); }, 480);
        
        // 3. SILENCIA o ResizeObserver para ele não brigar com nosso código
        window._endoFocusSuppressRO = true;
        
        endoFocusActive = true;
        endoFocusPlane = plane;
        
        // 4. Quebra o Grid CSS (Tamanho das divs muda aqui)
        t.classList.remove('endo-focus-main-axial', 'endo-focus-main-coronal', 'endo-focus-main-sagittal');
        t.classList.add('endo-focus-active', 'endo-focus-main-' + plane);
        document.body.classList.add('endo-focusing');
        
        Object.keys(ID2PLANE).forEach(function(id) {
          var el = document.getElementById(id);
          if (!el) return;
          var isMain = (ID2PLANE[id] === plane);
          el.classList.toggle('ef-main', isMain);
          el.classList.toggle('ef-mini', !isMain);
        });

        if (typeof window.injectEndoFocusResizer === 'function') {
            window.injectEndoFocusResizer();
            t.style.setProperty('--endo-focus-main-fr', `${window.endoFocusFr || 1.0}fr`);
            t.style.setProperty('--endo-focus-col-left', `${window.endoFocusColLeft || 1}fr`);
            t.style.setProperty('--endo-focus-col-right', `${window.endoFocusColRight || 1}fr`);
        }

        if (typeof updateMprContextButtons === 'function') updateMprContextButtons();

        // 5. Usa EXCLUSIVAMENTE a nossa função blindada (Nada de safeResizeViewports)
        if (window.forceEndoResizeAndWaitPaint) {
            window.forceEndoResizeAndWaitPaint(function() {
                // Ao terminar de pintar a tela limpa, religa o ResizeObserver
                window._endoFocusSuppressRO = false;
            });
        }
        
        // Atualiza a posição do Handle de Resize
        if (typeof window.updateEndoFocusResizerPos === 'function') {
            setTimeout(window.updateEndoFocusResizerPos, 80);
            setTimeout(window.updateEndoFocusResizerPos, 240);
        }
      };

      window.endoFocusExit = function() {
        var t = tab(); if (!t) return;
  
        // 1. Salva o Zoom/Pan atual ANTES de devolver para a grade pequena
        if (window.snapshotEndoResizeState) window.snapshotEndoResizeState();

        document.body.classList.add('endo-transitioning');
        setTimeout(function(){ document.body.classList.remove('endo-transitioning'); }, 480);
        
        // Silencia o ResizeObserver
        window._endoFocusSuppressRO = true;
        
        endoFocusActive = false;
        endoFocusPlane = null;
        
        t.classList.remove('endo-focus-active', 'endo-focus-main-axial', 'endo-focus-main-coronal', 'endo-focus-main-sagittal');
        document.body.classList.remove('endo-focusing');
        
        Object.keys(ID2PLANE).forEach(function(id) {
          var el = document.getElementById(id);
          if (!el) return;
          el.classList.remove('ef-main', 'ef-mini');
        });

        if (typeof updateMprContextButtons === 'function') updateMprContextButtons();
        
        // 2. Chama o Render ciente do Snapshot (Mantém a proporção perfeitamente)
        if (window.forceEndoResizeAndWaitPaint) {
            window.forceEndoResizeAndWaitPaint(function() {
                window._endoFocusSuppressRO = false;
            });
        }
      };                                                                             

      window.endoFocusToggle = function(plane) {
        if (!endoFocusActive) {
          endoFocusEnter(plane);
        } else {
          if (endoFocusPlane === plane) {
            endoFocusExit();
          } else {
            endoFocusEnter(plane);
          }
        }
      };

      function attachDoubleTap(el, plane) {
        var lastT = 0, sx = 0, sy = 0, moved = false;
        el.addEventListener('touchstart', function(e){
          var t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false;
        }, {passive:true});
        el.addEventListener('touchmove', function(e){
          var t = e.touches[0];
          if(Math.abs(t.clientX-sx) > 12 || Math.abs(t.clientY-sy) > 12) moved = true;
        }, {passive:true});
        el.addEventListener('touchend', function(e){
          if(moved){ lastT = 0; return; }
          var now = Date.now();
          if(now - lastT < 320){ lastT = 0; endoFocusToggle(plane); }
          else { lastT = now; }
        }, {passive:true});
        
        el.addEventListener('dblclick', function(){ endoFocusToggle(plane); });
      }

      document.addEventListener('DOMContentLoaded', function(){
        Object.keys(ID2PLANE).forEach(function(id){
          var el = document.getElementById(id);
          if(el) attachDoubleTap(el, ID2PLANE[id]);
        });
        
        endoApplyHierarchy('axial');

        // Modifica a DOM para injetar os Botões SCROLL/WWWC e Contadores Independentes
        injectModeButtons();

        // Inicia formatação de alta performance dos números
        setTimeout(initSmartCounters, 1500); 
      });
    })();
    