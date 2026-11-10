

(function syncSafeAreaColor(){
 function resolveBg(){
    // BUG 5: unifica a safe-area/topo do PWA com o fundo da UI usando --neu-bg.
    // Respeita tema claro/escuro (no claro, --neu-bg resolve para --endo-app-bg).
    var root = getComputedStyle(document.documentElement);
    var c = (root.getPropertyValue('--neu-bg') || '').trim();
    if(!c || c==='rgba(0, 0, 0, 0)' || c==='transparent'){
      c = (root.getPropertyValue('--endo-app-bg') || '').trim() || '#1A1D24';
    }
    return c;
  }

  function apply(){
    try{
      var bg = resolveBg();
      var m = document.querySelector('meta[name="theme-color"]');
      if(!m){ m=document.createElement('meta'); m.name='theme-color'; document.head.appendChild(m); }
      // AXIUS_FIX_SAFE_AREA_OBSERVER: this observer also watches the root style.
      // Writing the same value again can enqueue itself indefinitely.
      if(m.getAttribute('content') !== bg) m.setAttribute('content', bg);
      var style = document.documentElement.style;
      if(style.getPropertyValue('--safe-area-bg').trim() !== bg){
        style.setProperty('--safe-area-bg', bg);
      }
    }catch(e){}
  }
  apply();
  var mo=new MutationObserver(apply);
  mo.observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme']});
  mo.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  ['load','visibilitychange','pageshow'].forEach(function(ev){ window.addEventListener(ev, apply); });
  setTimeout(apply,300); setTimeout(apply,1000);
})();
