
/* Esconde Lima Virtual de forma definitiva (sem badge) */
(function(){
  if(window._limaHideInstalled)return; window._limaHideInstalled=true;
  function hide(){var el=document.getElementById('et-card-lima');if(el)el.style.setProperty('display','none','important');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide);else hide();
  document.addEventListener('click',function(){setTimeout(hide,50);},true);
  setInterval(hide,1500);
})();
