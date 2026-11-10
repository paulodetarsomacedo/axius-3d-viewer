
(function(){
    'use strict';
    function _planeOfEl(el){
        if (!el || !el.id) return null;
        var id = el.id;
        return id.indexOf('axial')>=0?'axial':id.indexOf('coronal')>=0?'coronal':id.indexOf('sagittal')>=0?'sagittal':null;
    }



    // ===== BUG 2 — preset reseta TODOS os sliders =====
    window.VR_PRESET_DEFAULTS = window.VR_PRESET_DEFAULTS || { noise:30, denoise:0 };
    window.resetVRSlidersForPreset = function(type){
        if(typeof volumeMesh==='undefined'||!volumeMesh||!volumeMesh.material) return;
        var u=volumeMesh.material.uniforms;
        function setSlider(id,v){ var s=document.getElementById(id); if(s) s.value=v; }
        function setLabel(id,t){ var l=document.getElementById(id); if(l) l.innerText=t; }
        try {
            var light=(u.uLight?u.uLight.value:1.0);
            var t=Math.max(0,Math.min(1,Math.pow(Math.max(0,(light-0.6)/1.2),1/1.25)));
            var realismVal=Math.round(t*100);
            setSlider('realismSlider',realismVal); setLabel('vr-realism-label',realismVal);
        } catch(e){}
        try {
            var nDef=(window.VR_PRESET_DEFAULTS.noise!=null)?window.VR_PRESET_DEFAULTS.noise:30;
            setSlider('noiseSlider',nDef);
            if(typeof updateVRNoise==='function') updateVRNoise(nDef); else setLabel('vr-noise-label',nDef);
        } catch(e){}
        try {
            var dDef=(window.VR_PRESET_DEFAULTS.denoise!=null)?window.VR_PRESET_DEFAULTS.denoise:0;
            var ds=document.getElementById('denoiseSlider');
            if(ds){
                var cur=parseInt(ds.value,10)||0; ds.value=dDef;
                if(cur!==dDef&&typeof applyNoiseLevel==='function') applyNoiseLevel(dDef);
                else if(typeof updateDenoiseLabel==='function') updateDenoiseLabel(dDef);
            }
        } catch(e){}
    };
    if(typeof window.setVRPreset==='function' && !window.setVRPreset._slidersResetWrapped){
        var _origSetVRPreset=window.setVRPreset;
        window.setVRPreset=function(type){
            var r=_origSetVRPreset.apply(this,arguments);
            try { window.resetVRSlidersForPreset((typeof currentPreset3D!=='undefined')?currentPreset3D:type); } catch(e){}
            return r;
        };
        window.setVRPreset._slidersResetWrapped=true;
    }

    // ===== BUG 3 — duplo toque no centro do EndoTri =====
    window.resetEndoTriViewportsToInitialState = function(){
        var ids=['endo-axial','endo-coronal','endo-sagittal'];
        try { if(typeof volumeMeta!=='undefined'&&volumeMeta&&typeof crosshairState!=='undefined'){ crosshairState.x=Math.floor((volumeMeta.x||1)/2); crosshairState.y=Math.floor((volumeMeta.y||1)/2); crosshairState.z=Math.floor((volumeMeta.z||1)/2); } } catch(e){}
        try {
            if(window.obliqueState){
                obliqueState.sliceOffsets={axial:0,coronal:0,sagittal:0};
                if(obliqueState.baseIndices){ obliqueState.baseIndices.axial=crosshairState.z; obliqueState.baseIndices.coronal=crosshairState.y; obliqueState.baseIndices.sagittal=crosshairState.x; }
            }
        } catch(e){}
        ids.forEach(function(id){
            var el=document.getElementById(id); if(!el) return;
            try { if(!cornerstone.getEnabledElements().some(function(en){return en.element===el;})) return; } catch(e){ return; }
            try {
                // TAREFA 2 (correção do zoom): cornerstone.reset não zerava a escala de
                // fato. fitToWindow é o método usado no app inteiro p/ ajustar zoom/pan
                // e é INCONDICIONAL. Também restaura WW/WC padrão da imagem e a
                // orientação base do plano (coronal/sagittal nascem com vflip).
                cornerstone.fitToWindow(el);
                var _vp = cornerstone.getViewport(el);
                var _img = cornerstone.getImage(el);
                if(_vp){
                    _vp.translation = { x: 0, y: 0 };
                    if(_img){ _vp.voi.windowWidth = _img.windowWidth; _vp.voi.windowCenter = _img.windowCenter; }
                    _vp.invert = false; _vp.rotation = 0;
                    var _pl = id.replace('endo-','');
                    _vp.vflip = (_pl === 'coronal' || _pl === 'sagittal');
                    cornerstone.setViewport(el, _vp);
                }
            } catch(e){}
            try {
                var plane=id.replace('endo-',''), ts=cornerstoneTools.getToolState(el,'stack');
                if(ts&&ts.data&&ts.data[0]){
                    var center=(plane==='axial')?crosshairState.z:(plane==='coronal')?crosshairState.y:crosshairState.x;
                    var n=(ts.data[0].imageIds&&ts.data[0].imageIds.length)||0;
                    if(n>0) center=Math.max(0,Math.min(n-1,center));
                    ts.data[0].currentImageIdIndex=center;
                }
            } catch(e){}
            try { cornerstone.resize(el,true); } catch(e){}
        });
        // TAREFA 2: restaura os filtros próprios do app (nitidez/fine/brilho/gamma)
        // aos valores PADRÃO de abertura e sincroniza os sliders da gaveta esquerda.
        // O cornerstone.reset() acima só zera WW/WC; os filtros _fs persistiam após
        // o duplo-toque. NÃO apaga medidas/anotações (reset apenas visual).
        try {
            var _sl=document.querySelectorAll('.settings-container input[type="range"]');
            if(_sl.length>=4){ _sl[0].value='0'; _sl[1].value='0'; _sl[2].value='1'; _sl[3].value='0.5'; }
            if(typeof updateFilters==='function') updateFilters();
        } catch(e){}
        try { if(window.obliqueState&&obliqueState.isActive&&typeof updateObliqueViewports==='function') updateObliqueViewports(); else if(typeof synchronizeMobileViews==='function') synchronizeMobileViews(); } catch(e){}
        try { if(typeof renderTextAnnotations==='function') renderTextAnnotations(); } catch(e){}
        try { if(typeof window.updateMprLocatorGlass==='function') window.updateMprLocatorGlass(); } catch(e){}
        try { if(typeof window.updateMprHeadLocators==='function') window.updateMprHeadLocators(); } catch(e){}
        try { if(typeof showToast==='function') showToast('↺ EndoTri reposto'); } catch(e){}
    };
    (function _injectEndoTriCenterReset(){
        var lastTap=0;
        function doReset(e){ if(e){e.preventDefault();e.stopPropagation();} if(typeof resetAll==='function') resetAll(); }
        function syncVisibility(){ var tab=document.getElementById('tab-endo'),hb=document.getElementById('endotri-center-reset'); if(!tab||!hb) return; hb.style.display=tab.classList.contains('endo-focus-active')?'none':'block'; }
        function ensureHitbox(){
            var tab=document.getElementById('tab-endo'); if(!tab) return;
            if(document.getElementById('endotri-center-reset')){ syncVisibility(); return; }
            try { if(getComputedStyle(tab).position==='static') tab.style.position='relative'; } catch(e){ tab.style.position='relative'; }
            var hb=document.createElement('div'); hb.id='endotri-center-reset';
            hb.style.cssText='position:absolute;left:50%;top:50%;width:58px;height:58px;transform:translate(-50%,-50%);z-index:150;background:transparent;pointer-events:auto;touch-action:none;-webkit-touch-callout:none;';
            hb.title='Duplo toque: repor EndoTri';
            hb.addEventListener('dblclick',doReset);
            hb.addEventListener('touchend',function(e){ var now=Date.now(); if(now-lastTap<320){ lastTap=0; doReset(e); } else { lastTap=now; e.preventDefault(); } },{passive:false});
            tab.appendChild(hb);
            try { new MutationObserver(syncVisibility).observe(tab,{attributes:true,attributeFilter:['class']}); } catch(e){}
            syncVisibility();
        }
        function boot(){ ensureHitbox(); }
        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
        setTimeout(boot,800); setTimeout(boot,2000);
    })();

    // ===== BUG 4 — lupa deslocada do dedo =====
    (function _magnifyFingerOffset(){
        var MAG=140;
        function bubbleEl(){ return document.querySelector('.magnifyTool'); }
        function reposition(clientX,clientY){
            var bubble=bubbleEl(); if(!bubble) return;
            var vp=bubble.parentElement; if(!vp) return;
            var r=vp.getBoundingClientRect(); if(!r.width||!r.height) return;
            var fx=clientX-r.left, fy=clientY-r.top;
            bubble.style.transform='none';
            var br=bubble.getBoundingClientRect();
            var curCx=(br.left+br.width/2)-r.left, curCy=(br.top+br.height/2)-r.top;
            var GAP=MAG/2+36;
            var dx=(fx>r.width*0.5)?-GAP:GAP;
            var dy=(fy<r.height*0.32)?GAP:-GAP;
            var cx=fx+dx, cy=fy+dy, rad=MAG/2+4;
            cx=Math.max(rad,Math.min(r.width-rad,cx));
            cy=Math.max(rad,Math.min(r.height-rad,cy));
            bubble.style.transition='none';
            bubble.style.transform='translate('+(cx-curCx).toFixed(1)+'px,'+(cy-curCy).toFixed(1)+'px)';
        }
        function onMove(e){
            if(typeof currentActiveTool==='undefined'||currentActiveTool!=='Magnify') return;
            var t=(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0])||e;
            if(t&&t.clientX!=null) requestAnimationFrame(function(){ reposition(t.clientX,t.clientY); });
        }
        ['touchstart','touchmove','pointerdown','pointermove'].forEach(function(evt){ document.addEventListener(evt,onMove,{capture:true,passive:true}); });
    })();


    // ===== BUG 8 — Home/novo exame não trava scroll =====
    window.ensureEndoToolsForElement = function(el){
        if(!el) return;
        try {
            var isEnabled=false;
            try { isEnabled=cornerstone.getEnabledElements().some(function(e){return e.element===el;}); } catch(e){}
            if(!isEnabled){ try{cornerstone.enable(el);}catch(e){} }
            try { cornerstoneTools.addStackStateManager(el,['stack']); } catch(e){}
            function add(tool,cfg){ try{cornerstoneTools.addToolForElement(el,tool,cfg);}catch(e){} }
            add(cornerstoneTools.StackScrollTool);
            add(cornerstoneTools.WwwcTool);
            add(cornerstoneTools.ZoomTool);
            try { add(cornerstoneTools.PanTool); } catch(e){}
            try { add(cornerstoneTools.ZoomTouchPinchTool); } catch(e){}
            try { add(cornerstoneTools.PanMultiTouchTool); } catch(e){}
            add(cornerstoneTools.LengthTool,{configuration:{drawHandles:false,drawHandlesOnHover:false,handleRadius:18,selectable:true,distanceThreshold:40}});
            add(cornerstoneTools.MagnifyTool,{configuration:{magnifySize:140,magnificationLevel:2,guiCursor:false,xOffset:0,yOffset:0}});
            el.dataset.stackScrollAdded='true';
            try {
                var active=(typeof currentActiveTool!=='undefined'&&currentActiveTool)?currentActiveTool:null;
                var crossOn=(typeof isCrosshairActive!=='undefined')&&isCrosshairActive;
                if(active==='Magnify') cornerstoneTools.setToolActiveForElement(el,'Magnify',{mouseButtonMask:1,isTouchActive:true});
                else if(!crossOn){ cornerstoneTools.setToolActiveForElement(el,'StackScroll',{mouseButtonMask:1,isTouchActive:true}); cornerstoneTools.setToolDisabledForElement(el,'Wwwc'); }
            } catch(e){}
        } catch(e){}
    };
    window.cleanEndoViewportsForReset = function(){
        ['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){
            var el=document.getElementById(id); if(!el) return;
            delete el.dataset.stackScrollAdded;
            delete el.dataset.currentTool;
            delete el.dataset.touchMode;
            try { cornerstoneTools.clearToolState(el,'stack'); } catch(e){}
            try { cornerstoneTools.clearToolState(el,'Length'); } catch(e){}
            try { cornerstone.disable(el); } catch(e){}
        });
    };
})();
