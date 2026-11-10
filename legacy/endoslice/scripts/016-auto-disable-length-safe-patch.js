
(function(){
    'use strict';
    if (window._autoDisableLengthSafePatchNeutralized) return;
    window._autoDisableLengthSafePatchNeutralized = true;
    // Neutralizado de propósito.
    // A finalização automática da régua agora acontece somente por:
    // 1) cornerstonetoolsmeasurementadded -> requestFinishLengthMeasureCreation
    // 2) finishLengthMeasureCreation
    // Isso elimina corrida de estado e dessincronismo entre botão e tool mode.
})();
