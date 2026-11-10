
/* =====================================================================
   TAREFA 1 — Medidas lineares slice-aware (store central robusto)
   ---------------------------------------------------------------------
   Substitui o antigo bloco de "estacionamento" (_parkedMeasures), que
   DESESTACIONAVA errado porque a chave do corte dependia de
   cornerstone.getImage() — imageId/timing voláteis. Agora a chave usa o
   ÍNDICE de corte do stack (autoritativo e síncrono), eliminando o
   mismatch de chave composta no retorno ao corte original.
   Integra-se ao fluxo Cornerstone via eventos nativos; não usa visible.
   ===================================================================== */
(function(){
    if (window._sliceAwareMeasuresInstalled) return;   // mantém guard antigo: não reinstalar
    window._sliceAwareMeasuresInstalled = true;

    // Store central global: Map< sliceKey , Array<measurementData> >
    window.lengthMeasurementStore = window.lengthMeasurementStore || new Map();

    // --- plano do viewport a partir do id do elemento DOM ---
    window.getViewportPlane = function(el){
        var id = (el && el.id) || '';
        return id.indexOf('axial')   >= 0 ? 'axial'
             : id.indexOf('coronal') >= 0 ? 'coronal'
             : id.indexOf('sagittal')>= 0 ? 'sagittal'
             : null;
    };

    // --- índice de corte AUTORITATIVO (não usa getImage: evita race/imageId volátil) ---
    function _sliceIndexOf(el){
        try {
            var ts = cornerstoneTools.getToolState(el, 'stack');
            if (ts && ts.data && ts.data[0] && typeof ts.data[0].currentImageIdIndex === 'number')
                return ts.data[0].currentImageIdIndex;
        } catch(e){}
        // fallback p/ viewports sem stack (ex.: modal): imageId sem query
        try { var img = cornerstone.getImage(el); if (img && img.imageId) return String(img.imageId).split('?')[0]; } catch(e){}
        return 'noidx';
    }

    // --- chave composta robusta: sessão | viewport | plano | corte | slab | oblíquo ---
    window.getCurrentSliceKeyForElement = function(el){
        if (!el) return null;
        var plane = window.getViewportPlane(el);
        var parts = [
            window.currentExamSessionId || 'nosess',
            el.id || 'novp',
            plane || 'noplane',
            'idx:' + _sliceIndexOf(el)
        ];
        try { if (typeof thicknessState !== 'undefined' && thicknessState && plane && thicknessState[plane] != null) parts.push('slab:' + thicknessState[plane]); } catch(e){}
        try {
            if (window.obliqueState && obliqueState.isActive) {
                var off = (obliqueState.sliceOffsets && plane) ? Math.round(obliqueState.sliceOffsets[plane] || 0) : 0;
                parts.push('obl:' + (Math.round((obliqueState.yaw||0)*10)/10) + ',' + (Math.round((obliqueState.pitch||0)*10)/10) + ',' + (Math.round((obliqueState.roll||0)*10)/10) + ',off' + off);
            }
        } catch(e){}
        return parts.join('|');
    };

    // --- salva no store as medidas que estão AGORA no toolState (sob a sliceKey de cada uma) ---
    window.saveLengthMeasurementsForElement = function(el){
        try {
            var ts = cornerstoneTools.getToolState(el, 'Length');
            var data = (ts && ts.data) ? ts.data : [];
            for (var i = 0; i < data.length; i++){
                var m = data[i];
                if (!m.sliceKey)      m.sliceKey      = window.getCurrentSliceKeyForElement(el);
                if (!m.examSessionId) m.examSessionId = window.currentExamSessionId;
                var arr = window.lengthMeasurementStore.get(m.sliceKey) || [];
                if (arr.indexOf(m) === -1) arr.push(m);      // dedup por referência (preserva edição)
                window.lengthMeasurementStore.set(m.sliceKey, arr);
            }
        } catch(e){}
    };

    // --- restaura no toolState SOMENTE as medidas do corte atual ---
    window.restoreLengthMeasurementsForElement = function(el){
        try {
            var cur = window.getCurrentSliceKeyForElement(el);
            var arr = window.lengthMeasurementStore.get(cur) || [];
            var ts  = cornerstoneTools.getToolState(el, 'Length');
            if (ts && ts.data){
                ts.data.length = 0;                          // limpa sem destruir objetos (vivem no store)
                for (var i = 0; i < arr.length; i++) ts.data.push(arr[i]);
            } else {
                // ainda não há container Length: cria pela API oficial
                for (var j = 0; j < arr.length; j++) cornerstoneTools.addToolState(el, 'Length', arr[j]);
            }
        } catch(e){}
    };

    // --- ciclo completo: salva o corte que estamos deixando e restaura o do novo corte ---
    window.syncLengthMeasurementsForElement = function(el){
        if (!el) return;
        try {
            window.saveLengthMeasurementsForElement(el);    // (4) salva antes de trocar
            window.restoreLengthMeasurementsForElement(el); // (5/6) restaura só deste corte
            try { cornerstone.updateImage(el); } catch(e){}
        } catch(e){}
    };

    // --- carimba sessão+corte na CRIAÇÃO e já guarda no store ---
    document.addEventListener('cornerstonetoolsmeasurementadded', function(e){
        try {
            var el = e.detail && e.detail.element;
            var m  = e.detail && e.detail.measurementData;
            if (!el || !m) return;
            if (e.detail.toolName && e.detail.toolName !== 'Length') return;
            m.examSessionId = window.currentExamSessionId;
            m.sliceKey      = window.getCurrentSliceKeyForElement(el);
            var arr = window.lengthMeasurementStore.get(m.sliceKey) || [];
            if (arr.indexOf(m) === -1) arr.push(m);
            window.lengthMeasurementStore.set(m.sliceKey, arr);
        } catch(err){}
    }, true);

    // --- remoção de medida: mantém o store consistente (senão "ressuscita" ao voltar o corte) ---
    document.addEventListener('cornerstonetoolsmeasurementremoved', function(e){
        try {
            var m = e.detail && e.detail.measurementData; if (!m) return;
            window.lengthMeasurementStore.forEach(function(arr, k){
                var i = arr.indexOf(m);
                if (i >= 0){ arr.splice(i, 1); if (!arr.length) window.lengthMeasurementStore.delete(k); }
            });
        } catch(err){}
    }, true);

    // --- ao trocar de corte (scroll/nova imagem): sincroniza este viewport ---
    ['cornerstonenewimage','cornerstonetoolsstackscroll'].forEach(function(evt){
        document.addEventListener(evt, function(e){
            var el = e.detail && e.detail.element;
            if (el) requestAnimationFrame(function(){ window.syncLengthMeasurementsForElement(el); });
        }, true);
    });

    // --- requisito 9: limpar o store ao Home/casinha e ao abrir novo exame ---
    window.clearLengthMeasurementStore = function(){
        try { window.lengthMeasurementStore.clear(); } catch(e){}
        ['endo-axial','endo-coronal','endo-sagittal','axial-viewport','modal-viewport'].forEach(function(id){
            var el = document.getElementById(id);
            if (el && el._parkedMeasures) el._parkedMeasures = [];   // limpa resíduo do esquema antigo
        });
    };
    // novo exame (gerador de sessão)
    if (typeof window._newExamSession === 'function' && !window._newExamSession._storeWrapped){
        var _origNewSession = window._newExamSession;
        window._newExamSession = function(){ try{ window.clearLengthMeasurementStore(); }catch(e){} return _origNewSession.apply(this, arguments); };
        window._newExamSession._storeWrapped = true;
    }
    // casinha / voltar ao hub
    if (typeof window.returnToHub === 'function' && !window.returnToHub._storeWrapped){
        var _origHub = window.returnToHub;
        window.returnToHub = function(){ var r = _origHub.apply(this, arguments); try{ window.clearLengthMeasurementStore(); }catch(e){} return r; };
        window.returnToHub._storeWrapped = true;
    }
})();
