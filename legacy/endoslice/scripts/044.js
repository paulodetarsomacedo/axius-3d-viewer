
(function(){
  if(window._endoDisableCanalFeatures)return; window._endoDisableCanalFeatures=true;

  function removeIfExists(sel){
    try {
      var list = document.querySelectorAll(sel);
      for(var i=0;i<list.length;i++){
        if(list[i] && list[i].parentNode) list[i].parentNode.removeChild(list[i]);
      }
    } catch(e){}
  }

  function hideCanalFeatures(){
    removeIfExists('#et-card-canal');
    removeIfExists('#et-card-obtur');
    removeIfExists('#ep-seg-canal');
    removeIfExists('#ep-seg-obtur');
    removeIfExists('#vr-btn-canalReveal');
    removeIfExists('[onclick*="openSegModalDraggable(\'canal\')"]');
    removeIfExists('[onclick*="openSegModalDraggable(\'obtur\')"]');
    removeIfExists('[title="Segmentação Canal"]');
    removeIfExists('[title="Segmentação Canal Obturado"]');

    try {
      var panel = document.getElementById('seg-shell');
      if(panel){ panel.style.display='none'; }
    } catch(e){}
    try {
      var panel2 = document.getElementById('seg-inline-panel');
      if(panel2){ panel2.style.display='none'; }
    } catch(e){}

    try {
      var body = document.getElementById('endotools-body');
      if(body){
        var labels = body.querySelectorAll('.et-sec-label');
        for(var i=0;i<labels.length;i++){
          var txt = (labels[i].textContent || '').replace(/s+/g,' ').trim().toLowerCase();
          if(txt.indexOf('segmentação 3d') !== -1 || txt.indexOf('segmentacao 3d') !== -1){
            var next = labels[i].nextElementSibling;
            if(next && next.classList && next.classList.contains('et-grid')){
              try { next.parentNode.removeChild(next); } catch(e){}
            }
            try { labels[i].parentNode.removeChild(labels[i]); } catch(e){}
            break;
          }
        }
      }
    } catch(e){}
  }

  window.segToggleTool = function(){
    console.warn('[EndoSlice] Canal Nativo/Obturado foram removidos desta versão.');
    return false;
  };
  window.openSegModalDraggable = function(){
    console.warn('[EndoSlice] Modal de segmentação de canal removido desta versão.');
    return false;
  };

  document.addEventListener('DOMContentLoaded', hideCanalFeatures);
  window.addEventListener('load', hideCanalFeatures);
  setTimeout(hideCanalFeatures, 300);
  setTimeout(hideCanalFeatures, 1200);
  setTimeout(hideCanalFeatures, 2600);
})();
