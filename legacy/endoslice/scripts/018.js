
(function(){
  if(!window.segToggleTool || window.__segDragWrapped) return;
  window.__segDragWrapped = true;
  var _orig = window.segToggleTool;
  window.segToggleTool = function(mode){
    var r = _orig.apply(this, arguments);
    try{
      var panel = document.getElementById('seg-inline-panel');
      if(panel && panel.getAttribute('data-active') && panel.closest('#endo-empty')){
        var header = panel.querySelector('.seg-inline-header');
        if(header && window.makeFloatingDraggable){
          header.style.cursor = 'move';
          header.style.touchAction = 'none';
          window.makeFloatingDraggable(header, panel); // guard interno evita re-bind
        }
      }
    }catch(e){ console.warn('[seg drag]', e); }
    return r;
  };
})();
