
/* Odontometria marcar no MODAL EXPANDIDO (não toca EndoTri/EndoFocus) */
(function(){
  if(window._odontoModalMarkFix)return; window._odontoModalMarkFix=true;
  function modalOpen(){var mz=document.getElementById('modal-zoom');return !!(mz&&getComputedStyle(mz).display!=='none');}
  var orig=window.endoCanalMarkOnImage;
  window.endoCanalMarkOnImage=function(id){
    if(!modalOpen()){ if(typeof orig==='function')return orig(id); return; }
    if(!window.endoCanalState||!window.endoCanalState.canals[id])return;
    var om=document.getElementById('odontometria-modal'); if(om)om.style.display='none';
    try{window.endoCanalPersistActive&&window.endoCanalPersistActive();}catch(e){}
    window.endoCanalSetActive(id);
    try{if(typeof limaOpenInModal==='function')limaOpenInModal();}catch(e){}
    try{window.endoCanalLoadIntoLima&&window.endoCanalLoadIntoLima(id);}catch(e){}
    var c=window.endoCanalState.canals[id];
    if((!c.points||!c.points.length)&&typeof limaStartMark==='function'){try{limaStartMark();}catch(e){}}
    try{window.endoCanalRenderLimaStrip&&window.endoCanalRenderLimaStrip();}catch(e){}
    try{window.endoCanalRenderChips&&window.endoCanalRenderChips();}catch(e){}
  };
})();
