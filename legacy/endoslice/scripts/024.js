
/* ===== BUG 1 — slice-aware (SOMENTE anotações de texto) ===== */
(function(){
    if (window._sliceAwareBug1Installed) return;
    window._sliceAwareBug1Installed = true;
    function _planeOf(idOrEl){
        var id = (idOrEl && idOrEl.id) ? idOrEl.id : (idOrEl || '');
        return id.indexOf('axial')>=0?'axial':id.indexOf('coronal')>=0?'coronal':id.indexOf('sagittal')>=0?'sagittal':null;
    }
    // Chave do corte SEM o id do elemento → a mesma fatia bate entre endo e modal.
    window.getCurrentSliceKey = function(element, plane){
        try {
            if (!plane && element) plane = _planeOf(element);
            var parts = [window.currentExamSessionId||'nosess', plane||'noplane'];
            var hasImg = false;
            try { var img=cornerstone.getImage(element); if(img&&img.imageId){ parts.push('img:'+String(img.imageId).split('?')[0]); hasImg=true; } } catch(e){}
            if (!hasImg) { try { var ts=cornerstoneTools.getToolState(element,'stack'); if(ts&&ts.data&&ts.data[0]&&typeof ts.data[0].currentImageIdIndex==='number') parts.push('idx:'+ts.data[0].currentImageIdIndex); } catch(e){} }
            try { if(typeof thicknessState!=='undefined'&&thicknessState&&plane&&thicknessState[plane]!=null) parts.push('slab:'+thicknessState[plane]); } catch(e){}
            try {
                if (window.obliqueState && obliqueState.isActive) {
                    var r1=Math.round((obliqueState.yaw||0)*10)/10, r2=Math.round((obliqueState.pitch||0)*10)/10, r3=Math.round((obliqueState.roll||0)*10)/10;
                    var off=(obliqueState.sliceOffsets&&plane)?Math.round(obliqueState.sliceOffsets[plane]||0):0;
                    parts.push('obl:'+r1+','+r2+','+r3+',off'+off);
                }
            } catch(e){}
            return parts.join('|');
        } catch(e){ return (window.currentExamSessionId||'nosess')+'|'+(plane||'noplane'); }
    };
    // Ao trocar de corte, re-renderiza só as anotações de TEXTO (não mexe em medidas).
    ['cornerstonenewimage','cornerstonetoolsstackscroll'].forEach(function(evt){
        document.addEventListener(evt, function(){
            requestAnimationFrame(function(){
                try { if(typeof renderTextAnnotations==='function') renderTextAnnotations(); } catch(e){}
            });
        }, true);
    });
})();

