
/* Ajustes pequenos: botão EndoReal, ícones e cantos EndoTri.
   Não altera EndoFocus, loaders, ZIP, MPR, 3D, MAR/Normal ou volumeData. */
(function(){
  if(window._endosliceSmallAdjustments20260629) return;
  window._endosliceSmallAdjustments20260629 = true;

  function addEndoRealButton(){
    return;
    try {
      if (document.getElementById('et-card-endoreal')) return;

      var superRes = document.getElementById('et-card-superres');
      if (!superRes || !superRes.parentNode) return;

      var card = document.createElement('div');
      card.className = 'et-card theme-green';
      card.id = 'et-card-endoreal';
      card.setAttribute('onclick', "endoToolsRun(function(){ if(window.endoFiltrosReais){ endoFiltrosReais(); } else { alert('EndoReal ainda não está disponível nesta versão.'); } })");
      card.setAttribute('ontouchend', "endoToolsRun(function(){ if(window.endoFiltrosReais){ endoFiltrosReais(); } else { alert('EndoReal ainda não está disponível nesta versão.'); } });event.preventDefault();");

      card.innerHTML =
        '<div class="et-ico-box">' +
          '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4 14.5c2.2-5.3 5-7.9 8-7.9s5.8 2.6 8 7.9"/>' +
            '<path d="M7.2 14.2c1.5-2.8 3.1-4.2 4.8-4.2s3.3 1.4 4.8 4.2"/>' +
            '<circle cx="12" cy="14.6" r="2.2"/>' +
            '<path d="M12 3.5v2.2"/>' +
            '<path d="M20.2 7.1l-1.6 1.6"/>' +
            '<path d="M3.8 7.1l1.6 1.6"/>' +
          '</svg>' +
        '</div>' +
        '<div class="et-text-wrap">' +
          '<span class="et-t">EndoReal</span>' +
          '<span class="et-sub">Colorização interpretativa</span>' +
        '</div>';

      // Coloca após Endo SuperRes e antes de Endo MAR.
      if (superRes.nextSibling) superRes.parentNode.insertBefore(card, superRes.nextSibling);
      else superRes.parentNode.appendChild(card);
    } catch(e) {
      console.warn('[EndoSlice] Falha ao inserir botão EndoReal:', e);
    }
  }

function injectEndoTriCornerFrames(){
    try {
      document.querySelectorAll('.endo-tri-corner-frame').forEach(function(frame){
        if (frame && frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      });
    } catch(e) {
      console.warn('[EndoSlice] Falha ao remover cantos EndoTri:', e);
    }
}

  function fixIconColorsInline(){
    try {
      var targets = [
        { sel:'#et-card-mar .et-ico-box, #et-card-mar .et-ico-box svg, #et-card-mar .et-ico-box svg *', color:'#f59e0b' },
        { sel:'#et-card-periapical .et-ico-box, #et-card-periapical .et-ico-box svg, #et-card-periapical .et-ico-box svg *', color:'#ef4444' },
        { sel:'.et-card[onclick*="openPresentacao"] .et-ico-box, .et-card[onclick*="openPresentacao"] .et-ico-box svg, .et-card[onclick*="openPresentacao"] .et-ico-box svg *', color:'#d946ef' },
        { sel:'#et-card-endoreal .et-ico-box, #et-card-endoreal .et-ico-box svg, #et-card-endoreal .et-ico-box svg *', color:'#22c55e' }
      ];

      targets.forEach(function(t){
        document.querySelectorAll(t.sel).forEach(function(el){
          try {
            el.style.setProperty('color', t.color, 'important');
            el.style.setProperty('stroke', t.color, 'important');
          } catch(e){}
        });
      });
    } catch(e){}
  }

function applySmallAdjustments(){
    addEndoRealButton();

    /*
      Cantos coloridos removidos.
      Não reinjetar durante troca EndoTri/EndoFocus,
      pois isso causa repaint/flicker.
    */
    // injectEndoTriCornerFrames();

    fixIconColorsInline();
}

  document.addEventListener('DOMContentLoaded', applySmallAdjustments);
  window.addEventListener('load', applySmallAdjustments);
  setTimeout(applySmallAdjustments, 250);
  setTimeout(applySmallAdjustments, 900);
  setTimeout(applySmallAdjustments, 1800);

  // Reaplica se o bottom sheet/EndoTab reconstruir elementos.
  try {
    var mo = new MutationObserver(function(){
      if (window._endoSmallAdjRAF) cancelAnimationFrame(window._endoSmallAdjRAF);
      window._endoSmallAdjRAF = requestAnimationFrame(applySmallAdjustments);
    });
    mo.observe(document.documentElement, { childList:true, subtree:true });
  } catch(e){}
})();
