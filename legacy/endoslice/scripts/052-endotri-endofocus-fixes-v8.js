
/* ==========================================================
   BUG 1 — Expandir dos minis do EndoTri: toque imediato e no
   plano correto (independe do HUD/Nativa e da mira).
   BUG 6 — Odontometria: modal arrastável pelo cabeçalho
   (funciona também no EndoFocus).
   ========================================================== */
(function(){
  /* BUG 1 (v2) — intercepta o toque no Expandir dos minis no nível do
     DOCUMENTO (fase de captura), que roda ANTES dos handlers do viewport
     que revelam o HUD. Assim o 1º toque já expande, sem depender do
     Nativa/HUD aparecer e sem a mira capturar o toque. */
  if(window._endoTriMiniExpandV2) return; window._endoTriMiniExpandV2=true;
  var sx=0, sy=0, moved=false, armedVp=null;

  function isEndoTri(){
    var tab=document.getElementById('tab-endo');
    return !!(tab && tab.classList.contains('active') &&
              !tab.classList.contains('endo-focus-active') &&
              !document.body.classList.contains('endo-focusing'));
  }
  function miniExpandVp(target){
    if(!target || !target.closest) return null;
    var btn=target.closest('.vp-btn-top'); if(!btn) return null;
    return btn.closest('#endo-coronal, #endo-sagittal');
  }
  function planeOf(vp){ return vp.id==='endo-coronal' ? 'CORONAL' : 'SAGITTAL'; }
  function openIt(vp){ try{ if(typeof openModalZoom==='function') openModalZoom(vp.id, planeOf(vp)); }catch(err){} }

  document.addEventListener('touchstart', function(e){
    armedVp=null; moved=false;
    if(!isEndoTri()) return;
    var vp=miniExpandVp(e.target); if(!vp) return;
    armedVp=vp;
    if(e.touches&&e.touches[0]){ sx=e.touches[0].clientX; sy=e.touches[0].clientY; }
    e.stopImmediatePropagation();   /* impede reveal do HUD e a mira de reagir */
  }, true);

  document.addEventListener('touchmove', function(e){
    if(!armedVp) return;
    if(e.touches&&e.touches[0] &&
       (Math.abs(e.touches[0].clientX-sx)+Math.abs(e.touches[0].clientY-sy)>10)) moved=true;
  }, true);

  document.addEventListener('touchend', function(e){
    var vp=armedVp; armedVp=null;
    if(!vp || !isEndoTri()) return;
    e.stopImmediatePropagation(); if(e.cancelable) e.preventDefault();
    if(!moved) openIt(vp);
  }, true);

  document.addEventListener('click', function(e){
    if(!isEndoTri()) return;
    var vp=miniExpandVp(e.target); if(!vp) return;
    e.stopImmediatePropagation(); if(e.cancelable) e.preventDefault();
    openIt(vp);
  }, true);
})();

(function(){
  if(window._odontoDragV1) return; window._odontoDragV1=true;
  function init(){
    var modal=document.getElementById('odontometria-modal'); if(!modal) return false;
    var panel=modal.querySelector(':scope > div'); if(!panel) return false;
    var header=panel.querySelector(':scope > div'); if(!header) return false;
    if(header._odontoDragBound) return true;
    header._odontoDragBound=true;
    header.style.cursor='move'; header.style.touchAction='none';
    var dragging=false, sx=0, sy=0, ox=0, oy=0, tx=0, ty=0;
    function isBtn(t){ return !!(t && (t.tagName==='BUTTON' || (t.closest && t.closest('button')))); }
    function down(e){
      if(isBtn(e.target)) return;        /* não arrasta ao tocar em 📁 / ✕ */
      dragging=true; sx=e.clientX; sy=e.clientY; ox=tx; oy=ty;
      try{ header.setPointerCapture(e.pointerId); }catch(_){}
      if(e.cancelable) e.preventDefault();
    }
    function move(e){
      if(!dragging) return;
      tx=ox+(e.clientX-sx); ty=oy+(e.clientY-sy);
      panel.style.transform='translate('+tx+'px,'+ty+'px)';
      if(e.cancelable) e.preventDefault();
    }
    function up(){ dragging=false; }
    header.addEventListener('pointerdown', down);
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
    return true;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  setTimeout(init,800); setTimeout(init,2000);
})();
