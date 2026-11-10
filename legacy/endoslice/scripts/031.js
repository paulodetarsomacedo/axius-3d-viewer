
/* TAREFA 5.2 (ajuste 3) — botão CONCLUIR da Lima leva à Odontometria */
(function(){
    if (window._limaConcluirInstalled) return;
    window._limaConcluirInstalled = true;
    window.limaConcluir = function(){
        try { if (window.endoCanalPersistActive) window.endoCanalPersistActive(); } catch(e){}
        try { if (typeof limaClose === 'function') limaClose(); } catch(e){}
        try { if (typeof window.openOdontometria3D === 'function') window.openOdontometria3D(); } catch(e){}
    };
})();
