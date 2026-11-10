
/* ==========================================================
   PATCH ENDOTRI — BARRA DE PROGRESSO PREMIUM + RESET DE CORTES
   ========================================================== */
(function(){
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // BARRA DE PROGRESSO PREMIUM (SMART TRACK) - TOPO INTERATIVO
    // ════════════════════════════════════════════════════════════════
    var PROGRESS_COLORS = {
        'endo-axial':    'linear-gradient(90deg, #ff4757, #ff8a97)',
        'endo-coronal':  'linear-gradient(90deg, #0066FF, #4A90E2)',
       'endo-sagittal': 'linear-gradient(90deg, #B88900, #D6A21B)'
    };
    var GLOW_COLORS = {
        'endo-axial':    'rgba(255, 71, 87, 0.5)',
        'endo-coronal':  'rgba(74, 144, 226, 0.5)',
      'endo-sagittal': 'rgba(214, 162, 27, 0.28)'
    };

    if (!document.getElementById('premium-progress-style')) {
        var st = document.createElement('style');
        st.id = 'premium-progress-style';
        st.innerHTML = `
            .vp-top-progress-hitbox { position: absolute; top: 0; left: 0; width: 100%; height: 24px; z-index: 140; cursor: pointer; touch-action: none; }
            .vp-top-progress-track { position: absolute; top: 5px; left: 16px; right: 16px; height: 5px; border-radius: 4px; background: rgba(0,0,0,0.5); box-shadow: inset 1px 1px 3px rgba(0,0,0,0.9); overflow: hidden; }
            .vp-top-progress-fill { height: 100%; border-radius: 4px; transition: width 0.05s linear; }
            body.theme-light-clinical .vp-top-progress-track { background: #E6EDF4; box-shadow: inset 2px 2px 4px rgba(140, 155, 175, 0.4), inset -2px -2px 4px #FFFFFF; }
            #tab-endo.endo-focus-active .vp-top-progress-hitbox { display: none !important; }
        `;
        document.head.appendChild(st);
    }

    function ensureProgress(el) {
        if (el._progressTrack) return;

        var hitBox = document.createElement('div');
        hitBox.className = 'vp-top-progress-hitbox';
        var track = document.createElement('div');
        track.className = 'vp-top-progress-track';
        var fill = document.createElement('div');
        fill.className = 'vp-top-progress-fill';
      fill.style.background = PROGRESS_COLORS[el.id] || '#fff';
        fill.style.boxShadow = '0 0 8px ' + (GLOW_COLORS[el.id] || 'rgba(255,255,255,0.5)');
       
        track.appendChild(fill);
        hitBox.appendChild(track);
        el.appendChild(hitBox);

        el._progressTrack = track;
        el._progressFill = fill;
        el._progressFrac = 0;
        el._progressMax = 1;

        function updateFromEvent(e) {
            if (el._progressMax <= 1) return;
            var rect = track.getBoundingClientRect();
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var pct = (clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            var targetSlice = Math.round(pct * (el._progressMax - 1));

            if (el.id === 'endo-axial') crosshairState.z = targetSlice;
            else if (el.id === 'endo-coronal') crosshairState.y = targetSlice;
            else if (el.id === 'endo-sagittal') crosshairState.x = targetSlice;

            if (typeof obliqueState !== 'undefined' && obliqueState.isActive) {
                if (typeof updateObliqueViewports === 'function') updateObliqueViewports();
            } else if (typeof synchronizeMobileViews === 'function') {
                synchronizeMobileViews();
            }
        }

        var isDragging = false;
        hitBox.addEventListener('mousedown', function(e) { isDragging = true; updateFromEvent(e); });
        window.addEventListener('mousemove', function(e) { if (isDragging) updateFromEvent(e); });
        window.addEventListener('mouseup', function() { isDragging = false; });
        hitBox.addEventListener('touchstart', function(e) { isDragging = true; updateFromEvent(e); }, {passive: false});
        window.addEventListener('touchmove', function(e) { 
            if (isDragging) { e.preventDefault(); updateFromEvent(e); } 
        }, {passive: false});
        window.addEventListener('touchend', function() { isDragging = false; });
    }

    function applyFrac(el) {
        if (!el._progressFill) return;
        var f = Math.max(0, Math.min(1, el._progressFrac || 0));
        el._progressFill.style.width = (f * 100) + '%';
    }

    window.updateEndoSliceProgress = function(id, index, max) {
        var el = document.getElementById(id);
        if (!el) return;
        ensureProgress(el);
        el._progressMax = max; 
        el._progressFrac = (max > 1) ? (index / (max - 1)) : 0;
        applyFrac(el);
    };

    /* ── RESET DE CORTES NO ENDOTRI ── */
    var lastTriTap = 0;
    function injectTriResetHitbox() {
        if (document.getElementById('endotri-reset-hitbox')) return;
        var tab = document.getElementById('tab-endo');
        if (!tab) return;
        var hb = document.createElement('div');
        hb.id = 'endotri-reset-hitbox';
        tab.appendChild(hb);

        var onTap = function(e) {
            if (document.body.classList.contains('endo-focusing')) return;
            var now = Date.now();
            if (now - lastTriTap < 350) {
                lastTriTap = 0;
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
           if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
                // Duplo-toque no centro do EndoTri = MESMA função do botão Reset (gaveta
                // direita). resetAll() já recentraliza E zera zoom/pan/WW-WC/flip/etc.
                if (typeof resetAll === 'function') resetAll();
            } else {
                lastTriTap = now;
            }
        };
        hb.addEventListener('touchstart', onTap, { passive: false });
        hb.addEventListener('mousedown', onTap);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectTriResetHitbox);
    } else {
        injectTriResetHitbox();
    }

    /* ── ENDOTOOLS: sincroniza o marcador de ATIVO dos cards ── */
    function endoToolsSyncActive() {
        function mark(id, on) {
            var el = document.getElementById(id);
            if (el) el.classList.toggle('active-tool', !!on);
        }
        try { mark('et-card-lima', typeof limaState !== 'undefined' && limaState && limaState.active); } catch(e) {}
        try {
            var segP = document.getElementById('seg-inline-panel');
            var segOn = !!(segP && segP.style.display !== 'none' && segP.offsetParent !== null);
            var obt = !!(segP && segP.classList.contains('obtur-mode'));
            mark('et-card-canal', segOn && !obt);
            mark('et-card-obtur', segOn && obt);
        } catch(e) {}
    }
    window.endoToolsSyncActive = endoToolsSyncActive;
    var _origEtToggle = window.endoToolsToggle;
    if (typeof _origEtToggle === 'function') {
        window.endoToolsToggle = function() {
            _origEtToggle.apply(this, arguments);
            setTimeout(endoToolsSyncActive, 30);
        };
    }

    /* ── BUG 5: FAIXA NO ENDOFOCUS ── */
    window.endoEnsureCanvasConsistency = function() {
        var fixed = false;
        if (document.body.classList.contains('endo-live-resize') && !window._endoFocusDragging && !window._endoFocusSuppressRO) {
            document.body.classList.remove('endo-live-resize');
            fixed = true;
        }
        ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || el.offsetWidth === 0) return;
            var cv = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
            if (!cv) return;
            if (Math.abs(cv.width - el.clientWidth) > 2 || Math.abs(cv.height - el.clientHeight) > 2) {
        try {
                    if (cornerstone.getEnabledElements().some(function(e){ return e.element === el; })) {
                        // ANTI-PISCADA: snapshot antes do resize (que limpa o canvas);
                        // cobre o frame até o redraw interno do Cornerstone
                        var hadFrame = cv.width > 0;
                        var tmpH = null;
                        if (hadFrame) {
                            tmpH = el._snapCv || (el._snapCv = document.createElement('canvas'));
                            if (tmpH.width !== cv.width || tmpH.height !== cv.height) {
                                tmpH.width = cv.width; tmpH.height = cv.height;
                            }
                            tmpH.getContext('2d').drawImage(cv, 0, 0);
                        }
                        cv.style.width = ''; cv.style.height = '';
                        cornerstone.resize(el, true);
                        if (hadFrame) {
                            try {
                                cv.getContext('2d').drawImage(tmpH, 0, 0,
                                    tmpH.width, tmpH.height, 0, 0, cv.width, cv.height);
                            } catch(eh) {}
                        }
                        cornerstone.updateImage(el);
                        if (typeof _paintAllFilters === 'function') { try { _paintAllFilters(el); } catch(e2) {} }
                        fixed = true;
                    }
                } catch(e) {}
            }
        });
        return fixed;
    };

    setInterval(function() {
        try {
            if (window._endoFocusDragging) return;
            if (window._endoFocusSuppressRO) return;
            var t = document.getElementById('tab-endo');
            if (!t || !t.classList.contains('active')) return;
            window.endoEnsureCanvasConsistency();
        } catch(e) {}
    }, 1200);


    window.snapshotEndoResizeState = function() {
  ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;

    try {
      var enabled = cornerstone.getEnabledElements()
        .some(function(e) { return e.element === el; });

      if (!enabled) return;

      var r = el.getBoundingClientRect();
      var vp = cornerstone.getViewport(el);

      el._endoResizeBefore = {
        w: r.width,
        h: r.height,
        viewport: vp ? JSON.parse(JSON.stringify(vp)) : null
      };
    } catch(e) {}
  });
};

