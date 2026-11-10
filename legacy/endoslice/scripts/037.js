
/* SR no EndoFocus: botão por viewport, à direita do espelhar (CSS controla visibilidade) */
(function(){
  if(window._srBtnEFInstalled)return; window._srBtnEFInstalled=true;
  function addSR(el){ if(!el||el.querySelector('.vp-sr-btn'))return;
    var b=document.createElement('button');
    b.className='vp-mirror-btn vp-sr-btn'; b.textContent='SR'; b.title='Endo SuperRes (IA)';
    var go=function(e){e.preventDefault();e.stopPropagation();if(window.endoSuperRes)endoSuperRes();};
    b.addEventListener('touchstart',go,{passive:false,capture:true});
    b.addEventListener('mousedown',go,{capture:true});
    el.appendChild(b);
  }
  function run(){['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){addSR(document.getElementById(id));});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setTimeout(run,1500);setTimeout(run,4000);
})();
