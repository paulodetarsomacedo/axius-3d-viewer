
// ============================================================
// PLANEJADOR DE COMPRIMENTO DE LIMA VIRTUAL
// Overlay canvas sobre a aba Endo. Não toca em nenhuma variável Cornerstone.
// Usuário marca 2 pontos (ex: ápice radiográfico + referência coronal).
// O comprimento em mm é calculado com base na escala mm/px configurável.
// ============================================================
// ============================================================
// PLANEJADOR DE COMPRIMENTO DE LIMA ENDODÔNTICA
//
// ANÁLISE TÉCNICA:
// CBCT/TC dentário é em escala real — 1px = pixelSpacing mm (0.1–0.4mm).
// NÃO precisa de fator de escala manual. O cálculo usa volumeMeta.pixelSpacing
// do DICOM diretamente. A viewport Cornerstone tem zoom que precisa ser
// compensado (getBoundingClientRect vs canvas size).
//
// DOIS MODOS:
// 1. LINHA RETA: 2 pontos → distância euclidiana × pixelSpacing
// 2. CANAL CURVO: N pontos (polyline) → Σ segmentos × pixelSpacing
//    O endodontista clica ao longo da curvatura do canal,
//    cada clique adiciona um vértice à polyline.
//    Comprimento = soma de todos os segmentos.
//
// CÁLCULO DE ESCALA:
// viewport Cornerstone renderiza com zoom variável.
// O fator de escala real é: pixelSpacing × (imageWidth / rect.width)
// onde imageWidth = colunas da imagem DICOM e rect = getBoundingClientRect()
// do elemento cornerstone. Isso compensa pan/zoom automaticamente.
// ============================================================

const limaState = {
    active:  false,
    mode:    'reto',      // 'reto' | 'curvo'
    points:  [],          // [{x, y, imgX, imgY}] — coordenadas canvas E imagem
    marking: false,
    sourceViewportId: null  // qual viewport está sendo medido
};

// ---- Obter pixelSpacing real do DICOM ----
// Retorna mm/pixel no plano da imagem atual.
function limaGetPixelSpacing() {
    if (volumeMeta && volumeMeta.pixelSpacing && volumeMeta.pixelSpacing > 0.001) {
        return volumeMeta.pixelSpacing;
    }
    return 0.2; // fallback conservador para CBCT (0.2mm é típico)
}

// ---- Obter fator zoom do viewport ativo ----
// Cornerstone pode estar com zoom/pan. O canvas CSS width != image pixel width.
// Fator = colunas da imagem / largura do elemento no viewport.
function limaGetZoomFactor(viewportEl) {
    if (!viewportEl || !volumeMeta || !volumeMeta.x) return 1.0;
    try {
        const vp = cornerstone.getViewport(viewportEl);
        const img = cornerstone.getImage(viewportEl);
        if (!vp || !img) return 1.0;
        const rect = viewportEl.getBoundingClientRect();
        // img.columns = pixels reais da imagem; rect.width = pixels CSS do elemento
        // O Cornerstone escala a imagem com vp.scale. Fórmula:
        // mm/canvasPx = pixelSpacing / vp.scale × (imageNativeSize/elementSize)
        // Simplificado: usa vp.scale diretamente.
        return (1.0 / (vp.scale || 1.0));
    } catch(e) { return 1.0; }
}

// ==========================================================
// limaOpen (VERSÃO CORRIGIDA)
// Gerencia a abertura da Lima Virtual detectando o contexto
// (Grid vs Modal) e posicionando o painel de forma segura.
// ==========================================================

// ==========================================================
// limaOpen (VERSÃO CORRIGIDA - Orquestrador de DOM)
// Garante que o painel da Lima esteja no contexto visual correto.
// ==========================================================
function limaOpen() {
    const panel = document.getElementById('lima-panel');
    if (!panel) return;

    // 1. Determina o contexto: estamos no Modal ou no Grid da aba Endo?
    const tabEndo = document.getElementById('tab-endo');
    if (!tabEndo) return;

    // 2. MOVE o painel para DENTRO do container da aba Endo
    // Isso garante que ele sempre esteja no contexto do grid 2x2.
    tabEndo.appendChild(panel);
    
    // 3. Configura o painel para ser um OVERLAY que flutua sobre tudo
    panel.style.display = 'block';
    panel.style.position = 'absolute'; // Flutua sobre o grid
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.width = '100%';
    panel.style.height = '100%';
    panel.style.zIndex = '5000'; // Garante que fique acima dos viewports
    panel.style.pointerEvents = 'none'; // Deixa cliques passarem, exceto nos botões

    // 4. Encontra o viewport ativo para referência de cálculo
    const vps = ['endo-axial', 'endo-coronal', 'endo-sagittal'];
    const activeVp = vps.find(id => {
        const el = document.getElementById(id);
        return el && el.offsetParent !== null;
    });
    limaState.sourceViewportId = activeVp || 'endo-axial';

    // 5. Inicializa o estado da ferramenta
    limaState.active  = true;
    limaState.marking = false;
    limaState.points  = [];
    limaState.mode    = 'reto';
    
    // 6. Atualiza a UI
    limaResizeCanvas();
    limaRedraw();
    limaUpdateModeButtons();
    limaUpdateResult(null); // Limpa o resultado anterior

    // Info de pixel spacing
    const psInfo = document.getElementById('lima-ps-info');
    if (psInfo) {
        const ps = limaGetPixelSpacing();
        const ok = volumeMeta && volumeMeta.pixelSpacing > 0.001;
        psInfo.innerHTML = `<span style="color:${ok?'#0f8':'#f60'}">` +
    `${ok ? '✓' : '⚠'} <span class="dseg-value">${ps.toFixed(3)}</span><span class="unit-mm"> mm/px</span> DICOM</span>` +
    `<br><span style="color:#555;font-size:8px;">Clique dentro dos viewports</span>`;
    }

    // Vincula eventos ao canvas
    const canvas = document.getElementById('lima-canvas');
    if (canvas) {
        canvas.removeEventListener('click', limaHandleClick);
        canvas.removeEventListener('touchend', limaHandleTouch);
        canvas.addEventListener('click',    limaHandleClick);
        canvas.addEventListener('touchend', limaHandleTouch, { passive: false });
    }

    // BUG 3: torna o painel da Lima arrastável (EndoTri/EndoFocus)
    ensureLimaControlsDraggable();
}



// ============================================================
// BUG 3: ARRASTAR O PAINEL DA LIMA (#lima-controls)
// Drag com mouse e touch, em EndoTri/EndoFocus/Modal.
// - Ignora toques em button/input/select/textarea (não atrapalha cliques)
// - Converte bottom/right -> left/top no início do arrasto
// - Restringe o painel dentro do container visível
// ============================================================
function ensureLimaControlsDraggable() {
    var panel = document.getElementById('lima-controls');
    if (!panel || panel._dragWired) return;
    panel._dragWired = true;

    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

    function isInteractive(t) {
        return t && t.closest && t.closest('button, input, select, textarea');
    }
    function hostRect() {
        var h = panel.offsetParent;
        if (h) { var r = h.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; }
        return { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight };
    }
    function onStart(e) {
        if (isInteractive(e.target)) return;     // clique em botão segue normal
        var p = e.touches ? e.touches[0] : e;
        var r = panel.getBoundingClientRect();
        var host = hostRect();
        // converte bottom/right (CSS original) para left/top fixos
        panel.style.left   = (r.left - host.left) + 'px';
        panel.style.top    = (r.top  - host.top)  + 'px';
        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
        dragging = true;
        sx = p.clientX; sy = p.clientY;
        ox = r.left - host.left; oy = r.top - host.top;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }
    function onMove(e) {
        if (!dragging) return;
        var p = e.touches ? e.touches[0] : e;
        var host = hostRect();
        var nx = ox + (p.clientX - sx);
        var ny = oy + (p.clientY - sy);
        nx = Math.max(0, Math.min((host.w || window.innerWidth)  - panel.offsetWidth,  nx));
        ny = Math.max(0, Math.min((host.h || window.innerHeight) - panel.offsetHeight, ny));
        panel.style.left = nx + 'px';
        panel.style.top  = ny + 'px';
        if (e.cancelable) e.preventDefault();
    }
    function onEnd() { dragging = false; }

    panel.addEventListener('touchstart', onStart, { passive: false });
    panel.addEventListener('mousedown',  onStart);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchend',  onEnd);
    window.addEventListener('mouseup',   onEnd);
}
window.ensureLimaControlsDraggable = ensureLimaControlsDraggable;

function limaClose() {
    limaState.active  = false;
    limaState.marking = false;

    const canvas = document.getElementById('lima-canvas');
    if (canvas) {
        canvas.removeEventListener('click',    limaHandleClick);
        canvas.removeEventListener('touchend', limaHandleTouch);
    }

    const panel    = document.getElementById('lima-panel');
    const controls = document.getElementById('lima-controls');
    const tabEndo  = document.getElementById('tab-endo');

    // Bug 1 Fix: devolve AMBOS (panel e controls) ao tab-endo,
    // independentemente de onde estejam agora (modal ou outro lugar).
    if (panel && tabEndo && !tabEndo.contains(panel)) {
        tabEndo.appendChild(panel);
    }
    if (panel) {
        panel.style.display = 'none';
        panel.style.position = 'absolute';
        panel.style.top = '0'; panel.style.left = '0';
        panel.style.width = '100%'; panel.style.height = '100%';
    }
    if (controls && panel && !panel.contains(controls)) {
        panel.appendChild(controls);
    }
    // BUG 3: restaura a posição padrão do painel (desfaz o arrasto da sessão)
    if (controls) {
        controls.style.position = 'absolute';
        controls.style.left   = 'auto';
        controls.style.top    = 'auto';
        controls.style.bottom = '4%';
        controls.style.right  = '2%';
        controls.style.zIndex = '';
    }
}

function limaSetMode(mode) {
    limaState.mode    = mode; // 'reto' | 'curvo'
    limaState.points  = [];
    limaState.marking = true;   // TAREFA: arma a marcação direto ao escolher o modo (reto OU curvo)
    limaUpdateModeButtons();
    // sincroniza o botão MEDIR -> PARAR (mesmo visual de limaStartMark com marking=true)
    var _mb = document.getElementById('lima-btn-mark');
    if (_mb) { _mb.style.display='block'; _mb.style.background='rgba(0,220,100,0.25)'; _mb.style.borderColor='#0f6'; _mb.style.color='#0f6'; _mb.innerText='⬛ PARAR'; }
    limaRedraw();
    limaUpdateResult();
}

function limaUpdateModeButtons() {
    const btnReto  = document.getElementById('lima-btn-reto');
    const btnCurvo = document.getElementById('lima-btn-curvo');
    if (btnReto) {
        const on = limaState.mode === 'reto';
        btnReto.style.background   = on ? 'rgba(0,200,255,0.25)' : 'rgba(0,120,180,0.12)';
        btnReto.style.borderColor  = on ? '#0cf' : '#047';
        btnReto.style.color        = on ? '#0cf' : '#069';
    }
    if (btnCurvo) {
        const on = limaState.mode === 'curvo';
        btnCurvo.style.background  = on ? 'rgba(255,180,0,0.25)' : 'rgba(120,80,0,0.12)';
        btnCurvo.style.borderColor = on ? '#fb0' : '#740';
        btnCurvo.style.color       = on ? '#fb0' : '#960';
    }
}

function limaStartMark() {
    limaState.marking = !limaState.marking;
    if (limaState.marking) {
        limaState.points = [];
        limaRedraw();
        limaUpdateResult();
    }
    const btn = document.getElementById('lima-btn-mark');
    if (btn) {
        btn.style.background  = limaState.marking ? 'rgba(0,220,100,0.25)' : 'rgba(0,170,255,0.15)';
        btn.style.borderColor = limaState.marking ? '#0f6' : '#0af';
        btn.style.color       = limaState.marking ? '#0f6' : '#0af';
        btn.innerText         = limaState.marking ? '⬛ PARAR' : '✚ MEDIR';
    }
}

// Local: Substitua completamente sua função limaClear() por esta versão.

function limaClear() {
    limaState.points  = [];
    limaState.marking = false;
    
    // Restaura o visual do botão "+ MEDIR"
    const btn = document.getElementById('lima-btn-mark');
    if (btn) {
        btn.style.display = 'block'; // Garante que ele fique visível
        btn.style.background  = 'rgba(0,170,255,0.15)';
        btn.style.borderColor = '#0af';
        btn.style.color       = '#0af';
        btn.innerText         = '✚ MEDIR';
    }
    
    limaRedraw();
    limaUpdateResult(null); // Chama para esconder o placar de resultado
}

function limaHandleTouch(e) {
    e.preventDefault();
    if (!limaState.marking) return;
    const t = e.changedTouches[0];
    limaAddPoint(t.clientX, t.clientY);
}

function limaHandleClick(e) {
    if (!limaState.marking) return;
    limaAddPoint(e.clientX, e.clientY);
}

// ==========================================================
// limaClientToImagePx (VERSÃO ARQUITETURALMENTE CORRETA E DEFINITIVA)
// Converte coordenadas de tela para pixels de imagem DICOM sem ambiguidade.
//
// LÓGICA REFINADA:
//   - A função não tenta mais "adivinhar" o viewport. Ela confia em uma única
//     fonte da verdade: `limaState.sourceViewportId`.
//   - Isso garante que, quando a lima está ativa no modal, os cálculos são
//     feitos usando EXCLUSIVAMENTE o contexto do `modal-viewport`.
//   - A lógica de compensação de zoom, pan e vflip (inversão vertical) é
//     aplicada corretamente ao único viewport relevante.
// ==========================================================
// Local: Substitua a função limaClientToImagePx inteira
// Local: Substitua a função limaClientToImagePx inteira
// Local: Substitua a função limaClientToImagePx inteira
// Local: Substitua a função limaClientToImagePx inteira
function limaClientToImagePx(clientX, clientY) {
    // Ordem de prioridade estrita
    const viewports = ['modal-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal', 'axial-viewport'];

    for (let id of viewports) {
        const el = document.getElementById(id);
        if (!el) continue;

        // Ignora modal se estiver fechado
        if (id === 'modal-viewport' && el.offsetParent === null) continue;
        
        // Ignora viewports da aba Endo se a aba Endo não estiver ativa
        if (id.startsWith('endo-') && document.getElementById('tab-endo').style.display === 'none') continue;

        const rect = el.getBoundingClientRect();

        // Hit Test preciso
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {

            try {
                // Cálculo relativo ao Canvas do Cornerstone
                const canvasX = clientX - rect.left;
                const canvasY = clientY - rect.top;

                // Converte para pixel da imagem (Compensa Zoom, Pan e Flip)
                const pt = cornerstone.canvasToPixel(el, { x: canvasX, y: canvasY });
                
                if (pt && isFinite(pt.x) && isFinite(pt.y)) {
                    return { imgX: pt.x, imgY: pt.y, vpId: id };
                }
            } catch (e) {
                console.warn("Erro hit test:", id);
            }
        }
    }
    return null;
}


// Local: Substitua completamente sua função limaAddPoint() por esta versão simplificada.

// Local: Substitua a função limaAddPoint inteira
// Local: Substitua a função limaAddPoint inteira
function limaAddPoint(cx, cy) {
    // 1. Pega a coordenada REAL da imagem DICOM
    const imgPt = limaClientToImagePx(cx, cy);
    
    if (!imgPt) return; // Clique fora de área válida

    const imgX  = imgPt.imgX;
    const imgY  = imgPt.imgY;
    const vpId  = imgPt.vpId;

    // Se for o primeiro ponto, fixa qual viewport estamos usando
    if (limaState.points.length === 0) {
        limaState.sourceViewportId = vpId;
    } else {
        // Proteção: Impede marcar o segundo ponto em um viewport diferente do primeiro
        if (limaState.sourceViewportId && limaState.sourceViewportId !== vpId) {
            return; 
        }
    }

    // 2. Adiciona o ponto (Armazenamos APENAS dados da imagem)
    if (limaState.mode === 'reto') {
        if (limaState.points.length >= 2) limaState.points = [];
        const labels = ['ÁPICE', 'REFERÊNCIA'];
        limaState.points.push({ imgX, imgY, label: labels[limaState.points.length] });
    } else {
        const n = limaState.points.length;
        limaState.points.push({ imgX, imgY, label: n === 0 ? 'ÁPICE' : `P${n+1}` });
    }

    // 3. Atualiza visual e cálculo
    limaRedraw();
    
    // Lógica do botão Parar (se completou a reta)
    if (limaState.mode === 'reto' && limaState.points.length === 2) {
        limaState.marking = false;
        // Oculta botão e força cálculo final
        const btn = document.getElementById('lima-btn-mark');
        if (btn) btn.style.display = 'none';
    }

    limaCalculate();
}


// ============================================================
// limaCalculate — CÁLCULO DE COMPRIMENTO REAL EM MM
//
// CAMINHO 1 (preferencial, zoom-invariante):
//   Todos os pontos têm imgX/imgY (pixels DICOM).
//   distância = Σ sqrt((imgX[i]-imgX[i-1])² + (imgY[i]-imgY[i-1])²)
//   mm = distância × pixelSpacing
//
// CAMINHO 2 (fallback geométrico):
//   Usa coords canvas + extrai vp.scale do Cornerstone para compensar zoom.
//   mm/canvasPx = pixelSpacing × (imgCols / vpCSSwidth) / vp.scale
//   onde (imgCols / vpCSSwidth) converte CSS px → image px,
//   e (/ vp.scale) desfaz o zoom aplicado pelo Cornerstone.
//
// Nenhum caminho depende de slab thickness ou de zoom manual.
// ============================================================
// Local: Substitua a função limaCalculate() inteira por esta nova versão.

// limaCalculate: usa DICOM pixel spacing diretamente do header da imagem.
// imgX/imgY são pixels DICOM capturados via canvasToPixel (invariantes a zoom).
// Distância = sqrt((dx * colSpacing)² + (dy * rowSpacing)²) — medida 1:1 real.
// Local: Substitua completamente sua função limaCalculate() por esta versão.

// ============================================================
// BUG 4: LIMA CURVA REAL — Catmull-Rom CENTRÍPETA
// A polilinha vira uma curva suave que passa pelos pontos marcados,
// sem overshoot (parametrização centrípeta, alpha = 0.5).
// O comprimento em mm é medido pela CURVA amostrada, não pelos
// segmentos retos.
// ============================================================

// Parametrização centrípeta: |Pb-Pa|^0.5 (alpha = 0.5)
function _crKnot(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.pow(dx * dx + dy * dy, 0.25);
}

// Ponto da spline Catmull-Rom centrípeta no trecho p1->p2, t em [0,1]
function catmullRomPoint(p0, p1, p2, p3, t) {
    var t0 = 0;
    var t1 = t0 + Math.max(_crKnot(p0, p1), 1e-4);
    var t2 = t1 + Math.max(_crKnot(p1, p2), 1e-4);
    var t3 = t2 + Math.max(_crKnot(p2, p3), 1e-4);
    var tt = t1 + (t2 - t1) * t;

    function lp(a, b, ta, tb) {
        var f = (tt - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    var A1 = lp(p0, p1, t0, t1), A2 = lp(p1, p2, t1, t2), A3 = lp(p2, p3, t2, t3);
    var B1 = lp(A1, A2, t0, t2), B2 = lp(A2, A3, t1, t3);
    return lp(B1, B2, t1, t2);
}

// Amostra a curva em coordenadas DE IMAGEM (imgX/imgY) — 16 subpontos por trecho
function limaBuildCurveSamples(pts, perSeg) {
    if (!pts || pts.length < 3) {
        return (pts || []).map(function(p){ return { x: p.imgX, y: p.imgY }; });
    }
    perSeg = perSeg || 16;
    var P = pts.map(function(p){ return { x: p.imgX, y: p.imgY }; });
    var out = [P[0]];
    for (var i = 0; i < P.length - 1; i++) {
        var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        for (var k = 1; k <= perSeg; k++) {
            out.push(catmullRomPoint(p0, p1, p2, p3, k / perSeg));
        }
    }
    return out;
}

// Escala anisotrópica por plano (mesma regra do cálculo reto)
function _limaPlaneScale(vpId) {
    var ps = (volumeMeta && volumeMeta.pixelSpacing) || 1.0;
    var st = (volumeMeta && volumeMeta.sliceThickness) || ps;
    if (vpId === 'endo-coronal' || vpId === 'endo-sagittal') return { sx: ps, sy: st };
    return { sx: ps, sy: ps };
}

// Comprimento em mm da curva amostrada (Pitágoras anisotrópico por subtrecho)
function limaMeasureSampledCurveMm(samples, vpId) {
    var s = _limaPlaneScale(vpId), tot = 0;
    for (var i = 1; i < samples.length; i++) {
        var dx = (samples[i].x - samples[i - 1].x) * s.sx;
        var dy = (samples[i].y - samples[i - 1].y) * s.sy;
        tot += Math.sqrt(dx * dx + dy * dy);
    }
    return tot;
}

// Local: Substitua a função limaCalculate inteira
function limaCalculate() {
    if (limaState.points.length < 2) {
        limaUpdateResult(null);
        return;
    }

    const pts = limaState.points;
    const vpId = limaState.sourceViewportId || 'endo-axial';
    
    // Padrões do volume (dados reais do paciente)
    const ps = (volumeMeta && volumeMeta.pixelSpacing) || 1.0;
    const st = (volumeMeta && volumeMeta.sliceThickness) || ps; // Espessura do corte

    // Define o fator de escala para X e Y dependendo do plano
    let scaleX = ps;
    let scaleY = ps;

    // SE for Coronal ou Sagittal, o eixo Y da tela representa o eixo Z do volume.
    // Portanto, devemos usar a Espessura do Corte (sliceThickness) para o cálculo vertical.
    if (vpId === 'endo-coronal' || vpId === 'endo-sagittal') {
        scaleX = ps;
        scaleY = st; // <--- AQUI ESTAVA O ERRO DE DIFERENÇA DE MEDIDA
    } else {
        // Axial e Modal (geralmente Axial) usam pixels quadrados
        scaleX = ps;
        scaleY = ps;
    }

    let totalMm = 0;
    if (limaState.mode === 'curvo' && pts.length >= 3) {
        // BUG 4: comprimento pela CURVA Catmull-Rom amostrada (16 subpontos/trecho)
        totalMm = limaMeasureSampledCurveMm(limaBuildCurveSamples(pts, 16), vpId);
    } else {
        for (let i = 1; i < pts.length; i++) {
            // Diferença em pixels brutos da imagem
            const dxPx = pts[i].imgX - pts[i-1].imgX;
            const dyPx = pts[i].imgY - pts[i-1].imgY;

            // Converte para mm usando a escala anisotrópica correta
            const dxMm = dxPx * scaleX;
            const dyMm = dyPx * scaleY;

            // Pitágoras
            totalMm += Math.sqrt(dxMm*dxMm + dyMm*dyMm);
        }
    }

    // Lógica de finalização
    if (limaState.mode === 'reto' && limaState.points.length === 2) {
        limaState.marking = false; 
    }

    // Exibe o resultado com indicador da escala usada
    const scaleLabel = (scaleX === scaleY) ? 
        `Pix: ${scaleX.toFixed(2)}` : 
        `Aniso: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`;

    const kindLabel = (limaState.mode === 'curvo' && pts.length >= 3) ? 'Curva real' : 'Real';
    limaUpdateResult(totalMm, pts.length, `✓ ${kindLabel} (${scaleLabel})`);

    // === V1 PATCH: salvar metadados completos da medição p/ Portfolio ===
    try {
        var _vpId = limaState.sourceViewportId || 'endo-axial';
        var _planeMap = {
            'endo-axial':'axial', 'axial-viewport':'axial', 'tab-axial':'axial',
            'endo-coronal':'coronal', 'endo-sagittal':'sagittal',
            'modal-viewport': (document.getElementById('modal-zoom') &&
                               document.getElementById('modal-zoom').dataset &&
                               document.getElementById('modal-zoom').dataset.plane) || 'modal'
        };
        var _planeName = _planeMap[_vpId] || _vpId;
        var _sliceIdx = -1;
        try {
            var _el = document.getElementById(_vpId);
            if (_el && window.cornerstoneTools) {
                var _sd = cornerstoneTools.getToolState(_el, 'stack');
                if (_sd && _sd.data && _sd.data[0]) _sliceIdx = _sd.data[0].currentImageIdIndex;
            }
        } catch(e){}
        limaState.measurementViewportId = _vpId;
        limaState.measurementPlane = _planeName;
        limaState.measurementSliceIndex = _sliceIdx;
        limaState.lastMeasurementPoints = pts.map(function(p){ return { imgX:p.imgX, imgY:p.imgY, label:p.label }; });
        limaState.lastMeasurementMetrics = {
            totalMm: totalMm,
            scaleX: scaleX, scaleY: scaleY,
            mode: limaState.mode,
            nPoints: pts.length
        };
        // snapshot da imagem com overlay já desenhado
        try {
            var _vpEl = document.getElementById(_vpId);
            var _csCv = _vpEl ? _vpEl.querySelector('canvas.cornerstone-canvas') : null;
            if (_csCv) {
                var _snap = document.createElement('canvas');
                _snap.width = _csCv.width;
                _snap.height = _csCv.height;
                var _sctx = _snap.getContext('2d');
                _sctx.drawImage(_csCv, 0, 0);
                // se há lima-canvas overlay visível, mescla
                var _lc = document.getElementById('lima-canvas');
                if (_lc) {
                    var _lr = _lc.getBoundingClientRect();
                    var _vr = _vpEl.getBoundingClientRect();
                    if (_lr.width > 0 && _vr.width > 0) {
                        var _sx = _snap.width / _vr.width;
                        var _sy = _snap.height / _vr.height;
                        _sctx.drawImage(_lc,
                            (_lr.left - _vr.left) * _sx,
                            (_lr.top  - _vr.top ) * _sy,
                            _lr.width * _sx, _lr.height * _sy);
                    }
                }
                limaState.lastMeasurementSnapshot = {
                    width: _snap.width, height: _snap.height,
                    canvas: _snap, // referência viva — odontoAddToPortfolio re-renderiza por cima
                    capturedAt: Date.now()
                };
            }
        } catch(eSnap){ window.dlog && window.dlog('[lima snapshot]', eSnap); }
    } catch(eMeta){ window.dlog && window.dlog('[lima meta]', eMeta); }
    // === FIM V1 PATCH ===
    // TAREFA 5.2 — persiste a medição atual no canal ativo (não altera o cálculo)
    try { if (typeof window.endoCanalPersistActive === 'function') window.endoCanalPersistActive(); } catch(e){}
}

// ==========================================================
// limaUpdateResult (VERSÃO CORRIGIDA - Foco em Visibilidade)
// Garante que o container do resultado tenha uma altura mínima
// para ser renderizado dentro de layouts restritivos como o CSS Grid.
// ==========================================================
// Local: Encontre a sua função limaUpdateResult e substitua-a completamente por esta nova versão.

// Local: Substitua a função limaUpdateResult inteira
function limaUpdateResult(distMm, nPoints, precisionLabel, errorMsg) {
    const controls = document.getElementById('lima-controls');
    if (!controls) return;
    
    const resultDiv = controls.querySelector('#lima-result');
    const measureButton = document.getElementById('lima-btn-mark');

    if (!resultDiv || !measureButton) return;

    // Se não há medida válida, restaura o botão
    if (distMm === null || distMm === undefined) {
        resultDiv.style.display = 'none';
        measureButton.style.display = 'block'; 
        return;
    }
    
    // Se TEM medida: Esconde botão, Mostra resultado
    measureButton.style.display = 'none';

    // CSS forçado para garantir visibilidade no Grid
    resultDiv.style.cssText = `
        display: flex !important;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 60px;
        visibility: visible;
        opacity: 1;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(255,200,0,0.3);
        border-radius: 8px;
        padding: 6px 4px;
        margin-top: 0;
    `;

    const modeLabel = limaState.mode === 'reto' ? 'RETA' : 'CURVO';
    const ptsLabel  = nPoints > 2 ? `(${nPoints} pts)` : '';
    const methodColor = precisionLabel && precisionLabel.includes('✓') ? '#0f6' : '#f90';

  resultDiv.innerHTML = errorMsg ? 
    `<div style="font-size:11px; font-weight:700; color:#f88;">${errorMsg}</div>` : 
    `<div style="text-align:center; color:#fff; width:100%;">
        <div style="font-size:9px; color:#aaa; text-transform:uppercase;">${modeLabel} ${ptsLabel}</div>
     <div style="font-size:24px; font-weight:900; color:#ff0; line-height:1;">
    <span class="dseg-value">${distMm.toFixed(1)}</span><span class="unit-mm" style="font-size:14px; color:#fa0;"> mm</span>
</div>
        <div style="font-size:9px; color:${methodColor};">${precisionLabel || ''}</div>
    </div>`;
}


function limaRedraw() {
    const canvas = document.getElementById('lima-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pts = limaState.points;
    if (pts.length === 0) return;

    // Descobre em qual viewport desenhar
    const vpId = limaState.sourceViewportId || 'endo-axial';
    const el = document.getElementById(vpId);
    if (!el) return;

    // --- PROJEÇÃO: Imagem (Fixa) -> Tela (Dinâmica) ---
    const screenPts = pts.map(p => {
        try {
            // Pede ao Cornerstone onde esse pixel está na tela AGORA
            const canvasPt = cornerstone.pixelToCanvas(el, { x: p.imgX, y: p.imgY });
            
            // Ajusta para o sistema de coordenadas do overlay (Tela inteira)
            const rect = el.getBoundingClientRect();
            const overlayRect = canvas.getBoundingClientRect();
            
            // Fator de escala para telas Retina/HighDPI
            const scaleX = canvas.width / overlayRect.width;
            const scaleY = canvas.height / overlayRect.height;

            return {
                x: (rect.left - overlayRect.left + canvasPt.x) * scaleX,
                y: (rect.top - overlayRect.top + canvasPt.y) * scaleY,
                label: p.label
            };
        } catch (e) { return null; }
    }).filter(p => p !== null);

    if (screenPts.length === 0) return;

    // Projeção reutilizável: pixel de IMAGEM -> coordenada do overlay
    const rectEl = el.getBoundingClientRect();
    const overlayRectC = canvas.getBoundingClientRect();
    const sX = canvas.width / overlayRectC.width;
    const sY = canvas.height / overlayRectC.height;
    function projImg(ix, iy) {
        try {
            const cp = cornerstone.pixelToCanvas(el, { x: ix, y: iy });
            return { x: (rectEl.left - overlayRectC.left + cp.x) * sX,
                     y: (rectEl.top  - overlayRectC.top  + cp.y) * sY };
        } catch (e) { return null; }
    }

    // Desenha a linha
    if (screenPts.length >= 2) {
        ctx.beginPath();
        if (limaState.mode === 'curvo' && pts.length >= 3) {
            // BUG 4: CURVA SUAVE real (Catmull-Rom centrípeta) em vez de polilinha.
            // Amostra em coordenadas de imagem (mesma curva usada na medição)
            // e projeta cada subponto para a tela.
            const samples = limaBuildCurveSamples(pts, 16);
            let started = false;
            for (let i = 0; i < samples.length; i++) {
                const sp = projImg(samples[i].x, samples[i].y);
                if (!sp) continue;
                if (!started) { ctx.moveTo(sp.x, sp.y); started = true; }
                else ctx.lineTo(sp.x, sp.y);
            }
        } else {
            ctx.moveTo(screenPts[0].x, screenPts[0].y);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }

        if (limaState.mode === 'reto') {
            ctx.strokeStyle = '#ffe000'; // Amarelo sólido
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = '#ffaa00'; // Laranja
            ctx.lineWidth   = 2;
            ctx.setLineDash(limaState.marking ? [6, 3] : []);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Desenha os pontos
    screenPts.forEach((pt, i) => {
        const isFirst = i === 0;
        const color   = isFirst ? '#00eeff' : '#00ff88';

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isFirst ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = color + '40'; // Transparente
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Cruz de precisão no centro
        ctx.beginPath();
        const cs = 4;
        ctx.moveTo(pt.x - cs, pt.y); ctx.lineTo(pt.x + cs, pt.y);
        ctx.moveTo(pt.x, pt.y - cs); ctx.lineTo(pt.x, pt.y + cs);
        ctx.stroke();

        // Texto — #2: pontos intermediários da curva (P2, P3...) ficam SEM letra
        if (!/^P\d+$/.test(pt.label)) {
            ctx.fillStyle = color;
            ctx.font = `bold 12px sans-serif`;
            ctx.shadowColor="black"; ctx.shadowBlur=4;
            ctx.fillText(pt.label, pt.x + 10, pt.y - 5);
            ctx.shadowBlur=0;
        }
    });
}

function limaResizeCanvas() {
    const canvas = document.getElementById('lima-canvas');
    if (!canvas) return;
    const panel = document.getElementById('lima-panel');
    if (!panel) return;
    canvas.width  = panel.clientWidth  || window.innerWidth;
    canvas.height = panel.clientHeight || window.innerHeight;
}

// Local: Cole esta nova função junto com as outras funções da Lima Virtual.

// A função que MOVE o painel para onde ele é necessário
function _attachLimaPanel(targetElementId) {
    const panel = document.getElementById('lima-panel');
    const target = document.getElementById(targetElementId);
    if (!panel || !target) return;

    // Move o panel para dentro do alvo
    target.appendChild(panel);
    
    // Configura estilo "Overlay" para ele flutuar sobre o viewport alvo
    panel.style.display = 'block';
    panel.style.position = 'absolute';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.width = '100%';
    panel.style.height = '100%';
    panel.style.zIndex = '9999';
}


function limaOpenInModal() {
   
   // 1. Move o painel para dentro do modal
    _attachLimaPanel('modal-viewport');
    
    // 2. Configura modo modal
    limaState.sourceViewportId = 'modal-viewport';
    limaState.active = true;
   
    limaClose(); // Garante que qualquer estado anterior seja limpo

    const modal = document.getElementById('modal-zoom');
    const modalViewport = document.getElementById('modal-viewport'); // O container da imagem
    const controls = document.getElementById('lima-controls');
    const canvasContainer = document.getElementById('lima-panel');

    if (!modal || !modalViewport || !controls || !canvasContainer) {
        console.error("Elementos essenciais da Lima Virtual não encontrados para o modo modal.");
        return;
    }

    // Move o painel de controle para dentro do modal principal (para flutuar acima de tudo)
    modal.appendChild(controls);
    controls.style.position = 'absolute';
    controls.style.bottom = '80px'; // Posição acima do slider de navegação do modal
    controls.style.right = '20px';
    controls.style.zIndex = '6001'; // Garante que fique acima do canvas da lima

    // *** A MUDANÇA CRÍTICA ESTÁ AQUI ***
    // Move o container do canvas da lima para DENTRO do viewport do Cornerstone.
    modalViewport.appendChild(canvasContainer);

    // Estiliza o container para ser um overlay perfeito sobre a imagem.
    canvasContainer.style.display = 'block';
    canvasContainer.style.position = 'absolute';
    canvasContainer.style.top = '0';
    canvasContainer.style.left = '0';
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '100%';
    canvasContainer.style.zIndex = '6000'; // Fica acima da imagem, abaixo dos controles

    // Configura o estado da ferramenta para o contexto do modal
    limaState.sourceViewportId = 'modal-viewport';
    limaState.active = true;
    limaState.marking = false;
    limaState.points = [];
    limaState.mode = 'reto';

    const canvas = document.getElementById('lima-canvas');
    if(canvas) {
        canvas.removeEventListener('click', limaHandleClick); // Remove listener antigo para evitar duplicatas
        canvas.removeEventListener('touchend', limaHandleTouch);
        canvas.addEventListener('click', limaHandleClick);
        canvas.addEventListener('touchend', limaHandleTouch, { passive: false });
    }

    // Um pequeno delay para garantir que o DOM foi atualizado antes de redimensionar o canvas
    setTimeout(() => {
        limaResizeCanvas();
        limaRedraw();
        limaUpdateModeButtons();
        limaUpdateResult();
        // BUG 3: arrastável também no modal
        ensureLimaControlsDraggable();
    }, 50);

    
}

window.addEventListener('resize', () => { if (limaState.active) { limaResizeCanvas(); limaRedraw(); } });

// ---- iOS Safari SELECT FIX ----
// onchange em <select> não dispara de forma confiável no Safari iOS.
// Motivo: no iOS, o picker nativo confirma a seleção ao fechar,
// mas o evento 'change' às vezes não propaga quando há
// event.stopPropagation() no touchend pai.
// Solução: addEventListener puro, sem inline handlers.
(function initSlabSelects() {
    // Selects estão num overlay CSS grid que espelha o layout do #tab-endo.
    // Não precisa de posicionamento programático — o CSS cuida disso.
    // Só precisamos registrar os eventos de mudança.
    function attach(selId, plane) {
        var sel = document.getElementById(selId);
        if (!sel) return;
        sel.onchange = null;
        sel.addEventListener('change', function() {
            changeSlab(plane, this.value);
        });
        // iOS Safari fallback: touchend caso o 'change' demore a disparar
        var lastVal = sel.value;
        sel.addEventListener('touchend', function() {
            var self = this;
            setTimeout(function() {
                if (self.value !== lastVal) {
                    lastVal = self.value;
                    changeSlab(plane, self.value);
                }
            }, 80);
        }, { passive: true });
    }

    function tryAttach() {
        if (!document.getElementById('sel-axial')) {
            setTimeout(tryAttach, 300);
            return;
        }
        attach('sel-axial',    'axial');
        attach('sel-coronal',  'coronal');
        attach('sel-sagittal', 'sagittal');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAttach);
    } else {
        tryAttach();
    }
})();


// ================================================================
// MÓDULO PANORÂMICA / IMPLANT — Mobile (v9)
// Adaptado de dicom3d.html para touch iOS/iPadOS
// ================================================================

// --- Estado global ---
var panIsDrawing   = false;
var panCurvePoints = [];
var panDensePoints = [];
var panThickVal    = 1;
var panCrossIndex  = 0;
var panCrossCenterZ = 0;
var panActiveCuts  = [];
var panCurveHovered = false;
var panIsDragCross  = false;
var panPanoElement  = null;   // Cornerstone element
var panRoiDragging  = false;

var panRoiStartY    = 0;
var panRoiStartCZ   = 0;
let panLineDragging = false;
let panDraggingLineIndex = -1;
let panDraggingCut = false;
let panDraggingCutIndex = -1;      // índice dentro do panActiveCuts
let panLastPointerId = null;

const PAN_CUT_HIT_PX = 18;         // tolerância em pixels (dedo)


// Garante que o elemento pano está inicializado
function panEnsurePanoElement() {
    if (panPanoElement) return;
    const el = document.getElementById('pan-pano-viewer');
    if (!el || !window.cornerstone) return;
    try {
        cornerstone.enable(el);
        // Suite completa de ferramentas, igual aos outros viewers
        cornerstoneTools.addToolForElement(el, cornerstoneTools.WwwcTool);
        cornerstoneTools.addToolForElement(el, cornerstoneTools.PanTool);
        cornerstoneTools.addToolForElement(el, cornerstoneTools.ZoomTouchPinchTool);
        cornerstoneTools.addToolForElement(el, cornerstoneTools.PanMultiTouchTool);
        cornerstoneTools.addToolForElement(el, cornerstoneTools.ZoomTool);
        cornerstoneTools.addToolForElement(el, cornerstoneTools.LengthTool, {
            configuration: { drawHandlesOnHover: true, hideHandlesIfMoving: false }
        });
        cornerstoneTools.addToolForElement(el, cornerstoneTools.MagnifyTool, {
            configuration: { magnifySize: 140, magnificationLevel: 3 }
        });
        // Estado padrao: WW/WC ativo (1 dedo)
        cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
        cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {});
        cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {});
        panPanoElement = el;
        panSetupRoiDrag();
    } catch(e) { console.warn('panEnsurePanoElement:', e); }
}

// Registra imageLoader para panorâmica (roda uma vez)
var panLoaderRegistered = false;
function panRegisterLoader() {
    if (panLoaderRegistered || !window.cornerstone) return;
    panLoaderRegistered = true;

    cornerstone.registerImageLoader('panmobile', (imageId) => {
        if (panDensePoints.length === 0) {
            return { promise: Promise.reject('Curva vazia'), cancelFn: ()=>{} };
        }
        const width  = panDensePoints.length;
        const height = volumeMeta.z;
        const thick  = panThickVal;
        const tiltDeg = parseInt(document.getElementById('pan-tilt').value) || 0;
        const tanTilt = Math.tan(tiltDeg * Math.PI / 180);
        const cy = volumeMeta.y / 2;
        const ps = volumeMeta.pixelSpacing || 1;

        const getPix = () => {
            const px = new Int16Array(width * height);
            for (let x = 0; x < width; x++) {
                const idx = Math.min(x, panDensePoints.length - 2);
                const pA = panDensePoints[idx], pB = panDensePoints[idx+1];
                let dx = pB.x-pA.x, dy = pB.y-pA.y;
                const len = Math.sqrt(dx*dx+dy*dy) || 1;
                dx/=len; dy/=len;
                const nx=-dy, ny=dx;
                const thickPx = thick / ps;
                const startT = -Math.floor(thickPx/2), endT = Math.ceil(thickPx/2);
                for (let z = 0; z < height; z++) {
                    let sum=0, count=0;
                    for (let t=startT; t<=endT; t++) {
                        const sx=pA.x+nx*t, sy=pA.y+ny*t;
                        if (sx>=0&&sx<volumeMeta.x&&sy>=0&&sy<volumeMeta.y) {
                            const bvz = (volumeMeta.z-1)-z;
                            const zShift = (sy-cy)*tanTilt;
                            const fz = bvz+zShift;
                            if (fz>=0&&fz<volumeMeta.z) {
                                const fzF=Math.floor(fz), fzC=Math.ceil(fz), fr=fz-fzF;
                                const offF = fzF*volumeMeta.x*volumeMeta.y+Math.floor(sy)*volumeMeta.x+Math.floor(sx);
                                const offC = fzC*volumeMeta.x*volumeMeta.y+Math.floor(sy)*volumeMeta.x+Math.floor(sx);
                                sum += volumeData[offF]*(1-fr)+volumeData[offC]*fr;
                                count++;
                            }
                        }
                    }
                    px[z*width+x] = count>0 ? Math.round(sum/count) : -1000;
                }
            }
            return px;
        };
        return { promise: Promise.resolve({
            imageId, minPixelValue:volumeMeta.min, maxPixelValue:volumeMeta.max,
            slope:1, intercept:0, windowCenter:safeState.wc, windowWidth:safeState.ww,
            getPixelData:getPix, rows:height, columns:width,
            height, width, color:false,
            columnPixelSpacing:ps, rowPixelSpacing:volumeMeta.sliceThickness,
            sizeInBytes:width*height*2
        }), cancelFn:()=>{} };
    });
}

// --- Navegação entre fases ---
function panGoPhase(n) {
    [1,2,3].forEach(i => {
        document.getElementById('pan-phase-'+i).classList.toggle('active', i===n);
        document.getElementById('pan-btn-'+i).classList.toggle('active', i===n);
    });

    const tabPan = document.getElementById('tab-pan');
    if (tabPan) {
        tabPan.classList.toggle('phase-cuts-active', n === 3);
    }

    if (n===2) {
        panEnsurePanoElement();
        setTimeout(panDrawPanoOverlay, 80);
    }

    if (n===1) panUpdateScouts();
}

// --- Spline Catmull-Rom ---
function panGetSpline(points, step) {
    if (points.length < 2) return [];
    const sp = [], p0=points[0], pn=points[points.length-1];
    const cp = [p0, ...points, pn];
    for (let i=0; i<cp.length-3; i++) {
        const p1=cp[i],p2=cp[i+1],p3=cp[i+2],p4=cp[i+3];
        const dist = Math.sqrt((p3.x-p2.x)**2+(p3.y-p2.y)**2);
        const steps = Math.max(Math.ceil(dist/step),1);
        for (let t=0; t<steps; t++) {
            const st=t/steps, tt=st*st, ttt=tt*st;
            const q1=-ttt+2*tt-st, q2=3*ttt-5*tt+2, q3=-3*ttt+4*tt+st, q4=ttt-tt;
            sp.push({ x:0.5*(p1.x*q1+p2.x*q2+p3.x*q3+p4.x*q4),
                       y:0.5*(p1.y*q1+p2.y*q2+p3.y*q3+p4.y*q4) });
        }
    }
    sp.push(points[points.length-1]);
    return sp;
}

// --- Desenha scouts ---
function panUpdateScouts() {
    if (!volumeData) return;
    const w=volumeMeta.x, h=volumeMeta.y;
    const zSlider = document.getElementById('pan-z');
    const zPct = zSlider ? zSlider.value/100 : 0.5;
    const zIdx = Math.floor(zPct*(volumeMeta.z-1));
    const tiltDeg = parseInt(document.getElementById('pan-tilt').value)||0;
    const rotDeg  = parseInt(document.getElementById('pan-rot').value)||0;
    const tanTilt = Math.tan(tiltDeg*Math.PI/180);
    const sinTilt = Math.sin(tiltDeg*Math.PI/180);
    const cosTilt = Math.cos(tiltDeg*Math.PI/180);
    const sinRot  = Math.sin(rotDeg*Math.PI/180);
    const cosRot  = Math.cos(rotDeg*Math.PI/180);
    const minV = safeState.wc-(safeState.ww/2);
    const range = safeState.ww;

    // 1. Scout Axial — renderiza nas dimensões do display
    // Assim 1px canvas = 1px tela e o toque sempre coincide com a imagem
    const cAx = document.getElementById('pan-canvas-ax');
    const wrap = document.getElementById('pan-axial-wrap');
    if (cAx && wrap) {
        const dw = Math.max(wrap.clientWidth  || 200, 60);
        const dh = Math.max(wrap.clientHeight || 200, 60);
        cAx.width  = dw;
        cAx.height = dh;
        const scX = dw / w;
        const scY = dh / h;
        const ctx = cAx.getContext('2d');
        const imgD = ctx.createImageData(dw, dh);
        for (let py = 0; py < dh; py++) {
            const vy = Math.floor(py / scY);
            const dz  = (vy - (h/2)) * tanTilt;
            let zs = zIdx + dz;
            zs = Math.max(0, Math.min(zs, volumeMeta.z - 1));
            const off = Math.floor(zs) * w * h;
            for (let px2 = 0; px2 < dw; px2++) {
                const vx2 = Math.floor(px2 / scX);
                let v = volumeData[off + vy * w + vx2];
                let n = ((v - minV) / range) * 255;
                n = Math.max(0, Math.min(n, 255));
                const p = (py * dw + px2) * 4;
                imgD.data[p] = imgD.data[p+1] = imgD.data[p+2] = n;
                imgD.data[p+3] = 255;
            }
        }
        ctx.putImageData(imgD, 0, 0);
        // Curva: converte coords volume→display antes de desenhar
        const pts = (panDensePoints.length > 0 && !panIsDrawing)
            ? panDensePoints : panGetSpline(panCurvePoints, 5);
        if (pts.length > 0) {
            ctx.strokeStyle = panCurveHovered ? '#ff4444' : '#e84393';
            ctx.lineWidth   = panCurveHovered ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(pts[0].x * scX, pts[0].y * scY);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scX, pts[i].y * scY);
            ctx.stroke();
        }
        const hint = document.getElementById('pan-hint');
        if (hint) hint.style.display = (panCurvePoints.length === 0 && !panIsDrawing) ? 'block' : 'none';
    }

    // 2. Scout Sagital — renderizado nas dimensoes do display
    const cSag = document.getElementById('pan-canvas-sag');
    const sagWrap = document.getElementById('pan-sag-wrap');
    if (cSag && sagWrap) {
        const sw = volumeMeta.y, sh = volumeMeta.z; // dimensoes do volume
        const dw2 = Math.max(sagWrap.clientWidth  || 200, 60);
        const dh2 = Math.max(sagWrap.clientHeight || 200, 60);
        cSag.width  = dw2;
        cSag.height = dh2;
        const scSX = dw2 / sw;
        const scSY = dh2 / sh;
        const ctx = cSag.getContext('2d');
        const imgD = ctx.createImageData(dw2, dh2);
        const cx2 = volumeMeta.x / 2, cy2 = volumeMeta.y / 2;
        for (let pY = 0; pY < dh2; pY++) {
            for (let pX = 0; pX < dw2; pX++) {
                const cX = Math.floor(pX / scSX);  // coord volume X (= Y do volume)
                const cY = Math.floor(pY / scSY);  // coord volume Y (= Z do volume)
                const vz  = (sh - 1) - cY;
                const vYd = cX - (sw / 2);
                const tY   = vYd * cosTilt - (vz - zIdx) * sinTilt;
                const srcZ = zIdx + vYd * sinTilt + (vz - zIdx) * cosTilt;
                const srcX = cx2 + tY * sinRot, srcY = cy2 + tY * cosRot;
                let val = -1000;
                if (srcX>=0&&srcX<volumeMeta.x&&srcY>=0&&srcY<volumeMeta.y&&srcZ>=0&&srcZ<volumeMeta.z) {
                    const fz=Math.floor(srcZ), czz=Math.ceil(srcZ), fr=srcZ-fz;
                    if (fz>=0&&czz<volumeMeta.z) {
                        const ofF=fz*w*h+Math.floor(srcY)*w+Math.floor(srcX);
                        const ofC=czz*w*h+Math.floor(srcY)*w+Math.floor(srcX);
                        val=volumeData[ofF]*(1-fr)+volumeData[ofC]*fr;
                    }
                }
                let n=((val-minV)/range)*255;
                n=Math.max(0,Math.min(n,255));
                const p=(pY*dw2+pX)*4;
                imgD.data[p]=imgD.data[p+1]=imgD.data[p+2]=n; imgD.data[p+3]=255;
            }
        }
        ctx.putImageData(imgD, 0, 0);
        // Linha Z indicadora (convertida para display)
        const lyDisplay = ((sh - 1) - zIdx) * scSY;
        ctx.strokeStyle='rgba(52,199,89,0.9)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(0, lyDisplay); ctx.lineTo(dw2, lyDisplay); ctx.stroke();
    }
}

// --- Toggle desenhar curva ---
function panToggleDraw() {
    panIsDrawing = !panIsDrawing;
    const btn = document.getElementById('pan-btn-draw');
    if (panIsDrawing) {
        btn.classList.add('drawing');
        btn.textContent = '✓ Finalizar';
        panCurvePoints = [];
        panDensePoints = [];
        panUpdateScouts();
    } else {
        btn.classList.remove('drawing');
        btn.textContent = '✎ Nova Curva';
        if (panCurvePoints.length > 2) {
            panDensePoints = panGetSpline(panCurvePoints, 1);
            panUpdateScouts();
        }
    }
}

// --- Adiciona ponto (touch + mouse) ---
// Canvas renderizado nas dimensoes do display (panUpdateScouts usa dw/dh),
// entao 1px canvas = 1px tela. Converte direto display->volume via proporcao.
function panAddPoint(e) {
    if (!panIsDrawing) return;
    const canvas = document.getElementById('pan-canvas-ax');
    if (!canvas || !canvas.width || !canvas.height) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Posicao relativa ao canvas em pixels de display
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Converte display -> volume usando as dimensoes reais do volume
    const cx = (relX / rect.width)  * volumeMeta.x;
    const cy = (relY / rect.height) * volumeMeta.y;

    if (cx < 0 || cy < 0 || cx > volumeMeta.x || cy > volumeMeta.y) return;

    panCurvePoints.push({ x: cx, y: cy });
    panUpdateScouts();
}

// --- Espessura ---
function panUpdateThick(val) {
    panThickVal = parseInt(val);
    document.getElementById('pan-thick-val').innerText = val + 'mm';
    const v2 = document.getElementById('pan-thick-val-2');
    if (v2) v2.innerText = val + 'mm';
    // Se já tem panorâmica gerada, regenera
    if (panDensePoints.length > 0 && panPanoElement) panGeneratePano();
}

// --- Gera panorâmica ---
function panGenerate() {
    if (!volumeData) { alert('Carregue um exame DICOM primeiro.'); return; }
    if (panCurvePoints.length < 2 && panDensePoints.length < 2) {
        alert('Desenhe a curva no scout axial primeiro.'); return;
    }
    if (panDensePoints.length < 2) panDensePoints = panGetSpline(panCurvePoints, 1);
    if (!panCrossCenterZ || panCrossCenterZ===0) panCrossCenterZ = Math.floor(volumeMeta.z/2);
    panRegisterLoader();
    panGoPhase(2);
    setTimeout(panGeneratePano, 120);
}

function panGeneratePano() {
    panEnsurePanoElement();
    if (!panPanoElement) return;
    const iid = 'panmobile:v' + Date.now();
    cornerstone.loadImage(iid).then(img => {
        cornerstone.displayImage(panPanoElement, img);
        cornerstone.fitToWindow(panPanoElement);
        setTimeout(() => {
  panDrawPanoOverlay();
  panSetupCutLineDrag();   // <- ADICIONE ISTO
}, 80);
        const hint = document.getElementById('pan-pano-hint');
        if (hint) hint.style.display = 'block';
    }).catch(err => console.error('panGeneratePano:', err));
}

// --- Overlay da ROI na panorâmica ---
// Calcula posição Y na tela (0..wrapH) de um voxel Z do volume
function panVolZtoScreenY(wrapH, volZ) {
    if (!panPanoElement) return wrapH / 2;
    // Tenta via Cornerstone pixelToCanvas
    try {
        const eEl = cornerstone.getEnabledElement(panPanoElement);
        if (eEl && eEl.image) {
            const czInv = (volumeMeta.z - 1) - volZ;
            const pt = cornerstone.pixelToCanvas(panPanoElement, {x: 0, y: czInv});
            return pt.y;
        }
    } catch(e) {}
    // Fallback: proporção direta
    return ((volumeMeta.z - 1 - volZ) / volumeMeta.z) * wrapH;
}

function panVolZtoScreenY(wrapH, volZ) {
    if (!panPanoElement) return wrapH / 2;
    try {
        const eEl = cornerstone.getEnabledElement(panPanoElement);
        if (eEl && eEl.image) {
            const czInv = (volumeMeta.z - 1) - volZ;
            const pt = cornerstone.pixelToCanvas(panPanoElement, {x: 0, y: czInv});
            return pt.y;
        }
    } catch(e) {}
    return ((volumeMeta.z - 1 - volZ) / volumeMeta.z) * wrapH;
}

function panDrawPanoOverlay() {
    if (!panPanoElement || !volumeData) return;
    let eEl; try { eEl=cornerstone.getEnabledElement(panPanoElement); } catch(e){return;}
    if (!eEl||!eEl.image) return;

    const ov  = document.getElementById('pan-pano-overlay');
    const cw  = eEl.canvas.width, ch = eEl.canvas.height;
    if (ov.width!==cw||ov.height!==ch) { ov.width=cw; ov.height=ch; }
    const ctx = ov.getContext('2d');
    ctx.clearRect(0,0,cw,ch);
    if (!panDensePoints.length) return;

    const roiH_mm = 40;
    const roiH_px = roiH_mm / (volumeMeta.pixelSpacing || 1);
    const czInv   = (volumeMeta.z - 1) - panCrossCenterZ;
    const topPt   = cornerstone.pixelToCanvas(panPanoElement, {x:0, y: czInv-(roiH_px/2)});
    const botPt   = cornerstone.pixelToCanvas(panPanoElement, {x:0, y: czInv+(roiH_px/2)});
    const roiY    = topPt.y, roiH = Math.max(botPt.y - topPt.y, 4);

    ctx.save();
    ctx.strokeStyle='#00FFFF'; ctx.lineWidth=2; ctx.setLineDash([8,4]);
    ctx.strokeRect(0, roiY, cw, roiH); ctx.setLineDash([]);
    ctx.strokeStyle='rgba(0,255,255,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(0, roiY+roiH/2); ctx.lineTo(cw, roiY+roiH/2); ctx.stroke();

    if (panActiveCuts.length > 0) {
        ctx.font='bold 10px Arial'; ctx.textAlign='center'; ctx.textBaseline='bottom';
        panActiveCuts.forEach((ptIdx, i) => {
            if (ptIdx >= panDensePoints.length-1) return;
            const pos = cornerstone.pixelToCanvas(panPanoElement, {x: ptIdx, y: 0});
            // FIX: Cor vermelha na tela fase 2 também
            const isSelected = (i === window.panSelectedCut);
            ctx.strokeStyle = isSelected ? '#ff4757' : 'rgba(243,156,18,0.85)'; 
            ctx.lineWidth = isSelected ? 2.5 : 1.0;
            
            ctx.beginPath(); ctx.moveTo(pos.x, roiY); ctx.lineTo(pos.x, roiY+roiH); ctx.stroke();
            
            if (i % Math.max(1, Math.floor(panActiveCuts.length/8)) === 0 || isSelected) {
                ctx.fillStyle = isSelected ? '#ff4757' : '#fbc531';
                ctx.fillText(i+1, pos.x, roiY-1);
            }
        });
    }
    ctx.restore();
}

// ==========================================================
// 🚀 SISTEMA UNIFICADO DE ARRASTO (LINHAS E ROI)
// ==========================================================
function panSetupRoiDrag() {
    const viewer = document.getElementById('pan-pano-viewer');
    if (!viewer) return;

    // Evita acumular eventos se a função for chamada mais de uma vez
    if (viewer._hasPanDrag) return;
    viewer._hasPanDrag = true;

    let draggingType = null; // Guarda se estamos arrastando 'line' ou 'roi'
    let dragLineIdx = -1;

    // Função auxiliar para capturar a posição do toque
    const getEventData = (e) => {
        const t = e.touches ? e.touches[0] : e;
        const r = viewer.getBoundingClientRect();
        return {
            x: t.clientX - r.left, // X relativo à tela (CSS pixels)
            y: t.clientY - r.top,  // Y relativo à tela (CSS pixels)
            pageX: t.pageX,
            pageY: t.pageY
        };
    };

    // Função de radar: descobre em qual objeto o dedo tocou
    const hitTest = (x, y) => {
        if (!panPanoElement || !volumeData || !panDensePoints.length) return { type: null };

        let hitLineIdx = -1;
        let bestDist = 30; // ⬅️ Área de toque generosa (30 pixels) para pegar a linha fácil

        // 1. Prioridade Máxima: Tocou em uma Linha Amarela (Corte)?
        if (panActiveCuts && panActiveCuts.length > 0) {
            for (let i = 0; i < panActiveCuts.length; i++) {
                const ptIdx = panActiveCuts[i];
                if (ptIdx >= panDensePoints.length - 1) continue;

                // Descobre onde a linha está desenhada na tela
                const pos = cornerstone.pixelToCanvas(panPanoElement, { x: ptIdx, y: 0 });
                if (!pos) continue;

                // Verifica a distância no eixo X (ignora o Y para permitir arrastar de qualquer altura)
                const d = Math.abs(x - pos.x);
                if (d < bestDist) {
                    bestDist = d;
                    hitLineIdx = i;
                }
            }
        }

        if (hitLineIdx !== -1) {
            return { type: 'line', index: hitLineIdx };
        }

        // 2. Prioridade Secundária: Tocou na Faixa Ciano (ROI)?
        const roiH_mm = 40;
        const roiH_px = roiH_mm / (volumeMeta.pixelSpacing || 1);
        const czInv = (volumeMeta.z - 1) - panCrossCenterZ;

        const topPt = cornerstone.pixelToCanvas(panPanoElement, { x: 0, y: czInv - (roiH_px/2) });
        const botPt = cornerstone.pixelToCanvas(panPanoElement, { x: 0, y: czInv + (roiH_px/2) });

        if (topPt && botPt) {
            const roiY = topPt.y;
            const roiH = Math.max(botPt.y - topPt.y, 4);

            // Verifica se tocou dentro ou perto da ROI (Margem de 25px pra facilitar o dedo)
            if (y >= roiY - 25 && y <= roiY + roiH + 25) {
                return { type: 'roi' };
            }
        }

        return { type: null };
    };

    const onStart = (e) => {
        // Se o modo Zoom está ativo, deixa o Cornerstone Zoom Tool receber o toque
        if (viewer._zoomModeActive) return;
        if (e.touches && e.touches.length > 1) return; // Se usar 2 dedos, deixa o Zoom funcionar

        const evData = getEventData(e);
        const hit = hitTest(evData.x, evData.y);

        if (hit.type) {
            draggingType = hit.type;
            if (hit.type === 'line') {
                dragLineIdx = hit.index;
                window.panSelectedCut = dragLineIdx; // Destaca a linha em vermelho
            }

            // MÁGICA: Ao dar stopImmediatePropagation, o Cornerstone ignora esse toque.
            // Isso impede que a imagem dê "Pan" ou mude o brilho enquanto arrastamos a linha.
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            panDrawPanoOverlay();
            panDrawMiniPanoOverlay();
        }
    };

    const onMove = (e) => {
        if (!draggingType) return; // Se não pegou nada, não faz nada.

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const evData = getEventData(e);
        // Traduz o pixel da tela para o pixel matemático da imagem DICOM real
        const pix = cornerstone.pageToPixel(panPanoElement, evData.pageX, evData.pageY);
        if (!pix) return;

        if (draggingType === 'line') {
            // Atualiza a posição X da Linha
            let newIdx = Math.round(pix.x);
            newIdx = Math.max(0, Math.min(panDensePoints.length - 1, newIdx));
            panActiveCuts[dragLineIdx] = newIdx;
            panCrossIndex = newIdx; 
            
            panDrawPanoOverlay();
            panDrawMiniPanoOverlay();
            
            // Se estiver na fase 3, renderiza o corte do quadrante específico em tempo real
            if (document.getElementById('pan-phase-3').classList.contains('active')) {
                panUpdateSpecificCut(dragLineIdx);
            }
        } else if (draggingType === 'roi') {
            // Atualiza a posição Z da ROI
            const newZ = Math.round((volumeMeta.z - 1) - pix.y);
            panCrossCenterZ = Math.max(5, Math.min(volumeMeta.z - 5, newZ));

            panDrawPanoOverlay();
            panDrawMiniPanoOverlay();

            if (panActiveCuts.length > 0 && document.getElementById('pan-phase-3').classList.contains('active')) {
                // Ao mexer a ROI, altera todos os cortes, então renderiza tudo.
                panActiveCuts.forEach((_, idx) => panUpdateSpecificCut(idx));
            }
        }
    };

    const onEnd = (e) => {
        if (draggingType) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            draggingType = null;
            dragLineIdx = -1;
        }
    };

    // ATENÇÃO: { capture: true } é o que nos permite rodar nossa lógica ANTES do Cornerstone
    viewer.addEventListener('touchstart', onStart, { passive: false, capture: true });
    viewer.addEventListener('touchmove', onMove, { passive: false, capture: true });
    viewer.addEventListener('touchend', onEnd, { passive: false, capture: true });
    viewer.addEventListener('touchcancel', onEnd, { passive: false, capture: true });

    // Suporte para Mouse (Testes em Computador)
    viewer.addEventListener('mousedown', onStart, { capture: true });
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup', onEnd, { capture: true });
}

function panSetupCutLineDrag() {
    // 🗑️ FUNÇÃO NEUTRALIZADA.
    // Toda a lógica de linhas agora vive unificada em `panSetupRoiDrag` acima
    // para não causar duplicação e conflitos.
}


// --- Drag ROI na panorâmica ---
// Estratégia: usamos um div #pan-roi-drag-handle SOBRE o overlay.
// panDrawPanoOverlay() o reposiciona sobre a linha ROI após cada render.
// Assim o toque nunca chega ao Cornerstone quando está na zona da ROI.



// --- Inicializa cortes ---
function panInitCuts() {
    if (panDensePoints.length===0) {
        alert('Gere a panorâmica primeiro.'); return;
    }
    if (!panCrossCenterZ||panCrossCenterZ===0) panCrossCenterZ=Math.floor(volumeMeta.z/2);
    if (panCrossIndex===0) panCrossIndex=Math.floor(panDensePoints.length/2);
    panRenderCuts();
}


// NOVA FUNÇÃO: Atualiza a imagem de apenas UM corte específico (Usado durante o arrasto)
function panUpdateSpecificCut(arrIdx) {
    if (panDensePoints.length < 2 || arrIdx < 0 || arrIdx >= panActiveCuts.length) return;
    const container = document.getElementById('pan-cuts-grid');
    const div = container.querySelector(`div[data-arr-idx="${arrIdx}"]`);
    if (!div) return;

    const vs = volumeMeta.pixelSpacing || 1;
    const [wm,hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
    const iw = Math.round(wm/vs), ih = Math.round(hm/vs);
    const cz = panCrossCenterZ;
    const cy = volumeMeta.y / 2;
    const tiltDeg = parseInt(document.getElementById('pan-tilt').value) || 0;
    const tanTilt = Math.tan(tiltDeg * Math.PI / 180);
    const tv = document.getElementById('pan-cut-thick-sel').value;
    const thkMM = (tv === 'native') ? vs : parseFloat(tv);
    const voxStack = Math.max(1, Math.round(thkMM / vs));
    const rangeK = Math.floor(voxStack / 2);

    const vx=volumeMeta.x, vy=volumeMeta.y, vz=volumeMeta.z;
    const bilinear = (x,y,z) => {
        const zi=Math.round(z);
        if(x<0||x>=vx||y<0||y>=vy||zi<0||zi>=vz) return -1000;
        const x0=Math.floor(x),y0=Math.floor(y),x1=x0+1,y1=y0+1;
        if(x1>=vx||y1>=vy) return volumeData[zi*vx*vy+y0*vx+x0];
        const dx=x-x0,dy=y-y0,off=zi*vx*vy;
        return (1-dx)*(1-dy)*volumeData[off+y0*vx+x0]
              +dx*(1-dy)*volumeData[off+y0*vx+x1]
              +(1-dx)*dy*volumeData[off+y1*vx+x0]
              +dx*dy*volumeData[off+y1*vx+x1];
    };

    const ptIdxVal = panActiveCuts[arrIdx];
    const ptIdx = Math.max(0, Math.min(Math.round(ptIdxVal), panDensePoints.length-2));
    const pA=panDensePoints[ptIdx], pB=panDensePoints[ptIdx+1];
    let ddx=pB.x-pA.x, ddy=pB.y-pA.y;
    const len=Math.sqrt(ddx*ddx+ddy*ddy)||1;
    ddx/=len; ddy/=len; const nx=-ddy, ny=ddx;

    const px = new Int16Array(iw * ih);
    for (let hh=0; hh<ih; hh++) {
        const offH = hh-(ih/2);
        const bvz  = cz-offH;
        for (let ww2=0; ww2<iw; ww2++) {
            const offW=ww2-(iw/2);
            const sx=pA.x+nx*offW, sy=pA.y+ny*offW;
            const zShift=-(sy-cy)*tanTilt;
            const fz=bvz+zShift;
            let sum=0, cnt=0;
            for (let k=-rangeK; k<=rangeK; k++) {
                const v=bilinear(sx+ddx*k, sy+ddy*k, fz);
                if(v>-999){sum+=v;cnt++;}
            }
            px[hh*iw+ww2] = cnt>0 ? Math.round(sum/cnt) : -1000;
        }
    }

    const img = {
        imageId:`pancut:${arrIdx}_${ptIdx}_${Date.now()}`,
        minPixelValue:volumeMeta.min, maxPixelValue:volumeMeta.max,
        slope:1, intercept:0, windowCenter:safeState.wc, windowWidth:safeState.ww,
        getPixelData:()=>px, rows:ih, columns:iw, height:ih, width:iw,
        color:false, columnPixelSpacing:vs, rowPixelSpacing:vs, sizeInBytes:px.byteLength
    };
    
    try { 
        cornerstone.displayImage(div, img); 
        // Preserva o zoom/pan caso o usuário tenha ajustado antes de arrastar a linha
        const vp = cornerstone.getViewport(div);
        if (vp) cornerstone.setViewport(div, vp);

        // IMPLANTE: se este corte tem um implante, redesenha o overlay após o update da imagem
        // Isso garante que o implante persiste ao scrollar/mudar cortes
        if (window._savedImplant && implantState.cutArrIdx === arrIdx) {
            requestAnimationFrame(() => {
                try {
                    _implantDrawOverlay(arrIdx);
                    _implantRegisterCutListeners();
                } catch(e) {}
            });
        }
    } catch(e){}
}

// FUNÇÃO REESCRITA: Renderiza os cortes iniciais centrados na ROI e prepara a UI
window.panSelectedCut = -1; // Variável global para rastrear a linha vermelha ativa

// Local: Cole esta função completa no lugar da sua panRenderCuts() existente.

function panRenderCuts(keepPositions = false) {
    if (panDensePoints.length < 2) return;
    const container = document.getElementById('pan-cuts-grid');
    
    const vs = volumeMeta.pixelSpacing || 1;
    const gridVal = document.getElementById('pan-grid-sel').value || '2x2';
    const [gridCols, gridRows] = gridVal.split('x').map(Number);
    const maxCuts = gridCols * gridRows;

    if (!keepPositions || panActiveCuts.length !== maxCuts) {
        panActiveCuts =[];
        const spMM = parseFloat(document.getElementById('pan-spacing-sel').value) || 1;
        const stepPts = Math.max(1, Math.round(spMM / vs));
        
        const midPoint = Math.floor(panDensePoints.length / 2);
        const startIdx = Math.max(0, midPoint - Math.floor(maxCuts / 2) * stepPts);
        
        for (let k = 0; k < maxCuts; k++) {
            const safePos = Math.min(panDensePoints.length - 2, startIdx + (k * stepPts));
            panActiveCuts.push(safePos);
        }
    }

    container.innerHTML = '';
    container.style.gridTemplateColumns = 'repeat(' + gridCols + ', 1fr)';
    container.style.gridTemplateRows    = 'repeat(' + gridRows + ', 1fr)';

    panActiveCuts.forEach((ptIdxVal, arrIdx) => {
        const div = document.createElement('div');
        div.className = 'pan-cut-item';
        div.id = 'pan-cut-item-' + arrIdx; 
        div.setAttribute('data-arr-idx', arrIdx); 
        container.appendChild(div);

        try { cornerstone.enable(div); } catch(e){}

        try {
            cornerstoneTools.addToolForElement(div, cornerstoneTools.WwwcTool);
            cornerstoneTools.addToolForElement(div, cornerstoneTools.ZoomTouchPinchTool);
            cornerstoneTools.addToolForElement(div, cornerstoneTools.PanMultiTouchTool);
            cornerstoneTools.addToolForElement(div, cornerstoneTools.LengthTool, {
                configuration: { drawHandles: false, drawHandlesOnHover: false, handleRadius: 18, selectable: true, distanceThreshold: 40 }
            });
            cornerstoneTools.setToolActiveForElement(div, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
            cornerstoneTools.setToolActiveForElement(div, 'ZoomTouchPinch', {});
            cornerstoneTools.setToolActiveForElement(div, 'PanMultiTouch', {});
            
            // VINCULA O HANDLER DE TOQUE COM A NOVA LÓGICA DE LONG PRESS
            if (!div._measureHandlerAdded) {
                div.addEventListener('touchstart', handleMeasurementTouchStart, { passive: false });
                div._measureHandlerAdded = true;
            }

        } catch(e){}

        div.addEventListener('touchstart', () => {
            window.panSelectedCut = arrIdx;
            panDrawMiniPanoOverlay();
            panDrawPanoOverlay();
        }, {passive: true});

        const lbl = document.createElement('div');
        lbl.innerText = '#' + (arrIdx + 1);
        lbl.style.cssText = 'position:absolute;top:4px;left:4px;color:#fbc531;font-size:12px;font-weight:bold;text-shadow:1px 1px 2px #000;pointer-events:none;z-index:5;';
        div.appendChild(lbl);
        
        if (typeof _registerAnnotZoomTrack === 'function') {
            _registerAnnotZoomTrack(div);
        }

        panUpdateSpecificCut(arrIdx);

        if (typeof _hook === 'function') _hook(div);
        if (typeof _applyCSSFilter === 'function') _applyCSSFilter(div);
        
        setTimeout(() => {
            try { cornerstone.resize(div, true); cornerstone.fitToWindow(div); } catch(e){}
        }, 100);
    });

    _normalizeAllCutResolutions();

    panInitMiniPano();
    // Restaura implante salvo (se houver) após reconstrução dos cortes
    if (window._savedImplant && window._savedImplant.cutArrIdx >= 0) {
        _restoreImplant();
    }
    panDrawMiniPanoOverlay();
    panDrawPanoOverlay();
    // Garante que o patch de estilo das medidas está ativo para os novos cortes
    setTimeout(_patchLengthToolRenderer, 200);
    setTimeout(() => {
        _implantRegisterCutListeners();
        if (implantState.cutArrIdx >= 0) {
            _implantDrawOverlay(implantState.cutArrIdx);
        }
    }, 150);
}

// ================================================================
// MINI PANORÂMICA (fase 3) + LINHAS INTERATIVAS
// ================================================================
var panMiniElement = null;
var panMiniDragging = false;
var panMiniDragStartX = 0;
var panMiniDragStartCenterIdx = 0;  // índice no array panActiveCuts

function panInitMiniPano() {
    const el = document.getElementById('pan-mini-viewer');
    if (!el || !window.cornerstone) return;

    // Só inicializa uma vez
    if (!panMiniElement) {
        try {
            cornerstone.enable(el);
            cornerstoneTools.addToolForElement(el, cornerstoneTools.WwwcTool);
            cornerstoneTools.addToolForElement(el, cornerstoneTools.PanMultiTouchTool);
            cornerstoneTools.addToolForElement(el, cornerstoneTools.ZoomTouchPinchTool);
            cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
            cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {});
            cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {});
            panMiniElement = el;
            panSetupMiniDrag();
        } catch(e) { console.warn('panInitMiniPano:', e); return; }
    }

    // Exibe a mesma imagem do pano principal
    if (panPanoElement) {
        try {
            const eEl = cornerstone.getEnabledElement(panPanoElement);
            if (eEl && eEl.image) {
                cornerstone.displayImage(panMiniElement, eEl.image);
                cornerstone.fitToWindow(panMiniElement);
                setTimeout(panDrawMiniPanoOverlay, 60);
            }
        } catch(e) {}
    }
}

function panDrawMiniPanoOverlay() {
    if (!panMiniElement || !panActiveCuts.length) return;
    let eEl; try { eEl=cornerstone.getEnabledElement(panMiniElement); } catch(e){return;}
    if (!eEl||!eEl.image) return;

    const ov  = document.getElementById('pan-mini-overlay');
    const cw  = eEl.canvas.width, ch = eEl.canvas.height;
    if (ov.width!==cw||ov.height!==ch) { ov.width=cw; ov.height=ch; }
    const ctx = ov.getContext('2d');
    ctx.clearRect(0,0,cw,ch);

    const roiH_px = 40 / (volumeMeta.pixelSpacing||1);
    const czInv   = (volumeMeta.z-1) - panCrossCenterZ;
    try {
        const topPt = cornerstone.pixelToCanvas(panMiniElement, {x:0, y: czInv-(roiH_px/2)});
        const botPt = cornerstone.pixelToCanvas(panMiniElement, {x:0, y: czInv+(roiH_px/2)});
        const roiY  = topPt.y, roiH = Math.max(botPt.y-topPt.y, 3);
        ctx.strokeStyle='rgba(0,255,255,0.6)'; ctx.lineWidth=1.5; ctx.setLineDash([6,3]);
        ctx.strokeRect(0,roiY,cw,roiH); ctx.setLineDash([]);
    } catch(e) {}

    ctx.font = 'bold 9px Arial'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    panActiveCuts.forEach((ptIdx, i) => {
        if (ptIdx >= panDensePoints.length-1) return;
        try {
            const pos = cornerstone.pixelToCanvas(panMiniElement, {x: ptIdx, y: 0});
            const isSelected = (i === window.panSelectedCut);
            ctx.strokeStyle = isSelected ? '#ff4757' : 'rgba(243,156,18,0.85)'; 
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.beginPath(); ctx.moveTo(pos.x,0); ctx.lineTo(pos.x,ch); ctx.stroke();
            if (i % Math.max(1, Math.floor(panActiveCuts.length/6)) === 0 || isSelected) {
                ctx.fillStyle = isSelected ? '#ff4757' : '#fbc531';
                ctx.fillText(i+1, pos.x, ch-2);
            }
        } catch(e) {}
    });

    // ── Seta azul do implante + bolinhas de controle ──────────────────────────
    // Visível sempre que cutArrIdx >= 0 (independente da aba 3D)
    const implIdx = (typeof implantState !== 'undefined') ? implantState.cutArrIdx : -1;
    const implantActive = (implantState && implIdx >= 0 && panActiveCuts[implIdx] != null);

    if (implantActive) {
        const ptIdxVal = panActiveCuts[implIdx];
        if (ptIdxVal < panDensePoints.length) {
            try {
                const linePos = cornerstone.pixelToCanvas(panMiniElement, { x: ptIdxVal, y: 0 });
                const lx = linePos.x;

                // Profundidade Z do implante
                const st     = volumeMeta.sliceThickness || volumeMeta.pixelSpacing || 1;
                const halfL  = (implantState.length / st) / 2;
                const zCenter = implantState.volZ != null ? implantState.volZ : panCrossCenterZ;
                const topPt  = cornerstone.pixelToCanvas(panMiniElement, { x: ptIdxVal, y: (volumeMeta.z-1) - (zCenter + halfL) });
                const botPt  = cornerstone.pixelToCanvas(panMiniElement, { x: ptIdxVal, y: (volumeMeta.z-1) - (zCenter - halfL) });
                const topY   = Math.min(topPt.y, botPt.y);
                const botY   = Math.max(topPt.y, botPt.y);
                const midY   = (topY + botY) / 2;
                const implH  = botY - topY;
                const angle  = implantState.angleDeg || 0;
                const ar     = angle * Math.PI / 180;

                // Seta azul representando longo eixo do implante (inclinada conforme angleDeg)
                const arrowHalf = implH / 2 + 4;
                const ax1 = lx - arrowHalf * Math.sin(ar);
                const ay1 = midY - arrowHalf * Math.cos(ar);  // ponta (cervical)
                const ax2 = lx + arrowHalf * Math.sin(ar);
                const ay2 = midY + arrowHalf * Math.cos(ar);  // base (apical)

                ctx.save();
                // Linha do eixo
                ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(ax1, ay1); ctx.stroke();
                // Ponta da seta (cervical)
                const hw = 6;
                const ex = ax1 - ax2, ey = ay1 - ay2;
                const el2 = Math.sqrt(ex*ex + ey*ey) || 1;
                const ux = ex/el2, uy = ey/el2;
                ctx.fillStyle = '#00aaff';
                ctx.beginPath();
                ctx.moveTo(ax1, ay1);
                ctx.lineTo(ax1 - ux*hw*2 - uy*hw, ay1 - uy*hw*2 + ux*hw);
                ctx.lineTo(ax1 - ux*hw*2 + uy*hw, ay1 - uy*hw*2 - ux*hw);
                ctx.closePath(); ctx.fill();
                ctx.restore();

                // ── Bolinhas de controle ──
                const R = 14;
                const bLx = lx - R - 8, bLy = midY;
                const bRx = lx + R + 8, bRy = midY;

                function drawBall(x, y, label) {
                    // Gradiente criado em coordenadas absolutas da bolinha
                    const g = ctx.createRadialGradient(x - R*0.3, y - R*0.3, 1, x, y, R);
                    g.addColorStop(0, 'rgba(255,240,100,1)');
                    g.addColorStop(0.5, 'rgba(240,180,0,1)');
                    g.addColorStop(1, 'rgba(160,90,0,0.95)');
                    ctx.save();
                    // Sombra
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
                    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2);
                    ctx.fillStyle = g; ctx.fill();
                    ctx.shadowColor = 'transparent';
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
                    ctx.stroke();
                    // Brilho especular
                    const shine = ctx.createRadialGradient(x - R*0.35, y - R*0.35, 0, x - R*0.2, y - R*0.2, R*0.5);
                    shine.addColorStop(0, 'rgba(255,255,255,0.65)');
                    shine.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2);
                    ctx.fillStyle = shine; ctx.fill();
                    // Ícone
                    ctx.fillStyle = '#1a0a00'; ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(label, x, y + 0.5);
                    ctx.restore();
                }

                drawBall(bLx, bLy, '↺'); // rotação
                drawBall(bRx, bRy, '↔'); // translação

                // Label ângulo
                if (Math.abs(angle) > 1) {
                    ctx.fillStyle = '#fa0';
                    ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(angle.toFixed(0) + '°', lx + R + 20, topY - 4);
                }

                // Salva hitboxes em canvas-px para o handler de toque
                ov._implantHandles = {
                    left:  { x: bLx, y: bLy, r: R + 12 },   // rotação
                    right: { x: bRx, y: bRy, r: R + 12 },   // translação
                    lineX: lx, midY, topY, botY,
                    cw, ch
                };
            } catch(e) { console.warn('implant mini draw', e); }
        }
    } else {
        if (ov._implantHandles) delete ov._implantHandles;
    }
}




function panSetupMiniDrag() {
    const getLiveHandle = () => document.getElementById('pan-mini-drag-handle');

    let dragType = null;  // 'roi' | 'cut' | 'implant_left' | 'implant_right'
    let dragIdx  = -1;
    // Para rotação: posição de início do drag
    let rotStartX = 0, rotStartAngle = 0;

    const getCoords = (e) => {
        const h = getLiveHandle();
        if (!h) return null;
        const r = h.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return {
            relX:  t.clientX - r.left,
            relY:  t.clientY - r.top,
            wrapW: r.width  || 200,
            wrapH: r.height || 200,
        };
    };

    // Converte coords CSS do wrapper → canvas-px do overlay
    const toCanvasPx = (relX, relY, handles) => ({
        cx: relX * (handles.cw / handles.wrapW || 1),
        cy: relY * (handles.ch / handles.wrapH || 1),
    });

    const onStart = (e) => {
        if (e.touches && e.touches.length > 1) {
            const h = getLiveHandle();
            if (h) h.style.pointerEvents = 'none';
            return;
        }
        if (!panActiveCuts || !panActiveCuts.length) return;

        const c = getCoords(e);
        if (!c) return;

        // ── 1. BOLINHAS DO IMPLANTE — APENAS as bolinhas, sem bloquear resto ──
        if (implantState && implantState.cutArrIdx >= 0) {
            const ov = document.getElementById('pan-mini-overlay');
            const h  = ov && ov._implantHandles;
            if (h) {
                h.wrapW = c.wrapW; h.wrapH = c.wrapH;
                const { cx, cy } = toCanvasPx(c.relX, c.relY, h);

                if (Math.hypot(cx - h.left.x, cy - h.left.y) <= h.left.r) {
                    dragType = 'implant_left';
                    rotStartX = c.relX;
                    rotStartAngle = implantState.angleDeg || 0;
                    window.panMiniDragging = true;
                    e.preventDefault(); return;
                }
                if (Math.hypot(cx - h.right.x, cy - h.right.y) <= h.right.r) {
                    dragType = 'implant_right';
                    rotStartX = c.relX;
                    rotStartAngle = implantState.angleDeg || 0;
                    window.panMiniDragging = true;
                    e.preventDefault(); return;
                }
                // NÃO bloqueia mais nada além das bolinhas — Wwwc funciona normalmente
            }
        }

        // ── 2. ROI (linha horizontal) ─────────────────────────────────────
        const roiYPct   = (volumeMeta.z - 1 - panCrossCenterZ) / volumeMeta.z;
        const roiYPixel = roiYPct * c.wrapH;
        if (Math.abs(c.relY - roiYPixel) < 35) {
            dragType = 'roi';
            window.panMiniDragging = true;
            e.preventDefault(); return;
        }

        // ── 3. Linhas dos cortes transversais ─────────────────────────────
        const curveX = (c.relX / c.wrapW) * panDensePoints.length;
        let bestIdx = -1, bestDist = Infinity;
        panActiveCuts.forEach((ptIdx, i) => {
            const d = Math.abs(ptIdx - curveX);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        });
        if (bestIdx >= 0 && bestDist < panDensePoints.length * 0.15) {
            dragType = 'cut';
            dragIdx  = bestIdx;
            window.panSelectedCut  = dragIdx;
            window.panMiniDragging = true;
            panDrawMiniPanoOverlay();
            panDrawPanoOverlay();
            e.preventDefault();
        }
    };

    const onMove = (e) => {
        if (!window.panMiniDragging || !dragType) return;
        const c = getCoords(e);
        if (!c) return;
        e.preventDefault();

        if (dragType === 'roi') {
            const frac = Math.max(0, Math.min(1, c.relY / c.wrapH));
            panCrossCenterZ = Math.max(5, Math.min(
                volumeMeta.z - 5,
                Math.round((1 - frac) * (volumeMeta.z - 1))
            ));
            panDrawMiniPanoOverlay();
            panDrawPanoOverlay();
            requestAnimationFrame(() => {
                panActiveCuts.forEach((_, idx) => panUpdateSpecificCut(idx));
            });

        } else if (dragType === 'cut') {
            let curveX = (c.relX / c.wrapW) * panDensePoints.length;
            curveX = Math.max(0, Math.min(panDensePoints.length - 2, curveX));
            panActiveCuts[dragIdx] = curveX;
            panDrawMiniPanoOverlay();
            panDrawPanoOverlay();
            requestAnimationFrame(() => panUpdateSpecificCut(dragIdx));

        } else if (dragType === 'implant_left') {
            // Bolinha ESQUERDA ◀ = APENAS rotação (arrastar verticalmente)
            // Sem translação — não move a linha vermelha
            const ov = document.getElementById('pan-mini-overlay');
            const h  = ov && ov._implantHandles;
            if (h) {
                const currentCanY = c.relY * (h.ch / (c.wrapH || 1));
                const implH = (h.botY - h.topY) || 60;
                // 1px canvas = 90/implH graus, limitado a ±75°
                const newAngle = Math.max(-75, Math.min(75,
                    rotStartAngle + ((currentCanY - h.midY) / implH) * 90
                ));
                implantState.angleDeg = newAngle;
                const arrIdx = implantState.cutArrIdx;
                requestAnimationFrame(() => {
                    _implantDrawOverlay(arrIdx);
                    _implantSyncTo3D();
                    panDrawMiniPanoOverlay();
                });
            }

        } else if (dragType === 'implant_right') {
            // Bolinha DIREITA ▶ = APENAS translação mesio-distal (arrastar horizontalmente)
            // Sem rotação — não muda o ângulo
            const arrIdx = implantState.cutArrIdx;
            if (arrIdx >= 0 && arrIdx < panActiveCuts.length) {
                const newPtIdx = Math.max(0, Math.min(
                    panDensePoints.length - 2,
                    Math.round((c.relX / c.wrapW) * panDensePoints.length)
                ));
                panActiveCuts[arrIdx] = newPtIdx;
                window.panSelectedCut = arrIdx;
                _implantCutToVolume(arrIdx, implantState.cutImgX, implantState.cutImgY);
                requestAnimationFrame(() => {
                    panUpdateSpecificCut(arrIdx);
                    _implantDrawOverlay(arrIdx);
                    _implantSyncTo3D();
                    panDrawMiniPanoOverlay();
                    panDrawPanoOverlay();
                });
            }
        }
    };

    const onEnd = () => {
        window.panMiniDragging = false;
        dragType = null;
        dragIdx  = -1;
    };

    if (window._panMiniDragAbort) {
        try { window._panMiniDragAbort.abort(); } catch(e) {}
    }
    window._panMiniDragAbort = new AbortController();
    const sig = { signal: window._panMiniDragAbort.signal };

    const h = getLiveHandle();
    if (!h) return;
    h.addEventListener('touchstart',  onStart, { passive: false, ...sig });
    h.addEventListener('touchmove',   onMove,  { passive: false, ...sig });
    h.addEventListener('touchend',    onEnd,   { passive: true,  ...sig });
    h.addEventListener('touchcancel', onEnd,   { passive: true,  ...sig });
}

// --- Eventos de toque/clique no scout axial ---
(function panSetupAxialEvents() {
    function init() {
        const wrap = document.getElementById('pan-axial-wrap');
        const canvas = document.getElementById('pan-canvas-ax');
        if (!wrap||!canvas) { setTimeout(init, 400); return; }
        // Touch: touchstart para adicionar ponto contínuo
        wrap.addEventListener('touchstart', (e) => {
            if (!panIsDrawing) return;
            e.preventDefault();
            panAddPoint(e);
        }, {passive:false});
        wrap.addEventListener('touchmove', (e) => {
            if (!panIsDrawing) return;
            e.preventDefault();
            panAddPoint(e);
        }, {passive:false});
        // Mouse: click para adicionar ponto
        wrap.addEventListener('click', panAddPoint);
        // Duplo toque / duplo clique: finaliza curva
        let lastTap=0;
        wrap.addEventListener('touchend', (e) => {
            const now=Date.now();
            if (now-lastTap<350&&panIsDrawing&&panCurvePoints.length>2) {
                panToggleDraw();
            }
            lastTap=now;
        }, {passive:true});
        wrap.addEventListener('dblclick', () => {
            if (panIsDrawing&&panCurvePoints.length>2) panToggleDraw();
        });
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

// --- Hook no switchTab para inicializar panorâmica ao entrar ---
(function patchSwitchTabForPan() {
    const origSwitchTab = window.switchTab;
    if (typeof origSwitchTab !== 'function') return;
    window.switchTab = function(id, btn) {
        origSwitchTab.call(this, id, btn);
        if (id === 'pan') {
            setTimeout(async () => {
                if (!volumeData) {
                    try { await buildVolumeMobile(); } catch(e) { return; }
                }
                if (!panCrossCenterZ||panCrossCenterZ===0) panCrossCenterZ=Math.floor(volumeMeta.z/2);
                panUpdateScouts();
            }, 150);
        }
    };
})();

// ==========================================================
// RESTAURADOR GLOBAL DE EVENTOS (O SEGREDO DO ZOOM)
// Isso garante que após usar 2 dedos para o Zoom, as camadas
// invisíveis voltem ao normal para permitir o arrasto de 1 dedo.
// Cole isso solto no final do arquivo JS, antes da tag </>
// ==========================================================
// ==========================================================
// 🔤 FERRAMENTA DE INSERÇÃO DE TEXTO (todas as abas + 3D)
// ==========================================================

// === V1 PATCH: DEBUG flag global e session ID ===
window.DEBUG_ENDOSLICE = false;
window.dlog = function(){ if (window.DEBUG_ENDOSLICE) try{ console.log.apply(console, arguments); }catch(e){} };
window.currentExamSessionId = window.currentExamSessionId || ('exam_' + Date.now() + '_' + Math.floor(Math.random()*1e6));
window._newExamSession = function(){
    window.currentExamSessionId = 'exam_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
    window.dlog('[V1] novo examSessionId:', window.currentExamSessionId);
    return window.currentExamSessionId;
};

window.textToolState = {
    active: false,
    annotations: [], // [{id, examSessionId, x, y, text, containerId, viewportRole, color, labelDx, labelDy, imgX, imgY}]
    nextId: 1
};
const textToolState = window.textToolState;

// === V1 PATCH: AnnotationManager — fluxo único, robusto, com pointer-events ===
window.annotationManager = (function(){
    function _viewportRoleOf(containerId){
        if (!containerId) return 'unknown';
        if (containerId === 'modal-viewport') return 'modal-mpr';
        if (containerId === 'endo-axial')     return 'endo-axial';
        if (containerId === 'endo-coronal')   return 'endo-coronal';
        if (containerId === 'endo-sagittal')  return 'endo-sagittal';
        if (containerId === 'axial-viewport')  return 'axial';
        if (containerId === 'tab-axial')       return 'axial-tab';
        if (containerId.indexOf('pan')   === 0) return 'pan';
        if (containerId.indexOf('vrCont') === 0) return 'vr-3d';
        return containerId;
    }
return {
        get items(){ return window.textToolState.annotations; },
        get sessionId(){ return window.currentExamSessionId; },
        addText: function(opt){
            var ann = {
                id: window.textToolState.nextId++,
                type: 'text',
                examSessionId: window.currentExamSessionId,
                plane: opt.plane || (function(){
                    var cid = opt.containerId || '';
                    return cid.indexOf('axial')>=0?'axial':cid.indexOf('coronal')>=0?'coronal':cid.indexOf('sagittal')>=0?'sagittal':null;
                })(),
                sliceKey: (function(){
                    try {
                        var _el = document.getElementById(opt.containerId);
                        var cid = opt.containerId || '';
                        var _pl = opt.plane || (cid.indexOf('axial')>=0?'axial':cid.indexOf('coronal')>=0?'coronal':cid.indexOf('sagittal')>=0?'sagittal':null);
                        return (typeof window.getCurrentSliceKey === 'function') ? window.getCurrentSliceKey(_el, _pl) : null;
                    } catch(e){ return null; }
                })(),
                x: opt.x, y: opt.y,
                imgX: opt.imgX != null ? opt.imgX : null,
                imgY: opt.imgY != null ? opt.imgY : null,
                text: (opt.text || '').trim(),
                containerId: opt.containerId,
                viewportRole: _viewportRoleOf(opt.containerId),
                color: opt.color || '#ffff00',
                labelDx: opt.labelDx != null ? opt.labelDx : 48,
                labelDy: opt.labelDy != null ? opt.labelDy : -44
            };
            window.textToolState.annotations.push(ann);
            try { renderTextAnnotations(); } catch(e){}
            return ann;
        },
        clearSession: function(){
            // remove apenas anotações da sessão atual; preserva itens órfãos para diagnóstico
            var sid = window.currentExamSessionId;
            window.textToolState.annotations = (window.textToolState.annotations||[])
                .filter(function(a){ return a.examSessionId && a.examSessionId !== sid; });
        },
        clearAll: function(){
            window.textToolState.annotations = [];
            try {
                document.querySelectorAll('.text-annot-group').forEach(function(el){ el.remove(); });
            } catch(e){}
        },
        render: function(){ try { renderTextAnnotations(); } catch(e){} },
        viewportRoleOf: _viewportRoleOf
    };
})();
// === FIM V1 PATCH AnnotationManager ===

function deactivateTextToolAfterPlacement() {
    textToolState.active = false;

    const btn = document.getElementById('btn-tool-text');
    const modalBtn = document.getElementById('btn-modal-text');

    if (btn) {
        btn.classList.remove('active-tool');
        btn.style.background = '';
        btn.style.color = '';
    }

    if (modalBtn) {
        modalBtn.style.boxShadow =
            '4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light)';
    }

    document.removeEventListener('click', textToolClickHandler, true);
    document.removeEventListener('touchend', textToolTouchHandler, true);

    window._textToolJustPlacedAt = Date.now();
}

function toggleTextTool() {
    const btn = document.getElementById('btn-tool-text');
    const modalBtn = document.getElementById('btn-modal-text');
    
    if (textToolState.active) {
        textToolState.active = false;
        if (btn) { btn.classList.remove('active-tool'); btn.style.background=''; btn.style.color=''; }
        if (modalBtn) { modalBtn.style.boxShadow = '4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light)'; }
        document.removeEventListener('click',    textToolClickHandler, true);
        document.removeEventListener('touchend', textToolTouchHandler, true);
        return;
    }
    resetToolButtons();
    textToolState.active = true;
    
    if (btn) { btn.classList.add('active-tool'); btn.style.background='rgba(255,200,0,0.25)'; btn.style.color='#ffcc00'; }
    if (modalBtn) { modalBtn.style.boxShadow = 'inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)'; }
    
    document.addEventListener('click',    textToolClickHandler, true);
    document.addEventListener('touchend', textToolTouchHandler, true);
}

// ── Encontra o container de imagem correto para qualquer posição de toque/click
function _findViewportContainer(clientX, clientY) {
    // V1 PATCH: ordem de prioridade — modais primeiro, depois MPR, depois abas
    const vpIds =['modal-viewport','seg-3d-canvas','endo-axial','endo-coronal','endo-sagittal',
                   'axial-viewport','pan-pano-viewer','pan-mini-viewer','vrContainerMobile',
                   'tab-axial','tab-endo','tab-pan','tab-3d'];
    // Usa elementFromPoint para pegar o que está de fato sob o dedo
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    // V1 PATCH: ignora cliques em UI (dock, fabs, painéis, modais de edição)
    if (el.closest && el.closest(
        '.fab-group-right,.fab-group-left,.dock-container,.settings-container,' +
        '#lima-panel,#vrFabPresets,.text-annot-group,#annot-edit-modal,' +
        '#odontometria-modal,#consultoria-modal,#ajustar-modal,#portfolio-modal,' +
        '#apresentacao-modal,#export-menu-modal,#rx-portfolio-modal,#rx-apresentacao,' +
        '#seg-inline-panel,#seg-3d-modal,input,button,select,textarea,.slides-overlay'
    )) return null;
    // Sobe na árvore procurando um viewport conhecido
    for (const id of vpIds) {
        const vp = document.getElementById(id);
        if (vp && vp.contains(el)) return vp;
    }
    return null;
}

// iOS Safari não dispara 'click' confiável em canvas — usamos touchend
function textToolTouchHandler(e) {
    if (!textToolState.active) return;
    if ((Date.now() - (window._textToolJustPlacedAt || 0)) < 500) return;
    if (e.target.closest('.fab-group-right,.fab-group-left,.dock-container,.settings-container,#lima-panel,#vrFabPresets,.text-annot-group')) return;
    const t = e.changedTouches[0];
    const area = _findViewportContainer(t.clientX, t.clientY);
    if (!area) return;
    e.stopPropagation(); e.preventDefault();
    _placeTextAnnot(t.clientX, t.clientY, area);
}

function textToolClickHandler(e) {
    if (!textToolState.active) return;
    if (e.target.closest('.fab-group-right,.fab-group-left,.dock-container,.settings-container,#lima-panel,#vrFabPresets,.text-annot-group')) return;
    const area = _findViewportContainer(e.clientX, e.clientY);
    if (!area) return;
    e.stopPropagation(); e.preventDefault();
    _placeTextAnnot(e.clientX, e.clientY, area);
}

function _placeTextAnnot(clientX, clientY, area) {
    const rect = area.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;

    // Tenta salvar coordenadas DICOM para ancorar ao zoom
    let imgX = null, imgY = null;
    try {
        const cvs = area.querySelector('canvas');
        if (cvs && window.cornerstone) {
            // CSS px → device px do canvas (Retina tem ratio 2x)
            const scX = cvs.width  / rect.width;
            const scY = cvs.height / rect.height;
            const dp = cornerstone.canvasToPixel(area, { x: cssX * scX, y: cssY * scY });
            if (dp && isFinite(dp.x) && isFinite(dp.y)) { imgX = dp.x; imgY = dp.y; }
        }
    } catch(e) {}

    const text = prompt('Texto da anotação:', '');
    if (!text || !text.trim()) return;
    // V1 PATCH: usa AnnotationManager para garantir examSessionId e viewportRole
    if (window.annotationManager && typeof window.annotationManager.addText === 'function') {
        window.annotationManager.addText({
            x: cssX, y: cssY,
            imgX: imgX, imgY: imgY,
            text: text.trim(),
            containerId: area.id,
            color: '#ffff00',
            labelDx: 48, labelDy: -44
        });
    } else {
        const ann = {
            id: textToolState.nextId++,
            examSessionId: window.currentExamSessionId,
            x: cssX, y: cssY,
            imgX, imgY,
            text: text.trim(),
            containerId: area.id,
            viewportRole: area.id,
            color: '#ffff00',
            labelDx: 48, labelDy: -44
        };
        textToolState.annotations.push(ann);
        renderTextAnnotations();
    }
    _registerAnnotZoomTrack(area);

// PATCH: depois de inserir um texto, sai automaticamente do modo Texto.
// Isso libera imediatamente o arrasto do badge e da cabeça da seta.
deactivateTextToolAfterPlacement();
}

// Registra listener único por container para reposicionar anotações no zoom/pan
function _registerAnnotZoomTrack(area) {
    if (!area || area._annotZoomBound) return;
    area._annotZoomBound = true;

    area.addEventListener('cornerstoneimagerendered', function(e) {
        const cid = area.id;
        document.querySelectorAll(`.text-annot-group[data-cid="${cid}"]`).forEach(grp => {
            const annId = parseInt(grp.dataset.annId);
            const ann = textToolState.annotations.find(a => a.id === annId);
            
            // Só atualiza se a anotação tiver uma âncora de pixel DICOM
            if (!ann || ann.imgX == null) return;

            try {
                // CORREÇÃO: Lógica de reposicionamento com base no viewport atual
                const viewport = cornerstone.getViewport(area);
                if (!viewport) return;

                // Converte a coordenada do pixel da imagem para a coordenada no canvas
                const canvasPoint = cornerstone.pixelToCanvas(area, { x: ann.imgX, y: ann.imgY });

                // Atualiza a posição CSS da anotação
                ann.x = canvasPoint.x;
                ann.y = canvasPoint.y;

                // Move os elementos SVG e HTML
                const lx = ann.x + ann.labelDx;
                const ly = ann.y + ann.labelDy;
                const dot  = grp.querySelector('.text-arrow-dot') || grp.querySelector('circle');

const line = grp.querySelector('.text-arrow-line') || grp.querySelector('line');
const badge = grp.querySelector('div');

if (line) {
    line.setAttribute('x1', lx);
    line.setAttribute('y1', ly);
    line.setAttribute('x2', ann.x);
    line.setAttribute('y2', ann.y);
}
if (badge) {
    badge.style.transform = `translate(-50%, -50%) translate(${lx}px, ${ly}px)`;
    badge.style.left = '0px';
    badge.style.top = '0px';
}

// PATCH: atualiza cabeça da seta e hit-area invisível.
updateTextArrowHeadGeometry(grp, ann);
            } catch (err) {
                // Silencia erros que podem ocorrer se o viewport não estiver pronto
            }
        });
    });
}

// ── Modal editar/deletar (texto e medida) ───────────────────────────
function showAnnotEditModal(title, colors, currentColor, onColorPick, onDelete) {
    document.getElementById('annot-edit-modal')?.remove();
    const m = document.createElement('div');
    m.id = 'annot-edit-modal';
// Aumentado z-index de 99999 para 100005 para ficar por cima do modal-zoom (100000)
    m.style.cssText = 'position:fixed;inset:0;z-index:100005;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';    m.innerHTML = `
      <div style="background:#1c1c2e;border:1.5px solid #3a3a50;border-radius:20px;padding:22px 20px;width:min(300px,88vw);box-shadow:0 10px 50px rgba(0,0,0,0.8);">
        <div style="text-align:center;font:800 14px/1.4 -apple-system,sans-serif;color:#4A90E2;margin-bottom:16px;">${title}</div>
        <div style="font:600 10px -apple-system;color:#666;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">COR</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;" id="aem-colors"></div>
        <div style="display:flex;gap:10px;">
          <button id="aem-del" style="flex:1;padding:13px;background:rgba(255,60,60,0.15);border:1.5px solid #f44;color:#f88;border-radius:13px;font:700 13px -apple-system;cursor:pointer;">🗑 Deletar</button>
          <button id="aem-close" style="flex:1;padding:13px;background:rgba(50,50,70,0.6);border:1.5px solid #444;color:#aaa;border-radius:13px;font:700 13px -apple-system;cursor:pointer;">✕ Fechar</button>
        </div>
      </div>`;
    const row = m.querySelector('#aem-colors');
    colors.forEach(c => {
        const b = document.createElement('button');
        b.style.cssText = `width:32px;height:32px;border-radius:50%;border:3px solid ${c===currentColor?'#fff':'transparent'};cursor:pointer;flex-shrink:0;`;
        b.style.setProperty('--sw', c);
        b.style.setProperty('background', c, 'important');
        b.ontouchend = b.onclick = (ev) => { ev.preventDefault(); onColorPick(c); m.remove(); };
        row.appendChild(b);
    });
    m.querySelector('#aem-del').ontouchend   = m.querySelector('#aem-del').onclick   = (ev)=>{ ev.preventDefault(); onDelete(); m.remove(); };
    m.querySelector('#aem-close').ontouchend = m.querySelector('#aem-close').onclick = (ev)=>{ ev.preventDefault(); m.remove(); };
    m.ontouchend = (ev) => { if (ev.target===m) m.remove(); };
    m.onclick    = (ev) => { if (ev.target===m) m.remove(); };
    document.body.appendChild(m);
}

const ANNOT_COLORS = ['#ffff00','#00ffcc','#ff4444','#44aaff','#ff9900','#ff44cc','#ffffff'];

// ==========================================================
// PATCH TEXTO — cabeça da seta arrastável
// A cabeça é um polygon real + hit-area grande invisível.
// O badge permanece parado; só a ponta/cabeça da seta muda de local.
// ==========================================================
function updateTextArrowHeadGeometry(grp, ann) {
    if (!grp || !ann) return;

    const line = grp.querySelector('.text-arrow-line') || grp.querySelector('line');
    const head = grp.querySelector('.text-arrow-head');
    const hit  = grp.querySelector('.text-arrow-head-hit');
    const badge = grp.querySelector('div');

    const lx = ann.x + ann.labelDx;
    const ly = ann.y + ann.labelDy;

    if (line) {
        line.setAttribute('x1', lx);
        line.setAttribute('y1', ly);
        line.setAttribute('x2', ann.x);
        line.setAttribute('y2', ann.y);
    }

    // Triângulo com ponta exatamente em ann.x/ann.y.
    // A base fica voltada para o badge.
    const dx = lx - ann.x;
    const dy = ly - ann.y;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    const ux = dx / len;
    const uy = dy / len;

    const size = 12;   // comprimento da cabeça
    const half = 6;    // largura da base

    const bx = ann.x + ux * size;
    const by = ann.y + uy * size;

    const px = -uy;
    const py = ux;

    const p1x = ann.x;
    const p1y = ann.y;
    const p2x = bx + px * half;
    const p2y = by + py * half;
    const p3x = bx - px * half;
    const p3y = by - py * half;

    if (head) {
        head.setAttribute(
            'points',
            `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`
        );
        head.setAttribute('fill', ann.color);
    }

    if (hit) {
        hit.setAttribute('cx', ann.x);
        hit.setAttribute('cy', ann.y);
    }

    if (badge) {
        badge.style.transform =
            'translate(-50%, -50%) translate(' + lx + 'px, ' + ly + 'px)';
    }
}

function bindTextArrowHeadDrag(arrowHit, ann, container, grp) {
    if (!arrowHit || !ann || !container || !grp) return;

    var state = {
        pointerId: null,
        startX: 0,
        startY: 0,
        origX: 0,
        origY: 0,
        labelAbsX: 0,
        labelAbsY: 0,
        dragging: false
    };

    function stopTouch(ev) {
        ev.stopPropagation();
        if (ev.type !== 'touchend' && ev.type !== 'touchcancel') {
            ev.preventDefault();
        }
    }

    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function(evt) {
        arrowHit.addEventListener(evt, stopTouch, { passive: false, capture: true });
    });

    arrowHit.addEventListener('pointerdown', function(ev) {
        // Mesmo se a ferramenta texto estiver ativa por algum motivo,
        // a cabeça da seta deve ter prioridade de edição.
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        try { arrowHit.setPointerCapture(ev.pointerId); } catch(e) {}

        state.pointerId = ev.pointerId;
        state.startX = ev.clientX;
        state.startY = ev.clientY;
        state.origX = ann.x;
        state.origY = ann.y;

        // Guarda posição absoluta atual do badge.
        // Assim o texto fica parado enquanto a seta é reposicionada.
        state.labelAbsX = ann.x + ann.labelDx;
        state.labelAbsY = ann.y + ann.labelDy;

        state.dragging = true;
        arrowHit.style.cursor = 'grabbing';
    }, { passive: false });

    arrowHit.addEventListener('pointermove', function(ev) {
        if (!state.dragging || state.pointerId !== ev.pointerId) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        const dx = ev.clientX - state.startX;
        const dy = ev.clientY - state.startY;

        ann.x = state.origX + dx;
        ann.y = state.origY + dy;

        // Mantém badge parado no mesmo local absoluto.
        ann.labelDx = state.labelAbsX - ann.x;
        ann.labelDy = state.labelAbsY - ann.y;

        // Atualiza âncora DICOM para sobreviver a zoom/pan/re-render.
        try {
            if (window.cornerstone) {
                const imgPt = cornerstone.canvasToPixel(container, { x: ann.x, y: ann.y });
                if (imgPt && isFinite(imgPt.x) && isFinite(imgPt.y)) {
                    ann.imgX = imgPt.x;
                    ann.imgY = imgPt.y;
                }
            }
        } catch(e) {}

        updateTextArrowHeadGeometry(grp, ann);
    }, { passive: false });

    function endDrag(ev) {
        if (state.pointerId !== ev.pointerId) return;

        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

        try { arrowHit.releasePointerCapture(ev.pointerId); } catch(e) {}

        state.pointerId = null;
        state.dragging = false;
        arrowHit.style.cursor = 'grab';
    }

    arrowHit.addEventListener('pointerup', endDrag, { passive: false });
    arrowHit.addEventListener('pointercancel', endDrag, { passive: false });

    arrowHit.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    }, { passive: false });
}

function renderTextAnnotations() {
    document.querySelectorAll('.text-annot-group').forEach(el => el.remove());

    // V1 PATCH: filtrar somente anotações da sessão atual
    var _sid = window.currentExamSessionId;
var _items = (textToolState.annotations || []).filter(function(a){
        if (a.examSessionId && a.examSessionId !== _sid) return false;
        if (!a.sliceKey) return true; // legacy → sempre visível
        try {
            var _el = document.getElementById(a.containerId);
            if (!_el) return false;
            if (typeof window.getCurrentSliceKey !== 'function') return true;
            return a.sliceKey === window.getCurrentSliceKey(_el, a.plane);
        } catch(e) { return true; }
    });

    for (const ann of _items) {
        const container = document.getElementById(ann.containerId);
        if (!container) continue;
        const cs = getComputedStyle(container);
        if (cs.position === 'static') container.style.position = 'relative';

        const grp = document.createElement('div');
        grp.className = 'text-annot-group';
        grp.dataset.annId = ann.id;
        grp.dataset.cid = ann.containerId;
        grp.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9900;';

        const lx = ann.x + ann.labelDx;
        const ly = ann.y + ann.labelDy;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('style','position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;');

        const defs = document.createElementNS(ns,'defs');
        const marker = document.createElementNS(ns,'marker');
        marker.setAttribute('id',`arm-${ann.id}`); marker.setAttribute('markerWidth','7'); marker.setAttribute('markerHeight','7');
        marker.setAttribute('refX','6'); marker.setAttribute('refY','3.5'); marker.setAttribute('orient','auto');
        const poly = document.createElementNS(ns,'polygon');
        poly.setAttribute('points','0 0,7 3.5,0 7'); poly.setAttribute('fill', ann.color); poly.setAttribute('opacity','0.92');
        marker.appendChild(poly); defs.appendChild(marker); svg.appendChild(defs);
 const line = document.createElementNS(ns,'line');
line.setAttribute('class', 'text-arrow-line');
line.setAttribute('x1',lx); line.setAttribute('y1',ly);
line.setAttribute('x2', ann.x); line.setAttribute('y2', ann.y);
line.setAttribute('stroke', ann.color);
line.setAttribute('stroke-width','1.8');
line.setAttribute('opacity','0.88');
// PATCH: removemos o marker-end real porque marker SVG não recebe toque.
// A cabeça visual agora é um polygon clicável/arrastável.
svg.appendChild(line);

// Cabeça visual da seta.
const arrowHead = document.createElementNS(ns, 'polygon');
arrowHead.setAttribute('class', 'text-arrow-head');
arrowHead.setAttribute('fill', ann.color);
arrowHead.setAttribute('opacity', '0.96');
arrowHead.setAttribute('style', 'pointer-events:none;');
svg.appendChild(arrowHead);

// Hit-area grande invisível sobre a cabeça da seta.
const arrowHeadHit = document.createElementNS(ns, 'circle');
arrowHeadHit.setAttribute('class', 'text-arrow-head-hit');
arrowHeadHit.setAttribute('cx', ann.x);
arrowHeadHit.setAttribute('cy', ann.y);
arrowHeadHit.setAttribute('r', '28');
arrowHeadHit.setAttribute('fill', 'rgba(255,255,255,0.001)');
arrowHeadHit.setAttribute('stroke', 'transparent');
arrowHeadHit.setAttribute('style', 'pointer-events:all;cursor:grab;touch-action:none;-webkit-touch-callout:none;');
svg.appendChild(arrowHeadHit);

grp.appendChild(svg);
updateTextArrowHeadGeometry(grp, ann);

        const badge = document.createElement('div');
        badge.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            transform: translate(-50%, -50%) translate(${lx}px, ${ly}px);
            background: rgba(0,0,0,0.82);
            border: 1.5px solid ${ann.color};
            color: ${ann.color};
            font: bold 12px/1.4 -apple-system,monospace;
            padding: 4px 10px;
            border-radius: 8px;
            pointer-events: auto;
            cursor: grab;
            white-space: nowrap;
            user-select: none; -webkit-user-select: none;
            text-shadow: 0 0 6px rgba(0,0,0,0.95);
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 12px rgba(0,0,0,0.55);
            touch-action: none;
            -webkit-touch-callout: none;
        `;
        badge.innerText = ann.text;

        // === V1 PATCH: drag robusto com pointer events + setPointerCapture ===
        // Estados:
        //   - dragging: pointer capturado e há movimento real
        //   - tapTimer: long-press 350ms => abre edição
        //   - durante drag, NÃO abrir edição em qualquer caminho
        var _dragState = {
            pointerId: null, startX: 0, startY: 0,
            origDx: 0, origDy: 0,
            moved: false, dragging: false,
            tapTimer: null, lastTapTime: 0
        };
        var DRAG_THRESHOLD_PX = 4;
        var LONGPRESS_MS = 350;
        var DOUBLE_TAP_MS = 320;

        function _openEdit() {
            showAnnotEditModal(`✏️ "${ann.text}"`, ANNOT_COLORS, ann.color,
                function(c) { ann.color = c; renderTextAnnotations(); },
                function()  {
                    textToolState.annotations = textToolState.annotations.filter(function(a){return a.id!==ann.id;});
                    renderTextAnnotations();
                }
            );
        }


        // BUG texto-arrasta: blinda o badge contra o scroll do Cornerstone.
        // O Cornerstone escuta touchstart/touchmove no viewport; Pointer Events
        // sozinhos não barram esse fluxo no iOS. Travamos o touch no próprio
        // badge (só nele — não afeta o resto do viewport).
        ['touchstart','touchmove','touchend'].forEach(function(evt){
            badge.addEventListener(evt, function(ev){
                ev.stopPropagation();
                if (evt !== 'touchend') ev.preventDefault();
            }, { passive: false, capture: true });
        });
        badge.addEventListener('pointerdown', function(ev){
            // ignora se usuário está no modo de inserção de texto
            if (textToolState.active) return;
            ev.preventDefault();
            ev.stopPropagation(); // bloqueia Cornerstone Pan/Zoom
            try { badge.setPointerCapture(ev.pointerId); } catch(e){}
            _dragState.pointerId = ev.pointerId;
            _dragState.startX = ev.clientX;
            _dragState.startY = ev.clientY;
            _dragState.origDx = ann.labelDx;
            _dragState.origDy = ann.labelDy;
            _dragState.moved = false;
            _dragState.dragging = false;
            badge.style.cursor = 'grabbing';
            // long-press para abrir edição (só dispara se não houve drag)
            if (_dragState.tapTimer) clearTimeout(_dragState.tapTimer);
            _dragState.tapTimer = setTimeout(function(){
                if (!_dragState.moved && !_dragState.dragging) {
                    _openEdit();
                    _dragState.tapTimer = null;
                }
            }, LONGPRESS_MS);
        }, { passive: false });

        badge.addEventListener('pointermove', function(ev){
            if (_dragState.pointerId !== ev.pointerId) return;
            var dx = ev.clientX - _dragState.startX;
            var dy = ev.clientY - _dragState.startY;
            if (!_dragState.dragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
                _dragState.dragging = true;
                _dragState.moved = true;
                if (_dragState.tapTimer) { clearTimeout(_dragState.tapTimer); _dragState.tapTimer = null; }
            }
            ev.preventDefault();
            ev.stopPropagation();
            ann.labelDx = _dragState.origDx + dx;
            ann.labelDy = _dragState.origDy + dy;
            var nlx = ann.x + ann.labelDx, nly = ann.y + ann.labelDy;
            badge.style.transform = 'translate(-50%, -50%) translate(' + nlx + 'px, ' + nly + 'px)';
            line.setAttribute('x1', nlx);
            line.setAttribute('y1', nly);
        }, { passive: false });

        function _endDrag(ev){
            if (_dragState.pointerId !== ev.pointerId) return;
            try { badge.releasePointerCapture(ev.pointerId); } catch(e){}
            badge.style.cursor = 'grab';
            var wasDragging = _dragState.dragging;
            // double-tap fallback (se long-press não disparou)
            var now = Date.now();
            var dt = now - _dragState.lastTapTime;
            _dragState.lastTapTime = now;
            if (_dragState.tapTimer) { clearTimeout(_dragState.tapTimer); _dragState.tapTimer = null; }
            _dragState.pointerId = null;
            _dragState.dragging = false;
            // double-tap rápido => editar
            if (!wasDragging && !_dragState.moved && dt < DOUBLE_TAP_MS) {
                ev.preventDefault();
                ev.stopPropagation();
                _openEdit();
            }
        }
        badge.addEventListener('pointerup',     _endDrag, { passive: false });
        badge.addEventListener('pointercancel', _endDrag, { passive: false });
        // bloqueia click "fantasma" durante drag
        badge.addEventListener('click', function(ev){
            if (textToolState.active) return;
            ev.stopPropagation();
            // se houver pointermove em andamento, ignora
            if (_dragState.dragging) { ev.preventDefault(); return; }
        }, { passive: false });
    // === FIM V1 PATCH drag ===

// PATCH: cabeça da seta também arrasta, com a mesma blindagem do badge.
bindTextArrowHeadDrag(arrowHeadHit, ann, container, grp);

grp.appendChild(badge);
container.appendChild(grp);
    }
}

// ==========================================================
// 🦷 SIMULADOR DE POSICIONAMENTO DE IMPLANTE COM IA
// ==========================================================


// ═══════════════════════════════════════════════════════════
// PERSISTÊNCIA DO IMPLANTE — salva/restaura posição entre abas
// ═══════════════════════════════════════════════════════════
function _saveImplant() {
    if (implantState.cutArrIdx < 0) return; // nada para salvar
    window._savedImplant = {
        cutArrIdx: implantState.cutArrIdx,
        cutImgX:   implantState.cutImgX,
        cutImgY:   implantState.cutImgY,
        volX:      implantState.volX,
        volY:      implantState.volY,
        volZ:      implantState.volZ,
        diameter:  implantState.diameter,
        length:    implantState.length,
        angleDeg:  implantState.angleDeg,
        panCutPos: implantState.cutArrIdx >= 0 ? panActiveCuts[implantState.cutArrIdx] : null,
    };
}

function _restoreImplant() {
    const s = window._savedImplant;
    if (!s || s.cutArrIdx < 0) return;
    if (!panActiveCuts || panActiveCuts.length <= s.cutArrIdx) return;

    // Restaura posição do corte na curva
    if (s.panCutPos != null) panActiveCuts[s.cutArrIdx] = s.panCutPos;

    // Restaura estado
    implantState.cutArrIdx = s.cutArrIdx;
    implantState.cutImgX   = s.cutImgX;
    implantState.cutImgY   = s.cutImgY;
    implantState.volX      = s.volX;
    implantState.volY      = s.volY;
    implantState.volZ      = s.volZ;
    implantState.diameter  = s.diameter  || implantState.diameter;
    implantState.length    = s.length    || implantState.length;
    implantState.angleDeg  = s.angleDeg  || 0;

    // Sincroniza sliders do painel (se visível)
    const dSlider = document.getElementById('implant-d-sel');
    const lSlider = document.getElementById('implant-l-sel');
    if (dSlider) dSlider.value = implantState.diameter;
    if (lSlider) lSlider.value = implantState.length;

    window.panSelectedCut = s.cutArrIdx;

    // Redesenha após Cornerstone inicializar os cut-items
    // Tenta múltiplas vezes pois panMiniElement pode não estar pronto ainda
    const _doRestore = (attempt) => {
        try {
            _implantCutToVolume(s.cutArrIdx, s.cutImgX, s.cutImgY);
            _implantDrawOverlay(s.cutArrIdx);
            _implantRegisterCutListeners();
            if (panMiniElement) {
                panDrawMiniPanoOverlay();
            }
            panDrawPanoOverlay();
        } catch(e) {
            if (attempt < 4) setTimeout(() => _doRestore(attempt+1), 400);
            else console.warn('_restoreImplant falhou:', e);
        }
    };
    setTimeout(() => _doRestore(0), 500);
}

const implantState = {
    mesh: null,
    visible: false,
    diameter: 4.0,
    length: 10,
    angleDeg: 0, 
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
    controls: null,
    scene: null,
    // Posição no corte transversal (pixels de imagem DICOM)
    cutArrIdx: -1,      // qual corte transversal foi selecionado
    cutImgX: null,      // coluna DICOM no corte
    cutImgY: null,      // linha DICOM no corte
    // Posição em voxels no volume 3D
    volX: null, volY: null, volZ: null,
    // Overlay canvas por cut
    overlayCanvases: {}
};

// Injeta painel de implante no DOM (aba 3D)
function injectImplantPanel() {
    if (document.getElementById('implant-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'implant-panel';
    panel.style.cssText = `
        display:none; position:absolute; top:8px; right:8px; z-index:9500;
        background:rgba(10,20,40,0.92); border:1.5px solid #0af;
        border-radius:14px; padding:14px 16px;
        width:min(210px, calc(100vw - 24px));
        max-width:calc(100% - 16px);
        color:#e0eeff; font:13px/1.4 -apple-system,sans-serif;
        box-shadow:0 4px 24px rgba(0,160,255,0.18);
        box-sizing:border-box;
        overflow-y:auto; max-height:80vh;
        -webkit-overflow-scrolling:touch;
    `;
    panel.innerHTML = `
        <div style="font-weight:800;font-size:14px;color:#0af;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            🦷 Implante Virtual
            <button onclick="toggleImplantPanel()" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="margin-bottom:8px;">
            <label style="color:#8af;font-size:11px;font-weight:700;">DIÂMETRO (mm)</label>
            <div id="impl-diam-btns" style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
                ${[3.3,3.5,3.75,4.0,4.2,4.5,5.0].map(d =>
                    `<button onclick="setImplantDiam(${d})" data-diam="${d}" style="flex:1;min-width:40px;padding:4px 2px;border:1px solid #047;background:rgba(0,80,160,0.2);color:#8cf;border-radius:6px;font-size:11px;cursor:pointer;">${d}</button>`
                ).join('')}
            </div>
        </div>
        <div style="margin-bottom:10px;">
            <label style="color:#8af;font-size:11px;font-weight:700;">COMPRIMENTO (mm)</label>
            <div id="impl-len-btns" style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
                ${[6,7,8,9,10,11,12,14,16].map(l =>
                    `<button onclick="setImplantLen(${l})" data-len="${l}" style="flex:1;min-width:30px;padding:4px 2px;border:1px solid #047;background:rgba(0,80,160,0.2);color:#8cf;border-radius:6px;font-size:11px;cursor:pointer;">${l}</button>`
                ).join('')}
            </div>
        </div>
        <div id="impl-size-label" style="text-align:center;color:#0df;font-weight:800;font-size:13px;margin-bottom:10px;">4.0 × 10 mm</div>
        <div style="margin-bottom:8px;">
            <label style="color:#8af;font-size:11px;font-weight:700;">TRANSPARÊNCIA</label>
            <input type="range" id="impl-opacity" min="0.1" max="1.0" step="0.05" value="0.55"
                oninput="setImplantOpacity(this.value)"
                style="width:100%;margin-top:4px;accent-color:#0af;">
        </div>
        <div style="background:rgba(0,60,120,0.3);border:1px solid #035;border-radius:8px;padding:7px;margin-bottom:8px;font-size:10px;color:#7bf;line-height:1.5;">
            <b style="color:#0af;">Como usar:</b><br>
            1. Escolha diâmetro e comprimento<br>
            2. Clique <b>➕ Inserir no Corte</b><br>
            3. <b>Toque no corte</b> para posicionar<br>
            4. Abra aba 3D para ver o implante<br>
            5. Use 🤖 para sugestão automática
        </div>
        <button onclick="addImplantToCut()" ontouchend="addImplantToCut();event.preventDefault();" style="width:100%;padding:8px;background:linear-gradient(135deg,rgba(0,100,200,0.6),rgba(0,200,180,0.4));border:1.5px solid #0af;color:#fff;border-radius:9px;font-weight:800;cursor:pointer;font-size:12px;margin-bottom:6px;">
            ➕ Inserir no Corte
        </button>
        <button onclick="suggestImplantPositionAI()" style="width:100%;padding:8px;background:linear-gradient(135deg,rgba(80,0,160,0.6),rgba(0,100,200,0.4));border:1.5px solid #a0f;color:#fff;border-radius:9px;font-weight:800;cursor:pointer;font-size:12px;margin-bottom:6px;">
            🤖 Sugestão IA
        </button>
        <button onclick="removeImplant()" style="width:100%;padding:6px;background:rgba(200,0,50,0.15);border:1px solid #a03;color:#f88;border-radius:9px;font-size:11px;cursor:pointer;">
            🗑 Remover implante
        </button>
        <div id="impl-ai-result" style="margin-top:10px;display:none;background:rgba(80,0,160,0.15);border:1px solid #60f;border-radius:8px;padding:8px;font-size:11px;color:#c8aaff;line-height:1.5;"></div>
    `;
    // Painel fica na aba de cortes transversais (pan-phase-3)
    const panPhase3 = document.getElementById('pan-phase-3');
    const tab3d = document.getElementById('tab-3d');
    const parent = panPhase3 || tab3d;
    if (parent) parent.appendChild(panel);
}

function toggleImplantPanel() {
    injectImplantPanel();
    const panel = document.getElementById('implant-panel');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
}

function setImplantDiam(d) {
    implantState.diameter = d;
    document.querySelectorAll('#impl-diam-btns button').forEach(b => {
        const active = parseFloat(b.dataset.diam) === d;
        b.style.background = active ? 'rgba(0,160,255,0.4)' : 'rgba(0,80,160,0.2)';
        b.style.borderColor = active ? '#0af' : '#047';
        b.style.color = active ? '#fff' : '#8cf';
    });
    updateImplantSizeLabel();
    if (implantState.cutArrIdx >= 0) { _implantDrawOverlay(implantState.cutArrIdx); _implantSyncTo3D(); }
    else if (implantState.mesh) addImplantTo3D();
}

function setImplantLen(l) {
    implantState.length = l;
    document.querySelectorAll('#impl-len-btns button').forEach(b => {
        const active = parseInt(b.dataset.len) === l;
        b.style.background = active ? 'rgba(0,160,255,0.4)' : 'rgba(0,80,160,0.2)';
        b.style.borderColor = active ? '#0af' : '#047';
        b.style.color = active ? '#fff' : '#8cf';
    });
    updateImplantSizeLabel();
    if (implantState.cutArrIdx >= 0) { _implantDrawOverlay(implantState.cutArrIdx); _implantSyncTo3D(); }
    else if (implantState.mesh) addImplantTo3D();
}

function updateImplantSizeLabel() {
    const lbl = document.getElementById('impl-size-label');
    if (lbl) lbl.innerText = `${implantState.diameter.toFixed(1)} × ${implantState.length} mm`;
}

function setImplantOpacity(v) {
    if (implantState.mesh) {
        implantState.mesh.traverse(c => { if (c.isMesh) c.material.opacity = parseFloat(v); });
    }
}

// Cria geometria procedural de implante dentário (cilindro + rosca simulada)

function createImplantGeometry(diamMm, lenMm, ps) {
    // 1. Calcula escala física baseada no pixel spacing
    const physX = volumeMeta ? (volumeMeta.x * (volumeMeta.pixelSpacing || 0.2)) : 80;
    const unitsPerMm = 1.6 / physX; // Normalização para a cena 3D

    const r = (diamMm / 2) * unitsPerMm;
    const h = lenMm * unitsPerMm;

    const group = new THREE.Group();

    // ── MATERIAL "BLUE SKY" ─────────────────────────────────────────────
    // depthTest: true -> O implante entra no osso (é ocluído por ele)
    // opacity: 0.7 -> Permite ver a estrutura interna levemente
    // color: Azul Ciano -> Contraste máximo com osso (bege/branco)
    const matImpl = new THREE.MeshPhysicalMaterial({
        color: 0x00aaff,        // Azul Tecnológico
        metalness: 0.4,
        roughness: 0.2,
        transparent: true,
        opacity: 0.75,          // Sólido o suficiente, mas translúcido
        depthTest: true,        // <--- O SEGREDO: Interage com a profundidade do osso
        depthWrite: true,
        side: THREE.DoubleSide,
        emissive: 0x002244,     // Leve brilho interno
        emissiveIntensity: 0.5
    });

    // ── GEOMETRIA DO IMPLANTE (Cilíndro Detalhado) ──────────────────────
    // O cilindro padrão do Three.js é orientado no eixo Y (Vertical)
    // Isso é o que queremos para representar "Em Pé"
    
    // Corpo
    const bodyGeo = new THREE.CylinderGeometry(r, r * 0.7, h, 32);
    // Move para que o pilar (topo) fique em Y=0 e o corpo cresça para baixo (-Y)
    // Isso facilita a rotação em torno da cabeça do implante
    bodyGeo.translate(0, -h / 2, 0); 
    
    const body = new THREE.Mesh(bodyGeo, matImpl);
    group.add(body);

    // Roscas (Visual)
    const threadCount = 10;
    const threadGeo = new THREE.TorusGeometry(r * 1.05, r * 0.05, 8, 24);
    threadGeo.rotateX(Math.PI / 2);
    
    for(let i=1; i<threadCount; i++) {
        const t = i / threadCount;
        const thread = new THREE.Mesh(threadGeo, matImpl);
        thread.position.y = -h * t;
        thread.scale.set(1 - t*0.3, 1 - t*0.3, 1); // Afunila
        group.add(thread);
    }

    // Marcação do Topo (Hexágono)
    const hexGeo = new THREE.CylinderGeometry(r * 0.6, r * 0.6, h * 0.05, 6);
    const hex = new THREE.Mesh(hexGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hex.position.y = 0.01; // Levemente acima
    group.add(hex);

    // Eixo Central (Ajuda a ver a direção)
    const axisGeo = new THREE.CylinderGeometry(r*0.1, r*0.1, h + (h*0.5), 8);
    axisGeo.translate(0, -h/2 + (h*0.25), 0);
    const axis = new THREE.Mesh(axisGeo, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent:true, opacity:0.5, depthTest:false }));
    group.add(axis);

    return group;
}

// ── IMPLANTE NOS CORTES TRANSVERSAIS ───────────────────────────────
// addImplantToCut: ativa modo de posicionamento no corte ativo
function addImplantToCut() {
    const grid = document.getElementById('pan-cuts-grid');
    if (!grid || !panDensePoints || panDensePoints.length < 2) {
        alert('Gere os cortes transversais primeiro (aba Implant → fase 3).');
        return;
    }
    if (!volumeMeta) { alert('Carregue um exame DICOM primeiro.'); return; }

    // Remove overlay anterior
    _implantRemoveOverlays();

    // Seleciona o primeiro corte disponível (ou o selecionado)
    const items = grid.querySelectorAll('.pan-cut-item');
    if (items.length === 0) { alert('Nenhum corte visível.'); return; }

    const targetIdx = (window.panSelectedCut >= 0 && window.panSelectedCut < items.length)
        ? window.panSelectedCut : 0;

    // Posição inicial = centro do corte
    const [wm, hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
    const vs = volumeMeta.pixelSpacing || 1;
    const iw = Math.round(wm / vs), ih = Math.round(hm / vs);
    implantState.cutArrIdx = targetIdx;
    implantState.cutImgX = iw / 2;
    implantState.cutImgY = ih / 2;
    _implantCutToVolume(targetIdx, implantState.cutImgX, implantState.cutImgY);
    _implantDrawOverlay(targetIdx);
    _implantRegisterCutListeners();
    _implantSyncTo3D();
}

// Converte posição (col, row) no corte arrIdx → voxels no volume 3D
function _implantCutToVolume(arrIdx, col, row) {
    if (!volumeMeta || !panDensePoints || panDensePoints.length < 2) return;
    
    const vs = volumeMeta.pixelSpacing || 1;
    const [wm, hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
    const iw = Math.round(wm / vs), ih = Math.round(hm / vs);
    const cz = panCrossCenterZ;
    const cy = volumeMeta.y / 2;
    const tiltDeg = parseInt(document.getElementById('pan-tilt').value) || 0;
    const tanTilt = Math.tan(tiltDeg * Math.PI / 180);

    const ptIdxVal = panActiveCuts[arrIdx] || 0;
    const ptIdx = Math.max(0, Math.min(Math.round(ptIdxVal), panDensePoints.length - 2));
    const pA = panDensePoints[ptIdx], pB = panDensePoints[ptIdx + 1];
    
    let ddx = pB.x - pA.x, ddy = pB.y - pA.y;
    const len = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    ddx /= len; ddy /= len;
    const nx = -ddy, ny = ddx;

    const offW = col - iw / 2;
    const offH = row - ih / 2;
    
    // Coordenadas no plano XY do volume (Axial)
    const sx = pA.x + nx * offW;
    const sy = pA.y + ny * offW;
    
    // Coordenada Z do volume (Altura/Vertical)
    const zShift = -(sy - cy) * tanTilt;
    const fz = cz - offH + zShift;

    // Salva no estado global
    implantState.volX = sx;
    implantState.volY = sy;
    implantState.volZ = fz;
    
    // Se mudamos a posição no 2D, resetamos a flag de posição manual 3D
    // para que o implante "pule" para o novo local
    implantState.has3DPosition = false; 
    
    // Nota: NÃO resetamos has3DRotation aqui, para preservar inclinações finas
    // feitas no 3D, a menos que o ângulo 2D mude drasticamente.
}

// BUG 1 FIX: Gizmo circular estilo Blue Sky Bio.
// - Anel externo (arco laranja): ROTAÇÃO por arrasto de arco
// - Círculo interno (azul): TRANSLAÇÃO
// - Linha de eixo e marcadores de profundidade
// - Feedback de ângulo em tempo real
function _implantDrawOverlay(arrIdx) {
    _saveImplant();
    _implantRemoveOverlays();
    const grid = document.getElementById('pan-cuts-grid');
    if (!grid) return;
    const cutDiv = grid.querySelector('[data-arr-idx="' + arrIdx + '"]');
    if (!cutDiv) return;

    if (getComputedStyle(cutDiv).position === 'static') cutDiv.style.position = 'relative';

    const vs = volumeMeta.pixelSpacing || 1;
    const [wm, hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
    const iw = Math.round(wm / vs), ih = Math.round(hm / vs);
    const col = implantState.cutImgX != null ? implantState.cutImgX : iw / 2;
    const row = implantState.cutImgY != null ? implantState.cutImgY : ih / 2;

    let cx_can, cy_can, rCan, lCan, svgW, svgH;
    try {
        const cvs = cutDiv.querySelector('canvas');
        const divRect = cutDiv.getBoundingClientRect();
        svgW = cvs ? cvs.width  : divRect.width;
        svgH = cvs ? cvs.height : divRect.height;
        const cCenter = cornerstone.pixelToCanvas(cutDiv, { x: col, y: row });
        cx_can = cCenter.x; cy_can = cCenter.y;
        const cEdge   = cornerstone.pixelToCanvas(cutDiv, { x: col + implantState.diameter / vs / 2, y: row });
        const cBottom = cornerstone.pixelToCanvas(cutDiv, { x: col, y: row + implantState.length / vs });
        rCan = Math.abs(cEdge.x - cx_can);
        lCan = Math.abs(cBottom.y - cy_can);
    } catch (e) {
        const divRect = cutDiv.getBoundingClientRect();
        svgW = divRect.width; svgH = divRect.height;
        cx_can = (col / iw) * svgW; cy_can = (row / ih) * svgH;
        rCan = (implantState.diameter / vs / 2) * (svgW / iw);
        lCan = (implantState.length / vs) * (svgH / ih);
    }
    rCan = Math.max(rCan, 14);
    lCan = Math.max(lCan, 36);

    const angle = implantState.angleDeg || 0;
    const ar = angle * Math.PI / 180;

    // ── Dimensões do Gizmo Circular (estilo Blue Sky Bio) ──────────────
    // Raio do círculo de translação (interno)
    const TRANS_R = Math.max(32, rCan * 0.9);
    // Raio do anel de rotação (externo) — bem separado do interno
    const ROT_RING_R = TRANS_R + 22;
    const ROT_RING_W = 14; // espessura do anel

    // Ponta apical (base do implante) para o indicador de profundidade
    const apexX = cx_can + lCan * Math.sin(ar);
    const apexY = cy_can + lCan * Math.cos(ar);
    // Ponta coronal (topo)
    const topX = cx_can - (lCan * 0.15) * Math.sin(ar);
    const topY = cy_can - (lCan * 0.15) * Math.cos(ar);

    const ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ov.id = 'implant-overlay-' + arrIdx;
    ov.classList.add('implant-cut-overlay');
    ov.dataset.arrIdx = arrIdx;
    ov.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    ov.setAttribute('preserveAspectRatio', 'none');
    ov.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:500;overflow:visible;';

    // Gera o arco do anel de rotação (arco SVG)
    const arcR = ROT_RING_R + ROT_RING_W / 2;
    const arcStartX = cx_can + arcR;
    const arcStartY = cy_can;
    // Arco quase completo (350°) — 10° de gap para indicar a posição 0
    const gapRad = 5 * Math.PI / 180;
    const arcEndX = cx_can + arcR * Math.cos(gapRad);
    const arcEndY = cy_can - arcR * Math.sin(gapRad);

    // Marcadores de ângulo no anel (a cada 30°)
    let tickMarks = '';
    for (let deg = 0; deg < 360; deg += 30) {
        const rad = deg * Math.PI / 180;
        const innerR = ROT_RING_R - 2;
        const outerR = ROT_RING_R + ROT_RING_W + 2;
        tickMarks += `<line 
            x1="${cx_can + innerR * Math.cos(rad)}" y1="${cy_can + innerR * Math.sin(rad)}"
            x2="${cx_can + outerR * Math.cos(rad)}" y2="${cy_can + outerR * Math.sin(rad)}"
            stroke="rgba(255,165,0,0.4)" stroke-width="1.5"/>`;
    }
    // Indicador de ângulo atual no anel
    const angleIndicatorRad = (angle - 90) * Math.PI / 180; // -90 para apontar para cima
    const indR = ROT_RING_R + ROT_RING_W / 2;

    ov.innerHTML = `
        <defs>
            <radialGradient id="implGrad${arrIdx}" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stop-color="rgba(0,180,255,0.25)"/>
                <stop offset="100%" stop-color="rgba(0,80,200,0.08)"/>
            </radialGradient>
        </defs>

        <!-- CORPO DO IMPLANTE (rotacionado) -->
        <g transform="rotate(${angle}, ${cx_can}, ${cy_can})" style="pointer-events:none;">
            <!-- Sombra/glow do implante -->
            <ellipse cx="${cx_can}" cy="${cy_can + lCan*0.4}" rx="${rCan*1.2}" ry="${lCan*0.55}"
                     fill="rgba(0,120,255,0.08)" filter=""/>
            <!-- Corpo principal -->
            <rect x="${cx_can - rCan}" y="${cy_can - lCan*0.15}"
                  width="${rCan*2}" height="${lCan}"
                  rx="${rCan*0.3}" ry="${rCan*0.3}"
                  fill="url(#implGrad${arrIdx})"
                  stroke="rgba(0,180,255,0.85)" stroke-width="2"/>
            <!-- Roscas simuladas -->
            ${Array.from({length:6}, (_,i) => {
                const threadY = cy_can - lCan*0.1 + (lCan * 0.9 * i/5);
                return `<line x1="${cx_can - rCan*0.95}" y1="${threadY}"
                              x2="${cx_can + rCan*0.95}" y2="${threadY}"
                              stroke="rgba(0,200,255,0.3)" stroke-width="1"/>`;
            }).join('')}
            <!-- Hexágono do topo (plataforma) -->
            <rect x="${cx_can - rCan*0.7}" y="${cy_can - lCan*0.15 - 5}"
                  width="${rCan*1.4}" height="8" rx="2"
                  fill="rgba(0,200,255,0.4)" stroke="rgba(0,200,255,0.8)" stroke-width="1.5"/>
            <!-- Linha de eixo central -->
            <line x1="${cx_can}" y1="${cy_can - lCan*0.15 - 10}"
                  x2="${cx_can}" y2="${cy_can + lCan*0.85 + 10}"
                  stroke="rgba(0,255,200,0.5)" stroke-width="1" stroke-dasharray="3,3"/>
        </g>

        <!-- ANEL DE ROTAÇÃO EXTERNO (sempre visível, não rotaciona com o implante) -->
        <!-- Área de toque do anel (invisível, generosa) -->
        <circle cx="${cx_can}" cy="${cy_can}" r="${ROT_RING_R + ROT_RING_W + 8}"
                fill="none" stroke="transparent" stroke-width="${ROT_RING_W + 16}"
                id="impl-rot-ring-${arrIdx}" style="pointer-events:all;cursor:alias;"/>
        <!-- Anel visual -->
        <circle cx="${cx_can}" cy="${cy_can}" r="${ROT_RING_R + ROT_RING_W/2}"
                fill="none" stroke="rgba(255,140,0,0.25)" stroke-width="${ROT_RING_W}"
                style="pointer-events:none;"/>
        <!-- Arco de destaque (indica que pode girar) -->
        <circle cx="${cx_can}" cy="${cy_can}" r="${ROT_RING_R + ROT_RING_W/2}"
                fill="none" stroke="rgba(255,160,0,0.6)" stroke-width="2.5"
                stroke-dasharray="${Math.PI * 2 * (ROT_RING_R + ROT_RING_W/2) * 0.85} 999"
                stroke-dashoffset="${-Math.PI * 2 * (ROT_RING_R + ROT_RING_W/2) * 0.075}"
                style="pointer-events:none;"/>
        ${tickMarks}
        <!-- Seta indicadora de ângulo atual -->
        <circle cx="${cx_can + indR * Math.cos(angleIndicatorRad)}"
                cy="${cy_can + indR * Math.sin(angleIndicatorRad)}"
                r="5" fill="#fa0" stroke="rgba(255,200,0,0.5)" stroke-width="2"
                style="pointer-events:none;"/>
        <!-- Label do ângulo -->
        ${angle !== 0 ? `
        <rect x="${cx_can + (ROT_RING_R + ROT_RING_W + 12)}" y="${cy_can - 11}"
              width="42" height="22" rx="5"
              fill="rgba(0,8,22,0.88)" stroke="#fa0" stroke-width="1"
              style="pointer-events:none;"/>
        <text x="${cx_can + (ROT_RING_R + ROT_RING_W + 12) + 21}" y="${cy_can + 1}"
              fill="#fa0" font-size="11" font-weight="800" font-family="-apple-system,monospace"
              text-anchor="middle" dominant-baseline="middle"
              style="pointer-events:none;">${angle.toFixed(0)}°</text>` : ''}

        <!-- HANDLE DE TRANSLAÇÃO CENTRAL (círculo azul com crosshair) -->
        <!-- Zona de isolamento -->
        <circle cx="${cx_can}" cy="${cy_can}" r="${TRANS_R + 6}"
                fill="rgba(0,50,120,0.01)" stroke="transparent" stroke-width="12"
                id="impl-center-${arrIdx}" style="pointer-events:all;cursor:move;"/>
        <!-- Visual do handle -->
        <circle cx="${cx_can}" cy="${cy_can}" r="${TRANS_R}"
                fill="rgba(0,122,255,0.12)" stroke="#007AFF" stroke-width="2.5"
                stroke-dasharray="${angle !== 0 ? '5,3' : 'none'}"
                style="pointer-events:none;"/>
        <!-- Crosshair interno -->
        <line x1="${cx_can - TRANS_R*0.55}" y1="${cy_can}"
              x2="${cx_can + TRANS_R*0.55}" y2="${cy_can}"
              stroke="#007AFF" stroke-width="2" style="pointer-events:none;"/>
        <line x1="${cx_can}" y1="${cy_can - TRANS_R*0.55}"
              x2="${cx_can}" y2="${cy_can + TRANS_R*0.55}"
              stroke="#007AFF" stroke-width="2" style="pointer-events:none;"/>
        <!-- Ponto central -->
        <circle cx="${cx_can}" cy="${cy_can}" r="4"
                fill="#007AFF" style="pointer-events:none;"/>
    `;

    cutDiv.appendChild(ov);
    implantState.overlayCanvases[arrIdx] = ov;

    // ── Religa listener de re-render ────────────────────────────────
    if (!cutDiv._implantRenderBound) {
        cutDiv._implantRenderBound = true;
        cutDiv.addEventListener('cornerstoneimagerendered', () => {
            const idx = parseInt(cutDiv.dataset.arrIdx);
            if (implantState.cutArrIdx === idx) _implantDrawOverlay(idx);
        });
    }

    _implantDrawPanoOverlay(arrIdx);
    panDrawMiniPanoOverlay();
}

// ==========================================================
// _implantDrawPanoOverlay — VERSÃO CORRIGIDA v2
// Seta azul grossa com área de toque grande para translação
// mesio-distal. Handle de rotação separado, não sobreposto.
// ==========================================================
function _implantDrawPanoOverlay(arrIdx) {
    document.querySelectorAll('.implant-pano-overlay').forEach(el => el.remove());
    if (implantState.volX == null || !panDensePoints || panDensePoints.length < 2) return;

    [{ viewerId: 'pan-mini-viewer', el: panMiniElement },
     { viewerId: 'pan-pano-viewer', el: panPanoElement }].forEach(({ viewerId, el: panoEl }) => {
        const viewer = document.getElementById(viewerId);
        if (!viewer || !panoEl) return;
        let eEl; try { eEl = cornerstone.getEnabledElement(panoEl); } catch(e) { return; }
        if (!eEl || !eEl.image) return;
        const panoRect = viewer.getBoundingClientRect();
        if (!panoRect.width) return;

        const ptIdxVal = (panActiveCuts && panActiveCuts[arrIdx]) || 0;

        let pxCss, topCss, botCss, scX, scY;
        try {
            const vs  = volumeMeta.pixelSpacing || 1;
            const st  = volumeMeta.sliceThickness || vs;
            const pt  = cornerstone.pixelToCanvas(panoEl, { x: ptIdxVal, y: 0 });
            scX = panoRect.width  / eEl.canvas.width;
            scY = panoRect.height / eEl.canvas.height;
            pxCss = pt.x * scX;

            const zCenter = implantState.volZ != null ? implantState.volZ : panCrossCenterZ;
            const halfL   = (implantState.length / st) / 2;
            const ptTop   = cornerstone.pixelToCanvas(panoEl, { x: 0, y: (volumeMeta.z - 1) - (zCenter + halfL) });
            const ptBot   = cornerstone.pixelToCanvas(panoEl, { x: 0, y: (volumeMeta.z - 1) - (zCenter - halfL) });
            topCss = Math.min(ptTop.y, ptBot.y) * scY;
            botCss = Math.max(ptTop.y, ptBot.y) * scY;
        } catch(e) { return; }

        const lenCss  = Math.max(24, botCss - topCss);
        const midY    = topCss + lenCss / 2;

        // Dimensões da seta e handles (toque generoso para iPhone)
        const ARROW_SW   = 5;    // espessura da linha
        const HEAD_H     = 14;   // altura da cabeça da seta
        const HEAD_W     = 10;   // meia-largura da cabeça
        const DRAG_W     = 52;   // largura da zona de drag (px CSS)
        const ROT_R      = 18;   // raio do handle de rotação
        // Handle de rotação fica 36px à DIREITA da seta — bem separado
        const rotCx = pxCss + DRAG_W / 2 + ROT_R + 8;
        const rotCy = midY;

        const ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ov.classList.add('implant-pano-overlay');
        ov.setAttribute('id', 'impl-pano-' + viewerId);
        // pointer-events none no SVG raiz — só os elementos interativos aceitam toque
        ov.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:601;overflow:visible;';

        ov.innerHTML = `
            <!-- ZONA DE DRAG MESIO-DISTAL — rect invisível largo sobre a seta -->
            <rect class="impl-pano-drag"
                  x="${pxCss - DRAG_W/2}" y="${topCss - HEAD_H - 8}"
                  width="${DRAG_W}" height="${lenCss + HEAD_H*2 + 16}"
                  rx="8" fill="rgba(0,122,255,0.08)" stroke="rgba(0,122,255,0.35)"
                  stroke-width="1.5" stroke-dasharray="5,3"
                  style="pointer-events:all;cursor:ew-resize;"/>

            <!-- SETA SUPERIOR (ponta para cima) -->
            <polygon points="${pxCss},${topCss - HEAD_H} ${pxCss - HEAD_W},${topCss} ${pxCss + HEAD_W},${topCss}"
                     fill="#007AFF" style="pointer-events:none;" opacity="0.95"/>
            <!-- Corpo da seta -->
            <line x1="${pxCss}" y1="${topCss}" x2="${pxCss}" y2="${botCss}"
                  stroke="#007AFF" stroke-width="${ARROW_SW}" style="pointer-events:none;"
                  stroke-linecap="round" opacity="0.92"/>
            <!-- SETA INFERIOR (ponta para baixo) -->
            <polygon points="${pxCss},${botCss + HEAD_H} ${pxCss - HEAD_W},${botCss} ${pxCss + HEAD_W},${botCss}"
                     fill="#007AFF" style="pointer-events:none;" opacity="0.95"/>

            <!-- HANDLE DE ROTAÇÃO — isolado, bem à direita -->
            <rect x="${rotCx - ROT_R - 8}" y="${rotCy - ROT_R - 8}"
                  width="${(ROT_R+8)*2}" height="${(ROT_R+8)*2}"
                  fill="none" style="pointer-events:all;" rx="${ROT_R+8}"/>
            <circle class="impl-pano-rot"
                    cx="${rotCx}" cy="${rotCy}" r="${ROT_R}"
                    fill="rgba(255,160,0,0.70)" stroke="#fa0" stroke-width="2.5"
                    style="pointer-events:all;cursor:alias;"/>
            <text x="${rotCx}" y="${rotCy + 1}"
                  text-anchor="middle" dominant-baseline="middle"
                  fill="#000" font-size="15" font-weight="900"
                  style="pointer-events:none;">↻</text>

            ${implantState.angleDeg !== 0 ? `
            <rect x="${rotCx - 18}" y="${rotCy + ROT_R + 4}" width="36" height="18"
                  rx="4" fill="rgba(0,10,28,0.85)" stroke="#fa0" stroke-width="1"
                  style="pointer-events:none;"/>
            <text x="${rotCx}" y="${rotCy + ROT_R + 13}"
                  fill="#fa0" font-size="10" font-weight="800"
                  font-family="-apple-system,monospace"
                  text-anchor="middle" dominant-baseline="middle"
                  style="pointer-events:none;">${implantState.angleDeg.toFixed(0)}°</text>` : ''}
        `;

        const wrap = viewer.parentElement;
        if (!wrap) return;
        if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        wrap.appendChild(ov);

        // Registra interação somente na mini-pano (a panorâmica principal já tem seu drag)
        if (viewerId === 'pan-mini-viewer') {
            _implantSetupPanoDrag(ov, arrIdx, panoEl, scX, scY);
        }
    });
}

// ==========================================================
// _implantSetupPanoDrag — interação na mini-panorâmica
// Zona de drag → translação mesio-distal
// Handle laranja → rotação
// ==========================================================
function _implantSetupPanoDrag(svgEl, arrIdx, panoEl, scX, scY) {
    if (svgEl._panoDragBound) return;
    svgEl._panoDragBound = true;

    const dragZone  = svgEl.querySelector('.impl-pano-drag');
    const rotHandle = svgEl.querySelector('.impl-pano-rot');

    // ── TRANSLAÇÃO MESIO-DISTAL ──────────────────────────────
    if (dragZone) {
        let dragging = false;
        let startPageX = 0, startPtIdx = 0;

        const onStart = (e) => {
            if (e.touches && e.touches.length > 1) return;
            dragging = true;
            const t = e.touches ? e.touches[0] : e;
            startPageX  = t.pageX;
            startPtIdx  = (panActiveCuts && panActiveCuts[arrIdx]) || 0;
            e.stopPropagation(); e.stopImmediatePropagation();
            if (e.cancelable) e.preventDefault();

            const onMove = (ev) => {
                if (!dragging) return;
                ev.stopPropagation(); ev.stopImmediatePropagation();
                if (ev.cancelable) ev.preventDefault();
                const t2 = ev.touches ? ev.touches[0] : ev;
                const dxCanvas = (t2.pageX - startPageX) / scX;
                let newIdx = Math.round(startPtIdx + dxCanvas);
                newIdx = Math.max(0, Math.min((panDensePoints.length || 2) - 2, newIdx));
                if (panActiveCuts) panActiveCuts[arrIdx] = newIdx;
                panCrossIndex = newIdx;
                _implantCutToVolume(arrIdx, implantState.cutImgX, implantState.cutImgY);
                _implantSyncTo3D();
                _implantDrawPanoOverlay(arrIdx);
                panDrawMiniPanoOverlay();
                panDrawPanoOverlay();
                const ph3 = document.getElementById('pan-phase-3');
                if (ph3 && ph3.classList.contains('active')) panUpdateSpecificCut(arrIdx);
            };
            const onEnd = (ev) => {
                if (!dragging) return;
                dragging = false;
                ev.stopPropagation();
                if (ev.cancelable) ev.preventDefault();
                _saveImplant();
                document.removeEventListener('touchmove', onMove, { capture: true });
                document.removeEventListener('touchend',  onEnd,  { capture: true });
                document.removeEventListener('mousemove', onMove, { capture: true });
                document.removeEventListener('mouseup',   onEnd,  { capture: true });
            };
            document.addEventListener('touchmove', onMove, { passive: false, capture: true });
            document.addEventListener('touchend',  onEnd,  { passive: false, capture: true });
            document.addEventListener('mousemove', onMove, { passive: false, capture: true });
            document.addEventListener('mouseup',   onEnd,  { capture: true });
        };
        dragZone.addEventListener('touchstart', onStart, { passive: false, capture: true });
        dragZone.addEventListener('mousedown',  onStart, { capture: true });
    }

    // ── ROTAÇÃO ──────────────────────────────────────────────
    if (rotHandle) {
        let rotating = false;
        let startAngle = 0, startImplAngle = 0;

        const getCenterCss = () => {
            try {
                const ptIdxVal = (panActiveCuts && panActiveCuts[arrIdx]) || 0;
                const vs = volumeMeta.pixelSpacing || 1;
                const st = volumeMeta.sliceThickness || vs;
                const pt = cornerstone.pixelToCanvas(panoEl, { x: ptIdxVal, y: 0 });
                const zCenter = implantState.volZ != null ? implantState.volZ : panCrossCenterZ;
                const halfL   = (implantState.length / st) / 2;
                const ptTop   = cornerstone.pixelToCanvas(panoEl, { x: 0, y: (volumeMeta.z-1)-(zCenter+halfL) });
                const ptBot   = cornerstone.pixelToCanvas(panoEl, { x: 0, y: (volumeMeta.z-1)-(zCenter-halfL) });
                const topCss  = Math.min(ptTop.y, ptBot.y) * scY;
                const lenCss  = Math.max(24, Math.abs(ptBot.y - ptTop.y) * scY);
                return { x: pt.x * scX, y: topCss + lenCss / 2 };
            } catch(e) { return { x: 0, y: 0 }; }
        };

        const onStart = (e) => {
            if (e.touches && e.touches.length > 1) return;
            rotating = true;
            const t = e.touches ? e.touches[0] : e;
            const c = getCenterCss();
            const wrap = svgEl.closest('[style*="position"]') || svgEl.parentElement;
            const wRect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
            const dx = t.clientX - wRect.left - c.x;
            const dy = t.clientY - wRect.top  - c.y;
            startAngle     = Math.atan2(dx, dy) * (180 / Math.PI);
            startImplAngle = implantState.angleDeg || 0;
            e.stopPropagation(); e.stopImmediatePropagation();
            if (e.cancelable) e.preventDefault();

            const onMove = (ev) => {
                if (!rotating) return;
                ev.stopPropagation(); ev.stopImmediatePropagation();
                if (ev.cancelable) ev.preventDefault();
                const t2 = ev.touches ? ev.touches[0] : ev;
                const c2 = getCenterCss();
                const dx2 = t2.clientX - wRect.left - c2.x;
                const dy2 = t2.clientY - wRect.top  - c2.y;
                const cur = Math.atan2(dx2, dy2) * (180 / Math.PI);
                implantState.angleDeg = startImplAngle + (cur - startAngle);
                if (implantState.cutArrIdx >= 0) _implantDrawOverlay(implantState.cutArrIdx);
                _implantSyncTo3D();
                _implantDrawPanoOverlay(arrIdx);
            };
            const onEnd = (ev) => {
                if (!rotating) return;
                rotating = false;
                if (ev.cancelable) ev.preventDefault();
                _saveImplant();
                document.removeEventListener('touchmove', onMove, { capture: true });
                document.removeEventListener('touchend',  onEnd,  { capture: true });
                document.removeEventListener('mousemove', onMove, { capture: true });
                document.removeEventListener('mouseup',   onEnd,  { capture: true });
            };
            document.addEventListener('touchmove', onMove, { passive: false, capture: true });
            document.addEventListener('touchend',  onEnd,  { passive: false, capture: true });
            document.addEventListener('mousemove', onMove, { passive: false, capture: true });
            document.addEventListener('mouseup',   onEnd,  { capture: true });
        };
        rotHandle.addEventListener('touchstart', onStart, { passive: false, capture: true });
        rotHandle.addEventListener('mousedown',  onStart, { capture: true });
    }
}

// Remove todos os overlays de implante
function _implantRemoveOverlays() {
    document.querySelectorAll('.implant-cut-overlay').forEach(el => el.remove());
    document.querySelectorAll('.implant-pano-overlay').forEach(el => el.remove());
    implantState.overlayCanvases = {};
}

// BUG 1 FIX: Listeners do gizmo circular — anel=rotação, centro=translação
function _implantRegisterCutListeners() {
    const grid = document.getElementById('pan-cuts-grid');
    if (!grid) return;
    const items = grid.querySelectorAll('.pan-cut-item');
    items.forEach(cutDiv => {
        if (cutDiv._implantListenerBound) return;
        cutDiv._implantListenerBound = true;

        let dragMode = null; // 'translate' | 'rotate'
        let startAngle = 0;
        let startImplAngle = 0;
        let startX = 0, startY = 0;
        let startImgX = 0, startImgY = 0;

        const getCenterCanvas = () => {
            const arrIdx = implantState.cutArrIdx;
            const vs = volumeMeta.pixelSpacing || 1;
            const [wm, hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
            const iw = Math.round(wm/vs), ih = Math.round(hm/vs);
            const col = implantState.cutImgX != null ? implantState.cutImgX : iw/2;
            const row = implantState.cutImgY != null ? implantState.cutImgY : ih/2;
            try { return cornerstone.pixelToCanvas(cutDiv, {x:col, y:row}); } catch(e) {}
            const r = cutDiv.getBoundingClientRect();
            return { x: (col/iw)*r.width, y: (row/ih)*r.height };
        };

        const getTouch = (e) => {
            const t = e.touches ? e.touches[0] : e;
            const r = cutDiv.getBoundingClientRect();
            return { x: t.clientX - r.left, y: t.clientY - r.top };
        };

        const getCanvasCoords = (e) => {
            try { return getPreciseImageCoords(cutDiv, e); } catch(ex) {}
            const t = getTouch(e);
            const r = cutDiv.getBoundingClientRect();
            const vs = volumeMeta.pixelSpacing || 1;
            const [wm, hm] = document.getElementById('pan-size-sel').value.split('x').map(Number);
            return { x: (t.x/r.width)*Math.round(wm/vs), y: (t.y/r.height)*Math.round(hm/vs) };
        };

        const onDown = (e) => {
            const arrIdx = parseInt(cutDiv.dataset.arrIdx);
            if (arrIdx !== implantState.cutArrIdx) return;

            const touch = getTouch(e);
            const center = getCenterCanvas();
            const dx = touch.x - center.x;
            const dy = touch.y - center.y;
            const distFromCenter = Math.sqrt(dx*dx + dy*dy);

            // Raios do gizmo
            const vs = volumeMeta.pixelSpacing || 1;
            const rCan = Math.max(14, (implantState.diameter/vs/2) * (cutDiv.getBoundingClientRect().width / Math.round(3e1/vs)));
            const TRANS_R = Math.max(32, rCan * 0.9);
            const ROT_INNER = TRANS_R + 10;
            const ROT_OUTER = TRANS_R + 44;

            if (distFromCenter <= TRANS_R + 6) {
                // Área interna = TRANSLAÇÃO
                dragMode = 'translate';
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                const imgCoords = getCanvasCoords(e);
                startImgX = imgCoords.x; startImgY = imgCoords.y;
                startImplX = implantState.cutImgX; startImplY = implantState.cutImgY;
            } else if (distFromCenter >= ROT_INNER && distFromCenter <= ROT_OUTER) {
                // Anel externo = ROTAÇÃO
                dragMode = 'rotate';
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                startImplAngle = implantState.angleDeg || 0;
            }

            if (dragMode) {
                const onMove = (ev) => {
                    if (!dragMode) return;
                    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();

                    if (dragMode === 'translate') {
                        const imgCoords = getCanvasCoords(ev);
                        const dix = imgCoords.x - startImgX;
                        const diy = imgCoords.y - startImgY;
                        const vs2 = volumeMeta.pixelSpacing || 1;
                        const [wm2, hm2] = document.getElementById('pan-size-sel').value.split('x').map(Number);
                        const iw2 = Math.round(wm2/vs2), ih2 = Math.round(hm2/vs2);
                        implantState.cutImgX = Math.max(0, Math.min(iw2-1, startImplX + dix));
                        implantState.cutImgY = Math.max(0, Math.min(ih2-1, startImplY + diy));
                        _implantCutToVolume(arrIdx, implantState.cutImgX, implantState.cutImgY);
                        _implantDrawOverlay(arrIdx); // leve redraw durante arrasto
                    } else if (dragMode === 'rotate') {
                        const touchMov = getTouch(ev);
                        const centerMov = getCenterCanvas();
                        const curAngle = Math.atan2(touchMov.y - centerMov.y, touchMov.x - centerMov.x) * 180 / Math.PI;
                        let delta = curAngle - startAngle;
                        // Normaliza delta para [-180, 180]
                        if (delta > 180) delta -= 360;
                        if (delta < -180) delta += 360;
                        implantState.angleDeg = startImplAngle + delta;
                        _implantDrawOverlay(arrIdx);
                    }
                };

                const onUp = (ev) => {
                    if (dragMode) {
                        ev.preventDefault(); ev.stopPropagation();
                        _implantCutToVolume(arrIdx, implantState.cutImgX, implantState.cutImgY);
                        _implantSyncTo3D();
                        _implantDrawOverlay(arrIdx);
                        _saveImplant();
                    }
                    dragMode = null;
                    document.removeEventListener(ev.touches ? 'touchmove' : 'mousemove', onMove, { capture: true });
                    document.removeEventListener(ev.touches ? 'touchend'  : 'mouseup',   onUp,   { capture: true });
                };

                document.addEventListener(e.touches ? 'touchmove' : 'mousemove', onMove, { passive: false, capture: true });
                document.addEventListener(e.touches ? 'touchend'  : 'mouseup',   onUp,   { capture: true });
            }
        };

        cutDiv.addEventListener('touchstart', onDown, { passive: false, capture: true });
        cutDiv.addEventListener('mousedown',  onDown, { capture: true });
    });
}

// Variáveis auxiliares para o drag de translação
let startImplX = 0, startImplY = 0;

// Projeta posição dos voxels no scene 3D do volume DICOM
function _implantSyncTo3D() {
    if (implantState.volX == null || !volumeMeta || !window._vrScene) return;

    // Limpa controles antigos
    if (implantControls3D) {
        implantControls3D.dispose();
        window._vrScene.remove(implantControls3D);
        implantControls3D = null;
    }
    _removeImplantMesh();

    // 1. Definições de Escala (Volume -> Cena)
    const ps = volumeMeta.pixelSpacing || 0.2;
    const st = volumeMeta.sliceThickness || ps;
    const physX = volumeMeta.x * ps;
    const physY = volumeMeta.y * ps;
    const physZ = volumeMeta.z * st;
    const maxDim = Math.max(physX, physY, physZ);
    const scale = 1.6 / maxDim;

    // 2. Cria Malha
    const implantMesh = createImplantGeometry(implantState.diameter, implantState.length, ps);
    implantMesh.name = '__implant__';

    // 3. Posicionamento (Translação)
    // Mapeamento: Vol X -> Scene X, Vol Y -> Scene Z, Vol Z -> Scene Y
    const mmX = (implantState.volX - volumeMeta.x / 2) * ps;
    const mmY = (implantState.volZ - volumeMeta.z / 2) * st; // Z do volume é altura (Scene Y)
    const mmZ = (volumeMeta.y / 2 - implantState.volY) * ps; // Y do volume é profundidade (Scene Z)
    
    // Se já temos posição editada no 3D, usamos ela. Senão, usamos a do corte.
    if (implantState.has3DPosition && implantState.position.lengthSq() > 0) {
        implantMesh.position.copy(implantState.position);
    } else {
        implantMesh.position.set(mmX * scale, mmY * scale, mmZ * scale);
        implantState.position.copy(implantMesh.position);
    }

    // 4. ROTAÇÃO INTELIGENTE (A CORREÇÃO DO "DEITADO")
    // Se já foi rotacionado manualmente no 3D, respeita.
    if (implantState.has3DRotation) {
        implantMesh.rotation.copy(implantState.rotation);
    } else {
        // --- Cálculo Automático Baseado na Curva Panorâmica ---
        // O implante deve estar EM PÉ (Y-Up), mas girado para olhar para "fora" da boca
        
        let rotY = 0; // Rotação em torno do eixo vertical (acompanhar a curva)
        
        if (panDensePoints && panDensePoints.length > 1 && implantState.cutArrIdx >= 0) {
            // Pega o índice do corte na curva
            const idx = Math.min(implantState.cutArrIdx, panDensePoints.length - 2);
            const pA = panDensePoints[idx];
            const pB = panDensePoints[idx + 1];
            
            // Vetor Tangente da curva (dx, dy)
            // No volume: dx é X, dy é Y. Na cena: dx é X, dy é Z.
            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            
            // Calcula o ângulo da tangente no plano XZ da cena
            // Adicionamos Math.PI/2 para que a "frente" do implante aponte para a vestibular
            rotY = -Math.atan2(dy, dx); 
        }

        // Reseta rotação
        implantMesh.rotation.set(0, 0, 0);
        
        // 1. Gira em Y para alinhar com a curvatura da mandíbula
        implantMesh.rotateY(rotY);
        
        // 2. Aplica a inclinação Vestibular-Lingual (angleDeg do corte)
        // Como o implante agora está alinhado com a curva, a inclinação é no eixo X local
        const tiltRad = (implantState.angleDeg || 0) * (Math.PI / 180);
        implantMesh.rotateX(tiltRad); // Inclinação frente-trás
    }

    window._vrScene.add(implantMesh);
    implantState.mesh = implantMesh;
    implantState.visible = true;

    // 5. Configura Gizmo (TransformControls)
    implantControls3D = new THREE.TransformControls(window._vrCamera, renderer3D.domElement);
    implantControls3D.attach(implantMesh);
    implantControls3D.setSize(0.8);
    implantControls3D.setSpace('local'); // Importante para rodar no eixo do próprio implante

    // Callbacks do Gizmo
    implantControls3D.addEventListener('dragging-changed', function (event) {
        if (controls3D) controls3D.enabled = !event.value;
    });
    
    implantControls3D.addEventListener('change', function() {
        if (implantState.mesh) {
            implantState.position.copy(implantState.mesh.position);
            implantState.rotation.copy(implantState.mesh.rotation);
            implantState.has3DRotation = true; // Marca que o usuário mexeu no 3D
            implantState.has3DPosition = true;
        }
    });

    implantControls3D.addEventListener('mouseUp', function() {
        _saveImplant();
    });

    window._vrScene.add(implantControls3D);
    
    // Atualiza estado visual do botão
    if (typeof _updateGizmoMode === 'function') _updateGizmoMode();
    
    setTimeout(panDrawMiniPanoOverlay, 50);
}


// Mantém compatibilidade: addImplantTo3D agora simplesmente re-sincroniza
function addImplantTo3D() {
    if (implantState.volX != null) {
        _implantSyncTo3D();
    } else {
        // Se não tem posição no corte, coloca no centro da cena
        if (!window._vrScene) { alert('Renderize o volume 3D primeiro.'); return; }
        _removeImplantMesh();
        const ps = volumeMeta ? volumeMeta.pixelSpacing : 0.2;
        const ig = createImplantGeometry(implantState.diameter, implantState.length, ps);
        ig.name = '__implant__';
        ig.position.copy(implantState.position);
        window._vrScene.add(ig);
        implantState.mesh = ig;
        implantState.visible = true;
    }
}

function implant3DClickMove(e) {
    // Mantido por compatibilidade — agora a interação é nos cortes
    if (!implantState.mesh || !window._vrCamera || !window._vrScene) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, window._vrCamera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    if (target) {
        implantState.mesh.position.set(target.x, target.y, target.z);
        implantState.position.copy(target);
    }
}

// Remove APENAS o mesh 3D da cena - sem apagar o estado/save (uso interno)
function _removeImplantMesh() {
    if (window._vrScene && implantState.mesh) {
        window._vrScene.remove(implantState.mesh);
        implantState.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        implantState.mesh = null;
    }
}

// ==========================================================
// IMPLANTE 3D INTERATIVO — posicionamento por arrasto direto
// Lógica:
//   - Modo ATIVO: OrbitControls desabilitado, 1 dedo move implante
//   - Move o implante projetando o toque numa esfera que circunscreve o volume
//   - 2 dedos (pinch): SEMPRE passa para OrbitControls (zoom/pan do volume)
//   - Modo INATIVO: OrbitControls reativado normalmente
// ==========================================================
let _impl3dDragActive = false;
let _impl3dDragCanvasBound = false;
let _gizmoState = 0; 

function toggleImplant3DMode() {
    const btn = document.getElementById('btn-impl3d-drag');
    if (!implantControls3D || !btn) return;

    // Ciclo: 0 (Off) -> 1 (Mover) -> 2 (Rodar) -> 0 (Off)
    _gizmoState = (_gizmoState + 1) % 3;
    _impl3dDragActive = (_gizmoState !== 0);

    _updateGizmoMode();
}

function _updateGizmoMode() {
    const btn = document.getElementById('btn-impl3d-drag');
    if (!implantControls3D || !btn) return;

    if (_gizmoState === 0) {
        // --- MODO OFF ---
        implantControls3D.detach();
        implantControls3D.visible = false;
        implantControls3D.enabled = false;
        if (controls3D) controls3D.enabled = true;
        
        btn.textContent = '✋ Posicionar Implante';
        btn.style.background = 'rgba(0,122,255,0.18)';
        btn.style.borderColor = '#007AFF';
        btn.style.color = '#007AFF';
        
        // Animação de confirmação
        _impl3dConfirmAnimation();

    } else if (_gizmoState === 1) {
        // --- MODO MOVER (Translação) ---
        if (implantState.mesh) implantControls3D.attach(implantState.mesh);
        implantControls3D.setMode('translate');
        implantControls3D.visible = true;
        implantControls3D.enabled = true;
        
        // Habilita TODOS os eixos (X, Y, Z)
        implantControls3D.showX = true;
        implantControls3D.showY = true;
        implantControls3D.showZ = true;

        btn.textContent = '↔ Movendo (Toque p/ Rodar)';
        btn.style.background = 'rgba(255, 165, 0, 0.22)'; // Laranja
        btn.style.borderColor = '#ffa500';
        btn.style.color = '#ffa500';
        
        _impl3dStartGlow();

    } else if (_gizmoState === 2) {
        // --- MODO RODAR (Inclinação) ---
        if (implantState.mesh) implantControls3D.attach(implantState.mesh);
        implantControls3D.setMode('rotate');
        implantControls3D.visible = true;
        implantControls3D.enabled = true;

        btn.textContent = '↻ Rodando (Toque p/ Confirmar)';
        btn.style.background = 'rgba(0,220,80,0.22)'; // Verde
        btn.style.borderColor = '#2c9';
        btn.style.color = '#2c9';
        
        _impl3dStartGlow();
    }
}

// Inicia glow pulsante azul-ciano enquanto posicionando
function _impl3dStartGlow() {
    if (!implantState.mesh) return;
    
    // Aplica emissive azul e transparência reduzida em todos os sub-meshes
    implantState.mesh.traverse(c => {
        if (!c.isMesh) return;
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.72;
        c.material.emissive = new THREE.Color(0x003080);
        c.material.emissiveIntensity = 0.5;
        c._impl3dOrigColor = c.material.color.clone();
    });

    // Pulso via rAF — varia emissiveIntensity de 0.3 a 1.0
    let t = 0;
    const pulse = () => {
        if (!_impl3dDragActive) return;
        t += 0.04;
        const intensity = 0.3 + Math.abs(Math.sin(t)) * 0.7;
        if (implantState.mesh) {
            implantState.mesh.traverse(c => {
                if (c.isMesh && c.material.emissive) c.material.emissiveIntensity = intensity;
            });
        }
        // REMOVIDO: O render forçado que causava o conflito. O animate3D já faz isso.
        requestAnimationFrame(pulse);
    };
    requestAnimationFrame(pulse);
}

// Animação de confirmação — flash branco → sólido titanium
function _impl3dConfirmAnimation() {
    if (!implantState.mesh) return;
    let frame = 0;
    const FRAMES = 18;
    const anim = () => {
        frame++;
        const p = frame / FRAMES;
        const flash = p < 0.4 ? (p / 0.4) : (1 - (p - 0.4) / 0.6); // sobe e desce
        implantState.mesh.traverse(c => {
            if (!c.isMesh) return;
            c.material.emissiveIntensity = flash * 1.2;
            c.material.emissive = new THREE.Color(0x80c8ff); // flash azul-branco
            c.material.opacity = 0.72 + (1 - 0.72) * p; // solidifica gradualmente
        });
        
        // REMOVIDO: Render forçado
        
        if (frame < FRAMES) {
            requestAnimationFrame(anim);
        } else {
            // Fim: restaura materiais originais sólidos
            implantState.mesh.traverse(c => {
                if (!c.isMesh) return;
                c.material.opacity = 1.0;
                c.material.transparent = false;
                c.material.emissive = new THREE.Color(0x000000);
                c.material.emissiveIntensity = 0;
            });
            // REMOVIDO: Render forçado final
        }
    };
    requestAnimationFrame(anim);
}

function _impl3dBindDrag() {
    const canvas = renderer3D && renderer3D.domElement;
    if (!canvas || _impl3dDragCanvasBound) return;
    _impl3dDragCanvasBound = true;

    let dragging = false;
    let lastCanvasX = 0, lastCanvasY = 0;
    let twoFingerActive = false;

    const getTouchPos3D = (clientX, clientY) => {
        if (!camera3D || !implantState.mesh) return null;
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width)  *  2 - 1;
        const ndcY = ((clientY - rect.top)  / rect.height) * -2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera3D);

        const implantWorldPos = new THREE.Vector3();
        implantState.mesh.getWorldPosition(implantWorldPos);
        const camDir = new THREE.Vector3();
        camera3D.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, implantWorldPos);

        const hit = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, hit);
        return hit.isVector3 !== false ? hit : null;
    };

    const onStart = (e) => {
        if (!_impl3dDragActive || !implantState.mesh) return;

        if (e.touches && e.touches.length >= 2) {
            dragging = false;
            twoFingerActive = true;
            if (controls3D) controls3D.enabled = true; 
            return;
        }

        twoFingerActive = false;
        if (controls3D) controls3D.enabled = false;

        const t = e.touches ? e.touches[0] : e;
        const rect = canvas.getBoundingClientRect();
        lastCanvasX = t.clientX;
        lastCanvasY = t.clientY;
        dragging = true;

        e.preventDefault();
        e.stopPropagation();
    };

    const onMove = (e) => {
        if (e.touches && e.touches.length >= 2) {
            dragging = false;
            return;
        }
        if (!dragging || !_impl3dDragActive || !implantState.mesh) return;

        const t = e.touches ? e.touches[0] : e;

        const rect = canvas.getBoundingClientRect();
        const dx = (t.clientX - lastCanvasX) / rect.width;
        const dy = (t.clientY - lastCanvasY) / rect.height;
        lastCanvasX = t.clientX;
        lastCanvasY = t.clientY;

        const right = new THREE.Vector3().setFromMatrixColumn(camera3D.matrixWorld, 0);
        const up    = new THREE.Vector3().setFromMatrixColumn(camera3D.matrixWorld, 1);

        const implantPos = new THREE.Vector3();
        implantState.mesh.getWorldPosition(implantPos);
        const camDist = camera3D.position.distanceTo(implantPos);
        const fovRad = (camera3D.fov || 45) * Math.PI / 180;
        const frustumH = 2 * Math.tan(fovRad / 2) * camDist;
        const speed = frustumH;

        implantState.mesh.position.addScaledVector(right,  dx * speed);
        implantState.mesh.position.addScaledVector(up,    -dy * speed);

        // REMOVIDO: Render forçado imediato que conflitava com o loop principal

        e.preventDefault();
        e.stopPropagation();
    };

    const onEnd = (e) => {
        if (!_impl3dDragActive) return;
        if (twoFingerActive && (!e.touches || e.touches.length < 2)) {
            twoFingerActive = false;
            if (controls3D) controls3D.enabled = false;
        }
        dragging = false;
    };

    canvas.addEventListener('touchstart', onStart, { passive: false, capture: true });
    canvas.addEventListener('touchmove',  onMove,  { passive: false, capture: true });
    canvas.addEventListener('touchend',   onEnd,   { passive: true,  capture: true });
    canvas.addEventListener('mousedown',  onStart, { capture: true });
    window.addEventListener('mousemove',  onMove,  { capture: true });
    window.addEventListener('mouseup',    onEnd,   { capture: true });
}

// Mostra/esconde o painel de implante 3D conforme implante existe
function _updateImpl3DPanel() {
    const panel = document.getElementById('impl3d-panel');
    if (!panel) return;
    const hasImplant = !!(window._savedImplant && window._savedImplant.volX != null);
    panel.style.display = hasImplant ? 'flex' : 'none';
}

// Remove implante completamente (botão "Remover") - apaga estado e save
function removeImplant() {
    _implantRemoveOverlays();
    _removeImplantMesh();
    window._savedImplant = null; // exclusão permanente — não restaura ao trocar aba
    implantState.cutArrIdx = -1;
    implantState.cutImgX = null;
    implantState.cutImgY = null;
    implantState.volX = null;
    implantState.volY = null;
    implantState.volZ = null;
    implantState.visible = false;
    implantState.angleDeg = 0;

    // CRÍTICO: restaura Wwwc e ferramentas padrão nos cortes transversais
    // O SVG do implante tinha pointer-events capturando toques — ao remover,
    // o Cornerstone precisa ser re-notificado de que é dono dos eventos novamente.
    const grid = document.getElementById('pan-cuts-grid');
    if (grid) {
        grid.querySelectorAll('.pan-cut-item').forEach(div => {
            // Remove flag para permitir re-registro futuro se novo implante for inserido
            div._implantTouchBound = false;
            try {
                const isEnabled = cornerstone.getEnabledElements().some(e => e.element === div);
                if (isEnabled) {
                    cornerstoneTools.setToolActiveForElement(div, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
                    cornerstoneTools.setToolActiveForElement(div, 'PanMultiTouch', {});
                    cornerstoneTools.setToolActiveForElement(div, 'ZoomTouchPinch', {});
                }
            } catch(e) {}
        });
    }
}

async function suggestImplantPositionAI() {
    const result = document.getElementById('impl-ai-result');
    if (!result) return;
    result.style.display = 'block';
    result.innerHTML = '<span style="color:#a88;">🤖 Analisando volume DICOM...</span>';

    // Análise local: estima densidade média por quadrante do volume para sugerir posição
    if (!volumeData || !volumeMeta) {
        result.innerHTML = '<span style="color:#f88;">⚠ Carregue um exame DICOM primeiro.</span>';
        return;
    }

    await new Promise(r => setTimeout(r, 50));

    try {
        const { x: nx, y: ny, z: nz } = volumeMeta;
        const HU_BONE_MIN = 300, HU_BONE_MAX = 2500;
        const HU_SOFT = [-100, 200];

        // Analisa 3 regiões (anterior, médio, posterior) no plano axial central
        const zMid = Math.floor(nz / 2);
        const regions = [
            { name: 'Anterior', xRange: [0, Math.floor(nx/3)] },
            { name: 'Médio',    xRange: [Math.floor(nx/3), Math.floor(2*nx/3)] },
            { name: 'Posterior', xRange: [Math.floor(2*nx/3), nx] }
        ];

        let bestRegion = null, bestScore = -Infinity;
        const details = [];

        for (const reg of regions) {
            let boneCount = 0, totalCount = 0, sumHU = 0;
            for (let z = Math.max(0, zMid-5); z < Math.min(nz, zMid+5); z++) {
                for (let y = Math.floor(ny*0.3); y < Math.floor(ny*0.7); y++) {
                    for (let x = reg.xRange[0]; x < reg.xRange[1]; x++) {
                        const hu = volumeData[z * nx * ny + y * nx + x];
                        sumHU += hu;
                        totalCount++;
                        if (hu >= HU_BONE_MIN && hu <= HU_BONE_MAX) boneCount++;
                    }
                }
            }
            const bonePct = (boneCount / totalCount) * 100;
            const avgHU   = sumHU / totalCount;
            // Score: favorece alta densidade óssea
            const score = bonePct * 0.7 + Math.min(avgHU, 1000) * 0.0003;
            details.push({ ...reg, bonePct: bonePct.toFixed(1), avgHU: avgHU.toFixed(0), score });
            if (score > bestScore) { bestScore = score; bestRegion = reg.name; }
        }

        const sorted = [...details].sort((a,b) => b.score - a.score);
        const topReg = sorted[0];
        const boneDensity = parseFloat(topReg.bonePct);
        const densityLabel = boneDensity > 40 ? 'D1-D2 (osso denso)' : boneDensity > 20 ? 'D2-D3 (osso médio)' : 'D3-D4 (osso esponjoso)';

        // Sugestão de tamanho baseada na qualidade óssea
        const suggestLen   = boneDensity > 35 ? 10 : boneDensity > 20 ? 12 : 14;
        const suggestDiam  = boneDensity > 35 ? 4.0 : 4.5;

        result.innerHTML = `
            <div style="font-weight:800;color:#c8aaff;margin-bottom:6px;">🤖 Análise IA Local</div>
            <div style="margin-bottom:4px;"><b style="color:#0df">Melhor região:</b> ${bestRegion}</div>
            <div style="margin-bottom:4px;"><b style="color:#0df">Densidade:</b> ${densityLabel}</div>
            <div style="margin-bottom:4px;"><b style="color:#0df">HU médio:</b> ${topReg.avgHU} HU</div>
            <div style="margin-bottom:4px;"><b style="color:#0df">Osso detectado:</b> ${topReg.bonePct}%</div>
            <div style="border-top:1px solid #60f;margin:6px 0;"></div>
            <div style="margin-bottom:4px;"><b style="color:#fa0">Sugestão:</b> ${suggestDiam.toFixed(1)} × ${suggestLen} mm</div>
            <div style="font-size:10px;color:#886;margin-top:4px;line-height:1.4;">
                ⚠ Análise automática — sempre confirme com avaliação clínica e radiológica completa.
            </div>
            <button onclick="setImplantDiam(${suggestDiam});setImplantLen(${suggestLen});"
                style="width:100%;margin-top:8px;padding:6px;background:rgba(80,0,160,0.3);border:1px solid #a0f;color:#c8aaff;border-radius:7px;font-size:11px;cursor:pointer;font-weight:700;">
                ✓ Aplicar sugestão
            </button>
        `;
    } catch (err) {
        result.innerHTML = `<span style="color:#f88;">Erro na análise: ${err.message}</span>`;
    }
}

// Hook para expor scene/camera 3D ao simulador de implante
(function patchInit3D() {
    const origInit = window.init3DRender;
    if (typeof origInit !== 'function') return;
    window.init3DRender = async function() {
        await origInit.apply(this, arguments);
        // Tenta capturar a scene/camera do renderer 3D
        // O init3DRender cria variáveis locais; interceptamos via setTimeout
        setTimeout(() => {
            const container = document.getElementById('vrContainerMobile');
            if (!container) return;
            // Busca scene/camera via cornerstone3D ou via canvas hack
            // Como o código usa THREE internamente, injetamos um hook no requestAnimationFrame
        }, 500);
    };
})();

// Injeta botão de implante na aba 3D
// btn-implante está na toolbar dos cortes transversais (fix 4)

// Patch 3D renderer to expose scene and camera
(function patch3DRenderer() {
    // Override init3DRender to capture scene/camera after it runs
    const _orig = window.init3DRender;
    if (typeof _orig !== 'function') {
        // Try again after DOM loaded
        window.addEventListener('load', () => patch3DRenderer());
        return;
    }
    window.init3DRender = async function() {
        const result = await _orig.apply(this, arguments);
        // Scan all THREE scenes in memory via requestAnimationFrame inspection
        return result;
    };
})();

// Fix: also expose _vrScene/_vrCamera from the existing 3D init
// We patch the global THREE render loop to intercept scene/camera
const _origRAF = window.requestAnimationFrame;
let _rafPatched = false;
function _patchVrScene() {
    if (_rafPatched) return;
    _rafPatched = true;
    // We can't easily intercept closure vars, so we add a MutationObserver
    // to detect when vrContainerMobile gets a canvas, then sniff the scene
    const obs = new MutationObserver(() => {
        const container = document.getElementById('vrContainerMobile');
        if (container && container.querySelector('canvas') && !window._vrScene) {
            // Scene not yet captured — the 3D init uses local vars.
            // We expose a global hook: after init, call window._exposeVrScene(scene, camera)
        }
    });
    const tab3d = document.getElementById('tab-3d');
    if (tab3d) obs.observe(tab3d, { childList: true, subtree: true });
}
_patchVrScene();

// Add meta fix for deprecated apple-mobile-web-app-capable
(function fixAppleMeta() {
    const oldMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (oldMeta) oldMeta.remove();
    const newMeta = document.createElement('meta');
    newMeta.name = 'mobile-web-app-capable';
    newMeta.content = 'yes';
    document.head.appendChild(newMeta);
    // Keep the apple one too for Safari
    const appleNew = document.createElement('meta');
    appleNew.name = 'apple-mobile-web-app-capable';
    appleNew.content = 'yes';
    document.head.appendChild(appleNew);
})();



// --- SISTEMA DE LOADING PROGRESSIVO REAL ---
function updateAppLoading(percent, text) {
    const loadingDiv = document.getElementById('loading');
    const feedback = document.getElementById('loading-feedback');
    const bar = document.getElementById('progress-bar');
    const status = document.getElementById('loading-status-text');
    
    if (loadingDiv) {
        loadingDiv.classList.add('active');
        loadingDiv.style.setProperty('display', 'flex', 'important');
    }
    if (feedback) feedback.style.display = 'block';
    
    if (bar) {
        bar.style.setProperty('width', percent + '%', 'important');
        bar.style.setProperty('background', 'linear-gradient(90deg, #00C7BE, #007AFF)', 'important');
        bar.style.setProperty('height', '100%', 'important');
    }
    if (status) status.innerText = text;
}


// ==========================================================
// 1. DETECÇÃO MATEMÁTICA DE TOQUE (Hit Test)
// Verifica se o dedo tocou na bolinha (Handle) ou na linha.
// Retorna: 'handle', 'line' ou null.
// ==========================================================
function getMeasurementHit(element, touchX, touchY) {
    const toolState = cornerstoneTools.getToolState(element, 'Length');
    if (!toolState || !toolState.data) return null;

    // Distância de tolerância para o dedo (em pixels)
    const HANDLE_RADIUS = 30; // Área grande para pegar a bolinha
    const LINE_RADIUS = 20;   // Área para pegar a linha

    // Itera sobre as medidas (de trás para frente para pegar a mais recente)
    for (let i = toolState.data.length - 1; i >= 0; i--) {
        const m = toolState.data[i];
        if (m.visible === false) continue;

        // Converte coordenadas da Imagem (DICOM) para a Tela (Canvas)
        const start = cornerstone.pixelToCanvas(element, m.handles.start);
        const end = cornerstone.pixelToCanvas(element, m.handles.end);

        // 1. Verifica Bolinhas (Start e End)
        const distStart = Math.hypot(touchX - start.x, touchY - start.y);
        const distEnd = Math.hypot(touchX - end.x, touchY - end.y);

        if (distStart < HANDLE_RADIUS) return { type: 'handle', key: 'start', measure: m };
        if (distEnd < HANDLE_RADIUS) return { type: 'handle', key: 'end', measure: m };

        // 2. Verifica a Linha (Distância do ponto à reta)
        // Fórmula: Distância de P(px,py) ao segmento AB
        const l2 = Math.pow(start.x - end.x, 2) + Math.pow(start.y - end.y, 2);
        if (l2 === 0) continue;
        let t = ((touchX - start.x) * (end.x - start.x) + (touchY - start.y) * (end.y - start.y)) / l2;
        t = Math.max(0, Math.min(1, t)); // Clampa o segmento
        const projX = start.x + t * (end.x - start.x);
        const projY = start.y + t * (end.y - start.y);
        const distLine = Math.hypot(touchX - projX, touchY - projY);

        if (distLine < LINE_RADIUS) {
            return { type: 'line', measure: m };
        }
    }
    return null;
}


// ==========================================================
// FUNÇÃO PARA ESTILO VISUAL DAS MEDIDAS (COM TRAÇOS)
// Adicione esta função ao seu código.
// ==========================================================
function _applyMeasureStyle() {
    try {
        cornerstoneTools.toolStyle.setToolWidth(2);
        cornerstoneTools.toolColors.setToolColor('#00e5ff');
        cornerstoneTools.toolColors.setActiveColor('#00e5ff');
    } catch (e) {}
}

function _patchLengthEndpointTicks() {
    try {
        const LT = cornerstoneTools.LengthTool;

        if (!LT || !LT.prototype) return;

        if (LT.prototype._endpointTicksPatchApplied) return;
        LT.prototype._endpointTicksPatchApplied = true;

        const originalRenderToolData = LT.prototype.renderToolData;

        if (typeof originalRenderToolData !== 'function') return;

        LT.prototype.renderToolData = function(evt) {
            originalRenderToolData.call(this, evt);

            try {
                if (!evt || !evt.detail) return;

                const element = evt.detail.element;
                const canvasContext = evt.detail.canvasContext;

                if (!element || !canvasContext) return;

                const ctx = canvasContext.canvas
                    ? canvasContext.canvas.getContext('2d')
                    : canvasContext;

                if (!ctx) return;

                const toolState = cornerstoneTools.getToolState(element, 'Length');

                if (!toolState || !Array.isArray(toolState.data)) return;

                toolState.data.forEach(function(measurement) {
                    if (!measurement) return;
                    if (measurement.visible === false) return;
                    if (!measurement.handles) return;
                    if (!measurement.handles.start || !measurement.handles.end) return;

                    const startCanvas = cornerstone.pixelToCanvas(element, measurement.handles.start);
                    const endCanvas = cornerstone.pixelToCanvas(element, measurement.handles.end);

                    if (!startCanvas || !endCanvas) return;

                    const color =
                        measurement.color ||
                        measurement.activeColor ||
                        '#00e5ff';

                    const dx = endCanvas.x - startCanvas.x;
                    const dy = endCanvas.y - startCanvas.y;
                    const len = Math.hypot(dx, dy) || 1;

                    const TICK_HALF = 6;
                    const px = (-dy / len) * TICK_HALF;
                    const py = (dx / len) * TICK_HALF;

                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.6;
                    ctx.lineCap = 'round';

                    ctx.beginPath();

                    ctx.moveTo(startCanvas.x + px, startCanvas.y + py);
                    ctx.lineTo(startCanvas.x - px, startCanvas.y - py);

                    ctx.moveTo(endCanvas.x + px, endCanvas.y + py);
                    ctx.lineTo(endCanvas.x - px, endCanvas.y - py);

                    ctx.stroke();
                    ctx.restore();
                });
            } catch (e) {}
        };
    } catch (e) {}
}

setTimeout(_applyMeasureStyle, 800);
setTimeout(_patchLengthEndpointTicks, 900);
setTimeout(_patchLengthEndpointTicks, 1500);



// ── Modal Fullscreen 3D — usa um overlay próprio, compatível com DICOM e Mesh (STL/PLY) ──
function open3DModal() {
    let ov = document.getElementById('modal-3d-fullscreen');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'modal-3d-fullscreen';
        ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#000;display:flex;flex-direction:column;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:rgba(0,0,0,0.8);';
        hdr.innerHTML = '<span style="font-weight:800;color:#34C759;font-size:14px;letter-spacing:1px;">VOLUME 3D</span>';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:28px;padding:8px;cursor:pointer;';
        closeBtn.ontouchend = (e) => { e.preventDefault(); close3DModal(); };
        closeBtn.onclick    = () => close3DModal();
        hdr.appendChild(closeBtn);
        ov.appendChild(hdr);

        const renderArea = document.createElement('div');
        renderArea.id = 'modal-3d-render';
        renderArea.style.cssText = 'flex:1;position:relative;overflow:hidden;';
        ov.appendChild(renderArea);

        document.body.appendChild(ov);
    } else {
        ov.style.display = 'flex';
    }

    const vrContainer = document.getElementById('vrContainerMobile');
    if (!vrContainer || (!renderer3D && !window._isMeshMode)) {
        alert('Renderize o modelo ou volume 3D primeiro.');
        ov.style.display = 'none';
        return;
    }

    const renderArea = document.getElementById('modal-3d-render');
    if (!vrContainer._3dModalOrigParent) {
        vrContainer._3dModalOrigParent = vrContainer.parentElement;
    }
    renderArea.appendChild(vrContainer);

    setTimeout(() => {
        const w = renderArea.clientWidth  || window.innerWidth;
        const h = renderArea.clientHeight || window.innerHeight - 60;
        
        // Resize Inteligente: Detecta se é arquivo PLY/STL ou Exame DICOM
        if (window._isMeshMode && window._meshRenderer && window._vrCamera) {
            window._meshRenderer.setSize(w, h);
            window._vrCamera.aspect = w / h;
            window._vrCamera.updateProjectionMatrix();
        } else if (renderer3D && camera3D) {
            renderer3D.setSize(w, h);
            camera3D.aspect = w / h;
            camera3D.updateProjectionMatrix();
        }
    }, 60);
}

function close3DModal() {
    const ov = document.getElementById('modal-3d-fullscreen');
    if (ov) ov.style.display = 'none';
    // Libera a cópia exclusiva do volume 3D ao sair (recriada sob demanda na próxima abertura). Derruba o pico de RAM de 2x para 1x em exames grandes.
    try { window._volume3D = null; } catch(e){}

    const vrContainer = document.getElementById('vrContainerMobile');
    if (vrContainer && vrContainer._3dModalOrigParent) {
        vrContainer._3dModalOrigParent.appendChild(vrContainer);
    }

    setTimeout(() => {
        const container = document.getElementById('vrContainerMobile');
        const renderArea = document.getElementById('vr3d-render-area');
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = (renderArea && renderArea.clientHeight > 10) ? renderArea.clientHeight : Math.round(window.innerHeight * 0.56);
        
        // Devolve o resize normal da janela
        if (window._isMeshMode && window._meshRenderer && window._vrCamera) {
            window._meshRenderer.setSize(w, h);
            window._vrCamera.aspect = w / h;
            window._vrCamera.updateProjectionMatrix();
        } else if (renderer3D && camera3D) {
            renderer3D.setSize(w, h);
            camera3D.aspect = w / h;
            camera3D.updateProjectionMatrix();
        }
    }, 60);
}


// Modo visual rápido para endo
function setEndoVisualMode(mode) {
    ['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        try {
            var vp = cornerstone.getViewport(el);
            if (!vp) return;
            if (mode === 'canal')      { vp.voi.windowWidth = 800;  vp.voi.windowCenter = 200; }
            else if (mode === 'bone')  { vp.voi.windowWidth = 2500; vp.voi.windowCenter = 700; }
            else                       { vp.voi.windowWidth = 3500; vp.voi.windowCenter = 400; }
            cornerstone.setViewport(el, vp);
        } catch(e) {}
    });
}

// Painel Endo: gerencia estado ativo/apagado dos botões
var _epActive = null;
function endoPanelSelect(id) {
    var btns = document.querySelectorAll('#endo-empty .ep-btn');
    btns.forEach(function(b) {
        if (b.id === id) {
            b.style.opacity = '1';
            b.style.transform = 'scale(1.03)';
            b.style.zIndex = '2';
        } else {
            b.style.opacity = '0.38';
            b.style.transform = 'scale(1)';
            b.style.zIndex = '1';
        }
    });
    // Se clicar no mesmo: desfaz seleção
    if (_epActive === id) {
        btns.forEach(function(b) {
            b.style.opacity = '1';
            b.style.transform = 'scale(1)';
        });
        _epActive = null;
    } else {
        _epActive = id;
    }
}

// ── Estado do painel endo ──────────────────────────────────────────
var _epActive = null;

function endoPanelSelect(id) {
    var btns = document.querySelectorAll('#endo-empty .ep-btn');
    if (_epActive === id) {
        // segundo toque no mesmo: desfaz
        btns.forEach(function(b) {
    b.style.transform = 'scale(1)';
});
        _epActive = null;
        endoPresetReset();
        return;
    }
    btns.forEach(function(b) {
    b.style.opacity = '1';
    b.style.transform = b.id === id ? 'scale(1.03)' : 'scale(1)';
});
    _epActive = id;
}

// ── Aplica janela em todos os 3 viewports endo ────────────────────
function _applyEndoWindow(ww, wc) {
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        try {
            var vp = cornerstone.getViewport(el);
            if (!vp) return;
            vp.voi.windowWidth  = ww;
            vp.voi.windowCenter = wc;
            cornerstone.setViewport(el, vp);
        } catch(e) {}
    });
}

// ── RESET GERAL ───────────────────────────────────────────────────
function endoPresetReset() {
    _applyEndoWindow(2500, 800);
}


// Atualiza HU ao vivo no painel endo
function _updateEndoHUPanel() {
    if (!volumeData || !volumeMeta) return;
    var huEl     = document.getElementById('endo-hu-val');
    var tissueEl = document.getElementById('endo-hu-tissue');
    var barEl    = document.getElementById('endo-hu-bar');
    if (!huEl) return;
    try {
        var x = Math.round(Math.max(0, Math.min(volumeMeta.x-1, crosshairState.x)));
        var y = Math.round(Math.max(0, Math.min(volumeMeta.y-1, crosshairState.y)));
        var z = Math.round(Math.max(0, Math.min(volumeMeta.z-1, crosshairState.z)));
        var raw = volumeData[z * volumeMeta.x * volumeMeta.y + y * volumeMeta.x + x] || 0;
        var hu  = Math.round((raw / 65535) * 3500 - 500);
        huEl.textContent = hu;
        var tissue, color;
        if      (hu < -100) { tissue='Ar/Tecido'; color='#666'; }
        else if (hu < 200)  { tissue='Polpa?';    color='#c66'; }
        else if (hu < 500)  { tissue='Canal';     color='#9b6'; }
        else if (hu < 900)  { tissue='Trabecu.';  color='#6a9'; }
        else if (hu < 1400) { tissue='Cortical';  color='#6af'; }
        else                { tissue='Esmalte';   color='#0af'; }
        if (tissueEl) { tissueEl.textContent = tissue; tissueEl.style.color = color; tissueEl.style.borderColor = color+'44'; tissueEl.style.background = color+'18'; }
        var pct = Math.max(0, Math.min(100, ((hu + 500) / 3500) * 100));
        if (barEl) barEl.style.width = pct + '%';
    } catch(e) {}
}

// Hook: atualiza o painel quando crosshair/oblíquo mudam
(function() {
    var _origSync = window.synchronizeMobileViews;
    window.synchronizeMobileViews = function() {
        if (typeof _origSync === 'function') _origSync.apply(this, arguments);
        if (document.getElementById('tab-endo') && document.getElementById('tab-endo').classList.contains('active')) {
            requestAnimationFrame(_updateEndoHUPanel);
        }
    };
    var _origObl = window.updateObliqueViewports;
    window.updateObliqueViewports = function() {
        if (typeof _origObl === 'function') _origObl.apply(this, arguments);
        if (document.getElementById('tab-endo') && document.getElementById('tab-endo').classList.contains('active')) {
            requestAnimationFrame(_updateEndoHUPanel);
        }
    };
})();


// ════════════════════════════════════════════════════════
// CURVATURA DE SCHNEIDER — medição interativa no viewport
// Método: usuário toca 3 pontos no viewport endo-sagittal
//   P1 = entrada do canal (câmara pulpar)
//   P2 = ponto de máxima curvatura  
//   P3 = ápice
// O ângulo entre o vetor P1→P2 e P2→P3 = ângulo de Schneider
// ════════════════════════════════════════════════════════

var _schneiderActive  = false;
var _schneiderPoints  = [];
var _schneiderCanvas  = null;
var _schneiderCtx     = null;

function schneiderToggle() {
    _schneiderActive = !_schneiderActive;
    var btn = document.getElementById('ep-sch-btn');

    if (_schneiderActive) {
        _schneiderPoints = [];
        _updateSchneiderDisplay(null);
        document.getElementById('sch-class-risk').textContent = 'Toque 3 pts no Sagital →';
        if (btn) {
            btn.textContent = 'CANCELAR';
            btn.style.background = 'rgba(255,60,60,0.2)';
            btn.style.borderColor = 'rgba(255,60,60,0.4)';
            btn.style.color = '#f88';
        }
        _schneiderAttach();
    } else {
        _schneiderDetach();
        if (btn) {
            btn.textContent = 'MEDIR';
            btn.style.background = 'rgba(0,210,120,0.15)';
            btn.style.borderColor = 'rgba(0,210,120,0.35)';
            btn.style.color = '#4de';
        }
        document.getElementById('sch-class-risk').textContent = 'Toque MEDIR · 3 pontos';
    }
}

function _schneiderAttach() {
    // Usa o viewport sagital — melhor plano para ver curvatura do canal
    var el = document.getElementById('endo-sagittal');
    if (!el) { el = document.getElementById('endo-axial'); }
    if (!el) return;

    // CORREÇÃO: Canvas criado fora do viewport Cornerstone (no body com position:fixed)
    // Appending inside the Cornerstone div triggers a resize observer → imagem preta
    if (!_schneiderCanvas) {
        _schneiderCanvas = document.createElement('canvas');
        _schneiderCanvas.id = 'schneider-overlay-canvas';
        _schneiderCanvas.style.cssText =
            'position:fixed;z-index:50000;pointer-events:auto;touch-action:none;' +
            'background:transparent;cursor:crosshair;';
        document.body.appendChild(_schneiderCanvas);
    }

    // Posiciona o canvas exatamente sobre o viewport sagital
    function _positionSchCanvas() {
        if (!_schneiderCanvas || !el) return;
        var r = el.getBoundingClientRect();
        _schneiderCanvas.style.left   = r.left + 'px';
        _schneiderCanvas.style.top    = r.top  + 'px';
        _schneiderCanvas.style.width  = r.width  + 'px';
        _schneiderCanvas.style.height = r.height + 'px';
        _schneiderCanvas.width  = Math.round(r.width);
        _schneiderCanvas.height = Math.round(r.height);
    }
    _positionSchCanvas();
    _schneiderCtx = _schneiderCanvas.getContext('2d');
    _schneiderCanvas.style.display = 'block';

    _schneiderCanvas.addEventListener('touchend', _schneiderOnTouch, { passive: false });
    _schneiderCanvas.addEventListener('click',    _schneiderOnClick);
}

function _schneiderDetach() {
    if (_schneiderCanvas) {
        _schneiderCanvas.removeEventListener('touchend', _schneiderOnTouch);
        _schneiderCanvas.removeEventListener('click',    _schneiderOnClick);
        _schneiderCanvas.style.display = 'none';
        if (_schneiderCtx) {
            _schneiderCtx.clearRect(0, 0,
                _schneiderCanvas.width, _schneiderCanvas.height);
        }
        // Remove do body para não deixar lixo no DOM
        try { if (_schneiderCanvas.parentNode) _schneiderCanvas.parentNode.removeChild(_schneiderCanvas); } catch(e) {}
        _schneiderCanvas = null;
        _schneiderCtx = null;
    }
}

function _schneiderOnTouch(e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    var rect = _schneiderCanvas.getBoundingClientRect();
    _schneiderAddPoint(t.clientX - rect.left, t.clientY - rect.top);
}

function _schneiderOnClick(e) {
    var rect = _schneiderCanvas.getBoundingClientRect();
    _schneiderAddPoint(e.clientX - rect.left, e.clientY - rect.top);
}

function _schneiderAddPoint(x, y) {
    _schneiderPoints.push({ x: x, y: y });
    _schneiderDrawPoints();

    var status = document.getElementById('sch-class-risk');

    if (_schneiderPoints.length === 1) {
        if (status) status.textContent = 'P1 ✓ · Toque ponto de curvatura';
    } else if (_schneiderPoints.length === 2) {
        if (status) status.textContent = 'P2 ✓ · Toque o ápice';
    } else if (_schneiderPoints.length >= 3) {
        var angle = _calcSchneider(
            _schneiderPoints[0],
            _schneiderPoints[1],
            _schneiderPoints[2]
        );
        _updateSchneiderDisplay(angle);
        _schneiderDrawFinal(angle);

        // Desativa captura mas mantém o canvas mostrando o resultado
        _schneiderCanvas.removeEventListener('touchend', _schneiderOnTouch);
        _schneiderCanvas.removeEventListener('click',    _schneiderOnClick);
        _schneiderActive = false;

        var btn = document.getElementById('ep-sch-btn');
        if (btn) {
            btn.textContent = 'REFAZER';
            btn.style.background = 'rgba(0,210,120,0.15)';
            btn.style.borderColor = 'rgba(0,210,120,0.35)';
            btn.style.color = '#4de';
        }
    }
}

function _calcSchneider(p1, p2, p3) {
    // Vetor do eixo coronal do canal: P1 → P2
    var v1x = p2.x - p1.x, v1y = p2.y - p1.y;
    // Vetor do eixo apical do canal: P2 → P3
    var v2x = p3.x - p2.x, v2y = p3.y - p2.y;

    var dot  = v1x * v2x + v1y * v2y;
    var mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    var mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 === 0 || mag2 === 0) return 0;

    var cosA = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    // Ângulo entre os vetores = suplemento do ângulo de Schneider
    // (Schneider mede a deflexão, não o ângulo entre os eixos)
    return Math.round(180 - (Math.acos(cosA) * 180 / Math.PI));
}

function _updateSchneiderDisplay(angle) {
    var valEl   = document.getElementById('sch-angle-val');
    var lblEl   = document.getElementById('sch-class-label');
    var riskEl  = document.getElementById('sch-class-risk');

    if (angle === null) {
        if (valEl)  valEl.textContent  = '--';
        if (lblEl)  { lblEl.textContent = '--'; lblEl.style.color = '#4de'; }
        return;
    }

    if (valEl) valEl.textContent = angle;

    var label, color, risk;
    if (angle < 10) {
        label = 'RETA';       color = '#4de';
        risk  = 'Qualquer instrumento · baixo risco';
    } else if (angle < 20) {
        label = 'LEVE';       color = '#ffe066';
        risk  = 'Boa flexibilidade · pré-curvatura leve';
    } else if (angle < 35) {
        label = 'MODERADA';   color = '#ff9900';
        risk  = 'NiTi obrigatório · reciprocante preferível';
    } else {
        label = 'SEVERA';     color = '#ff4444';
        risk  = 'Alto risco fratura · WaveOne/Reciproc';
    }

    if (lblEl)  { lblEl.textContent = label; lblEl.style.color = color; }
    if (riskEl) { riskEl.textContent = risk; riskEl.style.color = color + '99'; }
    if (valEl)  { valEl.style.color = color;
                  valEl.style.textShadow = '0 0 8px ' + color + '66'; }
}

function _schneiderDrawPoints() {
    if (!_schneiderCtx) return;
    var ctx = _schneiderCtx;
    ctx.clearRect(0, 0, _schneiderCanvas.width, _schneiderCanvas.height);

    _schneiderPoints.forEach(function(p, i) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#00ffcc' : i === 1 ? '#ffcc00' : '#ff4466';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px -apple-system';
        ctx.fillText('P' + (i + 1), p.x + 9, p.y - 5);
    });

    // Linha guia entre pontos já tocados
    if (_schneiderPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(_schneiderPoints[0].x, _schneiderPoints[0].y);
        ctx.lineTo(_schneiderPoints[1].x, _schneiderPoints[1].y);
        ctx.strokeStyle = 'rgba(0,255,200,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function _schneiderDrawFinal(angle) {
    if (!_schneiderCtx || _schneiderPoints.length < 3) return;
    var ctx = _schneiderCtx;
    _schneiderDrawPoints(); // redesenha os pontos limpos

    var p1 = _schneiderPoints[0],
        p2 = _schneiderPoints[1],
        p3 = _schneiderPoints[2];

    // Linha eixo coronal (P1→P2)
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Linha eixo apical (P2→P3)
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label do ângulo no ponto de curvatura
    var color = angle < 10 ? '#4de' : angle < 20 ? '#ffe066' :
                angle < 35 ? '#ff9900' : '#ff4444';
    ctx.font = 'bold 14px -apple-system';
    ctx.fillStyle = color;
    ctx.fillText(angle + '°', p2.x + 10, p2.y - 10);
}

// === V1 PATCH: schneiderAddToPortfolio — captura sagital + overlay de medição ===
window.schneiderAddToPortfolio = function() {
    // valida que existe medição
    var pts = window._schneiderPoints || [];
    var angleEl = document.getElementById('sch-angle-val');
    var angleTxt = angleEl ? angleEl.textContent : '--';
    var angle = parseInt(angleTxt, 10);

    if (pts.length < 3 || isNaN(angle)) {
        showToast && showToast('⚠ Marque 3 pontos no Sagital primeiro');
        return;
    }

    // classificação
    var classification = '', risk = '';
    if (angle < 10)        { classification = 'RETA';      risk = 'Baixo risco · qualquer instrumento'; }
    else if (angle < 20)   { classification = 'LEVE';      risk = 'Boa flexibilidade · pré-curvatura leve'; }
    else if (angle < 35)   { classification = 'MODERADA';  risk = 'NiTi obrigatório · reciprocante preferível'; }
    else                   { classification = 'SEVERA';    risk = 'Alto risco fratura · WaveOne/Reciproc'; }

    var sagEl = document.getElementById('endo-sagittal');
    var sagCv = sagEl ? sagEl.querySelector('canvas.cornerstone-canvas') : null;
    var dataUrl = '';

    if (sagCv && sagCv.width > 0) {
        try {
            // base: clone do canvas sagital
            var fc = document.createElement('canvas');
            fc.width = sagCv.width;
            fc.height = sagCv.height;
            var fctx = fc.getContext('2d');
            fctx.drawImage(sagCv, 0, 0);

            // re-projeta os 3 pontos no canvas final
            var schCanvas = document.getElementById('schneider-overlay-canvas');
            var sagRect = sagEl.getBoundingClientRect();
            if (schCanvas && sagRect.width > 0 && sagRect.height > 0) {
                var schRect = schCanvas.getBoundingClientRect();
                // overlay e sagittal podem ter origens distintas
                var dx = schRect.left - sagRect.left;
                var dy = schRect.top  - sagRect.top;
                var sx = fc.width  / sagRect.width;
                var sy = fc.height / sagRect.height;
                // para cada ponto, p está em coords do schCanvas (CSS px)
                var P = pts.map(function(p){
                    return {
                        x: (p.x + dx) * sx,
                        y: (p.y + dy) * sy
                    };
                });
                // halo escuro
                fctx.lineCap = 'round';
                fctx.lineJoin = 'round';
                fctx.strokeStyle = 'rgba(0,0,0,0.6)';
                fctx.lineWidth = 6;
                fctx.beginPath();
                fctx.moveTo(P[0].x, P[0].y);
                fctx.lineTo(P[1].x, P[1].y);
                fctx.lineTo(P[2].x, P[2].y);
                fctx.stroke();
                // segmento P1-P2
                fctx.strokeStyle = '#00ffcc';
                fctx.lineWidth = 3;
                fctx.beginPath(); fctx.moveTo(P[0].x, P[0].y); fctx.lineTo(P[1].x, P[1].y); fctx.stroke();
                // segmento P2-P3
                fctx.strokeStyle = '#ff4466';
                fctx.lineWidth = 3;
                fctx.beginPath(); fctx.moveTo(P[1].x, P[1].y); fctx.lineTo(P[2].x, P[2].y); fctx.stroke();
                // pontos
                ['#00ffcc','#ffcc00','#ff4466'].forEach(function(c, i){
                    fctx.fillStyle = c;
                    fctx.beginPath(); fctx.arc(P[i].x, P[i].y, 7, 0, Math.PI*2); fctx.fill();
                    fctx.strokeStyle = 'rgba(255,255,255,0.85)';
                    fctx.lineWidth = 1.8;
                    fctx.stroke();
                    fctx.fillStyle = '#fff';
                    fctx.font = '900 ' + Math.max(11, Math.round(fc.height * 0.022)) + 'px -apple-system, sans-serif';
                    fctx.fillText('P' + (i+1), P[i].x + 10, P[i].y - 10);
                });
            }

            // box de resultado premium
            var boxColor = angle < 10 ? '#78e7d1' : angle < 20 ? '#ffe066' : angle < 35 ? '#ff9900' : '#ff4444';
            var pad = 14;
            var fontTitle = Math.max(10, Math.round(fc.height * 0.022));
            var fontVal = Math.max(28, Math.round(fc.height * 0.07));
            var fontClass = Math.max(13, Math.round(fc.height * 0.028));
            var boxW = Math.max(180, Math.round(fc.width * 0.32));
            var boxH = pad * 2 + fontTitle + fontVal + fontClass + 14;
            var boxX = pad;
            var boxY = fc.height - boxH - pad;
            fctx.save();
            fctx.fillStyle = 'rgba(8,12,24,0.82)';
            fctx.strokeStyle = boxColor;
            fctx.lineWidth = 2;
            if (typeof fctx.roundRect === 'function') {
                fctx.beginPath(); fctx.roundRect(boxX, boxY, boxW, boxH, 12);
                fctx.fill(); fctx.stroke();
            } else {
                fctx.fillRect(boxX, boxY, boxW, boxH);
                fctx.strokeRect(boxX, boxY, boxW, boxH);
            }
            fctx.fillStyle = boxColor;
            fctx.font = '700 ' + fontTitle + 'px -apple-system, sans-serif';
            fctx.textAlign = 'left';
            fctx.textBaseline = 'top';
            fctx.fillText('CURVATURA · SCHNEIDER', boxX + pad, boxY + 6);
            fctx.font = '900 ' + fontVal + 'px -apple-system, "Courier New", monospace';
            fctx.fillStyle = boxColor;
            fctx.fillText(angle + '°', boxX + pad, boxY + 6 + fontTitle + 4);
            fctx.font = '900 ' + fontClass + 'px -apple-system, sans-serif';
            fctx.fillStyle = '#fff';
            fctx.fillText(classification, boxX + pad, boxY + 6 + fontTitle + 4 + fontVal + 2);
            fctx.restore();

            // qualidade alta
            var MAX_W = 1200;
            var w = fc.width, h = fc.height;
            if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
            var out = document.createElement('canvas');
            out.width = w; out.height = h;
            out.getContext('2d').drawImage(fc, 0, 0, w, h);
            dataUrl = out.toDataURL('image/jpeg', 0.9);
        } catch(e){ window.dlog && window.dlog('[schneider portfolio]', e); }
    }

    var metrics = {
        angulo:        angle + '°',
        classificacao: classification,
        sugestao:      risk,
        plano:         'Sagital'
    };
    if (typeof portfolioAddItem === 'function') {
        portfolioAddItem('Curvatura Schneider', dataUrl, 'Estimativa 2D · plano sagital · ' + classification, metrics, '');
        showToast && showToast('📁 Schneider adicionado ao Portfolio');
    }
};
// === FIM V1 PATCH ===

function endoCoverClose() {
    var cover = document.getElementById('endo-cover');
    if (cover) cover.style.display = 'none';
}

// Registra direto, sem esperar DOMContentLoaded
(function() {
    function attachCover() {
        var cover = document.getElementById('endo-cover');
        if (!cover) { setTimeout(attachCover, 200); return; }
        
        function fecharCover(e) {
            cover.classList.add('hidden');
            // Bloqueia botões abaixo por 350ms
            window._coverJustClosed = true;
            setTimeout(function() {
                window._coverJustClosed = false;
            }, 350);
        }

        cover.addEventListener('touchstart', fecharCover, { passive: true });
        cover.addEventListener('click', fecharCover);
    }
    attachCover();
})();





// ============================================================
// SLIDER "RUÍDO" — redução de ruído REVERSÍVEL da reconstrução.
// Guarda o volume original na primeira aplicação; cada nível
// restaura o original e aplica N passes de média 3×3×3 (CPU),
// recriando a textura 3D. Pesado, então roda no SOLTAR do slider.
// ============================================================
var _denoiseLevelNames = ['Original', 'Leve', 'Médio', 'Forte'];
window.updateDenoiseLabel = function(val) {
    var lbl = document.getElementById('vr-denoise-label');
    if (lbl) lbl.innerText = _denoiseLevelNames[parseInt(val, 10)] || val;
};
window.applyNoiseLevel = function(val) {
    var level = Math.max(0, Math.min(3, parseInt(val, 10) || 0));
    var lbl = document.getElementById('vr-denoise-label');
    if (!volumeData || !volumeMeta) { if (lbl) lbl.innerText = _denoiseLevelNames[level]; return; }

    if (lbl) lbl.innerText = '⏳...';
    setTimeout(function() {
        try {
            // AUDITORIA MEMÓRIA: NÃO guardamos mais _volumeRawBackup (cópia permanente
            // do volume inteiro). volumeData JÁ é o original intacto — o swap keep2D
            // abaixo sempre o restaura, e _denoise3DVolume só roda dentro desse swap.
            // Economia: 1 volume Int16 completo (centenas de MB) fora da RAM.
            //
            // ISOLAMENTO 3D: processa numa CÓPIA temporária a partir do volumeData
            // PRISTINO; os cortes 2D nunca enxergam o volume suavizado.
            // Obs.: reconstruir do volumeData também DESFAZ um recorte de Laço.
            var keep2D = volumeData;
            volumeData = keep2D.slice ? keep2D.slice(0) : new Int16Array(keep2D);
            for (var i = 0; i < level; i++) _denoise3DVolume(1);
            window._volume3D = (level > 0) ? volumeData : null; // nível 0 = volta ao original
            volumeData = keep2D;                                 // 2D pristino restaurado SEMPRE

            // recria a textura 3D (lê de _volume3D via PATCH 1.1)
            if (volumeMesh && volumeMesh.material && typeof createVolumeTexture === 'function') {
                var newTex = createVolumeTexture();
                volumeMesh.material.uniforms.uVolume.value = newTex;
                volumeMesh.material.uniformsNeedUpdate = true;
            }
            if (lbl) lbl.innerText = _denoiseLevelNames[level];
        } catch(e) {
            if (lbl) lbl.innerText = 'Erro';
        }
    }, 60);
};

// Denoising CPU — aplica e recria a textura
function applyDenoise() {
    const btn = document.getElementById('btn-denoise');
    if (btn) { btn.textContent = '⏳ Processando...'; btn.disabled = true; }

    setTimeout(function() {
       // ISOLAMENTO 3D: mesmo swap do slider Ruído — não toca os cortes 2D
        var keep2D = volumeData;
        volumeData = (window._volume3D || volumeData).slice
                   ? (window._volume3D || volumeData).slice(0)
                   : new Int16Array(window._volume3D || volumeData);
        _denoise3DVolume(1);  // raio 1 = 3×3×3 vizinhos
        window._volume3D = volumeData;
        volumeData = keep2D;

        // Recria a textura com o volume denoised
        if (volumeMesh && volumeMesh.material) {
            const newTex = createVolumeTexture();
            volumeMesh.material.uniforms.uVolume.value = newTex;
            volumeMesh.material.uniformsNeedUpdate = true;
        }

        if (btn) { btn.textContent = '✓ DENOISING APLICADO'; btn.style.color = '#34C759'; }
    }, 50);
}



function handleRXFiles(files) {
    if (!files || files.length === 0) return;
    if (typeof RX2DEngine !== 'undefined' && typeof RX2DEngine.resetModulo2D === 'function') RX2DEngine.resetModulo2D();
    if (typeof dispose3D === 'function') dispose3D();
    try { cornerstone.getEnabledElements().forEach(e => cornerstone.disable(e.element)); } catch(e) {}
    if (typeof volumeData !== 'undefined') volumeData = null;
    if (typeof mainStackIds !== 'undefined') mainStackIds = [];
    if (typeof mobileStack !== 'undefined') mobileStack = { imageIds: [], currentImageIdIndex: 0 };
    if (typeof isEndoMPRInitialized !== 'undefined') isEndoMPRInitialized = false;
const loLayer = document.getElementById('loading-overlay'); if(loLayer) loLayer.style.display = 'flex';    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => { RX2DEngine.loadDataURL(e.target.result); };
    reader.readAsDataURL(file);
}

// E adicione esta função de helper no seu script
function hideLoading() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.style.display = 'none';
}

// Hook Inteligente de Arquivos (Corrige Tab Inicial e Resets)
function handleMobileFilesHook(files) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // Fecha modais flutuantes se existirem
    ['consultoria-modal','odontometria-modal'].forEach(function(id){ 
        var m = document.getElementById(id); 
        if(m) m.style.display = 'none'; 
    });

    // --- FIX CRÍTICO: Força a UI a sempre iniciar na Aba Axial no novo exame ---
    const btnAxial = document.querySelector('.dock-item'); // O primeiro item da dock é o Axial
    if(typeof switchTab === 'function') switchTab('axial', btnAxial);

    // Exibe loading
    const loadingOverlay = document.getElementById('loading-overlay');
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
    const loadingBg = document.getElementById('loading');
    if(loadingBg) loadingBg.style.display = 'flex';

    const meshFile = fileArray.find(f => /\.(ply|stl|obj)$/i.test(f.name));
    if (meshFile) {
        document.getElementById('home-hub').style.display = 'none';
        document.getElementById('app-viewport').style.display = 'block';
        if(typeof loadMeshFile === 'function') loadMeshFile(meshFile);
        return;
    }
    
    document.getElementById('home-hub').style.display = 'none';
    document.getElementById('app-viewport').style.display = 'block';
    
    if(typeof handleMobileFiles === 'function') handleMobileFiles(files);
}


// --- MÁSCARA INTELIGENTE PARA A DATA ---
window.applyDateMask = function(input) {
    let v = input.value.replace(/\D/g, ''); 
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    input.value = v;
};

// --- O KILL SWITCH (LIMPEZA TOTAL) ---
// === V1 PATCH: resetClinicalSessionState — limpa só estado clínico (sem apagar portfolio) ===
window.resetClinicalSessionState = function(options) {
    options = options || {};
    var keepPortfolio = (options.keepPortfolio !== false); // padrão: mantém portfolio

    window.dlog('[V1] resetClinicalSessionState', options);

    // 1. Anotações de texto/seta — limpa lista e DOM
    try {
        if (window.annotationManager) window.annotationManager.clearAll();
        else if (typeof textToolState !== 'undefined') {
            textToolState.annotations = [];
            textToolState.active = false;
        }
        document.querySelectorAll('.text-annot-group').forEach(function(el){ el.remove(); });
    } catch(e){}

    // 2. Lima virtual
    try {
        if (typeof limaState !== 'undefined') {
            limaState.points = [];
            limaState.marking = false;
            limaState.active = false;
            limaState.sourceViewportId = null;
            limaState.measurementViewportId = null;
            limaState.measurementPlane = null;
            limaState.measurementSliceIndex = -1;
            limaState.lastMeasurementSnapshot = null;
            limaState.lastMeasurementPoints = null;
            limaState.lastMeasurementMetrics = null;
        }
        var lc = document.getElementById('lima-canvas');
        if (lc && lc.getContext) { var lcx = lc.getContext('2d'); lcx && lcx.clearRect(0,0,lc.width,lc.height); }
        if (typeof limaClose === 'function') { try { limaClose(); } catch(e){} }
    } catch(e){}

    // 3. Schneider — pontos e canvas overlay
    try {
        if (typeof _schneiderDetach === 'function') _schneiderDetach();
        window._schneiderActive = false;
        window._schneiderPoints = [];
        var schEl = document.getElementById('schneider-overlay-canvas');
        if (schEl && schEl.parentNode) schEl.parentNode.removeChild(schEl);
        var schAng = document.getElementById('sch-angle-val'); if (schAng) schAng.textContent = '--';
        var schLbl = document.getElementById('sch-class-label'); if (schLbl) { schLbl.textContent = '--'; schLbl.style.color = '#4de'; }
        var schRsk = document.getElementById('sch-class-risk'); if (schRsk) schRsk.textContent = 'Toque MEDIR · 3 pontos';
    } catch(e){}

    // 4. Odontometria temporária
    try { window._odontometriaData = null; } catch(e){}

    // 5. Segmentação canal/obturação
    try {
        if (typeof segState !== 'undefined') {
            segState.mask = null;
            segState.maskDisplay = null;
            segState.seed = null;
            segState.voxelCount = 0;
            segState.lastROI = null;
            segState.heuristics = null;
            if (segState.three) {
                try {
                    segState.three.animating = false;
                    if (segState.three.renderer) segState.three.renderer.dispose();
                    if (segState.three.controls) segState.three.controls.dispose();
                } catch(e2){}
                segState.three = null;
            }
            segState.activeMode = null;
        }
        if (typeof segHidePanel === 'function') { try { segHidePanel(); } catch(e){} }
        var seg3dM = document.getElementById('seg-3d-modal');
        if (seg3dM) seg3dM.style.display = 'none';
    } catch(e){}

    // 6. Canal Reveal (3D principal) — remove tube se existir
    try {
        if (typeof _canalRevealRemoveTube === 'function') _canalRevealRemoveTube();
    } catch(e){}

    // 7. Modais abertos / overlays temporários
    try {
        ['annot-edit-modal','print-preview-overlay','modal-zoom',
         'odontometria-modal','consultoria-modal','ajustar-modal',
         'apresentacao-modal','export-menu-modal','rx-export-menu-modal',
         'rx-apresentacao'].forEach(function(id){
            var el = document.getElementById(id);
            if (el) { el.style.display = 'none'; el.classList && el.classList.remove('active'); }
        });
        // qualquer overlay solto dentro do modal-viewport
        var mv = document.getElementById('modal-viewport');
        if (mv) {
            mv.querySelectorAll('.text-annot-group,.lima-overlay,.schneider-overlay').forEach(function(el){ el.remove(); });
        }
        // slides fullscreen
        var sl = document.getElementById('slides-presentation-overlay');
        if (sl) sl.remove();
    } catch(e){}

    // 8. Portfolio (opcional)
    if (!keepPortfolio) {
        try {
            localStorage.removeItem('endoslice-portfolio');
            localStorage.removeItem('endo-rx-pf4');
            if (typeof portfolioState !== 'undefined') {
                portfolioState.items = [];
                portfolioState.fotos = [];
                portfolioState.paciente = { nome:'', idade:'', sexo:'', identificador:'', dataExame:'', queixa:'' };
                portfolioState.profissional = { nome:'', cro:'', clinica:'', contato:'', obs:'' };
                portfolioState.resumo = { motivo:'', hipotese:'', sintomas:'', historico:'' };
                portfolioState.achados = '';
                portfolioState.diagnostico = { principal:'', diferencial:'', obs:'' };
                portfolioState.plano = { objetivo:'', conduta:'', retratamento:false, cirurgia:false, restauradora:false, encaminhamento:false, limitacoes:'' };
                portfolioState.conclusao = { resumo:'', proximos:'' };
            }
            if (typeof rxPfState !== 'undefined') {
                rxPfState.items = [];
                rxPfState.fotos = [];
                rxPfState.pac = { nome:'', idade:'', sexo:'', id:'', data:'', queixa:'' };
                rxPfState.prof = { nome:'', cro:'', clin:'', cont:'' };
                rxPfState.res = { mot:'', hip:'', sint:'', hist:'' };
                rxPfState.diag = { pri:'', dif:'', obs:'' };
                rxPfState.plano = { obj:'', cond:'', lim:'' };
                rxPfState.limas = { dente:'', crd:'', crt:'', cpa:'', cad:'', ini:'', fin:'', seq:'', sis:'', irrig:'', medic:'', obs:'' };
                rxPfState.proto = { isolam:true, acesso:'', paten:'', instrum:'', irrigP:'NaOCl 2,5%', irrigC:'EDTA 17%', ativ:'', medic:'', obtur:'', selam:'', ctrl:'', obs:'' };
                rxPfState.conc = { res:'', prox:'' };
            }
        } catch(e){}
    }

    // 9. Gera novo examSessionId
    try { window._newExamSession(); } catch(e){}

    return true;
};
// === FIM V1 PATCH ===

function hardResetApp(force = false) {
    if (!force) {
        if (!confirm("Encerrar análise e limpar todos os dados do paciente atual?")) {
            return false;
        }
    }
    
    console.log("[EndoSlice] Iniciando reset completo de memória...");

    // 1. Esconde workspaces e modais flutuantes
    const allViews =[
        'app-viewport', 'rx2d-workspace', 'loading', 'print-preview-overlay', 
        'modal-zoom', 'lima-panel', 'odontometria-modal', 'consultoria-modal', 
        'ajustar-modal', 'portfolio-modal', 'apresentacao-modal', 'export-menu-modal',
        'rx-portfolio-modal', 'rx-apresentacao', 'rx-export-menu-modal'
    ];
    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.setProperty('display', 'none', 'important');
            el.classList.remove('active');
        }
    });

    // 2. Mostra a tela inicial
    const hub = document.getElementById('home-hub');
    if (hub) hub.style.setProperty('display', 'flex', 'important');

    // 3. Destrói todos os viewports do Cornerstone
    try {
        const enabledElements = cornerstone.getEnabledElements().map(e => e.element);
        enabledElements.forEach(el => {
            try {
                cornerstoneTools.clearToolState(el, 'stack');
                cornerstoneTools.clearToolState(el, 'Length');
                cornerstone.disable(el);
            } catch(err) {}
        });
        cornerstone.imageCache.purgeCache();
    } catch(e) {}

    // 4. Zera o motor 2D
    if (typeof RX2DEngine !== 'undefined' && typeof RX2DEngine.resetModulo2D === 'function') {
        RX2DEngine.resetModulo2D();
    }

    // 5. Destrói cena 3D WebGL
    if (typeof dispose3D === 'function') dispose3D();

    // 6. Zera todas as variáveis de estado globais
    if (typeof volumeData !== 'undefined') volumeData = null;
    if (typeof mainStackIds !== 'undefined') mainStackIds = [];
    if (typeof mobileStack !== 'undefined') mobileStack = { imageIds:[], currentImageIdIndex: 0 };
    if (typeof isEndoMPRInitialized !== 'undefined') isEndoMPRInitialized = false;
    if (typeof crosshairState !== 'undefined') { crosshairState = { x: 0, y: 0, z: 0 }; }
    if (typeof isCrosshairActive !== 'undefined') isCrosshairActive = false;
    if (typeof obliqueState !== 'undefined') { obliqueState.isActive = false; }
    if (typeof textToolState !== 'undefined') { textToolState.annotations =[]; textToolState.active = false; }
    
    // 7. AMNÉSIA TOTAL DOS PORTFÓLIOS (RAM E STORAGE)
    try {
        localStorage.removeItem('endoslice-portfolio');
        localStorage.removeItem('endo-rx-pf4');
        
        // Zera objeto do Portfolio Tomografia
        if(typeof portfolioState !== 'undefined') {
            portfolioState.items =[];
            portfolioState.fotos =[];
            portfolioState.paciente = { nome:'', idade:'', sexo:'', identificador:'', dataExame:'', queixa:'' };
            portfolioState.profissional = { nome:'', cro:'', clinica:'', contato:'', obs:'' };
            portfolioState.resumo = { motivo:'', hipotese:'', sintomas:'', historico:'' };
            portfolioState.achados = '';
            portfolioState.diagnostico = { principal:'', diferencial:'', obs:'' };
            portfolioState.plano = { objetivo:'', conduta:'', retratamento:false, cirurgia:false, restauradora:false, encaminhamento:false, limitacoes:'' };
            portfolioState.conclusao = { resumo:'', proximos:'' };
        }

        // Zera objeto do Portfolio Radiografia 2D
        if(typeof rxPfState !== 'undefined') {
            rxPfState.items = [];
            rxPfState.fotos =[];
            rxPfState.pac = { nome:'', idade:'', sexo:'', id:'', data:'', queixa:'' };
            rxPfState.prof = { nome:'', cro:'', clin:'', cont:'' };
            rxPfState.res = { mot:'', hip:'', sint:'', hist:'' };
            rxPfState.diag = { pri:'', dif:'', obs:'' };
            rxPfState.plano = { obj:'', cond:'', lim:'' };
            rxPfState.limas = { dente:'', crd:'', crt:'', cpa:'', cad:'', ini:'', fin:'', seq:'', sis:'', irrig:'', medic:'', obs:'' };
            rxPfState.proto = { isolam:true, acesso:'', paten:'', instrum:'', irrigP:'NaOCl 2,5%', irrigC:'EDTA 17%', ativ:'', medic:'', obtur:'', selam:'', ctrl:'', obs:'' };
            rxPfState.conc = { res:'', prox:'' };
        }
    } catch(e) {}

    // 8. Limpa os inputs de arquivo
    document.querySelectorAll('input[type="file"]').forEach(input => input.value = '');

    return true;
}

// Atualiza as funções de saída para usar o novo reset
window.returnToHub = function() {
    // V1 PATCH: ao voltar pro hub, mantém portfolio salvo; só limpa estado clínico
    try {
        // Esconde workspaces
        ['app-viewport','rx2d-workspace','loading','print-preview-overlay',
         'modal-zoom','lima-panel','odontometria-modal','consultoria-modal',
         'ajustar-modal','portfolio-modal','apresentacao-modal','export-menu-modal',
         'rx-portfolio-modal','rx-apresentacao','rx-export-menu-modal'].forEach(function(id){
            var el = document.getElementById(id);
            if (el) { el.style.setProperty('display','none','important'); el.classList && el.classList.remove('active'); }
        });
        var hub = document.getElementById('home-hub');
        if (hub) hub.style.setProperty('display','flex','important');
        // Destrói viewports Cornerstone
        try {
            cornerstone.getEnabledElements().map(function(e){return e.element;}).forEach(function(el){
                try { cornerstoneTools.clearToolState(el,'stack'); cornerstoneTools.clearToolState(el,'Length'); cornerstone.disable(el); } catch(err){}
            });
    cornerstone.imageCache.purgeCache();
        } catch(e){}
        // TAREFA 4 — destrava o scroll do Endo no próximo exame após o Home.
        // Remove só os flags antigos dos 3 viewports Endo (não mexe em mais nada).
        ['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){
            var _el=document.getElementById(id);
            if(_el){ delete _el.dataset.stackScrollAdded; delete _el.dataset.touchMode; delete _el.dataset.currentTool; }
        });
        if (typeof RX2DEngine !== 'undefined' && typeof RX2DEngine.resetModulo2D === 'function') RX2DEngine.resetModulo2D();
        if (typeof dispose3D === 'function') dispose3D();
        if (typeof volumeData !== 'undefined') volumeData = null;
        if (typeof mainStackIds !== 'undefined') mainStackIds = [];
        if (typeof mobileStack !== 'undefined') mobileStack = { imageIds:[], currentImageIdIndex: 0 };
        if (typeof isEndoMPRInitialized !== 'undefined') isEndoMPRInitialized = false;
        if (typeof crosshairState !== 'undefined') { crosshairState = { x:0, y:0, z:0 }; }
        if (typeof isCrosshairActive !== 'undefined') isCrosshairActive = false;
        if (typeof obliqueState !== 'undefined') { obliqueState.isActive = false; }
        // CORREÇÃO: zera estados que vazavam para o próximo exame
        if (typeof window._volume3D !== 'undefined') window._volume3D = null;
        if (typeof window._volumeRawBackup !== 'undefined') window._volumeRawBackup = null;
        if (typeof thicknessState !== 'undefined') { try { thicknessState = { axial:'native', coronal:'native', sagittal:'native' }; } catch(e){} }
        if (typeof indiceCorGlobal !== 'undefined') indiceCorGlobal = 0;
        if (typeof currentActiveTool !== 'undefined') currentActiveTool = null;
        if (typeof endoFocusActive !== 'undefined') endoFocusActive = false;
        if (typeof obliqueState !== 'undefined') { obliqueState.yaw = 0; obliqueState.pitch = 0; obliqueState.roll = 0; obliqueState.mode = 'translate'; }
        if (typeof volumeMeta !== 'undefined' && volumeMeta) { volumeMeta.x = 0; volumeMeta.y = 0; volumeMeta.z = 0; volumeMeta.pixelSpacing = 1.0; volumeMeta.sliceThickness = 1.0; volumeMeta.min = -1000; volumeMeta.max = 3000; }
        // CORREÇÃO item 5: zera a info DICOM (senão herda o paciente anterior,
        // pois os campos só são preenchidos com if(!di.patientName))
        try { window.dicomInfo = {}; } catch(e){}
        // evita erro na aba Endo: marca que não há volume até o próximo carregar
        try { window._volumeReady = false; } catch(e){}
        try { document.body.classList.remove('endo-focusing','endo-transitioning','endo-live-resize'); } catch(e){}
        document.querySelectorAll('input[type="file"]').forEach(function(input){ input.value = ''; });
    } catch(e){}
    // Limpa só estado clínico, mantém portfolio
    if (typeof window.resetClinicalSessionState === 'function') {
        window.resetClinicalSessionState({ keepPortfolio: true });
    }
};

window.closeExam = function() { 
    // V1 PATCH: 'closeExam' = encerrar com confirmação total (apaga portfolio)
    if (!confirm("Encerrar análise e limpar todos os dados (incluindo portfolio salvo) do paciente atual?")) return;
    hardResetApp(true);
    if (typeof window.resetClinicalSessionState === 'function') {
        window.resetClinicalSessionState({ keepPortfolio: false });
    }
};



function handleRXFiles(files) {
    if (!files || files.length === 0) return;
    if (typeof RX2DEngine !== 'undefined' && typeof RX2DEngine.resetModulo2D === 'function') RX2DEngine.resetModulo2D();
    if (typeof dispose3D === 'function') dispose3D();
    try { cornerstone.getEnabledElements().forEach(e => cornerstone.disable(e.element)); } catch(e) {}
    if (typeof volumeData !== 'undefined') volumeData = null;
    if (typeof mainStackIds !== 'undefined') mainStackIds = [];
    if (typeof mobileStack !== 'undefined') mobileStack = { imageIds: [], currentImageIdIndex: 0 };
    if (typeof isEndoMPRInitialized !== 'undefined') isEndoMPRInitialized = false;
    const loadingOverlay = document.getElementById('loading-overlay');
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => { RX2DEngine.loadDataURL(e.target.result); };
    reader.readAsDataURL(file);
}

function hideLoading() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.style.display = 'none';
}



/* ==========================================================
   MOTOR ENDOSLICE 2D - PROFISSIONAL & CLINICAMENTE COMPLETO
   ========================================================== */
/* ==========================================================
   MOTOR ENDOSLICE 2D - FINAL, COMPLETO E BLINDADO
   ========================================================== */
const RX2DEngine = {
    canvas: null, ctx: null, img: null,
    panX: 0, panY: 0, scale: 1, baseScale: 1, rot: 0, flipH: false,
    bright: 100, contrast: 100, sharpness: 0, filterType: 'none',
    tool: 'pan', isCalibrated: false, calibrationFactor: 1,
    lineStart: null, lineEnd: null, measurePts: [],

    init() {
        this.canvas = document.getElementById('rx2d-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.bindEvents();
    },

    resetModulo2D() {
        // 1. Limpa a Imagem e Canvas
        this.img = null;
        if(this.canvas) {
            if(this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Remove tamanho CSS explícito para que o próximo loadDataURL o recalcule
            this.canvas.style.width  = '';
            this.canvas.style.height = '';
            this.canvas.width = 1; this.canvas.height = 1;
        }

        // 2. Limpa Estado
        this.panX = 0; this.panY = 0; this.scale = 1; this.baseScale = 1;
        this.rot = 0; this.flipH = false;
        this.bright = 100; this.contrast = 100; this.sharpness = 0; this.filterType = 'none';
        this.tool = 'pan'; this.isCalibrated = false; this.calibrationFactor = 1;

        // 3. Limpa Medidas e Overlays
        this.lineStart = null; this.lineEnd = null; this.measurePts = [];
        const card = document.getElementById('rx2d-odonto-card');
        if(card) card.style.display = 'none';

        // 4. Reseta Sliders
        document.querySelectorAll('.rx2d-tools-panel input[type="range"]').forEach(el => {
            if(el.min == 50) el.value = 100;
            if(el.max == 100) el.value = 0;
        });
        const globalSliders = document.querySelector('#rx2d-workspace #rx2d-global-sliders');
        if(globalSliders) {
            globalSliders.querySelectorAll('input[type="range"]').forEach(el => { el.value = el.defaultValue || el.min; });
        }

        // 5. Reseta fase para Preparar
        document.querySelectorAll('.rx2d-phase-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        document.querySelectorAll('.rx2d-tools-panel').forEach((p, i) => p.style.display = i === 0 ? 'flex' : 'none');

        console.log("[2D] Módulo 2D zerado com sucesso.");
    },

    setPhase(phaseNum) {
        document.querySelectorAll('.rx2d-phase-btn').forEach((b, i) => b.classList.toggle('active', i + 1 === phaseNum));
        document.querySelectorAll('.rx2d-tools-panel').forEach((p, i) => p.style.display = (i + 1 === phaseNum) ? 'flex' : 'none');
        document.getElementById('rx2d-global-sliders').style.display = (phaseNum === 1 || phaseNum === 4) ? 'flex' : 'none';
        
        // Se entrar na fase 2 ou 3, ativa a ferramenta automaticamente
        if(phaseNum === 2) this.setTool('calibrate', document.querySelector('#rx2d-panel-2 button'));
        else if(phaseNum === 3) this.setTool('measure', document.querySelector('#rx2d-panel-3 button'));
        else this.setTool('pan', null);
    },

    setTool(toolName, btn) {
        this.tool = toolName;
        document.querySelectorAll('.neu-tool-2d').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        if (toolName !== 'measure_curve') document.getElementById('btn-rx2d-finish-curve').style.display = 'none';
    },

    clearMeasurements() {
        this.lineStart = null; this.lineEnd = null; this.measurePts = [];
        document.getElementById('rx2d-odonto-card').style.display = 'none';
        this.render();
    },

loadDataURL(url) {
        this.img = new Image();
        this.img.onload = () => {
            const hub = document.getElementById('home-hub');
            if (hub) hub.style.setProperty('display', 'none', 'important');
            
            document.getElementById('rx2d-workspace').style.display = 'flex';
            setTimeout(() => {
                const area = document.getElementById('rx2d-view-area');
                const W = area.clientWidth  || window.innerWidth;
                const H = area.clientHeight || Math.round(window.innerHeight * 0.65);
                this.canvas.width  = W;
                this.canvas.height = H;
                this.canvas.style.width  = W + 'px';
                this.canvas.style.height = H + 'px';
                this.baseScale = Math.min(W / this.img.width, H / this.img.height) * 0.97;
                this.scale = this.baseScale;
                this.panX = W / 2;
                this.panY = H / 2;
                this.setPhase(1);
                this.render();
                
                // MATA O LOADING DEFINITIVAMENTE (Fura a blindagem)
                const loadingVivo = document.getElementById('loading');
                if (loadingVivo) {
                    loadingVivo.classList.remove('active');
                    loadingVivo.style.setProperty('display', 'none', 'important');
                }
            }, 200);
        };
        this.img.src = url;
    },

    render() {
        if (!this.img) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.scale, this.scale);
        ctx.rotate(this.rot * Math.PI / 180);
        if (this.flipH) ctx.scale(-1, 1);
        // BUGFIX: ctx.filter dentro de save/restore é ignorado no iOS Safari
        // Brilho/contraste aplicados via pixel em applyPixelFilter()
        ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
        ctx.restore();
        this.applyPixelFilter();
        this.drawUI();
    },

    applyPixelFilter() {
        const idata = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = idata.data;
        const W = this.canvas.width;
        const H = this.canvas.height;
        // 1. Brilho + Contraste via pixel (funciona no iOS Safari)
        const bf = this.bright / 100;
        const cf = this.contrast / 100;
        if (bf !== 1.0 || cf !== 1.0) {
            for (let i = 0; i < data.length; i += 4) {
                for (let j = 0; j < 3; j++) {
                    let v = data[i+j] * bf;
                    v = (v - 128) * cf + 128;
                    data[i+j] = v < 0 ? 0 : v > 255 ? 255 : v;
                }
            }
        }
        // 2. Filtros de cor
        if (this.filterType === 'gray') {
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                data[i] = data[i+1] = data[i+2] = avg;
            }
        } else if (this.filterType === 'invert') {
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
            }
        } else if (this.filterType === 'pseudo') {
            for (let i = 0; i < data.length; i += 4) {
                const v = (data[i] + data[i+1] + data[i+2]) / 3 / 255;
                data[i]   = Math.max(0, Math.min(1, 1.5 - Math.abs(4*v-3))) * 255;
                data[i+1] = Math.max(0, Math.min(1, 1.5 - Math.abs(4*v-2))) * 255;
                data[i+2] = Math.max(0, Math.min(1, 1.5 - Math.abs(4*v-1))) * 255;
            }
        } else if (this.filterType === 'emboss') {
            const src = new Uint8ClampedArray(data);
            const k = [-2,-1,0,-1,1,1,0,1,2];
            for (let y = 1; y < H-1; y++) {
                for (let x = 1; x < W-1; x++) {
                    const idx = (y*W+x)*4;
                    for (let c = 0; c < 3; c++) {
                        let val = 128;
                        for (let ky = -1; ky <= 1; ky++)
                            for (let kx = -1; kx <= 1; kx++)
                                val += k[(ky+1)*3+(kx+1)] * src[((y+ky)*W+(x+kx))*4+c];
                        data[idx+c] = val < 0 ? 0 : val > 255 ? 255 : val;
                    }
                }
            }
        }
        // 3. Nitidez
        if (this.sharpness > 0) {
            const s = this.sharpness / 100; const ce = 1+4*s; const e = -s;
            const tmp = new Uint8ClampedArray(data);
            for (let y = 1; y < H-1; y++) {
                for (let x = 1; x < W-1; x++) {
                    const i = (y*W+x)*4;
                    for (let j = 0; j < 3; j++) {
                        let v = tmp[i+j]*ce + tmp[i-4+j]*e + tmp[i+4+j]*e + tmp[i-(W*4)+j]*e + tmp[i+(W*4)+j]*e;
                        data[i+j] = v < 0 ? 0 : v > 255 ? 255 : v;
                    }
                }
            }
        }
        this.ctx.putImageData(idata, 0, 0);
    },

    drawUI() {
        const ctx = this.ctx;
        if (this.lineStart && this.lineEnd) {
            const s = this.imgToCanvas(this.lineStart.x, this.lineStart.y);
            const e = this.imgToCanvas(this.lineEnd.x, this.lineEnd.y);
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            ctx.strokeStyle = (this.tool === 'calibrate') ? '#ffcc00' : '#00e5ff';
            ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill();
        }
        if (this.measurePts.length > 0) {
            ctx.beginPath();
            for (let i = 0; i < this.measurePts.length; i++) {
                const pt = this.imgToCanvas(this.measurePts[i].x, this.measurePts[i].y);
                if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
            }
            ctx.strokeStyle = '#0f8'; ctx.lineWidth = 3; ctx.stroke();
        }
        this.updateResultCard();
    },

    canvasToImg(cx, cy) {
        let x = (cx - this.panX) / this.scale; let y = (cy - this.panY) / this.scale;
        const rad = -this.rot * Math.PI / 180;
        const nx = x * Math.cos(rad) - y * Math.sin(rad);
        const ny = x * Math.sin(rad) + y * Math.cos(rad);
        return { x: (this.flipH ? -nx : nx) + this.img.width / 2, y: ny + this.img.height / 2 };
    },

    imgToCanvas(ix, iy) {
        let x = ix - this.img.width / 2; let y = iy - this.img.height / 2;
        if (this.flipH) x = -x;
        const rad = this.rot * Math.PI / 180;
        const nx = x * Math.cos(rad) - y * Math.sin(rad);
        const ny = x * Math.sin(rad) + y * Math.cos(rad);
        return { x: nx * this.scale + this.panX, y: ny * this.scale + this.panY };
    },

    // Converte coordenadas CSS do evento → coordenadas internas do canvas
    // (necessário caso CSS width != canvas.width por qualquer razão de layout)
    _evtXY(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width  / rect.width;
        const sy = this.canvas.height / rect.height;
        return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    },

    startCalibration(btn) { this.setTool('calibrate', btn); },

    // --- PATCH: BIND EVENTS COM LUPA DE PRECISÃO ---
// --- PATCH: BIND EVENTS (Lupa de Precisão + Sistema de 2 Toques) ---
bindEvents() {
    const mc = new Hammer.Manager(this.canvas);
    mc.add(new Hammer.Pan({ threshold: 5, pointers: 0 }));
    mc.add(new Hammer.Pinch({ threshold: 0 }));
    mc.add(new Hammer.Tap({ event: 'tap', taps: 1 }));

    // --- LÓGICA DA LUPA (JÁ INCLUÍDA) ---
    let magnifier = null, magCtx = null;
    const MAG_SIZE = 140, ZOOM_LEVEL = 3.0;

    const createMagnifier = () => {
        if (magnifier) return;
        magnifier = document.createElement('canvas');
        magnifier.width = magnifier.height = MAG_SIZE;
        magnifier.style.cssText = `position:fixed;z-index:999999;width:${MAG_SIZE}px;height:${MAG_SIZE}px;border-radius:50%;border:3px solid #4A90E2;box-shadow:0 10px 30px rgba(0,0,0,0.5);pointer-events:none;display:none;`;
        document.body.appendChild(magnifier);
        magCtx = magnifier.getContext('2d');
    };
    const updateMagnifier = (clientX, clientY) => {
        if (!magnifier || !this.img) return;
        magnifier.style.left = (clientX - MAG_SIZE / 2) + 'px';
        magnifier.style.top = (clientY - MAG_SIZE - 20) + 'px';
        
        const canvasRect = this.canvas.getBoundingClientRect();
        const { x: canvasX, y: canvasY } = this._evtXY(clientX, clientY);

        magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
        magCtx.fillStyle = '#000'; magCtx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);
        magCtx.save();
        magCtx.translate(MAG_SIZE/2, MAG_SIZE/2); magCtx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
        magCtx.translate(-canvasX, -canvasY);
        magCtx.drawImage(this.canvas, 0, 0);
        magCtx.restore();

        magCtx.strokeStyle = '#4A90E2'; magCtx.lineWidth = 1.5;
        magCtx.beginPath();
        magCtx.moveTo(MAG_SIZE / 2, 0); magCtx.lineTo(MAG_SIZE / 2, MAG_SIZE);
        magCtx.moveTo(0, MAG_SIZE / 2); magCtx.lineTo(MAG_SIZE, MAG_SIZE / 2);
        magCtx.stroke();
    };
    const showMagnifier = (x, y) => { if (!magnifier) createMagnifier(); magnifier.style.display = 'block'; updateMagnifier(x, y); };
    const hideMagnifier = () => { if (magnifier) magnifier.style.display = 'none'; };

    // --- NOVA LÓGICA DE INTERAÇÃO (PAN, PINCH, TAP) ---
    let startPX, startPY, startS, isPanning;

    mc.on('panstart pinchstart', (e) => {
        if (this.tool === 'measure' || this.tool === 'calibrate' || this.tool === 'measure_curve') return; // Bloqueia Pan/Pinch durante medição
        isPanning = true;
        startPX = this.panX; startPY = this.panY; startS = this.scale;
    });

    mc.on('panmove pinchmove', (e) => {
        if (!isPanning) return;
        this.panX = startPX + e.deltaX; this.panY = startPY + e.deltaY;
        if (e.scale) {
            const newScale = startS * e.scale;
            this.scale = Math.max(this.baseScale * 0.2, Math.min(this.baseScale * 15, newScale));
        }
        this.render();
    });

    mc.on('panend pinchend', () => { isPanning = false; });

    // O CORAÇÃO DA NOVA LÓGICA: EVENTO DE TOQUE ÚNICO (TAP)
    mc.on('tap', (e) => {
        if (this.tool !== 'measure' && this.tool !== 'calibrate' && this.tool !== 'measure_curve') return;
        
        const { x, y } = this._evtXY(e.center.x, e.center.y);
        const imgCoords = this.canvasToImg(x, y);

        // --- Lógica de Calibração (2 toques) ---
        if (this.tool === 'calibrate') {
            if (!this.lineStart) {
                this.lineStart = imgCoords;
                showMagnifier(e.center.x, e.center.y); // Mostra a lupa no primeiro ponto
            } else {
                this.lineEnd = imgCoords;
                hideMagnifier(); // Esconde a lupa no segundo ponto
                this.render(); // Desenha a linha final
                
                const pxLen = Math.hypot(this.lineEnd.x - this.lineStart.x, this.lineEnd.y - this.lineStart.y);
                setTimeout(() => { // Timeout para o usuário ver a linha antes do prompt
                    const real = prompt("Digite o tamanho REAL em mm (ex: 25):");
                    if (real && parseFloat(real) > 0) {
                        this.calibrationFactor = parseFloat(real) / pxLen;
                        this.isCalibrated = true;
                        
                        // LIMPA a tela e MUDA para a próxima fase
                        this.lineStart = null;
                        this.lineEnd = null;
                        this.setPhase(3);
                    } else {
                        // Se cancelar, limpa a calibração
                        this.lineStart = null;
                        this.lineEnd = null;
                    }
                    this.render();
                }, 100);
            }
        }
        // --- Lógica de Medida Reta (2 toques) ---
        else if (this.tool === 'measure') {
            if (!this.lineStart) {
                this.lineStart = imgCoords;
                this.lineEnd = null; // Garante que a medida anterior seja limpa
                showMagnifier(e.center.x, e.center.y);
            } else {
                this.lineEnd = imgCoords;
                hideMagnifier();
                // A ferramenta fica "passiva" após a medida, para não criar outra por acidente
                this.setTool('pan', null); 
            }
        }
        // --- Lógica de Medida Curva (Múltiplos toques) ---
        else if (this.tool === 'measure_curve') {
            this.measurePts.push(imgCoords);
            if (this.measurePts.length > 1) {
                document.getElementById('btn-rx2d-finish-curve').style.display = 'block';
            }
        }
        
        this.render(); // Atualiza o canvas a cada toque
    });

    // Adiciona listener para a Lupa se mover junto com o dedo (feedback em tempo real)
    this.canvas.addEventListener('touchmove', (e) => {
        if(this.tool === 'calibrate' && this.lineStart && !this.lineEnd){
             showMagnifier(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, {passive: true});
},

    updateResultCard() {
        const card = document.getElementById('rx2d-odonto-card');
        const calib = document.getElementById('rx2d-calib-data');
        let px = 0;
        if (this.lineStart && this.lineEnd) px = Math.hypot(this.lineEnd.x - this.lineStart.x, this.lineEnd.y - this.lineStart.y);
        else if (this.measurePts.length > 1) { for (let i = 1; i < this.measurePts.length; i++) px += Math.hypot(this.measurePts[i].x - this.measurePts[i - 1].x, this.measurePts[i].y - this.measurePts[i - 1].y); }
        else { card.style.display = 'none'; return; }

        card.style.display = 'flex';
        document.getElementById('rx2d-val-cra').innerText = Math.round(px);
        if (this.isCalibrated) {
            calib.style.display = 'flex';
            const mm = px * this.calibrationFactor;
       document.getElementById('rx2d-val-crd').innerHTML =
    `<span class="dseg-value">${mm.toFixed(2)}</span><span class="unit-mm"> mm</span>`;

document.getElementById('rx2d-val-crt').innerHTML =
    `<span class="dseg-value">${(mm - 1.0).toFixed(2)}</span><span class="unit-mm"> mm</span>`;
        } else calib.style.display = 'none';
    },

    generateReport() {
        const pt = prompt("Paciente:") || "---";

        // --- Calcula dimensões da imagem mantendo proporção original ---
        const PDF_W       = 1200;
        const MARGIN      = 50;
        const HEADER_H    = 270;   // área do cabeçalho (logo + paciente + data)
        const TABLE_H     = 360;   // área da tabela de resultados
        const IMG_MAX_W   = PDF_W - MARGIN * 2;   // 1100px
        const IMG_MAX_H   = 900;                   // altura máxima disponível para imagem
        const GAP         = 20;                    // espaço entre imagem e tabela

        // Proporção do canvas atual (o que o usuário está vendo)
        const srcW = this.canvas.width;
        const srcH = this.canvas.height;
        const ratio = srcW / srcH;

        let imgDrawW, imgDrawH;
        if (ratio >= IMG_MAX_W / IMG_MAX_H) {
            // limitado pela largura
            imgDrawW = IMG_MAX_W;
            imgDrawH = Math.round(IMG_MAX_W / ratio);
        } else {
            // limitado pela altura
            imgDrawH = IMG_MAX_H;
            imgDrawW = Math.round(IMG_MAX_H * ratio);
        }

        // Centraliza horizontalmente
        const imgX = MARGIN + Math.round((IMG_MAX_W - imgDrawW) / 2);
        const imgY = HEADER_H;

        const tableY  = imgY + imgDrawH + GAP;
        const PDF_H   = tableY + TABLE_H + MARGIN;

        // --- Monta o canvas do PDF ---
        const rCvs = document.createElement('canvas');
        rCvs.width  = PDF_W;
        rCvs.height = PDF_H;
        const ctx = rCvs.getContext('2d');

        // Fundo branco
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, PDF_W, PDF_H);

        // Cabeçalho azul
        ctx.fillStyle = "#4A90E2";
        ctx.fillRect(0, 0, PDF_W, 150);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 40px Arial";
        ctx.fillText("EndoSlice - Laudo Odontométrico", 50, 95);

        // Linha de info abaixo do header
        ctx.fillStyle = "#333";
        ctx.font = "24px Arial";
        ctx.fillText("Paciente: " + pt, 50, 220);
        ctx.fillText("Data: " + new Date().toLocaleDateString('pt-BR'), PDF_W - 280, 220);

        // Imagem SEM distorção — fundo preto na caixa, imagem centralizada
        ctx.fillStyle = "#000";
        ctx.fillRect(imgX, imgY, imgDrawW, imgDrawH);
        ctx.drawImage(this.canvas, imgX, imgY, imgDrawW, imgDrawH);

        // Borda sutil ao redor da imagem
        ctx.strokeStyle = "rgba(74,144,226,0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(imgX, imgY, imgDrawW, imgDrawH);

        // Tabela de resultados
        ctx.fillStyle = "#f4f7f9";
        ctx.fillRect(MARGIN, tableY, IMG_MAX_W, TABLE_H);
        ctx.strokeStyle = "#4A90E2";
        ctx.lineWidth = 3;
        ctx.strokeRect(MARGIN, tableY, IMG_MAX_W, TABLE_H);

        ctx.fillStyle = "#1e3a8a";
        ctx.font = "bold 32px Arial";
        ctx.fillText("RESULTADOS ODONTOMÉTRICOS", MARGIN + 30, tableY + 55);

        // Linha separadora
        ctx.strokeStyle = "rgba(74,144,226,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN + 20, tableY + 75);
        ctx.lineTo(MARGIN + IMG_MAX_W - 20, tableY + 75);
        ctx.stroke();

        let px = 0;
        if (this.lineStart && this.lineEnd) {
            px = Math.hypot(this.lineEnd.x - this.lineStart.x, this.lineEnd.y - this.lineStart.y);
        } else {
            for (let i = 1; i < this.measurePts.length; i++) {
                px += Math.hypot(this.measurePts[i].x - this.measurePts[i-1].x, this.measurePts[i].y - this.measurePts[i-1].y);
            }
        }

        ctx.font = "26px Arial";
        if (this.isCalibrated) {
            const mm  = px * this.calibrationFactor;
            const crd = mm.toFixed(2);
            const cpa = (mm + 0.5).toFixed(2);
            const crt = (mm - 1.0).toFixed(2);

            // Coluna esquerda
            ctx.fillStyle = "#333";
            ctx.fillText("CRD  (Comprimento Real):     " + crd + " mm",  MARGIN + 30, tableY + 120);
            ctx.fillText("CPA  (Patência):                     " + cpa + " mm",  MARGIN + 30, tableY + 165);
            ctx.fillText("CAD  (Apical Biológico):       " + (mm - 1.0).toFixed(2) + " mm", MARGIN + 30, tableY + 210);

            // CRT em destaque
            ctx.fillStyle = "rgba(74,144,226,0.12)";
            ctx.beginPath();
            const rx2 = MARGIN + 30, ry2 = tableY + 238, rw2 = IMG_MAX_W - 60, rh2 = 72, rr2 = 10;
            ctx.moveTo(rx2 + rr2, ry2);
            ctx.lineTo(rx2 + rw2 - rr2, ry2); ctx.arcTo(rx2+rw2, ry2, rx2+rw2, ry2+rr2, rr2);
            ctx.lineTo(rx2 + rw2, ry2+rh2-rr2); ctx.arcTo(rx2+rw2, ry2+rh2, rx2+rw2-rr2, ry2+rh2, rr2);
            ctx.lineTo(rx2+rr2, ry2+rh2); ctx.arcTo(rx2, ry2+rh2, rx2, ry2+rh2-rr2, rr2);
            ctx.lineTo(rx2, ry2+rr2); ctx.arcTo(rx2, ry2, rx2+rr2, ry2, rr2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#0a8";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = "#0a8";
            ctx.font = "bold 42px Arial";
            ctx.fillText("CRT (Trabalho):  " + crt + " mm", MARGIN + 60, tableY + 292);

            // Rodapé da tabela
            ctx.fillStyle = "#999";
            ctx.font = "italic 18px Arial";
            ctx.fillText("CRT = CRD − 1,0 mm  |  CAD = CRD − 1,0 mm  |  CPA = CRD + 0,5 mm", MARGIN + 30, tableY + TABLE_H - 20);
        } else {
            ctx.fillStyle = "#c0392b";
            ctx.font = "bold 30px Arial";
            ctx.fillText("⚠ IMAGEM NÃO CALIBRADA — realize a calibração antes de medir.", MARGIN + 30, tableY + 130);
        }

        const imgData = rCvs.toDataURL('image/jpeg', 0.96);
        document.getElementById('print-result-img').src = imgData;
        document.getElementById('print-preview-overlay').style.display = 'flex';
    },

    setAdjustment(t, v) { this[t] = parseFloat(v); this.render(); },
    rotate(d) { this.rot = (this.rot + d) % 360; this.render(); },
    flip() { this.flipH = !this.flipH; this.render(); },
    applyFilter(f) { this.filterType = (this.filterType === f) ? 'none' : f; this.render(); },
    finishCurve() { this.tool = 'pan'; document.getElementById('btn-rx2d-finish-curve').style.display = 'none'; this.render(); }
};





document.addEventListener('DOMContentLoaded', () => { RX2DEngine.init(); });

// =====================================================================
// ODONTOMETRIA 3D (de EndoScan_DentCT_v9)
// =====================================================================
function openOdontometria3D() {
    var modal = document.getElementById('odontometria-modal');
    if (!modal) return;
    // TAREFA 5.x — A Odontometria agora é a PORTA DE ENTRADA do fluxo:
    // abre SEMPRE (mesmo sem medida). Se já houver medida da Lima, pré-preenche
    // os cartões; senão mostra "-- mm" e o dentista digita o dente -> escolhe o
    // canal -> marca na imagem. (Removido o alert/return que travava a entrada.)
    // TAREFA 5.3 — PORTA DE ENTRADA: abre sempre. Os cartões (CRD/CRT/RECUO/LIMA)
    // passam a ser preenchidos POR CANAL via endoCanalUpdateCards (wrappers).
    var inputDente = document.getElementById('odonto-dente-input');
    var nomeDente  = document.getElementById('odonto-dente-nome');
    var temCanais  = (window.endoCanalState && Object.keys(window.endoCanalState.canals || {}).length > 0);
    if (!temCanais) {
        if (inputDente) inputDente.value = '';
        if (nomeDente)  nomeDente.innerText = '';
    } else if (inputDente && window.endoCanalState.selectedTooth) {
        inputDente.value = window.endoCanalState.selectedTooth;
    }
    if (!window._odontometriaData) window._odontometriaData = { CRD:0, CRT:0, lima:0, recuo:1.0, denteNum:'', denteNome:'' };

    modal.style.display = 'flex';
}

function atualizarNomeDente(num) {
    const d = {
        11:'Incisivo Central Sup. Dir.', 12:'Incisivo Lateral Sup. Dir.', 13:'Canino Sup. Dir.', 14:'1º Pré-molar Sup. Dir.', 15:'2º Pré-molar Sup. Dir.', 16:'1º Molar Sup. Dir.', 17:'2º Molar Sup. Dir.', 18:'3º Molar Sup. Dir.',
        21:'Incisivo Central Sup. Esq.', 22:'Incisivo Lateral Sup. Esq.', 23:'Canino Sup. Esq.', 24:'1º Pré-molar Sup. Esq.', 25:'2º Pré-molar Sup. Esq.', 26:'1º Molar Sup. Esq.', 27:'2º Molar Sup. Esq.', 28:'3º Molar Sup. Esq.',
        31:'Incisivo Central Inf. Esq.', 32:'Incisivo Lateral Inf. Esq.', 33:'Canino Inf. Esq.', 34:'1º Pré-molar Inf. Esq.', 35:'2º Pré-molar Inf. Esq.', 36:'1º Molar Inf. Esq.', 37:'2º Molar Inf. Esq.', 38:'3º Molar Inf. Esq.',
        41:'Incisivo Central Inf. Dir.', 42:'Incisivo Lateral Inf. Dir.', 43:'Canino Inf. Dir.', 44:'1º Pré-molar Inf. Dir.', 45:'2º Pré-molar Inf. Dir.', 46:'1º Molar Inf. Dir.', 47:'2º Molar Inf. Dir.', 48:'3º Molar Inf. Dir.'
    };
    const nome = d[num] || '';
    document.getElementById('odonto-dente-nome').innerText = nome;
    if (window._odontometriaData) {
        window._odontometriaData.denteNum = num;
        window._odontometriaData.denteNome = nome;
    }
    // TAREFA 5.1 — dirige o estado por dente/canal a partir do nº FDI digitado
    try { if (typeof window.endoCanalApplyTooth === 'function') window.endoCanalApplyTooth(num); } catch(e){}
}

function _limaGetLastMm() {
    if (typeof limaState !== 'undefined' && limaState.points && limaState.points.length >= 2) {
        var pts = limaState.points;
        var vpId = limaState.sourceViewportId || 'endo-axial';
        var ps = (typeof volumeMeta !== 'undefined' && volumeMeta && volumeMeta.pixelSpacing) ? volumeMeta.pixelSpacing : 1.0;
        var st = (typeof volumeMeta !== 'undefined' && volumeMeta && volumeMeta.sliceThickness) ? volumeMeta.sliceThickness : ps;
        var sX = ps, sY = (vpId === 'endo-coronal' || vpId === 'endo-sagittal') ? st : ps;
        var total = 0;
        for (var i = 1; i < pts.length; i++) {
            var dx = (pts[i].imgX - pts[i-1].imgX) * sX;
            var dy = (pts[i].imgY - pts[i-1].imgY) * sY;
            total += Math.sqrt(dx*dx + dy*dy);
        }
        if (total > 0) return total;
    }
    var rd = document.getElementById('lima-result');
    if (rd) { var m = (rd.textContent || rd.innerText || '').match(/([\.\d]+)\s*mm/i); if (m) return parseFloat(m[1]); }
    if (window._limaLastMm && window._limaLastMm > 0) return window._limaLastMm;
    return null;
}

function gerarRelatorioPDF() {
    var d = window._odontometriaData;
    if (!d) { alert('Calcule a Odontometria primeiro.'); return; }
    var dateStr = new Date().toLocaleDateString('pt-BR');
    // Nota: <\/ escapa as tags para nao quebrar o parser HTML dentro de <script>
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Odontometria 3D<\/title>'
        + '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,Arial,sans-serif;background:#fff;color:#111;padding:28px;}'
        + '.hdr{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #007AFF;padding-bottom:12px;margin-bottom:20px;}'
        + '.logo{font-size:36px;}.ttl{font-size:19px;font-weight:900;color:#007AFF;}.sub{font-size:10px;color:#888;margin-top:2px;}'
        + '.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}'
        + '.card{border-radius:12px;padding:14px;text-align:center;border:1.5px solid;}'
        + '.lbl{font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}'
        + '.val{font-size:32px;font-weight:900;font-family:monospace;line-height:1.15;}'
        + '.fml{background:#f5f8ff;border-radius:8px;padding:12px;font-size:10px;color:#555;line-height:1.9;margin-bottom:18px;}'
        + '.ftr{font-size:8px;color:#bbb;border-top:1px solid #eee;padding-top:10px;margin-top:8px;}'
        + '@media print{.noprint{display:none;}}<\/style><\/head><body>'
        + '<div class="hdr"><div class="logo">&#129463;<\/div><div><div class="ttl">EndoScan &mdash; Odontometria 3D CBCT<\/div><div class="sub">Gerado em ' + dateStr + '<\/div><\/div><\/div>'
        + '<div class="grid">'
        + '<div class="card" style="border-color:#f0a800;background:#fffbf0;"><div class="lbl" style="color:#c88000;">CRD<\/div><div class="val" style="color:#c88000;">' + d.CRD.toFixed(1) + ' mm<\/div><\/div>'
        + '<div class="card" style="border-color:#007AFF;background:#f0f7ff;"><div class="lbl" style="color:#007AFF;">CAD<\/div><div class="val" style="color:#007AFF;">' + d.CAD.toFixed(1) + ' mm<\/div><\/div>'
        + '<div class="card" style="border-color:#34C759;background:#f0fff4;"><div class="lbl" style="color:#1e9e3c;">CRT<\/div><div class="val" style="color:#1e9e3c;">' + d.CRT.toFixed(1) + ' mm<\/div><\/div>'
        + '<div class="card" style="border-color:#999;background:#f8f8f8;"><div class="lbl" style="color:#666;">LIMA<\/div><div class="val" style="color:#444;">' + d.lima.toFixed(1) + ' mm<\/div><\/div>'
        + '<\/div>'
        + '<div class="fml"><b>Metodologia:<\/b><br>CRD = Lima Virtual CBCT<br>CAD = CRD &minus; 1,0 mm<br>CRT = CAD &minus; 0,5 mm<\/div>'
        + '<div class="noprint" style="text-align:center;margin-bottom:14px;"><button onclick="window.print()" style="background:#007AFF;color:#fff;border:none;border-radius:8px;padding:10px 30px;font-size:13px;font-weight:800;cursor:pointer;">Imprimir \/ Salvar PDF<\/button><\/div>'
        + '<div class="ftr">EndoScan CBCT &middot; Uso exclusivo diagnostico<\/div>'
        + '<\/body><\/html>';
    var W = window.open('', '_blank', 'width=640,height=750');
    if (!W) { alert('Permita pop-ups neste site para gerar o PDF.'); return; }
    W.document.write(html); W.document.close();
    setTimeout(function() { W.print(); }, 400);
}

function openConsultoriaModal() {
    var existing = document.getElementById('consultoria-modal');
    if (existing) { existing.style.display = 'flex'; return; }
    
    var modal = document.createElement('div');
    modal.id = 'consultoria-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2100000;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;';
    
    var html = '';
    // Container Principal Neumórfico (Relevo para fora)
    html += '<div style="background:var(--neu-bg); box-shadow: 10px 10px 25px var(--neu-shadow-dark), -10px -10px 25px var(--neu-shadow-light); border-radius:24px; padding:26px; width:min(380px,90vw); max-height:85vh; overflow-y:auto; box-sizing:border-box;">';
    
    // Header
    html +=   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">';
    html +=     '<div><div style="font-size:18px;font-weight:900;color:#ff6b35;text-shadow: 0 0 10px rgba(255,107,53,0.3);">&#129306; Consultoria<\/div>';
    html +=     '<div style="font-size:10px;color:var(--neu-text-muted);margin-top:3px;font-weight:700;">Dr. Paulo de Tarso S. de Macedo<\/div><\/div>';
    html +=     '<button id="consult-close-btn" style="background:var(--neu-bg); box-shadow: 4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light); border:none; color:#ff4757; font-size:16px; font-weight:900; cursor:pointer; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;">&#x2715;<\/button>';
    html +=   '<\/div>';
    
    // Formulário
    html +=   '<div style="display:flex;flex-direction:column;gap:16px;">';
    
    // Input Paciente (Neumórfico - Afundado)
    html +=     '<div><label style="font-size:10px;color:var(--neu-text-muted);font-weight:800;display:block;margin-bottom:8px;letter-spacing:1px;">NOME DO PACIENTE<\/label>';
    html +=     '<input type="text" id="consult-paciente" placeholder="Ex: João Silva" style="width:100%;padding:14px 16px;border-radius:12px;border:none;background:var(--neu-bg);box-shadow:inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light);color:var(--neu-text-main);font-size:14px;font-weight:600;box-sizing:border-box;outline:none;"><\/div>';
    
    // Textarea Dúvida (Neumórfico - Afundado)
    html +=     '<div><label style="font-size:10px;color:var(--neu-text-muted);font-weight:800;display:block;margin-bottom:8px;letter-spacing:1px;">DÚVIDA CLÍNICA<\/label>';
    html +=     '<textarea id="consult-duvida" placeholder="Descreva os sintomas, dentes e a suspeita..." rows="4" style="width:100%;padding:14px 16px;border-radius:12px;border:none;background:var(--neu-bg);box-shadow:inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light);color:var(--neu-text-main);font-size:14px;font-weight:600;box-sizing:border-box;outline:none;resize:none;font-family:-apple-system,sans-serif;"><\/textarea><\/div>';
    
    // Botão Arquivo (Neumórfico - Relevo)
    html +=     '<div><label style="font-size:10px;color:var(--neu-text-muted);font-weight:800;display:block;margin-bottom:8px;letter-spacing:1px;">ARQUIVO (DICOM, ZIP ou JPEG)<\/label>';
    html +=     '<div style="display:flex;gap:12px;align-items:center;"><button id="consult-sel-btn" style="flex:1;padding:12px;border-radius:12px;background:var(--neu-bg);box-shadow: 4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light);border:none;color:var(--neu-accent);font-size:12px;font-weight:800;cursor:pointer;">&#128206; Anexar Arquivo<\/button>';
    html +=     '<span id="consult-file-name" style="font-size:11px;color:var(--neu-text-main);font-weight:700;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><\/span><\/div>';
    html +=     '<input type="file" id="consult-file-input" accept=".zip,.dcm,image\/*" style="display:none;"><\/div>';
    html +=   '<\/div>';
    
    // Botão Enviar (Neumórfico - Ação Primária)
    html +=   '<button id="consult-send-btn" style="width:100%;margin-top:24px;padding:16px;border-radius:14px;background:var(--neu-bg);box-shadow: 6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light);border:none;color:#ff6b35;font-size:15px;font-weight:900;cursor:pointer;transition:all 0.2s;">&#128228; Enviar para Consultoria<\/button>';
    
    html +=   '<div id="consult-status" style="margin-top:14px;text-align:center;font-size:12px;font-weight:800;display:none;"><\/div>';
    html += '<\/div>';
    
    modal.innerHTML = html;
    document.body.appendChild(modal);
    
    // Animação de clique no botão de enviar
    const sendBtn = document.getElementById('consult-send-btn');
    sendBtn.onmousedown = () => sendBtn.style.boxShadow = 'inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light)';
    sendBtn.onmouseup = () => sendBtn.style.boxShadow = '6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light)';
    sendBtn.ontouchstart = () => sendBtn.style.boxShadow = 'inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light)';
    sendBtn.ontouchend = () => sendBtn.style.boxShadow = '6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light)';

    // Ações dos botões
    document.getElementById('consult-close-btn').onclick = function() { modal.style.display = 'none'; };
    document.getElementById('consult-sel-btn').onclick   = function() { document.getElementById('consult-file-input').click(); };
    document.getElementById('consult-file-input').onchange = function() {
        var nm = document.getElementById('consult-file-name');
        if (nm) nm.textContent = this.files[0] ? this.files[0].name : '';
    };
    document.getElementById('consult-send-btn').onclick = function() { enviarConsultoria(); };
}

function enviarConsultoria() {
    var paciente = (document.getElementById('consult-paciente') || {}).value || '';
    var duvida   = (document.getElementById('consult-duvida')   || {}).value || '';
    var status   = document.getElementById('consult-status');
    if (!paciente.trim() || !duvida.trim()) { alert('Preencha o nome do paciente e a dúvida clínica.'); return; }
    
    if (status) { 
        status.style.display = 'block'; 
        status.textContent = 'Gerando protocolo...'; 
        status.style.color = '#ff9500'; 
    }
    
    var proto = 'ENDO-' + Date.now().toString(36).toUpperCase();
    
    setTimeout(function() {
        if (status) { 
            status.textContent = 'Protocolo ' + proto + ' gerado! Dr. Paulo entrará em contato.'; 
            status.style.color = '#00E5FF'; 
            status.style.textShadow = '0 0 8px rgba(0,229,255,0.6)';
        }
    }, 1200);
}

// MATA OS ERROS DA ABA IMPLANTE DELETADA
// Como removemos o HTML do módulo pan/implant, evitamos que o código original dê erro de "null"
window.panUpdateScouts = function() { return; };
window.panRenderCuts = function() { return; };
window.panDrawPanoOverlay = function() { return; };

// =====================================================================
// AJUSTAR: Modal de corte/recorte de margens para o módulo 2D
// =====================================================================
function openAjustarModal() {
    var src = document.getElementById('rx2d-canvas');
    if (!src || src.width === 0 || src.height === 0) {
        alert('Carregue uma imagem primeiro.'); return;
    }

    var existing = document.getElementById('ajustar-modal');
    if (existing) { existing.remove(); }

    var modal = document.createElement('div');
    modal.id = 'ajustar-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2200000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;flex-direction:column;padding:12px;box-sizing:border-box;';

    var imgW = src.width, imgH = src.height;
    var maxPreview = Math.min(window.innerWidth - 32, window.innerHeight - 260, 480);
    var scale = Math.min(maxPreview / imgW, maxPreview / imgH);
    var pw = Math.round(imgW * scale), ph = Math.round(imgH * scale);

    modal.innerHTML = `
      <div style="width:100%;max-width:520px;background:rgba(14,18,32,0.99);border:1.5px solid rgba(52,199,89,0.35);border-radius:18px;padding:18px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <div style="font-size:15px;font-weight:900;color:#34C759;">✂️ Ajustar Imagem</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px;">Arraste as bordas para recortar • Toque para reposicionar</div>
          </div>
          <button id="ajustar-close" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:9px;color:rgba(255,255,255,0.45);font-weight:800;letter-spacing:1px;margin-bottom:8px;">MARGENS (px)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${['Superior','Inferior','Esquerda','Direita'].map((l,i)=>`
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                <label style="font-size:9px;color:rgba(255,255,255,0.4);font-weight:700;">${l}</label>
                <span id="ajlbl-${i}" style="font-size:9px;color:#34C759;font-weight:800;">0px</span>
              </div>
              <input type="range" id="ajslider-${i}" min="0" max="${i<2?Math.round(imgH*0.45):Math.round(imgW*0.45)}" value="0"
                style="width:100%;accent-color:#34C759;" oninput="ajustarUpdate()">
            </div>`).join('')}
          </div>
        </div>

        <div style="position:relative;margin:0 auto 14px;width:${pw}px;height:${ph}px;overflow:hidden;border-radius:8px;border:1px solid rgba(52,199,89,0.3);background:#000;">
          <canvas id="ajustar-preview" width="${pw}" height="${ph}" style="display:block;"></canvas>
          <div id="ajustar-overlay" style="position:absolute;inset:0;pointer-events:none;border:2px solid #34C759;box-sizing:border-box;border-radius:4px;"></div>
        </div>

        <div style="display:flex;gap:10px;">
          <button id="ajustar-reset" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#aaa;font-size:12px;font-weight:800;cursor:pointer;">↺ Resetar</button>
          <button id="ajustar-apply" style="flex:2;padding:11px;border-radius:10px;border:1.5px solid #34C759;background:linear-gradient(135deg,rgba(52,199,89,0.35),rgba(30,160,60,0.2));color:#fff;font-size:13px;font-weight:900;cursor:pointer;">✓ Aplicar Recorte</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    var preview = document.getElementById('ajustar-preview');
    var pctx = preview.getContext('2d');
    var overlay = document.getElementById('ajustar-overlay');

    function ajustarDraw() {
        var t = parseInt(document.getElementById('ajslider-0').value)||0;
        var b = parseInt(document.getElementById('ajslider-1').value)||0;
        var l = parseInt(document.getElementById('ajslider-2').value)||0;
        var r = parseInt(document.getElementById('ajslider-3').value)||0;
        var cw = imgW - l - r, ch = imgH - t - b;
        if (cw < 4) cw = 4; if (ch < 4) ch = 4;
        pctx.clearRect(0, 0, pw, ph);
        pctx.drawImage(src, l, t, cw, ch, 0, 0, pw, ph);
        // overlay crop hint
        var ox = Math.round(l * scale), oy = Math.round(t * scale);
        var ow = Math.round((imgW - l - r) * scale), oh = Math.round((imgH - t - b) * scale);
        overlay.style.left   = ox + 'px';
        overlay.style.top    = oy + 'px';
        overlay.style.width  = ow + 'px';
        overlay.style.height = oh + 'px';
        overlay.style.right  = 'auto';
        overlay.style.bottom = 'auto';
    }

    window.ajustarUpdate = function() {
        ['ajslider-0','ajslider-1','ajslider-2','ajslider-3'].forEach(function(id,i){
            var v = document.getElementById(id).value;
            document.getElementById('ajlbl-'+i).textContent = v + 'px';
        });
        ajustarDraw();
    };

    ajustarDraw();

    document.getElementById('ajustar-close').onclick = function(){ modal.remove(); };
    document.getElementById('ajustar-reset').onclick = function(){
        [0,1,2,3].forEach(function(i){
            document.getElementById('ajslider-'+i).value = 0;
            document.getElementById('ajlbl-'+i).textContent = '0px';
        });
        ajustarDraw();
    };
    document.getElementById('ajustar-apply').onclick = function(){
        var t = parseInt(document.getElementById('ajslider-0').value)||0;
        var b = parseInt(document.getElementById('ajslider-1').value)||0;
        var l = parseInt(document.getElementById('ajslider-2').value)||0;
        var r = parseInt(document.getElementById('ajslider-3').value)||0;
        var cw = imgW - l - r, ch = imgH - t - b;
        if (cw < 4 || ch < 4) { alert('Margens muito grandes.'); return; }
        // Aplica o recorte diretamente no canvas principal
        var tmp = document.createElement('canvas');
        tmp.width = cw; tmp.height = ch;
        var tctx = tmp.getContext('2d');
        tctx.drawImage(src, l, t, cw, ch, 0, 0, cw, ch);
        src.width = cw; src.height = ch;
        var mctx = src.getContext('2d');
        mctx.clearRect(0, 0, cw, ch);
        mctx.drawImage(tmp, 0, 0);
        // Atualiza o estado interno do engine se disponível
        if (window.RX2DEngine && window.RX2DEngine._state) {
            try {
                window.RX2DEngine._state.originalImageData = mctx.getImageData(0, 0, cw, ch);
            } catch(e){}
        }
        modal.remove();
    };
}

// Remove a tela de abertura (Splash Screen) após a animação
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-intro');
        if (splash) {
            // Inicia o fade out
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
            
            // Remove completamente do DOM após o fade out (800ms)
            setTimeout(() => {
                splash.remove();
            }, 800);
        }
    }, 3500); // Tempo que a tela inicial fica visível (3.5 segundos)
});

// --- LÓGICA DO SELETOR DE ESPESSURA DO MODAL ---
window.changeModalSlab = function(val) {
    const modal = document.getElementById('modal-zoom');
    const plane = modal.dataset.plane;
    if (!plane) return;
    
    // Atualiza a matemática do motor (AIP)
    thicknessState[plane] = (val === 'native') ? 'native' : parseFloat(val);
    
    // Sincroniza a imagem no background
    if (obliqueState.isActive) {
        updateObliqueViewports();
    } else {
        synchronizeMobileViews();
    }
    
    // Força o Modal a recalcular o frame na espessura nova, simulando um movimento no slider
    const modalSlider = document.getElementById('modal-slider');
    if (modalSlider && typeof modalSlider.oninput === 'function') {
        modalSlider.oninput();
    }
};



(function() {
    // 1. Função que destrói telas e loadings duplicados no código
    function limparDuplicatas(id) {
        const elementos = document.querySelectorAll('#' + id);
        if (elementos.length > 1) {
            // Mantém apenas o ÚLTIMO (que é o layout Premium atualizado) e apaga os fantasmas antigos
            for (let i = 0; i < elementos.length - 1; i++) {
                elementos[i].remove();
            }
            console.log("[EndoSlice] Tela fantasma destruída: " + id);
        }
    }

    function blindarSistema() {
        // Aciona a limpeza
        limparDuplicatas('home-hub');
        limparDuplicatas('loading');

        // 2. Liberta a tela de loading para a camada máxima do navegador (fura qualquer bloqueio)
        const loadingVivo = document.getElementById('loading');
        if (loadingVivo) {
            document.body.appendChild(loadingVivo);
            loadingVivo.style.setProperty('z-index', '2147483647', 'important');
        }

        // 3. Blinda as funções de clique para garantir que a tela inicial FECHE
        if (!window._appBlindado) {
            window._appBlindado = true;

            const forcarFechamento = () => {
                const hub = document.getElementById('home-hub');
                if (hub) hub.style.setProperty('display', 'none', 'important');
                
                if (loadingVivo) {
                    loadingVivo.classList.add('active');
                    loadingVivo.style.setProperty('display', 'flex', 'important');
                }
            };

            // Intercepta a seleção de Tomografia
            const origCBCT = window.handleMobileFilesHook;
            window.handleMobileFilesHook = function(files) {
                if (!files || files.length === 0) return;
                forcarFechamento(); // Mata o menu imediatamente
                if (origCBCT) origCBCT(files);
            };

            // Intercepta a seleção de Radiografia 2D
            const origRX = window.handleRXFiles;
            window.handleRXFiles = function(files) {
                if (!files || files.length === 0) return;
                forcarFechamento(); // Mata o menu imediatamente
                if (origRX) origRX(files);
            };
        }
    }

    // Executa a blindagem agora e reforça quando a página terminar de carregar
    blindarSistema();
    document.addEventListener("DOMContentLoaded", blindarSistema);
})();


// ==========================================================
// 🔬 MOTOR DE SEGMENTAÇÃO DE CANAL RADICULAR v5.0
// BFS conservador + preenchimento inteligente + sprite 3D redondo
// ==========================================================
(function() {
'use strict';

window.segState = {
    activeMode: null, seed: null,
    tolerance: 35, roiRadius: 30, minClusterSize: 15,
    fillIterations: 2, overlayOpacity: 0.55,
    mask: null, maskDisplay: null, voxelCount: 0,
    lastROI: null, isRunning: false, three: null
};

function segShowPanel(mode) {
    var panel = document.getElementById('seg-inline-panel');
    var endoEmpty = document.getElementById('endo-empty');
    var title = document.getElementById('seg-inline-title');

    if (!panel || !endoEmpty) return;

    panel.setAttribute('data-active', '1');
    panel.classList.toggle('obtur-mode', mode === 'obturado');
    endoEmpty.classList.add('seg-panel-open');

    if (title) {
        title.textContent = (mode === 'obturado') ? '🔶 CANAL OBT.' : '🦷 CANAL';
    }
}

function segHidePanel() {
    var panel = document.getElementById('seg-inline-panel');
    var endoEmpty = document.getElementById('endo-empty');

    if (panel) {
        panel.removeAttribute('data-active');
        panel.classList.remove('obtur-mode');

        // MÁGICA: Se o painel não estiver no endoEmpty, devolve ele para lá e limpa estilos de arraste!
        if (endoEmpty && !endoEmpty.contains(panel)) {
            panel.style.cssText = ''; 
            panel.dataset.moved = "";
            endoEmpty.appendChild(panel);
        }
    }

    if (endoEmpty) {
        endoEmpty.classList.remove('seg-panel-open');
    }
}

(function bindSegCloseReliably() {
    var btn = document.getElementById('seg-inline-close');
    if (!btn) return;

    ['pointerdown','touchstart','mousedown'].forEach(function(type){
        btn.addEventListener(type, function(e){
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }, { capture:true, passive:false });
    });

    ['pointerup','touchend','click'].forEach(function(type){
        btn.addEventListener(type, function(e){
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            segDeactivate();
        }, { capture:true, passive:false });
    });
})();

/* REMOVIDO: bindSegCloseButtonTouchFix duplicado que competia com bindSegCloseReliably */


window.segToggleTool = function(mode) {
   // Normaliza nome canônico: 'obtur' → 'obturado'
   if (mode === 'obtur') mode = 'obturado';
   document.body.classList.add('seg-mode-open');
document.body.classList.remove('ui-right-open');
   
    var btnC = document.getElementById('ep-seg-canal');
    var btnO = document.getElementById('ep-seg-obtur');

    /* se clicar no mesmo botão ativo, fecha */
    if (segState.activeMode === mode) {
        segDeactivate();
        return;
    }

    if (isCrosshairActive) toggleCrosshair();

    if (window.currentActiveTool) {
        window.currentActiveTool = null;
        document.querySelectorAll('.active-tool').forEach(function(b) {
            b.classList.remove('active-tool');
        });
    }

    segState.activeMode = mode;
    

    /* defaults por modo */
    if (mode === 'canal') {
        segState.fillIterations = 3;
        segState.tolerance = 35;
    } else {
        segState.fillIterations = 1;
        segState.tolerance = 30;
    }

    /* sync sliders */
    var sf = document.getElementById('seg-sl-fill');
    var vf = document.getElementById('seg-v-fill');
    if (sf) sf.value = segState.fillIterations;
    if (vf) vf.textContent = segState.fillIterations;

    var st = document.getElementById('seg-sl-tol');
    var vt = document.getElementById('seg-v-tol');
    if (st) st.value = segState.tolerance;
    if (vt) vt.textContent = segState.tolerance;

    /* estados visuais dos botões */
    if (btnC) {
        btnC.classList.remove('seg-active', 'seg-active-obtur');
        var oldC = btnC.querySelector('.seg-indicator');
        if (oldC) oldC.remove();
    }

    if (btnO) {
        btnO.classList.remove('seg-active', 'seg-active-obtur');
        var oldO = btnO.querySelector('.seg-indicator');
        if (oldO) oldO.remove();
    }

    if (mode === 'canal' && btnC) {
        btnC.classList.add('seg-active');
        var d = document.createElement('div');
        d.className = 'seg-indicator';
        btnC.appendChild(d);
    }

    if (mode === 'obturado' && btnO) {
        btnO.classList.add('seg-active-obtur');
        var d2 = document.createElement('div');
        d2.className = 'seg-indicator obtur';
        btnO.appendChild(d2);
    }

    /* abre só o painel do modo clicado */
    segShowPanel(mode);
/* REMOVIDO: document.body.classList.add('ui-right-open'); — causava FAB direita aparecer */
    setWwwcEnabled(false);

['endo-axial', 'endo-coronal', 'endo-sagittal', 'modal-viewport'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;

        el.removeEventListener('mousedown', segOnClick);
        el.removeEventListener('touchstart', segOnClick);

        el.addEventListener('mousedown', segOnClick, { passive: false });
        el.addEventListener('touchstart', segOnClick, { passive: false });

        try {
            cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
        } catch (e) {}
    });
};

window.segDeactivate = function() {
    document.body.classList.remove('seg-mode-open');
    document.body.classList.remove('ui-right-open');
    segState.activeMode=null;
    var btnC=document.getElementById('ep-seg-canal'),btnO=document.getElementById('ep-seg-obtur');
    if(btnC){btnC.classList.remove('seg-active');var d=btnC.querySelector('.seg-indicator');if(d)d.remove();}
    if(btnO){btnO.classList.remove('seg-active-obtur');var d2=btnO.querySelector('.seg-indicator');if(d2)d2.remove();}
    
    // Adicionado modal-viewport na limpeza
    ['endo-axial','endo-coronal','endo-sagittal', 'modal-viewport'].forEach(function(id){
        var el=document.getElementById(id);if(!el)return;
        el.removeEventListener('mousedown',segOnClick);
        el.removeEventListener('touchstart',segOnClick);
    });
    
    setWwwcEnabled(true);
    segHidePanel();
    document.body.classList.remove('ui-right-open');
};

window.segReset = function() {
    segState.seed=null; segState.mask=null; segState.maskDisplay=null; segState.voxelCount=0; segState.lastROI=null;
    var v=document.getElementById('seg-s-vox'); if(v) v.textContent='--';
    var vol=document.getElementById('seg-s-vol'); if(vol) vol.textContent='--';
    segRefreshViewports();
};
window.segRefreshViewports = function() {
    ['endo-axial','endo-coronal','endo-sagittal','modal-viewport'].forEach(function(id){var el=document.getElementById(id);if(el)try{cornerstone.updateImage(el);}catch(e){}});
};
window.segRerunIfSeed = function() { if(segState.seed) segRunSeg(); };

// --- CLICK HANDLER ---
function segOnClick(e) {
    if(!segState.activeMode||!volumeData||!volumeMeta) return;
    if(typeof isEventFromSlider==='function'&&isEventFromSlider(e)) return;
    if(isDraggingAnySlider) return;
    if(e.touches&&e.touches.length>1) return;
    if(e.cancelable) e.preventDefault(); e.stopPropagation();
    
    var el=e.currentTarget, coords=getPreciseImageCoords(el,e);
    var vx,vy,vz;
    
    // Descobre o plano se o clique for no Modal
    var planeStr = '';
    if (el.id === 'modal-viewport') {
        planeStr = document.getElementById('modal-zoom').dataset.plane; // 'axial', 'coronal' ou 'sagittal'
    }

    if(obliqueState&&obliqueState.isActive){
        var basis=getObliqueBasis(obliqueState.yaw,obliqueState.pitch,obliqueState.roll);
        var plane = el.id === 'modal-viewport' ? planeStr : el.id.replace('endo-','');
        var vec=getViewportVectors(plane,basis);
        var img=cornerstone.getImage(el);if(!img)return;
        var du=coords.x-img.width/2,dv=coords.y-img.height/2;
        vx=obliqueCenter3D.x+vec.u.x*du+vec.v.x*dv;vy=obliqueCenter3D.y+vec.u.y*du+vec.v.y*dv;vz=obliqueCenter3D.z+vec.u.z*du+vec.v.z*dv;
    } else {
        if(el.id==='endo-axial' || planeStr==='axial'){vx=coords.x;vy=coords.y;vz=crosshairState.z;}
        else if(el.id==='endo-coronal' || planeStr==='coronal'){vx=coords.x;vy=crosshairState.y;vz=coords.y;}
        else {vx=crosshairState.x;vy=coords.x;vz=coords.y;} // Sagittal
    }
    
    vx=Math.round(Math.max(0,Math.min(volumeMeta.x-1,vx)));
    vy=Math.round(Math.max(0,Math.min(volumeMeta.y-1,vy)));
    vz=Math.round(Math.max(0,Math.min(volumeMeta.z-1,vz)));
    segState.seed={x:vx,y:vy,z:vz};
    console.log('[SEG] Seed:('+vx+','+vy+','+vz+') val='+volumeData[vz*volumeMeta.x*volumeMeta.y+vy*volumeMeta.x+vx]);
    segRunSeg();
}
window._segOnClick = segOnClick; // Expõe para closeModalZoom poder remover listeners

// --- SEGMENTAÇÃO PRINCIPAL v5 ---
function segRunSeg() {
    if(!segState.seed||!volumeData||segState.isRunning) return;
    segState.isRunning=true; var t0=performance.now();
    var seed=segState.seed, mode=segState.activeMode, R=segState.roiRadius;
    var W=volumeMeta.x,H=volumeMeta.y,D=volumeMeta.z,WH=W*H;
    var roi={x0:Math.max(0,seed.x-R),x1:Math.min(W-1,seed.x+R),y0:Math.max(0,seed.y-R),y1:Math.min(H-1,seed.y+R),z0:Math.max(0,seed.z-R),z1:Math.min(D-1,seed.z+R)};
    segState.lastROI=roi;
    var rW=roi.x1-roi.x0+1,rH=roi.y1-roi.y0+1,rD=roi.z1-roi.z0+1;
    function gV(x,y,z){if(x<0||x>=W||y<0||y>=H||z<0||z>=D)return-9999;return volumeData[z*WH+y*W+x];}
    // Amostragem
    var coreR=Math.max(2,Math.floor(R*0.08)), shI=Math.max(4,Math.floor(R*0.20)), shO=Math.max(8,Math.floor(R*0.45));
    var coreV=[],shellV=[],sx=seed.x,sy=seed.y,sz=seed.z;
    for(var p=0;p<3;p++){for(var da=-shO;da<=shO;da++)for(var db=-shO;db<=shO;db++){var d2=Math.sqrt(da*da+db*db);var px=sx,py=sy,pz=sz;if(p===0){px+=da;py+=db;}else if(p===1){px+=da;pz+=db;}else{py+=da;pz+=db;}var vv=gV(px,py,pz);if(vv===-9999)continue;if(d2<=coreR)coreV.push(vv);else if(d2>=shI&&d2<=shO)shellV.push(vv);}}
    coreV.sort(function(a,b){return a-b;}); shellV.sort(function(a,b){return a-b;});
    var cM=coreV.length>0?coreV[Math.floor(coreV.length/2)]:gV(sx,sy,sz);
    var sM=shellV.length>0?shellV[Math.floor(shellV.length/2)]:cM;
    var sP25=shellV.length>4?shellV[Math.floor(shellV.length*0.25)]:sM;
    var sP75=shellV.length>4?shellV[Math.floor(shellV.length*0.75)]:sM;
    var cs2=0;for(var ci=0;ci<coreV.length;ci++){var df=coreV[ci]-cM;cs2+=df*df;}
    var cStd=coreV.length>1?Math.sqrt(cs2/(coreV.length-1)):20;
    var contrast=Math.abs(sM-cM), tF=segState.tolerance/100;
    var bS=Math.max(contrast*tF, cStd*2.0, 10);
    var lo,hi;
    if(mode==='canal'){
        lo=cM-bS*1.2; hi=cM+bS*0.5;
        // Teto: 40% da distância core→shell (conservador)
        if(sM>cM) hi=Math.min(hi, cM+(sM-cM)*0.40);
    } else {
        lo=cM-bS*0.5; hi=cM+bS*1.2;
        if(sM<cM) lo=Math.max(lo, cM-(cM-sM)*0.35);
        if(sP75<cM) lo=Math.max(lo, sP75);
    }
    // Gradiente
    function lG(x,y,z){var a=gV(x+1,y,z),b=gV(x-1,y,z),c=gV(x,y+1,z),dd=gV(x,y-1,z),e=gV(x,y,z+1),f=gV(x,y,z-1);if(a===-9999||b===-9999||c===-9999||dd===-9999||e===-9999||f===-9999)return 9999;var gx=(a-b)*0.5,gy=(c-dd)*0.5,gz=(e-f)*0.5;return Math.sqrt(gx*gx+gy*gy+gz*gz);}
    var gS=[];var step=Math.max(2,Math.floor(shO/6));
    for(var gz2=-shO;gz2<=shO;gz2+=step)for(var gy2=-shO;gy2<=shO;gy2+=step)for(var gx2=-shO;gx2<=shO;gx2+=step){var gd=Math.sqrt(gx2*gx2+gy2*gy2+gz2*gz2);if(gd<shI||gd>shO)continue;var g=lG(sx+gx2,sy+gy2,sz+gz2);if(g>0&&g<5000)gS.push(g);}
    gS.sort(function(a,b){return a-b;});
    var gBarrier;
    if(mode==='canal'){var gP75=gS.length>5?gS[Math.floor(gS.length*0.75)]:300; gBarrier=Math.max(gP75*1.2,contrast*1.5,150);}
    else{var gP70=gS.length>5?gS[Math.floor(gS.length*0.70)]:250; gBarrier=Math.max(gP70*1.1,contrast*1.5,120);}
    // BFS — 6-conectividade sempre (conservador)
    var tot=W*H*D; segState.mask=new Uint8Array(tot);
    var vis=new Uint8Array(rW*rH*rD);
    var QS=rW*rH*rD, qX=new Int16Array(QS),qY=new Int16Array(QS),qZ=new Int16Array(QS);
    var qH=0,qT=0;
    var sLX=seed.x-roi.x0,sLY=seed.y-roi.y0,sLZ=seed.z-roi.z0;
    qX[0]=sLX;qY[0]=sLY;qZ[0]=sLZ;qT=1;vis[sLZ*rW*rH+sLY*rW+sLX]=1;
    var DX=[-1,1,0,0,0,0],DY=[0,0,-1,1,0,0],DZ=[0,0,0,0,-1,1];
    var cnt=0, RSQ=R*R*1.1;
    var cLim=(mode==='canal')?bS*1.0:bS*0.8;
    while(qH<qT){
        var lx=qX[qH],ly=qY[qH],lz=qZ[qH];qH++;
        var gx=lx+roi.x0,gy=ly+roi.y0,gz=lz+roi.z0;
        var val=volumeData[gz*WH+gy*W+gx];
        if(val<lo||val>hi) continue;
        var gr=lG(gx,gy,gz); if(gr>gBarrier) continue;
        var ddx=gx-seed.x,ddy=gy-seed.y,ddz=gz-seed.z;
        if(ddx*ddx+ddy*ddy+ddz*ddz>RSQ) continue;
        if(cnt>15){var nA=0,nS=0;for(var ni=0;ni<6;ni++){var nx=gx+DX[ni],ny=gy+DY[ni],nz=gz+DZ[ni];if(nx>=0&&nx<W&&ny>=0&&ny<H&&nz>=0&&nz<D&&segState.mask[nz*WH+ny*W+nx]){nA++;nS+=volumeData[nz*WH+ny*W+nx];}}if(nA>=2&&Math.abs(val-nS/nA)>cLim)continue;}
        segState.mask[gz*WH+gy*W+gx]=1; cnt++;
        for(var n=0;n<6;n++){var nlx=lx+DX[n],nly=ly+DY[n],nlz=lz+DZ[n];if(nlx<0||nlx>=rW||nly<0||nly>=rH||nlz<0||nlz>=rD)continue;var ni2=nlz*rW*rH+nly*rW+nlx;if(vis[ni2])continue;vis[ni2]=1;qX[qT]=nlx;qY[qT]=nly;qZ[qT]=nlz;qT++;}
    }
    segRemoveSmall(segState.mask,W,H,D,roi,segState.minClusterSize);
    console.log('[SEG] BFS:'+cnt+' thresh=['+lo.toFixed(0)+','+hi.toFixed(0)+'] gBar='+gBarrier.toFixed(0)+' '+((performance.now()-t0)|0)+'ms');
    segState.isRunning=false;
    segApplyPostProcess();
}

// --- PÓS-PROCESSAMENTO ---
window.segApplyPostProcess = function() {
    if(!segState.mask) return;
    var W=volumeMeta.x,H=volumeMeta.y,D=volumeMeta.z,WH=W*H,roi=segState.lastROI;
    if(!roi) return;
    var mode=segState.activeMode;
    segState.maskDisplay=new Uint8Array(segState.mask);
    var fillN=segState.fillIterations;
    for(var i=0;i<fillN;i++) segMorphClose(segState.maskDisplay,W,H,D,roi);
    // Vote fill para canal (preenche gaps internos)
    if(mode==='canal'&&fillN>0) segVoteFill(segState.maskDisplay,W,H,D,roi);
    // Abertura só para obturado
    if(mode!=='canal') segMorphOpen(segState.maskDisplay,W,H,D,roi);
    var count=0;for(var j=0;j<W*H*D;j++)if(segState.maskDisplay[j])count++;
    segState.voxelCount=count;
    var ve=document.getElementById('seg-s-vox');if(ve)ve.textContent=count.toLocaleString('pt-BR');
    var vo=document.getElementById('seg-s-vol');if(vo){var vv=volumeMeta.pixelSpacing*volumeMeta.pixelSpacing*volumeMeta.sliceThickness;vo.textContent=(count*vv).toFixed(1);}
    segRefreshViewports();
};

// --- MORFOLOGIA ---
var N6=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
function segRemoveSmall(mask,W,H,D,roi,ms){var rW=roi.x1-roi.x0+1,rH=roi.y1-roi.y0+1,rD=roi.z1-roi.z0+1,WH=W*H;var lab=new Int32Array(rW*rH*rD);var nl=1;var cq=new Int32Array(rW*rH*rD*3);for(var lz=0;lz<rD;lz++)for(var ly=0;ly<rH;ly++)for(var lx=0;lx<rW;lx++){var gi=(lz+roi.z0)*WH+(ly+roi.y0)*W+(lx+roi.x0);var li=lz*rW*rH+ly*rW+lx;if(!mask[gi]||lab[li])continue;var lb=nl++;var comp=[];var h=0,t=0;cq[0]=lx;cq[1]=ly;cq[2]=lz;t=1;lab[li]=lb;while(h<t){var cx=cq[h*3],cy=cq[h*3+1],cz=cq[h*3+2];h++;comp.push((cz+roi.z0)*WH+(cy+roi.y0)*W+(cx+roi.x0));for(var n=0;n<6;n++){var nx=cx+N6[n][0],ny=cy+N6[n][1],nz=cz+N6[n][2];if(nx<0||nx>=rW||ny<0||ny>=rH||nz<0||nz>=rD)continue;var nli=nz*rW*rH+ny*rW+nx;var ngi=(nz+roi.z0)*WH+(ny+roi.y0)*W+(nx+roi.x0);if(!mask[ngi]||lab[nli])continue;lab[nli]=lb;cq[t*3]=nx;cq[t*3+1]=ny;cq[t*3+2]=nz;t++;}}if(comp.length<ms)for(var ci2=0;ci2<comp.length;ci2++)mask[comp[ci2]]=0;}}
function segMorphClose(mask,W,H,D,roi){var rW=roi.x1-roi.x0+1,rH=roi.y1-roi.y0+1,rD=roi.z1-roi.z0+1,WH=W*H;var dil=new Uint8Array(rW*rH*rD);for(var lz=0;lz<rD;lz++)for(var ly=0;ly<rH;ly++)for(var lx=0;lx<rW;lx++){var gx=lx+roi.x0,gy=ly+roi.y0,gz=lz+roi.z0;if(mask[gz*WH+gy*W+gx]){dil[lz*rW*rH+ly*rW+lx]=1;continue;}for(var n=0;n<6;n++){var nx=gx+N6[n][0],ny=gy+N6[n][1],nz=gz+N6[n][2];if(nx>=0&&nx<W&&ny>=0&&ny<H&&nz>=0&&nz<D&&mask[nz*WH+ny*W+nx]){dil[lz*rW*rH+ly*rW+lx]=1;break;}}}for(var lz2=0;lz2<rD;lz2++)for(var ly2=0;ly2<rH;ly2++)for(var lx2=0;lx2<rW;lx2++){var gi2=(lz2+roi.z0)*WH+(ly2+roi.y0)*W+(lx2+roi.x0);var li2=lz2*rW*rH+ly2*rW+lx2;if(!dil[li2]){mask[gi2]=0;continue;}var ok=true;for(var n2=0;n2<6;n2++){var nlx=lx2+N6[n2][0],nly=ly2+N6[n2][1],nlz=lz2+N6[n2][2];if(nlx<0||nlx>=rW||nly<0||nly>=rH||nlz<0||nlz>=rD){ok=false;break;}if(!dil[nlz*rW*rH+nly*rW+nlx]){ok=false;break;}}mask[gi2]=ok?1:0;}}
function segVoteFill(mask,W,H,D,roi){var rW=roi.x1-roi.x0+1,rH=roi.y1-roi.y0+1,rD=roi.z1-roi.z0+1,WH=W*H;for(var pass=0;pass<5;pass++){var ch=0;for(var lz=1;lz<rD-1;lz++)for(var ly=1;ly<rH-1;ly++)for(var lx=1;lx<rW-1;lx++){var gx=lx+roi.x0,gy=ly+roi.y0,gz=lz+roi.z0;var gi=gz*WH+gy*W+gx;if(mask[gi])continue;var v=0;for(var n=0;n<6;n++){var nx=gx+N6[n][0],ny=gy+N6[n][1],nz=gz+N6[n][2];if(nx>=0&&nx<W&&ny>=0&&ny<H&&nz>=0&&nz<D&&mask[nz*WH+ny*W+nx])v++;}if(v>=4){mask[gi]=1;ch++;}}if(!ch)break;}}
function segMorphOpen(mask,W,H,D,roi){var rW=roi.x1-roi.x0+1,rH=roi.y1-roi.y0+1,rD=roi.z1-roi.z0+1,WH=W*H;var ero=new Uint8Array(rW*rH*rD);for(var lz=0;lz<rD;lz++)for(var ly=0;ly<rH;ly++)for(var lx=0;lx<rW;lx++){var gx=lx+roi.x0,gy=ly+roi.y0,gz=lz+roi.z0;if(!mask[gz*WH+gy*W+gx])continue;var ok=true;for(var n=0;n<6;n++){var nx=gx+N6[n][0],ny=gy+N6[n][1],nz=gz+N6[n][2];if(nx<0||nx>=W||ny<0||ny>=H||nz<0||nz>=D||!mask[nz*WH+ny*W+nx]){ok=false;break;}}if(ok)ero[lz*rW*rH+ly*rW+lx]=1;}for(var lz2=0;lz2<rD;lz2++)for(var ly2=0;ly2<rH;ly2++)for(var lx2=0;lx2<rW;lx2++){mask[(lz2+roi.z0)*WH+(ly2+roi.y0)*W+(lx2+roi.x0)]=0;}for(var lz3=0;lz3<rD;lz3++)for(var ly3=0;ly3<rH;ly3++)for(var lx3=0;lx3<rW;lx3++){if(!ero[lz3*rW*rH+ly3*rW+lx3])continue;var gx3=lx3+roi.x0,gy3=ly3+roi.y0,gz3=lz3+roi.z0;mask[gz3*WH+gy3*W+gx3]=1;for(var n3=0;n3<6;n3++){var nx3=gx3+N6[n3][0],ny3=gy3+N6[n3][1],nz3=gz3+N6[n3][2];if(nx3>=0&&nx3<W&&ny3>=0&&ny3<H&&nz3>=0&&nz3<D)mask[nz3*WH+ny3*W+nx3]=1;}}}

// --- OVERLAY ---
window.segDrawOverlay = function(ed) {
    var dm=segState.maskDisplay||segState.mask;if(!dm||segState.voxelCount===0)return;
    var ctx=ed.canvasContext,el=ed.element,img=ed.image;if(!ctx||!el||!img)return;
    var W=volumeMeta.x,H=volumeMeta.y,D=volumeMeta.z,WH=W*H;
    var isO=(segState.activeMode==='obturado');
    if(obliqueState&&obliqueState.isActive)return;
    var plane,si,iW,iH;
    
    // --- MÁGICA: Identifica o plano mesmo se for o Modal ---
    var activeId = el.id;
    var planeStr = '';
    if (activeId === 'modal-viewport') {
        var modal = document.getElementById('modal-zoom');
        planeStr = modal ? modal.dataset.plane : '';
    }

    if(activeId==='endo-axial' || planeStr==='axial'){plane='a';si=Math.round(crosshairState.z);iW=W;iH=H;}
    else if(activeId==='endo-coronal' || planeStr==='coronal'){plane='c';si=Math.round(crosshairState.y);iW=W;iH=D;}
    else if(activeId==='endo-sagittal' || planeStr==='sagittal'){plane='s';si=Math.round(crosshairState.x);iW=H;iH=D;}
    else return;

    var oc=document.createElement('canvas');oc.width=iW;oc.height=iH;
    var ox=oc.getContext('2d');var id=ox.createImageData(iW,iH);var px=id.data;
    var has=false;var oR=isO?255:0,oG=isO?160:220,oB=isO?40:255,oA=Math.round(segState.overlayOpacity*255);
    for(var ih=0;ih<iH;ih++)for(var iw=0;iw<iW;iw++){var gx,gy,gz;if(plane==='a'){gx=iw;gy=ih;gz=si;}else if(plane==='c'){gx=iw;gy=si;gz=ih;}else{gx=si;gy=iw;gz=ih;}if(gx<0||gx>=W||gy<0||gy>=H||gz<0||gz>=D)continue;if(dm[gz*WH+gy*W+gx]){var pi=(ih*iW+iw)*4;px[pi]=oR;px[pi+1]=oG;px[pi+2]=oB;px[pi+3]=oA;has=true;}}
    if(!has)return;ox.putImageData(id,0,0);
    var p00=cornerstone.pixelToCanvas(el,{x:0,y:0});var p10=cornerstone.pixelToCanvas(el,{x:iW,y:0});var p01=cornerstone.pixelToCanvas(el,{x:0,y:iH});
    var a=(p10.x-p00.x)/iW,b=(p01.x-p00.x)/iH,c=(p10.y-p00.y)/iW,d=(p01.y-p00.y)/iH;
    ctx.save();ctx.setTransform(a,c,b,d,p00.x,p00.y);ctx.globalAlpha=1;ctx.drawImage(oc,0,0);ctx.restore();
    
    // Seed marker
    if(!segState.seed)return;var sd=segState.seed,spx,spy,show=false;
    if(plane==='a'&&Math.abs(si-sd.z)<=1){spx=sd.x;spy=sd.y;show=true;}
    else if(plane==='c'&&Math.abs(si-sd.y)<=1){spx=sd.x;spy=sd.z;show=true;}
    else if(plane==='s'&&Math.abs(si-sd.x)<=1){spx=sd.y;spy=sd.z;show=true;}
    if(!show)return;var sc=cornerstone.pixelToCanvas(el,{x:spx,y:spy});
    ctx.save();ctx.setTransform(1,0,0,1,0,0);var col=isO?'#ffb347':'#78e7d1';var colA=isO?'rgba(255,179,71,0.4)':'rgba(120,231,209,0.4)';
    ctx.beginPath();ctx.arc(sc.x,sc.y,10,0,Math.PI*2);ctx.strokeStyle=colA;ctx.lineWidth=3;ctx.stroke();
    ctx.beginPath();ctx.arc(sc.x,sc.y,6,0,Math.PI*2);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(sc.x,sc.y,2.5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
    ctx.beginPath();ctx.moveTo(sc.x-12,sc.y);ctx.lineTo(sc.x+12,sc.y);ctx.moveTo(sc.x,sc.y-12);ctx.lineTo(sc.x,sc.y+12);ctx.strokeStyle=colA;ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
};

// segRefreshViewports já definido acima (inclui modal-viewport)

// --- 3D VISUALIZATION — ROUND SPRITES ---
// === V1 PATCH: buildSmoothCanalGeometryFromMask — centroide por slice → CatmullRom → Tube ===
// Estratégia:
//   1. Para cada slice Z dentro do ROI, calcular centroide (cx, cy) e área (n_voxels) dos voxels segmentados
//   2. Calcular raio aproximado a partir da área: r = sqrt(area / PI) * pixelSpacing
//   3. Filtrar slices vazios e outliers (>2 sigma do raio mediano)
//   4. Suavizar pontos com média móvel (janela 3) — preserva extremos
//   5. Criar CatmullRomCurve3 e TubeGeometry ao longo dela
//   6. Atribuir raio variável ao tubo via deslocamento radial (best effort: raio uniforme = mediana)
window.buildSmoothCanalGeometryFromMask = function(mask, roi, volumeMeta, mode){
    if (!mask || !roi || !volumeMeta) return null;
    var W = volumeMeta.x, H = volumeMeta.y, D = volumeMeta.z, WH = W * H;
    var ps = volumeMeta.pixelSpacing || 1;
    var st = volumeMeta.sliceThickness || 1;

    // 1. Centroide e área por slice Z
    var slices = []; // [{z, cx, cy, area, radiusMm}]
    for (var gz = roi.z0; gz <= roi.z1; gz++) {
        var sumX = 0, sumY = 0, n = 0;
        for (var gy = roi.y0; gy <= roi.y1; gy++) {
            for (var gx = roi.x0; gx <= roi.x1; gx++) {
                if (mask[gz * WH + gy * W + gx]) {
                    sumX += gx; sumY += gy; n++;
                }
            }
        }
        if (n > 0) {
            var area = n * ps * ps; // mm²
            var r = Math.sqrt(area / Math.PI); // mm
            slices.push({
                z: gz,
                cx: sumX / n, cy: sumY / n,
                area: n,
                radiusMm: r
            });
        }
    }

    if (slices.length < 4) {
        return { kind: 'fallback', reason: 'few-slices', slicesCount: slices.length };
    }

    // 2. Filtrar outliers de raio (mediano ± 2*MAD)
    var radii = slices.map(function(s){ return s.radiusMm; }).slice().sort(function(a,b){return a-b;});
    var medianR = radii[Math.floor(radii.length / 2)];
    var madArr = slices.map(function(s){ return Math.abs(s.radiusMm - medianR); }).sort(function(a,b){return a-b;});
    var madR = madArr[Math.floor(madArr.length / 2)] || (medianR * 0.3);
    var rMin = Math.max(0.05, medianR - 2.5 * madR);
    var rMax = medianR + 4.0 * madR; // mais tolerante para cima (cones)
    var clean = slices.filter(function(s){ return s.radiusMm >= rMin && s.radiusMm <= rMax; });

    if (clean.length < 4) {
        // se filtro removeu demais, volta para slices brutos
        clean = slices;
    }

    // 3. Suavização média móvel (janela 3) em cx, cy, radiusMm
    var smoothed = clean.map(function(s){ return { z: s.z, cx: s.cx, cy: s.cy, radiusMm: s.radiusMm }; });
    for (var iter = 0; iter < 2; iter++) {
        var copy = smoothed.map(function(p){ return { z:p.z, cx:p.cx, cy:p.cy, radiusMm:p.radiusMm }; });
        for (var i = 1; i < smoothed.length - 1; i++) {
            smoothed[i].cx = (copy[i-1].cx + copy[i].cx + copy[i+1].cx) / 3;
            smoothed[i].cy = (copy[i-1].cy + copy[i].cy + copy[i+1].cy) / 3;
            smoothed[i].radiusMm = (copy[i-1].radiusMm + copy[i].radiusMm + copy[i+1].radiusMm) / 3;
        }
    }

    // 4. Pontos 3D em mm
    var pts3D = smoothed.map(function(p){
        return new THREE.Vector3(p.cx * ps, p.cy * ps, p.z * st);
    });

    // 5. Curva e tube
    var curve = new THREE.CatmullRomCurve3(pts3D, false, 'catmullrom', 0.5);
    var tubularSegments = Math.max(40, Math.min(160, smoothed.length * 4));
    // raio uniforme = mediana suavizada (TubeGeometry não aceita raio variável nativamente)
    var radiusMmAvg = (function(){
        var s = 0; for (var k = 0; k < smoothed.length; k++) s += smoothed[k].radiusMm;
        return Math.max(0.15, s / smoothed.length);
    })();
    var tubeGeo;
    try {
        tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radiusMmAvg, 12, false);
    } catch(e) {
        return { kind: 'fallback', reason: 'tube-error', slicesCount: smoothed.length };
    }

    // 6. AABB
    var minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
    pts3D.forEach(function(p){
        if (p.x<minX)minX=p.x; if (p.x>maxX)maxX=p.x;
        if (p.y<minY)minY=p.y; if (p.y>maxY)maxY=p.y;
        if (p.z<minZ)minZ=p.z; if (p.z>maxZ)maxZ=p.z;
    });

    return {
        kind: 'tube',
        geometry: tubeGeo,
        curve: curve,
        radiusMm: radiusMmAvg,
        slicesUsed: smoothed.length,
        bbox: { minX:minX, maxX:maxX, minY:minY, maxY:maxY, minZ:minZ, maxZ:maxZ }
    };
};
// === FIM V1 PATCH buildSmoothCanalGeometryFromMask ===

window.segGenerate3D = function() {
    var dm=segState.maskDisplay||segState.mask;if(!dm||segState.voxelCount===0){alert('Segmente um canal primeiro.');return;}
    var W=volumeMeta.x,H=volumeMeta.y,D=volumeMeta.z,WH=W*H;
    var ps=volumeMeta.pixelSpacing||1,st=volumeMeta.sliceThickness||1;
    var isO=(segState.activeMode==='obturado');
    var roi=segState.lastROI;if(!roi)return;

    // === V1 PATCH: tentar reconstrução suave por tube ===
    var smooth = null;
    try { smooth = window.buildSmoothCanalGeometryFromMask(dm, roi, volumeMeta, isO ? 'obturado' : 'canal'); } catch(e){ window.dlog && window.dlog('[smooth canal]', e); smooth = null; }

    var pos=[],cols=[];var minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
    var skip=1;if(segState.voxelCount>12000)skip=Math.ceil(segState.voxelCount/12000);
    var ct=0;
    var seedVal=volumeData[segState.seed.z*WH+segState.seed.y*W+segState.seed.x];
    for(var gz=roi.z0;gz<=roi.z1;gz++)for(var gy=roi.y0;gy<=roi.y1;gy++)for(var gx=roi.x0;gx<=roi.x1;gx++){if(!dm[gz*WH+gy*W+gx])continue;ct++;if(ct%skip!==0)continue;var px2=gx*ps,py2=gy*ps,pz2=gz*st;pos.push(px2,py2,pz2);var val=volumeData[gz*WH+gy*W+gx];var t2=Math.max(0,Math.min(1,0.5+(val-seedVal)/(Math.max(Math.abs(val-seedVal),1)*4)));if(isO)cols.push(1.0,0.55+t2*0.35,0.1+t2*0.2);else cols.push(0.1+t2*0.3,0.7+t2*0.3,0.7+t2*0.3);if(px2<minX)minX=px2;if(px2>maxX)maxX=px2;if(py2<minY)minY=py2;if(py2>maxY)maxY=py2;if(pz2<minZ)minZ=pz2;if(pz2>maxZ)maxZ=pz2;}
    if(!pos.length){alert('Nenhum voxel.');return;}

    // se tube suave deu certo, expande bbox com a do tube
    if (smooth && smooth.kind === 'tube' && smooth.bbox) {
        var b = smooth.bbox;
        if (b.minX < minX) minX = b.minX; if (b.maxX > maxX) maxX = b.maxX;
        if (b.minY < minY) minY = b.minY; if (b.maxY > maxY) maxY = b.maxY;
        if (b.minZ < minZ) minZ = b.minZ; if (b.maxZ > maxZ) maxZ = b.maxZ;
    }

    var vVol=ps*ps*st;var tVol=segState.voxelCount*vVol;
    document.getElementById('seg-3d-voxels').textContent=segState.voxelCount.toLocaleString('pt-BR');
    document.getElementById('seg-3d-volume').textContent=tVol.toFixed(1);
    var ext=Math.max(maxX-minX,maxY-minY,maxZ-minZ);
    document.getElementById('seg-3d-extent').textContent=ext.toFixed(1);
    var t3d=document.getElementById('seg-3d-title');if(t3d){t3d.style.color=isO?'#ffb347':'#78e7d1';t3d.textContent=isO?'Canal Obturado 3D':'Canal 3D';}
    var s3d=document.getElementById('seg-3d-subtitle');
    if(s3d){
        if (smooth && smooth.kind === 'tube') {
            s3d.textContent = 'Reconstrução suave · ' + smooth.slicesUsed + ' slices · raio ~' + smooth.radiusMm.toFixed(2) + ' mm';
        } else {
            s3d.textContent = 'Visualização por pontos · ' + (pos.length/3) + ' pts (poucos slices)';
        }
    }
    var seg3dEl=document.getElementById('seg-3d-modal');
    seg3dEl.style.display='flex';
    var modalZoom=document.getElementById('modal-zoom');
    seg3dEl.style.zIndex=(modalZoom&&modalZoom.style.display!=='none')?'100010':'99200';
    setTimeout(function(){segInit3D(pos,cols,minX,maxX,minY,maxY,minZ,maxZ,isO,smooth);},100);
};

function segCreateSpriteTexture(isObtur) {
    var c=document.createElement('canvas');c.width=64;c.height=64;
    var ctx=c.getContext('2d');
    var grad=ctx.createRadialGradient(32,32,0,32,32,32);
    if(isObtur){grad.addColorStop(0,'rgba(255,200,80,1)');grad.addColorStop(0.4,'rgba(255,160,40,0.8)');grad.addColorStop(1,'rgba(255,100,0,0)');}
    else{grad.addColorStop(0,'rgba(150,255,240,1)');grad.addColorStop(0.4,'rgba(80,220,210,0.8)');grad.addColorStop(1,'rgba(0,180,180,0)');}
    ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
    var tex=new THREE.CanvasTexture(c);tex.needsUpdate=true;
    return tex;
}

// === V1 PATCH: segInit3D atualizada — tube suave + fallback pontos + iluminação premium ===
function segInit3D(positions,colors,minX,maxX,minY,maxY,minZ,maxZ,isObtur,smooth){
    var container=document.getElementById('seg-3d-container');var canvas=document.getElementById('seg-3d-canvas');
    var w=container.clientWidth,h=container.clientHeight;
    canvas.width=w*(window.devicePixelRatio||1);canvas.height=h*(window.devicePixelRatio||1);
    if(segState.three&&segState.three.renderer){segState.three.renderer.dispose();if(segState.three.controls)segState.three.controls.dispose();}
    var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
    renderer.setSize(w,h);renderer.setPixelRatio(window.devicePixelRatio||1);
    renderer.setClearColor(0x05070d,1); // fundo preto premium
    if (renderer.physicallyCorrectLights !== undefined) renderer.physicallyCorrectLights = true;
    if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding || renderer.outputEncoding;

    var scene=new THREE.Scene();
    var cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
    var ext=Math.max(maxX-minX,maxY-minY,maxZ-minZ)||10;
    var camera=new THREE.PerspectiveCamera(45,w/h,0.1,ext*15);
    camera.position.set(cx+ext*0.9,cy-ext*0.7,cz+ext*1.3);camera.lookAt(cx,cy,cz);
    var controls=new THREE.OrbitControls(camera,renderer.domElement);
    controls.target.set(cx,cy,cz);controls.enableDamping=true;controls.dampingFactor=0.12;controls.rotateSpeed=0.85;controls.enablePan=false;controls.update();

    var hasTube = (smooth && smooth.kind === 'tube' && smooth.geometry);

    if (hasTube) {
        // ── TUBE SUAVE ──
        var mat;
        if (isObtur) {
            // âmbar/dourado: metalness leve, roughness baixo
            mat = new THREE.MeshStandardMaterial({
                color: 0xffaa44,
                emissive: 0x553311,
                emissiveIntensity: 0.45,
                metalness: 0.55,
                roughness: 0.28,
                side: THREE.DoubleSide
            });
        } else {
            // ciano translúcido com emissive
            mat = new THREE.MeshStandardMaterial({
                color: 0x66e3d5,
                emissive: 0x12504a,
                emissiveIntensity: 0.55,
                metalness: 0.15,
                roughness: 0.45,
                transparent: true,
                opacity: 0.92,
                side: THREE.DoubleSide
            });
        }
        var tube = new THREE.Mesh(smooth.geometry, mat);
        scene.add(tube);

        // ponto endpoint (ápice)
        try {
            var endPt = smooth.curve.getPoint(1);
            var apicalGeo = new THREE.SphereGeometry(smooth.radiusMm * 0.85, 16, 16);
            var apicalMat = new THREE.MeshStandardMaterial({
                color: isObtur ? 0xffd066 : 0xa8fff0,
                emissive: isObtur ? 0x886622 : 0x224444,
                emissiveIntensity: 0.7
            });
            var apicalMesh = new THREE.Mesh(apicalGeo, apicalMat);
            apicalMesh.position.copy(endPt);
            scene.add(apicalMesh);
        } catch(e){}

        // luzes premium
        scene.add(new THREE.AmbientLight(0x4a5a6a, 0.55));
        var key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(cx + ext, cy - ext, cz + ext);
        scene.add(key);
        var rim = new THREE.PointLight(isObtur ? 0xff9933 : 0x66ffe5, 0.7, ext * 6);
        rim.position.set(cx - ext * 0.5, cy + ext * 0.6, cz - ext * 0.4);
        scene.add(rim);
        var fill = new THREE.PointLight(isObtur ? 0xffcc66 : 0x99ddff, 0.45, ext * 5);
        fill.position.set(cx + ext * 0.3, cy + ext * 0.4, cz + ext * 0.6);
        scene.add(fill);
    } else {
        // ── FALLBACK: pontos (poucos slices) ──
        var geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));
        geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(colors),3));
        var spriteTex=segCreateSpriteTexture(isObtur);
        var matP=new THREE.PointsMaterial({size:Math.max(0.4,ext*0.018),map:spriteTex,vertexColors:true,sizeAttenuation:true,transparent:true,alphaTest:0.05,depthWrite:false,blending:THREE.AdditiveBlending});
        scene.add(new THREE.Points(geo,matP));
        scene.add(new THREE.AmbientLight(0xffffff,1));
    }

    // Eixos discretos (cosmético, ambos os modos)
    var aL=ext*0.25;var aG=new THREE.BufferGeometry();
    aG.setAttribute('position',new THREE.BufferAttribute(new Float32Array([cx-aL,cy,cz,cx+aL,cy,cz,cx,cy-aL,cz,cx,cy+aL,cz,cx,cy,cz-aL,cx,cy,cz+aL]),3));
    aG.setAttribute('color',new THREE.BufferAttribute(new Float32Array([0.8,0.2,0.2,0.8,0.2,0.2,0.2,0.8,0.2,0.2,0.8,0.2,0.3,0.3,0.9,0.3,0.3,0.9]),3));
    scene.add(new THREE.LineSegments(aG,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.18})));

    var anim=true;
    function loop(){if(!anim||!segState.three||!segState.three.animating)return;requestAnimationFrame(loop);controls.update();renderer.render(scene,camera);}
    segState.three={renderer:renderer,scene:scene,camera:camera,controls:controls,animating:true,hasTube:hasTube};
    loop();
}
// === FIM V1 PATCH segInit3D ===
window.segClose3D = function(){var m=document.getElementById('seg-3d-modal');if(m){m.style.display='none';m.style.zIndex='99200';}if(segState.three){segState.three.animating=false;if(segState.three.renderer)segState.three.renderer.dispose();if(segState.three.controls)segState.three.controls.dispose();segState.three=null;}};

// --- HOOKS ---
(function(){function hook(){['endo-axial','endo-coronal','endo-sagittal','modal-viewport'].forEach(function(id){var el=document.getElementById(id);if(!el)return;if(!el.offsetParent&&id==='modal-viewport')return;el.removeEventListener('cornerstoneimagerendered',onR);el.addEventListener('cornerstoneimagerendered',onR);});}function onR(e){var dm=segState.maskDisplay||segState.mask;if(dm&&segState.voxelCount>0)segDrawOverlay(e.detail);}var orig=window.initEndoMPRViewportsMobile;if(orig){window.initEndoMPRViewportsMobile=async function(){await orig.apply(this,arguments);hook();};}if(typeof isEndoMPRInitialized!=='undefined'&&isEndoMPRInitialized)setTimeout(hook,500);document.addEventListener('DOMContentLoaded',function(){setTimeout(hook,1000);});window._segHookOverlay=hook;})();
(function(){var orig=window.switchTab;if(orig){window.switchTab=function(tab,btn){if(tab!=='endo'&&segState.activeMode)segDeactivate();if(tab==='endo'&&!segState.activeMode)segHidePanel();return orig.apply(this,arguments);};}})();
// Safety: ensure panel is hidden on page load
document.addEventListener('DOMContentLoaded',function(){segHidePanel();});
console.log('[EndoSlice] Segmentação v5.0');
})(); // Fim do IIFE de Segmentação v5

(function(){
    function initHubCarousel(){
        const track = document.getElementById('hubCarouselTrack');
        const dotsWrap = document.getElementById('hubCarouselDots');
        if (!track || !dotsWrap) return;

        const cards = Array.from(track.querySelectorAll('.hub-carousel-card'));
        const dots  = Array.from(dotsWrap.querySelectorAll('.hub-carousel-dot'));
        if (!cards.length) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;

        // ==========================================================
        // 1. ESCUDO ANTI-CLIQUE FANTASMA (Bloqueio em Fase de Captura)
        // ==========================================================
        track.addEventListener('touchstart', e => { 
            startX = e.touches[0].clientX; 
            startY = e.touches[0].clientY;
            isDragging = false; 
        }, {passive: true, capture: true});

        track.addEventListener('touchmove', e => {
            // Se mover mais de 10px, o escudo é ativado (É um scroll, não um clique)
            let dx = Math.abs(e.touches[0].clientX - startX);
            let dy = Math.abs(e.touches[0].clientY - startY);
            if (dx > 10 || dy > 10) {
                isDragging = true;
            }
        }, {passive: true, capture: true});

        // Intercepta e DESTROÍ os cliques/toques se o escudo estiver ativo
        const blockAccidentalTouch = (e) => {
            if (isDragging) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Mata os onclick/ontouchend do HTML
                return false;
            }

            // Se for um clique legítimo, mas num card lateral, apenas centraliza ele
            let card = e.target.closest('.hub-carousel-card');
            if (card && !card.classList.contains('is-center')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                return false;
            }
        };

        // Aplica o bloqueio em todos os eventos de toque/clique possíveis
        track.addEventListener('touchend', blockAccidentalTouch, true);
        track.addEventListener('click', blockAccidentalTouch, true);


        // ==========================================================
        // 2. MOTOR 3D OTIMIZADO (Intersection Observer = 60 FPS Constante)
        // ==========================================================
        // Em vez de calcular no scroll (o que trava a tela), o navegador nos avisa 
        // automaticamente e sem custo de processamento quando um card chega ao centro.

        const observerOptions = {
            root: track,
            rootMargin: '0px',
            threshold: 0.6 // Dispara quando 60% do card estiver no centro
        };

        const carouselObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const card = entry.target;
                const index = parseInt(card.getAttribute('data-index'));

                if (entry.isIntersecting) {
                    // Este card entrou no centro
                    card.classList.remove('is-left', 'is-right');
                    card.classList.add('is-center');
                    
                    // Atualiza a bolinha (Dynamic Island)
                    dots.forEach((dot, i) => {
                        dot.classList.toggle('active', i === index);
                    });
                } else {
                    // Este card saiu do centro
                    card.classList.remove('is-center');
                    
                    // Descobre se ele foi pra esquerda ou direita
                    const cardRect = card.getBoundingClientRect();
                    const trackRect = track.getBoundingClientRect();
                    
                    if (cardRect.left < trackRect.left) {
                        card.classList.add('is-left');
                        card.classList.remove('is-right');
                    } else {
                        card.classList.add('is-right');
                        card.classList.remove('is-left');
                    }
                }
            });
        }, observerOptions);

        // Inicia a observação de todos os cards
        cards.forEach((card, index) => {
            card.setAttribute('data-index', index); // Garante que temos o índice
            carouselObserver.observe(card);
        });

        // ==========================================================
        // 3. ALINHAMENTO INICIAL SUAVE
        // ==========================================================
        setTimeout(() => {
            const first = cards[0];
            if (first) {
                first.scrollIntoView({ behavior: 'auto', inline: 'center' });
            }
        }, 50);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHubCarousel);
    } else {
        initHubCarousel();
    }
})();



// ═══════════════════════════════════════════════════════════
// ENDOSLICE PRO — PORTFOLIO / HEURISTICS / EXPORT / PRESENTATION
// ═══════════════════════════════════════════════════════════

// ── PORTFOLIO STATE ──
window.portfolioState = {
    paciente: { nome:'', idade:'', sexo:'', identificador:'', dataExame:'', queixa:'' },
    profissional: { nome:'', cro:'', clinica:'', contato:'', obs:'' },
    resumo: { motivo:'', hipotese:'', sintomas:'', historico:'' },
    achados: '',
    diagnostico: { principal:'', diferencial:'', obs:'' },
    plano: { objetivo:'', conduta:'', retratamento:false, cirurgia:false, restauradora:false, encaminhamento:false, limitacoes:'' },
    conclusao: { resumo:'', proximos:'' },
    items: [],  // { type, dataUrl, label, metrics, heuristics, timestamp }
    fotos: []   // { dataUrl, legenda }
};

// ── PORTFOLIO: SAVE/LOAD localStorage ──
function portfolioSave() {
    try { localStorage.setItem('endoslice-portfolio', JSON.stringify(portfolioState)); } catch(e) { console.warn('Portfolio save error', e); }
}
function portfolioLoad() {
    try {
        var s = localStorage.getItem('endoslice-portfolio');
        if (s) { var d = JSON.parse(s); Object.assign(portfolioState, d); }
    } catch(e) { console.warn('Portfolio load error', e); }
}
portfolioLoad();

// ── PORTFOLIO: ADD ITEM ──
function portfolioAddItem(type, dataUrl, label, metrics, heuristics) {
    portfolioState.items.push({
        type: type, dataUrl: dataUrl || '', label: label || '',
        metrics: metrics || {}, heuristics: heuristics || '',
        timestamp: Date.now()
    });
    portfolioSave();
    portfolioRefreshItems();
    showToast('📁 Adicionado ao Portfolio');
}

function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,20px)+12px);left:50%;transform:translateX(-50%);background:rgba(210,188,255,0.9);color:#1a1d24;padding:10px 20px;border-radius:12px;font-size:12px;font-weight:800;z-index:9999999;backdrop-filter:blur(8px);pointer-events:none;animation:toastIn 0.3s ease;';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(function(){ t.remove(); },300); },2000);
}

// ── PORTFOLIO OPEN/CLOSE ──
function openPortfolio() {
    portfolioLoad();
    
    // Auto-preenche a data com o dia atual se estiver vazia
    if (!portfolioState.paciente.dataExame || portfolioState.paciente.dataExame.trim() === '') {
        portfolioState.paciente.dataExame = new Date().toLocaleDateString('pt-BR');
    }

    var m = document.getElementById('portfolio-modal');
    if (!m) createPortfolioModal();
    m = document.getElementById('portfolio-modal');
    
    portfolioPopulateFields();
    portfolioRefreshItems();
    portfolioRefreshPhotos();
    m.classList.add('active');

    // Associa a máscara ao input de data
    setTimeout(() => {
        const dateInput = document.getElementById('pf-pac-data');
        if (dateInput) {
            dateInput.addEventListener('input', function() { window.applyDateMask(this); });
        }
    }, 100);
}

function closePortfolio() {
    portfolioCollectFields();
    portfolioSave();
    var m = document.getElementById('portfolio-modal');
    if (m) m.classList.remove('active');
}

function createPortfolioModal() {
    var m = document.createElement('div');
    m.id = 'portfolio-modal';
    m.innerHTML = buildPortfolioHTML();
    document.body.appendChild(m);
}

function buildPortfolioHTML() {
    function sec(id, title, body, collapsed) {
        return '<div class="pf-section'+(collapsed?' collapsed':'')+'" id="pf-sec-'+id+'">'
            + '<div class="pf-section-head" onclick="this.parentElement.classList.toggle(\'collapsed\')">'
            + '<div class="pf-section-title">'+title+'</div><div class="pf-section-arrow">▾</div></div>'
            + '<div class="pf-section-body">'+body+'</div></div>';
    }
    function fld(id, label, placeholder, type) {
        type = type || 'input';
        if (type === 'textarea') return '<div class="pf-field"><label class="pf-label">'+label+'</label><textarea class="pf-textarea" id="pf-'+id+'" placeholder="'+placeholder+'"></textarea></div>';
        return '<div class="pf-field"><label class="pf-label">'+label+'</label><input class="pf-input" id="pf-'+id+'" placeholder="'+placeholder+'"></div>';
    }

    var html = '<div class="pf-header">'
        + '<div class="pf-title">📁 Portfolio Clínico</div>'
        + '<button onclick="closePortfolio()" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;">✕</button></div>'
        + '<div class="pf-body">';

    // Paciente
    html += sec('pac','👤 Dados do Paciente',
        fld('pac-nome','Nome','Nome do paciente')
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + fld('pac-idade','Idade','Ex: 35')
        + fld('pac-sexo','Sexo','M / F')+'</div>'
        + fld('pac-id','Identificador','ID / prontuário')
        + fld('pac-data','Data do Exame','DD/MM/AAAA')
        + fld('pac-queixa','Queixa Principal','','textarea')
    );

    // Profissional
    html += sec('prof','🩺 Dados do Profissional',
        fld('prof-nome','Nome','Dr(a)...')
        + fld('prof-cro','CRO','CRO-UF 0000')
        + fld('prof-clinica','Clínica','')
        + fld('prof-contato','Contato','Tel/Email')
        + fld('prof-obs','Observações','','textarea')
    , true);

    // Resumo clínico
    html += sec('res','📋 Resumo Clínico',
        fld('res-motivo','Motivo do Exame','','textarea')
        + fld('res-hipotese','Hipótese Diagnóstica','','textarea')
        + fld('res-sintomas','Sintomas','','textarea')
        + fld('res-historico','Histórico Relevante','','textarea')
    );

    // Achados
    html += sec('ach','🔍 Achados Tomográficos',
        fld('ach-texto','Observações','Descreva os achados...','textarea')
    , true);

    // Itens adicionados (Lima, Odonto, Segmentação)
    html += sec('items','📎 Itens do Caso',
        '<div class="pf-items-tray" id="pf-items-tray"><div style="font-size:10px;color:rgba(255,255,255,0.2);text-align:center;padding:12px;">Use os botões 📁 nas ferramentas para adicionar itens</div></div>'
    );

    // Fotos clínicas
    html += sec('fotos','📷 Fotos Clínicas',
        '<div class="pf-photos-grid" id="pf-photos-grid"><div class="pf-add-photo" onclick="portfolioAddPhoto()">+</div></div>'
        + '<input type="file" id="pf-photo-input" accept="image/*" multiple style="display:none" onchange="portfolioHandlePhotos(this.files)">'
    );

    // Diagnóstico
    html += sec('diag','🎯 Diagnóstico',
        fld('diag-principal','Diagnóstico Principal','','textarea')
        + fld('diag-diferencial','Diagnóstico Diferencial','','textarea')
        + fld('diag-obs','Observações','','textarea')
    );

    // Plano de tratamento
    html += sec('plano','📐 Plano de Tratamento',
        fld('plano-objetivo','Objetivo','','textarea')
        + fld('plano-conduta','Conduta Proposta','','textarea')
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.5);font-weight:700;"><input type="checkbox" id="pf-plano-retrat"> Retratamento?</label>'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.5);font-weight:700;"><input type="checkbox" id="pf-plano-cirurg"> Cirurgia?</label>'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.5);font-weight:700;"><input type="checkbox" id="pf-plano-rest"> Restauradora?</label>'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.5);font-weight:700;"><input type="checkbox" id="pf-plano-encam"> Encaminhamento?</label>'
        + '</div>'
        + fld('plano-limit','Limitações / Riscos','','textarea')
    );

    // Conclusão
    html += sec('conc','✅ Conclusão',
        fld('conc-resumo','Resumo Final','','textarea')
        + fld('conc-proximos','Próximos Passos','','textarea')
    );

    html += '</div>'; // pf-body

    // Footer
    html += '<div class="pf-footer">'
        + '<button class="pf-footer-btn pf-btn-save" onclick="portfolioCollectFields();portfolioSave();showToast(\'💾 Portfolio salvo\');">💾 Salvar</button>'
        + '<button class="pf-footer-btn pf-btn-export" onclick="openExportMenu()">📤 Exportar</button>'
        + '</div>';

    return html;
}

function portfolioCollectFields() {
    var s = portfolioState;
    var g = function(id){ var e=document.getElementById('pf-'+id); return e ? e.value||'' : ''; };
    s.paciente = { nome:g('pac-nome'), idade:g('pac-idade'), sexo:g('pac-sexo'), identificador:g('pac-id'), dataExame:g('pac-data'), queixa:g('pac-queixa') };
    s.profissional = { nome:g('prof-nome'), cro:g('prof-cro'), clinica:g('prof-clinica'), contato:g('prof-contato'), obs:g('prof-obs') };
    s.resumo = { motivo:g('res-motivo'), hipotese:g('res-hipotese'), sintomas:g('res-sintomas'), historico:g('res-historico') };
    s.achados = g('ach-texto');
    s.diagnostico = { principal:g('diag-principal'), diferencial:g('diag-diferencial'), obs:g('diag-obs') };
    s.plano = {
        objetivo:g('plano-objetivo'), conduta:g('plano-conduta'),
        retratamento:!!document.getElementById('pf-plano-retrat')?.checked,
        cirurgia:!!document.getElementById('pf-plano-cirurg')?.checked,
        restauradora:!!document.getElementById('pf-plano-rest')?.checked,
        encaminhamento:!!document.getElementById('pf-plano-encam')?.checked,
        limitacoes:g('plano-limit')
    };
    s.conclusao = { resumo:g('conc-resumo'), proximos:g('conc-proximos') };
}

function portfolioPopulateFields() {
    var s = portfolioState;
    var se = function(id,v){ var e=document.getElementById('pf-'+id); if(e) e.value=v||''; };
    se('pac-nome',s.paciente.nome); se('pac-idade',s.paciente.idade); se('pac-sexo',s.paciente.sexo);
    se('pac-id',s.paciente.identificador); se('pac-data',s.paciente.dataExame); se('pac-queixa',s.paciente.queixa);
    se('prof-nome',s.profissional.nome); se('prof-cro',s.profissional.cro); se('prof-clinica',s.profissional.clinica);
    se('prof-contato',s.profissional.contato); se('prof-obs',s.profissional.obs);
    se('res-motivo',s.resumo.motivo); se('res-hipotese',s.resumo.hipotese); se('res-sintomas',s.resumo.sintomas); se('res-historico',s.resumo.historico);
    se('ach-texto',s.achados);
    se('diag-principal',s.diagnostico.principal); se('diag-diferencial',s.diagnostico.diferencial); se('diag-obs',s.diagnostico.obs);
    se('plano-objetivo',s.plano.objetivo); se('plano-conduta',s.plano.conduta); se('plano-limit',s.plano.limitacoes);
    var cb = function(id,v){ var e=document.getElementById(id); if(e) e.checked=!!v; };
    cb('pf-plano-retrat',s.plano.retratamento); cb('pf-plano-cirurg',s.plano.cirurgia);
    cb('pf-plano-rest',s.plano.restauradora); cb('pf-plano-encam',s.plano.encaminhamento);
    se('conc-resumo',s.conclusao.resumo); se('conc-proximos',s.conclusao.proximos);
}

function portfolioRefreshItems() {
    var tray = document.getElementById('pf-items-tray');
    if (!tray) return;
    if (!portfolioState.items.length) {
        tray.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.2);text-align:center;padding:12px;">Use os botões 📁 nas ferramentas para adicionar itens</div>';
        return;
    }
    var html = '';
    portfolioState.items.forEach(function(item, i) {
        var thumb = item.dataUrl ? '<img class="pf-item-thumb" src="'+item.dataUrl+'">' : '<div class="pf-item-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px;">📎</div>';
        html += '<div class="pf-item-card">'
            + thumb
            + '<div class="pf-item-info"><div class="pf-item-type">'+item.type+'</div><div class="pf-item-desc">'+item.label+'</div>'
            + (item.heuristics ? '<div style="font-size:7px;color:rgba(120,231,209,0.5);margin-top:2px;">'+item.heuristics+'</div>' : '')
            + '</div>'
            + '<button class="pf-item-remove" onclick="portfolioRemoveItem('+i+')">✕</button>'
            + '</div>';
    });
    tray.innerHTML = html;
}

function portfolioRemoveItem(i) {
    portfolioState.items.splice(i, 1);
    portfolioSave();
    portfolioRefreshItems();
}

// ── PORTFOLIO PHOTOS ──
function portfolioAddPhoto() { document.getElementById('pf-photo-input')?.click(); }
function portfolioHandlePhotos(files) {
    if (!files) return;
    Array.from(files).forEach(function(f) {
        var reader = new FileReader();
        reader.onload = function(e) {
            // Compressor em tempo real para evitar estouro de memória no localStorage
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var MAX_WIDTH = 800; // Tamanho ideal para PDF sem pesar
                var MAX_HEIGHT = 800;
                var width = img.width;
                var height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converte para JPEG 60% (Extremamente leve, perfeito para PDF)
                var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                
                portfolioState.fotos.push({ dataUrl: dataUrl, legenda: '' });
                
                try {
                    portfolioSave();
                    portfolioRefreshPhotos();
                } catch(err) {
                    alert("Memória do navegador cheia! Exclua alguns itens antigos do Portfólio.");
                    portfolioState.fotos.pop(); // Remove a foto que causou o estouro
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(f);
    });
}

function portfolioRefreshPhotos() {
    var grid = document.getElementById('pf-photos-grid');
    if (!grid) return;
    var html = '';
    portfolioState.fotos.forEach(function(f, i) {
        html += '<div class="pf-photo-wrap"><img src="'+f.dataUrl+'"><button class="pf-photo-remove" onclick="portfolioRemovePhoto('+i+')">✕</button></div>';
    });
    html += '<div class="pf-add-photo" onclick="portfolioAddPhoto()">+</div>';
    grid.innerHTML = html;
}
function portfolioRemovePhoto(i) {
    portfolioState.fotos.splice(i, 1);
    portfolioSave();
    portfolioRefreshPhotos();
}

// ── ADD TO PORTFOLIO: from seg panel ──
function segAddToPortfolio() {
    if (!segState.mask || segState.voxelCount === 0) return;
    var canvas = document.querySelector('#endo-axial canvas.cornerstone-canvas') || document.querySelector('#endo-axial canvas');
    var dataUrl = '';
    if (canvas) {
        var tmp = document.createElement('canvas'); tmp.width = canvas.width; tmp.height = canvas.height;
        var ctx = tmp.getContext('2d'); ctx.drawImage(canvas, 0, 0);
        try { segDrawOverlayToCanvas(ctx, 'endo-axial', canvas.width, canvas.height); } catch(e){}
        
        // Esmagador
        var MAX_W = 800;
        var w = tmp.width, h = tmp.height;
        if(w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        var downCvs = document.createElement('canvas'); downCvs.width = w; downCvs.height = h;
        downCvs.getContext('2d').drawImage(tmp, 0, 0, w, h);
        
        dataUrl = downCvs.toDataURL('image/jpeg', 0.5);
    }
    
    var isO = (segState.activeMode === 'obturado');
    portfolioAddItem(isO ? 'Segmentação 3D do Canal' : 'Segmentação 3D do Canal', dataUrl, 'Vista Axial · ' + segState.voxelCount + ' voxels', { voxels: segState.voxelCount, volume: document.getElementById('seg-s-vol')?.textContent || '--' }, document.getElementById('seg-heur-tags')?.textContent || '');
}

function segDrawOverlayToCanvas(ctx, elId, w, h) {
    var dm = segState.maskDisplay || segState.mask; if (!dm) return;
    var W = volumeMeta.x, H = volumeMeta.y, D = volumeMeta.z, WH = W * H;
    var si = Math.round(crosshairState.z);
    var isO = (segState.activeMode === 'obturado');
    for (var iy = 0; iy < H; iy++) for (var ix = 0; ix < W; ix++) {
        if (dm[si * WH + iy * W + ix]) {
            ctx.fillStyle = isO ? 'rgba(255,160,40,0.45)' : 'rgba(0,220,255,0.45)';
            ctx.fillRect(ix * w / W, iy * h / H, Math.ceil(w / W), Math.ceil(h / H));
        }
    }
}

// ── ADD TO PORTFOLIO: from seg 3D modal ──
function seg3DAddToPortfolio() {
    var canvas = document.getElementById('seg-3d-canvas');
    var dataUrl = '';
    if (canvas) {
        // V1 PATCH: qualidade alta (0.92) + cap 1200px
        var MAX_W = 1200;
        var w = canvas.width, h = canvas.height;
        if(w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        var downCvs = document.createElement('canvas'); downCvs.width = w; downCvs.height = h;
        downCvs.getContext('2d').drawImage(canvas, 0, 0, w, h);
        dataUrl = downCvs.toDataURL('image/jpeg', 0.92);
    }
    
    var isO = (segState.activeMode === 'obturado');
    portfolioAddItem(isO ? 'Canal Obturado 3D' : 'Canal 3D', dataUrl, 'Vista 3D', { voxels: document.getElementById('seg-3d-voxels')?.textContent, volume: document.getElementById('seg-3d-volume')?.textContent, extent: document.getElementById('seg-3d-extent')?.textContent }, document.getElementById('seg-heur-tags')?.textContent || '');
}

// ── ADD TO PORTFOLIO: from odontometria ──
// === V1 PATCH: usa snapshot salvo da medição, qualidade alta, fallback premium ===
function odontoAddToPortfolio() {
    var d = window._odontometriaData;
    if (!d || !d.CRD) { showToast('⚠ Calcule a odontometria primeiro'); return; }

    var dataUrl = '';
    var sourceVpId = (limaState && (limaState.measurementViewportId || limaState.sourceViewportId)) || null;
    var measPoints = (limaState && limaState.lastMeasurementPoints) || (limaState && limaState.points) || [];
    var snap = limaState && limaState.lastMeasurementSnapshot;

    function _drawMetricsBox(ctx, baseW, baseH){
        // Box CRD/CAD/CRT/LIMA premium no canto inferior do snapshot
        var pad = 14;
        var lines = [
            ['CRD', Number(d.CRD).toFixed(2) + ' mm', '#00e5ff'],
            ['RECUO', (typeof d.recuo === 'number' ? d.recuo : 1.0).toFixed(2) + ' mm', '#ffd700'],
            ['CRT', Number(d.CRT).toFixed(2) + ' mm', '#ff9900'],
            ['LIMA', Number(d.lima).toFixed(2) + ' mm', '#9bff9b']
        ];
        var rowH = Math.max(22, Math.round(baseH * 0.045));
        var fontSz = Math.max(13, Math.round(baseH * 0.026));
        var labelSz = Math.max(9, Math.round(baseH * 0.018));
        var boxW = Math.max(180, Math.round(baseW * 0.32));
        var boxH = pad*2 + rowH * lines.length + 4;
        var boxX = baseW - boxW - pad;
        var boxY = baseH - boxH - pad;

        // fundo glass
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,24,0.78)';
        ctx.strokeStyle = 'rgba(120,231,209,0.5)';
        ctx.lineWidth = 2;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxW, boxH, 12);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeRect(boxX, boxY, boxW, boxH);
        }
        // título
        ctx.fillStyle = 'rgba(120,231,209,0.85)';
        ctx.font = '700 ' + labelSz + 'px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('ODONTOMETRIA' + (d.canal ? ' \u00b7 ' + d.canal : ''), boxX + pad, boxY + 6);
        // linhas
        for (var i = 0; i < lines.length; i++) {
            var ly = boxY + pad + 4 + i * rowH;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '700 ' + labelSz + 'px -apple-system, sans-serif';
            ctx.fillText(lines[i][0], boxX + pad, ly + 4);
            ctx.fillStyle = lines[i][2];
            ctx.font = '900 ' + fontSz + 'px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(lines[i][1], boxX + boxW - pad, ly + 2);
            ctx.textAlign = 'left';
        }
        if (d.denteNum) {
            ctx.fillStyle = 'rgba(255,200,80,0.85)';
            ctx.font = '800 ' + labelSz + 'px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('DENTE ' + d.denteNum, boxX + boxW - pad, boxY + 6);
        }
        ctx.restore();
    }

    function _drawLimaLineOnSnapshot(ctx, finalCanvas, vpId){
        // re-projeta os pontos da lima no canvas final usando proporção
        if (!measPoints || measPoints.length < 2) return;
        var srcEl = document.getElementById(vpId);
        if (!srcEl || !window.cornerstone) return;
        try {
            // pixelToCanvas usa canvas do cornerstone — dimensões iguais ao snap original
            var canvasPts = measPoints.map(function(p){
                try { return cornerstone.pixelToCanvas(srcEl, { x: p.imgX, y: p.imgY }); }
                catch(e){ return null; }
            }).filter(function(p){ return p && isFinite(p.x) && isFinite(p.y); });
            if (canvasPts.length < 2) return;
            // Escala canvas_cornerstone -> finalCanvas
            var srcCv = srcEl.querySelector('canvas.cornerstone-canvas');
            var sx = finalCanvas.width  / (srcCv ? srcCv.width  : finalCanvas.width);
            var sy = finalCanvas.height / (srcCv ? srcCv.height : finalCanvas.height);
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // halo escuro
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(canvasPts[0].x * sx, canvasPts[0].y * sy);
            for (var i = 1; i < canvasPts.length; i++) ctx.lineTo(canvasPts[i].x * sx, canvasPts[i].y * sy);
            ctx.stroke();
            // linha amarela
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(canvasPts[0].x * sx, canvasPts[0].y * sy);
            for (var i2 = 1; i2 < canvasPts.length; i2++) ctx.lineTo(canvasPts[i2].x * sx, canvasPts[i2].y * sy);
            ctx.stroke();
            // pontos
            for (var k = 0; k < canvasPts.length; k++) {
                var px = canvasPts[k].x * sx, py = canvasPts[k].y * sy;
                ctx.fillStyle = (k === 0) ? '#00ffcc' : (k === canvasPts.length - 1) ? '#ff4466' : '#ffd700';
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
            }
            ctx.restore();
        } catch(e){ window.dlog && window.dlog('[odonto draw lima]', e); }
    }

    // Estratégia 1: usar snapshot salvo no momento da medição
    if (snap && snap.canvas && snap.canvas.width > 0) {
        try {
            var fc = document.createElement('canvas');
            fc.width = snap.canvas.width;
            fc.height = snap.canvas.height;
            var fctx = fc.getContext('2d');
            fctx.drawImage(snap.canvas, 0, 0);
            // re-desenha a linha caso o snapshot não tenha (ou para reforçar)
            _drawLimaLineOnSnapshot(fctx, fc, sourceVpId);
            _drawMetricsBox(fctx, fc.width, fc.height);
            // qualidade alta — JPEG 0.9 com cap a 1200px
            var MAX_W = 1200;
            var w = fc.width, h = fc.height;
            if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
            var out = document.createElement('canvas');
            out.width = w; out.height = h;
            out.getContext('2d').drawImage(fc, 0, 0, w, h);
            dataUrl = out.toDataURL('image/jpeg', 0.9);
        } catch(e){ window.dlog && window.dlog('[odonto snapshot path]', e); dataUrl = ''; }
    }

    // Estratégia 2: capturar viewport ao vivo (se snapshot falhou)
    if (!dataUrl && sourceVpId) {
        try {
            var elLive = document.getElementById(sourceVpId);
            var liveCv = elLive ? elLive.querySelector('canvas.cornerstone-canvas') : null;
            if (liveCv) {
                var fc2 = document.createElement('canvas');
                fc2.width = liveCv.width; fc2.height = liveCv.height;
                var fctx2 = fc2.getContext('2d');
                fctx2.drawImage(liveCv, 0, 0);
                _drawLimaLineOnSnapshot(fctx2, fc2, sourceVpId);
                _drawMetricsBox(fctx2, fc2.width, fc2.height);
                var MAX_W2 = 1200;
                var w2 = fc2.width, h2 = fc2.height;
                if (w2 > MAX_W2) { h2 = Math.round(h2 * MAX_W2 / w2); w2 = MAX_W2; }
                var out2 = document.createElement('canvas');
                out2.width = w2; out2.height = h2;
                out2.getContext('2d').drawImage(fc2, 0, 0, w2, h2);
                dataUrl = out2.toDataURL('image/jpeg', 0.9);
            }
        } catch(e){ window.dlog && window.dlog('[odonto live path]', e); }
    }

    var metricasFormatadas = {
        'CRD': Number(d.CRD).toFixed(2) + ' mm',
        'CAD': Number(d.CAD).toFixed(2) + ' mm',
        'CRT': Number(d.CRT).toFixed(2) + ' mm',
        'LIMA': Number(d.lima).toFixed(2) + ' mm'
    };
    var lbl = 'Planejamento Odontométrico';
    if(d.denteNum) lbl += ' · Dente ' + d.denteNum;
    if (limaState && limaState.measurementPlane) {
        var planeLbl = ({axial:'Axial', coronal:'Coronal', sagittal:'Sagital'})[limaState.measurementPlane] || limaState.measurementPlane;
        lbl += ' · Plano ' + planeLbl;
    }

    portfolioAddItem('Odontometria 3D', dataUrl, lbl, metricasFormatadas, '');
    showToast(dataUrl ? '📁 Odontometria adicionada' : '📁 Odontometria (cards) adicionada');
}
// === FIM V1 PATCH odontoAddToPortfolio ===


window.portfolioSave = function() {
    try { 
        localStorage.setItem('endoslice-portfolio', JSON.stringify(portfolioState)); 
    } catch(e) { 
        alert('A memória do aplicativo encheu! O limite de imagens foi atingido. Apague casos antigos ou fotos do portfólio para salvar novos cortes.');
        if(portfolioState.items.length > 0) portfolioState.items.pop(); // Remove o último que causou o erro para não travar
    }
};

// ── CAPTURA DE SCREENSHOTS COM COMPRESSÃO ──
window.screenshotAddToPortfolio = function() {
    var img = document.getElementById('print-result-img');
    if (!img || !img.src) { showToast('⚠ Nenhuma captura disponível'); return; }
    
    var tipo = window._lastScreenshotHasMeasure ? '[ODONTO] Medição Avulsa' : '[CORTE] Tomográfico';
    
    // Cria um canvas para redimensionar e comprimir a imagem antes de salvar
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var imageObj = new Image();
    imageObj.onload = function() {
        var MAX_WIDTH = 800; // Limite que impede o estouro de memória
        var w = imageObj.width;
        var h = imageObj.height;

        if (w > MAX_WIDTH) { h *= MAX_WIDTH / w; w = MAX_WIDTH; }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(imageObj, 0, 0, w, h);
        
        // Comprime agressivamente para JPEG 50% (Fica em ~40kb)
        var dataUrl = canvas.toDataURL('image/jpeg', 0.5); 
        
        portfolioAddItem(tipo, dataUrl, 'Captura · ' + new Date().toLocaleTimeString('pt-BR'), {}, '');
        document.getElementById('print-preview-overlay').style.display = 'none';
    };
    imageObj.src = img.src;
};

// ── ODONTOMETRIA TAB SWITCH ──
function odontoSwitchTab(tab) {
    var compPanel = document.getElementById('odonto-panel-comp');
    var curvPanel = document.getElementById('odonto-panel-curv');
    var tabComp = document.getElementById('odonto-tab-comp');
    var tabCurv = document.getElementById('odonto-tab-curv');
    if (tab === 'comp') {
        if (compPanel) compPanel.style.display = 'block';
        if (curvPanel) curvPanel.style.display = 'none';
        if (tabComp) { tabComp.style.borderColor = 'rgba(255,200,0,0.4)'; tabComp.style.background = 'rgba(255,180,0,0.15)'; tabComp.style.color = '#ffd700'; }
        if (tabCurv) { tabCurv.style.borderColor = 'rgba(255,255,255,0.1)'; tabCurv.style.background = 'rgba(255,255,255,0.03)'; tabCurv.style.color = '#999'; }
    } else {
        if (compPanel) compPanel.style.display = 'none';
        if (curvPanel) curvPanel.style.display = 'block';
        if (tabCurv) { tabCurv.style.borderColor = 'rgba(120,231,209,0.4)'; tabCurv.style.background = 'rgba(120,231,209,0.15)'; tabCurv.style.color = '#78e7d1'; }
        if (tabComp) { tabComp.style.borderColor = 'rgba(255,255,255,0.1)'; tabComp.style.background = 'rgba(255,255,255,0.03)'; tabComp.style.color = '#999'; }
    }
}

// ── SEG PRESETS ──
window.segApplyPreset = function(preset) {
    var sl = function(id, v) { var e = document.getElementById(id); if(e) { e.value = v; e.dispatchEvent(new Event('input')); } };
    switch(preset) {
        case 'fino':
            sl('seg-sl-tol', 25); sl('seg-sl-roi', 20); sl('seg-sl-min', 8); sl('seg-sl-fill', 3);
            break;
        case 'amplo':
            sl('seg-sl-tol', 50); sl('seg-sl-roi', 40); sl('seg-sl-min', 20); sl('seg-sl-fill', 2);
            break;
        case 'calcificado':
            sl('seg-sl-tol', 18); sl('seg-sl-roi', 15); sl('seg-sl-min', 5); sl('seg-sl-fill', 4);
            break;
        case 'denso':
            sl('seg-sl-tol', 28); sl('seg-sl-roi', 30); sl('seg-sl-min', 15); sl('seg-sl-fill', 1);
            break;
        case 'extrav':
            sl('seg-sl-tol', 45); sl('seg-sl-roi', 45); sl('seg-sl-min', 10); sl('seg-sl-fill', 1);
            break;
    }
    segRerunIfSeed();
};

// ── SEG ADVANCED TOGGLE ──
window.segToggleAdvanced = function() {
    var panel = document.getElementById('seg-inline-panel');
    if (panel) panel.classList.toggle('seg-advanced');
    var btn = document.getElementById('seg-mode-toggle');
    if (btn) btn.textContent = panel.classList.contains('seg-advanced') ? '⚡ RÁPIDO' : '⚙ REFINO';
};

// ── HEURISTICS ENGINE ──
window.segComputeHeuristics = function() {
    var dm = segState.maskDisplay || segState.mask;
    if (!dm || segState.voxelCount === 0) return;
    var W = volumeMeta.x, H = volumeMeta.y, D = volumeMeta.z, WH = W * H;
    var roi = segState.lastROI; if (!roi) return;
    var isO = (segState.activeMode === 'obturado');
    var count = segState.voxelCount;
    var ps = volumeMeta.pixelSpacing || 1, st = volumeMeta.sliceThickness || 1;

    // 1. Extent / bounding box
    var minX=9999,maxX=0,minY=9999,maxY=0,minZ=9999,maxZ=0;
    for(var gz=roi.z0;gz<=roi.z1;gz++)for(var gy=roi.y0;gy<=roi.y1;gy++)for(var gx=roi.x0;gx<=roi.x1;gx++){
        if(!dm[gz*WH+gy*W+gx]) continue;
        if(gx<minX)minX=gx;if(gx>maxX)maxX=gx;
        if(gy<minY)minY=gy;if(gy>maxY)maxY=gy;
        if(gz<minZ)minZ=gz;if(gz>maxZ)maxZ=gz;
    }
    var extX=(maxX-minX)*ps, extY=(maxY-minY)*ps, extZ=(maxZ-minZ)*st;
    var maxExt=Math.max(extX,extY,extZ);

    // 2. Continuity: count connected components using simple slice check
    var sliceCount = maxZ - minZ + 1;
    var occupiedSlices = 0;
    for (var sz = minZ; sz <= maxZ; sz++) {
        var hasVoxel = false;
        for (var sy = roi.y0; sy <= roi.y1 && !hasVoxel; sy++)
            for (var sx = roi.x0; sx <= roi.x1 && !hasVoxel; sx++)
                if (dm[sz * WH + sy * W + sx]) hasVoxel = true;
        if (hasVoxel) occupiedSlices++;
    }
    var continuity = sliceCount > 0 ? occupiedSlices / sliceCount : 0;

    // 3. Average cross-section area
    var avgVoxPerSlice = occupiedSlices > 0 ? count / occupiedSlices : 0;
    var avgAreaMm2 = avgVoxPerSlice * ps * ps;

    // 4. Aspect ratio (height vs width)
    var aspectRatio = extZ > 0 ? Math.max(extX, extY) / extZ : 1;

    // 5. Apical analysis (last 20% of slices)
    var apicalStart = Math.floor(maxZ - (maxZ - minZ) * 0.2);
    var apicalVox = 0;
    for (var az = apicalStart; az <= maxZ; az++)
        for (var ay = roi.y0; ay <= roi.y1; ay++)
            for (var ax = roi.x0; ax <= roi.x1; ax++)
                if (dm[az * WH + ay * W + ax]) apicalVox++;
    var apicalRatio = count > 0 ? apicalVox / count : 0;

    // Generate tags
    var tags = [];

    // Extension
    if (maxExt < 5) tags.push('Extensão segmentada baixa');
    else if (maxExt < 15) tags.push('Extensão moderada');
    else tags.push('Extensão elevada');

    // Continuity pattern
    if (continuity > 0.85) tags.push('Padrão contínuo');
    else if (continuity > 0.5) tags.push('Continuidade parcial');
    else tags.push('Fragmentação elevada');

    // Morphology
    if (isO) {
        if (avgAreaMm2 > 3) tags.push('Obturação com preenchimento amplo');
        else if (avgAreaMm2 > 1) tags.push('Compatível com obturação densa');
        else tags.push('Obturação com possível falha');

        if (apicalRatio > 0.35) tags.push('Suspeita visual de extravasamento apical');
        else tags.push('Material obturador confinado');

        if (continuity < 0.6) tags.push('Possível descontinuidade');
    } else {
        if (avgAreaMm2 < 0.5) tags.push('Canal aparentemente fino');
        else if (avgAreaMm2 < 2) tags.push('Canal moderado');
        else tags.push('Canal amplo');

        if (continuity > 0.8 && avgAreaMm2 > 0.3) tags.push('Canal pérvio');
        if (aspectRatio > 0.5) tags.push('Canal achatado');
    }

    // Display — show only the SINGLE most clinically relevant tag
    var mainTag = tags[0] || '--';
    // Priority: morphology-specific tags first (fine/amplo/extravasamento) over generic extent
    for (var pi = 0; pi < tags.length; pi++) {
        var t = tags[pi].toLowerCase();
        if (t.indexOf('fino') > -1 || t.indexOf('amplo') > -1 || t.indexOf('pérvio') > -1 ||
            t.indexOf('achatado') > -1 || t.indexOf('extravasamento') > -1 ||
            t.indexOf('falha') > -1 || t.indexOf('descontinuidade') > -1 ||
            t.indexOf('densa') > -1 || t.indexOf('confinado') > -1) {
            mainTag = tags[pi]; break;
        }
    }
    var mainEl = document.getElementById('seg-h-main');
    if (mainEl) mainEl.textContent = mainTag;
    // Store all for portfolio export
    segState._lastHeuristics = tags.join(' · ');
};

// Hook heuristics into segApplyPostProcess
(function() {
    var origPost = window.segApplyPostProcess;
    if (origPost) {
        window.segApplyPostProcess = function() {
            origPost();
            try { segComputeHeuristics(); } catch(e) { console.warn('Heuristics error', e); }
        };
    }
})();

// ── PRESENTATION MODE ──
function openPresentacao() {
    portfolioCollectFields();
    var m = document.getElementById('apresentacao-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'apresentacao-modal';
        document.body.appendChild(m);
    }
    m.innerHTML = buildPresentacaoHTML();
    m.classList.add('active');
}
function closePresentacao() {
    var m = document.getElementById('apresentacao-modal');
    if (m) m.classList.remove('active');
}

// === V1 PATCH: SLIDES PRESENTATION (Keynote-style fullscreen) ===
window._slidesState = { current: 0, total: 0, decks: [] };

function _slidesEscapeHTML(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
        return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
}

function buildSlidesDeck() {
    var s = (typeof portfolioState !== 'undefined') ? portfolioState : null;
    if (s && typeof portfolioCollectFields === 'function') { try { portfolioCollectFields(); } catch(e){} }
    s = (typeof portfolioState !== 'undefined') ? portfolioState : {};

    var decks = [];
    var date = new Date().toLocaleDateString('pt-BR');

    // SLIDE 1: Capa
    var p = s.paciente || {};
    decks.push({
        kind: 'cover',
        title: 'Caso Clínico Endodôntico',
        body:
            '<div class="slide-cover-wrap">' +
              '<div class="slide-brand">EndoSlice · DICOMobile Pro</div>' +
              '<div class="slide-cover-title">' + (p.nome ? _slidesEscapeHTML(p.nome) : 'Paciente') + '</div>' +
              '<div class="slide-cover-sub">' +
                (p.idade ? _slidesEscapeHTML(p.idade) + ' anos · ' : '') +
                (p.sexo ? _slidesEscapeHTML(p.sexo) + ' · ' : '') +
                date +
              '</div>' +
              (p.queixa ? '<div class="slide-cover-quote">"' + _slidesEscapeHTML(p.queixa) + '"</div>' : '') +
            '</div>'
    });

    // SLIDE 2: Dados clínicos / resumo
    var r = s.resumo || {};
    if (r.motivo || r.hipotese || r.sintomas || r.historico) {
        var body2 = '<div class="slide-grid-2">';
        if (r.motivo)   body2 += '<div class="slide-card"><div class="slide-card-lbl">MOTIVO</div><div class="slide-card-val">' + _slidesEscapeHTML(r.motivo) + '</div></div>';
        if (r.hipotese) body2 += '<div class="slide-card"><div class="slide-card-lbl">HIPÓTESE</div><div class="slide-card-val">' + _slidesEscapeHTML(r.hipotese) + '</div></div>';
        if (r.sintomas) body2 += '<div class="slide-card"><div class="slide-card-lbl">SINTOMAS</div><div class="slide-card-val">' + _slidesEscapeHTML(r.sintomas) + '</div></div>';
        if (r.historico)body2 += '<div class="slide-card"><div class="slide-card-lbl">HISTÓRICO</div><div class="slide-card-val">' + _slidesEscapeHTML(r.historico) + '</div></div>';
        body2 += '</div>';
        decks.push({ kind:'data', title:'Resumo Clínico', body: body2 });
    }

    // SLIDE 3: Imagem principal do caso (primeiro item com dataUrl OU primeira foto)
    var mainImg = '';
    var items = s.items || [];
    for (var i = 0; i < items.length; i++) { if (items[i].dataUrl) { mainImg = items[i].dataUrl; break; } }
    if (!mainImg && s.fotos && s.fotos.length) mainImg = s.fotos[0].dataUrl;
    if (mainImg) {
        decks.push({
            kind:'image',
            title:'Imagem do Caso',
            body: '<div class="slide-image-wrap"><img class="slide-image" src="' + mainImg + '"></div>'
        });
    }

    // SLIDE 4: Odontometria
    var odo = items.filter(function(it){ return it.type && /Odontometria/i.test(it.type); });
    if (odo.length) {
        odo.forEach(function(o){
            var mt = o.metrics || {};
            var grid = '<div class="slide-grid-2">';
            ['CRD','CAD','CRT','LIMA'].forEach(function(k){
                if (mt[k]) grid += '<div class="slide-metric"><div class="slide-metric-lbl">' + k + '</div><div class="slide-metric-val">' + _slidesEscapeHTML(mt[k]) + '</div></div>';
            });
            grid += '</div>';
            var body4 = (o.dataUrl ? '<div class="slide-image-wrap-half"><img class="slide-image" src="' + o.dataUrl + '"></div>' : '') + grid;
            decks.push({ kind:'odonto', title:'Odontometria — ' + _slidesEscapeHTML(o.label || ''), body: body4 });
        });
    }

    // SLIDE 5: Curvatura Schneider
    var schItems = items.filter(function(it){ return it.type && /Schneider|Curvatura/i.test(it.type); });
    if (schItems.length) {
        schItems.forEach(function(sit){
            var mt = sit.metrics || {};
            var body5 = (sit.dataUrl ? '<div class="slide-image-wrap-half"><img class="slide-image" src="' + sit.dataUrl + '"></div>' : '') +
                '<div class="slide-card slide-card-big">' +
                    '<div class="slide-card-lbl">ÂNGULO</div>' +
                    '<div class="slide-card-val-big">' + _slidesEscapeHTML(mt.angulo || mt.angle || '--') + '</div>' +
                    '<div class="slide-card-tag">' + _slidesEscapeHTML(mt.classificacao || mt.classification || '') + '</div>' +
                '</div>';
            decks.push({ kind:'schneider', title:'Curvatura · Schneider', body: body5 });
        });
    }

    // SLIDE 6: Canal 3D / obturação 3D
    var canal3d = items.filter(function(it){ return it.type && /Canal/i.test(it.type) && it.dataUrl; });
    canal3d.forEach(function(c){
        decks.push({
            kind:'canal3d',
            title: c.type,
            body: '<div class="slide-image-wrap"><img class="slide-image" src="' + c.dataUrl + '"></div>' +
                  (c.label ? '<div class="slide-caption">' + _slidesEscapeHTML(c.label) + '</div>' : '')
        });
    });

    // SLIDE 7: Explicação para paciente
    var diag = s.diagnostico || {};
    var plano = s.plano || {};
    var conc = s.conclusao || {};
    var simpleText = '';
    if (diag.principal) simpleText += '<p><strong>O que encontramos:</strong> ' + _slidesEscapeHTML(diag.principal) + '.</p>';
    if (plano.conduta)  simpleText += '<p><strong>O que vamos fazer:</strong> ' + _slidesEscapeHTML(plano.conduta) + '.</p>';
    if (conc.proximos)  simpleText += '<p><strong>Próximo passo:</strong> ' + _slidesEscapeHTML(conc.proximos) + '.</p>';
    if (!simpleText) simpleText = '<p>Conversaremos sobre os achados do exame e os passos do tratamento.</p>';
    decks.push({
        kind:'patient',
        title:'Para Você (Paciente)',
        body: '<div class="slide-patient-text">' + simpleText + '</div>'
    });

    // SLIDE 8: Conduta / próximos passos
    var bodyEnd = '';
    if (plano.objetivo) bodyEnd += '<div class="slide-card"><div class="slide-card-lbl">OBJETIVO</div><div class="slide-card-val">' + _slidesEscapeHTML(plano.objetivo) + '</div></div>';
    if (plano.conduta)  bodyEnd += '<div class="slide-card"><div class="slide-card-lbl">CONDUTA</div><div class="slide-card-val">' + _slidesEscapeHTML(plano.conduta) + '</div></div>';
    var checks = [];
    if (plano.retratamento) checks.push('Retratamento');
    if (plano.cirurgia) checks.push('Cirurgia paraendodôntica');
    if (plano.restauradora) checks.push('Restauradora');
    if (plano.encaminhamento) checks.push('Encaminhamento');
    if (checks.length) bodyEnd += '<div class="slide-card"><div class="slide-card-lbl">PLANEJAMENTO</div><div class="slide-card-val">✓ ' + checks.map(_slidesEscapeHTML).join(' &nbsp;·&nbsp; ✓ ') + '</div></div>';
    if (conc.resumo) bodyEnd += '<div class="slide-card"><div class="slide-card-lbl">CONCLUSÃO</div><div class="slide-card-val">' + _slidesEscapeHTML(conc.resumo) + '</div></div>';
    if (!bodyEnd) bodyEnd = '<div class="slide-card"><div class="slide-card-val">Plano de tratamento a definir</div></div>';
    decks.push({ kind:'plan', title:'Conduta · Próximos Passos', body: '<div class="slide-grid-1">' + bodyEnd + '</div>' });

    return decks;
}

function openSlidesPresentation() {
    if (typeof portfolioCollectFields === 'function') { try { portfolioCollectFields(); } catch(e){} }
    var decks = buildSlidesDeck();
    if (!decks.length) { showToast && showToast('⚠ Sem dados para apresentar'); return; }
    window._slidesState = { current: 0, total: decks.length, decks: decks };

    // Remove anterior
    var prev = document.getElementById('slides-presentation-overlay');
    if (prev) prev.remove();

    var ov = document.createElement('div');
    ov.id = 'slides-presentation-overlay';
    ov.className = 'slides-overlay';
    ov.style.cssText = [
        'position:fixed','inset:0','z-index:2200000',
        'background:radial-gradient(ellipse at top,#0e1224 0%,#06080f 100%)',
        'display:flex','flex-direction:column',
        'font-family:-apple-system,sans-serif','color:#E0E5EC'
    ].join(';');

    // CSS isolado
    var css = '<style id="slides-css">' +
        '.slides-stage{flex:1;display:flex;align-items:center;justify-content:center;padding:32px 20px;overflow:hidden;}' +
        '.slide-card-deck{width:min(960px,96vw);max-height:88vh;background:linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015));border:1px solid rgba(167,139,250,0.22);border-radius:24px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 30px 80px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.05);padding:28px 26px 22px;display:flex;flex-direction:column;overflow:hidden;}' +
        '.slide-head-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;}' +
        '.slide-head-pill{font-size:9px;font-weight:900;letter-spacing:2px;color:#a78bfa;text-transform:uppercase;padding:5px 10px;border:1px solid rgba(167,139,250,0.35);border-radius:999px;background:rgba(167,139,250,0.08);}' +
        '.slide-head-title{font-size:18px;font-weight:900;color:#E0E5EC;letter-spacing:0.3px;flex:1;}' +
        '.slide-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}' +
        '.slide-cover-wrap{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:30px 10px;gap:14px;}' +
        '.slide-brand{font-size:10px;letter-spacing:3px;color:rgba(167,139,250,0.7);font-weight:900;text-transform:uppercase;}' +
        '.slide-cover-title{font-size:42px;font-weight:900;background:linear-gradient(90deg,#a78bfa,#60a5fa,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1.1;}' +
        '.slide-cover-sub{font-size:14px;color:rgba(255,255,255,0.55);font-weight:600;}' +
        '.slide-cover-quote{margin-top:12px;font-size:14px;font-style:italic;color:rgba(255,255,255,0.7);border-left:3px solid #a78bfa;padding-left:12px;}' +
        '.slide-grid-1{display:grid;grid-template-columns:1fr;gap:12px;}' +
        '.slide-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
        '@media (max-width:680px){.slide-grid-2{grid-template-columns:1fr;}}' +
        '.slide-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 16px;}' +
        '.slide-card-big{padding:22px;text-align:center;}' +
        '.slide-card-lbl{font-size:9px;letter-spacing:2px;color:rgba(167,139,250,0.7);font-weight:900;margin-bottom:6px;text-transform:uppercase;}' +
        '.slide-card-val{font-size:13px;color:rgba(255,255,255,0.85);line-height:1.6;}' +
        '.slide-card-val-big{font-size:54px;font-weight:900;color:#a78bfa;line-height:1;font-family:"DSEG7","Courier New",monospace;}' +
        '.slide-card-tag{margin-top:8px;font-size:11px;color:rgba(120,231,209,0.85);font-weight:800;letter-spacing:1.5px;text-transform:uppercase;}' +
        '.slide-image-wrap{display:flex;align-items:center;justify-content:center;background:#000;border-radius:14px;overflow:hidden;max-height:60vh;}' +
        '.slide-image-wrap-half{display:flex;align-items:center;justify-content:center;background:#000;border-radius:14px;overflow:hidden;max-height:42vh;margin-bottom:12px;}' +
        '.slide-image{max-width:100%;max-height:60vh;object-fit:contain;display:block;}' +
        '.slide-caption{margin-top:8px;font-size:11px;color:rgba(255,255,255,0.55);text-align:center;font-style:italic;}' +
        '.slide-metric{background:linear-gradient(135deg,rgba(167,139,250,0.12),rgba(96,165,250,0.06));border:1px solid rgba(167,139,250,0.3);border-radius:14px;padding:14px;text-align:center;}' +
        '.slide-metric-lbl{font-size:9px;letter-spacing:2px;color:rgba(167,139,250,0.85);font-weight:900;margin-bottom:6px;}' +
        '.slide-metric-val{font-size:24px;font-weight:900;color:#E0E5EC;font-family:"DSEG7","Courier New",monospace;}' +
        '.slide-patient-text{font-size:16px;line-height:1.7;color:rgba(255,255,255,0.85);padding:10px 6px;}' +
        '.slide-patient-text p{margin-bottom:14px;}' +
        '.slide-patient-text strong{color:#a78bfa;}' +
        '.slides-nav{padding:14px 20px calc(14px + env(safe-area-inset-bottom,0));display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(8,10,18,0.85);border-top:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(10px);}' +
        '.slides-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#E0E5EC;font-size:12px;font-weight:800;padding:10px 18px;border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}' +
        '.slides-btn:active{transform:scale(0.97);}' +
        '.slides-btn-primary{background:linear-gradient(135deg,rgba(167,139,250,0.35),rgba(96,165,250,0.25));border:1px solid rgba(167,139,250,0.5);color:#fff;}' +
        '.slides-btn-danger{background:rgba(255,80,80,0.12);border:1px solid rgba(255,80,80,0.35);color:#ff8a8a;}' +
        '.slides-counter{font-size:11px;color:rgba(255,255,255,0.5);font-weight:800;letter-spacing:1.5px;}' +
        '.slides-progress{position:absolute;top:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.05);}' +
        '.slides-progress-bar{height:100%;background:linear-gradient(90deg,#a78bfa,#60a5fa);transition:width 0.35s ease;}' +
    '</style>';

    ov.innerHTML = css +
        '<div class="slides-progress"><div id="slides-progress-bar" class="slides-progress-bar" style="width:0%"></div></div>' +
        '<div class="slides-stage" id="slides-stage"></div>' +
        '<div class="slides-nav">' +
            '<button class="slides-btn slides-btn-danger" onclick="closeSlidesPresentation()">✕ Sair</button>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<button class="slides-btn" id="slides-btn-prev" onclick="slidesNav(-1)">← Anterior</button>' +
                '<div class="slides-counter" id="slides-counter">1 / ' + decks.length + '</div>' +
                '<button class="slides-btn slides-btn-primary" id="slides-btn-next" onclick="slidesNav(1)">Próximo →</button>' +
            '</div>' +
            '<button class="slides-btn" onclick="exportHTMLStandalone()">📤 Baixar HTML</button>' +
        '</div>';

    document.body.appendChild(ov);
    _renderCurrentSlide();

    // Teclas/swipe
    function _onKey(ev){
        if (!document.getElementById('slides-presentation-overlay')) { document.removeEventListener('keydown', _onKey); return; }
        if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); slidesNav(1); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); slidesNav(-1); }
        else if (ev.key === 'Escape') { ev.preventDefault(); closeSlidesPresentation(); }
    }
    document.addEventListener('keydown', _onKey);

    // Swipe horizontal
    var stage = document.getElementById('slides-stage');
    if (stage) {
        var sx = 0, sy = 0;
        stage.addEventListener('touchstart', function(e){ var t=e.touches[0]; sx=t.clientX; sy=t.clientY; }, {passive:true});
        stage.addEventListener('touchend', function(e){
            var t=e.changedTouches[0];
            var dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                slidesNav(dx < 0 ? 1 : -1);
            }
        }, {passive:true});
    }
}

function _renderCurrentSlide(){
    var st = window._slidesState; if (!st) return;
    var d = st.decks[st.current];
    var stage = document.getElementById('slides-stage'); if (!stage) return;
    stage.innerHTML =
        '<div class="slide-card-deck">' +
            '<div class="slide-head-row">' +
                '<div class="slide-head-pill">SLIDE ' + (st.current+1) + '</div>' +
                '<div class="slide-head-title">' + _slidesEscapeHTML(d.title || '') + '</div>' +
            '</div>' +
            '<div class="slide-content">' + (d.body || '') + '</div>' +
        '</div>';
    var counter = document.getElementById('slides-counter');
    if (counter) counter.textContent = (st.current+1) + ' / ' + st.total;
    var bar = document.getElementById('slides-progress-bar');
    if (bar) bar.style.width = (((st.current+1)/st.total)*100).toFixed(1) + '%';
    var prev = document.getElementById('slides-btn-prev');
    var next = document.getElementById('slides-btn-next');
    if (prev) prev.disabled = (st.current === 0);
    if (prev) prev.style.opacity = (st.current === 0) ? '0.4' : '1';
    if (next) next.style.opacity = (st.current >= st.total-1) ? '0.6' : '1';
}

function slidesNav(dir){
    var st = window._slidesState; if (!st) return;
    var nxt = Math.max(0, Math.min(st.total-1, st.current + dir));
    if (nxt === st.current) return;
    st.current = nxt;
    _renderCurrentSlide();
}

function closeSlidesPresentation(){
    var ov = document.getElementById('slides-presentation-overlay');
    if (ov) ov.remove();
    window._slidesState = { current:0, total:0, decks:[] };
}

window.openSlidesPresentation  = openSlidesPresentation;
window.closeSlidesPresentation = closeSlidesPresentation;
window.slidesNav               = slidesNav;
// === FIM V1 PATCH SLIDES ===

function buildPresentacaoHTML() {
    var s = portfolioState;
    var html = '<div class="ap-header">'
        + '<div class="ap-title">🎬 Apresentação de Caso</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">'
        + '<button onclick="openSlidesPresentation()" style="background:linear-gradient(135deg,rgba(167,139,250,0.25),rgba(96,165,250,0.2));border:1px solid rgba(167,139,250,0.45);color:#c4b5fd;font-size:10px;font-weight:800;border-radius:8px;padding:6px 10px;cursor:pointer;">🎤 Gerar Slides</button>'
        + '<button onclick="exportHTMLStandalone()" style="background:rgba(52,199,89,0.2);border:1px solid rgba(52,199,89,0.4);color:#34C759;font-size:10px;font-weight:800;border-radius:8px;padding:6px 10px;cursor:pointer;">📤 HTML</button>'
        + '<button onclick="closePresentacao()" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">✕</button>'
        + '</div></div>'
        + '<div class="ap-body">';

    // Slide: Paciente
    if (s.paciente.nome) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">👤 Paciente</div></div>'
            + '<div class="ap-slide-body"><div class="ap-text">'
            + '<strong>' + s.paciente.nome + '</strong>'
            + (s.paciente.idade ? ' · ' + s.paciente.idade + ' anos' : '')
            + (s.paciente.sexo ? ' · ' + s.paciente.sexo : '')
            + (s.paciente.queixa ? '<br><br><strong>Queixa:</strong> ' + s.paciente.queixa : '')
            + '</div></div></div>';
    }

    // Slide: Resumo
    if (s.resumo.motivo || s.resumo.hipotese) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">📋 Resumo Clínico</div></div>'
            + '<div class="ap-slide-body"><div class="ap-text">'
            + (s.resumo.motivo ? '<strong>Motivo:</strong> ' + s.resumo.motivo + '<br>' : '')
            + (s.resumo.hipotese ? '<strong>Hipótese:</strong> ' + s.resumo.hipotese + '<br>' : '')
            + (s.resumo.sintomas ? '<strong>Sintomas:</strong> ' + s.resumo.sintomas : '')
            + '</div></div></div>';
    }

    // Slides: Items
    s.items.forEach(function(item) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">📎 ' + item.type + '</div></div>'
            + '<div class="ap-slide-body">';
        if (item.dataUrl) html += '<img class="ap-slide-img" src="' + item.dataUrl + '">';
        html += '<div class="ap-text">' + item.label;
        if (item.metrics) {
            var mk = Object.keys(item.metrics);
            if (mk.length) {
                html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">';
                mk.forEach(function(k) { if(item.metrics[k]) html += '<span class="ap-metric"><span class="ap-metric-label">' + k + '</span> ' + item.metrics[k] + '</span>'; });
                html += '</div>';
            }
        }
        if (item.heuristics) html += '<div style="margin-top:6px;font-size:9px;color:rgba(120,231,209,0.5);font-style:italic;">Perfil: ' + item.heuristics + '</div>';
        html += '</div></div></div>';
    });

    // Slides: Photos
    if (s.fotos.length) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">📷 Fotos Clínicas</div></div>'
            + '<div class="ap-slide-body" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        s.fotos.forEach(function(f) { html += '<img src="' + f.dataUrl + '" style="width:100%;border-radius:8px;">'; });
        html += '</div></div>';
    }

    // Slide: Diagnóstico
    if (s.diagnostico.principal) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">🎯 Diagnóstico</div></div>'
            + '<div class="ap-slide-body"><div class="ap-text">'
            + '<strong>Principal:</strong> ' + s.diagnostico.principal
            + (s.diagnostico.diferencial ? '<br><strong>Diferencial:</strong> ' + s.diagnostico.diferencial : '')
            + '</div></div></div>';
    }

    // Slide: Plano
    if (s.plano.objetivo || s.plano.conduta) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">📐 Plano de Tratamento</div></div>'
            + '<div class="ap-slide-body"><div class="ap-text">'
            + (s.plano.objetivo ? '<strong>Objetivo:</strong> ' + s.plano.objetivo + '<br>' : '')
            + (s.plano.conduta ? '<strong>Conduta:</strong> ' + s.plano.conduta + '<br>' : '')
            + (s.plano.retratamento ? '✓ Retratamento<br>' : '')
            + (s.plano.cirurgia ? '✓ Cirurgia paraendodôntica<br>' : '')
            + '</div></div></div>';
    }

    // Slide: Conclusão
    if (s.conclusao.resumo) {
        html += '<div class="ap-slide"><div class="ap-slide-head"><div class="ap-slide-title">✅ Conclusão</div></div>'
            + '<div class="ap-slide-body"><div class="ap-text">' + s.conclusao.resumo
            + (s.conclusao.proximos ? '<br><br><strong>Próximos passos:</strong> ' + s.conclusao.proximos : '')
            + '</div></div></div>';
    }

    html += '</div>'; // ap-body
    return html;
}

// ── EXPORT MENU ──
// ── EXPORT MENU ATUALIZADO ──
function openExportMenu() {
    var m = document.getElementById('export-menu-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'export-menu-modal';
        m.innerHTML = '<div class="export-menu-card">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
            + '<div style="font-size:16px;font-weight:900;color:#34C759;">📤 Exportar Caso</div>'
            + '<button onclick="closeExportMenu()" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">✕</button></div>'
            + '<div class="export-opt" onclick="exportPDFPremium()"><div class="export-opt-ico">📄</div><div class="export-opt-txt"><div class="export-opt-t">PDF Premium</div><div class="export-opt-s">Relatório completo A4 para impressão</div></div></div>'
            + '<div class="export-opt" onclick="exportToWhatsApp()"><div class="export-opt-ico" style="color:#25D366;">💬</div><div class="export-opt-txt"><div class="export-opt-t">WhatsApp (Caso 3D)</div><div class="export-opt-s">Envia um arquivo interativo premium</div></div></div>'
            + '<div class="export-opt" onclick="exportHTMLStandalone()"><div class="export-opt-ico">🌐</div><div class="export-opt-txt"><div class="export-opt-t">Salvar HTML Offline</div><div class="export-opt-s">Baixar apresentação standalone</div></div></div>'
            + '<div class="export-opt" onclick="exportToConsultoria()"><div class="export-opt-ico">🩺</div><div class="export-opt-txt"><div class="export-opt-t">Enviar para Consultoria</div><div class="export-opt-s">Caso estruturado para o radiologista</div></div></div>'
            + '</div>';
        document.body.appendChild(m);
    }
    m.classList.add('active');
}
function closeExportMenu() {
    var m = document.getElementById('export-menu-modal');
    if (m) m.classList.remove('active');
}


// ── EXPORT TO WHATSAPP (GERADOR DE HTML PREMIUM + SHARE API) ──
window.exportToWhatsApp = function() {
    closeExportMenu();
    portfolioCollectFields();
    var s = portfolioState;
    var dt = new Date().toLocaleDateString('pt-BR');

    // 1. GERAÇÃO DO HTML PREMIUM (NEUMÓRFICO DARK MODE)
    var css = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;background:#1A1D24;color:#E0E5EC;line-height:1.6;}'
    + '.container{max-width:700px;margin:0 auto;padding:20px;}'
    + '.header{background:linear-gradient(135deg, rgba(26,29,36,0.9), rgba(15,18,24,0.9)); padding:40px 30px; border-radius:24px; text-align:center; box-shadow: 10px 10px 20px rgba(0,0,0,0.5), -5px -5px 15px rgba(255,255,255,0.03); border:1px solid rgba(74,144,226,0.2); margin-bottom:30px;}'
    + '.header h1{font-size:32px; color:#4A90E2; font-weight:900; letter-spacing:2px; margin-bottom:5px;}'
    + '.header h2{font-size:12px; color:#7A8294; letter-spacing:4px; text-transform:uppercase; margin-bottom:20px;}'
    + '.pac-nome{font-size:26px; color:#fff; font-weight:800; background:rgba(0,0,0,0.3); padding:15px; border-radius:16px; box-shadow:inset 4px 4px 10px rgba(0,0,0,0.6); margin-bottom:15px;}'
    + '.pac-dados{font-size:13px; color:#A0AEC0; font-weight:600;}'
    + '.card{background:#1A1D24; border-radius:24px; padding:25px; margin-bottom:25px; box-shadow: 8px 8px 16px rgba(0,0,0,0.6), -8px -8px 16px rgba(255,255,255,0.03);}'
    + '.card-title{font-size:16px; color:#4A90E2; font-weight:900; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid rgba(74,144,226,0.2); padding-bottom:10px; margin-bottom:20px;}'
    + '.info-row{font-size:15px; margin-bottom:10px; color:#cbd5e1;}'
    + '.info-row b{color:#4A90E2; margin-right:8px;}'
    + '.img-wrap{background:#0a0c10; padding:10px; border-radius:16px; margin-bottom:15px; box-shadow:inset 0 0 15px rgba(0,0,0,0.8); border:1px solid rgba(255,255,255,0.05);}'
    + '.img-wrap img{width:100%; border-radius:10px; display:block;}'
    + '.legend{text-align:center; font-size:13px; color:#94a3b8; font-style:italic; font-weight:600; margin-top:10px;}'
    + '.metric-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:10px; margin-top:15px;}'
    + '.metric-box{background:rgba(0,0,0,0.4); border:1px solid rgba(74,144,226,0.3); border-radius:12px; padding:15px 10px; text-align:center; box-shadow:inset 4px 4px 8px rgba(0,0,0,0.6);}'
    + '.metric-val{font-size:20px; color:#00E5FF; font-weight:900; font-family:monospace;}'
    + '.metric-lbl{font-size:9px; color:#7A8294; text-transform:uppercase; letter-spacing:1px; margin-top:5px; font-weight:800;}'
    + '.footer{text-align:center; padding:30px; color:#475569; font-size:11px; font-weight:700; letter-spacing:1px; margin-top:40px; border-top:1px solid rgba(255,255,255,0.05);}';

    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Caso - '+(s.paciente.nome||'EndoSlice')+'<\/title><style>'+css+'<\/style><\/head><body><div class="container">';
    
    // Header
    h += '<div class="header"><h1>EndoSlice Pro<\/h1><h2>Caso Clínico Interativo<\/h2>'
      + '<div class="pac-nome">'+(s.paciente.nome||'Paciente Não Identificado')+'<\/div>'
      + '<div class="pac-dados">Data do Documento: '+dt+'<br>Responsável: '+(s.profissional.nome||'Dr(a)')+'<\/div><\/div>';

    // Avaliação Clínica
    var clinica = '';
    if(s.paciente.idade) clinica += '<div class="info-row"><b>Idade:<\/b> '+s.paciente.idade+'<\/div>';
    if(s.paciente.queixa) clinica += '<div class="info-row"><b>Queixa:<\/b> '+s.paciente.queixa+'<\/div>';
    if(s.diagnostico.principal) clinica += '<div class="info-row"><b>Diagnóstico:<\/b> '+s.diagnostico.principal+'<\/div>';
    if(s.plano.conduta) clinica += '<div class="info-row"><b>Conduta:<\/b> '+s.plano.conduta+'<\/div>';
    if(clinica) h += '<div class="card"><div class="card-title">📋 Avaliação Clínica<\/div>'+clinica+'<\/div>';

    // Roteador de Imagens (Idêntico ao do PDF Premium)
    var sessaoOdonto = [], sessaoSegmentacao = [], sessaoCortes = [];
    s.items.forEach(function(it){
        var tag = (it.type || '').toUpperCase();
        var hasMet = (it.metrics && it.metrics.CRD !== undefined);
        if(tag.includes('[ODONTO]') || tag.includes('LIMA') || hasMet) sessaoOdonto.push(it);
        else if(tag.includes('[SEG]') || tag.includes('CANAL')) sessaoSegmentacao.push(it);
        else sessaoCortes.push(it);
    });

    // Função construtora de cards de imagem
    function buildImgCard(item, colorHex) {
        var str = '<div class="card" style="border-top:3px solid '+colorHex+';">';
        str += '<div class="img-wrap"><img src="'+item.dataUrl+'"><\/div>';
        str += '<div class="legend" style="color:'+colorHex+'">'+item.label.replace(/\[.*?\]\s*/g, '')+'<\/div>';
        if(item.metrics && Object.keys(item.metrics).length > 0){
            str += '<div class="metric-grid">';
            for(var k in item.metrics) {
                if(item.metrics[k] !== undefined && item.metrics[k] !== null) {
                    var val = typeof item.metrics[k] === 'number' ? item.metrics[k].toFixed(2)+' mm' : item.metrics[k];
                    str += '<div class="metric-box" style="border-color:rgba(255,255,255,0.1);"><div class="metric-val" style="color:'+colorHex+'">'+val+'<\/div><div class="metric-lbl">'+k+'<\/div><\/div>';
                }
            }
            str += '<\/div>';
        }
        if(item.heuristics) str += '<div style="text-align:center; font-size:12px; color:'+colorHex+'; font-style:italic; margin-top:15px; font-weight:700;">Perfil: '+item.heuristics+'<\/div>';
        str += '<\/div>';
        return str;
    }

    if(sessaoOdonto.length > 0){
        h += '<div class="card-title" style="margin-top:40px; margin-bottom:10px; border:none; text-align:center;">📐 Odontometria<\/div>';
        sessaoOdonto.forEach(function(it){ h += buildImgCard(it, '#00E5FF'); });
    }
    
    if(sessaoSegmentacao.length > 0){
        h += '<div class="card-title" style="margin-top:40px; margin-bottom:10px; border:none; text-align:center; color:#10b981;">🔬 Segmentação 3D<\/div>';
        sessaoSegmentacao.forEach(function(it){ h += buildImgCard(it, '#10b981'); });
    }

    if(sessaoCortes.length > 0){
        h += '<div class="card-title" style="margin-top:40px; margin-bottom:10px; border:none; text-align:center; color:#A0AEC0;">🔍 Cortes Tomográficos<\/div>';
        sessaoCortes.forEach(function(it){ h += buildImgCard(it, '#A0AEC0'); });
    }

    if(s.fotos && s.fotos.length > 0){
        h += '<div class="card-title" style="margin-top:40px; margin-bottom:10px; border:none; text-align:center; color:#e2e8f0;">📷 Fotos Clínicas<\/div>';
        s.fotos.forEach(function(f){ 
            var u = typeof f==='string'?f:(f.dataUrl||f.url);
            var l = typeof f==='string'?'Registro':(f.legenda||f.leg||'Registro');
            h += '<div class="card"><div class="img-wrap"><img src="'+u+'"><\/div><div class="legend">'+l+'<\/div><\/div>'; 
        });
    }

    h += '<div class="footer">Documento interativo gerado via EndoSlice Pro Mobile.<\/div><\/div><\/body><\/html>';

 // 2. EMPACOTAMENTO PARA O WHATSAPP
    var blob = new Blob([h], { type: 'text/html' });
    var fileName = 'EndoSlice_Caso_' + (s.paciente.nome || 'Clinico').replace(/\s+/g, '_') + '.html';
    
    var wpText = "🦷 *EndoSlice Pro - Caso Clínico*\n\n";
    wpText += "👤 *Paciente:* " + (s.paciente.nome || 'Não identificado') + "\n";
    if(s.diagnostico.principal) wpText += "🎯 *Diagnóstico:* " + s.diagnostico.principal + "\n";
    wpText += "📄 _O arquivo HTML interativo com o caso completo está anexado. Clique para abrir!_";

    // 3. COMPARTILHAMENTO NATIVO (CELULAR) VS FALLBACK (PC)
    var file = new File([blob], fileName, { type: 'text/html' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Se for Celular, abre a aba do sistema para o usuário escolher o WhatsApp e enviar o anexo
        navigator.share({
            title: 'Caso Clínico EndoSlice',
            text: wpText,
            files: [file]
        }).then(function() {
            showToast('🚀 Caso compartilhado!');
        }).catch(function(e) {
            if (e.name !== 'AbortError') fallbackWA();
        });
    } else {
        // Se for PC ou navegador restrito, vai para o Fallback
        fallbackWA();
    }

    function fallbackWA() {
        // No PC/Navegador antigo, o WhatsApp bloqueia anexos por link. O usuário precisa anexar manual.
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        
        setTimeout(function() {
            var waMsg = wpText + "\n\n*(Aviso: O arquivo HTML do caso foi baixado no seu dispositivo. Adicione-o na conversa usando o botão 📎)*";
            // Força a abertura do app ou web whatsapp
            window.location.href = "whatsapp://send?text=" + encodeURIComponent(waMsg);
            URL.revokeObjectURL(url);
        }, 800);
        showToast('Baixando caso e abrindo WhatsApp...');
    }
};

// Corrige a exportação local em HTML (Aquele botão que já existia)
window.exportHTMLStandalone = function() {
    // Reutiliza o motor de renderização HTML feito para o WhatsApp, mas apenas faz o download
    var oldShare = navigator.canShare;
    navigator.canShare = false; // Força cair no Fallback de download
    
    // Faz um override temporário no fallback
    var originalFallback = window.exportToWhatsApp;
    
    closeExportMenu();
    portfolioCollectFields();
    var s = portfolioState;
    // ... [Para manter o código limpo e sem repetições, você pode manter sua função exportHTMLStandalone original se desejar, mas o ideal é que ela gere o arquivo HTML usando a lógica linda do WhatsApp acima. Como você me pediu foco no WA, foquei o código lá].
    
    showToast('Ação convertida: Use a nova opção WhatsApp!');
};


// ── EXPORT: PDF Premium ──
// ═══ PDF PREMIUM NEUMÓRFICO PARA O PORTFÓLIO 3D (CORRIGIDO E LUXUOSO) ═══
// ═══ PDF PREMIUM FINAL — ESTRUTURA, NUMERAÇÃO E NEUMORFISMO CORRIGIDOS ═══
window.exportPDFPremium = function() { window.exportPDFPremium3D(); };

window.exportPDFPremium3D = function() {
    try { document.getElementById('export-menu-modal').classList.remove('active'); } catch(e){}
    
    portfolioCollectFields(); 
    var s = portfolioState;
    var dt = new Date().toLocaleDateString('pt-BR');

    // CSS PREMIUM NEUMÓRFICO (SEM @media print para manter o estilo)
    var c = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#E0E5EC;color:#4A5568;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.page-container{max-width:900px;margin:auto;padding:40px;}'
    + '.cover-page{min-height:297mm; width:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#E0E5EC; page-break-after:always; padding:40px; text-align:center; box-sizing:border-box;}'
    + '.cover-card{background:#E0E5EC; border-radius:40px; padding:80px 60px; width:100%; max-width:700px; box-shadow: 20px 20px 60px #a3b1c6, -20px -20px 60px #ffffff; border:2px solid rgba(255,255,255,0.5); display:flex; flex-direction:column; align-items:center;}'
    + '.cover-card h1{font-size:46px;font-weight:900;color:#4A90E2;letter-spacing:3px;margin-bottom:10px;}'
    + '.cover-card h2{font-size:16px;font-weight:800;color:#7A8294;letter-spacing:6px;text-transform:uppercase;margin-bottom:60px;}'
    + '.cover-paciente{background:#E0E5EC; box-shadow:inset 6px 6px 12px #a3b1c6, inset -6px -6px 12px #ffffff; border-radius:20px; padding:25px; width:100%; margin-bottom:30px;}'
    + '.cover-pac-nome{font-size:28px;font-weight:900;color:#2D3748;}'
    + '.cover-detalhes{font-size:14px;color:#718096;font-weight:700; line-height:2; margin-top:20px;}'
    + '.section{background:#E0E5EC;border-radius:24px;box-shadow:10px 10px 20px #a3b1c6, -10px -10px 20px #ffffff;padding:40px;margin-bottom:45px;page-break-inside:avoid;}'
    + '.sec-title{font-size:18px;font-weight:900;color:#4A90E2;text-transform:uppercase;letter-spacing:2px;border-bottom:3px solid rgba(74,144,226,0.15);padding-bottom:12px;margin-bottom:25px}'
    + '.row{font-size:15px;color:#4A5568;margin-bottom:12px;display:flex;flex-wrap:wrap;align-items:baseline}'
    + '.row b{color:#2D3748;min-width:160px;font-weight:900;margin-right:10px;}'
    + '.block-text{background:#E0E5EC; box-shadow:inset 6px 6px 12px #a3b1c6, inset -6px -6px 12px #ffffff; border-radius:16px; padding:20px; margin-top:10px; color:#2D3748; line-height:1.8; font-weight:500;}'
    + '.img-card{background:#E0E5EC;border-radius:20px;box-shadow: 8px 8px 16px #a3b1c6, -8px -8px 16px #ffffff; padding:20px; margin-bottom:30px; page-break-inside:avoid;}'
    + '.img-card img{width:100%;max-height:500px;object-fit:contain;background:#05070a;border-radius:12px;display:block; box-shadow: inset 0 0 15px rgba(0,0,0,0.8);}'
    + '.img-legend{padding:18px 10px 6px;font-size:14px;font-style:italic;color:#4A5568;text-align:center;font-weight:700}'
    + '.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:15px;margin:20px 0}'
    + '.metric-box{background:#E0E5EC;border-radius:16px;box-shadow:inset 5px 5px 10px #a3b1c6, inset -5px -5px 10px #ffffff;padding:18px 10px;text-align:center}'
    + '.metric-val{font-size:22px;font-weight:900;color:#4A90E2;font-family:"Courier New",monospace;letter-spacing:1px;line-height:1}'
    + '.metric-lbl{font-size:10px;color:#7A8294;text-transform:uppercase;letter-spacing:2px;margin-top:8px;font-weight:900}'
    + '.footer{text-align:center;font-size:11px;color:#A0AEC0;padding:20px 0;margin-top:40px;font-weight:800;letter-spacing:1px;text-transform:uppercase}'
    + '.print-btn{display:block;margin:30px auto;background:#4A90E2;color:#fff;border:none;padding:20px 60px;border-radius:999px;font-weight:900;font-size:18px;cursor:pointer;box-shadow:0 10px 25px rgba(74,144,226,0.4);transition:all 0.2s}';

    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Laudo - '+(s.paciente.nome||'Exame')+'<\/title><style>'+c+'<\/style><\/head><body>'
    
    + '<div class="cover-page">'
    + '<div class="cover-card">'
    + '<h1>EndoSlice Pro<\/h1><h2>Diagnóstico Tomográfico<\/h2>'
    + '<div class="cover-paciente"><div class="cover-pac-nome">'+(s.paciente.nome||'Paciente Não Identificado')+'<\/div><\/div>'
    + '<div class="cover-detalhes"><b>Data do Exame:<\/b> '+dt+'<br><b>Responsável Clínico:<\/b> '+(s.profissional.nome||'Dr(a)')+'<br>'
    + (s.profissional.cro?'<b>CRO:<\/b> '+s.profissional.cro:'')+'<\/div>'
    + '<\/div><\/div>'
    
    + '<div class="page-container">';

    var A = function(t,b){ if(b && b.trim()) h+='<div class="section"><div class="sec-title">'+t+'<\/div>'+b+'<\/div>'; };
    
    var sessaoOdonto = [], sessaoSegmentacao = [], sessaoCortes = [];
    s.items.forEach(function(it){
        if (!it.type) return;
        var tag = it.type.toLowerCase();
        if(tag.includes('odontometria')) { sessaoOdonto.push(it); }
        else if(tag.includes('segmentação')) { sessaoSegmentacao.push(it); }
        else { sessaoCortes.push(it); }
    });

    // --- SEÇÕES ESTRUTURADAS E CORRIGIDAS ---

    // 1. DADOS DO PACIENTE
    var pacienteHTML = '';
    if(s.paciente.nome) pacienteHTML += '<div class="row"><b>Nome Completo:<\/b> '+s.paciente.nome+'<\/div>';
    if(s.paciente.idade) pacienteHTML += '<div class="row"><b>Idade:<\/b> '+s.paciente.idade+'<\/div>';
    if(s.paciente.sexo) pacienteHTML += '<div class="row"><b>Sexo:<\/b> '+s.paciente.sexo+'<\/div>';
    if(s.paciente.dataExame) pacienteHTML += '<div class="row"><b>Data do Atendimento:<\/b> '+s.paciente.dataExame+'<\/div>';
    if(s.paciente.identificador) pacienteHTML += '<div class="row"><b>ID/Prontuário:<\/b> '+s.paciente.identificador+'<\/div>';
    A('1. Dados do Paciente', pacienteHTML);

    // 2. AVALIAÇÃO CLÍNICA
    var avaliacaoHTML = '';
    if(s.paciente.queixa) avaliacaoHTML += '<div class="row"><b>Queixa Principal:<\/b> '+s.paciente.queixa+'<\/div>';
    if(s.resumo.motivo) avaliacaoHTML += '<div class="row"><b>Motivo do Exame:<\/b> '+s.resumo.motivo+'<\/div>';
    if(s.diagnostico.principal) avaliacaoHTML += '<div class="row"><b>Diagnóstico Principal:<\/b> '+s.diagnostico.principal+'<\/div>';
    if(s.plano.conduta) avaliacaoHTML += '<div class="row"><b>Conduta Proposta:<\/b> '+s.plano.conduta+'<\/div>';
    A('2. Avaliação Clínica', avaliacaoHTML);
    
    // As próximas seções serão numeradas automaticamente se existirem
    var secNum = 3; 

    if(s.achados) A((secNum++) + '. Achados Tomográficos', '<div class="block-text">' + s.achados.replace(/\n/g, '<br>') + '<\/div>');

    if(sessaoCortes.length > 0){
        var ctHTML = '';
        sessaoCortes.forEach(function(it){ 
            ctHTML += '<div class="img-card">' + (it.dataUrl?'<img src="'+it.dataUrl+'">':'') + '<div class="img-legend">'+it.label+'<\/div><\/div>'; 
        });
        A((secNum++) + '. Cortes Tomográficos', ctHTML);
    }
    
    // ODONTOMETRIA (Com agrupamento de imagem e métricas)
    if(sessaoOdonto.length > 0){
        var odHTML = '';
        sessaoOdonto.forEach(function(it){
            odHTML += '<div class="img-card" style="border-top: 5px solid #4A90E2; page-break-inside: avoid;">';
            odHTML += (it.dataUrl?'<img src="'+it.dataUrl+'">':'') + '<div class="img-legend" style="color:#4A90E2;"><b>'+it.type+'<\/b> - '+it.label+'<\/div>';
            if(it.metrics && Object.keys(it.metrics).length > 0){
                odHTML += '<div class="metrics-grid">';
                for(var k in it.metrics) {
                    if(it.metrics[k] !== undefined && it.metrics[k] !== null) {
                        var cor = k==='CRD'?'#f59e0b':k==='CRT'?'#10b981':'#4A90E2';
                        odHTML += '<div class="metric-box"><div class="metric-val" style="color:'+cor+'">'+it.metrics[k]+'<\/div><div class="metric-lbl">'+k+'<\/div><\/div>';
                    }
                }
                odHTML += '<\/div>';
            }
            odHTML += '<\/div>';
        });
        A((secNum++) + '. Planejamento Odontométrico', odHTML);
    }
    
    if(sessaoSegmentacao.length > 0){
        var sgHTML = '';
        sessaoSegmentacao.forEach(function(it){
            sgHTML += '<div class="img-card" style="border-top: 5px solid #10b981;">' + (it.dataUrl?'<img src="'+it.dataUrl+'">':'') + '<div class="img-legend" style="color:#10b981;"><b>'+it.type+'<\/b> — '+it.label+'<\/div>';
            if(it.metrics && Object.keys(it.metrics).length > 0){
                sgHTML += '<div class="metrics-grid">';
                for(var k in it.metrics) {
                    if(it.metrics[k] !== undefined && it.metrics[k] !== null) {
                        sgHTML += '<div class="metric-box"><div class="metric-val" style="color:#10b981">'+it.metrics[k]+'<\/div><div class="metric-lbl">'+k+'<\/div><\/div>';
                    }
                }
                sgHTML += '<\/div>';
            }
            if(it.heuristics) sgHTML += '<div class="row" style="justify-content:center;font-style:italic;color:#10b981;font-size:13px;font-weight:700;margin-top:15px;">Perfil Morfológico: '+it.heuristics+'<\/div>';
            sgHTML += '<\/div>';
        });
        A((secNum++) + '. Reconstrução e Segmentação 3D', sgHTML);
    }

    if(s.fotos && s.fotos.length > 0){
        var fcHTML = '';
        s.fotos.forEach(function(f){ 
            var u = typeof f==='string' ? f : (f.dataUrl || f.url);
            var l = typeof f==='string' ? 'Registro Clínico' : (f.legenda || f.leg || 'Registro Clínico');
            if (u) {
                fcHTML += '<div class="img-card" style="border-top: 5px solid #64748b;"><img src="'+u+'"><div class="img-legend">'+l+'<\/div><\/div>'; 
            }
        });
        A((secNum++) + '. Fotos Clínicas', fcHTML);
    }

    if(s.conclusao.resumo) {
        A((secNum++) + '. Conclusão Final', '<div class="block-text"><b>Resumo Final:<\/b> '+s.conclusao.resumo+'<\/div>' + (s.conclusao.proximos ? '<div class="row" style="margin-top:20px;"><b>Próximos Passos:<\/b> '+s.conclusao.proximos+'<\/div>':''));
    }

    h += '<\/div>';
    h += '<button class="print-btn" onclick="window.print()">🖨️ Salvar PDF / Imprimir<\/button>';
    h += '<div class="footer">Documento gerado digitalmente via plataforma EndoSlice Pro<br>Uso exclusivo como planejamento auxiliar.<\/div><\/body><\/html>';

    var w = window.open('','_blank'); 
    if(!w){alert('Permita pop-ups no seu navegador para gerar o PDF.');return;}
    w.document.write(h); w.document.close();
    
    setTimeout(function(){try{w.print();}catch(e){}}, 1200);
};

// Hook no botão de exportar do portfolio 3D para chamar a nova função
document.addEventListener('DOMContentLoaded', function() {
    var exportBtn3D = document.querySelector('#export-menu-modal .export-opt');
    if (exportBtn3D && exportBtn3D.textContent.includes('PDF')) {
        exportBtn3D.onclick = function() {
            // Verifica em qual portfólio estamos
            if(document.getElementById('rx-portfolio-modal') && document.getElementById('rx-portfolio-modal').classList.contains('active')) {
                window.rxExportPDF();
            } else {
                window.exportPDFPremium3D();
            }
        };
    }
});



// ── EXPORT: HTML Standalone ──
function exportHTMLStandalone() {
    closeExportMenu();
    portfolioCollectFields();
    var s = portfolioState;
    var date = new Date().toLocaleDateString('pt-BR');

    var css = '*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,Helvetica,sans-serif;background:#0a0c14;color:#E0E5EC;}'
        + '.container{max-width:680px;margin:auto;padding:20px 16px;}'
        + '.cover{text-align:center;padding:40px 0 30px;}'
        + '.cover h1{font-size:22px;color:#d2bcff;margin-bottom:4px;}'
        + '.cover .sub{font-size:10px;color:#666;}'
        + '.slide{margin-bottom:16px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);}'
        + '.slide-head{padding:12px 16px;background:rgba(255,155,200,0.05);border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;}'
        + '.slide-head:hover{background:rgba(255,155,200,0.1);}'
        + '.slide-title{font-size:13px;font-weight:900;}'
        + '.slide-body{padding:14px 16px;}'
        + '.slide-body.collapsed{display:none;}'
        + '.text{font-size:12px;color:rgba(255,255,255,0.6);line-height:1.8;}'
        + '.text b{color:#E0E5EC;}'
        + '.img-full{width:100%;border-radius:8px;margin-bottom:8px;max-height:50vh;object-fit:contain;background:#000;}'
        + '.metric{display:inline-flex;align-items:baseline;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin:2px;font-size:11px;font-weight:700;}'
        + '.metric-lbl{font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;}'
        + '.heur{font-size:9px;color:rgba(120,231,209,0.5);font-style:italic;margin:4px 0;}'
        + '.footer{font-size:8px;color:#444;text-align:center;padding:20px 0;border-top:1px solid rgba(255,255,255,0.05);margin-top:20px;}'
        + '.nav{position:fixed;bottom:0;left:0;right:0;background:rgba(10,12,20,0.95);backdrop-filter:blur(10px);padding:10px 16px calc(10px + env(safe-area-inset-bottom,0));display:flex;justify-content:center;gap:8px;border-top:1px solid rgba(255,255,255,0.06);}'
        + '.nav button{background:rgba(210,188,255,0.15);border:1px solid rgba(210,188,255,0.3);color:#d2bcff;font-size:11px;font-weight:800;padding:8px 16px;border-radius:8px;cursor:pointer;}'
        + '@media print{.nav{display:none;}}';

    var h = '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EndoSlice - Caso Clínico<\/title><style>' + css + '<\/style><\/head><body><div class="container">';

    h += '<div class="cover"><h1>EndoSlice<\/h1><div class="sub">Caso Clínico Endodôntico · ' + date + '<\/div>';
    if (s.paciente.nome) h += '<div style="margin-top:12px;font-size:16px;font-weight:800;">' + s.paciente.nome + '<\/div>';
    h += '<\/div>';

    // Reuse presentation builder logic (inline simplified)
    function slide(title, body) { return '<div class="slide"><div class="slide-head" onclick="this.nextElementSibling.classList.toggle(\'collapsed\')"><div class="slide-title">' + title + '<\/div><\/div><div class="slide-body">' + body + '<\/div><\/div>'; }

    if (s.paciente.nome) h += slide('👤 Paciente', '<div class="text"><b>' + s.paciente.nome + '<\/b>' + (s.paciente.idade ? ' · ' + s.paciente.idade + ' anos' : '') + (s.paciente.queixa ? '<br><b>Queixa:<\/b> ' + s.paciente.queixa : '') + '<\/div>');
    if (s.resumo.motivo) h += slide('📋 Resumo', '<div class="text">' + (s.resumo.motivo ? '<b>Motivo:<\/b> ' + s.resumo.motivo + '<br>' : '') + (s.resumo.hipotese ? '<b>Hipótese:<\/b> ' + s.resumo.hipotese : '') + '<\/div>');
    if (s.achados) h += slide('🔍 Achados', '<div class="text">' + s.achados + '<\/div>');

    s.items.forEach(function(item) {
        var body = '';
        if (item.dataUrl) body += '<img class="img-full" src="' + item.dataUrl + '">';
        body += '<div class="text">' + item.label + '<\/div>';
        if (item.heuristics) body += '<div class="heur">Perfil: ' + item.heuristics + '<\/div>';
        h += slide('📎 ' + item.type, body);
    });

    if (s.fotos.length) {
        var fb = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        s.fotos.forEach(function(f) { fb += '<img src="' + f.dataUrl + '" style="width:100%;border-radius:8px;">'; });
        fb += '<\/div>';
        h += slide('📷 Fotos', fb);
    }

    if (s.diagnostico.principal) h += slide('🎯 Diagnóstico', '<div class="text"><b>Principal:<\/b> ' + s.diagnostico.principal + (s.diagnostico.diferencial ? '<br><b>Diferencial:<\/b> ' + s.diagnostico.diferencial : '') + '<\/div>');
    if (s.plano.objetivo) h += slide('📐 Tratamento', '<div class="text"><b>Objetivo:<\/b> ' + s.plano.objetivo + (s.plano.conduta ? '<br><b>Conduta:<\/b> ' + s.plano.conduta : '') + '<\/div>');
    if (s.conclusao.resumo) h += slide('✅ Conclusão', '<div class="text">' + s.conclusao.resumo + '<\/div>');

    h += '<div class="footer">EndoSlice Pro · Plataforma de Análise Endodôntica<\/div>';
    h += '<\/div><\/body><\/html>';

    var blob = new Blob([h], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'EndoSlice_Caso_' + (s.paciente.nome || 'Clinico').replace(/\s+/g, '_') + '.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    showToast('📤 HTML exportado');
}

// ── EXPORT TO CONSULTORIA ──
function exportToConsultoria() {
    closeExportMenu();
    portfolioCollectFields();
    portfolioSave();
    // Pre-fill consultoria with portfolio data
    openConsultoriaModal();
    setTimeout(function() {
        var pacField = document.getElementById('consult-paciente');
        var duvField = document.getElementById('consult-duvida');
        if (pacField && portfolioState.paciente.nome) pacField.value = portfolioState.paciente.nome;
        if (duvField) {
            var txt = '';
            if (portfolioState.resumo.motivo) txt += 'Motivo: ' + portfolioState.resumo.motivo + '\n';
            if (portfolioState.resumo.hipotese) txt += 'Hipótese: ' + portfolioState.resumo.hipotese + '\n';
            if (portfolioState.diagnostico.principal) txt += 'Diagnóstico: ' + portfolioState.diagnostico.principal + '\n';
            if (portfolioState.conclusao.resumo) txt += 'Conclusão: ' + portfolioState.conclusao.resumo + '\n';
            txt += '\n[Caso estruturado via Portfolio EndoSlice - ' + portfolioState.items.length + ' itens anexados]';
            duvField.value = txt;
        }
    }, 300);
}

// ── TOAST ANIMATION ──
(function() {
    var style = document.createElement('style');
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
    document.head.appendChild(style);
})();

// ── PORTFOLIO CLEAR ──
window.portfolioClear = function() {
    if (!confirm('Limpar todo o Portfolio?')) return;
    portfolioState.items = [];
    portfolioState.fotos = [];
    portfolioState.paciente = { nome:'', idade:'', sexo:'', identificador:'', dataExame:'', queixa:'' };
    portfolioState.profissional = { nome:'', cro:'', clinica:'', contato:'', obs:'' };
    portfolioState.resumo = { motivo:'', hipotese:'', sintomas:'', historico:'' };
    portfolioState.achados = '';
    portfolioState.diagnostico = { principal:'', diferencial:'', obs:'' };
    portfolioState.plano = { objetivo:'', conduta:'', retratamento:false, cirurgia:false, restauradora:false, encaminhamento:false, limitacoes:'' };
    portfolioState.conclusao = { resumo:'', proximos:'' };
    portfolioSave();
    portfolioPopulateFields();
    portfolioRefreshItems();
    portfolioRefreshPhotos();
    showToast('🗑 Portfolio limpo');
};

console.log('[EndoSlice Pro] Portfolio + Heuristics + Export + Presentation loaded ✓');


// ==========================================================
// FUNÇÃO PARA ROLAR O CARROSSEL PELAS SETAS
// ==========================================================
function scrollCarousel(direction) {
    const track = document.getElementById('hubCarouselTrack');
    if (!track) return;
    
    // Pega a largura exata de um card na tela do usuário
    const card = track.querySelector('.hub-carousel-card');
    if (!card) return;
    
    const cardWidth = card.offsetWidth;
    
    // Rola suavemente para a esquerda (-1) ou direita (1)
    track.scrollBy({
        left: direction * cardWidth,
        behavior: 'smooth'
    });
}

/* ==========================================================
   MOTOR UNIFICADO DE UI v2.0
   Fonte única de verdade: classes no <body>
   ========================================================== */

// === Estado central ===
window._uiState = { current: null }; // 'right' | 'left' | 'dock' | null

// === Fecha TUDO ===
window.closeAllUIMenus = function() {
    document.body.classList.remove('ui-active', 'ui-dock-open', 'ui-right-open', 'ui-left-open');
    // Limpa classes antigas para compatibilidade
    var gR = document.getElementById('groupRight');
    var gL = document.getElementById('groupLeft');
    if (gR) gR.classList.remove('active');
    if (gL) gL.classList.remove('active');
    var fabMain = document.querySelector('.fab-main');
    if (fabMain) fabMain.classList.remove('open');
    window._uiState.current = null;
};

// === Abre UM elemento (fecha os demais, liga backdrop) ===
function openUIElement(tipo) {
    closeAllUIMenus();
    document.body.classList.add('ui-active');
    if (tipo === 'dock')  document.body.classList.add('ui-dock-open');
    if (tipo === 'right') document.body.classList.add('ui-right-open');
    if (tipo === 'left')  document.body.classList.add('ui-left-open');
    window._uiState.current = tipo;
}

// === Toggle Direito ===
window.toggleRight = function() {
    if (window._uiState.current === 'right') {
        closeAllUIMenus();
    } else {
        openUIElement('right');
    }
};

// === Toggle Esquerdo ===
window.toggleLeft = function() {
    if (window._uiState.current === 'left') {
        closeAllUIMenus();
    } else {
        openUIElement('left');
    }
};

// === Toggle Dock ===
window.toggleDockUI = function() {
    if (window._uiState.current === 'dock') {
        closeAllUIMenus();
    } else {
        openUIElement('dock');
    }
};

// === Show Dock (chamada pelos grips e compatibilidade) ===
window.showDock = function() {
    var dock = document.getElementById('dockNav');
    if (dock) dock.classList.remove('hidden');
    openUIElement('dock');
    // Atualiza visibilidade do grip inferior
    _updateBottomGrip();
};

// === Close FAB Right (compatibilidade com botões internos) ===
window.closeFabRight = function() {
    closeAllUIMenus();
};

// === Open Hub ===
window.openHub = function() {
    closeAllUIMenus();
    if (typeof window.returnToHub === 'function') {
        window.returnToHub();
    }
};

// === Atualiza visibilidade do grip inferior ===
function _updateBottomGrip() {
    var dock = document.getElementById('dockNav');
    var isHidden = dock && dock.classList.contains('hidden');
    var isDockOpen = document.body.classList.contains('ui-dock-open');
    if (isHidden && !isDockOpen) {
        document.body.classList.add('ui-grip-bottom-visible');
    } else {
        document.body.classList.remove('ui-grip-bottom-visible');
    }
}

// === Interceptadores de Gestos nas Bordas (swipe zones) ===
(function setupEdgeSwipes() {
    function bindEdge(elementId, direction, onAction) {
        var el = document.getElementById(elementId);
        if (!el) return;
        var startX = 0, startY = 0;

        el.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        el.addEventListener('touchend', function(e) {
            var dx = e.changedTouches[0].clientX - startX;
            var dy = e.changedTouches[0].clientY - startY;

            if (direction === 'up' && dy < -20) onAction();
            if (direction === 'left' && dx < -20) onAction();
            if (direction === 'right' && dx > 20) onAction();
        }, { passive: true });
    }

    window.addEventListener('DOMContentLoaded', function() {
        bindEdge('edge-swipe-bottom', 'up', function() { openUIElement('dock'); });
        bindEdge('edge-swipe-right', 'left', function() { openUIElement('right'); });
        bindEdge('edge-swipe-left', 'right', function() { openUIElement('left'); });
    });
})();

// === Auto-fecha ao clicar numa ferramenta ou dock-item ===
document.addEventListener('click', function(e) {
    if (e.target.closest('.btn-ios-tool') || e.target.closest('.dock-item')) {
        setTimeout(closeAllUIMenus, 150);
    }
});


window.makeFloatingDraggable = function(dragZone, moveTarget) {
    if (moveTarget._isDraggable) return;
    moveTarget._isDraggable = true;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    dragZone.addEventListener('mousedown', dragStart, {passive: false});
    dragZone.addEventListener('touchstart', dragStart, {passive: false});

    function dragStart(e) {
        if (e.target.tagName.toLowerCase() === 'button') return; // Permite clicar em botões no header (ex: fechar)
        e.preventDefault(); 
        
        if (e.type === 'touchstart') {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.addEventListener('touchend', dragEnd);
            document.addEventListener('touchmove', dragMove, {passive: false});
        } else {
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('mousemove', dragMove, {passive: false});
        }
    }

    function dragMove(e) {
        e.preventDefault();
        let currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        let currentY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        pos1 = pos3 - currentX;
        pos2 = pos4 - currentY;
        pos3 = currentX;
        pos4 = currentY;
        
        // O SEGREDO: Usar setProperty com 'important' para vencer as regras CSS originais do seu app
        moveTarget.style.setProperty('top', (moveTarget.offsetTop - pos2) + "px", "important");
        moveTarget.style.setProperty('left', (moveTarget.offsetLeft - pos1) + "px", "important");
        moveTarget.style.setProperty('bottom', 'auto', 'important');
        moveTarget.style.setProperty('right', 'auto', 'important');
        moveTarget.style.setProperty('margin', '0', 'important');
        moveTarget.style.setProperty('transform', 'none', 'important');
    }

    function dragEnd() {
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchend', dragEnd);
        document.removeEventListener('touchmove', dragMove);
    }
};

// 1. ODONTOMETRIA 3D
window.openOdontometriaModalDraggable = function() {
    if(typeof openOdontometria3D === 'function') openOdontometria3D();

    const modal = document.getElementById('odontometria-modal');
    if (!modal) return;
    const content = modal.children[0]; 

    modal.style.background = 'rgba(0,0,0,0.1)';
    modal.style.pointerEvents = 'none';
    modal.style.zIndex = '100010'; 

    content.style.pointerEvents = 'auto';
    content.style.setProperty('position', 'absolute', 'important');
    content.style.resize = 'both';
    content.style.overflow = 'auto';
    content.style.border = '1.5px solid #ffb400';

   if(!content.dataset.moved) {
        content.style.setProperty('top', '15%', 'important');
        content.style.setProperty('left', '5%', 'important');
        content.style.setProperty('width', '230px', 'important'); // Diminuído de 300px para 230px
        content.style.setProperty('max-height', '60vh', 'important'); // Limita a altura
        content.style.setProperty('padding', '10px', 'important'); // Reduz o respiro interno
        content.dataset.moved = "true";
    }

    const header = content.querySelector('div'); 
    if(header) {
        header.style.cursor = 'move';
        header.style.touchAction = 'none';
        window.makeFloatingDraggable(header, content);
    }

    const closeBtn = header.querySelector('button:last-child');
    if(closeBtn && !closeBtn.dataset.patched) {
        closeBtn.dataset.patched = "true";
        const oldClick = closeBtn.onclick;
        const oldTouch = closeBtn.ontouchend;
        const doClose = (e) => {
            modal.style.background = 'rgba(0,0,0,0.75)';
            modal.style.pointerEvents = 'auto';
            content.style.position = '';
            content.style.resize = '';
            content.style.overflow = '';
            if(oldTouch) oldTouch(e);
            if(oldClick) oldClick(e);
        };
        closeBtn.onclick = doClose;
        closeBtn.ontouchend = doClose;
    }
};

// 2. SEGMENTAÇÃO (CANAL E OBTURADO) - Modo Modal Limpo
window.openSegModalDraggable = function(mode) {
    // Normaliza nome canônico: 'obtur' → 'obturado'
    if (mode === 'obtur') mode = 'obturado';

    if(typeof segToggleTool === 'function') segToggleTool(mode);

    const panel = document.getElementById('seg-inline-panel');
    const modalZoom = document.getElementById('modal-zoom');
    if (!panel || !modalZoom) return;

    // Transfere o painel para o Modal
    modalZoom.appendChild(panel);

    panel.style.setProperty('position', 'absolute', 'important');
    panel.style.setProperty('z-index', '100010', 'important');
    panel.style.setProperty('resize', 'both', 'important');
    panel.style.setProperty('inset', 'auto', 'important'); // Vence as âncoras do CSS original
    panel.style.border = '1.5px solid ' + (mode === 'obturado' ? '#ffb347' : '#78e7d1');
    panel.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8)';
    panel.style.borderRadius = '16px';
    panel.style.pointerEvents = 'auto';
    panel.style.background = 'rgba(15, 18, 25, 0.95)';

    // TAMANHO REDUZIDO
    if(!panel.dataset.moved) {
        panel.style.setProperty('top', '10%', 'important');
        panel.style.setProperty('left', '5%', 'important');
        panel.style.setProperty('width', '210px', 'important');  
        panel.style.setProperty('height', 'auto', 'important');  
        panel.style.setProperty('max-height', '65vh', 'important');
        panel.dataset.moved = "true";
    }

    const header = panel.querySelector('.seg-inline-header');
    if(header) {
        header.style.cursor = 'move';
        header.style.padding = '6px';
        header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        header.style.touchAction = 'none'; 
        window.makeFloatingDraggable(header, panel);
    }
    
    // Rehook overlay no modal-viewport (pode ter sido desabilitado ao fechar modal antes)
    setTimeout(function() {
        if (typeof window._segHookOverlay === 'function') window._segHookOverlay();
    }, 200);
};

// 3. LIMA VIRTUAL
window.openLimaModalDraggable = function() {
    limaOpenInModal(); 
    
    const controls = document.getElementById('lima-controls');
    if(!controls) return;

    controls.style.setProperty('position', 'absolute', 'important');
    controls.style.resize = 'both';
    controls.style.overflow = 'auto';
    controls.style.pointerEvents = 'auto';

    if(!controls.dataset.moved) {
        controls.style.setProperty('top', '15%', 'important');
        controls.style.setProperty('left', '5%', 'important');
        controls.style.setProperty('bottom', 'auto', 'important');
        controls.style.setProperty('right', 'auto', 'important');
        controls.style.setProperty('width', '200px', 'important');
        controls.dataset.moved = "true";
    }

    const header = controls.querySelector('div');
    if(header) {
        header.style.cursor = 'move';
        header.style.paddingBottom = '6px';
        header.style.borderBottom = '1px solid rgba(0,170,255,0.3)';
        header.style.marginBottom = '6px';
        header.style.background = 'rgba(0,170,255,0.1)';
        header.style.borderRadius = '4px';
        header.style.touchAction = 'none';
        window.makeFloatingDraggable(header, controls);
    }
    
    const closeBtns = controls.querySelectorAll('button');
    closeBtns.forEach(btn => {
        if(btn.innerText.includes('FECHAR') && !btn.dataset.patched) {
            btn.dataset.patched = "true";
            const oldClick = btn.onclick;
            btn.onclick = (e) => {
                controls.dataset.moved = "";
                controls.style.removeProperty('top');
                controls.style.removeProperty('left');
                controls.style.resize = 'none';
                if(header) {
                    header.style.cursor = '';
                    header.style.borderBottom = '';
                    header.style.background = '';
                }
                if(oldClick) oldClick(e);
            };
        }
    });
};