window.forceEndoResizeAndWaitPaint = function(done) {
  var ids = ['endo-axial', 'endo-coronal', 'endo-sagittal'];
  var pending = 0;
  var finished = false;

  function finishOnce() {
    if (finished) return;
    finished = true;

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (typeof done === 'function') done();
      });
    });
  }

  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;

    try {
      var enabled = cornerstone.getEnabledElements()
        .some(function(e) { return e.element === el; });

      if (!enabled) return;

      pending++;

      var onRendered = function() {
        el.removeEventListener('cornerstoneimagerendered', onRendered);
        pending--;

        if (pending <= 0) {
          finishOnce();
        }
      };

      el.addEventListener('cornerstoneimagerendered', onRendered);
    } catch(e) {}
  });

  if (window.forceEndoCornerstoneResize) {
    window.forceEndoCornerstoneResize();
  }

  if (pending <= 0) {
    finishOnce();
  }

  // fallback de segurança caso algum viewport não dispare evento
  setTimeout(finishOnce, 220);
};

window.forceEndoCornerstoneResize = function() {
  var preserveObliqueViewport = false;

  try {
    preserveObliqueViewport =
      typeof obliqueState !== 'undefined' &&
      obliqueState &&
      obliqueState.isActive === true;
  } catch (e0) {
    preserveObliqueViewport = false;
  }

  ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;

    try {
      var enabled = cornerstone.getEnabledElements().some(function(e) {
        return e.element === el;
      });

      if (!enabled) return;

      var before = el._endoResizeBefore;
      var oldVp = before && before.viewport ? before.viewport : cornerstone.getViewport(el);

      if (!oldVp) return;

      var r = el.getBoundingClientRect();

      // MÁGICA ANTI-FLICKER: snapshot do frame antes do Cornerstone limpar/redimensionar.
      var cv = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
      var tmpCv = null;

      if (cv && cv.width > 0) {
          tmpCv = document.createElement('canvas');
          tmpCv.width = cv.width;
          tmpCv.height = cv.height;

          try {
              tmpCv.getContext('2d').drawImage(cv, 0, 0);
          } catch (e1) {}
      }

      // Executa o resize físico do Cornerstone.
      cornerstone.resize(el, false);

      // Carimba a imagem antiga imediatamente para evitar frame preto/flicker.
      if (tmpCv && cv && cv.width > 0) {
          try {
              cv.getContext('2d').drawImage(
                  tmpCv,
                  0,
                  0,
                  tmpCv.width,
                  tmpCv.height,
                  0,
                  0,
                  cv.width,
                  cv.height
              );
          } catch (e2) {}
      }

      var newVp = JSON.parse(JSON.stringify(oldVp));

      if (before && before.w > 0 && before.h > 0) {
          var image = cornerstone.getImage(el);

          if (image && image.width && image.height) {
              var beforeFit = Math.min(before.w / image.width, before.h / image.height);
              var afterFit = Math.min(r.width / image.width, r.height / image.height);

              if (beforeFit > 0 && afterFit > 0 && oldVp.scale > 0) {
                  var userZoomFactor = oldVp.scale / beforeFit;

                  if (preserveObliqueViewport) {
                      // No oblíquo, preserva o zoom relativo real do usuário.
                      // Não usa o clamp agressivo 0.85–1.35, porque ele é justamente
                      // o que derruba o zoom manual feito para preencher o viewport.
                      userZoomFactor = Math.max(0.25, Math.min(userZoomFactor, 8.0));
                  } else {
                      // Comportamento original preservado para modo não-oblíquo.
                      userZoomFactor = Math.max(0.85, Math.min(userZoomFactor, 1.35));
                  }

                  newVp.scale = afterFit * userZoomFactor;
              }

              newVp.translation = oldVp.translation || { x: 0, y: 0 };
          }
      } else if (preserveObliqueViewport) {
          // Fallback seguro: se não houver snapshot geométrico antes/depois,
          // mantém exatamente o viewport anterior no oblíquo.
          newVp.scale = oldVp.scale;
          newVp.translation = oldVp.translation || { x: 0, y: 0 };
      }

      cornerstone.setViewport(el, newVp);
      cornerstone.updateImage(el);

      if (typeof _paintAllFilters === 'function') {
        try {
          _paintAllFilters(el);
        } catch (e3) {}
      }

    } catch(e) {}
  });
};

console.log('versão com fitToWindow — entre/saia e faça o resize: a imagem deve preencher E não piscar');

    if (typeof ResizeObserver !== 'undefined') {
        var _endoRoPending = false;
        var _endoRO = new ResizeObserver(function() {
            if (_endoRoPending) return;
            _endoRoPending = true;
            requestAnimationFrame(function() {
                _endoRoPending = false;
             if (window._endoFocusDragging) return;      // arrasto em curso
                if (window._endoFocusSuppressRO) return;    // janela de finalização
                if (document.body.classList.contains('endo-live-resize')) {
                    // classe presa SEM arrasto e SEM settle = gesto cancelado pelo
                    // iOS em build antiga — watchdog limpa e repinta (mantido).
                    document.body.classList.remove('endo-live-resize');
                }
                window.forceEndoCornerstoneResize();
            });
        });
        var _armEndoRO = function() {
            ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) _endoRO.observe(el);
            });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _armEndoRO);
        else _armEndoRO();
    }
})();
