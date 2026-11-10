
/* ENDOSLICE FINAL UI SKIN — atualização visual dos ranges.
   Não altera lógica clínica: apenas escreve a variável CSS --range-progress
   nos inputs range existentes e nos que forem criados dinamicamente. */
(function(){
  function endoUpdateRangeVisual(el){
    if(!el || el.type !== 'range') return;
    var min = parseFloat(el.min);
    var max = parseFloat(el.max);
    var val = parseFloat(el.value);
    if(!isFinite(min)) min = 0;
    if(!isFinite(max)) max = 100;
    if(!isFinite(val)) val = min;
    var pct = max === min ? 0 : ((val - min) * 100 / (max - min));
    pct = Math.max(0, Math.min(100, pct));
    el.style.setProperty('--range-progress', pct + '%');
    el.classList.add('endo-glass-range');
  }
  function endoRefreshAllRanges(root){
    (root || document).querySelectorAll('input[type="range"]').forEach(endoUpdateRangeVisual);
  }
  document.addEventListener('input', function(e){
    if(e.target && e.target.matches && e.target.matches('input[type="range"]')) endoUpdateRangeVisual(e.target);
  }, true);
  document.addEventListener('change', function(e){
    if(e.target && e.target.matches && e.target.matches('input[type="range"]')) endoUpdateRangeVisual(e.target);
  }, true);
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ endoRefreshAllRanges(document); });
  } else {
    endoRefreshAllRanges(document);
  }
  try{
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes && m.addedNodes.forEach(function(n){
          if(n.nodeType !== 1) return;
          if(n.matches && n.matches('input[type="range"]')) endoUpdateRangeVisual(n);
          if(n.querySelectorAll) endoRefreshAllRanges(n);
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }catch(e){}
})();
