
window.recon3DAddToPortfolio = function() {
    try {
        if (typeof renderer3D === 'undefined' || !renderer3D || typeof scene3D === 'undefined' || typeof camera3D === 'undefined') {
            (typeof showToast === 'function') ? showToast('⚠ Renderize o 3D primeiro') : alert('Renderize o 3D primeiro');
            return;
        }
        renderer3D.render(scene3D, camera3D);
        var src = renderer3D.domElement;
        var MAX_W = 1200, w = src.width, h = src.height;
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(src, 0, 0, w, h);
        var dataUrl = cv.toDataURL('image/jpeg', 0.92);
        if (typeof portfolioAddItem === 'function') {
            portfolioAddItem('Reconstrução 3D', dataUrl, 'Vista 3D · ' + new Date().toLocaleTimeString('pt-BR'), {}, '');
            if (typeof showToast === 'function') showToast('✓ Reconstrução 3D salva no portfolio');
        }
    } catch(e) {
        (typeof showToast === 'function') ? showToast('⚠ Erro ao salvar 3D') : alert('Erro ao salvar 3D');
    }
};
