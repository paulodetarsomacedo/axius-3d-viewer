
window.updateVRRealism = function (val) {
    var n = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    var lbl = document.getElementById('vr-realism-label');
    if (lbl) lbl.innerText = n;
    try {
        if (!volumeMesh || !volumeMesh.material) return;
        var u = volumeMesh.material.uniforms;
        // curva: 0→0.6 (clínico chapado) ... 100→1.8 (escultural brilhante)
        var t = n / 100;
        var light = 0.6 + Math.pow(t, 1.25) * 1.2;
        if (u.uLight) u.uLight.value = light;
        // leve realce de densidade no topo do slider = mais "corpo"/relevo
        if (u.uDensityScale) u.uDensityScale.value = 1.0 + t * 0.25;
        volumeMesh.material.uniformsNeedUpdate = true;
        if (typeof renderVR === 'function') renderVR();          // re-render se existir
        else if (typeof requestVRRender === 'function') requestVRRender();
    } catch (e) {}
};
