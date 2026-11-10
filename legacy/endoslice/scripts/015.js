
(function(){
  window._multiProbe = function(){
    var ids = ['endo-axial','endo-coronal','endo-sagittal'];
    var tab = document.getElementById('tab-endo');
    var t0 = performance.now(), n = 0, out = [];
    function lum(el){
      if(!el) return -1;
      var cv = el.querySelector('canvas.cornerstone-canvas') || el.querySelector('canvas');
      if(!cv) return -1;
      try {
        var c = cv.getContext('2d',{willReadFrequently:true});
        var d = c.getImageData(cv.width>>1, cv.height>>1, 2, 2).data;
        return Math.round((d[0]+d[1]+d[2])/3);
      } catch(e){ return -2; }
    }
    (function loop(){
      out.push({
        f:n, t:Math.round(performance.now()-t0),
        axial:lum(document.getElementById('endo-axial')),
        coronal:lum(document.getElementById('endo-coronal')),
        sagittal:lum(document.getElementById('endo-sagittal')),
        tabDisplay: tab ? getComputedStyle(tab).opacity : '?',
        focusing: document.body.classList.contains('endo-focusing')
      });
      if(++n<45) requestAnimationFrame(loop); else console.table(out);
    })();
  };
  var _e = window.endoFocusEnter;
  if(_e) window.endoFocusEnter = function(){ var r=_e.apply(this,arguments); setTimeout(window._multiProbe,0); return r; };
  console.log('multi-probe armado');
})();
