
(function(){
  window.makeResizable = function(el){
    if(!el || el._isResizable) return;
    el._isResizable = true;
    el.style.setProperty('overflow','auto','important');
    if(getComputedStyle(el).position === 'static') el.style.position = 'relative';

    var grip = document.createElement('div');
    grip.className = 'modal-resize-grip';
    grip.setAttribute('aria-hidden','true');
    el.appendChild(grip);

    var sx=0, sy=0, sw=0, sh=0, on=false;
    function down(e){
      on=true;
      var p = e.touches ? e.touches[0] : e;
      sx=p.clientX; sy=p.clientY;
      var r=el.getBoundingClientRect(); sw=r.width; sh=r.height;
      e.preventDefault(); e.stopPropagation();
      document.addEventListener('mousemove', move, {passive:false});
      document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, {passive:false});
      document.addEventListener('touchend', up);
    }
    function move(e){
      if(!on) return;
      var p = e.touches ? e.touches[0] : e;
      var w = sw + (p.clientX - sx);
      var h = sh + (p.clientY - sy);
      w = Math.max(160, Math.min(w, window.innerWidth*0.96));
      h = Math.max(120, Math.min(h, window.innerHeight*0.92));
      el.style.setProperty('width', w+'px', 'important');
      el.style.setProperty('max-width', w+'px', 'important');
      el.style.setProperty('height', h+'px', 'important');
      el.style.setProperty('max-height', h+'px', 'important');
      e.preventDefault();
    }
    function up(){
      on=false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    }
    grip.addEventListener('mousedown', down, {passive:false});
    grip.addEventListener('touchstart', down, {passive:false});
  };

  function attach(){
    ['lima-controls','seg-inline-panel'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) window.makeResizable(el);
    });
    var od = document.getElementById('odontometria-modal');
    if(od && od.children[0]) window.makeResizable(od.children[0]);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
