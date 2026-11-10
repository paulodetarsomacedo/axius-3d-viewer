
(function(){
  var ICON_MIRA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><line x1="12" y1="2.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21.5" y2="12"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>';
  var ICON_SCROLL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l8 4-8 4-8-4 8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/></svg>';

  function fixIcon(btn){
    if(!btn || !btn.classList) return;
    if(btn.classList.contains('mode-mira')) btn.innerHTML = ICON_MIRA;
    else if(btn.classList.contains('mode-scroll')) btn.innerHTML = ICON_SCROLL;
    /* mode-wwwc fica com o ◑ original */
  }

  /* ---- ÍCONES: intercepta as funções de modo ---- */
  if(window.applyEndoTouchMode && !window.applyEndoTouchMode._iconWrapped){
    var _a = window.applyEndoTouchMode;
    window.applyEndoTouchMode = function(el, btn, mode){ var r=_a.apply(this,arguments); try{fixIcon(btn);}catch(e){} return r; };
    window.applyEndoTouchMode._iconWrapped = true;
  }
  if(window.toggleEndoMode && !window.toggleEndoMode._iconWrapped){
    var _t = window.toggleEndoMode;
    window.toggleEndoMode = function(id, btn){ var r=_t.apply(this,arguments); try{fixIcon(btn);}catch(e){} return r; };
    window.toggleEndoMode._iconWrapped = true;
  }

  /* ---- BUG DO CONTRASTE: restaura o modo do botão ao fechar os modais ---- */
  window.restoreTouchMode = function(){
    try{
      var cross = (typeof isCrosshairActive !== 'undefined') ? isCrosshairActive : false;
      ['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){
        var el = document.getElementById(id); if(!el) return;
        var mode = el.dataset.touchMode || 'scroll';
        if(mode === 'mira' && !cross) mode = 'scroll';
        var btn = el._modeBtn || el.querySelector('.vp-mode-btn');
        if(btn && window.applyEndoTouchMode){ window.applyEndoTouchMode(el, btn, mode); }
      });
      var axEl = document.querySelector('#tab-axial .viewport-element');
      var axBtn = document.getElementById('btn-axial-mode');
      if(axEl){
        var ax = axBtn ? (axBtn.getAttribute('data-mode')||'scroll') : 'scroll';
        if(ax === 'wwwc'){ cornerstoneTools.setToolActiveForElement(axEl,'Wwwc',{mouseButtonMask:1,isTouchActive:true}); cornerstoneTools.setToolDisabledForElement(axEl,'StackScroll'); }
        else { cornerstoneTools.setToolActiveForElement(axEl,'StackScroll',{mouseButtonMask:1,isTouchActive:true}); cornerstoneTools.setToolDisabledForElement(axEl,'Wwwc'); }
      }
    }catch(e){ console.warn('[restoreTouchMode]', e); }
  };

  function wrapClose(name){
    if(typeof window[name]==='function' && !window[name]._restoreWrapped){
      var orig = window[name];
      var w = function(){ var r=orig.apply(this,arguments); setTimeout(function(){ window.restoreTouchMode(); },60); return r; };
      w._restoreWrapped = true; window[name] = w;
    }
  }

  function setup(){
    document.querySelectorAll('.vp-mode-btn').forEach(fixIcon);
    new MutationObserver(function(ms){ ms.forEach(function(m){ m.addedNodes.forEach(function(n){
      if(n.nodeType!==1) return;
      if(n.classList && n.classList.contains('vp-mode-btn')) fixIcon(n);
      if(n.querySelectorAll) n.querySelectorAll('.vp-mode-btn').forEach(fixIcon);
    }); }); }).observe(document.body,{childList:true,subtree:true});

    wrapClose('segDeactivate'); wrapClose('limaClose');
    var od = document.getElementById('odontometria-modal');
    if(od && !od._restoreObs){ od._restoreObs = true;
      new MutationObserver(function(){ if(od.style.display==='none') setTimeout(function(){ window.restoreTouchMode(); },60); })
        .observe(od,{attributes:true,attributeFilter:['style']});
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
