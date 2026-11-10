

cornerstoneTools.toolStyle.setToolWidth(3); // Linhas mais grossas para visualização médica
cornerstoneTools.toolColors.setToolColor("#FFEE58"); // Cor amarela padrão
cornerstoneTools.toolColors.setActiveColor("#00E5FF"); // Azul quando estiver editando


// ==========================================================
// ⚙️ MOTOR DICOM - CONFIGURAÇÃO BLINDADA (DABI/MORITA)
// ==========================================================

function isIOSWebKitMobile() {
  const ua = navigator.userAgent || '';
  const appleTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const iDevice = /iPhone|iPad|iPod/i.test(ua) || appleTouchMac;
  const webkit = /WebKit/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return iDevice && webkit;
}

function getDicomPerfProfile() {
  const ua = navigator.userAgent || '';
  const cores = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 8));
  const iOS = isIOSWebKitMobile();
  const isIPhone = /iPhone|iPod/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return {
    iOS,
    isIPhone,
    isIPad,
    maxWebWorkers: iOS ? (isIPhone ? 2 : 3) : Math.min(cores, 4),
    buildConcurrent: iOS ? (isIPhone ? 1 : 2) : 4,
    decodeConcurrent: iOS ? 1 : 2,
    zipChunk: iOS ? 8 : 24,
    normalizeChunk: iOS ? 8 : 24,
    imageCacheBytes: iOS ? (isIPhone ? 64 : 96) * 1024 * 1024 : 192 * 1024 * 1024,
    skipPixelValidationOverBytes: iOS ? 35 * 1024 * 1024 : 80 * 1024 * 1024
  };
}

window.DICOM_PERF = getDicomPerfProfile();

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

cornerstoneWADOImageLoader.configure({
  beforeSend: function(xhr) {},
  useWebWorkers: true,
  decodeConfig: {
    isStrict: false,
    usePDFJS: false
  }
});

var config = {
  maxWebWorkers: window.DICOM_PERF.maxWebWorkers,
  startWebWorkersOnDemand: true,
  webWorkerPath: 'https://unpkg.com/cornerstone-wado-image-loader@3.3.1/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
      strict: false
    }
  }
};

cornerstoneWADOImageLoader.webWorkerManager.initialize({
  ...config,
  codecsPath: 'https://unpkg.com/cornerstone-wado-image-loader@3.3.1/dist/cornerstoneWADOImageLoaderCodecs.min.js'
});

cornerstoneTools.init({ showSVGCursors: false, touchEnabled: true });

try {
  cornerstone.imageCache.setMaximumSizeBytes(window.DICOM_PERF.imageCacheBytes);
} catch (e) {}





// ==========================================================
// 🧠 VARIÁVEIS GLOBAIS (ESTADO DO APP)
// ==========================================================







function changeSlab(plane, val) {
    // Aceita 'native' (string) ou valores mm como string numérica
    thicknessState[plane] = (val === 'native') ? 'native' : parseFloat(val);
    if (obliqueState.isActive) {
        updateObliqueViewports();
    } else {
        synchronizeMobileViews();
    }
}

var isDraggingAnySlider = false;

// --- ESTADO DA MIRA (CROSSHAIR) ---
var crosshairState = { x: 0, y: 0, z: 0 }; 
var isCrosshairActive = false;
var isDraggingCrosshair = false;
var crosshairDragOffset = { x: 0, y: 0 };
var obliqueCenter3D = { x: 0, y: 0, z: 0 };







function closePopups() { 
    // Fecha os painéis limpando o estilo inline forçadamente
    const rMenu = document.querySelector('#groupRight .fab-tools');
    const rBtn = document.querySelector('#groupRight .fab-main');
    if (rMenu) { rMenu.style.display = 'none'; rMenu.style.opacity = '0'; }
    if (rBtn) rBtn.style.transform = 'rotate(0deg)';

    const lMenu = document.querySelector('#groupLeft .settings-container');
    if (lMenu) { lMenu.style.display = 'none'; lMenu.style.opacity = '0'; }
}





function toggleDockFromEndoHotspot(event) {
    if (!document.getElementById('tab-endo').classList.contains('active')) {
        return; // Só funciona na aba ENDO
    }
    
    // Calcula o tempo desde o último toque
    const currentTime = new Date().getTime();
    const timeDiff = currentTime - lastTouchTime;

    // Se a diferença for pequena, é um toque duplo
    if (timeDiff < DBL_TAP_THRESHOLD && timeDiff > 0) {
        if (event) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
        
        const dock = document.getElementById('dockNav');
        if (!dock) return;
        
        const isHiddenNow = dock.classList.contains('hidden');
        
        // Se estiver oculto, mostra a dock (Double Tap)
        if (isHiddenNow) {
            dock.classList.remove('hidden');
            window.__dockShownInEndoByHotspot = true; // Mantém visível por inatividade
        } else {
            // Se estiver visível, esconde
            dock.classList.add('hidden');
            window.__dockShownInEndoByHotspot = false;
        }

        resetTimer(); // Reinicia o timer de inatividade
        lastTouchTime = 0; // Reseta o tempo do toque
    } else {
        // Primeiro toque: armazena o tempo
        lastTouchTime = currentTime;
    }
}

// Detecta iOS PWA standalone de forma confiável
if (window.navigator.standalone === true) {
    const style = document.createElement('style');
    style.textContent = `
        /* App vai até a borda real — sem faixa cinza */
        #app-viewport {
            top:      env(safe-area-inset-top, 0px) !important;
            bottom:   0 !important;
            left:     0 !important;
            right:    0 !important;
            width:    auto !important;
            height:   auto !important;
            position: fixed !important;
        }

        /* Dock flutua acima da home indicator */
        .dock-container {
            bottom: calc(12px + env(safe-area-inset-bottom, 34px)) !important;
        }

        /* Seta da dock */
        #dock-show-button {
            bottom:         0 !important;
            height:         calc(20px + env(safe-area-inset-bottom, 34px)) !important;
            padding-bottom: env(safe-area-inset-bottom, 34px) !important;
            /* Visual mais limpo: sem borda, só transparência */
            background:     rgba(20, 22, 28, 0.92) !important;
            border:         none !important;
            border-radius:  10px 10px 0 0 !important;
        }

        /* FABs sobem acima da home indicator */
        .fab-group-right,
        .fab-group-left {
            bottom: calc(env(safe-area-inset-bottom, 34px) + 2px) !important;
        }

        /* Botões pílula dos FABs: arredondados em cima, abertos embaixo */
        .fab-main, .fab-main-left {
            border-radius: 10px 10px 0 0 !important;
            height: 28px !important;
            padding-bottom: 0 !important;
        }

        #loading {
            padding-top: env(safe-area-inset-top, 50px) !important;
        }
    `;
    document.head.appendChild(style);
}
// SUBSTITUA A LINHA window.onload EXISTENTE
window.onload = () => { 
    window.__dockShownInEndoByHotspot = false; 
    resetTimer(); 
};




// ==========================================================
// 📂 LÓGICA DE CARREGAMENTO DE ARQUIVOS (SEM MUDANÇAS)
// ==========================================================

// ==========================================================
// ✅ FIX MORITA RAW -> PART10 (Cornerstone WADO compatibility)
// ==========================================================
function hasDICMPrefix(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 132) return false;
  const u8 = new Uint8Array(arrayBuffer, 128, 4);
  return (u8[0] === 0x44 && u8[1] === 0x49 && u8[2] === 0x43 && u8[3] === 0x4D); // 'DICM'
}

function strToU8(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function padEvenAscii(str) {
  // DICOM UI/SH/LO etc precisam de tamanho par (padding com espaço ou \0; UI usa \0)
  if (str.length % 2 === 0) return str;
  return str + '\0';
}

function writeTagExplicitVRLE(chunks, group, element, vr, valueBytes) {
  // group/element little endian
  const header = new Uint8Array(8); // default explicit VR with 2-byte length (most VRs)
  const dv = new DataView(header.buffer);

  dv.setUint16(0, group, true);
  dv.setUint16(2, element, true);
  header[4] = vr.charCodeAt(0);
  header[5] = vr.charCodeAt(1);

  // VRs que usam 4-byte length e 2 reserved bytes
  const longVR = (vr === 'OB' || vr === 'OW' || vr === 'OF' || vr === 'SQ' || vr === 'UT' || vr === 'UN');

  if (longVR) {
    const h = new Uint8Array(12);
    const dv2 = new DataView(h.buffer);
    dv2.setUint16(0, group, true);
    dv2.setUint16(2, element, true);
    h[4] = vr.charCodeAt(0);
    h[5] = vr.charCodeAt(1);
    h[6] = 0; h[7] = 0; // reserved
    dv2.setUint32(8, valueBytes.byteLength, true);
    chunks.push(h, valueBytes);
  } else {
    dv.setUint16(6, valueBytes.byteLength, true);
    chunks.push(header, valueBytes);
  }
}

function buildFileMetaPart10({ sopClassUID, sopInstanceUID, transferSyntaxUID }) {
  // Grupo 0002 deve ser EXPLICIT VR LITTLE ENDIAN por padrão.
  // Vamos montar: (0002,0001) (0002,0002) (0002,0003) (0002,0010) (0002,0012)
  const metaChunks = [];

  // (0002,0001) FileMetaInformationVersion = 00 01
  writeTagExplicitVRLE(metaChunks, 0x0002, 0x0001, 'OB', new Uint8Array([0x00, 0x01]));

  // (0002,0002) MediaStorageSOPClassUID (UI)
  const ui2 = strToU8(padEvenAscii(sopClassUID));
  writeTagExplicitVRLE(metaChunks, 0x0002, 0x0002, 'UI', ui2);

  // (0002,0003) MediaStorageSOPInstanceUID (UI)
  const ui3 = strToU8(padEvenAscii(sopInstanceUID));
  writeTagExplicitVRLE(metaChunks, 0x0002, 0x0003, 'UI', ui3);

  // (0002,0010) TransferSyntaxUID (UI)
  const ui10 = strToU8(padEvenAscii(transferSyntaxUID));
  writeTagExplicitVRLE(metaChunks, 0x0002, 0x0010, 'UI', ui10);

  // (0002,0012) ImplementationClassUID (UI) — qualquer UID estável serve
  const impl = '1.2.826.0.1.3680043.10.511.3.1';
  const ui12 = strToU8(padEvenAscii(impl));
  writeTagExplicitVRLE(metaChunks, 0x0002, 0x0012, 'UI', ui12);

  // Agora precisamos do (0002,0000) group length (UL) = total bytes dos elementos acima
  let metaLen = 0;
  for (const c of metaChunks) metaLen += c.byteLength;

  const groupLenVal = new Uint8Array(4);
  new DataView(groupLenVal.buffer).setUint32(0, metaLen, true);

  const all = [];
  writeTagExplicitVRLE(all, 0x0002, 0x0000, 'UL', groupLenVal);
  all.push(...metaChunks);

  // Retorna metaheader completo
  let total = 0;
  for (const c of all) total += c.byteLength;

  const out = new Uint8Array(total);
  let off = 0;
  for (const c of all) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function normalizeDicomFileToPart10IfNeeded(fileOrBlob) {
 // PERF: checa o prefixo DICM lendo SÓ os primeiros 132 bytes —
  // antes, cada arquivo era lido INTEIRO duas vezes (aqui e no loader).
  const head = await fileOrBlob.slice(0, 132).arrayBuffer();
  if (hasDICMPrefix(head)) return fileOrBlob; // já é Part10
  // não é Part10: agora sim lê o arquivo completo para reempacotar
  const buf = await fileOrBlob.arrayBuffer();

  // ✅ RAW dataset: vamos tentar parsear forçando implicit VR little endian
  let dataSet = null;
  const byteArray = new Uint8Array(buf);

  // dicomParser normalmente aceita "transferSyntaxUid" nas options (varia por versão);
  // então tentamos as duas assinaturas (com e sem options) com fallback.
  try {
    dataSet = dicomParser.parseDicom(byteArray, { transferSyntaxUid: '1.2.840.10008.1.2' });
  } catch (e1) {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: '1.2.840.10008.1.2' });
    } catch (e2) {
      // último fallback: tenta sem options (se ainda assim der certo)
      dataSet = dicomParser.parseDicom(byteArray);
    }
  }

  const sopClassUID = (dataSet && dataSet.string && dataSet.string('x00080016')) || '1.2.840.10008.5.1.4.1.1.2'; // CT Image Storage
  const sopInstanceUID = (dataSet && dataSet.string && dataSet.string('x00080018')) || ('2.25.' + Math.floor(Math.random() * 1e16));

  const transferSyntaxUID = '1.2.840.10008.1.2'; // Implicit VR Little Endian

  const meta = buildFileMetaPart10({ sopClassUID, sopInstanceUID, transferSyntaxUID });

  // preamble + DICM
  const pre = new Uint8Array(128);
  const dicm = strToU8('DICM');

  const wrapped = new Blob([pre, dicm, meta, byteArray], { type: 'application/dicom' });
  wrapped.name = fileOrBlob.name || 'wrapped.dcm';
  return wrapped;
}
function handleMobileFiles(fileList) { 
    updateAppLoading(5, "Analisando arquivos...");

    const files = Array.from(fileList || []);
    if (!files.length) return;

    // Novo exame = limpa estado pesado anterior
    if (typeof resetEndoBigVolumeMode === 'function') {
        resetEndoBigVolumeMode();
    }

    // Detecta mesh 3D (PLY/STL/OBJ)
    const meshFile = files.find(f => /\.(ply|stl|obj)$/i.test(f.name));
    if (meshFile) { 
        loadMeshFile(meshFile); 
        return; 
    }

    const totalSelectedMB = files.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024);

    if (
        window.EndoSliceBigVolume &&
        totalSelectedMB > window.EndoSliceBigVolume.limits.sourceMB
    ) {
        setEndoBigVolumeMode(
            `Seleção/arquivo acima de ${window.EndoSliceBigVolume.limits.sourceMB}MB`,
            totalSelectedMB
        );
    }

    const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip')); 
    const rarFile = files.find(f => f.name.toLowerCase().endsWith('.rar')); 

    if (zipFile) { 
        const zipMB = (zipFile.size || 0) / (1024 * 1024);

        if (
            window.EndoSliceBigVolume &&
            zipMB > window.EndoSliceBigVolume.limits.sourceMB
        ) {
            setEndoBigVolumeMode(
                `ZIP acima de ${window.EndoSliceBigVolume.limits.sourceMB}MB`,
                zipMB
            );
        }

        handleMobileZip(zipFile); 
    } else if (rarFile) { 
        const rarMB = (rarFile.size || 0) / (1024 * 1024);
        if (window.EndoSliceBigVolume && rarMB > window.EndoSliceBigVolume.limits.sourceMB) {
            setEndoBigVolumeMode(`RAR acima de ${window.EndoSliceBigVolume.limits.sourceMB}MB`, rarMB);
        }
        handleMobileRar(rarFile); 
    } else { 
        processMobileFileList(files); 
    } 
}


async function handleMobileZip(file) {
  try {
    updateAppLoading(10, "Lendo estrutura do ZIP...");
    await yieldToBrowser(50);

    const zip = await JSZip.loadAsync(file);

    const entries = Object.entries(zip.files)
      .filter(([path, entry]) => {
        const filename = path.split('/').pop().toUpperCase();
        if (filename === 'DICOMDIR') return false;
        const isSystem =
          path.includes('__MACOSX') ||
          path.includes('.DS_Store') ||
          path.startsWith('.');
        return !entry.dir && !isSystem;
      })
      .sort((a, b) => {
        const an = a[0].split('/').pop();
        const bn = b[0].split('/').pop();
        return dicomLegacyFilenameComparator(an, bn);
      });

    const blobs = [];
    const total = entries.length;
    const CHUNK = window.DICOM_PERF.zipChunk;

    for (let i = 0; i < entries.length; i += CHUNK) {
      const current = Math.min(i + CHUNK, total);
      const percent = 10 + Math.round((current / total) * 20);
      updateAppLoading(percent, `Extraindo exame: ${current} de ${total}`);

      await yieldToBrowser(0);

      const chunk = entries.slice(i, i + CHUNK);

      for (const [path, entry] of chunk) {
     const blob = await entry.async('blob');

const cleanName = path.split('/').pop() || 'dicom.dcm';

// Mantém o nome curto para o Cornerstone, mas preserva o caminho completo
// para separar série normal, MAR, scout, relatórios etc.
try { blob.name = cleanName; } catch(e) {
    try { Object.defineProperty(blob, 'name', { value: cleanName }); } catch(_) {}
}

try { blob._zipPath = path; } catch(e) {}
try { blob._fullPath = path; } catch(e) {}

// Em alguns navegadores webkitRelativePath é readonly;
// tentamos apenas como conveniência.
try {
    Object.defineProperty(blob, 'webkitRelativePath', { value: path });
} catch(e) {}

blobs.push(blob);
      }
    }

    if (typeof endoMARBuildStore === 'function') {
      endoMARBuildStore(blobs);
    }

    await processMobileFileList(blobs);

  } catch (err) {
    alert("Erro no ZIP: " + err.message);
    const l = document.getElementById('loading');
    if (l) {
      l.style.setProperty('display', 'none', 'important');
      l.classList.remove('active');
    }
  }
}


// ==========================================================
// 🗜️ SUPORTE A .RAR (DICOM em RAR) — 100% ISOLADO DO ZIP
// ----------------------------------------------------------
// Não toca em handleMobileZip nem nas regras de leitura/processamento
// DICOM: apenas extrai o .rar e produz o MESMO array de blobs (mesmo
// "shape": .name, ._zipPath, ._fullPath, webkitRelativePath) e chama o
// MESMO downstream (endoMARBuildStore + processMobileFileList).
// Motor: libarchive.js (RAR v4/v5) exposto em window.LibArchive.
// Se o motor não estiver carregado, avisa e NÃO afeta nada mais.
// ==========================================================
async function handleMobileRar(file) {
  try {
    if (!window.LibArchive) {
      alert("Suporte a .rar indisponível: o motor de descompressão (libarchive.js) não está carregado. Verifique a conexão/instalação. O carregamento de ZIP e pastas continua normal.");
      const l = document.getElementById('loading');
      if (l) {
        l.style.setProperty('display', 'none', 'important');
        l.classList.remove('active');
      }
      return;
    }

    updateAppLoading(10, "Lendo estrutura do RAR...");
    await yieldToBrowser(50);

    const _rarTimeout = function(promise, ms, msg) {
      return Promise.race([
        promise,
        new Promise(function(_, reject) {
          setTimeout(function() {
            reject(new Error(msg));
          }, ms);
        })
      ]);
    };

    const archive = await _rarTimeout(
      window.LibArchive.open(file),
      15000,
      "não foi possível iniciar o motor de .rar. Confirme se worker-bundle.js e libarchive.wasm estão na mesma pasta do HTML atual e se não há cache/PWA servindo uma versão antiga."
    );

    const tree = await _rarTimeout(
      archive.extractFiles(),
      60000,
      "tempo esgotado ao extrair o .rar"
    );

    const flat = [];

    (function walk(node, prefix) {
      for (const key in node) {
        const val = node[key];
        const path = prefix ? (prefix + '/' + key) : key;
        const isLeaf = (val instanceof File) || (val instanceof Blob);

        if (val && typeof val === 'object' && !isLeaf) {
          walk(val, path);
        } else {
          const filename = key.toUpperCase();

          if (filename === 'DICOMDIR') continue;

          const isSystem =
            path.includes('__MACOSX') ||
            path.includes('.DS_Store') ||
            key.startsWith('.');

          if (isSystem) continue;

          flat.push({
            file: val,
            path: path
          });
        }
      }
    })(tree, '');

    flat.sort(function(a, b) {
      return dicomLegacyFilenameComparator(
        a.path.split('/').pop(),
        b.path.split('/').pop()
      );
    });

    const blobs = [];
    const total = flat.length;
    const CHUNK = window.DICOM_PERF.zipChunk;

    for (let i = 0; i < total; i += CHUNK) {
      const current = Math.min(i + CHUNK, total);
      const percent = 10 + Math.round((current / (total || 1)) * 20);

      updateAppLoading(percent, `Extraindo exame: ${current} de ${total}`);
      await yieldToBrowser(0);

      const chunk = flat.slice(i, i + CHUNK);

      for (const item of chunk) {
        const f = item.file;
        const path = item.path;
        const cleanName = path.split('/').pop() || 'dicom.dcm';

        const blob = f && f.slice
          ? f.slice(0, f.size, f.type || 'application/octet-stream')
          : f;

        try {
          blob.name = cleanName;
        } catch (e) {
          try {
            Object.defineProperty(blob, 'name', { value: cleanName });
          } catch (_) {}
        }

        try {
          blob._zipPath = path;
        } catch (e) {}

        try {
          blob._fullPath = path;
        } catch (e) {}

        try {
          Object.defineProperty(blob, 'webkitRelativePath', { value: path });
        } catch (e) {}

        blobs.push(blob);
      }
    }

    if (typeof endoMARBuildStore === 'function') {
      endoMARBuildStore(blobs);
    }

    await processMobileFileList(blobs);

  } catch (err) {
    console.error('[RAR] Erro ao abrir/extrair RAR:', err);

    alert("Erro no RAR: " + (err && err.message ? err.message : err));

    const l = document.getElementById('loading');

    if (l) {
      l.style.setProperty('display', 'none', 'important');
      l.classList.remove('active');
    }
  }
}


// ==========================================================
// 🗂️ LÓGICA LEGADA DE ORDENAÇÃO POR NOME (MORITA / SLZ / NUMÉRICA)
// ----------------------------------------------------------
// Esta é EXATAMENTE a regra que já existia em processMobileFileList,
// apenas extraída para escopo de módulo para poder ser reutilizada
// como FALLBACK FINAL na montagem do volume (sortByLegacyFilenameRules).
// NÃO alterar o comportamento: preserva Morita/SLZ + natural sort.
// ==========================================================
function dicomLegacyMoritaIndex(name) {
    const base = String(name || '').split('/').pop().toUpperCase();
    const m = base.match(/^SLZ([+-])(\d{3})\.DCM$/);
    if (!m) return null;
    const sign = (m[1] === '-') ? -1 : 1;
    return sign * parseInt(m[2], 10);
}

function dicomLegacyFilenameComparator(nameA, nameB) {
    const ia = dicomLegacyMoritaIndex(nameA);
    const ib = dicomLegacyMoritaIndex(nameB);
    if (ia !== null && ib !== null) return ia - ib;
    if (ia !== null && ib === null) return -1;
    if (ia === null && ib !== null) return 1;
    return String(nameA || '').localeCompare(String(nameB || ''), undefined, { numeric: true });
}

function yieldToBrowser(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ==========================================================
// 🔀 SELETOR NORMAL / MAR — versão mínima e segura
// ----------------------------------------------------------
// Esta camada NÃO altera o pipeline estável de abertura do exame.
// Ela apenas memoriza quais arquivos vieram da raiz e quais vieram
// da pasta MAR do ZIP. O exame continua abrindo pelo fluxo original.
// O seletor aparece apenas se houver Normal + MAR.
// ==========================================================

window.EndoMARSeriesStore = window.EndoMARSeriesStore || null;

function endoMARPathOf(file) {
    return String(
        (file && (file._zipPath || file._fullPath || file.webkitRelativePath || file.relativePath || file.name)) || ''
    ).replace(/\\/g, '/');
}

function endoMARIsMARPath(path) {
    const p = String(path || '').replace(/\\/g, '/').toUpperCase();
    return (
        p.startsWith('MAR/') ||
        p.includes('/MAR/') ||
        p.includes('/IMAR/') ||
        p.includes('/SEMAR/') ||
        p.includes('/O-MAR/') ||
        p.includes('/OMAR/') ||
        p.includes('/SMARTMAR/') ||
        p.includes('/SMART MAR/')
    );
}

function endoMARSortFiles(files) {
    return Array.from(files || []).sort((a, b) => {
        const ap = endoMARPathOf(a) || (a && a.name) || '';
        const bp = endoMARPathOf(b) || (b && b.name) || '';
        if (typeof dicomLegacyFilenameComparator === 'function') {
            return dicomLegacyFilenameComparator(ap, bp);
        }
        return String(ap).localeCompare(String(bp), undefined, { numeric: true });
    });
}

function endoMARBuildStore(files) {
    try {
        const all = Array.from(files || []).filter(f => f && f.size > 512);
        const mar = [];
        const normal = [];

        for (const f of all) {
            const p = endoMARPathOf(f);
            if (endoMARIsMARPath(p)) mar.push(f);
            else normal.push(f);
        }

        if (normal.length > 0 && mar.length > 0) {
            window.EndoMARSeriesStore = {
                normal: endoMARSortFiles(normal),
                mar: endoMARSortFiles(mar),
                selected: 'NORMAL'
            };

            console.warn('[MAR] Normal/MAR detectado sem alterar pipeline:', {
                normal: normal.length,
                mar: mar.length,
                sampleNormal: normal.slice(0, 3).map(endoMARPathOf),
                sampleMAR: mar.slice(0, 3).map(endoMARPathOf)
            });
        } else {
            window.EndoMARSeriesStore = null;
            const old = document.getElementById('endo-mar-selector');
            if (old) old.remove();
        }
    } catch (e) {
        console.warn('[MAR] Falha ao construir store Normal/MAR:', e);
        window.EndoMARSeriesStore = null;
    }
}

function endoMARShouldShowSelector() {
    const s = window.EndoMARSeriesStore;
    return !!(s && s.normal && s.mar && s.normal.length > 0 && s.mar.length > 0);
}

function endoMARSetSelectorBusy(type, busy) {
    try {
        const selector = document.getElementById('endo-mar-selector');
        if (!selector) return;
        selector.querySelectorAll('button').forEach(btn => {
            const isTarget = btn.dataset && btn.dataset.seriesType === type;
            btn.disabled = !!busy;
            btn.style.opacity = busy && !isTarget ? '0.45' : '1';
            if (busy && isTarget) btn.textContent = '...';
        });
    } catch(e) {}
}

function endoRenderMARSelector() {
    try {
        const old = document.getElementById('endo-mar-selector');
        if (old) old.remove();

        if (!endoMARShouldShowSelector()) return;

        const host = document.getElementById('axial-viewport') || document.body;
        if (!host) return;

        const selector = document.createElement('div');
        selector.id = 'endo-mar-selector';
        selector.style.cssText = `
            position:absolute;
            top:12px;
            left:50%;
            transform:translateX(-50%);
            z-index:2147483000;
            display:flex;
            gap:6px;
            padding:5px;
            border-radius:999px;
            background:rgba(18,22,30,0.92);
            border:1px solid rgba(255,255,255,0.16);
            box-shadow:0 8px 22px rgba(0,0,0,0.50);
            backdrop-filter:blur(12px);
            -webkit-backdrop-filter:blur(12px);
            pointer-events:auto !important;
            user-select:none;
            -webkit-user-select:none;
        `;

        const makeBtn = (type, label) => {
            const active = window.EndoMARSeriesStore && window.EndoMARSeriesStore.selected === type;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.seriesType = type;
            btn.textContent = label;
            btn.setAttribute('aria-label', `Selecionar série ${label}`);
            btn.style.cssText = `
                min-width:70px;
                height:32px;
                padding:0 12px;
                border:none;
                border-radius:999px;
                font:800 11px -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;
                letter-spacing:0.3px;
                color:${active ? '#061018' : '#E0E5EC'};
                background:${active ? '#4A90E2' : 'rgba(255,255,255,0.06)'};
                box-shadow:${active ? '0 0 14px rgba(74,144,226,0.45)' : 'none'};
                cursor:pointer;
                touch-action:manipulation;
                pointer-events:auto !important;
                -webkit-user-select:none;
                user-select:none;
            `;

            let lastFire = 0;
            const fire = async (ev) => {
                try {
                    if (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                    }
                    const now = Date.now();
                    if (now - lastFire < 700) return;
                    lastFire = now;
                    console.warn('[MAR] botão acionado:', type);
                    await endoMARLoadSeries(type);
                } catch(e) {
                    console.error('[MAR] falha no handler do botão:', e);
                }
            };

            // Em iPhone/Safari, click pode ser engolido por handlers do Cornerstone.
            // Por isso usamos pointerup/touchend/click com trava anti-duplo disparo.
            btn.addEventListener('pointerup', fire, { passive: false });
            btn.addEventListener('touchend', fire, { passive: false });
            btn.addEventListener('click', fire, { passive: false });
            btn.addEventListener('touchstart', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            }, { passive: false });
            btn.addEventListener('pointerdown', (ev) => {
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            }, { passive: false });

            return btn;
        };

        selector.appendChild(makeBtn('NORMAL', 'Normal'));
        selector.appendChild(makeBtn('MAR', 'MAR'));

        if (host !== document.body) {
            const computed = window.getComputedStyle(host);
            if (computed.position === 'static') host.style.position = 'relative';
        } else {
            selector.style.position = 'fixed';
        }

        host.appendChild(selector);
    } catch (e) {
        console.warn('[MAR] Falha ao renderizar seletor:', e);
    }
}

function endoMARResetAxialViewportForSeriesSwitch() {
    const element = document.getElementById('axial-viewport');
    if (!element) return;

    try { element.removeEventListener('cornerstoneimagerendered', onImageRenderedMobile); } catch(e) {}

    try {
        if (cornerstoneTools && typeof cornerstoneTools.clearToolState === 'function') {
            cornerstoneTools.clearToolState(element, 'stack');
        } else if (cornerstoneTools && typeof cornerstoneTools.getToolState === 'function') {
            const st = cornerstoneTools.getToolState(element, 'stack');
            if (st && st.data) st.data.length = 0;
        }
    } catch(e) {}

    try {
        cornerstone.disable(element);
    } catch(e) {}

    try {
        mobileStack = { imageIds: [], currentImageIdIndex: 0 };
    } catch(e) {}

    try { mainStackIds = []; } catch(e) {}
}

async function endoMARLoadSeries(type) {
    const s = window.EndoMARSeriesStore;
    if (!s) return;

    const target = String(type || '').toUpperCase() === 'MAR' ? 'MAR' : 'NORMAL';

    console.warn('[MAR] Solicitação de troca:', {
        target,
        selected: s.selected,
        normal: s.normal ? s.normal.length : 0,
        mar: s.mar ? s.mar.length : 0
    });

    if (s.selected === target) {
        console.warn('[MAR] Série já está ativa:', target);
        endoRenderMARSelector();
        return;
    }

    const files = target === 'MAR' ? s.mar : s.normal;
    if (!files || !files.length) {
        alert(`Série ${target} não encontrada neste exame.`);
        return;
    }

    // Atualiza visualmente antes do carregamento, para o usuário perceber o toque.
    s.selected = target;
    endoRenderMARSelector();
    endoMARSetSelectorBusy(target, true);

    try {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.classList.add('active');
            loadingEl.style.opacity = '1';
            loadingEl.style.setProperty('display', 'flex', 'important');
        }

        updateAppLoading(20, `Carregando série ${target === 'MAR' ? 'MAR' : 'Normal'}...`);

        // Invalida derivados para não misturar Normal/MAR.
        try { isEndoMPRInitialized = false; } catch(e) {}
        try { volumeData = null; } catch(e) {}
        try { window._volume3D = null; } catch(e) {}
        try { window._volumeRawBackup = null; } catch(e) {}
        try { cornerstone.imageCache.purgeCache(); } catch(e) {}

        const normalized = await endoMARNormalizeFilesForStack(files, target === 'MAR' ? 'MAR' : 'Normal');

        // IMPORTANTÍSSIMO:
        // A lista por pasta pode conter DICOMs auxiliares, scout, objetos sem PixelData
        // ou mais de uma série. Antes, o seletor registrava TODOS os arquivos do grupo
        // diretamente no Cornerstone, e isso podia fazer o axial mostrar só uma parte
        // correta dos cortes, ou misturar/engasgar no scroll.
        // Aqui usamos a mesma triagem leve do fluxo principal, mas apenas dentro do
        // grupo selecionado (Normal OU MAR). Assim o stack final é uma série de imagem
        // única e consistente, não a pasta inteira bruta.
        let stackFiles = normalized;
        try {
            if (typeof endoFilterAndSelectInitialDicomSeries === 'function') {
                updateAppLoading(58, `Selecionando cortes úteis ${target === 'MAR' ? 'MAR' : 'Normal'}...`);
                const selectedRecords = await endoFilterAndSelectInitialDicomSeries(normalized);
                const selectedFiles = selectedRecords.map(r => r.file).filter(Boolean);
                if (selectedFiles.length > 0) stackFiles = selectedFiles;
            }
        } catch(e) {
            console.warn('[MAR] Triagem da série selecionada falhou; usando lista normalizada.', e);
        }

        console.warn('[MAR] Stack final para série:', {
            target,
            brutos: files.length,
            normalizados: normalized.length,
            stackFinal: stackFiles.length,
            sample: stackFiles.slice(0, 5).map(endoMARPathOf)
        });

        const imageIds = stackFiles.map(f => {
            const id = cornerstoneWADOImageLoader.wadouri.fileManager.add(f);
            try { imageIdToFilename[id] = endoMARPathOf(f) || (f && f.name) || ''; } catch(e) {}
            return id;
        });

        if (!imageIds.length) throw new Error('Nenhuma imagem registrada para a série ' + target);

        // Reset rígido do viewport axial para evitar stack antigo preso no Cornerstone Tools.
        endoMARResetAxialViewportForSeriesSwitch();

        try {
            const axialBtn = Array.from(document.querySelectorAll('.dock-item')).find(b => /axial/i.test(b.textContent || ''));
            if (typeof switchTab === 'function') switchTab('axial', axialBtn || null);
        } catch(e) {}

        await loadMobileStack(imageIds);

        // Mostra o corte médio após a troca para ficar evidente que a série mudou
        // e para evitar impressão de que apenas o início carregou.
        try {
            const element = document.getElementById('axial-viewport');
            const mid = Math.max(0, Math.floor(imageIds.length / 2));
            if (element && imageIds[mid]) {
                mobileStack.currentImageIdIndex = mid;
                const midImage = await cornerstone.loadImage(imageIds[mid]);
                cornerstone.displayImage(element, midImage);
                const st = cornerstoneTools.getToolState(element, 'stack');
                if (st && st.data && st.data[0]) st.data[0].currentImageIdIndex = mid;
                if (typeof updateSliceSliderPosition === 'function') updateSliceSliderPosition(mid, imageIds.length);
            }
        } catch(e) {
            console.warn('[MAR] Não foi possível pular para corte médio após troca:', e);
        }

        updateAppLoading(100, `${target === 'MAR' ? 'MAR' : 'Normal'} carregado (${imageIds.length} cortes).`);

        setTimeout(() => {
            endoRenderMARSelector();
            const selector = document.getElementById('endo-mar-selector');
            if (selector) selector.style.opacity = '1';
        }, 300);

    } catch(e) {
        // Se falhar, volta o estado visual para a outra série.
        s.selected = target === 'MAR' ? 'NORMAL' : 'MAR';
        console.error('[MAR] Erro ao trocar série:', e);
        alert('Erro ao trocar série: ' + (e && e.message ? e.message : e));
        setTimeout(endoRenderMARSelector, 200);
    } finally {
        setTimeout(() => {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.style.setProperty('display', 'none', 'important');
                loadingEl.classList.remove('active');
            }
        }, 500);
    }
}

async function endoMARNormalizeFilesForStack(files, label) {
    const source = endoMARSortFiles(files || []);
    const normalized = [];
    const total = source.length;
    const CHUNK = (window.DICOM_PERF && window.DICOM_PERF.normalizeChunk) ? window.DICOM_PERF.normalizeChunk : 20;

    for (let i = 0; i < source.length; i += CHUNK) {
        const chunk = source.slice(i, i + CHUNK);
        const current = Math.min(i + CHUNK, total);
        updateAppLoading(30 + Math.round((current / Math.max(1, total)) * 25), `Preparando ${label}... ${current} / ${total}`);
        if (typeof yieldToBrowser === 'function') await yieldToBrowser(0);
        else await new Promise(r => setTimeout(r, 0));

        const out = await Promise.all(chunk.map(async (f) => {
            let nf;
            try { nf = await normalizeDicomFileToPart10IfNeeded(f); }
            catch(e) { nf = f; }
            if (!nf) nf = f;

            const p = endoMARPathOf(f) || endoMARPathOf(nf) || (f && f.name) || '';
            const n = (f && f.name) || (p ? p.split('/').pop() : '') || (nf && nf.name) || 'dicom.dcm';
            try { nf._zipPath = p; } catch(e) {}
            try { nf._fullPath = p; } catch(e) {}
            try {
                if (!nf.name || nf.name === 'blob') Object.defineProperty(nf, 'name', { value: n, configurable: true });
            } catch(e) {}
            try {
                if (p && !nf.webkitRelativePath) Object.defineProperty(nf, 'webkitRelativePath', { value: p, configurable: true });
            } catch(e) {}
            return nf;
        }));
        normalized.push(...out);
    }

    return normalized;
}

// [REMOVIDO] definição duplicada de endoMARLoadSeries removida para não sobrescrever o loader corrigido.



// ==========================================================
// 🧪 TRIAGEM DICOM LEVE — PixelData + seleção de série inicial
// ----------------------------------------------------------
// Corrige ZIPs mistos: série normal + MAR + DICOMDIR + SR/scout/metadados.
// Não carrega tudo em paralelo. Lê um arquivo por vez ou em pequenos lotes.
// ==========================================================

function _endoDicomPathOf(file) {
    return String(
        (file && (file._zipPath || file._fullPath || file.webkitRelativePath || file.relativePath || file.name)) || ''
    );
}

function _endoDicomFolderOf(path) {
    const p = String(path || '');
    const idx = p.lastIndexOf('/');
    return idx >= 0 ? p.slice(0, idx) : '';
}

function _endoSafeString(ds, tag) {
    try {
        const v = ds.string(tag);
        return v == null ? '' : String(v).trim();
    } catch(e) {
        return '';
    }
}

function _endoSafeUint16(ds, tag) {
    try {
        const v = ds.uint16(tag);
        return Number.isFinite(v) ? v : 0;
    } catch(e) {
        return 0;
    }
}

function _endoSafeIntString(ds, tag) {
    const s = _endoSafeString(ds, tag);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

function _endoPathPenalty(path) {
    const p = String(path || '').toUpperCase();

    let penalty = 0;

    // Não exclui MAR; apenas evita escolhê-lo como série inicial quando houver normal.
    if (p.includes('/MAR') || p.includes('\\MAR') || p.includes('MAR_') || p.includes('-MAR') || p.includes(' MAR')) {
        penalty += 300;
    }

    // Penaliza arquivos/séries auxiliares.
    if (p.includes('SCOUT') || p.includes('LOCALIZER') || p.includes('LOCALI') || p.includes('SURVIEW')) {
        penalty += 800;
    }

    if (p.includes('REPORT') || p.includes('RELATOR') || p.includes('STRUCT') || p.includes('SR')) {
        penalty += 500;
    }

    if (p.includes('DICOMDIR')) {
        penalty += 1000;
    }

    return penalty;
}

async function _endoReadDicomImageMetaLight(file) {
    try {
        if (!file || file.size <= 132) return null;

        const dp =
            window.dicomParser ||
            (
                window.cornerstoneWADOImageLoader &&
                cornerstoneWADOImageLoader.external &&
                cornerstoneWADOImageLoader.external.dicomParser
            );

        if (!dp) {
            // Sem parser, não dá para validar. Melhor deixar passar do que bloquear tudo.
            return {
                file,
                path: _endoDicomPathOf(file),
                folder: _endoDicomFolderOf(_endoDicomPathOf(file)),
                seriesUID: '',
                rows: 0,
                cols: 0,
                instanceNumber: null,
                hasPixelData: true,
                fallback: true
            };
        }

        const path = _endoDicomPathOf(file);
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);

        // untilTag evita parsear além do PixelData.
        // Ainda lê o arquivo em ArrayBuffer, mas só um arquivo por vez/lote pequeno.
        const ds = dp.parseDicom(bytes, { untilTag: 'x7fe00010' });

        const hasPixelData = !!(ds && ds.elements && ds.elements.x7fe00010);
        if (!hasPixelData) return null;

        const rows = _endoSafeUint16(ds, 'x00280010');
        const cols = _endoSafeUint16(ds, 'x00280011');

        // DICOM com PixelData, mas não parece corte de imagem útil.
        if (rows < 16 || cols < 16) return null;

        const imageType = _endoSafeString(ds, 'x00080008').toUpperCase();
        const modality  = _endoSafeString(ds, 'x00080060').toUpperCase();

        // Remove objetos claramente não-tomográficos.
        if (modality === 'SR' || modality === 'PR' || modality === 'KO') return null;

        return {
            file,
            path,
            folder: _endoDicomFolderOf(path),
            seriesUID: _endoSafeString(ds, 'x0020000e'),
            studyUID: _endoSafeString(ds, 'x0020000d'),
            rows,
            cols,
            imageType,
            modality,
            instanceNumber: _endoSafeIntString(ds, 'x00200013'),
            hasPixelData: true,
            penalty: _endoPathPenalty(path)
        };

    } catch(e) {
        // Não é DICOM de imagem ou parser não conseguiu ler.
        return null;
    }
}

function _endoSelectBestInitialDicomSeries(records) {
    if (!records || !records.length) return [];

    const groups = new Map();

    for (const r of records) {
        const marBucket = /(^|[\/\\_\-\s])MAR($|[\/\\_\-\s])/i.test(r.path || '') ? 'MAR' : 'NORMAL';

        // Inclui folder/marBucket para não misturar série normal e série MAR
        // mesmo quando o tomógrafo reaproveita metadados parecidos.
        const key = [
            r.seriesUID || 'NO_SERIES_UID',
            `${r.rows}x${r.cols}`,
            marBucket,
            r.folder || 'NO_FOLDER'
        ].join('|');

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    let best = null;
    let bestScore = -Infinity;

    for (const group of groups.values()) {
        const first = group[0];

        let score = 0;

        // Série principal de CBCT tende a ter muitas fatias.
        score += group.length * 10;

        // Matriz consistente e grande.
        if (first.rows >= 256 && first.cols >= 256) score += 80;
        if (first.rows >= 512 && first.cols >= 512) score += 120;

        // Penaliza MAR como primeira escolha, mas não elimina.
        const avgPenalty = group.reduce((s, r) => s + (r.penalty || 0), 0) / group.length;
        score -= avgPenalty;

        // Penaliza grupos muito pequenos.
        if (group.length < 20) score -= 500;
        if (group.length < 5)  score -= 1000;

        if (score > bestScore) {
            bestScore = score;
            best = group;
        }
    }

    const selected = best || records;

    selected.sort((a, b) => {
        if (a.instanceNumber != null && b.instanceNumber != null) {
            return a.instanceNumber - b.instanceNumber;
        }

        if (typeof dicomLegacyFilenameComparator === 'function') {
            return dicomLegacyFilenameComparator(a.path || a.file.name, b.path || b.file.name);
        }

        return String(a.path || a.file.name).localeCompare(
            String(b.path || b.file.name),
            undefined,
            { numeric: true }
        );
    });

    console.warn(
        `[DICOM] ${records.length} arquivos com PixelData. ` +
        `Série inicial selecionada: ${selected.length} fatias. ` +
        `Pasta: ${selected[0] && selected[0].folder ? selected[0].folder : '(sem pasta)'}`
    );

    return selected;
}

async function endoFilterAndSelectInitialDicomSeries(files) {
    const input = Array.from(files || []);
    const records = [];

    const isBig =
        typeof isEndoBigVolumeMode === 'function' &&
        isEndoBigVolumeMode();

    const STEP = isBig ? 4 : 16;

    for (let i = 0; i < input.length; i += STEP) {
        const chunk = input.slice(i, i + STEP);

        updateAppLoading(
            52,
            `Validando imagens DICOM... ${Math.min(i + STEP, input.length)} / ${input.length}`
        );

        // Em Big Volume Mode, é melhor sequencial real.
        if (isBig) {
            for (const f of chunk) {
                const rec = await _endoReadDicomImageMetaLight(f);
                if (rec) records.push(rec);
                if (typeof yieldToBrowser === 'function') await yieldToBrowser(0);
                else await new Promise(r => setTimeout(r, 0));
            }
        } else {
            const out = await Promise.all(chunk.map(_endoReadDicomImageMetaLight));
            for (const rec of out) {
                if (rec) records.push(rec);
            }
        }

        if (typeof yieldToBrowser === 'function') await yieldToBrowser(isBig ? 8 : 0);
        else await new Promise(r => setTimeout(r, isBig ? 8 : 0));
    }

    if (!records.length) {
        throw new Error(
            'Nenhuma imagem DICOM com PixelData foi encontrada. O ZIP pode conter apenas metadados/DICOMDIR/relatório ou uma estrutura não suportada.'
        );
    }

    return _endoSelectBestInitialDicomSeries(records);
}


async function processMobileFileList(files) {
    const validFiles = Array.from(files || []).filter(f => f && f.size > 512);

    if (validFiles.length === 0) {
        updateAppLoading(100, "Nenhum arquivo DICOM válido encontrado.");
        setTimeout(() => {
            const l = document.getElementById('loading');
            if (l) {
                l.style.setProperty('display', 'none', 'important');
                l.classList.remove('active');
            }
        }, 1500);
        return;
    }

    // Ordena usando caminho completo quando vier de ZIP; se não houver, usa o nome.
    validFiles.sort((a, b) => {
        const an = (a && (a._zipPath || a._fullPath || a.webkitRelativePath || a.name)) || '';
        const bn = (b && (b._zipPath || b._fullPath || b.webkitRelativePath || b.name)) || '';
        return dicomLegacyFilenameComparator(an, bn);
    });

    const totalSize = validFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = totalSize / (1024 * 1024);

    if (
        window.EndoSliceBigVolume &&
        totalSizeMB > window.EndoSliceBigVolume.limits.sourceMB
    ) {
        setEndoBigVolumeMode(
            `DICOMs acima de ${window.EndoSliceBigVolume.limits.sourceMB}MB`,
            totalSizeMB
        );
    }

    const isLarge = totalSize > 80 * 1024 * 1024;

    const normalizeChunk =
        window.DICOM_PERF && window.DICOM_PERF.normalizeChunk
            ? window.DICOM_PERF.normalizeChunk
            : 20;

    const CHUNK = isLarge
        ? normalizeChunk
        : Math.min(validFiles.length, normalizeChunk);

    const normalized = [];

    for (let i = 0; i < validFiles.length; i += CHUNK) {
        const chunk = validFiles.slice(i, i + CHUNK);
        const current = Math.min(i + CHUNK, validFiles.length);

        const percent = 30 + Math.round((current / validFiles.length) * 20);
        updateAppLoading(
            percent,
            `Preparando DICOM... ${current} / ${validFiles.length}`
        );

        if (typeof yieldToBrowser === 'function') {
            await yieldToBrowser(0);
        } else {
            await new Promise(r => setTimeout(r, 0));
        }

        const chunkNorm = await Promise.all(
            chunk.map(async (f) => {
                let nf;

                try {
                    nf = await normalizeDicomFileToPart10IfNeeded(f);
                } catch (e) {
                    nf = f;
                }

                if (!nf) nf = f;

                // Preserva caminho completo do ZIP após normalização.
                // Isso é essencial para distinguir pasta normal, pasta MAR, scout, SR etc.
                const originalPath =
                    (f && (f._zipPath || f._fullPath || f.webkitRelativePath || f.relativePath || f.name)) ||
                    (nf && (nf._zipPath || nf._fullPath || nf.webkitRelativePath || nf.relativePath || nf.name)) ||
                    '';

                const originalName =
                    (f && f.name) ||
                    (originalPath ? originalPath.split('/').pop() : '') ||
                    (nf && nf.name) ||
                    'dicom.dcm';

                try { nf._zipPath = originalPath; } catch (e) {}
                try { nf._fullPath = originalPath; } catch (e) {}

                try {
                    if (!nf.name || nf.name === 'blob') {
                        Object.defineProperty(nf, 'name', { value: originalName });
                    }
                } catch (e) {}

                try {
                    if (originalPath && !nf.webkitRelativePath) {
                        Object.defineProperty(nf, 'webkitRelativePath', { value: originalPath });
                    }
                } catch (e) {}

                return nf;
            })
        );

        normalized.push(...chunkNorm);
    }

    // ==========================================================
    // TRIAGEM CORRIGIDA
    // ----------------------------------------------------------
    // Antes: em exames grandes, o app ignorava a validação de PixelData
    // para economizar RAM. Isso deixava DICOM sem imagem entrar no stack.
    //
    // Agora: mesmo em Big Volume Mode, fazemos triagem leve/sequencial:
    // - remove DICOM sem PixelData;
    // - preserva caminho de pasta;
    // - separa série normal/MAR;
    // - escolhe a melhor série inicial para o AXIAL.
    // ==========================================================

    let finalList = [];

    try {
        if (typeof endoFilterAndSelectInitialDicomSeries === 'function') {
            const selectedRecords = await endoFilterAndSelectInitialDicomSeries(normalized);
            finalList = selectedRecords.map(r => r.file).filter(Boolean);
        } else {
            console.warn(
                '[DICOM] endoFilterAndSelectInitialDicomSeries não encontrada. ' +
                'Usando fallback simples de PixelData.'
            );

            async function _hasPixelDataLight(f) {
                try {
                    if (!f || f.size <= 132) return false;

                    const dp =
                        window.dicomParser ||
                        (
                            window.cornerstoneWADOImageLoader &&
                            cornerstoneWADOImageLoader.external &&
                            cornerstoneWADOImageLoader.external.dicomParser
                        );

                    if (!dp) return true;

                    const buf = new Uint8Array(await f.arrayBuffer());
                    const ds = dp.parseDicom(buf, { untilTag: 'x7fe00010' });

                    const hasPixel = !!(ds && ds.elements && ds.elements.x7fe00010);
                    if (!hasPixel) return false;

                    const rows = ds.uint16('x00280010') || 0;
                    const cols = ds.uint16('x00280011') || 0;

                    return rows >= 16 && cols >= 16;
                } catch (e) {
                    return false;
                }
            }

            const flags = [];
            const STEP = isLarge ? 4 : 16;

            for (let i = 0; i < normalized.length; i += STEP) {
                const part = normalized.slice(i, i + STEP);

                updateAppLoading(
                    55,
                    `Validando imagens DICOM... ${Math.min(i + STEP, normalized.length)} / ${normalized.length}`
                );

                if (isLarge) {
                    for (const f of part) {
                        flags.push(await _hasPixelDataLight(f));
                        if (typeof yieldToBrowser === 'function') await yieldToBrowser(0);
                        else await new Promise(r => setTimeout(r, 0));
                    }
                } else {
                    const r = await Promise.all(part.map(_hasPixelDataLight));
                    flags.push(...r);
                }

                if (typeof yieldToBrowser === 'function') {
                    await yieldToBrowser(isLarge ? 8 : 0);
                } else {
                    await new Promise(r => setTimeout(r, isLarge ? 8 : 0));
                }
            }

            finalList = normalized.filter((f, i) => flags[i]);
        }
    } catch (e) {
        console.error('[DICOM] Falha na triagem de PixelData/série:', e);

        alert(
            e && e.message
                ? e.message
                : 'Não foi possível encontrar uma série DICOM de imagem neste exame.'
        );

        const l = document.getElementById('loading');
        if (l) {
            l.style.setProperty('display', 'none', 'important');
            l.classList.remove('active');
        }

        return;
    }

    if (!finalList || finalList.length === 0) {
        console.error('[DICOM] Nenhuma imagem com PixelData após triagem.');

        alert(
            'Nenhuma imagem DICOM válida foi encontrada após a triagem. ' +
            'O ZIP pode conter apenas metadados, DICOMDIR, relatórios ou uma série não suportada.'
        );

        const l = document.getElementById('loading');
        if (l) {
            l.style.setProperty('display', 'none', 'important');
            l.classList.remove('active');
        }

        return;
    }

    console.warn(
        `[DICOM] Lista final para AXIAL: ${finalList.length} imagens de ${normalized.length} arquivos normalizados.`
    );

    const imageIds = finalList.map(f => {
        const id = cornerstoneWADOImageLoader.wadouri.fileManager.add(f);

        try {
            imageIdToFilename[id] =
                (f && (f._zipPath || f._fullPath || f.webkitRelativePath || f.name)) || '';
        } catch (e) {}

        return id;
    });

    if (!imageIds.length) {
        alert('Nenhuma imagem DICOM válida foi registrada no loader.');
        const l = document.getElementById('loading');
        if (l) {
            l.style.setProperty('display', 'none', 'important');
            l.classList.remove('active');
        }
        return;
    }

    try {
        await loadMobileStack(imageIds);
    } catch (err) {
        console.error('[DICOM] Erro ao abrir stack axial:', err);

        alert(
            'Erro ao abrir o exame: ' +
            (err && err.message ? err.message : err)
        );

        const l = document.getElementById('loading');
        if (l) {
            l.style.setProperty('display', 'none', 'important');
            l.classList.remove('active');
        }
    }
}


// ==========================================================
// 🧠 VARIÁVEIS GLOBAIS (ESTADO DO APP)
// ==========================================================

// --- ESTADO DO VOLUME E IMAGENS ---
var volumeData = null; 
var volumeMeta = { 
    x: 0, y: 0, z: 0,
    pixelSpacing: 1.0,
    sliceThickness: 1.0,
    min: -1000, max: 3000
};
var mainStackIds = []; 
var isEndoMPRInitialized = false;
var mobileStack = { imageIds: [], currentImageIdIndex: 0 };

// --- MAPA imageId -> nome de arquivo original (para fallback legado Morita/SLZ) ---
var imageIdToFilename = {};



// ==========================================================
// 🧠 BIG VOLUME MODE — modo seguro para exames gigantes mobile
// ----------------------------------------------------------
// Não altera o fluxo normal. Só entra quando o arquivo/volume
// é grande demais para Safari mobile abrir como exame comum.
// ==========================================================

window.EndoSliceBigVolume = window.EndoSliceBigVolume || {
    enabled: false,
    reason: '',
    sourceSizeMB: 0,
    estimatedVolumeMB: 0,
    mprUserRequested: false,
    threeDUserRequested: false,
    panUserRequested: false,
    userAccepted: {
        endo: false,
        pan: false,
        '3d': false
    },
    limits: {
        sourceMB: 450,              // gatilho por tamanho bruto do arquivo/seleção
        iosFullResEstimatedMB: 220, // MPR full-res até aqui no iOS
        androidFullResEstimatedMB: 280,
        desktopFullResEstimatedMB: 320,
        directDownsampleMB: 320     // acima disso, se Big Mode, monta MPR seguro direto
    }
};

function resetEndoBigVolumeMode() {
    window.EndoSliceBigVolume.enabled = false;
    window.EndoSliceBigVolume.reason = '';
    window.EndoSliceBigVolume.sourceSizeMB = 0;
    window.EndoSliceBigVolume.estimatedVolumeMB = 0;
    window.EndoSliceBigVolume.mprUserRequested = false;
    window.EndoSliceBigVolume.threeDUserRequested = false;
    window.EndoSliceBigVolume.panUserRequested = false;
    window.EndoSliceBigVolume.userAccepted = {
        endo: false,
        pan: false,
        '3d': false
    };
    try { document.body.classList.remove('big-volume-mode'); } catch(e) {}
}

function setEndoBigVolumeMode(reason, sourceSizeMB) {
    window.EndoSliceBigVolume.enabled = true;
    window.EndoSliceBigVolume.reason = reason || 'Exame grande';
    window.EndoSliceBigVolume.sourceSizeMB = Number(sourceSizeMB || 0);
    try { document.body.classList.add('big-volume-mode'); } catch(e) {}
    console.warn('[EndoSlice] Big Volume Mode ativado:', window.EndoSliceBigVolume);
}

function isEndoBigVolumeMode() {
    return !!(window.EndoSliceBigVolume && window.EndoSliceBigVolume.enabled);
}

function getEndoFullResLimitMB() {
    const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isIOS) return window.EndoSliceBigVolume.limits.iosFullResEstimatedMB;
    if (isAndroid) return window.EndoSliceBigVolume.limits.androidFullResEstimatedMB;
    return window.EndoSliceBigVolume.limits.desktopFullResEstimatedMB;
}

function showEndoBigVolumeNotice(message) {
    try {
        let box = document.getElementById('big-volume-notice');
        if (!box) {
            box = document.createElement('div');
            box.id = 'big-volume-notice';
            box.style.cssText = `
                position:fixed;
                left:50%;
                bottom:calc(34px + env(safe-area-inset-bottom, 0px));
                transform:translateX(-50%);
                width:min(92vw, 460px);
                z-index:2147483647;
                background:rgba(20,24,32,0.96);
                color:#E0E5EC;
                border:1px solid rgba(74,144,226,0.35);
                border-radius:18px;
                padding:14px 16px;
                font:700 12px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;
                box-shadow:0 12px 34px rgba(0,0,0,0.55);
                backdrop-filter:blur(14px);
                -webkit-backdrop-filter:blur(14px);
                text-align:center;
                pointer-events:none;
            `;
            document.body.appendChild(box);
        }

        box.textContent = message;
        box.style.opacity = '1';
        clearTimeout(window._bigVolumeNoticeTimer);
        window._bigVolumeNoticeTimer = setTimeout(() => {
            if (box) box.style.opacity = '0';
        }, 5000);
    } catch(e) {
        console.warn('[BigVolume notice]', message);
    }
}

function confirmEndoHeavyTab(tabId) {
    if (!isEndoBigVolumeMode()) return true;
    if (tabId !== 'endo' && tabId !== '3d' && tabId !== 'pan') return true;

    if (window.EndoSliceBigVolume.userAccepted[tabId]) return true;

    let label = tabId === 'endo' ? 'MPR/Endo' : tabId === '3d' ? '3D' : 'Panorâmica/Implante';

    const msg =
        `Este é um exame muito grande (${window.EndoSliceBigVolume.sourceSizeMB.toFixed(0)} MB).\n\n` +
        `Para evitar tela branca no Safari, o EndoSlice abriu primeiro o AXIAL.\n\n` +
        `Ao entrar em ${label}, o app poderá montar um volume seguro sob demanda e pode demorar mais.\n\n` +
        `Deseja carregar ${label} agora?`;

    const ok = window.confirm(msg);

    if (!ok) {
        showEndoBigVolumeNotice('Modo seguro ativo: AXIAL liberado. MPR/3D ficam sob demanda para evitar crash.');
        return false;
    }

    window.EndoSliceBigVolume.userAccepted[tabId] = true;

    if (tabId === 'endo') window.EndoSliceBigVolume.mprUserRequested = true;
    if (tabId === 'pan')  window.EndoSliceBigVolume.panUserRequested = true;
    if (tabId === '3d')  window.EndoSliceBigVolume.threeDUserRequested = true;

    return true;
}

// ==========================================================
// 🧭 ESTADO CENTRALIZADO DE ORIENTAÇÃO DO EXAME (ETAPA 1)
// ----------------------------------------------------------
// flipX/Y/Z       -> orientação DESEJADA do volume (alvo).
// _applied        -> o que já está materializado em volumeData.
// source          -> 'dicom-orientation' | 'instance-number' | 'legacy-filename'
// sortDirection   -> -1 reproduz o comportamento antigo (Z decrescente) p/ axial padrão.
// ==========================================================
var examOrientationState = {
    flipX: false, flipY: false, flipZ: false,
    swapXY: false,
    sortDirection: 1,        // +1 = canônico: fatia 0 = inferior (alinhado ao vflip/3D)
    source: null,
    seriesUID: null,
    studyUID: null,
    manufacturer: null,
    sliceSpacing: null,
    _key: null,
    _applied: { x: false, y: false, z: false }
};
var safeState = { 
    wc: 850, ww: 5000,
    minPixel: -1000, maxPixel: 3000 
};
// Controle de espessura por plano
var thicknessState = { axial: 'native', coronal: 'native', sagittal: 'native' };

function handleTap(event) {
    // Mantém apenas a lógica de fechar os menus pop-up ao clicar fora.
    // A chamada para a função inexistente foi removida.
    const clickedOnMenu = event.target.closest('.fab-group-left, .fab-group-right');
    if (!clickedOnMenu) {
        closePopups();
    }
}

// changeSlab: definição única abaixo

var isDraggingAnySlider = false;

// --- ESTADO DA MIRA (CROSSHAIR) ---
var crosshairState = { x: 0, y: 0, z: 0 }; 
var isCrosshairActive = false;
var isDraggingCrosshair = false;
var crosshairDragOffset = { x: 0, y: 0 };
// BUG 3/4: visibilidade das linhas da mira e espelhamento do corte oblíquo
var crosshairLinesHidden = false;
var obliqueMirror = false;

// ==========================================================
// 🧭 NOVO ESTADO DO MODO OBLÍQUO (O CORAÇÃO DA LÓGICA)
// ==========================================================
var obliqueState = {
    isActive: false,
    yaw: 0, pitch: 0, roll: 0,
    isDragging: false,
    lastDragPoint: { x: 0, y: 0 },
    quality: 'high',
    qualityTimeout: null,
    mode: 'translate', // 'rotate' ou 'translate'
    renderPending: false,
    sliceOffsets: { axial: 0, coronal: 0, sagittal: 0 },
    baseIndices: { axial: 0, coronal: 0, sagittal: 0 }
};

var obliqueTranslateGrab = {
  active: false,
  offsetImgX: 0,
  offsetImgY: 0
};


// --- LOGICA DE INTERFACE (NENHUMA MUDANÇA AQUI) ---
function closePopups() { closeAllUIMenus(); }


// ==========================================================
// FUNÇÃO RECUPERADA: Restaura estado do implante para o 3D
// ==========================================================
function _restoreImplantStateOnly() {
    const s = window._savedImplant;
    if (!s) return;
    implantState.cutArrIdx = s.cutArrIdx;
    implantState.cutImgX   = s.cutImgX;
    implantState.cutImgY   = s.cutImgY;
    implantState.volX      = s.volX;
    implantState.volY      = s.volY;
    implantState.volZ      = s.volZ;
    implantState.diameter  = s.diameter;
    implantState.length    = s.length;
    implantState.angleDeg  = s.angleDeg;
}



function switchTab(id, btn) {
        // Big Volume Mode: não deixa ENDO/PAN/3D dispararem montagem pesada sem confirmação.
    if (typeof confirmEndoHeavyTab === 'function') {
        const allowed = confirmEndoHeavyTab(id);
        if (!allowed) {
            const axialBtn = document.querySelector('.dock-item');
            if (axialBtn && typeof switchTab === 'function' && id !== 'axial') {
                // mantém usuário no axial, sem disparar buildVolumeMobile
                document.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active'));
                axialBtn.classList.add('active');
            }
            return;
        }
    }
    document.querySelectorAll('.module-tab').forEach(t => {
        t.classList.remove('active');
        t.style.display = 'none';
    });

    if (typeof _implantRemoveOverlays === 'function') {
        _implantRemoveOverlays();
    }
    if (typeof implantState !== 'undefined' && implantState.cutArrIdx >= 0 && id !== 'pan' && id !== '3d') {
        _saveImplant();
    }

    const target = document.getElementById('tab-' + id);
    if (target) {
        let displayStyle = 'block';
        if (id === 'endo') displayStyle = 'grid';
        if (id === 'axial' || id === 'pan' || id === '3d') displayStyle = 'flex';
        target.style.display = displayStyle;
        setTimeout(() => target.classList.add('active'), 10);
    }

    document.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    closePopups();

    // EndoTools (2A.1): FAB visível só na aba Endo; fecha o sheet ao sair
    if (typeof endoToolsSetTabVisibility === 'function') endoToolsSetTabVisibility(id);

    const leftFab = document.querySelector('.fab-group-left');
    const settingsPanel = document.querySelector('.settings-container');

    if (leftFab) leftFab.classList.remove('active');

    if (settingsPanel) {
        if (id === 'axial' || id === 'endo' || id === 'pan' || id === '3d') {
            settingsPanel.style.display = 'none';
            settingsPanel.style.opacity = '0';
            settingsPanel.style.transform = 'translateX(-20px)';
            settingsPanel.setAttribute('data-hidden-in-tomo', '1');
        } else {
            settingsPanel.style.display = '';
            settingsPanel.style.opacity = '';
            settingsPanel.style.transform = '';
            settingsPanel.removeAttribute('data-hidden-in-tomo');
        }
    }

    const dock = document.getElementById('dockNav');
    if (dock) {
        if (id === 'endo') dock.classList.add('hidden');
        else dock.classList.remove('hidden');
    }
    // Atualiza visibilidade do grip inferior
    if (typeof _updateBottomGrip === 'function') _updateBottomGrip();
    
    if (id === 'endo') {
        var cover = document.getElementById('endo-cover');
        if (cover) cover.classList.remove('hidden');
        ensureEndoMPRIsReadyMobile();
    } else if (id === '3d') {
        const panel3Db = document.getElementById('vrPresetsPanel');
        if (panel3Db) panel3Db.style.display = 'flex';
        if (window._savedImplant && window._savedImplant.volX != null) _restoreImplantStateOnly(); 
        
        if (!is3DInitialized) {
            setTimeout(() => init3DRender(), 50);
        } else {
            on3DWindowResize();
            animate3D(); // <--- FIX: Acorda o loop de renderização instantaneamente
        }
    } else if (id === 'pan') {
        if (window._savedImplant && window._savedImplant.cutArrIdx >= 0) {
            const phase3 = document.getElementById('pan-phase-3');
            if (phase3 && phase3.classList.contains('active')) setTimeout(_restoreImplant, 300);
        }
    }

    setTimeout(forceViewportSync, 100);
    resetTimer();
}



let idle;
const IDLE_TIMEOUT = 6000;

function resetTimer(e) {
    var dock = document.getElementById('dockNav');
    clearTimeout(idle);
    idle = setTimeout(function() {
        // Fecha tudo (backdrop, FABs, etc.)
        closeAllUIMenus();
        // Esconde a dock por inatividade
        if (dock) dock.classList.add('hidden');
        // Atualiza grip inferior
        if (typeof _updateBottomGrip === 'function') _updateBottomGrip();
    }, IDLE_TIMEOUT);
}




function setDockVisibility(shouldShow) { const dock = document.getElementById('dockNav'); if (!dock) return; if (shouldShow) { dock.classList.remove('hidden'); } else { dock.classList.add('hidden'); } }
// VARIÁVEL GLOBAL para rastrear o tempo do toque
let lastTouchTime = 0;
const DBL_TAP_THRESHOLD = 350; // 350ms entre os toques

function toggleDockFromEndoHotspot(event) {
    if (!document.getElementById('tab-endo').classList.contains('active')) {
        return; // Só funciona na aba ENDO
    }
    
    // Calcula o tempo desde o último toque
    const currentTime = new Date().getTime();
    const timeDiff = currentTime - lastTouchTime;

    // Se a diferença for pequena, é um toque duplo
    if (timeDiff < DBL_TAP_THRESHOLD && timeDiff > 0) {
        if (event) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
        
        const dock = document.getElementById('dockNav');
        if (!dock) return;
        
        const isHiddenNow = dock.classList.contains('hidden');
        
        // Se estiver oculto, mostra a dock (Double Tap)
        if (isHiddenNow) {
            dock.classList.remove('hidden');
            window.__dockShownInEndoByHotspot = true; // Mantém visível por inatividade
        } else {
            // Se estiver visível, esconde
            dock.classList.add('hidden');
            window.__dockShownInEndoByHotspot = false;
        }

        resetTimer(); // Reinicia o timer de inatividade
        lastTouchTime = 0; // Reseta o tempo do toque
    } else {
        // Primeiro toque: armazena o tempo
        lastTouchTime = currentTime;
    }
}





async function safeLoadImages(ids) {
    // PATCH 2026-06-29 — loader tolerante para Safari/iPhone.
    // Tenta por lote pequeno; se falhar, cai para serial sem quebrar a aplicação inteira.
    const out = [];
    const decodeConcurrent =
        (window.DICOM_PERF && window.DICOM_PERF.decodeConcurrent)
            ? window.DICOM_PERF.decodeConcurrent
            : Math.min(2, Math.max(1, ids.length));

    for (let i = 0; i < ids.length; i += decodeConcurrent) {
        const batchIds = ids.slice(i, i + decodeConcurrent);

        try {
            const batch = await Promise.all(
                batchIds.map(id => cornerstone.loadAndCacheImage(id))
            );
            out.push(...batch);
        } catch (batchErr) {
            console.warn('[DICOM] Falha em lote; fallback serial.', batchErr);

            for (const id of batchIds) {
                try {
                    out.push(await cornerstone.loadAndCacheImage(id));
                } catch (err1) {
                    console.warn('[DICOM] Falha na fatia; limpando cache e tentando novamente.', err1);
                    try { cornerstone.imageCache.purgeCache(); } catch (e) {}
                    if (typeof yieldToBrowser === 'function') {
                        await yieldToBrowser(20);
                    } else {
                        await new Promise(r => setTimeout(r, 20));
                    }
                    out.push(await cornerstone.loadAndCacheImage(id));
                }

                if (typeof yieldToBrowser === 'function') {
                    await yieldToBrowser(0);
                }
            }
        }

        if (typeof yieldToBrowser === 'function') {
            await yieldToBrowser(0);
        }
    }

    return out;
}

async function findFirstRenderableImageMobile(imageIds) {
    const ids = Array.from(imageIds || []);

    let firstGoodImage = null;
    let firstGoodIndex = -1;

    const maxProbe = Math.min(ids.length, 25);

    for (let i = 0; i < maxProbe; i++) {
        try {
            const img = await cornerstone.loadImage(ids[i]);
            firstGoodImage = img;
            firstGoodIndex = i;
            break;
        } catch (e) {
            console.warn('[DICOM] imageId inicial inválido ignorado:', i, e && e.message ? e.message : e);
        }
    }

    if (!firstGoodImage || firstGoodIndex < 0) {
        throw new Error('Não foi possível encontrar uma imagem renderizável no início do stack.');
    }

    // Remove IDs ruins antes da primeira imagem boa.
    // O filtro de PixelData deve impedir IDs ruins no meio; isto só protege a abertura.
    return {
        image: firstGoodImage,
        imageIds: ids.slice(firstGoodIndex)
    };
}


async function loadMobileStack(imageIds) { 
    const element = document.getElementById('axial-viewport'); 
    if (!element) return;

    try {
        updateAppLoading(60, "Renderizando visualização...");

        // Evita erro se o elemento já estiver habilitado
        try {
            cornerstone.enable(element);
        } catch(e) {
            // Se já estiver habilitado, segue
        }

        // CORREÇÃO PRINCIPAL:
        // A variável image precisa existir neste escopo.
       const firstRenderable = await findFirstRenderableImageMobile(imageIds);
const image = firstRenderable.image;
imageIds = firstRenderable.imageIds;

        mobileStack.imageIds = imageIds; 
        mainStackIds = imageIds; 

        if (typeof isEndoBigVolumeMode === 'function' && isEndoBigVolumeMode()) {
            showEndoBigVolumeNotice(
                'Exame gigante aberto em modo seguro: AXIAL liberado. ENDO/3D serão carregados sob demanda.'
            );
        }

        cornerstone.displayImage(element, image); 
        
        const stackState = { 
            currentImageIdIndex: 0, 
            imageIds: imageIds 
        }; 

        cornerstoneTools.addStackStateManager(element, ['stack']); 
        cornerstoneTools.addToolState(element, 'stack', stackState); 
        
        cornerstoneTools.addToolForElement(element, cornerstoneTools.PanMultiTouchTool); 
        cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTouchPinchTool); 
        cornerstoneTools.addToolForElement(element, cornerstoneTools.StackScrollTool); 
        cornerstoneTools.addToolForElement(element, cornerstoneTools.WwwcTool); 
        cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool);
        
        cornerstoneTools.addToolForElement(element, cornerstoneTools.MagnifyTool, {
            configuration: { 
                magnifySize: 140, 
                magnificationLevel: 2, 
                guiCursor: false, 
                xOffset: 0, 
                yOffset: 0 
            }
        });
        
        cornerstoneTools.addToolForElement(element, cornerstoneTools.LengthTool, {
            configuration: { 
                drawHandles: false, 
                drawHandlesOnHover: false, 
                handleRadius: 18, 
                selectable: true, 
                distanceThreshold: 40 
            }
        });

        cornerstoneTools.setToolActiveForElement(element, 'StackScroll', { 
            mouseButtonMask: 1, 
            isTouchActive: true 
        }); 

        cornerstoneTools.setToolActiveForElement(element, 'PanMultiTouch', {}); 
        cornerstoneTools.setToolActiveForElement(element, 'ZoomTouchPinch', {}); 

        setupMobileSlider(element, imageIds.length); 

        // Evita duplicar listeners se abrir outro exame
        try {
            element.removeEventListener('cornerstoneimagerendered', onImageRenderedMobile);
        } catch(e) {}

        element.addEventListener('cornerstoneimagerendered', onImageRenderedMobile); 
        
        updateAppLoading(100, "Pronto!");

        setTimeout(() => {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.style.opacity = '0';
                setTimeout(() => { 
                    loadingEl.style.setProperty('display', 'none', 'important'); 
                    loadingEl.classList.remove('active');
                    loadingEl.style.opacity = '1'; 
                }, 300);
            }
        }, 600);

        cornerstone.resize(element, true);
        cornerstone.fitToWindow(element); 

        if (typeof endoRenderMARSelector === 'function') {
            setTimeout(endoRenderMARSelector, 300);
        }

        setTimeout(function(){ 
            if (window.updateDicomInfoOverlay) {
                window.updateDicomInfoOverlay(); 
            }
        }, 800);

        return true;

    } catch (err) {
        console.error("Erro no carregamento Axial:", err);
        updateAppLoading(100, "Erro ao carregar o exame");

        setTimeout(() => {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.style.setProperty('display', 'none', 'important'); 
                loadingEl.classList.remove('active');
            }
        }, 2000);

        throw err;
    }
}

function setupMobileSlider(element, total) { const slider = document.querySelector('#tab-axial input[type=range]'); const txt = document.querySelector('#tab-axial .slice-info span'); if (slider) { slider.min = 0; slider.max = total - 1; slider.value = 0; slider.style.setProperty('--axial-fill', '0%');const stopPropagation = (e) => e.stopPropagation(); slider.addEventListener('touchstart', stopPropagation, { passive: false }); slider.addEventListener('touchmove', stopPropagation, { passive: false }); slider.addEventListener('touchend', (e) => {
    e.stopPropagation();
    window._sliderReleasedAt = Date.now(); // <-- flag anti-click-fantasma
}, { passive: false }); slider.oninput = function () { this.style.setProperty('--axial-fill', (this.max>0 ? (this.value/this.max*100) : 0) + '%');const newIndex = parseInt(this.value); if (txt) txt.innerHTML = '<span class="sc-cur">' + (newIndex + 1) + '</span> / <span class="sc-tot">' + total + '</span>'; if (!mobileStack.imageIds || mobileStack.imageIds.length === 0) return; const targetImageId = mobileStack.imageIds[newIndex]; cornerstone.loadAndCacheImage(targetImageId).then(image => { cornerstone.displayImage(element, image); const stackState = cornerstoneTools.getToolState(element, 'stack'); if (stackState && stackState.data && stackState.data[0]) { stackState.data[0].currentImageIdIndex = newIndex; } }); }; } if (txt) txt.innerHTML = '<span class="sc-cur">1</span> / <span class="sc-tot">' + total + '</span>'; }
function onImageRenderedMobile(e) { const eventData = e.detail; const toolData = cornerstoneTools.getToolState(eventData.element, 'stack'); if (toolData && toolData.data && toolData.data.length) { const stack = toolData.data[0]; const currentIndex = stack.currentImageIdIndex; const total = stack.imageIds.length; const slider = document.querySelector('#tab-axial input[type=range]'); const txt = document.querySelector('#tab-axial .slice-info span'); if (slider && parseInt(slider.value) !== currentIndex) { slider.value = currentIndex; slider.style.setProperty('--axial-fill', (slider.max>0 ? (currentIndex/slider.max*100) : 0) + '%');} if (txt) { txt.innerHTML = '<span class="sc-cur">' + (currentIndex + 1) + '</span> / <span class="sc-tot">' + total + '</span>'; } } }

const coresMedidasNeon = ['#00E676', '#00B0FF', '#FF3D00', '#FFEE58', '#F48FB1', '#CE93D8'];
let indiceCorGlobal = 0;

document.addEventListener('cornerstonetoolsmeasurementadded', (e) => {
    if (e.detail.toolName === 'Length') {
        const measurementData = e.detail.measurementData;

        measurementData.color = coresMedidasNeon[indiceCorGlobal % coresMedidasNeon.length];
        indiceCorGlobal++;

        cornerstone.updateImage(e.detail.element);

        // PATCH:
        // Agora existe uma finalização real da criação da medida.
        // Quando a LengthTool criar uma medida válida, o botão sai do modo desenho.
        requestFinishLengthMeasureCreation(e.detail.element, measurementData);
    }
});

// ==========================================================
// 🧠 CONSTRUÇÃO DE VOLUME (COM ORDENAÇÃO INTELIGENTE)
// ==========================================================

// ---- Downsampling para TCs muito grandes (> 150MB) ----
// Reduz resolução XY e Z pela metade com interpolação bilinear,
// mantendo qualidade visual muito superior ao nearest-neighbor.
// Crítico para não travar iOS com volumes de 512×512×500+.
function createDownsampledVolume(originalImages, originalMeta) {
    console.log(`[OTIMIZAÇÃO] Downsampling com interpolação bilinear. ${originalImages.length} cortes.`);
    const newMeta = { ...originalMeta };
    newMeta.x = Math.floor(originalMeta.x / 2);
    newMeta.y = Math.floor(originalMeta.y / 2);
    newMeta.z = Math.floor(originalMeta.z / 2);
    newMeta.pixelSpacing    = originalMeta.pixelSpacing    * 2;
    newMeta.sliceThickness  = originalMeta.sliceThickness  * 2;

    const downsampledImages = [];
    const origW = originalMeta.x;
    const origH = originalMeta.y;
    const newW  = newMeta.x;
    const newH  = newMeta.y;

    for (let i = 0; i < originalImages.length; i += 2) {
        // Interpolação bilinear: cada pixel novo = média 2×2 do original
        const origPixels = originalImages[i].getPixelData();
        const newPixels  = new Int16Array(newW * newH);
        for (let ny = 0; ny < newH; ny++) {
            const oy0 = ny * 2;
            const oy1 = Math.min(oy0 + 1, origH - 1);
            for (let nx = 0; nx < newW; nx++) {
                const ox0 = nx * 2;
                const ox1 = Math.min(ox0 + 1, origW - 1);
                // Média dos 4 vizinhos (AIP 2×2)
                const v00 = origPixels[oy0 * origW + ox0];
                const v10 = origPixels[oy0 * origW + ox1];
                const v01 = origPixels[oy1 * origW + ox0];
                const v11 = origPixels[oy1 * origW + ox1];
                newPixels[ny * newW + nx] = Math.round((v00 + v10 + v01 + v11) * 0.25);
            }
        }
        downsampledImages.push({
            ...originalImages[i],
            columns: newMeta.x,
            rows:    newMeta.y,
            getPixelData: () => newPixels
        });
    }
    console.log(`[OTIMIZAÇÃO] Volume → ${newMeta.x}×${newMeta.y}×${newMeta.z} (bilinear)`);
    return { downsampledImages, downsampledMeta: newMeta };
}

// ==========================================================
// 🧪 CAMADA ROBUSTA DE NORMALIZAÇÃO DE SÉRIE DICOM (ETAPA 1)
// ----------------------------------------------------------
// Responsabilidade: a partir das imagens JÁ CARREGADAS pelo cornerstone
// (cada uma com .data = dataSet do dicom-parser e .imageId), agrupar por
// série, escolher a série principal de CBCT, descartar localizers e ORDENAR
// pela hierarquia:
//      sortByDicomOrientation()  -> sortByInstanceNumber()  -> sortByLegacyFilenameRules()
// NÃO faz segundo parse de arquivos: reutiliza o dataSet já existente
// (sem duplicar parser). Se o dataSet faltar, cai nos campos diretos do
// objeto de imagem (img.imagePositionPatient / img.instanceNumber) que o
// app já usava.
// ==========================================================

// ---- Helpers vetoriais ----
function _vecCross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}
function _vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function _vecLen(a) { return Math.sqrt(_vecDot(a, a)); }

// ---- Leitura de metadados de UMA imagem (prefere dataSet; fallback p/ campos diretos) ----
function _readSliceMeta(img) {
    const ds = img && img.data;
    const out = {
        imageId: img ? img.imageId : null,
        iop: null, ipp: null,
        instanceNumber: null,
        seriesUID: null, studyUID: null, sopUID: null,
        rows: img ? img.rows : null,
        cols: img ? img.columns : null,
        pixelSpacing: null,
        sliceThickness: null,
        spacingBetween: null,
        manufacturer: null, modality: null, imageType: ''
    };

    function fa(tag, n) { // float array de tamanho n
        try {
            const arr = [];
            for (let i = 0; i < n; i++) {
                const v = ds.floatString(tag, i);
                if (v === undefined || v === null || isNaN(v)) return null;
                arr.push(v);
            }
            return arr;
        } catch (e) { return null; }
    }

    if (ds && typeof ds.string === 'function') {
        try {
            out.iop = fa('x00200037', 6);                       // ImageOrientationPatient
            out.ipp = fa('x00200032', 3);                       // ImagePositionPatient
            const inum = ds.intString('x00200013');             // InstanceNumber
            out.instanceNumber = (inum === undefined || inum === null || isNaN(inum)) ? null : inum;
            out.seriesUID = ds.string('x0020000e') || null;     // SeriesInstanceUID
            out.studyUID  = ds.string('x0020000d') || null;     // StudyInstanceUID
            out.sopUID    = ds.string('x00080018') || null;     // SOPInstanceUID
            const ps = fa('x00280030', 2);                      // PixelSpacing
            if (ps) out.pixelSpacing = ps[0];
            const st = ds.floatString('x00180050');             // SliceThickness
            if (st !== undefined && st !== null && !isNaN(st)) out.sliceThickness = st;
            const sb = ds.floatString('x00180088');             // SpacingBetweenSlices
            if (sb !== undefined && sb !== null && !isNaN(sb)) out.spacingBetween = sb;
            const r = ds.uint16 ? ds.uint16('x00280010') : null; // Rows
            const c = ds.uint16 ? ds.uint16('x00280011') : null; // Columns
            if (r) out.rows = r;
            if (c) out.cols = c;
            out.manufacturer = ds.string('x00080070') || null;  // Manufacturer
            out.modality     = ds.string('x00080060') || null;  // Modality
            out.imageType    = (ds.string('x00080008') || '').toUpperCase(); // ImageType

            // #4: captura (uma vez) os dados do paciente/aquisição p/ overlay do EndoTri
            try {
                if (!window.dicomInfo) window.dicomInfo = {};
                var di = window.dicomInfo;
                if (!di.patientName) {
                    var pn = ds.string('x00100010');            // PatientName
                    if (pn) di.patientName = String(pn).replace(/\^/g, ' ').trim();
                }
                if (!di.studyDate) {
                    var sd = ds.string('x00080020');            // StudyDate AAAAMMDD
                    if (sd && sd.length === 8) di.studyDate = sd.slice(6,8)+'/'+sd.slice(4,6)+'/'+sd.slice(0,4);
                    else if (sd) di.studyDate = sd;
                }
                if (!di.patientSex) {
                    var px = ds.string('x00100040');            // PatientSex
                    if (px) di.patientSex = String(px).trim();
                }
                if (!di.patientBirthDate) {
                    var bd = ds.string('x00100030');            // PatientBirthDate AAAAMMDD
                    if (bd && bd.length === 8) di.patientBirthDate = bd;
                }
                if (!di.studyDescription) {
                    var sdesc = ds.string('x00081030');         // StudyDescription
                    if (sdesc) di.studyDescription = String(sdesc).trim();
                }
                if (!di.kvp) {
                    var kv = ds.floatString('x00180060');       // KVP
                    if (kv !== undefined && kv !== null && !isNaN(kv)) di.kvp = kv;
                }
                if (!di.mA) {
                    var ma = ds.floatString('x00181151');       // XRayTubeCurrent (mA)
                    if (ma === undefined || ma === null || isNaN(ma)) {
                        var mauA = ds.floatString('x00181153'); // ExposureInuAs (fallback)
                        if (mauA !== undefined && mauA !== null && !isNaN(mauA)) di.mA = (mauA/1000);
                    } else { di.mA = ma; }
                }
            } catch(e) {}
        } catch (e) { /* mantém o que conseguiu */ }
    }

    // Fallbacks a partir dos campos diretos que o app já usava
    if (!out.ipp && img && img.imagePositionPatient && img.imagePositionPatient.length > 2) {
        out.ipp = [img.imagePositionPatient[0], img.imagePositionPatient[1], img.imagePositionPatient[2]];
    }
    if (out.instanceNumber === null && img && img.instanceNumber) {
        out.instanceNumber = img.instanceNumber;
    }
    if (out.pixelSpacing === null && img) {
        out.pixelSpacing = img.columnPixelSpacing || img.rowPixelSpacing || null;
    }
    return out;
}

// ---- Detecta localizer / scout ----
function _isLocalizer(meta) {
    if (!meta) return false;
    const t = meta.imageType || '';
    return t.indexOf('LOCALIZER') !== -1 || t.indexOf('SCOUT') !== -1;
}

// ---- Chave de agrupamento quando não há SeriesInstanceUID confiável ----
function _geometryGroupKey(meta) {
    const iopSig = meta.iop ? meta.iop.map(v => v.toFixed(3)).join(',') : 'noiop';
    const ps = (meta.pixelSpacing != null) ? meta.pixelSpacing.toFixed(4) : 'nops';
    return [meta.rows || '?', meta.cols || '?', ps, iopSig].join('|');
}

// ---- ORDENAÇÃO 1: orientação DICOM real (IOP + projeção de IPP no vetor normal) ----
// Retorna { ok, images, spacing } ; ok=false se geometria ausente/inválida.
function sortByDicomOrientation(pairs) {
    // pairs: [{ img, meta }]
    if (!pairs.every(p => p.meta.iop && p.meta.ipp)) return { ok: false };

    // Cosines de referência (primeira fatia válida)
    const ref = pairs[0].meta.iop;
    const rowC = [ref[0], ref[1], ref[2]];
    const colC = [ref[3], ref[4], ref[5]];
    // Vetor normal do plano. Forçamos a apontar para SUPERIOR (+Z do paciente)
    // para que o sentido da ordenação seja anatômico e independa de como o
    // fabricante gravou o IOP (corrige Morita/Carestream sem regra de fabricante).
    let normal = _vecCross(rowC, colC);
    if (_vecLen(normal) < 1e-6) return { ok: false }; // IOP degenerado
    if (_vecDot(normal, [0, 0, 1]) < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
    }

    const withDist = pairs.map(p => ({
        p: p,
        dist: _vecDot(p.meta.ipp, normal)
    }));

    // CANÔNICO: ordem CRESCENTE pela projeção (normal apontando p/ superior)
    // => fatia 0 = mais INFERIOR. É a orientação que o pipeline de exibição
    // (vflip do coronal/sagital e o 3D) já espera. NÃO inverter aqui.
    withDist.sort((a, b) => (a.dist - b.dist));

    // Trava de segurança anatômica: garante fatia 0 = mais inferior (menor Z do
    // paciente) mesmo em casos-limite, usando o IPP[2] real dos extremos.
    if (withDist.length > 1) {
        const z0 = withDist[0].p.meta.ipp[2];
        const zN = withDist[withDist.length - 1].p.meta.ipp[2];
        if (z0 > zN) withDist.reverse();
    }

    // Espaçamento real = mediana das diferenças consecutivas das projeções
    const diffs = [];
    for (let i = 1; i < withDist.length; i++) {
        diffs.push(Math.abs(withDist[i].dist - withDist[i - 1].dist));
    }
    let spacing = null;
    if (diffs.length) {
        const sorted = diffs.slice().sort((a, b) => a - b);
        spacing = sorted[Math.floor(sorted.length / 2)];
        // Aviso discreto se houver saltos estranhos (>50% de variação vs mediana)
        const weird = diffs.some(d => spacing > 0 && Math.abs(d - spacing) > spacing * 0.5);
        if (weird) console.warn('[DICOMSeriesNormalizer] Espaçamento entre fatias inconsistente — possível série mista ou gaps.');
    }

    return { ok: true, images: withDist.map(w => w.p.img), spacing: spacing };
}

// ---- ORDENAÇÃO 2: InstanceNumber ----
function sortByInstanceNumber(pairs) {
    if (!pairs.every(p => p.meta.instanceNumber !== null && p.meta.instanceNumber !== undefined)) return { ok: false };
    const arr = pairs.slice().sort((a, b) => a.meta.instanceNumber - b.meta.instanceNumber);
    return { ok: true, images: arr.map(p => p.img) };
}

// ---- ORDENAÇÃO 3 (FALLBACK FINAL): regras legadas por nome (Morita/SLZ/numérico) ----
// Reutiliza dicomLegacyFilenameComparator (mesma regra do carregamento).
function sortByLegacyFilenameRules(pairs) {
    const named = pairs.map(p => ({
        p: p,
        name: imageIdToFilename[p.img && p.img.imageId] || (p.img && p.img.imageId) || ''
    }));
    named.sort((a, b) => dicomLegacyFilenameComparator(a.name, b.name));
    return { ok: true, images: named.map(n => n.p.img) };
}

// ---- Agrupa por série e escolhe a série principal de CBCT ----
function _selectMainSeries(pairs) {
    // 1) Agrupar por SeriesInstanceUID; se faltar, por geometria
    const groups = {};
    pairs.forEach(p => {
        let key = p.meta.seriesUID;
        if (!key) key = 'geo:' + _geometryGroupKey(p.meta);
        (groups[key] = groups[key] || []).push(p);
    });

    const keys = Object.keys(groups);
    if (keys.length <= 1) {
        return { group: groups[keys[0]] || pairs, multi: false };
    }

    // 2) Pontuar grupos: preferir maior nº de imagens, geometria consistente,
    //    sem localizer; localizers/scouts e grupos minúsculos são penalizados.
    let best = null, bestScore = -Infinity;
    keys.forEach(k => {
        const g = groups[k];
        const localizerCount = g.filter(p => _isLocalizer(p.meta)).length;
        const sameRows = g.every(p => p.meta.rows === g[0].meta.rows && p.meta.cols === g[0].meta.cols);
        let score = g.length;                       // mais fatias = mais provável CBCT principal
        if (localizerCount > 0) score -= 1000;      // localizer/scout desqualifica
        if (g.length < 3) score -= 500;             // grupos minúsculos = scout
        if (sameRows) score += 50;                  // matriz consistente
        if (score > bestScore) { bestScore = score; best = g; }
    });
    console.warn('[DICOMSeriesNormalizer] ' + keys.length + ' séries detectadas. Selecionada a série principal (' + (best ? best.length : 0) + ' fatias).');
    return { group: best || groups[keys[0]], multi: true };
}

// ---- Coordenador principal ----
var DICOMSeriesNormalizer = {
    normalize: function (images) {
        // Lê metadados (sem reparse de arquivo: usa dataSet já carregado)
        let pairs = images.map(img => ({ img: img, meta: _readSliceMeta(img) }));

        // Escolhe série principal (não mistura fatias incompatíveis)
        const sel = _selectMainSeries(pairs);
        pairs = sel.group;

        // Hierarquia de ordenação
        let result = sortByDicomOrientation(pairs);
        let source = 'dicom-orientation';
        let hasGeometry = true;
        let spacing = result.ok ? result.spacing : null;

        if (!result.ok) {
            result = sortByInstanceNumber(pairs);
            source = 'instance-number';
            hasGeometry = false;
            if (!result.ok) {
                result = sortByLegacyFilenameRules(pairs);
                source = 'legacy-filename';
            }
        }

        const ref = pairs[0] ? pairs[0].meta : {};
        examOrientationState.source       = source;
        examOrientationState.seriesUID    = ref.seriesUID || null;
        examOrientationState.studyUID     = ref.studyUID || null;
        examOrientationState.manufacturer = ref.manufacturer || null;
        examOrientationState.sliceSpacing = spacing;
        examOrientationState._key = _buildOrientationKey(ref, pairs.length);

        // Carrega flips salvos para ESTE exame (aplicados após volume pronto)
        _loadSavedOrientationFlags();

        console.log('[DICOMSeriesNormalizer] Ordenação por: ' + source +
            ' | fatias: ' + result.images.length +
            (spacing ? ' | espaçamento ~' + spacing.toFixed(3) + 'mm' : ''));

        return { images: result.images, hasGeometry: hasGeometry, sliceSpacing: spacing };
    }
};

// ==========================================================
// 💾 PERSISTÊNCIA DE ORIENTAÇÃO POR EXAME (localStorage) — ETAPA 1
// ==========================================================
function _buildOrientationKey(refMeta, sliceCount) {
    if (refMeta && refMeta.studyUID && refMeta.seriesUID) {
        return 'endoSliceOrientation:' + refMeta.studyUID + ':' + refMeta.seriesUID;
    }
    // Fallback cuidadoso: metadados suficientes p/ não aplicar em exame diferente
    const parts = [
        'fb',
        (refMeta && refMeta.rows) || '?',
        (refMeta && refMeta.cols) || '?',
        sliceCount || '?',
        (refMeta && refMeta.manufacturer) || '?'
    ];
    return 'endoSliceOrientation:' + parts.join('|');
}

function _loadSavedOrientationFlags() {
    try {
        if (!examOrientationState._key) return;
        const raw = localStorage.getItem(examOrientationState._key);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
            examOrientationState.flipX = !!saved.flipX;
            examOrientationState.flipY = !!saved.flipY;
            examOrientationState.flipZ = !!saved.flipZ;
            console.log('[Orientação] Preferência salva carregada para este exame.');
        }
    } catch (e) { /* localStorage indisponível: ignora */ }
}

function saveExamOrientation() {
    try {
        if (!examOrientationState._key) return;
        localStorage.setItem(examOrientationState._key, JSON.stringify({
            flipX: examOrientationState.flipX,
            flipY: examOrientationState.flipY,
            flipZ: examOrientationState.flipZ
        }));
    } catch (e) { /* ignora */ }
}

// ==========================================================
// 🔄 INVERSÃO MANUAL DO VOLUME (ETAPA 1)
// ----------------------------------------------------------
// Operam diretamente sobre volumeData (lido pelo loader "mpr:") e
// re-renderizam via synchronizeMobileViews()/updateObliqueViewports().
// ==========================================================
function _flipVolumeAxis(axis) {
    if (!volumeData || !volumeMeta || !volumeMeta.x) return;
    const X = volumeMeta.x, Y = volumeMeta.y, Z = volumeMeta.z;
    const WH = X * Y;

    if (axis === 'z') {
        const slice = new Int16Array(WH);
        for (let z = 0; z < Math.floor(Z / 2); z++) {
            const a = z * WH, b = (Z - 1 - z) * WH;
            slice.set(volumeData.subarray(a, a + WH));
            volumeData.copyWithin(a, b, b + WH);
            volumeData.set(slice, b);
        }
    } else if (axis === 'y') {
        const row = new Int16Array(X);
        for (let z = 0; z < Z; z++) {
            const zo = z * WH;
            for (let y = 0; y < Math.floor(Y / 2); y++) {
                const a = zo + y * X, b = zo + (Y - 1 - y) * X;
                row.set(volumeData.subarray(a, a + X));
                volumeData.copyWithin(a, b, b + X);
                volumeData.set(row, b);
            }
        }
    } else if (axis === 'x') {
        for (let z = 0; z < Z; z++) {
            const zo = z * WH;
            for (let y = 0; y < Y; y++) {
                const ro = zo + y * X;
                for (let x = 0; x < Math.floor(X / 2); x++) {
                    const tmp = volumeData[ro + x];
                    volumeData[ro + x] = volumeData[ro + X - 1 - x];
                    volumeData[ro + X - 1 - x] = tmp;
                }
            }
        }
    }
}

// Aplica a orientação DESEJADA (examOrientationState.flipX/Y/Z) ao volume,
// invertendo apenas os eixos cujo estado atual difere do desejado.
function applyExamOrientationState() {
    if (!volumeData) return;
    const want = examOrientationState;
    const have = examOrientationState._applied;

    if (!!want.flipX !== !!have.x) { _flipVolumeAxis('x'); have.x = !!want.flipX; }
    if (!!want.flipY !== !!have.y) { _flipVolumeAxis('y'); have.y = !!want.flipY; }
    if (!!want.flipZ !== !!have.z) { _flipVolumeAxis('z'); have.z = !!want.flipZ; }

    // Re-renderiza o MPR (ortogonal ou oblíquo) sem quebrar nada
    try {
        if (typeof obliqueState !== 'undefined' && obliqueState.isActive && typeof updateObliqueViewports === 'function') {
            updateObliqueViewports();
        } else if (typeof synchronizeMobileViews === 'function') {
            synchronizeMobileViews();
        }
    } catch (e) { console.warn('[Orientação] Falha ao re-renderizar MPR:', e); }
}

// Direita/Esquerda  -> eixo X (colunas)
function flipVolumeLeftRight() {
    examOrientationState.flipX = !examOrientationState.flipX;
    applyExamOrientationState();
    saveExamOrientation();
}
// Anterior/Posterior -> eixo Y (linhas)
function flipVolumeAnteriorPosterior() {
    examOrientationState.flipY = !examOrientationState.flipY;
    applyExamOrientationState();
    saveExamOrientation();
}
// Superior/Inferior -> eixo Z (fatias)
function flipVolumeSuperiorInferior() {
    examOrientationState.flipZ = !examOrientationState.flipZ;
    applyExamOrientationState();
    saveExamOrientation();
}
// Reseta orientação (remove flips e a preferência salva deste exame)
function resetExamOrientation() {
    examOrientationState.flipX = false;
    examOrientationState.flipY = false;
    examOrientationState.flipZ = false;
    applyExamOrientationState();
    try { if (examOrientationState._key) localStorage.removeItem(examOrientationState._key); } catch (e) {}
}

// ==========================================================
// 🧱 BIG VOLUME DIRECT BUILDER
// ----------------------------------------------------------
// Para exames gigantes, evita criar downsampledImages[].
// Monta o volume seguro diretamente em volumeData.
// Isso reduz pico de RAM no Safari.
// ==========================================================
async function buildDownsampledVolumeDataDirect(originalImages, originalMeta, ref) {
    console.warn('[BigVolume] Montando MPR seguro direto, sem downsampledImages[].');

    const newMeta = { ...originalMeta };
    newMeta.x = Math.max(1, Math.floor(originalMeta.x / 2));
    newMeta.y = Math.max(1, Math.floor(originalMeta.y / 2));
    newMeta.z = Math.max(1, Math.floor(originalMeta.z / 2));
    newMeta.pixelSpacing    = originalMeta.pixelSpacing * 2;
    newMeta.sliceThickness  = originalMeta.sliceThickness * 2;

    volumeMeta.x              = newMeta.x;
    volumeMeta.y              = newMeta.y;
    volumeMeta.z              = newMeta.z;
    volumeMeta.pixelSpacing   = newMeta.pixelSpacing;
    volumeMeta.sliceThickness = newMeta.sliceThickness;

    crosshairState.x = Math.floor(volumeMeta.x / 2);
    crosshairState.y = Math.floor(volumeMeta.y / 2);
    crosshairState.z = Math.floor(volumeMeta.z / 2);

    const totalSize = volumeMeta.x * volumeMeta.y * volumeMeta.z;

    updateAppLoading(
        82,
        `Modo seguro: alocando MPR (${(totalSize * 2 / 1024 / 1024).toFixed(0)} MB)...`
    );

    await new Promise(r => setTimeout(r, 30));

    volumeData = new Int16Array(totalSize);

    const origW = originalMeta.x;
    const origH = originalMeta.y;
    const newW  = volumeMeta.x;
    const newH  = volumeMeta.y;

    let gMin = Infinity;
    let gMax = -Infinity;

    for (let z = 0; z < volumeMeta.z; z++) {
        if (z % 4 === 0) {
            const pct = 84 + Math.round((z / volumeMeta.z) * 14);
            updateAppLoading(
                pct,
                `Construindo MPR seguro... ${z + 1} / ${volumeMeta.z}`
            );
            await new Promise(r => setTimeout(r, 0));
        }

        const srcIndex = Math.min(z * 2, originalImages.length - 1);
        const img = originalImages[srcIndex];
        const origPixels = img.getPixelData();

        const slope =
            img.slope !== undefined ? img.slope :
            ref && ref.slope !== undefined ? ref.slope : 1;

        const intercept =
            img.intercept !== undefined ? img.intercept :
            ref && ref.intercept !== undefined ? ref.intercept : 0;

        const dstZOffset = z * newW * newH;

        for (let ny = 0; ny < newH; ny++) {
            const oy0 = Math.min(ny * 2, origH - 1);
            const oy1 = Math.min(oy0 + 1, origH - 1);

            for (let nx = 0; nx < newW; nx++) {
                const ox0 = Math.min(nx * 2, origW - 1);
                const ox1 = Math.min(ox0 + 1, origW - 1);

                const v00 = origPixels[oy0 * origW + ox0];
                const v10 = origPixels[oy0 * origW + ox1];
                const v01 = origPixels[oy1 * origW + ox0];
                const v11 = origPixels[oy1 * origW + ox1];

                let val = Math.round((v00 + v10 + v01 + v11) * 0.25);
                val = (val * slope) + intercept;

                if (val > 32767)  val = 32767;
                if (val < -32768) val = -32768;

                const dstIndex = dstZOffset + ny * newW + nx;
                volumeData[dstIndex] = val;

                if (val < gMin) gMin = val;
                if (val > gMax) gMax = val;
            }
        }
    }

    volumeMeta.min = gMin;
    volumeMeta.max = gMax;
    safeState.minPixel = gMin;
    safeState.maxPixel = gMax;

    // Aplica orientação salva, sem contaminar o MPR original fora deste volume seguro.
    if (examOrientationState.flipX) { _flipVolumeAxis('x'); examOrientationState._applied.x = true; }
    if (examOrientationState.flipY) { _flipVolumeAxis('y'); examOrientationState._applied.y = true; }
    if (examOrientationState.flipZ) { _flipVolumeAxis('z'); examOrientationState._applied.z = true; }

    console.warn(
        `[BigVolume] MPR seguro pronto: ${volumeMeta.x}×${volumeMeta.y}×${volumeMeta.z}`
    );

    return true;
}

// ==========================================================
// 🧱 BIG VOLUME DIRECT BUILDER
// ----------------------------------------------------------
// Para exames gigantes, evita criar downsampledImages[].
// Monta volumeData reduzido diretamente, diminuindo pico de RAM.
// Mantém o AXIAL original navegável pelo stack.
// ==========================================================
async function buildDownsampledVolumeDataDirect(originalImages, originalMeta, ref) {
    console.warn('[BigVolume] Montando MPR seguro direto, sem downsampledImages[].');

    const newMeta = { ...originalMeta };

    newMeta.x = Math.max(1, Math.floor(originalMeta.x / 2));
    newMeta.y = Math.max(1, Math.floor(originalMeta.y / 2));
    newMeta.z = Math.max(1, Math.floor(originalMeta.z / 2));

    newMeta.pixelSpacing =
        (originalMeta.pixelSpacing || 0.125) * 2;

    newMeta.sliceThickness =
        (originalMeta.sliceThickness || originalMeta.pixelSpacing || 0.125) * 2;

    volumeMeta.x              = newMeta.x;
    volumeMeta.y              = newMeta.y;
    volumeMeta.z              = newMeta.z;
    volumeMeta.pixelSpacing   = newMeta.pixelSpacing;
    volumeMeta.sliceThickness = newMeta.sliceThickness;

    crosshairState.x = Math.floor(volumeMeta.x / 2);
    crosshairState.y = Math.floor(volumeMeta.y / 2);
    crosshairState.z = Math.floor(volumeMeta.z / 2);

    const totalSize = volumeMeta.x * volumeMeta.y * volumeMeta.z;

    updateAppLoading(
        82,
        `Modo seguro: alocando MPR (${(totalSize * 2 / 1024 / 1024).toFixed(0)} MB)...`
    );

    await new Promise(r => setTimeout(r, 30));

    volumeData = new Int16Array(totalSize);

    const origW = originalMeta.x;
    const origH = originalMeta.y;

    const newW = volumeMeta.x;
    const newH = volumeMeta.y;

    let gMin = Infinity;
    let gMax = -Infinity;

    for (let z = 0; z < volumeMeta.z; z++) {
        if (z % 4 === 0) {
            const pct = 84 + Math.round((z / volumeMeta.z) * 14);
            updateAppLoading(
                pct,
                `Construindo MPR seguro... ${z + 1} / ${volumeMeta.z}`
            );
            await new Promise(r => setTimeout(r, 0));
        }

        const srcZ = Math.min(z * 2, originalImages.length - 1);
        const img = originalImages[srcZ];
        const origPixels = img.getPixelData();

        const slope =
            img.slope !== undefined ? img.slope :
            ref && ref.slope !== undefined ? ref.slope : 1;

        const intercept =
            img.intercept !== undefined ? img.intercept :
            ref && ref.intercept !== undefined ? ref.intercept : 0;

        const dstZOffset = z * newW * newH;

        for (let ny = 0; ny < newH; ny++) {
            const oy0 = Math.min(ny * 2, origH - 1);
            const oy1 = Math.min(oy0 + 1, origH - 1);

            for (let nx = 0; nx < newW; nx++) {
                const ox0 = Math.min(nx * 2, origW - 1);
                const ox1 = Math.min(ox0 + 1, origW - 1);

                const v00 = origPixels[oy0 * origW + ox0];
                const v10 = origPixels[oy0 * origW + ox1];
                const v01 = origPixels[oy1 * origW + ox0];
                const v11 = origPixels[oy1 * origW + ox1];

                let val = Math.round((v00 + v10 + v01 + v11) * 0.25);
                val = (val * slope) + intercept;

                if (val > 32767)  val = 32767;
                if (val < -32768) val = -32768;

                const dstIndex = dstZOffset + ny * newW + nx;
                volumeData[dstIndex] = val;

                if (val < gMin) gMin = val;
                if (val > gMax) gMax = val;
            }
        }
    }

    volumeMeta.min = gMin;
    volumeMeta.max = gMax;

    safeState.minPixel = gMin;
    safeState.maxPixel = gMax;

    // Aplica preferência de orientação salva ao volume seguro recém-montado.
    if (examOrientationState.flipX) {
        _flipVolumeAxis('x');
        examOrientationState._applied.x = true;
    }

    if (examOrientationState.flipY) {
        _flipVolumeAxis('y');
        examOrientationState._applied.y = true;
    }

    if (examOrientationState.flipZ) {
        _flipVolumeAxis('z');
        examOrientationState._applied.z = true;
    }

    console.warn(
        `[BigVolume] MPR seguro pronto: ${volumeMeta.x}×${volumeMeta.y}×${volumeMeta.z}`
    );

    return true;
}


async function buildVolumeMobile() {
    if (!mainStackIds || mainStackIds.length < 2) throw new Error("Necessário pelo menos 2 imagens.");

    // ETAPA 1: zera flips de orientação (evita vazar preferência de outro exame).
    // O normalizador recarrega a preferência SALVA deste exame, se existir.
    examOrientationState.flipX = false;
    examOrientationState.flipY = false;
    examOrientationState.flipZ = false;
    examOrientationState._applied = { x: false, y: false, z: false };
    
   const total = mainStackIds.length;
const isLarge = total > 150;
const isBigVolMode = (typeof isEndoBigVolumeMode === 'function' && isEndoBigVolumeMode());
    
    updateAppLoading(65, "Analisando exame...");
    await new Promise(r => setTimeout(r, 20));

// PATCH 2026-06-29 — Safari/iPhone: carrega fatias em lotes reais.
// Big Volume Mode força concorrência 1 para reduzir pico de RAM.
const baseConcurrent = isLarge
    ? (window.DICOM_PERF && window.DICOM_PERF.buildConcurrent ? window.DICOM_PERF.buildConcurrent : 1)
    : Math.max(2, (window.DICOM_PERF && window.DICOM_PERF.buildConcurrent ? window.DICOM_PERF.buildConcurrent : 2));

const CONCURRENT = isBigVolMode ? 1 : baseConcurrent;

let images = [];

for (let i = 0; i < total; i += CONCURRENT) {
    const batchIds = mainStackIds.slice(i, Math.min(i + CONCURRENT, total));
    const loadedCount = i + batchIds.length;
    const pct = 65 + Math.round((loadedCount / total) * 10);

    updateAppLoading(
        pct,
        isBigVolMode
            ? `Modo seguro: lendo fatias... ${loadedCount} / ${total}`
            : `Carregando fatias... ${loadedCount} / ${total}`
    );

    if (typeof yieldToBrowser === 'function') {
        await yieldToBrowser(isBigVolMode ? 8 : 0);
    } else {
        await new Promise(r => setTimeout(r, isBigVolMode ? 8 : 0));
    }

    const batch = (typeof safeLoadImages === 'function')
        ? await safeLoadImages(batchIds)
        : await Promise.all(batchIds.map(id => cornerstone.loadAndCacheImage(id)));

    images.push(...batch);

    if (isBigVolMode && i > 0 && i % 20 === 0) {
        try { cornerstone.imageCache.purgeCache(); } catch(e) {}
    }

    if (isLarge && typeof yieldToBrowser === 'function') {
        await yieldToBrowser(isBigVolMode ? 8 : 0);
    }
}

    updateAppLoading(76, "Ordenando cortes...");
    await new Promise(r => setTimeout(r, 20));

    // === ETAPA 1: NORMALIZAÇÃO ROBUSTA DA SÉRIE ===
    // Antes: ordenava apenas por imagePositionPatient[2] decrescente (causava
    // exames invertidos/fora de sequência quando a orientação não era axial padrão).
    // Agora: agrupa por série, escolhe a série principal e ordena pela hierarquia
    //   orientação real (IOP+IPP)  ->  InstanceNumber  ->  nome (Morita/SLZ/numérico).
    const _norm = DICOMSeriesNormalizer.normalize(images);
    images = _norm.images;
    const hasZPosition = _norm.hasGeometry;          // mantém o nome usado adiante
    const _normSpacing = _norm.sliceSpacing;         // espaçamento real (mediana das projeções)

    updateAppLoading(78, "Construindo matriz 3D...");
    await new Promise(r => setTimeout(r, 20));
    
    const ref = images[0];
    let tempMeta = {
        x: ref.columns,
        y: ref.rows,
        z: images.length,
        pixelSpacing:   ref.columnPixelSpacing || ref.rowPixelSpacing || 0.125,
        sliceThickness: ref.sliceThickness || (ref.columnPixelSpacing || ref.rowPixelSpacing || 0.125)
    };

    if (hasZPosition && images.length > 1) {
        // Preferir o espaçamento real (mediana das projeções no vetor normal);
        // fallback para o diff bruto de IPP[2] caso indisponível.
        let dz = (_normSpacing && _normSpacing > 0.01) ? _normSpacing : null;
        if (dz === null && images[0].imagePositionPatient && images[1].imagePositionPatient) {
            dz = Math.abs(images[0].imagePositionPatient[2] - images[1].imagePositionPatient[2]);
        }
        if (dz && dz > 0.01) tempMeta.sliceThickness = dz;
    }

const estimatedMB = (tempMeta.x * tempMeta.y * tempMeta.z * 2) / (1024 * 1024);

if (window.EndoSliceBigVolume) {
    window.EndoSliceBigVolume.estimatedVolumeMB = estimatedMB;
}

let processedImages = images;

// ==========================================================
// MODO DIAGNÓSTICO MOBILE / BIG VOLUME
// ----------------------------------------------------------
// Regra:
// 1. Exames normais preservam resolução total até limite seguro.
// 2. Exames grandes usam downsample convencional.
// 3. Exames gigantes em Big Volume Mode usam builder direto,
//    evitando criar downsampledImages[] e reduzindo pico de RAM.
// ==========================================================

const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = /Android/i.test(navigator.userAgent);

const FULL_RES_LIMIT_MB =
    typeof getEndoFullResLimitMB === 'function'
        ? getEndoFullResLimitMB()
        : (isIOS ? 240 : isAndroid ? 280 : 320);

const DIRECT_BIG_VOLUME_LIMIT_MB =
    window.EndoSliceBigVolume &&
    window.EndoSliceBigVolume.limits &&
    window.EndoSliceBigVolume.limits.directDownsampleMB
        ? window.EndoSliceBigVolume.limits.directDownsampleMB
        : 320;

const mustUseSafeDownsample = estimatedMB > FULL_RES_LIMIT_MB;

const mustUseDirectBigVolumeBuilder =
    isBigVolMode && estimatedMB > DIRECT_BIG_VOLUME_LIMIT_MB;

if (mustUseDirectBigVolumeBuilder) {
    console.warn(
        `[EndoSlice] Big Volume Mode: volume estimado ${estimatedMB.toFixed(0)} MB. ` +
        `Usando builder direto para evitar pico de RAM.`
    );

    updateAppLoading(
        80,
        `Exame gigante (${estimatedMB.toFixed(0)}MB): montando MPR seguro...`
    );

    await buildDownsampledVolumeDataDirect(images, tempMeta, ref);

    images.length = 0;
    processedImages = null;

    try { cornerstone.imageCache.purgeCache(); } catch(e) {}

    updateAppLoading(100, "MPR seguro pronto!");
    await new Promise(r => setTimeout(r, 300));

    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.style.setProperty('display', 'none', 'important');
        loadingDiv.classList.remove('active');
    }

    if (typeof showEndoBigVolumeNotice === 'function') {
        showEndoBigVolumeNotice(
            'MPR carregado em modo seguro para evitar tela branca. O AXIAL original permanece navegável.'
        );
    }

    return true;
}

if (mustUseSafeDownsample) {
    console.warn(
        `[EndoSlice] Volume muito grande para MPR full-res mobile: ${estimatedMB.toFixed(0)} MB. ` +
        `Entrando em modo seguro com downsample.`
    );

    updateAppLoading(
        80,
        `Modo seguro mobile (${estimatedMB.toFixed(0)}MB)...`
    );

    await new Promise(r => setTimeout(r, 20));

    const { downsampledImages, downsampledMeta } = createDownsampledVolume(images, tempMeta);

    processedImages = downsampledImages;

    volumeMeta.x              = downsampledMeta.x;
    volumeMeta.y              = downsampledMeta.y;
    volumeMeta.z              = downsampledMeta.z;
    volumeMeta.pixelSpacing   = downsampledMeta.pixelSpacing;
    volumeMeta.sliceThickness = downsampledMeta.sliceThickness;

    images.length = 0; // libera referência ao volume original decodificado
} else {
    console.log(
        `[EndoSlice] MPR full-res preservado: ${tempMeta.x}×${tempMeta.y}×${tempMeta.z} ` +
        `(${estimatedMB.toFixed(0)} MB)`
    );

    updateAppLoading(
        80,
        `Preservando resolução total (${estimatedMB.toFixed(0)}MB)...`
    );

    volumeMeta.x              = tempMeta.x;
    volumeMeta.y              = tempMeta.y;
    volumeMeta.z              = tempMeta.z;
    volumeMeta.pixelSpacing   = tempMeta.pixelSpacing;
    volumeMeta.sliceThickness = tempMeta.sliceThickness;
}

    crosshairState.x = Math.floor(volumeMeta.x / 2);
    crosshairState.y = Math.floor(volumeMeta.y / 2);
    crosshairState.z = Math.floor(volumeMeta.z / 2);

    const totalSize = volumeMeta.x * volumeMeta.y * volumeMeta.z;
    
    updateAppLoading(85, `Alocando memória (${(totalSize * 2 / 1024 / 1024).toFixed(0)} MB)...`);
    await new Promise(r => setTimeout(r, 20));
    
    volumeData = new Int16Array(totalSize);
    const slope     = ref.slope     !== undefined ? ref.slope     : 1;
    const intercept = ref.intercept !== undefined ? ref.intercept : 0;
    
    let gMin = Infinity, gMax = -Infinity;

    const FILL_BATCH = isLarge ? 20 : 50;
    for (let z = 0; z < volumeMeta.z; z++) {
        if (z % FILL_BATCH === 0) {
            const pct = 85 + Math.round((z / volumeMeta.z) * 15);
            updateAppLoading(pct, `Renderizando Volume 3D... ${Math.round(z / volumeMeta.z * 100)}%`);
            await new Promise(r => setTimeout(r, 5)); // DEIXA A TELA ATUALIZAR
        }
        const pixelData = processedImages[z].getPixelData();
        const offset = z * volumeMeta.x * volumeMeta.y;
        for (let i = 0; i < pixelData.length; i++) {
            let val = (pixelData[i] * slope) + intercept;
            if (val > 32767)  val = 32767;
            if (val < -32768) val = -32768;
            volumeData[offset + i] = val;
            if (val < gMin) gMin = val;
            if (val > gMax) gMax = val;
        }
    }
    
    volumeMeta.min = gMin; volumeMeta.max = gMax;
    safeState.minPixel = gMin; safeState.maxPixel = gMax;

    // ETAPA 1: aplica preferência de orientação salva ao volume recém-montado.
    // Sem re-render aqui (o MPR ainda não foi inicializado); initEndoMPR lê volumeData já corrigido.
    if (examOrientationState.flipX) { _flipVolumeAxis('x'); examOrientationState._applied.x = true; }
    if (examOrientationState.flipY) { _flipVolumeAxis('y'); examOrientationState._applied.y = true; }
    if (examOrientationState.flipZ) { _flipVolumeAxis('z'); examOrientationState._applied.z = true; }
    
    try {
        cornerstone.imageCache.purgeCache();
    } catch(e) {}
    
    updateAppLoading(100, "Finalizado!");
    await new Promise(r => setTimeout(r, 300));
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.style.setProperty('display', 'none', 'important');
        loadingDiv.classList.remove('active');
    }

    return true;
}




// BUG 4 FIX: Após volume carregado, normaliza resolução de todos os cortes.
// Em volumes grandes o Cornerstone reduz o canvas para economizar memória.
// Depois que o volume está pronto, forçamos um resize completo.
function _normalizeAllCutResolutions() {
    // Aguarda DOM estável após renderização
    setTimeout(function() {
        // 1. Cortes transversais (pan-cut-item) — mais afetados
        document.querySelectorAll('.pan-cut-item').forEach(function(el) {
            try {
                const enabled = cornerstone.getEnabledElements().some(e => e.element === el);
                if (enabled) {
                    cornerstone.resize(el, true);
                    cornerstone.fitToWindow(el);
                    try { cornerstone.updateImage(el); } catch(e2) {}
                }
            } catch(e) {}
        });
        // 2. Viewers da panorâmica
        ['pan-pano-viewer', 'pan-mini-viewer'].forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                const enabled = cornerstone.getEnabledElements().some(e => e.element === el);
                if (enabled) {
                    cornerstone.resize(el, true);
                    try { cornerstone.updateImage(el); } catch(e2) {}
                }
            } catch(e) {}
        });
        // 3. Viewports endo
        ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                const enabled = cornerstone.getEnabledElements().some(e => e.element === el);
                if (enabled) {
                    cornerstone.resize(el, true);
                    try { cornerstone.updateImage(el); } catch(e2) {}
                }
            } catch(e) {}
        });
        console.log('[DICOMobile] Resolução dos cortes normalizada.');
    }, 900); // 900ms para garantir que o DOM e o Cornerstone estabilizaram
}





// ==========================================================
// 🧩 ImageLoader "mpr:" (CORTES ORTOGONAIS - SEM MUDANÇAS)
// ==========================================================

cornerstone.registerImageLoader('mpr', (imageId) => {
    if (!volumeData) return { promise: Promise.reject("Volume não carregado"), cancelFn: () => {} };
    const parts = imageId.split(':'); 
    const plane = parts[1]; 
    const index = parseInt(parts[2]);
    let width, height;
    
    if (plane === 'axial') { width = volumeMeta.x; height = volumeMeta.y; } 
    else if (plane === 'coronal') { width = volumeMeta.x; height = volumeMeta.z; } 
    else if (plane === 'sagittal') { width = volumeMeta.y; height = volumeMeta.z; }

    const reqThickness = thicknessState[plane] || 'native';
    let stepSize = (plane === 'axial') ? volumeMeta.sliceThickness : volumeMeta.pixelSpacing;
    let numSlices = reqThickness === 'native' ? 1 : Math.max(1, Math.round(parseFloat(reqThickness) / stepSize));
    
    // Performance: Corta o processamento para nativo se o dedo estiver arrastando
    if (isDraggingCrosshair) numSlices = 1;
    
    const half = Math.floor(numSlices / 2);

    const generatePixels = () => {
        const data = new Int16Array(width * height);
        const getVoxel = (x, y, z) => {
            if (x < 0 || x >= volumeMeta.x || y < 0 || y >= volumeMeta.y || z < 0 || z >= volumeMeta.z) return -1000;
            return volumeData[z * volumeMeta.x * volumeMeta.y + y * volumeMeta.x + x];
        };
        
        for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) {
                let sum = 0;
                let count = 0;
                
                // Average Intensity Projection (AIP)
                for (let s = -half; s <= half; s++) {
                    let val = -1000;
                    if (plane === 'axial') val = getVoxel(w, h, index + s);
                    else if (plane === 'coronal') val = getVoxel(w, index + s, h);
                    else if (plane === 'sagittal') val = getVoxel(index + s, w, h);
                    
                    if (val !== -1000) { sum += val; count++; }
                }
                data[h * width + w] = count > 0 ? sum / count : -1000;
            }
        }
        return data;
    };

    return {
        promise: Promise.resolve({
            imageId: imageId, minPixelValue: volumeMeta.min, maxPixelValue: volumeMeta.max, slope: 1.0, intercept: 0,
            windowCenter: safeState.wc, windowWidth: safeState.ww, rows: height, columns: width, height: height, width: width,
            columnPixelSpacing: volumeMeta.pixelSpacing, rowPixelSpacing: (plane === 'axial') ? volumeMeta.pixelSpacing : volumeMeta.sliceThickness,
            invert: false, sizeInBytes: width * height * 2, getPixelData: generatePixels
        }), cancelFn: () => {}
    };
});


// ==========================================================
// 🚀 2. IMAGE LOADER OBLÍQUO (BLINDADO CONTRA ERROS DE SINTAXE)
// ==========================================================
cornerstone.registerImageLoader('mpr-oblique', function(imageId) {
    if (!volumeData) {
        return {
            promise: Promise.reject("Volume não carregado"),
            cancelFn: function() {}
        };
    }

    const cleanImageId = imageId.split('?')[0];
    const parts = cleanImageId.split(':');
    const plane = parts[1];

    const geometry = getObliqueRenderGeometry();
    const width = geometry.width;
    const height = geometry.height;
    const pixelMM = geometry.pixelMM;

    const reqThickness = thicknessState[plane] || 'native';
    const nativeStepMM = getPlaneNativeSpacingMM(plane);

    let numSlices = reqThickness === 'native'
        ? 1
        : Math.max(1, Math.round(parseFloat(reqThickness) / Math.max(nativeStepMM, 1e-6)));

    if (isDraggingCrosshair || obliqueState.mode === 'translate') {
        numSlices = 1;
    }

    const halfS = Math.floor(numSlices / 2);

    const generatePixels = function() {
        const data = new Int16Array(width * height);

        const basis = getObliqueBasis(
            obliqueState.yaw,
            obliqueState.pitch,
            obliqueState.roll
        );

        const frame = getObliquePhysicalFrame(plane, basis);

        const centerPhys = ijkToPhys(obliqueCenter3D);
        const crossPhys = ijkToPhys(crosshairState);
        const crossDeltaPhys = sub3(crossPhys, centerPhys);

        const distGlobalMM = dot3(crossDeltaPhys, frame.nPhys);
        const distMM = distGlobalMM + ((obliqueState.sliceOffsets[plane] || 0) * nativeStepMM);

        const planeAnchorPhys = add3(centerPhys, mul3(frame.nPhys, distMM));

        const volX = volumeMeta.x;
        const volY = volumeMeta.y;
        const volZ = volumeMeta.z;

        const maxX = volX - 1.001;
        const maxY = volY - 1.001;
        const maxZ = volZ - 1.001;

        let idx = 0;

        for (let h = 0; h < height; h++) {
            const dvMM = (h - geometry.halfHeightPx) * pixelMM;

            for (let w = 0; w < width; w++) {
                const duMM = (w - geometry.halfWidthPx) * pixelMM;

                let sum = 0;
                let count = 0;

                for (let s = -halfS; s <= halfS; s++) {
                    const dsMM = s * nativeStepMM;

                    const samplePhys = add3(
                        planeAnchorPhys,
                        add3(
                            mul3(frame.uPhys, duMM),
                            add3(
                                mul3(frame.vPhys, dvMM),
                                mul3(frame.nPhys, dsMM)
                            )
                        )
                    );

                    const sampleIJK = physToIJK(samplePhys);
                    const px = sampleIJK.x;
                    const py = sampleIJK.y;
                    const pz = sampleIJK.z;

                    if (px >= 0 && py >= 0 && pz >= 0 && px < volX && py < volY && pz < volZ) {
                        const c_px = Math.max(0, Math.min(maxX, px));
                        const c_py = Math.max(0, Math.min(maxY, py));
                        const c_pz = Math.max(0, Math.min(maxZ, pz));

                        const x0 = Math.floor(c_px);
                        const x1 = x0 + 1;
                        const y0 = Math.floor(c_py);
                        const y1 = y0 + 1;
                        const z0 = Math.floor(c_pz);
                        const z1 = z0 + 1;

                        const fx = c_px - x0;
                        const ifx = 1.0 - fx;
                        const fy = c_py - y0;
                        const ify = 1.0 - fy;
                        const fz = c_pz - z0;
                        const ifz = 1.0 - fz;

                        const z0_off = z0 * volX * volY;
                        const z1_off = z1 * volX * volY;
                        const y0_off = y0 * volX;
                        const y1_off = y1 * volX;

                        const v000 = volumeData[z0_off + y0_off + x0];
                        const v100 = volumeData[z0_off + y0_off + x1];
                        const v010 = volumeData[z0_off + y1_off + x0];
                        const v110 = volumeData[z0_off + y1_off + x1];

                        const v001 = volumeData[z1_off + y0_off + x0];
                        const v101 = volumeData[z1_off + y0_off + x1];
                        const v011 = volumeData[z1_off + y1_off + x0];
                        const v111 = volumeData[z1_off + y1_off + x1];

                        const c00 = v000 * ifx + v100 * fx;
                        const c01 = v001 * ifx + v101 * fx;
                        const c10 = v010 * ifx + v110 * fx;
                        const c11 = v011 * ifx + v111 * fx;

                        const c0 = c00 * ify + c10 * fy;
                        const c1 = c01 * ify + c11 * fy;

                        sum += (c0 * ifz + c1 * fz);
                        count++;
                    }
                }

                data[idx] = count > 0 ? Math.round(sum / count) : -1000;
                idx++;
            }
        }

        setTimeout(updateFilters, 10);
        return data;
    };

    return {
        promise: Promise.resolve({
            imageId: imageId,
            minPixelValue: volumeMeta.min,
            maxPixelValue: volumeMeta.max,
            slope: 1.0,
            intercept: 0,
            windowCenter: safeState.wc,
            windowWidth: safeState.ww,
            rows: height,
            columns: width,
            height: height,
            width: width,
            columnPixelSpacing: pixelMM,
            rowPixelSpacing: pixelMM,
            invert: false,
            sizeInBytes: width * height * 2,
            getPixelData: generatePixels
        }),
        cancelFn: function() {}
    };
});


// A função que estava faltando!
function updateObliqueViewports(onlyPlane) {
    if (!obliqueState.isActive) return;

    const timestamp = Date.now();
    const planos = onlyPlane ? [onlyPlane] : ['axial', 'coronal', 'sagittal'];

    planos.forEach(function(plane) {
        const element = document.getElementById('endo-' + plane);
        if (!element) return;

        try {
            const isEnabled = cornerstone.getEnabledElements().some(function(e) {
                return e.element === element;
            });
            if (!isEnabled) return;

            const newImageId = 'mpr-oblique:' + plane + '?t=' + timestamp;
            let keepViewport = null;

            try {
                keepViewport = cornerstone.getViewport(element);
            } catch (e) {}

            cornerstone.loadAndCacheImage(newImageId).then(function(image) {
                if (!image) return;

                if (keepViewport) {
                    cornerstone.displayImage(element, image, keepViewport);
                } else {
                    cornerstone.displayImage(element, image);
                }

                if (typeof window.syncLengthMeasurementsForElement === 'function') {
                    requestAnimationFrame(function() {
                        window.syncLengthMeasurementsForElement(element);
                    });
                }

                setTimeout(function() {
                    if (typeof updateFilters === 'function') updateFilters();

                    if (currentActiveTool === 'Magnify') {
                        try {
                            cornerstoneTools.setToolActiveForElement(element, 'Magnify', {
                                mouseButtonMask: 1,
                                isTouchActive: true
                            });
                        } catch (e) {}
                    }

                    if (currentActiveTool !== 'Length') {
                        setLengthReadOnlyForElement(element);
                    }

                    try {
                        cornerstone.updateImage(element);
                    } catch (e) {}
                }, 10);
            }).catch(function(err) {
                console.warn('Erro ao carregar imagem oblíqua:', err);
            });
        } catch (e) {
            console.error('Erro no processamento oblíquo:', e);
        }
    });
}



// ==========================================================
// PATCH CIRÚRGICO: ao arrastar o CENTRO da mira no modo oblíquo,
// absorve qualquer scroll/stack independente e recentraliza os 3 planos.
// NÃO altera yaw/pitch/roll. NÃO mexe no scroll por viewport.
// ==========================================================
function resetObliqueScrollOffsetsForCrosshairDrag() {
    if (!obliqueState || !obliqueState.isActive) return false;

    const oldOffsets = obliqueState.sliceOffsets || {};
    const hadOffset =
        !!oldOffsets.axial ||
        !!oldOffsets.coronal ||
        !!oldOffsets.sagittal;

    // Atualiza baseIndices para o índice atual de cada stack.
    // Isso evita salto no próximo scroll após recentralizar.
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;

        const plane = id.replace('endo-', '');
        let currentIndex = null;

        try {
            const ts = cornerstoneTools.getToolState(el, 'stack');
            if (
                ts &&
                ts.data &&
                ts.data[0] &&
                typeof ts.data[0].currentImageIdIndex === 'number'
            ) {
                currentIndex = ts.data[0].currentImageIdIndex;
            }
        } catch(e) {}

        // Fallback seguro caso o stack state ainda não esteja disponível.
        if (currentIndex == null) {
            if (plane === 'axial') currentIndex = Math.round(crosshairState.z || 0);
            else if (plane === 'coronal') currentIndex = Math.round(crosshairState.y || 0);
            else if (plane === 'sagittal') currentIndex = Math.round(crosshairState.x || 0);
        }

        obliqueState.baseIndices[plane] = currentIndex;
    });

    // Zera os deslocamentos independentes sem tocar na rotação.
    obliqueState.sliceOffsets = { axial: 0, coronal: 0, sagittal: 0 };

    // Reancora o oblíquo no centro 3D atual da mira.
    obliqueCenter3D = {
        x: crosshairState.x,
        y: crosshairState.y,
        z: crosshairState.z
    };

    // Só força reload completo se havia offset acumulado.
    if (hadOffset && typeof updateObliqueViewports === 'function') {
        updateObliqueViewports();
    }

    return hadOffset;
}


// ==========================================================
// 🧠 LÓGICA DA ABA ENDO (MODIFICADA PARA OBLÍQUOS)
// ==========================================================
async function initEndoMPRViewportsMobile() {
    if (!volumeData) await buildVolumeMobile();

    const viewports = [
        { id: 'endo-axial',    plane: 'axial',    max: volumeMeta.z },
        { id: 'endo-coronal',  plane: 'coronal',  max: volumeMeta.y },
        { id: 'endo-sagittal', plane: 'sagittal', max: volumeMeta.x }
    ];

    for (let vp of viewports) {
        const element = document.getElementById(vp.id);
        if (!element) continue;

        try { cornerstone.enable(element); } catch(e){}

        const initialSlice = (vp.plane === 'axial') ? crosshairState.z : (vp.plane === 'coronal') ? crosshairState.y : crosshairState.x;
        const initialImageId = `mpr:${vp.plane}:${initialSlice}?t=${Date.now()}`;
        
        const image = await cornerstone.loadImage(initialImageId);
        cornerstone.displayImage(element, image);

        if (vp.plane === 'coronal' || vp.plane === 'sagittal') {
            const viewport = cornerstone.getViewport(element);
            viewport.vflip = true; 
            cornerstone.setViewport(element, viewport);
        }

        const stack = {
            currentImageIdIndex: initialSlice,
            imageIds: Array.from({ length: vp.max }, (_, i) => `mpr:${vp.plane}:${i}`)
        };
        cornerstoneTools.addStackStateManager(element, ['stack']);
        cornerstoneTools.addToolState(element, 'stack', stack);

        // Registro de Ferramentas
        cornerstoneTools.addToolForElement(element, cornerstoneTools.WwwcTool);
        cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTouchPinchTool);
        cornerstoneTools.addToolForElement(element, cornerstoneTools.PanMultiTouchTool);
        cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool); 
        cornerstoneTools.addToolForElement(element, cornerstoneTools.MagnifyTool, {
            configuration: { magnifySize: 140, magnificationLevel: 2, guiCursor: false, xOffset: 0, yOffset: 0 }
        });
        cornerstoneTools.addToolForElement(element, cornerstoneTools.LengthTool, {
            configuration: { drawHandles: false, drawHandlesOnHover: false, handleRadius: 18, selectable: true, distanceThreshold: 40 }
        });

        cornerstoneTools.setToolActiveForElement(element, 'ZoomTouchPinch', {});
        // PAN 2 DEDOS: mesma dupla comprovada da aba Axial (pinça = zoom, arrasto 2 dedos = pan)
        cornerstoneTools.setToolActiveForElement(element, 'PanMultiTouch', {});
        cornerstoneTools.setToolActiveForElement(element, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
        
        element.addEventListener('cornerstoneimagerendered', onMobileMPRImageRendered);

        // --- ENGENHARIA DE BLOQUEIO DO SLIDER ---
        const slider = element.querySelector('input[type=range]');
        if (slider) {
            slider.min = 0;
            slider.max = vp.max - 1;
            slider.value = initialSlice;

        slider.oninput = function() {
                const val = parseInt(this.value);
                if (obliqueState.isActive) {
                    obliqueState.sliceOffsets[vp.plane] = val - obliqueState.baseIndices[vp.plane];
                    updateObliqueViewports(vp.plane);
                } else {
                    if (vp.plane === 'axial') crosshairState.z = val;
                    else if (vp.plane === 'coronal') crosshairState.y = val;
                    else if (vp.plane === 'sagittal') crosshairState.x = val;
                    synchronizeMobileViews();
                }
            };

            // BLOQUEIO TOTAL: Impede que o toque "vaze" para o Brilho/Contraste do Cornerstone
            const stopInteraction = (e) => {
                isDraggingAnySlider = true;
                e.stopPropagation();
                e.stopImmediatePropagation();
            };

            // Usamos { passive: false } para garantir que o stopPropagation funcione no iOS
            slider.addEventListener('touchstart', stopInteraction, { capture: true, passive: false });
            slider.addEventListener('touchmove', stopInteraction, { capture: true, passive: false });
            
            slider.addEventListener('touchend', (e) => {
    isDraggingAnySlider = false;
    window._sliderReleasedAt = Date.now(); // <-- flag anti-click-fantasma
    e.stopPropagation();
}, { capture: true, passive: false });
}
        cornerstone.resize(element, true);
    }
  isEndoMPRInitialized = true;
    synchronizeMobileViews();
    // BUG ferramenta herdada: força cada viewport endo ao modo SCROLL ao abrir o
    // exame (senão herda Wwwc/contraste do exame anterior). Sincroniza o tool
    // ativo do Cornerstone com a classe do botão.
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el._modeBtn && typeof window.applyEndoTouchMode === 'function') {
            window.applyEndoTouchMode(el, el._modeBtn, isCrosshairActive ? 'mira' : 'scroll');
        }
    });
    
    // ATIVA O GATILHO DA CAIXA DE INFORMAÇÕES DO PACIENTE NA ABA ENDO
    if (typeof window.updateDicomInfoOverlay === 'function') {
        window.updateDicomInfoOverlay();
    }
}


// Guard: retorna true se o slider foi largado há menos de 400ms
function _sliderGuard(event) {
    if ((Date.now() - (window._sliderReleasedAt || 0)) < 400) {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        return true;
    }
    return false;
}

// ==========================================================
// BLINDAGEM DA TOPBAR (Impede que o toque vaze para o slider)
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    // Intercepta todos os toques na TopBar de forma nativa e mata a propagação
    document.querySelectorAll('.vp-topbar').forEach(bar => {
        const killEvent = (e) => { e.stopPropagation(); };
        bar.addEventListener('touchstart', killEvent, { passive: false, capture: true });
        bar.addEventListener('touchmove', killEvent, { passive: false, capture: true });
        bar.addEventListener('touchend', killEvent, { passive: false, capture: true });
        bar.addEventListener('mousedown', killEvent, { capture: true });
        bar.addEventListener('wheel', killEvent, { capture: true });
    });
});

async function ensureEndoMPRIsReadyMobile() {
    console.log("Check Endo: ", mainStackIds.length, " imagens encontradas.");
    
    if (isEndoMPRInitialized) {
        document.querySelectorAll('#tab-endo .viewport-element').forEach(el => {
            try { cornerstone.resize(el, true); } catch (e) {}
        });
        return;
    }

    // Check robusto: tenta ler de mainStackIds primeiro, depois de mobileStack
    const idsParaCarregar = (mainStackIds && mainStackIds.length > 0) ? mainStackIds : mobileStack.imageIds;

    if (!idsParaCarregar || idsParaCarregar.length < 2) {
        alert("Aguarde o processamento ou abra o exame novamente.");
        console.error("Erro: mainStackIds está vazio no momento do switch.");
        return;
    }

    // Garante que a variável global está sincronizada para o buildVolume
    mainStackIds = idsParaCarregar;

    try { 
        await initEndoMPRViewportsMobile(); 
    } catch (error) { 
        console.error(error); 
        alert("Erro ao inicializar: " + error.message); 
    }
}

// SINCRONIZAÇÃO DE CORTES ORTOGONAIS (USADA QUANDO OBLÍQUO ESTÁ OFF)
function synchronizeMobileViews() {
    if (obliqueState.isActive) return; 

    const configs = [
        { id: 'endo-axial',    targetSlice: crosshairState.z, max: volumeMeta.z },
        { id: 'endo-coronal',  targetSlice: crosshairState.y, max: volumeMeta.y },
        { id: 'endo-sagittal', targetSlice: crosshairState.x, max: volumeMeta.x }
    ];

    const timestamp = Date.now(); 

    configs.forEach(conf => {
        const el = document.getElementById(conf.id);
        if (!el) return;
        
        const slider = el.querySelector('input[type=range]');
        const textSpan = el.querySelector('.slice-info span'); // SELECIONA O SPAN DO NÚMERO
        const safeIndex = Math.max(0, Math.min(Math.round(conf.targetSlice), conf.max - 1));
        
        if (slider) slider.value = safeIndex;
        
        // --- ATUALIZA O TEXTO DO NÚMERO ---
        if (textSpan) {
            textSpan.innerText = `${safeIndex + 1} / ${conf.max}`;
        }
        // --- PROGRESSO NO CONTORNO: engrossa a linha superior conforme o corte ---
        if (typeof window.updateEndoSliceProgress === 'function') {
            window.updateEndoSliceProgress(conf.id, safeIndex, conf.max);
        }
        
        const stackData = cornerstoneTools.getToolState(el, 'stack');
        if (stackData && stackData.data && stackData.data[0]) {
            const stack = stackData.data[0];
            const plane = conf.id.replace('endo-', '');
            const newImageId = `mpr:${plane}:${safeIndex}?t=${timestamp}`;
            
            cornerstone.loadAndCacheImage(newImageId).then(image => {
                stack.currentImageIdIndex = safeIndex;
                cornerstone.displayImage(el, image);
                setTimeout(updateFilters, 5); 
            });
        }
    });
}




// Helper matemático do cruzamento dinâmico da mira oblíqua
function getObliqueCrosshairCoords(elementId) {
    const basis = getObliqueBasis(obliqueState.yaw, obliqueState.pitch, obliqueState.roll);

    let plane = elementId.replace('endo-', '');
    if (elementId === 'modal-viewport') {
        const modal = document.getElementById('modal-zoom');
        if (modal) plane = modal.dataset.plane;
    }

    let targetPlaneH, targetPlaneV;
    if (plane === 'axial') {
        targetPlaneH = 'coronal';
        targetPlaneV = 'sagittal';
    } else if (plane === 'coronal') {
        targetPlaneH = 'axial';
        targetPlaneV = 'sagittal';
    } else {
        targetPlaneH = 'axial';
        targetPlaneV = 'coronal';
    }

    const frame = getObliquePhysicalFrame(plane, basis);
    const frameH = getObliquePhysicalFrame(targetPlaneH, basis);
    const frameV = getObliquePhysicalFrame(targetPlaneV, basis);
    const geom = getObliqueRenderGeometry();

    const centerPhys = ijkToPhys(obliqueCenter3D);
    const crossPhys = ijkToPhys(crosshairState);
    const gPhys = sub3(crossPhys, centerPhys);

    const distTargetH =
        dot3(gPhys, frameH.nPhys) +
        ((obliqueState.sliceOffsets[targetPlaneH] || 0) * getPlaneNativeSpacingMM(targetPlaneH));

    const distTargetV =
        dot3(gPhys, frameV.nPhys) +
        ((obliqueState.sliceOffsets[targetPlaneV] || 0) * getPlaneNativeSpacingMM(targetPlaneV));

    const uDotNv = dot3(frame.uPhys, frameV.nPhys);
    const vDotNh = dot3(frame.vPhys, frameH.nPhys);

    if (Math.abs(uDotNv) < 1e-6 || Math.abs(vDotNh) < 1e-6) {
        return {
            xImagePixel: geom.halfWidthPx,
            yImagePixel: geom.halfHeightPx
        };
    }

    return {
        xImagePixel: geom.halfWidthPx + (distTargetV / uDotNv) / geom.pixelMM,
        yImagePixel: geom.halfHeightPx + (distTargetH / vDotNh) / geom.pixelMM
    };
}








// ==========================================================
// 🎯 LÓGICA DA MIRA (CROSSHAIR) E SINCRONIZAÇÃO (SEM MUDANÇAS)
// ==========================================================
function onMobileMPRImageRendered(e) {
    if (!isCrosshairActive || !volumeData) return;
    // BUG 3: olho ativado oculta as linhas da mira (e bolinhas do oblíquo)
    if (crosshairLinesHidden) return;

    const eventData = e.detail;
    const ctx = eventData.canvasContext;
    const element = eventData.element;
    const image = eventData.image;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.92;

    let xImagePixel, yImagePixel;
    let colorV, colorH;

    // Cores das linhas do crosshair:
    // Verde(sagittal) → Laranja #FF8C00 | Azul = coronal | Vermelho = axial
    if (element.id === 'endo-axial') {
        colorV = '#FF8C00'; colorH = '#007AFF';   // V=sagital(laranja), H=coronal(azul)
    } else if (element.id === 'endo-coronal') {
        colorV = '#FF8C00'; colorH = '#ff4757';   // V=sagital(laranja), H=axial(vermelho)
    } else {
        colorV = '#007AFF'; colorH = '#ff4757';   // V=coronal(azul),    H=axial(vermelho)
    }

    if (obliqueState.isActive) {
        // BUG 6: usa a projeção que JÁ inclui os sliceOffsets dos OUTROS planos,
        // para que a linha de cada plano se desloque nos demais cortes ao rolar.
        // (mesma função usada na detecção de arraste da mira → desenho e hit ficam coerentes)
        const _oc = getObliqueCrosshairCoords(element.id);
        xImagePixel = _oc.xImagePixel;
        yImagePixel = _oc.yImagePixel;
    } else {
        if (element.id === 'endo-axial') {
            xImagePixel = crosshairState.x;
            yImagePixel = crosshairState.y;
        } else if (element.id === 'endo-coronal') {
            xImagePixel = crosshairState.x;
            yImagePixel = crosshairState.z;
        } else if (element.id === 'endo-sagittal') {
            xImagePixel = crosshairState.y;
            yImagePixel = crosshairState.z;
        }
    }

    if (xImagePixel === undefined || yImagePixel === undefined) return;

    const coords = cornerstone.pixelToCanvas(element, { x: xImagePixel, y: yImagePixel });
    const xCanvas = coords.x;
    const yCanvas = coords.y;

    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    ctx.lineWidth = 0.8;
    const CH_GAP = 6; // raio do "buraco" central entre as linhas

    // Vertical (interrompida no centro)
    ctx.beginPath();
    ctx.strokeStyle = colorV;
    ctx.moveTo(xCanvas, 0);
    ctx.lineTo(xCanvas, yCanvas - CH_GAP);
    ctx.moveTo(xCanvas, yCanvas + CH_GAP);
    ctx.lineTo(xCanvas, canvasHeight);
    ctx.stroke();

    // Horizontal (interrompida no centro)
    ctx.beginPath();
    ctx.strokeStyle = colorH;
    ctx.moveTo(0, yCanvas);
    ctx.lineTo(xCanvas - CH_GAP, yCanvas);
    ctx.moveTo(xCanvas + CH_GAP, yCanvas);
    ctx.lineTo(canvasWidth, yCanvas);
    ctx.stroke();

    if (obliqueState.isActive) {
        drawObliqueHandles(ctx, element, xCanvas, yCanvas);
    }
}


// ==========================================================
// 🟢 4. RENDERIZAÇÃO DAS BOLINHAS E TOGGLE
// ==========================================================

function drawObliqueHandles(ctx, element, cX, cY) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const offset = Math.min(w, h) * 0.35; 

  const drawHandle = (x, y, color) => {
        // Discreto: só o contorno na cor exata da linha; sem fundo branco e sem ponto central.
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
    };

    let colorV, colorH;
    // Cores IGUAIS às das linhas (corrige o handle verde sobre a linha laranja/amarela)
    if (element.id === 'endo-axial') { colorV = '#FF8C00'; colorH = '#007AFF'; }
    else if (element.id === 'endo-coronal') { colorV = '#FF8C00'; colorH = '#ff4757'; }
    else { colorV = '#007AFF'; colorH = '#ff4757'; }

    drawHandle(cX, cY - offset, colorV); 
    drawHandle(cX, cY + offset, colorV); 
    drawHandle(cX - offset, cY, colorH); 
    drawHandle(cX + offset, cY, colorH); 
}


// Ação do Botão HTML: id="btn-mpr-oblique"
function toggleObliqueMode() {
    obliqueState.isActive = !obliqueState.isActive;
    const btn = document.getElementById('btn-mpr-oblique');
    
    if (obliqueState.isActive) {
        if (btn) btn.classList.add('active-tool');
        
        // Ao ativar, garante que a mira seja ativada junto
        if (!isCrosshairActive) toggleCrosshair();
        
        // Zera os ângulos para começar "reto" a partir do corte atual
        obliqueState.yaw = 0; obliqueState.pitch = 0; obliqueState.roll = 0;
        // Zera os deltas de slice independentes
        obliqueState.sliceOffsets = { axial: 0, coronal: 0, sagittal: 0 };
        
        // Fixa a âncora visual para permitir o arrasto global de mira
        obliqueCenter3D = { x: crosshairState.x, y: crosshairState.y, z: crosshairState.z };
        
        // Inicializa as referências base para rolagem nativa de forma independente
        ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const ts = cornerstoneTools.getToolState(el, 'stack');
                const plane = id.replace('endo-', '');
                if (ts && ts.data && ts.data[0]) {
                    obliqueState.baseIndices[plane] = ts.data[0].currentImageIdIndex;
                } else {
                    if (plane === 'axial') obliqueState.baseIndices[plane] = crosshairState.z;
                    else if (plane === 'coronal') obliqueState.baseIndices[plane] = crosshairState.y;
                    else if (plane === 'sagittal') obliqueState.baseIndices[plane] = crosshairState.x;
                }
            }
        });
        
        // Fixa a âncora visual para permitir o arrasto
        obliqueCenter3D = { x: crosshairState.x, y: crosshairState.y, z: crosshairState.z };
        
        updateObliqueViewports();
} else {
        if (btn) btn.classList.remove('active-tool');
        
        // BUG 5: ao desativar o oblíquo, desativa a mira junto (simétrico à ativação)
        if (isCrosshairActive && typeof toggleCrosshair === 'function') toggleCrosshair();
        
        // Retorna para as imagens ortogonais retas
        synchronizeMobileViews();
    }
    // BUG 3/4: atualiza botões contextuais (olho + espelhar)
    if (typeof updateMprContextButtons === 'function') updateMprContextButtons();
}

// ==========================================================
// BUG 3: BOTÃO OLHO — oculta/mostra as linhas da mira (e bolinhas do oblíquo)
// ==========================================================
window.toggleCrosshairLines = function() {
    crosshairLinesHidden = !crosshairLinesHidden;
    var btn = document.getElementById('btn-mpr-eye');
    if (btn) {
        btn.classList.toggle('active-tool', crosshairLinesHidden);
        var ic = btn.querySelector('.eye-ic');
        if (ic) ic.textContent = crosshairLinesHidden ? '🚫' : '👁️';
    }
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        try {
            var enabled = cornerstone.getEnabledElements().some(function(e){ return e.element === el; });
            if (enabled) cornerstone.updateImage(el);
        } catch(e) {}
    });
};

// ==========================================================
// BUG 4: BOTÃO ESPELHAR — inverte horizontalmente o corte oblíquo
// ==========================================================
window.toggleObliqueMirror = function() {
    if (!obliqueState.isActive) return;
    obliqueMirror = !obliqueMirror;
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        try {
            var enabled = cornerstone.getEnabledElements().some(function(e){ return e.element === el; });
            if (enabled) {
                var vp = cornerstone.getViewport(el);
                vp.hflip = !vp.hflip;
                cornerstone.setViewport(el, vp);
            }
        } catch(e) {}
    });
    var btn = document.getElementById('btn-mpr-mirror');
    if (btn) btn.classList.toggle('active-tool', obliqueMirror);
};

// ==========================================================
// BUG 3/4: visibilidade contextual dos botões olho/espelhar
//  - olho: aparece quando a mira OU o oblíquo estão ativos
//  - espelhar: aparece somente quando o oblíquo está ativo
// ==========================================================
function updateMprContextButtons() {
    var fab = document.getElementById('mpr-context-fab');
    var eyeBtn = document.getElementById('btn-mpr-eye');

    var showEye = !!isCrosshairActive;
    var showMirror = !!(obliqueState && obliqueState.isActive);

    if (eyeBtn) {
        eyeBtn.style.display = showEye ? 'flex' : 'none';
        if (!showEye && crosshairLinesHidden) {
            // ao sair da mira, reseta o olho para começar mostrando as linhas
            crosshairLinesHidden = false;
            eyeBtn.classList.remove('active-tool');
            var ic = eyeBtn.querySelector('.eye-ic');
            if (ic) ic.textContent = '👁️';
        }
    }

    // #2: botões espelhar agora são por viewport (cada um inverte só o seu corte)
    // #3: também visíveis no EndoFocus, ao lado do Stack/Scroll —
    // o dentista espelha qualquer corte sem precisar ativar o oblíquo.
    var inFocus = document.body.classList.contains('endo-focusing');
    if (typeof window.setViewportMirrorButtonsVisible === 'function') {
        window.setViewportMirrorButtonsVisible(showMirror || inFocus);
    }

    if (fab) fab.style.display = showEye ? 'flex' : 'none';
}
window.updateMprContextButtons = updateMprContextButtons;

// #4: Monta as infos DICOM no canto inferior do Axial (somente EndoTri)
window.updateDicomInfoOverlay = function() {
    var boxEndo = document.getElementById('endo-dicom-info');
    var boxAxial = document.getElementById('axial-dicom-info');
    if (!boxEndo && !boxAxial) return;

    if (!window.dicomInfo) window.dicomInfo = {};

    // O SEGREDO: Se os dados ainda não foram processados (porque a aba Endo não abriu),
    // puxamos os metadados diretamente do cabeçalho da imagem que já está na tela Axial!
    try {
        let axialEl = document.getElementById('axial-viewport');
        let img = cornerstone.getImage(axialEl);
        
        if (img && img.data && typeof img.data.string === 'function') {
            let ds = img.data;
            if (!window.dicomInfo.patientName) {
                let pn = ds.string('x00100010');
                if (pn) window.dicomInfo.patientName = String(pn).replace(/\^/g, ' ').trim();
            }
            if (!window.dicomInfo.studyDate) {
                let sd = ds.string('x00080020');
                if (sd && sd.length === 8) {
                    window.dicomInfo.studyDate = sd.slice(6,8) + '/' + sd.slice(4,6) + '/' + sd.slice(0,4);
                } else if (sd) {
                    window.dicomInfo.studyDate = sd;
                }
            }
            if (!window.dicomInfo.patientSex) {
                let px = ds.string('x00100040');
                if (px) window.dicomInfo.patientSex = String(px).trim();
            }
            if (!window.dicomInfo.patientBirthDate) {
                let bd = ds.string('x00100030');
                if (bd && bd.length === 8) window.dicomInfo.patientBirthDate = bd;
            }
            if (!window.dicomInfo.studyDescription) {
                let sdesc = ds.string('x00081030');
                if (sdesc) window.dicomInfo.studyDescription = String(sdesc).trim();
            }
            if (!window.dicomInfo.kvp) window.dicomInfo.kvp = ds.floatString('x00180060');
            if (!window.dicomInfo.mA) {
                let ma = ds.floatString('x00181151');
                if (ma == null || isNaN(ma)) {
                    let mauA = ds.floatString('x00181153');
                    if (mauA != null && !isNaN(mauA)) ma = mauA / 1000;
                }
                window.dicomInfo.mA = ma;
            }
        }
    } catch(e) { console.warn("Erro ao extrair dados da imagem ativa", e); }

    let pName = window.dicomInfo.patientName || 'Paciente Não Identificado';
    let sDate = window.dicomInfo.studyDate || 'Data Indisponível';

    var rows = [];
    rows.push('<div class="di-row di-name">' + pName + '</div>');
    rows.push('<div class="di-row di-date">' + sDate + '</div>');

    let techInfo = [];
    if (window.dicomInfo.kvp) techInfo.push(Math.round(window.dicomInfo.kvp) + ' kV');
    if (window.dicomInfo.mA) techInfo.push(Number(window.dicomInfo.mA).toFixed(1) + ' mA');
    if (techInfo.length > 0) {
        rows.push('<div class="di-row di-tech">' + techInfo.join(' • ') + '</div>');
    }

    try {
        // Tenta pegar o Voxel do volume 3D (se a aba Endo já tiver sido montada)
        let ps, st;
        if (typeof volumeMeta !== 'undefined' && volumeMeta && volumeMeta.pixelSpacing) {
            ps = volumeMeta.pixelSpacing;
            st = volumeMeta.sliceThickness || ps;
        } else {
            // Se o volume 3D ainda não foi montado, pega direto do cabeçalho da imagem 2D da aba Axial
            let axialEl = document.getElementById('axial-viewport');
            let img = cornerstone.getImage(axialEl);
            if (img) {
                ps = img.columnPixelSpacing || img.rowPixelSpacing;
                st = (img.data && img.data.floatString) ? (img.data.floatString('x00180050') || ps) : ps;
            }
        }

        if (ps) {
            ps = Math.round(ps * 1000) / 1000;
            st = Math.round(st * 1000) / 1000;
            var voxel = (ps === st) ? (ps + ' mm') : (ps + '×' + ps + '×' + st + ' mm');
            rows.push('<div class="di-row di-voxel">Voxel: ' + voxel + '</div>');
        }
    } catch(e) {}

    let htmlContent = rows.join('');
    if (boxAxial) boxAxial.innerHTML = htmlContent;
    // #3: no EndoTri o nome quebra em DUAS linhas p/ ficar restrito ao canto
    if (boxEndo) {
        let endoRows = rows.slice();
        let words = String(pName).trim().split(/\s+/);
        if (words.length > 1) {
            let mid = Math.ceil(words.length / 2);
            endoRows[0] = '<div class="di-row di-name">' + words.slice(0, mid).join(' ') + '<br>' + words.slice(mid).join(' ') + '</div>';
        }
        boxEndo.innerHTML = endoRows.join('');
    }
};

function isEventFromSlider(event) {
    if (!event) return false;
    const target = event.target || event.srcElement;
    if (!target) return false;

    // Se o toque foi num Botão, Select ou Input, BLOQUEIA o Cornerstone
    if (['INPUT', 'SELECT', 'BUTTON'].includes(target.tagName)) return true;
    
    // Se o toque foi na TopBar, nos FABs ou no Slider, BLOQUEIA o Cornerstone
    if (target.closest('input, select, button, .vp-topbar, .slice-slider-container, .fab-group-left, .fab-group-right')) return true;

    const sliderIds = ['brightnessSlider','contrastSlider','sharpnessSlider','shadowSlider','highlightSlider'];
    if (target.id && sliderIds.includes(target.id)) return true;

    return false;
}

// ==========================================================
// 🖐️ 3. INTERAÇÃO (CENTRO VS BOLINHAS) (BLINDADO)
// ==========================================================
// ==========================================================
// 🖐️ 3. INTERAÇÃO (CENTRO VS BOLINHAS) (CORRIGIDO E TESTADO)
// ==========================================================

// ==========================================================
// 🖐️ 3. INTERAÇÃO (CENTRO VS BOLINHAS) COM TRANSLACÃO OBLÍQUA
// ==========================================================

function forceAllEndoViewportsToMiraMode() {
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;

        if (el._modeBtn && typeof window.applyEndoTouchMode === 'function') {
            window.applyEndoTouchMode(el, el._modeBtn, 'mira');
        } else {
            try {
                cornerstoneTools.setToolDisabledForElement(el, 'StackScroll');
                cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
                cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {});
                cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {});
            } catch(e) {}
            el.dataset.touchMode = 'mira';
        }
    });
}

function startCrosshairDrag(e) {
    if (currentActiveTool === 'Zoom' || currentActiveTool === 'Magnify' || isEventFromSlider(e) || !isCrosshairActive) return;

    // PINCH FIX: Se 2+ dedos, cancela qualquer drag de mira e deixa o
    // ZoomTouchPinch do Cornerstone tratar o gesto livremente.
    if (e.touches && e.touches.length > 1) {
        isDraggingCrosshair = false;
        obliqueState.mode = null;
        return;
    }

    const element = e.currentTarget;
    const _touchMode = element && element.dataset ? element.dataset.touchMode : '';
    const _viewportIsScrollOrWwwc = (_touchMode === 'scroll' || _touchMode === 'wwwc');

    // GPS PRECISO
    const coords = getPreciseImageCoords(element, e);
    const image = cornerstone.getImage(element);
    if (!image) return;
    
let xImagePixel, yImagePixel, cX, cY;

    if (obliqueState.isActive) {
        const coordsOcc = getObliqueCrosshairCoords(element.id);
        xImagePixel = coordsOcc.xImagePixel;
        yImagePixel = coordsOcc.yImagePixel;
        cX = xImagePixel;
        cY = yImagePixel;
    } else {
        if (element.id === 'endo-axial') { xImagePixel = crosshairState.x; yImagePixel = crosshairState.y; }
        else if (element.id === 'endo-coronal') { xImagePixel = crosshairState.x; yImagePixel = crosshairState.z; }
        else if (element.id === 'endo-sagittal') { xImagePixel = crosshairState.y; yImagePixel = crosshairState.z; }
        cX = xImagePixel; cY = yImagePixel;
    }
    
    const distToCenter = Math.hypot(coords.x - cX, coords.y - cY);
// Converte o threshold de 50px de tela para pixels de imagem usando o scale atual.
// Sem isso, após zoom o usuário nunca consegue atingir a zona de rotação porque
// a mesma distância física na tela corresponde a menos pixels de imagem.
let _vpScale = 1;
try {
    const _vp = cornerstone.getViewport(element);
    if (_vp && _vp.scale) _vpScale = _vp.scale;
} catch(_) {}
const _rotateThreshold = 50 / Math.max(_vpScale, 0.1);
const _hitCenterOfCrosshair = distToCenter < _rotateThreshold;

// PATCH CIRÚRGICO:
// Se a viewport está em Stack/Scroll ou WWWC, o gesto continua pertencendo
// ao Cornerstone, EXCETO quando o usuário toca exatamente no centro da mira
// em modo oblíquo. Nesse caso, o centro da mira tem prioridade clínica:
// volta tudo para Mira, recentraliza os 3 planos e permite o arrasto.
if (_viewportIsScrollOrWwwc) {
    if (!(obliqueState.isActive && _hitCenterOfCrosshair)) {
        return;
    }

    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    forceAllEndoViewportsToMiraMode();
} else {
    if (e.cancelable) e.preventDefault();
}

isDraggingCrosshair = true;

if (_hitCenterOfCrosshair || !obliqueState.isActive) {
        obliqueState.mode = 'translate';

        // PATCH CIRÚRGICO:
        // Se o usuário pegou o CENTRO da mira em modo oblíquo,
        // qualquer scroll/stack independente anterior deve ser absorvido.
        // Isso recentraliza os 3 planos sem mexer em yaw/pitch/roll
        // e sem quebrar o scroll por viewport.
        if (obliqueState.isActive) {
            resetObliqueScrollOffsetsForCrosshairDrag();

            // Após zerar os offsets, recalcula o centro visual real da mira.
            // Com offsets zerados e obliqueCenter3D = crosshairState,
            // normalmente isso volta para o centro da imagem.
            try {
                const coordsAfterReset = getObliqueCrosshairCoords(element.id);
                if (
                    coordsAfterReset &&
                    isFinite(coordsAfterReset.xImagePixel) &&
                    isFinite(coordsAfterReset.yImagePixel)
                ) {
                    cX = coordsAfterReset.xImagePixel;
                    cY = coordsAfterReset.yImagePixel;
                }
            } catch(e) {}
        }

        crosshairDragOffset.x = coords.x - cX;
        crosshairDragOffset.y = coords.y - cY;
        obliqueState.lastDragPoint = { x: coords.x, y: coords.y };
    } else {
        obliqueState.mode = 'rotate';
        const touch = e.touches ? e.touches[0] : e;
        obliqueState.lastDragPoint = { x: touch.pageX, y: touch.pageY };
        const dx = Math.abs(coords.x - cX); const dy = Math.abs(coords.y - cY);
        obliqueState.activeHandle = (dy > dx) ? 'vertical' : 'horizontal';
    }
}

function moveCrosshair(e) {
    if (currentActiveTool === 'Zoom' || currentActiveTool === 'Magnify' || !isCrosshairActive || !isDraggingCrosshair) return;
    if (e.cancelable) e.preventDefault();
    const element = e.currentTarget;
    
    // GPS PRECISO NO MOVIMENTO
    const coords = getPreciseImageCoords(element, e);
    
    if (obliqueState.isActive && obliqueState.mode === 'rotate') {
        const touch = e.touches ? e.touches[0] : e;
        const deltaX = touch.pageX - obliqueState.lastDragPoint.x;
        const deltaY = touch.pageY - obliqueState.lastDragPoint.y;
        const sensitivity = 0.01;
        if (element.id === 'endo-axial') {
            if (obliqueState.activeHandle === 'horizontal') obliqueState.pitch += deltaY * sensitivity;
            if (obliqueState.activeHandle === 'vertical') obliqueState.roll += deltaX * sensitivity;
        } else if (element.id === 'endo-coronal') {
            if (obliqueState.activeHandle === 'horizontal') obliqueState.yaw += deltaY * sensitivity;
            if (obliqueState.activeHandle === 'vertical') obliqueState.roll += deltaX * sensitivity;
        } else if (element.id === 'endo-sagittal') {
            if (obliqueState.activeHandle === 'horizontal') obliqueState.yaw += deltaY * sensitivity;
            if (obliqueState.activeHandle === 'vertical') obliqueState.pitch += deltaX * sensitivity;
        }
        obliqueState.lastDragPoint = { x: touch.pageX, y: touch.pageY };
        updateObliqueViewports(); 
  } else if (obliqueState.isActive && obliqueState.mode === 'translate') {
    const deltaX = coords.x - obliqueState.lastDragPoint.x;
    const deltaY = coords.y - obliqueState.lastDragPoint.y;

    const basis = getObliqueBasis(obliqueState.yaw, obliqueState.pitch, obliqueState.roll);
    const plane = element.id.replace('endo-', '');
    const frame = getObliquePhysicalFrame(plane, basis);
    const pixelMM = getObliqueInPlanePixelSpacingMM();

    const crossPhys = ijkToPhys(crosshairState);
    const movedPhys = add3(
        crossPhys,
        add3(
            mul3(frame.uPhys, deltaX * pixelMM),
            mul3(frame.vPhys, deltaY * pixelMM)
        )
    );

    const movedIJK = physToIJK(movedPhys);

    crosshairState.x = clamp(movedIJK.x, 0, volumeMeta.x - 1);
    crosshairState.y = clamp(movedIJK.y, 0, volumeMeta.y - 1);
    crosshairState.z = clamp(movedIJK.z, 0, volumeMeta.z - 1);

    obliqueState.lastDragPoint = { x: coords.x, y: coords.y };

    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
            try { cornerstone.updateImage(el); } catch (e) {}
        }
    });

    } else {
        const newX = coords.x - crosshairDragOffset.x;
        const newY = coords.y - crosshairDragOffset.y;
        if (element.id === 'endo-axial') { crosshairState.x = newX; crosshairState.y = newY; }
        else if (element.id === 'endo-coronal') { crosshairState.x = newX; crosshairState.z = newY; }
        else if (element.id === 'endo-sagittal') { crosshairState.y = newX; crosshairState.z = newY; }
        crosshairState.x = clamp(crosshairState.x, 0, volumeMeta.x - 1);
        crosshairState.y = clamp(crosshairState.y, 0, volumeMeta.y - 1);
        crosshairState.z = clamp(crosshairState.z, 0, volumeMeta.z - 1);
        synchronizeMobileViews();
    }
}


function stopCrosshairDrag() { 
    isDraggingCrosshair = false; 
    
    // Atualiza tudo para renderizar o "Slab" grosso (se selecionado) ao invés do preview fino
    if (obliqueState.isActive) {
        // RE-ANCORA o centro no crosshair atual: ao soltar o arrasto da mira,
        // os 3 planos voltam a cruzar no novo ponto, absorvendo os offsets de
        // profundidade acumulados pelo scroll (recentraliza). Mesmo padrão da
        // ativação do oblíquo (obliqueCenter3D = crosshairState).
        obliqueCenter3D = { x: crosshairState.x, y: crosshairState.y, z: crosshairState.z };
        updateObliqueViewports();
    } else {
        synchronizeMobileViews();
    }
}


// PINCH FIX: Cancela drag de mira quando 2+ dedos aparecem
function _cancelDragOnPinch(e) {
    if (e.touches && e.touches.length > 1 && isDraggingCrosshair) {
        isDraggingCrosshair = false;
        obliqueState.mode = null;
        // Reativa zoom por pinça imediatamente
        try {
            cornerstoneTools.setToolActiveForElement(e.currentTarget, 'ZoomTouchPinch', {});
        } catch(ex) {}
    }
}


function setWwwcEnabled(enabled) {
  const ids = [
    '#tab-axial .viewport-element',
    'endo-axial',
    'endo-coronal',
    'endo-sagittal',
    'pan-pano-viewer',
    'pan-mini-viewer'
  ];
  // Adiciona cortes transversais dinâmicos
  document.querySelectorAll('.pan-cut-item').forEach(el => ids.push(el));

  ids.forEach((selOrId) => {
    let el;
    if (typeof selOrId !== 'string') { el = selOrId; }
    else if (selOrId.startsWith('#')) { el = document.querySelector(selOrId); }
    else { el = document.getElementById(selOrId); }

    if (!el) return;

    try {
      if (enabled) {
        // ww/wc volta apenas quando NENHUM modo de mira/obliquo está ativo
        cornerstoneTools.setToolActiveForElement(el, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
      } else {
        cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
      }
    } catch (e) {}
  });
}


function toggleCrosshair() { 
    isCrosshairActive = !isCrosshairActive; 
    
    // Se ligar a mira, limpa Zoom ou Lupa para não dar conflito
    if (isCrosshairActive) {
        currentActiveTool = null;
        const btnZoom = document.getElementById('btn-tool-zoom');
        const btnLupa = document.getElementById('btn-tool-lupa');
        if(btnZoom) btnZoom.classList.remove('active-tool');
        if(btnLupa) btnLupa.classList.remove('active-tool');
    }

    setWwwcEnabled(!isCrosshairActive); 
    const button = document.getElementById('btn-mpr-crosshair'); 
    const viewportIds = ['endo-axial', 'endo-coronal', 'endo-sagittal']; 
    
    window.removeEventListener('touchend', stopCrosshairDrag); 
    window.removeEventListener('mouseup', stopCrosshairDrag); 
    if (isCrosshairActive) { 
        window.addEventListener('touchend', stopCrosshairDrag); 
        window.addEventListener('mouseup', stopCrosshairDrag); 
    } 

    if (isCrosshairActive) { 
        if (button) button.classList.add('active-tool'); 
        viewportIds.forEach((id) => { 
            const element = document.getElementById(id); 
            if (!element) return; 
            try { 
                cornerstoneTools.setToolDisabledForElement(element, 'Wwwc'); 
                cornerstoneTools.setToolDisabledForElement(element, 'StackScroll'); 
                cornerstoneTools.setToolActiveForElement(element, 'ZoomTouchPinch', {}); 
                cornerstoneTools.setToolActiveForElement(element, 'PanMultiTouch', {}); 
            } catch (e) {} 
     element.removeEventListener('touchstart', startCrosshairDrag);
element.removeEventListener('touchmove', moveCrosshair);
element.removeEventListener('touchstart', _cancelDragOnPinch);
element.addEventListener('touchstart', startCrosshairDrag, { passive: false });
element.addEventListener('touchmove', moveCrosshair, { passive: false });
// PINCH FIX: Cancela drag de mira se um segundo dedo tocar enquanto arrasta
element.addEventListener('touchstart', _cancelDragOnPinch, { passive: true });
            cornerstone.updateImage(element); 
        }); 
    } else { 
        if (button) button.classList.remove('active-tool'); 
        viewportIds.forEach((id) => { 
            const element = document.getElementById(id); 
            if (!element) return; 
            element.removeEventListener('touchstart', startCrosshairDrag); 
            element.removeEventListener('touchmove', moveCrosshair); 
            try { 
                cornerstoneTools.setToolActiveForElement(element, 'ZoomTouchPinch', {}); 
                cornerstoneTools.setToolActiveForElement(element, 'PanMultiTouch', {}); 
            } catch (e) {} 
            cornerstone.updateImage(element); 
        }); 
    } 
    // #3: sincroniza os botões flutuantes de cada viewport com o estado da mira
    //  - mira ligada  -> botão entra em "Mira" (dedo move a mira; cicla p/ Scroll/WL)
    //  - mira desligada -> botão volta a "Scroll" (padrão)
    ['endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el._modeBtn && typeof window.applyEndoTouchMode === 'function') {
            window.applyEndoTouchMode(el, el._modeBtn, isCrosshairActive ? 'mira' : 'scroll');
        }
    });
    // BUG 3: mostra/esconde o botão olho conforme a mira
    if (typeof updateMprContextButtons === 'function') updateMprContextButtons();
}

// ==========================================================
// 📐 1. MATEMÁTICA 3D: VETORES E MATRIZES OBLÍQUAS
// ==========================================================

// Calcula a orientação dos eixos (X, Y, Z) no espaço 3D após a rotação
function getObliqueBasis(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);

    // Eixo X (Direita da tela no Axial)
    const xVec = {
        x: cy * cr + sy * sp * sr,
        y: cp * sr,
        z: -sy * cr + cy * sp * sr
    };

    // Eixo Y (Baixo da tela no Axial)
    const yVec = {
        x: -cy * sr + sy * sp * cr,
        y: cp * cr,
        z: sy * sr + cy * sp * cr
    };

    // Eixo Z (Profundidade / Normal do plano Axial)
    const zVec = {
        x: sy * cp,
        y: -sp,
        z: cy * cp
    };

    return { xVec, yVec, zVec };
}

// Define os vetores específicos para cada Viewport (Axial, Coronal, Sagital)
function getViewportVectors(plane, basis) {
    let u, v, n;

    if (plane === 'axial') {
        u = basis.xVec;
        v = basis.yVec;
        n = basis.zVec;
    } else if (plane === 'coronal') {
        u = basis.xVec;
        v = basis.zVec;
        n = { x: -basis.yVec.x, y: -basis.yVec.y, z: -basis.yVec.z };
    } else if (plane === 'sagittal') {
        u = basis.yVec;
        v = basis.zVec;
        n = basis.xVec;
    }

    return { u, v, n };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function getVolumeSpacingXYZ() {
    const sx = (volumeMeta && volumeMeta.pixelSpacing) || 1.0;
    const sy = (volumeMeta && volumeMeta.pixelSpacing) || 1.0;
    const sz = (volumeMeta && volumeMeta.sliceThickness) || 1.0;
    return { sx: sx, sy: sy, sz: sz };
}

function getPlaneNativeSpacingMM(plane) {
    const s = getVolumeSpacingXYZ();
    if (plane === 'axial') return s.sz;
    if (plane === 'coronal') return s.sy;
    return s.sx;
}

function getObliqueInPlanePixelSpacingMM() {
    const s = getVolumeSpacingXYZ();
    return Math.min(s.sx, s.sy);
}

function ijkToPhys(ijk) {
    const s = getVolumeSpacingXYZ();
    return {
        x: ijk.x * s.sx,
        y: ijk.y * s.sy,
        z: ijk.z * s.sz
    };
}

function physToIJK(p) {
    const s = getVolumeSpacingXYZ();
    return {
        x: p.x / s.sx,
        y: p.y / s.sy,
        z: p.z / s.sz
    };
}

function vecPhysFromIJKUnit(v) {
    const s = getVolumeSpacingXYZ();
    return {
        x: v.x * s.sx,
        y: v.y * s.sy,
        z: v.z * s.sz
    };
}

function norm(v) {
    const L = Math.hypot(v.x, v.y, v.z) || 1e-9;
    return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul3(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function getObliquePhysicalFrame(plane, basis) {
    let uPhys, vPhys, nPhys;

    if (plane === 'axial') {
        uPhys = basis.xVec;
        vPhys = basis.yVec;
        nPhys = basis.zVec;
    } else if (plane === 'coronal') {
        uPhys = basis.xVec;
        vPhys = basis.zVec;
        nPhys = {
            x: -basis.yVec.x,
            y: -basis.yVec.y,
            z: -basis.yVec.z
        };
    } else {
        uPhys = basis.yVec;
        vPhys = basis.zVec;
        nPhys = basis.xVec;
    }

    uPhys = norm(uPhys);
    vPhys = norm(vPhys);
    nPhys = norm(nPhys);

    const spacing = getVolumeSpacingXYZ();

    return {
        spacing: spacing,
        uPhys: uPhys,
        vPhys: vPhys,
        nPhys: nPhys,
        uIJKPerMM: {
            x: uPhys.x / spacing.sx,
            y: uPhys.y / spacing.sy,
            z: uPhys.z / spacing.sz
        },
        vIJKPerMM: {
            x: vPhys.x / spacing.sx,
            y: vPhys.y / spacing.sy,
            z: vPhys.z / spacing.sz
        },
        nIJKPerMM: {
            x: nPhys.x / spacing.sx,
            y: nPhys.y / spacing.sy,
            z: nPhys.z / spacing.sz
        }
    };
}

function getObliqueRenderGeometry() {
    const s = getVolumeSpacingXYZ();

    const physX = (volumeMeta && volumeMeta.x ? volumeMeta.x : 1) * s.sx;
    const physY = (volumeMeta && volumeMeta.y ? volumeMeta.y : 1) * s.sy;
    const physZ = (volumeMeta && volumeMeta.z ? volumeMeta.z : 1) * s.sz;

    const diagMM = Math.sqrt(
        physX * physX +
        physY * physY +
        physZ * physZ
    );

    const pixelMM = getObliqueInPlanePixelSpacingMM();
    const legacySize = Math.max(volumeMeta.x || 1, volumeMeta.y || 1, volumeMeta.z || 1);
    const requestedSize = Math.max(legacySize, Math.ceil(diagMM / Math.max(pixelMM, 1e-6)));

    const width = requestedSize;
    const height = requestedSize;

    return {
        width: width,
        height: height,
        pixelMM: pixelMM,
        halfWidthPx: (width - 1) / 2,
        halfHeightPx: (height - 1) / 2,
        halfWidthMM: ((width - 1) * pixelMM) / 2,
        halfHeightMM: ((height - 1) * pixelMM) / 2
    };
}


function toggleInvert() {
    const isModalOpen = document.getElementById('modal-zoom').style.display === 'flex';
    
    // Lista inteligente: detecta qual aba está ativa
    let targets = [];
    if (isModalOpen) {
        targets = ['modal-viewport'];
    } else {
        const axialTab = document.getElementById('tab-axial');
        const panTab = document.getElementById('tab-pan');
        if (axialTab && axialTab.classList.contains('active')) {
            targets = ['axial-viewport'];
        } else if (panTab && panTab.classList.contains('active')) {
            // Implant: inverte todos os viewers Cornerstone visíveis
            const candidates = ['pan-pano-viewer', 'pan-mini-viewer'];
            document.querySelectorAll('.pan-cut-item').forEach(el => {
                const cs = cornerstone.getEnabledElements().some(e => e.element === el);
                if (cs) candidates.push(el);
            });
            targets = candidates;
        } else {
            targets = ['endo-axial', 'endo-coronal', 'endo-sagittal'];
        }
    }

    targets.forEach(idOrEl => {
        const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return;
        try {
            const isEnabled = cornerstone.getEnabledElements().some(e => e.element === el);
            if (isEnabled) {
                const vp = cornerstone.getViewport(el);
                vp.invert = !vp.invert;
                cornerstone.setViewport(el, vp);
            }
        } catch (err) {
            console.error("Erro ao inverter " + (el.id || el));
        }
    });
}

function resetAll() {
    // 1) Desativa o modo oblíquo de verdade (não só zera ângulos)
    if (obliqueState && obliqueState.isActive && typeof toggleObliqueMode === 'function') {
        try { toggleObliqueMode(); } catch(e) {}   // desliga oblíquo
    }
    obliqueState.yaw = 0; obliqueState.pitch = 0; obliqueState.roll = 0;
    obliqueState.mode = 'translate';
    obliqueState.sliceOffsets = { axial: 0, coronal: 0, sagittal: 0 };
    obliqueState.baseIndices = { axial: 0, coronal: 0, sagittal: 0 };

    // 2) Crosshair ao centro do volume
    crosshairState.x = volumeMeta.x / 2;
    crosshairState.y = volumeMeta.y / 2;
    crosshairState.z = volumeMeta.z / 2;
    obliqueCenter3D = { x: crosshairState.x, y: crosshairState.y, z: crosshairState.z };

    // 3) Limpa medidas
    clearAllMeasurements();

    // 4) Reseta CADA viewport: zoom, pan, inversão, flip E JANELA (brilho/contraste)
    ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try {
            const isEnabled = cornerstone.getEnabledElements().some(e => e.element === el);
            if (!isEnabled) return;
            const vp = cornerstone.getViewport(el);
            if (!vp) return;
            vp.scale = 1.0;
            vp.translation = { x: 0, y: 0 };
            vp.invert = false;
            if (id !== 'endo-axial' && id !== 'axial-viewport') vp.vflip = true;
            // JANELA: volta ao default da imagem (o que o DICOM trouxe)
            try {
                const img = cornerstone.getImage(el);
                if (img && vp.voi) {
                    vp.voi.windowWidth  = img.windowWidth;
                    vp.voi.windowCenter = img.windowCenter;
                }
            } catch(eW) {}
            vp.rotation = 0;
            cornerstone.setViewport(el, vp);
        } catch(e) {}
    });

    resetToolButtons();

    // 5) Re-render coerente com o estado (oblíquo já desligado acima)
    if (obliqueState.isActive) updateObliqueViewports(); else synchronizeMobileViews();

    // 6) repaint dos filtros/HUD
    if (typeof _paintAllFiltersAll === 'function') { try { _paintAllFiltersAll(); } catch(e) {} }
}

async function openModalZoom(sourceId, title) {
    const modal = document.getElementById('modal-zoom');
    const modalView = document.getElementById('modal-viewport');
    const sourceEl = document.getElementById(sourceId);
    const modalSlider = document.getElementById('modal-slider');
    const modalSliceInfo = document.getElementById('modal-slice-info');
    
    if (!modal || !modalView || !sourceEl) return;

    document.getElementById('modal-title').innerText = title;
    modal.style.display = 'flex';
    
    setTimeout(() => {
        try {
            cornerstone.enable(modalView);
            const image = cornerstone.getImage(sourceEl);
            const viewport = cornerstone.getViewport(sourceEl);
            const stackData = cornerstoneTools.getToolState(sourceEl, 'stack');

            if (image && stackData && stackData.data && stackData.data[0]) {
                const stack = stackData.data[0];
                
                cornerstone.displayImage(modalView, image);
                cornerstone.setViewport(modalView, viewport);
// Configura o Slider do Modal
modalSlider.min = 0;
modalSlider.max = stack.imageIds.length - 1;
modalSliceInfo.innerText = `${stack.currentImageIdIndex + 1} / ${stack.imageIds.length}`;

const plane = sourceId.replace('endo-', '');

// Registra o plano no modal e sincroniza o valor visual do select
document.getElementById('modal-zoom').dataset.plane = plane;
const modalSelect = document.getElementById('modal-slab-select');
if (modalSelect) modalSelect.value = thicknessState[plane] || 'native';

if (obliqueState && obliqueState.isActive) {
    // MODO OBLÍQUO: Centra o slider no meio para poder navegar nos dois sentidos.
    // A navegação não usa stack.imageIds (ortogonais) — usa o loader oblíquo.
    const mid = Math.floor(stack.imageIds.length / 2);
    modalSlider.value = mid;
    // Salva a posição do crosshair no momento em que o modal abriu.
    // É a âncora: o slider vai afastar/aproximar desse ponto ao longo da normal.
    window._modalCrossCenter = {
        x: crosshairState.x,
        y: crosshairState.y,
        z: crosshairState.z
    };
} else {
    // MODO ORTOGONAL: comportamento original
    modalSlider.value = stack.currentImageIdIndex;
    modalSlider.style.setProperty('--mz-fill', (modalSlider.max>0 ? (modalSlider.value/modalSlider.max*100) : 0) + '%');
}

modalSlider.oninput = function() {
    this.style.setProperty('--mz-fill', (this.max>0 ? (this.value/this.max*100) : 0) + '%');
    const newIndex = parseInt(this.value);
    modalSliceInfo.innerText = `${newIndex + 1} / ${stack.imageIds.length}`;

if (obliqueState && obliqueState.isActive && window._modalCrossCenter) {
    const mid = Math.floor(stack.imageIds.length / 2);
    const delta = newIndex - mid;

    const basis = getObliqueBasis(
        obliqueState.yaw,
        obliqueState.pitch,
        obliqueState.roll
    );

    const frame = getObliquePhysicalFrame(plane, basis);
    const nativeStepMM = getPlaneNativeSpacingMM(plane);

    const centerPhys = ijkToPhys(window._modalCrossCenter);
    const movedPhys = add3(centerPhys, mul3(frame.nPhys, delta * nativeStepMM));
    const movedIJK = physToIJK(movedPhys);

    crosshairState.x = clamp(movedIJK.x, 0, volumeMeta.x - 1);
    crosshairState.y = clamp(movedIJK.y, 0, volumeMeta.y - 1);
    crosshairState.z = clamp(movedIJK.z, 0, volumeMeta.z - 1);

    updateObliqueViewports();

    const obliqueId = 'mpr-oblique:' + plane + '?t=' + Date.now();
    cornerstone.loadAndCacheImage(obliqueId).then(function(obliqueImg) {
        if (!obliqueImg) return;
        cornerstone.displayImage(modalView, obliqueImg);

        if (typeof window.syncLengthMeasurementsForElement === 'function') {
            requestAnimationFrame(function() {
                window.syncLengthMeasurementsForElement(modalView);
            });
        }
    });


  } else {
        // ── MODO ORTOGONAL ────────────────────────────────────────────
        if (plane === 'axial')    crosshairState.z = newIndex;
        else if (plane === 'coronal')  crosshairState.y = newIndex;
        else if (plane === 'sagittal') crosshairState.x = newIndex;

        // O SEGREDO: Removemos o ID limpo do cache e forçamos o re-render com Timestamp
        const baseId = stack.imageIds[newIndex].split('?')[0];
        const freshImageId = baseId + '?t=' + Date.now();
        
        cornerstone.loadAndCacheImage(freshImageId).then(newImg => {
            cornerstone.displayImage(modalView, newImg);
            synchronizeMobileViews();
        });
    }
};
                
// Inicializa lastDelta ao abrir o modal
modalSlider.dataset.lastDelta = 0;
// Se modo oblíquo, centra o slider no meio para permitir navegar para ambos os lados
if (obliqueState.isActive) {
    const mid = Math.floor(stack.imageIds.length / 2);
    modalSlider.value = mid;
    modalSliceInfo.innerText = `${mid + 1} / ${stack.imageIds.length}`;
}

                // Re-ativa as ferramentas de toque no modal
                cornerstoneTools.addToolForElement(modalView, cornerstoneTools.WwwcTool);
                cornerstoneTools.addToolForElement(modalView, cornerstoneTools.ZoomTouchPinchTool);
                cornerstoneTools.addToolForElement(modalView, cornerstoneTools.PanMultiTouchTool);
                cornerstoneTools.setToolActiveForElement(modalView, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
                cornerstoneTools.setToolActiveForElement(modalView, 'ZoomTouchPinch', {});
                cornerstoneTools.setToolActiveForElement(modalView, 'PanMultiTouch', {});
                
                cornerstone.resize(modalView);
            }
        } catch (err) {
            console.error("Erro ao carregar modal com slider:", err);
        }
    }, 50);
}

function closeModalZoom() {
    // Garante que as ferramentas flutuantes sejam desligadas e devolvidas pra casa ao fechar o modal no X
    if (typeof limaClose === 'function') {
        limaClose();
    }

    // ─── SEGMENTAÇÃO: NÃO destruir. Apenas devolver o painel e limpar listeners do modal ───
    var segPanel = document.getElementById('seg-inline-panel');
    var endoEmpty = document.getElementById('endo-empty');
    if (segPanel && endoEmpty && !endoEmpty.contains(segPanel)) {
        segPanel.style.cssText = '';
        segPanel.dataset.moved = '';
        endoEmpty.appendChild(segPanel);
    }

    // Remove listeners de clique de segmentação do modal (serão re-bound na próxima abertura)
    var modalViewEl = document.getElementById('modal-viewport');
    if (modalViewEl && window._segOnClick) {
        try { modalViewEl.removeEventListener('mousedown', window._segOnClick); } catch(e){}
        try { modalViewEl.removeEventListener('touchstart', window._segOnClick); } catch(e){}
    }

    // Fecha o modal 3D de segmentação se estiver aberto (evita ficar aberto por trás)
    if (typeof segClose3D === 'function') segClose3D();

    const modalView = document.getElementById('modal-viewport');
    if (modalView) {
        try {
            cornerstone.disable(modalView);
        } catch(e) {}
    }
    document.getElementById('modal-zoom').style.display = 'none';

    // Força redraw dos viewports Endo normais para que a máscara continue visível
    if (segState && (segState.mask || segState.maskDisplay) && segState.voxelCount > 0) {
        ['endo-axial','endo-coronal','endo-sagittal'].forEach(function(id){
            var el = document.getElementById(id);
            if (el) try { cornerstone.updateImage(el); } catch(e){}
        });
    }
}

// changeSlab: definição única abaixo




// toggleInvert definida acima (única definição)




// 1. Esta é a função que "tranca" o toque no botão
function stopUIPropagation(event) {
    if (event && event.stopPropagation) {
        event.stopPropagation();
    }
}


// Guarda o blob gerado para o downloadExame usar direto (sem re-encode)
window._lastPrintBlob = null;

/* ==========================================================
   FUNÇÕES DE RENDERIZAÇÃO DO SCREENSHOT (SEM DISTORÇÃO)
   ========================================================== */
function drawCanvasContain(ctx, sourceCanvas, destX, destY, destW, destH) {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const srcRatio = srcW / srcH;
    const destRatio = destW / destH;

    let drawW, drawH, drawX, drawY;

    if (srcRatio > destRatio) {
        drawW = destW;
        drawH = destW / srcRatio;
    } else {
        drawH = destH;
        drawW = destH * srcRatio;
    }

    drawX = destX + (destW - drawW) / 2;
    drawY = destY + (destH - drawH) / 2;

    // Fundo preto para onde a imagem não cobrir (preserve aspect ratio)
    ctx.fillStyle = '#000';
    ctx.fillRect(destX, destY, destW, destH);
    ctx.drawImage(sourceCanvas, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);

    // Retorna o retângulo exato onde a imagem foi desenhada para ancorar os Overlays/Medidas
    return { x: drawX, y: drawY, w: drawW, h: drawH };
}

async function takeScreenshot() {
    const previewImg = document.getElementById('print-result-img');
    const previewOverlay = document.getElementById('print-preview-overlay');

    // ── 1. MODO 3D ──
    const tab3d = document.getElementById('tab-3d');
    if (tab3d && tab3d.classList.contains('active')) {
        if (!renderer3D) return alert("Renderize o 3D primeiro");
        renderer3D.render(scene3D, camera3D);
        const webglCanvas = renderer3D.domElement;
        const finalCvs3D = document.createElement('canvas');
        finalCvs3D.width = webglCanvas.width; finalCvs3D.height = webglCanvas.height;
        const ctx3D = finalCvs3D.getContext('2d');
        ctx3D.drawImage(webglCanvas, 0, 0);
        ctx3D.font = "bold 20px Arial"; ctx3D.fillStyle = "white";
        ctx3D.fillText("EndoSlice 3D - " + new Date().toLocaleString(), 20, finalCvs3D.height - 30);
        
        window._lastScreenshotHasMeasure = false;
        previewImg.src = finalCvs3D.toDataURL('image/jpeg', 0.95);
        previewOverlay.style.display = 'flex';
        return;
    }

    // ── 2. MODO RX 2D ──
    const rx2dSpace = document.getElementById('rx2d-workspace');
    if (rx2dSpace && rx2dSpace.style.display === 'flex') {
        if (typeof RX2DEngine !== 'undefined') RX2DEngine.generateReport();
        return;
    }

    // ── 3. MODO DICOM (MODAL, AXIAL E ENDO) ──
    const endoTab = document.getElementById('tab-endo');
    const isModalOpen = document.getElementById('modal-zoom') && document.getElementById('modal-zoom').style.display === 'flex';
    const isEndo = endoTab && endoTab.classList.contains('active') && !isModalOpen;
    
    // Antes de capturar, garantir que as viewports estão redimensionadas corretamente.
    // #4 FIX: verificação SÍNCRONA bitmap×box (sem corrida de rAF) — se o canvas
    // estiver com bitmap velho (pós-resize), conserta AQUI e o print sai correto.
    if (typeof window.endoEnsureCanvasConsistency === 'function') {
        window.endoEnsureCanvasConsistency();
    }
    if (typeof safeResizeViewports === 'function') {
        safeResizeViewports();
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
        if (typeof window.endoEnsureCanvasConsistency === 'function') {
            window.endoEnsureCanvasConsistency();
        }
    }

    let targets = [];
    if (isModalOpen) targets = ['modal-viewport']; 
    // Ignoramos "endo-empty" pois ele possui apenas a interface clínica, não possui canvas DICOM real
    else if (isEndo) targets = ['endo-axial', 'endo-coronal', 'endo-sagittal']; 
    else targets = ['axial-viewport'];

    // LÓGICA DE LAYOUT DINÂMICO
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const validTargets = [];

    for (let id of targets) {
        const el = document.getElementById(id);
        // Filtra elementos escondidos e pega suas posições reais na tela
        if (el && el.style.display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            minX = Math.min(minX, rect.left);
            minY = Math.min(minY, rect.top);
            maxX = Math.max(maxX, rect.right);
            maxY = Math.max(maxY, rect.bottom);
            validTargets.push({ el, id, rect });
        }
    }

    if (validTargets.length === 0) return;

    const layoutW = maxX - minX;
    const layoutH = maxY - minY;
    // Garante altíssima resolução para os textos não cerilharem ao espichar/conter
    const scale = Math.max(2, window.devicePixelRatio || 2); 
    
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = layoutW * scale;
    finalCanvas.height = layoutH * scale;
    const ctx = finalCanvas.getContext('2d');
    
    // Pinta o fundo da grade de Preto (Onde não houver viewport DICOM, a divisória será preta e elegante)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    let hasAnyMeasure = false;

    for (let { el, id, rect } of validTargets) {
        // Posição proporcional deste Viewport na imagem global
        const destX = (rect.left - minX) * scale;
        const destY = (rect.top - minY) * scale;
        const destW = rect.width * scale;
        const destH = rect.height * scale;

        let imgCanvas = el.querySelector('canvas.cornerstone-canvas');
        if(!imgCanvas) {
            const cvsArr = Array.from(el.querySelectorAll('canvas'));
            imgCanvas = cvsArr.find(c => !c.hasAttribute('data-ov') && c.id !== 'lima-canvas' && c.id !== 'schneider-overlay-canvas');
        }

        if (!imgCanvas) continue;

        // MAGIA NEGRA AQUI: Estratégia 'CONTAIN'
        // Ele vai esmagar/centralizar a imagem sem deformá-la dentro da área destinada no CSS
        const drawnRect = drawCanvasContain(ctx, imgCanvas, destX, destY, destW, destH);
        
        // Coordenadas relativas exatas DA IMAGEM, dentro do slot, pra onde ancorar medidas e filtros
        const W = drawnRect.w;
        const H = drawnRect.h;
        const x = drawnRect.x;
        const y = drawnRect.y;

        // Overlay de filtros (Sharp/Fine)
        const filterCanvas = el.querySelector('canvas[data-ov]');
        if (filterCanvas && filterCanvas.style.display !== 'none' && filterCanvas.width > 0) {
            // FIX PRINT: o overlay tem a MESMA proporção do canvas fonte; desenhar
            // com contain (e não esticado no slot) impede a camada distorcida.
            drawCanvasContain(ctx, filterCanvas, destX, destY, destW, destH);
        }

        // Verifica se há alguma medida da ferramenta LengthTool
        try {
            const ts = cornerstoneTools.getToolState(el, 'Length');
            if (ts && ts.data && ts.data.length > 0) hasAnyMeasure = true;
        } catch(e) {}

        // Desenha Lima Virtual ancorada à nova coordenada
        const limaCanvas = document.getElementById('lima-canvas');
        if (limaCanvas && typeof limaState !== 'undefined' && limaState.active && limaState.sourceViewportId === el.id) {
            hasAnyMeasure = true;
            ctx.drawImage(limaCanvas, 0, 0, limaCanvas.width, limaCanvas.height, x, y, W, H);
            
            const resultDiv = document.getElementById('lima-result');
            if (resultDiv && resultDiv.style.display !== 'none' && limaState.points && limaState.points.length >= 2) {
                const lastPt = limaState.points[limaState.points.length - 1];
                try {
                    const canvasPt = cornerstone.pixelToCanvas(el, {x: lastPt.imgX, y: lastPt.imgY});
                    const match = resultDiv.innerText.match(/([\d\.]+)\s*mm/);
                    if (match) {
                        const mmText = match[0];
                        // O texto escala suavemente caso a tela do usuário seja enorme
                        ctx.font = `bold ${22 * scale}px -apple-system, sans-serif`;
                        const tw = ctx.measureText(mmText).width;
                        const boxW = tw + (20 * scale), boxH = 34 * scale, rr = 8 * scale;
                        const bx = x + canvasPt.x * (W / el.clientWidth) - boxW/2;
                        const by = y + canvasPt.y * (H / el.clientHeight) + (15 * scale);
                        
                        ctx.fillStyle = "rgba(10, 15, 25, 0.85)";
                        ctx.strokeStyle = "#00e5ff";
                        ctx.lineWidth = 2 * scale;
                        
                        ctx.beginPath();
                        ctx.moveTo(bx + rr, by);
                        ctx.lineTo(bx + boxW - rr, by); ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + rr);
                        ctx.lineTo(bx + boxW, by + boxH - rr); ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - rr, by + boxH);
                        ctx.lineTo(bx + rr, by + boxH); ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - rr);
                        ctx.lineTo(bx, by + rr); ctx.quadraticCurveTo(bx, by, bx + rr, by);
                        ctx.fill(); ctx.stroke();
                        
                        ctx.fillStyle = "#00e5ff";
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText(mmText, bx + boxW/2, by + boxH/2);
                    }
                } catch(e) {}
            }
        }

        // Desenha SVG Layer do Cornerstone (Medidas e Linhas)
        const svgLayer = el.querySelector('.cornerstone-svg-layer');
        if (svgLayer) {
            const svgData = new XMLSerializer().serializeToString(svgLayer);
            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            await new Promise(resolve => {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, x, y, W, H); URL.revokeObjectURL(url); resolve(); };
                img.src = url;
            });
        }
        
        // Desenha Texto Livre
        if (typeof textToolState !== 'undefined' && textToolState.annotations) {
            const annots = textToolState.annotations.filter(a => a.containerId === el.id);
            if (annots.length > 0) hasAnyMeasure = true;
            annots.forEach(ann => {
                const ax = x + ann.x * (W / el.clientWidth);
                const ay = y + ann.y * (H / el.clientHeight);
                const lx = ax + ann.labelDx * (W / el.clientWidth);
                const ly = ay + ann.labelDy * (H / el.clientHeight);
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly);
                ctx.strokeStyle = ann.color; ctx.lineWidth = 2 * scale; ctx.stroke();
                ctx.beginPath(); ctx.arc(ax, ay, 4 * scale, 0, Math.PI * 2);
                ctx.fillStyle = ann.color; ctx.fill();
                if (typeof _burnTextToCanvas === 'function') _burnTextToCanvas(ctx, ann.text, lx, ly, ann.color, scale);
            });
        }
    }

    window._lastScreenshotHasMeasure = hasAnyMeasure;
    previewImg.src = finalCanvas.toDataURL("image/png");
    previewOverlay.style.display = 'flex';
}

function _burnTextToCanvas(ctx, text, x, y, color, scale = 1) {
    ctx.font = `bold ${18 * scale}px -apple-system, sans-serif`;
    const tm = ctx.measureText(text);
    const w = tm.width + (20 * scale), h = 32 * scale, r = 8 * scale;
    const bx = x - w/2, by = y - h/2;
    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 15, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + w - r, by); ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
    ctx.lineTo(bx + w, by + h - r); ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
    ctx.lineTo(bx + r, by + h); ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
    ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
}

window.screenshotAddToPortfolio = function() {
    var img = document.getElementById('print-result-img');
    if (!img || !img.src) { showToast('⚠ Nenhuma captura disponível'); return; }
    
    // Roteia automaticamente para a sessão correta!
    var tipo = window._lastScreenshotHasMeasure ? 'Medição Tomográfica' : 'Corte Tomográfico';
    
    portfolioAddItem(tipo, img.src, 'Captura · ' + new Date().toLocaleTimeString('pt-BR'), {}, '');
    document.getElementById('print-preview-overlay').style.display = 'none';
};



// ==========================================================
// downloadExame (VERSÃO COMPATÍVEL COM iOS / ANDROID)
// Usa o menu de compartilhamento nativo para permitir
// "Salvar Imagem" na galeria ou enviar por WhatsApp/AirDrop.
// ==========================================================
async function downloadExame() {
    const imgElement = document.getElementById('print-result-img');
    if (!imgElement || !imgElement.src) {
        alert("Erro: Nenhuma imagem gerada para salvar.");
        return;
    }

    const base64Data = imgElement.src;
    const fileName = "Exame_Dental_EndoCT.png";

    try {
        // 1. Converte Base64 para BLOB (Arquivo Binário)
        const response = await fetch(base64Data);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: "image/png" });

        // 2. Verifica se o navegador suporta compartilhamento nativo de arquivos (iOS 15+)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Exame EndoCT',
                text: 'Segue a captura do exame.'
            });
        } else {
            // 3. Fallback para Desktop (Link de Download Clássico)
            const link = document.createElement('a');
            link.href = base64Data;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (error) {
        // Se o usuário cancelar o menu de compartilhamento, cai aqui (não é um erro real)
        if (error.name !== 'AbortError') {
            console.error("Erro ao salvar/compartilhar:", error);
            alert("Não foi possível abrir o menu de compartilhamento. Tente pressionar e segurar a imagem para salvar.");
        }
    }
}


// Variável global para controlar o estado manual
var isManuallyFlipped = false;

function toggleVerticalFlip() {
    isManuallyFlipped = !isManuallyFlipped;
    const viewportsEndo = ['endo-coronal', 'endo-sagittal'];
    viewportsEndo.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        try {
            // Verifica se o elemento foi carregado no motor antes de agir
            const isEnabled = cornerstone.getEnabledElements().some(e => e.element === element);
            if (isEnabled) {
                const viewport = cornerstone.getViewport(element);
                viewport.vflip = !viewport.vflip;
                cornerstone.setViewport(element, viewport);
            }
        } catch (err) {}
    });
    if (obliqueState.isActive) updateObliqueViewports();
}

var currentAxialMode = 'scroll';

function toggleAxialMode(forceMode) {
    var element = document.getElementById('axial-viewport');
    var btn     = document.getElementById('btn-axial-mode');
    var iconEl  = document.getElementById('btn-axial-icon');
    var labelEl = document.getElementById('btn-axial-label');
    if (!element || !btn) return;

    if (forceMode) currentAxialMode = forceMode;
    else currentAxialMode = (currentAxialMode === 'scroll') ? 'wwwc' : 'scroll';

    if (currentAxialMode === 'scroll') {
        // — MODO NAVEGAR FATIAS —
        btn.setAttribute('data-mode', 'scroll');
        if (iconEl)  iconEl.textContent  = '↕';
        if (labelEl) labelEl.textContent = 'SCROLL';
        try {
            cornerstoneTools.setToolActiveForElement(element, 'StackScroll', { mouseButtonMask: 1, isTouchActive: true });
            cornerstoneTools.setToolDisabledForElement(element, 'Wwwc');
        } catch(e) { console.warn('toggleAxialMode scroll:', e); }
    } else {
        // — MODO BRILHO / CONTRASTE —
        btn.setAttribute('data-mode', 'wwwc');
        if (iconEl)  iconEl.textContent  = '◑';
        if (labelEl) labelEl.textContent = 'W / L';
        try {
            cornerstoneTools.setToolActiveForElement(element, 'Wwwc', { mouseButtonMask: 1, isTouchActive: true });
            cornerstoneTools.setToolDisabledForElement(element, 'StackScroll');
        } catch(e) { console.warn('toggleAxialMode wwwc:', e); }
    }

    // Pinch-zoom sempre ativo nos dois modos
    try { cornerstoneTools.setToolActiveForElement(element, 'ZoomTouchPinch', {}); } catch(e) {}
}


// ==========================================================
// 🚀 MÓDULO 3D v4 — DVR FRONT-TO-BACK (como Horos/OsiriX)
// - Normalização HU fixo (-500..3000) = consistente entre scanners
// - DVR front-to-back acumula progressivamente (osso + esmalte)
// - Normal suavizada (step 2 voxels) reduz ruído de CBCT
// - MIP acumulativo para presets Endo
// ==========================================================

let renderer3D, scene3D, camera3D, controls3D;
let volumeMesh;
let is3DInitialized = false;
let animationId3D   = null;
let currentPreset3D = 'bone';
let implantControls3D = null; // <<< ADICIONE ESTA LINHA

// ---- VERTEX SHADER ----
const vertexShaderVR = `
    out vec3 vOrigin;
    out vec3 vDirection;
    void main() {
        vOrigin    = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vDirection = position - vOrigin;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// ---- FRAGMENT SHADER DVR FRONT-TO-BACK ----
// O volume contém HU normalizados de -500..3000 → 0..1
// Com esse range fixo:
//   ar/pulmão  -500 HU = 0.00
//   tecido mole 100 HU = 0.17
//   osso esponj 400 HU = 0.26
//   osso cortical700HU = 0.34
//   dentina    1000 HU = 0.43
//   esmalte    1500 HU = 0.57
//   esmalte pur2000 HU = 0.71
// ---- FRAGMENT SHADER CBCT HYBRID (Morita Quality + Presets) ----
// ---- FRAGMENT SHADER CBCT HYBRID (Morita Quality + Presets) ----
const fragmentShaderVR = `
    precision highp float;
    precision highp sampler3D;

    in vec3 vOrigin;
    in vec3 vDirection;
    out vec4 pc_fragColor;

    uniform sampler3D uVolume;
    uniform float uSteps;
    uniform int   uMode;        
   
    uniform float uT1;          
    uniform float uT2;          
    uniform float uT3;          
    uniform float uLight;
    uniform float uDensityScale;
    uniform float uNoiseThresh;
    uniform float uNoiseFloor; // ARTEFATOS: descarta voxels abaixo deste piso de densidade
   
    uniform float uSmoothT1; 
    uniform float uSmoothT2; 

    uniform float uMipThresh; 
    uniform float uMipSoft;   
    uniform float uMipHighOnly; // 1.0 = rampa cinza idêntica ao P&B; só o topo (branco) vira uMipHigh
    uniform vec3  uMipLow;
    uniform vec3  uMipHigh;

    uniform float uRealT1;   
    uniform float uRealT2;   
    uniform float uRealT3;   
    uniform float uRealT4;   

    uniform float uE2Hard;
    uniform float uE2Canal;
    uniform float uE2Dentin;

    uniform float uCinT1;
    uniform float uCinT2;
    uniform float uCinT3;
    uniform float uCinT4;

    uniform float uR2T1;   
    uniform float uR2T2;   
    uniform float uR2T3;   
    uniform float uR2T4;   
    uniform float uR2Pulp; 

    uniform float uSmooth;

    // JITTERING: Quebra o Efeito Madeira
    float rand(vec2 co) {
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    vec2 hitBox(vec3 o, vec3 d) {
        vec3 inv = 1.0 / d;
        vec3 a = (vec3(-0.5) - o) * inv;
        vec3 b = (vec3( 0.5) - o) * inv;
        vec3 mn = min(a, b); vec3 mx = max(a, b);
        return vec2(max(max(mn.x, mn.y), mn.z), min(min(mx.x, mx.y), mx.z));
    }

    vec3 getNormal(vec3 p) {
        vec3 e = (uSmooth) / vec3(textureSize(uVolume, 0));
        float dx = texture(uVolume, p + vec3(e.x, 0.0, 0.0)).r - texture(uVolume, p - vec3(e.x, 0.0, 0.0)).r;
        float dy = texture(uVolume, p + vec3(0.0, e.y, 0.0)).r - texture(uVolume, p - vec3(0.0, e.y, 0.0)).r;
        float dz = texture(uVolume, p + vec3(0.0, 0.0, e.z)).r - texture(uVolume, p - vec3(0.0, 0.0, e.z)).r;
        float len = length(vec3(dx, dy, dz));
        return len < uNoiseThresh ? vec3(0.0, 1.0, 0.0) : normalize(vec3(dx, dy, dz));    
    }

    // ---- FUNÇÕES ORIGINAIS DE SOMBRA E CORES ----
    vec3 shade(vec3 n, vec3 vd, vec3 col, float specPow) {
        vec3 lK = normalize(vec3( 0.6,  0.8,  1.0));
        vec3 lF = normalize(vec3(-0.6,  0.2,  0.5));
        vec3 lR = normalize(vec3( 0.1, -0.3, -0.8));
        float dK = max(dot(n, lK), 0.0);
        float dF = max(dot(n, lF), 0.0) * 0.40;
        float dR = max(dot(n, lR), 0.0) * 0.20;
        vec3 h   = normalize(lK + vd);
        float sp = pow(max(dot(n, h), 0.0), specPow);
        return col * (0.35 + (dK * 0.65 + dF + dR) * uLight) + vec3(sp * 0.10 * uLight);
    }

    vec3 shadeRealistic(vec3 n, vec3 vd, vec3 col, float specPow, float specStrength, bool isEnamel) {
        vec3 lK   = normalize(vec3( 0.55, 1.00, 0.50));
        vec3 colK = vec3(1.00, 0.97, 0.90);
        vec3 lF   = normalize(vec3(-0.80, -0.30, 0.40));
        vec3 colF = vec3(0.75, 0.85, 1.00);
        vec3 lR   = normalize(vec3( 0.00,  0.50, -1.00));
        vec3 colR = vec3(0.90, 0.92, 0.95);
        float dK = max(dot(n, lK), 0.0);
        float dF = max(dot(n, lF), 0.0) * 0.35;
        float dR = max(dot(n, lR), 0.0) * 0.22;
        vec3 hK  = normalize(lK + vd);
        float sp = pow(max(dot(n, hK), 0.0), specPow) * specStrength;
        vec3 amb = isEnamel ? col * 0.18 : col * vec3(1.05, 0.98, 0.88) * 0.28;
        vec3 diff = col * (dK * colK * 1.50 * uLight + dF * colF * uLight + dR * colR * uLight);
        vec3 spec = isEnamel ? vec3(1.00, 1.00, 1.00) * sp * 0.3 : vec3(0.95, 0.90, 0.80) * sp * 0.02;
        return clamp(amb + diff + spec, 0.0, 1.0);
    }

    vec4 tfRealistic(float v) {
        if (v < uRealT1) return vec4(0.0);
        if (v < uRealT2) {
            float t = (v - uRealT1) / (uRealT2 - uRealT1);
            float a = t * t * 0.70 * uDensityScale;
            vec3 c = mix(vec3(0.27, 0.17, 0.07), vec3(0.58, 0.40, 0.18), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        if (v < uRealT3) {
            float t = (v - uRealT2) / (uRealT3 - uRealT2);
            vec3 c = mix(vec3(0.72, 0.58, 0.35), vec3(0.87, 0.77, 0.61), smoothstep(0.0, 1.0, t));
            float rustFactor = smoothstep(0.3, 0.6, t) * (1.0 - smoothstep(0.6, 0.9, t)) * 0.15;
            c = mix(c, vec3(0.62, 0.40, 0.16), rustFactor);
            float a = mix(0.72, 0.92, t) * uDensityScale;
            return vec4(c, a);
        }
        if (v < uRealT4) {
            float t = (v - uRealT3) / (uRealT4 - uRealT3);
            vec3 c = mix(vec3(0.82, 0.76, 0.55), vec3(0.96, 0.92, 0.75), smoothstep(0.0, 1.0, t));
            float a = mix(0.85, 0.95, t);
            return vec4(c, a);
        }
        {
            float t = clamp((v - uRealT4) / (1.0 - uRealT4 + 0.001), 0.0, 1.0);
            vec3 c = mix(vec3(0.90, 0.93, 0.98), vec3(0.97, 0.98, 1.00), t);
            return vec4(c, 1.0);
        }
    }

    vec4 tf(float v) {
        if (v < uT1) return vec4(0.0);
        if (v < uT2) {
            float t = (v - uT1) / (uT2 - uT1);
            float a = t * t * 0.85 * uDensityScale; 
            vec3 c  = mix(vec3(0.68, 0.50, 0.20), vec3(0.95, 0.80, 0.50), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        if (v < uT3) {
            float t = (v - uT2) / (uT3 - uT2);
            float a = mix(0.80, 1.00, t);
            vec3 c  = mix(vec3(0.85, 0.87, 0.90), vec3(1.00, 1.00, 1.00), t);
            return vec4(c, a);
        }
        return vec4(1.0, 1.0, 1.0, 1.0);
    }

    // ==========================================
    // NOVA PALETA: AMBER CLASSIC (IMAGEM 1)
    // Translucidez Dourada/Âmbar suave
    // ==========================================
    vec4 tfAmber(float v) {
        if (v < uT1) return vec4(0.0);
        // Transição do marrom escuro pro dourado (raízes)
        if (v < uT2) {
            float t = (v - uT1) / (uT2 - uT1);
            float a = t * 0.55 * uDensityScale; // Mais translúcido
            vec3 c = mix(vec3(0.7, 0.25, 0.0), vec3(0.95, 0.55, 0.1), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        // Ouro para Branco/Marfim
        if (v < uT3) {
            float t = (v - uT2) / (uT3 - uT2);
            float a = mix(0.55, 0.85, t) * uDensityScale;
            vec3 c = mix(vec3(0.95, 0.55, 0.1), vec3(1.0, 0.85, 0.5), t);
            return vec4(c, a);
        }
        return vec4(1.0, 0.95, 0.8, 0.95);
    }

    // ==========================================
    // NOVA PALETA: DRY BONE (IMAGEM 2)
    // Opaco, cavidades pretas, marfim mate
    // ==========================================
    vec4 tfDryBone(float v) {
        if (v < uRealT1) return vec4(0.0);
        // Cavidades profundas: preto e marrom
        if (v < uRealT2) {
            float t = (v - uRealT1) / (uRealT2 - uRealT1);
            float a = t * t * 0.9 * uDensityScale; // Fica opaco super rápido
            vec3 c = mix(vec3(0.08, 0.05, 0.03), vec3(0.55, 0.45, 0.35), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        // Osso Marfim Fosco
        if (v < uRealT3) {
            float t = (v - uRealT2) / (uRealT3 - uRealT2);
            float a = mix(0.9, 1.0, t) * uDensityScale;
            vec3 c = mix(vec3(0.55, 0.45, 0.35), vec3(0.86, 0.81, 0.72), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        // Superfícies mais densas
        if (v < uRealT4) {
            float t = (v - uRealT3) / (uRealT4 - uRealT3);
            vec3 c = mix(vec3(0.86, 0.81, 0.72), vec3(0.95, 0.92, 0.85), t);
            return vec4(c, 1.0);
        }
        return vec4(0.98, 0.96, 0.90, 1.0);
    }

    // ==========================================
    // PALETA VR REAL: i-DIXEL / MORITA (modo 9)
    // Dois materiais: osso SÉPIA (densidade vira textura
    // porosa) + esmalte MARFIM claro que "salta". Fosco.
    // ==========================================
    vec4 tfMoritaVR(float v) {
        if (v < uRealT1) return vec4(0.0);
        // periósteo/osso fino -> entra translúcido (marrom escuro -> caramelo)
        if (v < uRealT2) {
            float t = (v - uRealT1) / max(uRealT2 - uRealT1, 0.001);
            float a = t * t * 0.62 * uDensityScale;
            vec3 c = mix(vec3(0.32, 0.20, 0.11), vec3(0.55, 0.40, 0.26), smoothstep(0.0, 1.0, t));
            return vec4(c, a);
        }
        // esponjoso -> cortical: SÉPIA/CARAMELO (densidade modula o tom = poros)
        if (v < uRealT3) {
            float t = (v - uRealT2) / max(uRealT3 - uRealT2, 0.001);
            vec3 c = mix(vec3(0.55, 0.40, 0.26), vec3(0.76, 0.62, 0.44), smoothstep(0.0, 1.0, t));
            float a = mix(0.86, 0.97, t) * uDensityScale;
            return vec4(c, a);
        }
        // dentina: transição tan -> marfim
        if (v < uRealT4) {
            float t = (v - uRealT3) / max(uRealT4 - uRealT3, 0.001);
            vec3 c = mix(vec3(0.80, 0.68, 0.50), vec3(0.90, 0.85, 0.75), smoothstep(0.0, 1.0, t));
            return vec4(c, mix(0.94, 0.99, t));
        }
        // esmalte: MARFIM claro liso (material mais claro, levemente mais frio que o osso)
        {
            float t = clamp((v - uRealT4) / (1.0 - uRealT4 + 0.001), 0.0, 1.0);
            vec3 c = mix(vec3(0.90, 0.87, 0.80), vec3(0.97, 0.95, 0.90), t);
            return vec4(c, 1.0);
        }
    }


    void main() {
        vec3 rd = normalize(vDirection);
        vec2 bx = hitBox(vOrigin, rd);
        if (bx.x > bx.y) discard;
        bx.x = max(bx.x, 0.0);

        float dt  = (bx.y - bx.x) / uSteps;
        vec3 p = vOrigin + (bx.x + rand(gl_FragCoord.xy) * dt * 0.85) * rd;
        
        vec3 vd = normalize(-rd);
        vec4 acc = vec4(0.0);

        // ... (Modos 6, 0, 2, 1, 3, 4, 5 antigos continuam inalterados aqui, pulei para não sujar o texto. Abaixo as novas inclusões:)

        if (uMode == 7) { 
            // ==== AMBER / GOLD (Imagem 1) ====
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) {
                    p += rd * dt; continue;
                }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                vec4 samp = tfAmber(val);
                if (samp.a > 0.005) {
                    vec3 n = getNormal(coord);
                    vec3 lK = normalize(vec3(0.5, 0.8, 1.0));
                    float dK = max(dot(n, lK), 0.0);
                    // Zero brilho especular, pura cor âmbar difusa
                    vec3 lit = samp.rgb * (0.4 + dK * 0.6 * uLight);
                    
                    float a = 1.0 - pow(max(1.0 - samp.a, 0.0), dt * 150.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.96) break;
                }
                p += rd * dt;
            }
        } 
        else if (uMode == 8) { 
            // ==== DRY BONE / ANATOMIC (Imagem 2) ====
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) {
                    p += rd * dt; continue;
                }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                vec4 samp = tfDryBone(val);
                if (samp.a > 0.005) {
                    vec3 n = getNormal(coord);
                    // Iluminação tipo ring-light cruzada para gerar micro-sombras
                    vec3 lK = normalize(vec3(0.7, 1.0, 0.4)); 
                    vec3 lF = normalize(vec3(-0.8, -0.2, 0.5)); 
                    float dK = max(dot(n, lK), 0.0);
                    float dF = max(dot(n, lF), 0.0) * 0.15; 
                    
                    // Sombras falsas simuladas pela densidade
                    float ao = smoothstep(uRealT1, uRealT3, val);
                    vec3 amb = samp.rgb * vec3(0.9, 0.85, 0.75) * 0.15 * ao;
                    vec3 diff = samp.rgb * (dK * 1.8 * uLight + dF * uLight);
                    
                    vec3 lit = clamp(amb + diff, 0.0, 1.0); // Completamente fosco
                    
                    float a = 1.0 - pow(max(1.0 - samp.a, 0.0), dt * 250.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.98) break;
                }
                p += rd * dt;
            }
        }
        else if (uMode == 9) {
            // ==== i-DIXEL / MORITA VR (v2): render FOSCO tipo "osso fotografado" ====
            // SÓ colormap quente + Lambert-headlight suave + AUTO-SOMBRA (AO).
            // Sem specular, sem rim, sem fresnel, sem azul — é isso que revela o marrom
            // orgânico e elimina de vez o aspecto metálico/plástico.
            vec3 invSize = 1.0 / vec3(textureSize(uVolume, 0));
            float lgt = clamp(uLight, 0.7, 1.25);   // trava o brilho (não deixa "lavar"/metalizar)
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                vec4 samp = tfMoritaVR(val);
                if (samp.a > 0.004) {
                    vec3 n = getNormal(coord);
                    // Headlight (luz na direção da câmera): iluminação parelha, sem glint.
                    // Meio-Lambert (wrap): relevo suave, sem sombra dura preta.
                    float lambert = dot(n, vd) * 0.5 + 0.5;          // 0..1
                    float shade = 0.28 + 0.92 * (lambert * lambert);
                    // AUTO-SOMBRA (AO) por enterramento — principal pista de profundidade.
                    vec3 e = 2.5 * invSize;
                    float b = texture(uVolume, coord + vec3( e.x,  e.y,  e.z)).r
                            + texture(uVolume, coord + vec3(-e.x, -e.y,  e.z)).r
                            + texture(uVolume, coord + vec3( e.x, -e.y, -e.z)).r
                            + texture(uVolume, coord + vec3(-e.x,  e.y, -e.z)).r;
                    float occ = smoothstep(uRealT1, uRealT3, b * 0.25) * 0.65;
                    // cor = colormap puro (marrom/creme) modulado por luz e AO. Nada branqueia.
                    vec3 lit = samp.rgb * shade * lgt;
                    lit *= (1.0 - occ);
                    lit = clamp(lit, 0.0, 1.0);
                    float a = 1.0 - pow(max(1.0 - samp.a, 0.0), dt * 210.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.97) break;
                }
                p += rd * dt;
            }
        }
        else if (uMode == 6) { 
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                if (val < uSmoothT1) { p += rd * dt; continue; }
                vec4 samp;
                if (val < uSmoothT2) { 
                    float t = (val - uSmoothT1) / max(uSmoothT2 - uSmoothT1, 0.001);
                    float a = pow(t, 0.8) * 0.98 * uDensityScale;
                    vec3 c = mix(vec3(0.85, 0.65, 0.30), vec3(0.95, 0.85, 0.50), t);
                    samp = vec4(c, a);
                } else { 
                    float t = clamp((val - uSmoothT2) / (1.0 - uSmoothT2), 0.0, 1.0);
                    float a = mix(0.98, 1.0, t);
                    vec3 c = mix(vec3(0.95, 0.95, 0.95), vec3(1.0, 1.0, 1.0), t);
                    samp = vec4(c, a);
                }
                if (samp.a > 0.005) {
                    vec3 n = getNormal(coord);
                    vec3 lK = normalize(vec3(0.6, 1.0, 0.5));
                    float dK = max(dot(n, lK), 0.0);
                    vec3 h = normalize(lK + vd);
                    float sp = pow(max(dot(n, h), 0.0), 30.0) * (val >= uSmoothT2 ? 0.3 : 0.05);
                    vec3 lit = samp.rgb * (0.35 + dK * 0.75 * uLight) + vec3(sp * uLight);
                    float a = 1.0 - pow(1.0 - samp.a, dt * 250.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.98) break;
                }
                p += rd * dt;
            }
        } else if (uMode == 0) { 
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val  = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                vec4  samp = tf(val);
                if (samp.a > 0.004) {
                    vec3 n   = getNormal(coord);
                    float sp = (val >= uT2) ? 40.0 : 5.0; 
                    vec3 lit = shade(n, vd, samp.rgb, sp);
                    if (val >= uT2) {
                        float fr = pow(1.0 - max(dot(n, vd), 0.0), 2.5);
                        lit += vec3(fr * 0.20); 
                    }
                    float a = 1.0 - pow(max(1.0 - samp.a, 0.0), dt * 180.0);
                    lit = clamp(lit, 0.0, 1.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.97) break;
                }
                p += rd * dt;
            }
        } else if (uMode == 2) {
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val  = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                vec4  samp = tfRealistic(val);
                if (samp.a > 0.003) {
                    vec3 n = getNormal(coord);
                    bool isEnamel = (val >= uRealT3);
                    float specPow, specStr;
                    if (val >= uRealT4) { specPow = 80.0; specStr = 1.0; } 
                    else if (val >= uRealT3) { specPow = 30.0;  specStr = 0.4; } 
                    else if (val >= uRealT2) { specPow = 8.0;  specStr = 0.1; } 
                    else { specPow = 5.0;   specStr = 0.05; }
                    vec3 lit = shadeRealistic(n, vd, samp.rgb, specPow, specStr, isEnamel);
                    if (val >= uRealT3) {
                        float NdotV = max(dot(n, vd), 0.0);
                        float fr    = pow(1.0 - NdotV, 3.2);
                        lit += vec3(0.70, 0.80, 1.00) * fr * 0.25;
                    }
                    float a = 1.0 - pow(max(1.0 - samp.a, 0.0), dt * 200.0);
                    lit = clamp(lit, 0.0, 1.0);
                    acc.rgb += (1.0 - acc.a) * a * lit;
                    acc.a   += (1.0 - acc.a) * a;
                    if (acc.a > 0.97) break;
                }
                p += rd * dt;
            }
        } else if (uMode == 1) {
            float maxHard = 0.0; float maxSoft = 0.0;
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                if (val >= uMipThresh) maxHard = max(maxHard, val);
                else if (val >= uMipThresh * 0.25) maxSoft = max(maxSoft, val);
                p += rd * dt;
            }
            // ── SUAVIZAR (BUG 1): uMipSoft (0.02..0.26) vira softW (0..1).
            //    Antes o uMipSoft vivia num ramo morto: quando maxHard vencia,
            //    o tecido mole era ignorado. Agora o véu participa SEMPRE,
            //    com largura (softLo) e opacidade dirigidas pelo slider.
            float softW  = clamp((uMipSoft - 0.02) / 0.24, 0.0, 1.0);
            float softLo = uMipThresh * mix(0.78, 0.10, softW);  // #3: faixa MUITO mais ampla
            float ts     = (maxSoft > 0.0) ? smoothstep(softLo, uMipThresh, maxSoft) : 0.0;
            vec3  softCol = uMipLow * (0.15 + ts * 0.45);
            float softA   = (0.30 + ts * 0.50) * mix(0.10, 1.80, softW); // #3: de quase seco a véu denso

            // #3: TRANSPARÊNCIA com efeito direto nos MIP — além do gamma,
            // o uDensityScale vira multiplicador de opacidade (0.25x fantasma .. 1.6x denso)
            float transpK = mix(0.25, 1.6, clamp((uDensityScale - 0.05) / 2.45, 0.0, 1.0));
            softA *= transpK;

            if (maxHard >= uMipThresh) {
                // tC: rampa de COR estável (a janela do vermelho do Endo 2 não se move)
                float tC = smoothstep(uMipThresh, 1.0, maxHard);
                // tA: rampa de ALPHA cuja borda inferior DESCE com o Suavizar —
                // contornos de osso/dente ganham decaimento suave real (anti-recorte)
                float tA = smoothstep(uMipThresh * mix(1.0, 0.55, softW), 1.0, maxHard);
                float a  = pow(tA, max(uDensityScale * 0.4, 0.25));
                a = clamp(a * transpK, 0.0, 1.0);
                vec3  col = mix(uMipLow * 0.6 + vec3(0.35), uMipHigh, pow(tC, uDensityScale));
                if (uMipHighOnly > 0.5) {
                    // ENDO 2: osso com a MESMA rampa cinza do Endo P&B;
                    // o vermelho entra só ACIMA do osso (janela 0.52–0.70 em tC):
                    // pega o halo das coroas sem vazar para o trabeculado
                    vec3 gray = mix(uMipLow * 0.6 + vec3(0.35), vec3(1.0), pow(tC, uDensityScale));
                    col = mix(gray, uMipHigh, smoothstep(0.6, 0.9, tC)); // #2: acima da dentina, pega coroa+halo
                }
                // Mistura o véu suave sobre regiões de osso FRACO; quanto mais denso
                // o voxel (tC alto: esmalte/guta), menor a mistura — não apaga dentes.
                if (ts > 0.0) {
                    col = mix(col, softCol, softW * 0.55 * (1.0 - tC));
                    a   = max(a, min(softA, 0.85) * 0.5);
                }
                acc = vec4(clamp(col, 0.0, 1.0), a);
            } else if (ts > 0.0) {
                acc = vec4(softCol, clamp(softA, 0.0, 0.95));
            }
        } else if (uMode == 3) {
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                if (val < uE2Canal) { p += rd * dt; continue; }
                vec3  col; float alpha;
                if (val < uE2Hard) {
                    float t = clamp((val - uE2Canal) / max(uE2Hard - uE2Canal, 0.001), 0.0, 1.0);
                    col   = mix(vec3(0.06, 0.05, 0.05), vec3(0.88, 0.06, 0.03), pow(t, 1.6));
                    alpha = 0.50 + t * 0.40;
                } else if (val < uE2Dentin) {
                    float t = clamp((val - uE2Hard) / max(uE2Dentin - uE2Hard, 0.001), 0.0, 1.0);
                    col   = mix(vec3(0.28, 0.32, 0.42), vec3(0.54, 0.57, 0.66), t);
                    alpha = 0.06 + t * 0.15;  
                } else {
                    float t = clamp((val - uE2Dentin) / (1.0 - uE2Dentin + 0.001), 0.0, 1.0);
                    col = mix(vec3(0.58, 0.61, 0.67), vec3(0.92, 0.94, 0.97), t);
                    vec3 nE = getNormal(coord); vec3 lE = normalize(vec3(0.55, 0.90, 0.65));
                    float dE = max(dot(nE, lE), 0.0); vec3 hE  = normalize(lE + vd);
                    float spE = pow(max(dot(nE, hE), 0.0), 22.0) * 0.15;
                    col = clamp(col * (0.30 + dE * 0.70) + vec3(spE), 0.0, 1.0);
                    alpha = 0.38 + t * 0.47;
                }
                float a = 1.0 - pow(max(1.0 - alpha, 0.0), dt * 180.0);
                col = clamp(col, 0.0, 1.0);
                acc.rgb += (1.0 - acc.a) * a * col; acc.a   += (1.0 - acc.a) * a;
                if (acc.a > 0.97) break;
                p += rd * dt;
            }
        } else if (uMode == 4) {
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                if (val < uCinT1) { p += rd * dt; continue; }
                vec4 samp;
                if (val < uCinT2) {
                    float t = (val - uCinT1) / max(uCinT2 - uCinT1, 0.001);
                    vec3 c = mix(vec3(0.08, 0.04, 0.01), vec3(0.52, 0.33, 0.10), pow(t, 0.6));
                    float pig = smoothstep(0.4, 0.7, t) * (1.0 - smoothstep(0.7, 1.0, t)) * 0.20;
                    c = mix(c, vec3(0.45, 0.22, 0.04), pig);
                    samp = vec4(c, pow(t, 1.5) * 0.80);
                } else if (val < uCinT3) {
                    float t = (val - uCinT2) / max(uCinT3 - uCinT2, 0.001);
                    vec3 c = mix(vec3(0.68, 0.52, 0.28), vec3(0.91, 0.80, 0.58), smoothstep(0.0, 1.0, t));
                    float rust = smoothstep(0.25, 0.55, t) * (1.0 - smoothstep(0.55, 0.85, t)) * 0.22;
                    c = mix(c, vec3(0.60, 0.28, 0.06), rust);
                    samp = vec4(c, mix(0.80, 0.96, t));
                } else if (val < uCinT4) {
                    float t = (val - uCinT3) / max(uCinT4 - uCinT3, 0.001);
                    vec3 c = mix(vec3(0.78, 0.70, 0.44), vec3(0.96, 0.90, 0.68), smoothstep(0.0, 1.0, t));
                    samp = vec4(c, mix(0.88, 0.97, t));
                } else {
                    float t = clamp((val - uCinT4) / (1.0 - uCinT4 + 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.86, 0.90, 0.97), vec3(0.97, 0.98, 1.00), t);
                    samp = vec4(c, 1.0);
                }
                if (samp.a > 0.002) {
                    vec3 n3 = getNormal(coord);
                    vec3 lK3 = normalize(vec3( 0.60,  1.00,  0.55));
                    vec3 lF3 = normalize(vec3(-0.90, -0.35,  0.35));
                    vec3 lR3 = normalize(vec3( 0.10,  0.60, -1.00));
                    float dK3 = max(dot(n3, lK3), 0.0);
                    float dF3 = max(dot(n3, lF3), 0.0) * 0.30;
                    float dR3 = max(dot(n3, lR3), 0.0) * 0.28;
                    float specPow, specStr;
                    if      (val >= uCinT4) { specPow = 90.0; specStr = 1.0; }
                    else if (val >= uCinT3) { specPow = 30.0; specStr = 0.3; }
                    else if (val >= uCinT2) { specPow = 12.0; specStr = 0.1; }
                    else                    { specPow =  5.0; specStr = 0.05; }
                    vec3 hK3 = normalize(lK3 + vd);
                    float sp3 = pow(max(dot(n3, hK3), 0.0), specPow) * specStr;
                    vec3 amb3 = (val >= uCinT3) ? samp.rgb * vec3(0.80, 0.90, 1.10) * 0.20 : samp.rgb * vec3(1.10, 0.95, 0.70) * 0.25;
                    vec3 diff3 = samp.rgb * (dK3 * vec3(1.00, 0.95, 0.82) * 1.5 * uLight + dF3 * vec3(0.60, 0.75, 1.00) * uLight + dR3 * vec3(1.00, 0.82, 0.65) * uLight);
                    vec3 spec3 = (val >= uCinT3) ? vec3(0.90, 0.95, 1.00) * sp3 : vec3(0.95, 0.88, 0.72) * sp3 * 0.2;
                    vec3 lit3 = clamp(amb3 + diff3 + spec3, 0.0, 1.0);
                    float a3 = 1.0 - pow(max(1.0 - clamp(samp.a * uDensityScale, 0.0, 1.0), 0.0), dt * 220.0);
                    lit3 = clamp(lit3, 0.0, 1.0);
                    acc.rgb += (1.0 - acc.a) * a3 * lit3;
                    acc.a   += (1.0 - acc.a) * a3;
                    if (acc.a > 0.97) break;
                }
                p += rd * dt;
            }
        } else if (uMode == 5) {
            for (float i = 0.0; i < uSteps; i++) {
                vec3 coord = p + 0.5;
                if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) { p += rd * dt; continue; }
                float val = texture(uVolume, coord).r;
                if (val < uNoiseFloor) { p += rd * dt; continue; }
                if (val < uR2Pulp) { p += rd * dt; continue; }
                vec4 samp;
                if (val < uR2T1) {
                    float t = clamp((val - uR2Pulp) / max(uR2T1 - uR2Pulp, 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.48, 0.04, 0.03), vec3(0.82, 0.08, 0.04), smoothstep(0.0, 1.0, t));
                    samp = vec4(c, pow(t, 1.2) * 0.78);
                } else if (val < uR2T2) {
                    float t = clamp((val - uR2T1) / max(uR2T2 - uR2T1, 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.12, 0.07, 0.02), vec3(0.44, 0.27, 0.09), smoothstep(0.0, 1.0, t));
                    float dark = (1.0 - smoothstep(0.0, 0.4, t)) * 0.30;
                    c = mix(c, vec3(0.03, 0.02, 0.01), dark);
                    samp = vec4(c, pow(t, 0.65) * 0.72);
                } else if (val < uR2T3) {
                    float t = clamp((val - uR2T2) / max(uR2T3 - uR2T2, 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.66, 0.50, 0.24), vec3(0.84, 0.70, 0.42), smoothstep(0.0, 1.0, t));
                    float spot = smoothstep(0.2, 0.5, t) * (1.0 - smoothstep(0.5, 0.8, t)) * 0.18;
                    c = mix(c, vec3(0.50, 0.30, 0.09), spot);
                    samp = vec4(c, mix(0.76, 0.93, t));
                } else if (val < uR2T4) {
                    float t = clamp((val - uR2T3) / max(uR2T4 - uR2T3, 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.86, 0.74, 0.38), vec3(0.97, 0.89, 0.60), smoothstep(0.0, 1.0, t));
                    samp = vec4(c, mix(0.88, 0.97, t));
                } else {
                    float t = clamp((val - uR2T4) / (1.0 - uR2T4 + 0.001), 0.0, 1.0);
                    vec3 c = mix(vec3(0.92, 0.94, 0.98), vec3(0.99, 0.99, 1.00), t);
                    samp = vec4(c, 1.0);
                }
                if (samp.a > 0.003) {
                    vec3 n5 = getNormal(coord);
                    vec3 lK5 = normalize(vec3( 0.50, 1.00, 0.42));
                    vec3 lF5 = normalize(vec3(-0.70, -0.40, 0.35));
                    vec3 lR5 = normalize(vec3( 0.05, 0.42, -1.00));
                    float dK5 = max(dot(n5, lK5), 0.0);
                    float dF5 = max(dot(n5, lF5), 0.0) * 0.18;
                    float dR5 = max(dot(n5, lR5), 0.0) * 0.28;

                    float specPow5, specStr5;
                    if      (val >= uR2T4) { specPow5 = 100.0; specStr5 = 1.0; }
                    else if (val >= uR2T3) { specPow5 =  30.0; specStr5 = 0.3; } 
                    else if (val >= uR2T2) { specPow5 =   8.0; specStr5 = 0.1; } 
                    else                   { specPow5 =   5.0; specStr5 = 0.05; } 

                    vec3 hK5 = normalize(lK5 + vd);
                    float sp5 = pow(max(dot(n5, hK5), 0.0), specPow5) * specStr5;
                    vec3 amb5 = (val >= uR2T4) ? samp.rgb * 0.12 : (val >= uR2T3) ? samp.rgb * vec3(1.04, 1.00, 0.82) * 0.19 : samp.rgb * vec3(1.06, 0.94, 0.70) * 0.20;
                    vec3 diff5 = samp.rgb * (dK5 * vec3(1.00, 0.96, 0.82) * 1.8 * uLight + dF5 * vec3(0.62, 0.78, 1.00) * uLight + dR5 * vec3(0.94, 0.90, 0.78) * uLight);
                    vec3 spec5 = (val >= uR2T4) ? vec3(1.00, 1.00, 1.00) * sp5 : vec3(0.95, 0.88, 0.68) * sp5 * 0.1;
                    vec3 lit5 = clamp(amb5 + diff5 + spec5, 0.0, 1.0);
                    float a5 = 1.0 - pow(max(1.0 - clamp(samp.a * uDensityScale, 0.0, 1.0), 0.0), dt * 220.0);
                    lit5 = clamp(lit5, 0.0, 1.0);
                    acc.rgb += (1.0 - acc.a) * a5 * lit5;
                    acc.a   += (1.0 - acc.a) * a5;
                    if (acc.a > 0.97) break;
                }
                p += rd * dt;
            }
        }
        if (acc.a < 0.005) discard;
        pc_fragColor = acc;
    }
`;

// ==========================================================
// 1. SLIDER DE CORTE (Threshold) - Shift da Curva em Bloco
// ==========================================================
function updateVRThreshold(val) {
    const label = document.getElementById('vr-thresh-label');
    
    // MODO MALHA 3D (PLY/STL)
    if (window._isMeshMode && window._meshMat) {
        if (!window._meshFlatMode) {
            const brightness = parseFloat(val) / 100.0;
            if (window._meshAmbient) window._meshAmbient.intensity = 0.1 + brightness * 1.1;
            if (window._meshDirL)    window._meshDirL.intensity    = 0.3 + brightness * 2.2;
        }
        if (label) { label.innerText = Math.round(val) + '%'; label.style.color = '#007AFF'; }
        return;
    }

    if (!volumeMesh) return;

    const u = volumeMesh.material.uniforms;
    
    // Converte o valor do slider (100 a 800) para a base relativa do Shader (0.0 a 0.8)
    const n = Math.max(0.0, Math.min(0.95, (parseFloat(val) - 100) / 1000.0));
    const pctDisplay = Math.round((parseFloat(val) / 800) * 100);

    // MÁGICA AQUI: O slider agora desloca todas as camadas juntas, mantendo o degradê do osso perfeito!
    if (currentPreset3D === 'bone' || currentPreset3D === 'amber') {
        u.uT1.value = n;
        u.uT2.value = n + 0.18;
        u.uT3.value = n + 0.44;
    }
    else if (currentPreset3D === 'realistic' || currentPreset3D === 'morita') {
        u.uRealT1.value = n;
        u.uRealT2.value = n + 0.12;
        u.uRealT3.value = n + 0.28;
        u.uRealT4.value = n + 0.45;
    }
    else if (currentPreset3D === 'real2') {
        // FIX: o Real 2 (modo 5) lê uR2Pulp/uR2T1..4 — antes o slider escrevia
        // nos uniforms do Realistic (uRealT*) e por isso NADA mudava na tela.
        u.uR2Pulp.value = Math.max(0.01, n - 0.12);
        u.uR2T1.value = n;
        u.uR2T2.value = n + 0.10;
        u.uR2T3.value = n + 0.25;
        u.uR2T4.value = n + 0.40;
    }
    else if (currentPreset3D === 'cinematic') {
        u.uCinT1.value = n;
        u.uCinT2.value = n + 0.12;
        u.uCinT3.value = n + 0.28;
        u.uCinT4.value = n + 0.44;
    }
    else { // endoBW, endoRed e endo2 (todos MIP)
        u.uMipThresh.value = n;
        // uMipSoft agora é controlado SÓ pelo slider Suavizar (desacoplado do Corte)
    }

    if (label) { label.innerText = pctDisplay + '%'; label.style.color = '#007AFF'; }
}


// ==========================================================
// 2. SLIDER DE TRANSPARÊNCIA (Multiplicador de Opacidade)
// ==========================================================
function updateVRTransparency(val) {
    const lbl = document.getElementById('vr-transp-label');
    
    if (window._isMeshMode && window._meshMat) {
        const opacity = parseFloat(val);
        window._meshMat.transparent = (opacity < 0.99);
        window._meshMat.opacity = opacity;
        window._meshMat.needsUpdate = true;
        if (lbl) { lbl.innerText = Math.round(opacity * 100) + '%'; lbl.style.color = '#34C759'; }
        return;
    }

    if (!volumeMesh) return;
    
    // Modifica a escala de densidade para todos os shaders CBCT
    const v = parseFloat(val);
    volumeMesh.material.uniforms.uDensityScale.value = v;

    if (lbl) { lbl.innerText = v.toFixed(2); lbl.style.color = '#34C759'; }
}


// ==========================================================
// 3. SLIDER DE SUAVIZAR (Diluição do Stepping/Linhas)
// ==========================================================
function updateVRSmooth(val) {
    const lbl = document.getElementById('vr-appear-label');
    if (lbl) { lbl.innerText = Math.round(val) + '%'; lbl.style.color = '#ff9500'; }

    if (window._isMeshMode && window._meshMat) {
        window._meshMat.roughness = parseFloat(val) / 100.0;
        window._meshMat.needsUpdate = true;
        return;
    }
    
    if (!volumeMesh) return;
    
    const t = parseFloat(val) / 100.0;
    const uu = volumeMesh.material.uniforms;

    // Nos presets MIP (Endo P&B, Endo Red, Endo 2, Canal Reveal) não existe normal/iluminação,
    // então o Suavizar controla a SUAVIDADE da faixa de tecido mole (uMipSoft):
    // valores altos = transições mais suaves/difusas, valores baixos = recorte seco.
    if (currentPreset3D === 'endoBW' || currentPreset3D === 'endoRed' ||
        currentPreset3D === 'endo2' || currentPreset3D === 'canalReveal') {
        uu.uMipSoft.value = 0.02 + t * 0.24;
        return;
    }

    // Controla o "Kernel" de cálculo da Normal.
    // Quanto maior, mais voxels vizinhos ele mistura, obliterando o "efeito escada" do CBCT.
    // Curva quadrática: precisão fina no início (detalhe), suavização forte no fim.
    uu.uSmooth.value = 0.6 + (t * t) * 13.4; // #3: amplitude maior (0.6..14), passos sutis no início
}


// ==========================================================
// 4. SLIDER DE ARTEFATOS (Filtro de Ruído Iso-Superfície)
// ==========================================================
function updateVRNoise(val) {
    const lbl = document.getElementById('vr-noise-label');
    if (lbl) { lbl.innerText = Math.round(val) + '%'; lbl.style.color = '#af52de'; }
    
    if (!volumeMesh) return;
    
    const t = parseFloat(val) / 100.0;
    // 1) Impede que "nuvens de ar" recebam cálculo de sombra (efeito sutil, modos DVR)
    volumeMesh.material.uniforms.uNoiseThresh.value = 0.001 + (t * 0.04);
    // 2) PISO DE DENSIDADE GLOBAL: descarta voxels de baixa densidade (pontilhado/névoa).
    //    Curva quadrática — começa imperceptível e limpa agressivamente no topo.
    //    Funciona em TODOS os presets, inclusive os MIP.
    // #5: zona morta até ~15% (visual padrão intacto) e teto alto (0.32):
    // no topo limpa agressivamente poeira/artefatos em TODOS os presets.
    var tEff = Math.max(0, (t - 0.15)) / 0.85;
    volumeMesh.material.uniforms.uNoiseFloor.value = Math.pow(tEff, 1.4) * 0.32;
}


// ---- Limpeza de memória ----
function dispose3D() {
    if (animationId3D) { cancelAnimationFrame(animationId3D); animationId3D = null; }
    if (renderer3D) {
        renderer3D.dispose();
        renderer3D.forceContextLoss();
        const c = document.getElementById('vrContainerMobile');
        if (c) c.innerHTML = '';
        renderer3D = null;
    }
    if (volumeMesh) {
        if (volumeMesh.geometry) volumeMesh.geometry.dispose();
        if (volumeMesh.material) {
            const u = volumeMesh.material.uniforms;
            if (u.uVolume && u.uVolume.value) u.uVolume.value.dispose();
            volumeMesh.material.dispose();
        }
        volumeMesh = null;
    }
    is3DInitialized = false;
    // Limpa estado de modo malha
    window._isMeshMode  = false;
    window._meshMat     = null;
    window._meshFlatMode = false;
    window._meshAmbient = null;
    window._meshDirL    = null;
    window._vrScene     = null;
    window._vrCamera    = null;
    meshModeRestorePanel();
}

// ---- Carregador de Mesh PLY / STL / OBJ ----
// Totalmente separado do motor DICOM. Não toca em nenhuma variável Cornerstone.
function loadMeshFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    // ── Sinaliza que é uma malha 3D, NÃO um exame DICOM ──────────
    window._loadingMeshFile = true;

    // Mostra tela de loading
    const loading  = document.getElementById('loading');
    const loadText = document.querySelector('#loading h1');
    if (loading)  loading.style.display  = 'flex';
    if (loadText) loadText.innerText = 'Carregando ' + ext.toUpperCase() + ': ' + file.name;

    // Muda para aba 3D
    const dockBtn3d = document.querySelector('[onclick*="switchTab(\'3d\')"]')
                   || document.querySelector('.dock-item:last-child');
    switchTab('3d', dockBtn3d);

    // Aguarda a aba estar visível
    setTimeout(() => {
        window._loadingMeshFile = false;

        const container = document.getElementById('vrContainerMobile');
        if (!container) { console.warn('vrContainerMobile nao encontrado'); return; }

        dispose3D();
        container.innerHTML = '';

        const W = container.clientWidth  || window.innerWidth;
        const H = container.clientHeight || Math.round(window.innerHeight * 0.7);

        const meshScene    = new THREE.Scene();
        meshScene.background = new THREE.Color(0x000000);
        
        const meshCamera   = new THREE.PerspectiveCamera(45, W / H, 0.001, 1000);
        meshCamera.position.set(0, 0, 2);
        
        const meshRenderer = new THREE.WebGLRenderer({ antialias: true });
        meshRenderer.setSize(W, H);
        meshRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Correção de cores para ficar fiel ao scan original
        meshRenderer.outputEncoding = THREE.sRGBEncoding; 
        container.appendChild(meshRenderer.domElement);

        const controls = new THREE.OrbitControls(meshCamera, meshRenderer.domElement);
        controls.enableDamping = true;

        // ── ILUMINAÇÃO NEUTRA (Para valorizar a cor do PLY) ──
        const ambLight = new THREE.AmbientLight(0xffffff, 0.9); // Ambiente forte e branco
        meshScene.add(ambLight);

        const dirL = new THREE.DirectionalLight(0xffffff, 1.2); // Luz branca pura
        dirL.position.set(0.5, 1.0, 2.0);
        meshScene.add(dirL);
        
        const bottomL = new THREE.DirectionalLight(0xffffff, 0.5);
        bottomL.position.set(0, -1.0, 0.5);
        meshScene.add(bottomL);

        // Globais
        window._vrScene     = meshScene;
        window._vrCamera    = meshCamera;
        window._meshAmbient = ambLight;
        window._meshDirL    = dirL;
        window._meshBottomL = bottomL;
        window._isMeshMode  = true;
        window._meshRenderer = meshRenderer;

        function onGeometry(geometry) {
            if (loading) loading.style.display = 'none';
            
            // Centralização e Escala
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);
            
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) { const sc = 1.6 / maxDim; geometry.scale(sc, sc, sc); }

            // Recalcula normais para iluminação correta
            geometry.computeVertexNormals();

            // ── LÓGICA DE COR INTELIGENTE ──
            // Verifica se a geometria tem atributo de cor (PLY colorido)
            const hasVertexColors = geometry.attributes.color !== undefined;

            const mat = new THREE.MeshStandardMaterial({
                // Se tiver cor no arquivo, usa BRANCO como base (pra não tingir).
                // Se não tiver (STL), usa BEGE (osso).
                color: hasVertexColors ? 0xffffff : 0xe8d8b0, 
                
                roughness: 0.6,
                metalness: 0.1,
                side: THREE.DoubleSide,
                
                // O SEGREDO: Ativa cores dos vértices se existirem
                vertexColors: hasVertexColors 
            });

            window._meshMat = mat; 
            
            const mesh = new THREE.Mesh(geometry, mat);
            meshScene.add(mesh);
            
            URL.revokeObjectURL(url);
            meshModeAdaptPanel(); // Atualiza sliders
        }

        let meshAnimId = null;
        function animateMesh() { 
            meshAnimId = requestAnimationFrame(animateMesh); 
            controls.update(); 
            meshRenderer.render(meshScene, meshCamera); 
        }
        animateMesh();

        const url = URL.createObjectURL(file);

        if (loadText) loadText.innerText = 'Processando ' + ext.toUpperCase() + '...';
        if (loading)  loading.style.display = 'flex';

        if (ext === 'ply') {
            const loader = new THREE.PLYLoader();
            loader.load(url, onGeometry, null, e => { 
                console.error(e); 
                if (loading) loading.style.display='none'; 
                alert('Erro ao abrir PLY.'); 
            });
        } else if (ext === 'stl') {
            const loader = new THREE.STLLoader();
            loader.load(url, onGeometry, null, e => { 
                console.error(e); 
                if (loading) loading.style.display='none'; 
                alert('Erro ao abrir STL.'); 
            });
        } else if (ext === 'obj') {
            const loader = new THREE.OBJLoader();
            loader.load(url, obj => {
                obj.traverse(child => { 
                    if (child.isMesh) { 
                        // Verifica cores no OBJ também
                        const hasCol = child.geometry.attributes.color !== undefined;
                        child.material = new THREE.MeshStandardMaterial({
                            color: hasCol ? 0xffffff : 0xe8d8b0,
                            side: THREE.DoubleSide,
                            vertexColors: hasCol
                        });
                        onGeometry(child.geometry); 
                    } 
                });
            }, null, e => { 
                console.error(e); 
                if (loading) loading.style.display='none'; 
                alert('Erro ao abrir OBJ.'); 
            });
        }

    }, 300);
}


// ==========================================================
// MÓDULO TESOURA 3D (LASSO CROP)
// ==========================================================
let _scissorActive = false;
let _scissorPoints = [];
let _scissorCanvas = null;
let _scissorHost = null;
let _scissorCleanup = null;

function toggle3DScissor() {
    _scissorActive = !_scissorActive;
    const btn = document.getElementById('btn-3d-scissor');

    if (_scissorActive) {
        if (btn) {
            btn.style.background = 'rgba(255,59,48,0.4)';
            btn.textContent = 'CANCELAR CORTE';
        }

        if (controls3D) controls3D.enabled = false;

        try {
            if (renderer3D && scene3D && camera3D) {
                renderer3D.render(scene3D, camera3D);
            }
        } catch (e) {}

        _initScissorCanvas();
    } else {
        if (btn) {
            btn.style.background = 'rgba(255,59,48,0.15)';
            btn.textContent = '✂️ CORTAR (LASSO)';
        }

        if (controls3D) controls3D.enabled = true;
        _closeScissorCanvas();
    }
}

function _initScissorCanvas() {
    const renderArea = document.getElementById('vrContainerMobile');
    if (!renderArea) return;
    
    _scissorPoints = [];

    // OVERLAY = DIV com um RETRATO CONGELADO do 3D como fundo + SVG por cima pro traço.
    // Motivo: no Safari iOS o canvas WebGL fica PRETO quando algo é sobreposto.
    // Como os controles ficam travados durante o laço, a vista não muda — então mostramos
    // uma foto do 3D no fundo do overlay e desenhamos o laço por cima.
    _scissorCanvas = document.createElement('div');
    _scissorCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;touch-action:none;cursor:crosshair;background-color:#000;overflow:hidden;';

    // Snapshot do 3D como fundo do overlay.
    // Safari iOS exige renderizar imediatamente antes do toDataURL.
    // Usamos <img>, não background CSS, porque data-URL grande em background pode falhar no iOS.
    try {
        if (renderer3D && scene3D && camera3D) {
            renderer3D.render(scene3D, camera3D);

            const _snap = renderer3D.domElement.toDataURL('image/png');

            if (_snap && _snap.length > 128) {
                const _img = document.createElement('img');
                _img.src = _snap;
                _img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
                _scissorCanvas.appendChild(_img);
            }
        }
    } catch (e) {}

    const _svgNS = 'http://www.w3.org/2000/svg';

    const _svg = document.createElementNS(_svgNS, 'svg');
    _svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

    const _svgPoly = document.createElementNS(_svgNS, 'polygon');
    _svgPoly.setAttribute('fill', 'rgba(255,59,48,0.2)');
    _svgPoly.setAttribute('stroke', '#ff3b30');
    _svgPoly.setAttribute('stroke-width', '2');
    _svgPoly.setAttribute('stroke-dasharray', '5,5');
    _svgPoly.setAttribute('points', '');

    _svg.appendChild(_svgPoly);
    _scissorCanvas.appendChild(_svg);
    _scissorCanvas._poly = _svgPoly;

    renderArea.appendChild(_scissorCanvas);

    let isDrawing = false;

    const addPt = (e) => {
        const rect = _scissorCanvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;

        _scissorPoints.push({
            x: t.clientX - rect.left,
            y: t.clientY - rect.top
        });

        _drawScissor();
    };

    _scissorCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        addPt(e);
    });

    _scissorCanvas.addEventListener('touchstart', (e) => {
        isDrawing = true;
        addPt(e);
        e.preventDefault();
    }, { passive: false });
    
    const onMove = (e) => {
        if (isDrawing) {
            addPt(e);
            e.preventDefault();
        }
    };

    _scissorCanvas.addEventListener('mousemove', onMove);
    _scissorCanvas.addEventListener('touchmove', onMove, { passive: false });

    const onUp = () => {
        if (!isDrawing) return;

        isDrawing = false;

        if (_scissorPoints.length > 3) {
            _execute3DCrop();
        } else {
            toggle3DScissor();
        }
    };

    _scissorCanvas.addEventListener('mouseup', onUp);
    _scissorCanvas.addEventListener('touchend', onUp);
}

function _drawScissor() {
    if (!_scissorCanvas || !_scissorCanvas._poly) return;

    // Desenha a poligonal do laço no SVG.
    // Os pontos ficam em px CSS, alinhados ao overlay/snapshot do 3D.
    const pts = _scissorPoints
        .map(p => p.x + ',' + p.y)
        .join(' ');

    _scissorCanvas._poly.setAttribute('points', pts);
}

function _closeScissorCanvas() {
    if (_scissorCleanup) {
        try { _scissorCleanup(); } catch (e) {}
        _scissorCleanup = null;
    }

    if (_scissorCanvas && _scissorCanvas.parentNode) {
        _scissorCanvas.parentNode.removeChild(_scissorCanvas);
    }

    _scissorCanvas = null;
    _scissorPoints = [];
    _scissorHost = null;

    try {
        if (renderer3D && scene3D && camera3D) {
            renderer3D.render(scene3D, camera3D);
        }
    } catch (e) {}
}


async function _execute3DCrop() {
    const btn = document.getElementById('btn-3d-scissor');
    if (btn) btn.textContent = '⏳ CORTANDO...';
    
    // Cria um canvas de máscara invisível
 const maskCvs = document.createElement('canvas');
maskCvs.width = _scissorCanvas.clientWidth || Math.round(_scissorCanvas.getBoundingClientRect().width);
maskCvs.height = _scissorCanvas.clientHeight || Math.round(_scissorCanvas.getBoundingClientRect().height);
    const ctx = maskCvs.getContext('2d');
    ctx.fillStyle = '#000'; // Preto (valor 0)
    ctx.fillRect(0,0, maskCvs.width, maskCvs.height);
    ctx.beginPath();
    ctx.moveTo(_scissorPoints[0].x, _scissorPoints[0].y);
    for (let i=1; i<_scissorPoints.length; i++) ctx.lineTo(_scissorPoints[i].x, _scissorPoints[i].y);
    ctx.closePath();
    ctx.fillStyle = '#fff'; // Branco (valor 255)
    ctx.fill();
    
    const maskData = ctx.getImageData(0, 0, maskCvs.width, maskCvs.height).data;
    await new Promise(r => setTimeout(r, 50));

    const W = maskCvs.width;
    const H = maskCvs.height;

    // Atualiza matrizes do Three.js
    camera3D.updateMatrixWorld(true);
    if(volumeMesh) volumeMesh.updateMatrixWorld(true);
    const projMatrix = new THREE.Matrix4().multiplyMatrices(camera3D.projectionMatrix, camera3D.matrixWorldInverse);
    const vec = new THREE.Vector3();

    // ISOLAMENTO 3D: o recorte do laço atua na CÓPIA exclusiva do 3D —
    // os cortes 2D (volumeData) ficam 100% intactos.
    if (!window._volume3D) {
        window._volume3D = volumeData.slice ? volumeData.slice(0) : new Int16Array(volumeData);
    }
    const vol3d = window._volume3D;

    let croppedVoxels = 0;
    const step = 2; // Processa em blocos 2x2x2 para performance

    for (let z = 0; z < volumeMeta.z; z+=step) {
        const normZ = (z / volumeMeta.z) - 0.5;
        for (let y = 0; y < volumeMeta.y; y+=step) {
            const normY = (y / volumeMeta.y) - 0.5;
            for (let x = 0; x < volumeMeta.x; x+=step) {
                const normX = (x / volumeMeta.x) - 0.5;
                
                vec.set(normX, normY, normZ);
                vec.applyMatrix4(volumeMesh.matrixWorld); 
                vec.applyMatrix4(projMatrix);

                if (vec.z > 1 || vec.z < -1) continue; 

                const screenX = Math.round((vec.x + 1) * W / 2);
                const screenY = Math.round((-vec.y + 1) * H / 2);

                if (screenX >= 0 && screenX < W && screenY >= 0 && screenY < H) {
                    const idx = (screenY * W + screenX) * 4;
                    // Se o pixel na máscara é PRETO (fora do laço), apaga o voxel correspondente
                    if (maskData[idx] > 128) { 
                        for(let dz=0; dz<step; dz++) {
                            for(let dy=0; dy<step; dy++) {
                                for(let dx=0; dx<step; dx++) {
                                    if(z+dz < volumeMeta.z && y+dy < volumeMeta.y && x+dx < volumeMeta.x) {
                                        vol3d[(z+dz)*volumeMeta.x*volumeMeta.y + (y+dy)*volumeMeta.x + (x+dx)] = -1000;
                                        croppedVoxels++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    console.log(`Recorte 3D: ${croppedVoxels} voxels limpos.`);

    // Recria a textura 3D com os voxels apagados
  if (volumeMesh && volumeMesh.material) {
    const oldTex = volumeMesh.material.uniforms.uVolume.value;
    const newTex = createVolumeTexture();
    volumeMesh.material.uniforms.uVolume.value = newTex;
    volumeMesh.material.uniformsNeedUpdate = true;

    try {
        if (oldTex && oldTex !== newTex && typeof oldTex.dispose === 'function') {
            oldTex.dispose();
        }
    } catch (e) {}
}

try {
    if (renderer3D && scene3D && camera3D) {
        renderer3D.render(scene3D, camera3D);
    }
} catch (e) {}

toggle3DScissor();

}


// ---- Inicialização ----
async function init3DRender() {
    if (window._loadingMeshFile) return;

    if (
        typeof isEndoBigVolumeMode === 'function' &&
        isEndoBigVolumeMode() &&
        window.EndoSliceBigVolume &&
        !window.EndoSliceBigVolume.threeDUserRequested
    ) {
        showEndoBigVolumeNotice(
            '3D bloqueado inicialmente no modo seguro. Toque novamente em 3D e confirme para carregar sob demanda.'
        );
        switchTab('axial', document.querySelector('.dock-item'));
        return;
    }

    window._isMeshMode = false;
    window._meshMat    = null;
    meshModeRestorePanel();
    dispose3D();

    // CORREÇÃO: Bloco de validação de dados mais robusto
    if (!volumeData || volumeData.length === 0) {
        if (mainStackIds.length === 0) {
            // Se não há imagens carregadas, não há o que fazer.
            console.warn("3D: Nenhuma imagem DICOM carregada para construir o volume.");
            switchTab('axial', document.querySelector('.dock-item')); // Volta para a aba inicial
            return;
        }
        
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'flex';
        
        try {
            await buildVolumeMobile();
        } catch (error) {
            console.error("Falha crítica ao construir o volume 3D:", error);
            if (loading) loading.style.display = 'none';
            alert("Erro ao processar os dados do exame para a visualização 3D. Verifique a integridade dos arquivos.");
            switchTab('axial', document.querySelector('.dock-item'));
            return;
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    // GUARDA DE SEGURANÇA: Se após a tentativa de construção o volume ainda for inválido, interrompe.
    if (!volumeData || volumeData.length === 0) {
        console.error("3D: A construção do volume não resultou em dados válidos.");
        return;
    }

    const container = document.getElementById('vrContainerMobile');
    if (!container) return;

    const canvas  = document.createElement('canvas');
    // preserveDrawingBuffer:true é OBRIGATÓRIO para toDataURL funcionar no WebGL (print 3D)
    const context = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!context) { 
        alert("WebGL2 não é suportado neste dispositivo. A renderização 3D não pode ser iniciada."); 
        return; 
    }

    renderer3D = new THREE.WebGLRenderer({ canvas, context, antialias: true, preserveDrawingBuffer: true });
    renderer3D.setClearColor(0x000000, 1);
    const w = container.clientWidth  || window.innerWidth;
    const renderArea = document.getElementById('vr3d-render-area');
    const h = (renderArea && renderArea.clientHeight > 10)
        ? renderArea.clientHeight
        : (container.clientHeight > 10
            ? container.clientHeight
            : Math.round(window.innerHeight * 0.56));
    renderer3D.setSize(w, h);
    
    const isLargeVol = (volumeMeta.x * volumeMeta.y * volumeMeta.z) > 80000000;
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, isLargeVol ? 1.5 : 2.0));
    container.appendChild(renderer3D.domElement);

    scene3D  = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera3D.position.set(0, 0, 2.3);
    camera3D.up.set(0, 1, 0);

    window._vrScene  = scene3D;
    window._vrCamera = camera3D;

    controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
    controls3D.enableDamping = true;
    controls3D.dampingFactor = 0.08;

    const texture = createVolumeTexture();
    const defaultSteps = isLargeVol ? 280.0 : 420.0;
    
    // ShaderMaterial permanece o mesmo, foi omitido por brevidade
const material = new THREE.ShaderMaterial({
        uniforms: {
            uVolume:       { value: texture },
            uSteps:        { value: defaultSteps },
            uMode:         { value: 0 }, 
            uT1:           { value: 0.20 }, uT2: { value: 0.40 }, uT3: { value: 0.66 }, 
            uLight:        { value: 1.1 }, uDensityScale: { value: 1.1 },
            uMipThresh:    { value: 0.26 }, uMipSoft: { value: 0.09 },
            uMipLow:       { value: new THREE.Vector3(0.0, 0.0, 0.0) },
            uMipHigh:      { value: new THREE.Vector3(1.0, 1.0, 1.0) },
            uRealT1:       { value: 0.17 }, uRealT2: { value: 0.26 },
            uRealT3:       { value: 0.43 }, uRealT4: { value: 0.57 },
            uE2Hard:       { value: 0.29 }, uE2Canal: { value: 0.05 }, uE2Dentin: { value: 0.20 },
            uCinT1:        { value: 0.13 }, uCinT2: { value: 0.24 },
            uCinT3:        { value: 0.41 }, uCinT4: { value: 0.57 },
            uR2Pulp:       { value: 0.04 }, uR2T1: { value: 0.16 },
            uR2T2:         { value: 0.26 }, uR2T3: { value: 0.42 }, uR2T4: { value: 0.56 },
            uSmooth:       { value: 2.0 },
            uMipHighOnly:  { value: 0.0 },
            uNoiseFloor:   { value: 0.0 },
            uNoiseThresh:  { value: 0.004 },
            uSmoothT1:     { value: 0.24 },
            uSmoothT2:     { value: 0.48 }
        },
        vertexShader:   vertexShaderVR,
        fragmentShader: fragmentShaderVR,
        side:           THREE.BackSide,
        transparent:    true,
        glslVersion:    THREE.GLSL3
    });

    volumeMesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), material);

    const physX  = volumeMeta.x * volumeMeta.pixelSpacing;
    const physY  = volumeMeta.y * volumeMeta.pixelSpacing;
    const physZ  = volumeMeta.z * volumeMeta.sliceThickness;
    const maxDim = Math.max(physX, physY, physZ);
    volumeMesh.scale.set(physX/maxDim, physY/maxDim, physZ/maxDim);
    volumeMesh.rotation.x = -Math.PI / 2;
    scene3D.add(volumeMesh);

    setVRPreset('bone');
    is3DInitialized = true;
    animate3D();
    window.addEventListener('resize', on3DWindowResize, false);
    
    if (implantState.volX !== null && typeof _implantSyncTo3D === 'function') {
        _implantSyncTo3D();
    }
    // Mostra painel de implante 3D se houver implante salvo
    setTimeout(_updateImpl3DPanel, 300);
}


// Aplica box filter 3D 3×3×3 no volume para remover ruído CBCT
// radius=1 = vizinhos imediatos (suave), radius=2 = mais agressivo
function _denoise3DVolume(radius) {
    if (!volumeData || !volumeMeta) return;
    const { x: W, y: H, z: D } = volumeMeta;
    const out = new Int16Array(volumeData.length);
    const r = radius || 1;

    for (let z = 0; z < D; z++) {
        for (let y = 0; y < H; y++) {
            for (let xi = 0; xi < W; xi++) {
                let sum = 0, count = 0;
                for (let dz = -r; dz <= r; dz++) {
                    const zz = Math.max(0, Math.min(D-1, z+dz));
                    for (let dy = -r; dy <= r; dy++) {
                        const yy = Math.max(0, Math.min(H-1, y+dy));
                        for (let dx = -r; dx <= r; dx++) {
                            const xx = Math.max(0, Math.min(W-1, xi+dx));
                            sum += volumeData[zz*W*H + yy*W + xx];
                            count++;
                        }
                    }
                }
                out[z*W*H + y*W + xi] = Math.round(sum / count);
            }
        }
    }
    volumeData = out;
    console.log('[3D] Denoising aplicado, raio=' + r);
}

// ---- Textura 3D com normalização HU FIXO ----
// Range fixo -500..+3000 HU garante que todos os scanners CBCT
// mapeiem osso e esmalte sempre nos mesmos buckets 0..1
function createVolumeTexture() {
    const HU_MIN   = -500;
    const HU_RANGE = 3500;  // -500 → +3000

  const size = volumeMeta.x * volumeMeta.y * volumeMeta.z;
const data = new Uint8Array(size);
// ISOLAMENTO 3D: a textura lê do volume exclusivo do 3D quando ele existe
// (Ruído/Laço mutam só a cópia; os cortes 2D continuam lendo volumeData puro)
const src = (window._volume3D || volumeData);
for (let i = 0; i < size; i++) {
    const v = (src[i] - HU_MIN) / HU_RANGE;

    data[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
}
    
    // Para volumes muito grandes, limita a resolução para não OOM na GPU
    let texX = volumeMeta.x, texY = volumeMeta.y, texZ = volumeMeta.z;
    let texData = data;
    const GPU_LIMIT = 512; // limite máximo de dimensão em cada eixo para mobile
    
if (texX > GPU_LIMIT || texY > GPU_LIMIT || texZ > GPU_LIMIT) {
    const scX = texX > GPU_LIMIT ? 2 : 1;
    const scY = texY > GPU_LIMIT ? 2 : 1;
    const scZ = texZ > GPU_LIMIT ? 2 : 1;
    const nX = Math.ceil(texX / scX);
    const nY = Math.ceil(texY / scY);
    const nZ = Math.ceil(texZ / scZ);
    const down = new Uint8Array(nX * nY * nZ);  // 8-bit: casa com UnsignedByteType da textura
    for (let z = 0; z < nZ; z++) {
        for (let y = 0; y < nY; y++) {
            for (let x = 0; x < nX; x++) {
                // Média 2x2x2 em vez de nearest-neighbor
                let sum = 0, count = 0;
                for (let dz = 0; dz < scZ; dz++) {
                    for (let dy = 0; dy < scY; dy++) {
                        for (let dx = 0; dx < scX; dx++) {
                            const sx = Math.min(x * scX + dx, texX - 1);
                            const sy = Math.min(y * scY + dy, texY - 1);
                            const sz = Math.min(z * scZ + dz, texZ - 1);
                            sum += data[sz * texX * texY + sy * texX + sx];
                            count++;
                        }
                    }
                }
                down[z * nX * nY + y * nX + x] = Math.round(sum / count);
            }
        }
    }
    texX = nX; texY = nY; texZ = nZ;
    texData = down;
}
    
const tex = new THREE.DataTexture3D(texData, texX, texY, texZ);
tex.format          = THREE.RedFormat;
tex.type            = THREE.UnsignedByteType;
tex.minFilter       = THREE.LinearFilter;
tex.magFilter       = THREE.LinearFilter;
tex.generateMipmaps = false;
tex.unpackAlignment = 1;
tex.needsUpdate     = true;
    return tex;
}

// ---- 3 PRESETS CLÍNICOS ----
// ============================================================
// MODO MALHA (STL/PLY/OBJ) — controle de material via sliders existentes
// ============================================================

// Paletas de cor para malhas 3D
const MESH_PALETTES = [
    { name: '🦴 Osso',    hex: 0xe8d8b0, rough: 0.55, metal: 0.05 },
    { name: '🦷 Dente',   hex: 0xf5f0e8, rough: 0.30, metal: 0.00 },
    { name: '🩸 Tecido',  hex: 0xc06050, rough: 0.70, metal: 0.00 },
    { name: '🔵 Azul',    hex: 0x4488cc, rough: 0.35, metal: 0.20 },
    { name: '🟢 Verde',   hex: 0x44aa66, rough: 0.40, metal: 0.10 },
    { name: '⬛ Cinza',   hex: 0x888888, rough: 0.50, metal: 0.30 },
    { name: '🟡 Ouro',    hex: 0xd4a830, rough: 0.25, metal: 0.80 },
    { name: '⬜ Branco',  hex: 0xf8f8f8, rough: 0.20, metal: 0.05 },
    { name: '🖤 Flat',    hex: 0xd0c8b8, rough: 1.00, metal: 0.00, flat: true },
];
let _meshPaletteIdx = 0;

// Adapta o painel 3D para modo malha:
// - Troca labels dos sliders
// - Injeta linha de paletas de cor acima dos presets de volume
// - Esconde presets de volume irrelevantes
function meshModeAdaptPanel() {
    const panel = document.getElementById('vrPresetsPanel');
    if (!panel) return;

    // Injeta bloco de controle de malha se não existir
    if (!document.getElementById('mesh-controls-block')) {
        const block = document.createElement('div');
        block.id = 'mesh-controls-block';
        block.style.cssText = 'margin-bottom:6px;';
        block.innerHTML = `
            <div style="font-size:8px;font-weight:800;color:#0af;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px;text-align:center;">
                🗿 MODO MALHA 3D
            </div>
            <!-- Paletas de cor -->
            <div id="mesh-palette-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">
                ${MESH_PALETTES.map((p, i) => `
                    <button onclick="setMeshPalette(${i})"
                        ontouchend="setMeshPalette(${i});event.preventDefault();"
                        id="mesh-pal-${i}"
                        title="${p.name}"
                        style="flex:1;min-width:36px;min-height:40px;border-radius:8px;
                               border:2px solid ${i===0?'#0af':'#444'};
                               background:${p.flat?'#1a1a2e':p.name.includes('Osso')?'#e8d8b0':p.name.includes('Dente')?'#f5f0e8':p.name.includes('Tecido')?'#c06050':p.name.includes('Azul')?'#4488cc':p.name.includes('Verde')?'#44aa66':p.name.includes('Cinza')?'#888888':p.name.includes('Ouro')?'#d4a830':'#f8f8f8'};color:${p.flat?'#ddd':'inherit'};
                               cursor:pointer;font-size:12px;padding:2px;
                               touch-action:manipulation;" >
                        ${p.name.split(' ')[0]}
                    </button>`).join('')}
            </div>
        `;
        panel.insertBefore(block, panel.firstChild);
    }

    // Atualiza labels dos 3 sliders existentes
    const rowLabels = panel.querySelectorAll('.vr-slider-label');
    if (rowLabels[0]) rowLabels[0].textContent = 'Brilho';
    if (rowLabels[1]) rowLabels[1].textContent = 'Opacidade';
    if (rowLabels[2]) rowLabels[2].textContent = 'Rugos.';

    // Ajusta ranges para modo malha
    const thresh = document.getElementById('thresholdSlider');
    const transp = document.getElementById('transparencySlider');
    const appear = document.getElementById('appearanceSlider');
    const threshLbl = document.getElementById('vr-thresh-label');
    const transpLbl = document.getElementById('vr-transp-label');
    const appearLbl = document.getElementById('vr-appear-label');

    if (thresh) { thresh.min='0'; thresh.max='100'; thresh.step='1'; thresh.value='70'; }
    if (threshLbl) threshLbl.style.color = '#007AFF';
    if (transp) { transp.min='0'; transp.max='1'; transp.step='0.02'; transp.value='1'; }
    if (appear) { appear.min='0'; appear.max='100'; appear.step='1'; appear.value='50'; }

    // Aplica valores iniciais
    updateVRThreshold('70');
    updateVRTransparency('1');
    updateVRAppearance('50');
}

function meshModeRestorePanel() {
    // Remove bloco de controle de malha
    const block = document.getElementById('mesh-controls-block');
    if (block) block.remove();

    // Restaura labels originais
    const panel = document.getElementById('vrPresetsPanel');
    if (!panel) return;
    const rowLabels = panel.querySelectorAll('.vr-slider-label');
    if (rowLabels[0]) rowLabels[0].textContent = 'Corte';
    if (rowLabels[1]) rowLabels[1].textContent = 'Transparência';
    if (rowLabels[2]) rowLabels[2].textContent = 'Suavizar';

    // Restaura ranges originais (sincronizados com os valores do HTML)
    const thresh = document.getElementById('thresholdSlider');
    const transp = document.getElementById('transparencySlider');
    const appear = document.getElementById('appearanceSlider');
    if (thresh) { thresh.min='100'; thresh.max='800'; thresh.step='5'; thresh.value='300'; }
    if (transp) { transp.min='0.2'; transp.max='2.0'; transp.step='0.05'; transp.value='1.0'; }
    if (appear) { appear.min='0'; appear.max='100'; appear.step='1'; appear.value='50'; }
}

function setMeshPalette(idx) {
    _meshPaletteIdx = idx;
    const pal = MESH_PALETTES[idx];
    if (!pal || !window._vrScene) return;

    // Encontra a(s) malha(s) na cena
    const meshes = [];
    window._vrScene.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
    if (!meshes.length) return;

    if (pal.flat) {
        // ── Modo Flat: MeshBasicMaterial sem nenhuma luz ──
        // Desliga todas as luzes da cena
        window._vrScene.traverse(obj => {
            if (obj.isLight) obj.visible = false;
        });
        const flatMat = new THREE.MeshBasicMaterial({
            color: pal.hex,
            side: THREE.DoubleSide,
        });
        meshes.forEach(m => {
            if (m.material) m.material.dispose();
            m.material = flatMat;
        });
        window._meshMat = flatMat;
        window._meshFlatMode = true;
    } else {
        // ── Modo Standard: MeshStandardMaterial com luzes ──
        // Religa as luzes
        window._vrScene.traverse(obj => {
            if (obj.isLight) obj.visible = true;
        });
        const stdMat = new THREE.MeshStandardMaterial({
            color: pal.hex,
            roughness: pal.rough,
            metalness: pal.metal,
            side: THREE.DoubleSide,
        });
        meshes.forEach(m => {
            if (m.material) m.material.dispose();
            m.material = stdMat;
        });
        window._meshMat = stdMat;
        window._meshFlatMode = false;
    }

    // Destaca botão ativo
    MESH_PALETTES.forEach((_, i) => {
        const btn = document.getElementById('mesh-pal-' + i);
        if (btn) btn.style.borderColor = (i === idx) ? '#0af' : '#333';
    });
}



function setVRPreset(type) {
    if (!volumeMesh) return;
    currentPreset3D = type;
    const u = volumeMesh.material.uniforms;

    document.querySelectorAll('.vr-preset-btn').forEach(b => b.classList.remove('vr-active'));
    const ab = document.getElementById('vr-btn-' + type);
    if (ab) ab.classList.add('vr-active');

    const slider = document.getElementById('thresholdSlider');
    const label  = document.getElementById('vr-thresh-label');

    function resetExtraSliders(transpVal, appearVal) {
        const ts = document.getElementById('transparencySlider');
        const as_ = document.getElementById('appearanceSlider');
        const tl = document.getElementById('vr-transp-label');
        const al = document.getElementById('vr-appear-label');
        if (ts)  ts.value  = transpVal;
        if (tl)  tl.innerText = parseFloat(transpVal).toFixed(2);
        // Sincroniza o Suavizar com o uSmooth REAL do preset (inverso da curva
        // quadrática) — assim o primeiro toque no slider não dá "salto" visual.
        var pos = appearVal;
        try {
            var isMip = (type === 'endoBW' || type === 'endoRed' || type === 'endo2' || type === 'canalReveal');
            var tt;
            if (isMip) {
                tt = (u.uMipSoft.value - 0.02) / 0.24;            // inverso do Suavizar MIP
            } else {
                tt = Math.sqrt(Math.max(0, (u.uSmooth.value - 0.6) / 13.4)); // inverso da curva DVR
            }
            pos = Math.round(Math.max(0, Math.min(100, tt * 100)));
        } catch(e) {}
        if (as_) as_.value = pos;
        if (al)  al.innerText = Math.round(pos);
    }

    if (type === 'bone') {
        u.uMode.value = 0; u.uT1.value = 0.22; u.uT2.value = 0.40; u.uT3.value = 0.66;
        u.uLight.value = 1.1; u.uDensityScale.value = 1.0; u.uSmooth.value = 2.5; u.uSteps.value = 220.0;
        if (slider) slider.value = 300; if (label) label.innerText = '38%';
        resetExtraSliders(1.0, 50);
    } else if (type === 'endoBW') {
        u.uMode.value = 1; u.uMipThresh.value = 0.26; u.uMipSoft.value = 0.09;
        u.uMipHighOnly.value = 0.0;
        u.uMipLow.value.set(0.10, 0.10, 0.10); u.uMipHigh.value.set(1.0,  1.0,  1.0);
        u.uDensityScale.value = 1.2; u.uSmooth.value = 2.0; u.uSteps.value = 220.0;
        if (slider) slider.value = 450; if (label) label.innerText = '56%';
        resetExtraSliders(1.2, 50);
    } else if (type === 'endoRed') {
        u.uMode.value = 1; u.uMipThresh.value = 0.26; u.uMipSoft.value = 0.09;
        u.uMipHighOnly.value = 0.0;
        u.uMipLow.value.set(0.92, 0.05, 0.05); u.uMipHigh.value.set(1.0,  1.0,  1.0);
        u.uDensityScale.value = 1.0; u.uSmooth.value = 2.0; u.uSteps.value = 220.0;
        if (slider) slider.value = 450; if (label) label.innerText = '56%';
        resetExtraSliders(1.0, 50);
    } else if (type === 'realistic') {
        u.uMode.value = 2; u.uRealT1.value = 0.19; u.uRealT2.value = 0.27; u.uRealT3.value = 0.43; u.uRealT4.value = 0.57;
        u.uLight.value = 1.0; u.uDensityScale.value = 1.0; u.uSmooth.value = 3.0; u.uSteps.value = 240.0;
        if (slider) slider.value = 300; if (label) label.innerText = '38%';
        resetExtraSliders(1.0, 55);
    } else if (type === 'endo2') {
        // ENDO 2 = CÓPIA EXATA do Endo P&B (MIP), trocando o BRANCO por VERMELHO VIVO
        u.uMode.value = 1; u.uMipThresh.value = 0.26; u.uMipSoft.value = 0.09;
        u.uMipHighOnly.value = 1.0;
        u.uMipLow.value.set(0.10, 0.10, 0.10); u.uMipHigh.value.set(1.0, 0.05, 0.03);
        u.uDensityScale.value = 1.2; u.uSmooth.value = 2.0; u.uSteps.value = 220.0;
        if (slider) slider.value = 450; if (label) label.innerText = '56%';
        resetExtraSliders(1.2, 50);
    } else if (type === 'cinematic') {
        u.uMode.value = 4; u.uCinT1.value = 0.14; u.uCinT2.value = 0.25; u.uCinT3.value = 0.41; u.uCinT4.value = 0.57;
        u.uLight.value = 1.0; u.uDensityScale.value = 1.0; u.uSmooth.value = 3.0; u.uSteps.value = 260.0;
        if (slider) slider.value = 300; if (label) label.innerText = '38%';
        resetExtraSliders(1.0, 55);
    } else if (type === 'real2') {
        u.uMode.value = 5; u.uR2Pulp.value = 0.05; u.uR2T1.value = 0.17; u.uR2T2.value = 0.27; u.uR2T3.value = 0.42; u.uR2T4.value = 0.57;
        u.uLight.value = 1.0; u.uDensityScale.value = 1.0; u.uSmooth.value = 3.0; u.uSteps.value = 260.0;
        if (slider) slider.value = 300; if (label) label.innerText = '38%';
        resetExtraSliders(1.0, 55);
    }
        if (type === 'amber') { 
        u.uMode.value = 7; 
        u.uT1.value = 0.16; u.uT2.value = 0.35; u.uT3.value = 0.60;
        u.uLight.value = 1.1; u.uDensityScale.value = 0.85; 
        u.uSmooth.value = 3.5; u.uSteps.value = 240.0;
        if (slider) slider.value = 250; if (label) label.innerText = '30%';
        resetExtraSliders(0.85, 60); 
    } 
    else if (type === 'morita') {
        // i-DIXEL / MORITA VR — osso sépia poroso + esmalte marfim (modo 9).
        // Reusa uRealT1..4 (o slider Corte já funciona). Sem uniforms novos.
        u.uMode.value = 9;
        u.uRealT1.value = 0.17; u.uRealT2.value = 0.27; u.uRealT3.value = 0.45; u.uRealT4.value = 0.60;
        u.uLight.value = 1.05; u.uDensityScale.value = 1.0;
        u.uSmooth.value = 2.0; u.uSteps.value = 300.0;
        if (slider) slider.value = 280; if (label) label.innerText = '35%';
        resetExtraSliders(1.0, 45);
    }
    // === V1 PATCH: Canal Reveal preset ===
    else if (type === 'canalReveal') {
        // checa se há máscara de canal segmentada
        var hasMask = (typeof segState !== 'undefined') && segState && (segState.mask || segState.maskDisplay) && segState.voxelCount > 0;
        if (!hasMask) {
            try { _canalRevealRemoveTube(); } catch(e){}
            // volta para preset bone
            u.uMode.value = 0; u.uT1.value = 0.22; u.uT2.value = 0.40; u.uT3.value = 0.66;
            u.uLight.value = 1.1; u.uDensityScale.value = 1.0; u.uSmooth.value = 2.5; u.uSteps.value = 220.0;
            if (slider) slider.value = 300; if (label) label.innerText = '38%';
            resetExtraSliders(1.0, 50);
            // restaura visual do botão bone
            document.querySelectorAll('.vr-preset-btn').forEach(function(b){ b.classList.remove('vr-active'); });
            var bb = document.getElementById('vr-btn-bone'); if (bb) bb.classList.add('vr-active');
            currentPreset3D = 'bone';
            try { showToast && showToast('Segmente o canal primeiro para ativar Canal Reveal 3D'); } catch(e){ alert('Segmente o canal primeiro para ativar Canal Reveal 3D'); }
            return;
        }
        // Preset volume: osso translúcido (P&B com baixa opacidade)
        u.uMode.value = 1; u.uMipThresh.value = 0.30; u.uMipSoft.value = 0.10;
        u.uMipHighOnly.value = 0.0;
        u.uMipLow.value.set(0.85, 0.85, 0.85); u.uMipHigh.value.set(1.0, 1.0, 1.0);
        u.uDensityScale.value = 0.55;
        u.uSmooth.value = 2.5; u.uSteps.value = 240.0;
        if (slider) slider.value = 380; if (label) label.innerText = '47%';
        resetExtraSliders(0.45, 35);
        // adiciona tube do canal sobre o volume
        try { _canalRevealAddTube(); } catch(e){ window.dlog && window.dlog('[canalReveal addTube]', e); }
    }
    // === FIM V1 PATCH ===
    // se mudou para outro preset, remove tube de canal (se existir)
    if (type !== 'canalReveal') {
        try { _canalRevealRemoveTube(); } catch(e){}
    }
}

// === V1 PATCH: Canal Reveal — adiciona/remove tube na cena 3D principal ===
window._canalRevealMeshes = window._canalRevealMeshes || [];

function _canalRevealRemoveTube() {
    var arr = window._canalRevealMeshes || [];
    if (!arr.length) return;
    try {
        var sceneRef = (typeof scene3D !== 'undefined') ? scene3D
                     : (window._vrScene || null);
        arr.forEach(function(m){
            try {
                // tenta remover do parent direto (volumeMesh ou cena)
                if (m && m.parent) m.parent.remove(m);
                else if (sceneRef && m) sceneRef.remove(m);
                if (m.geometry && typeof m.geometry.dispose === 'function') m.geometry.dispose();
                if (m.material && typeof m.material.dispose === 'function') m.material.dispose();
            } catch(e){}
        });
    } catch(e){}
    window._canalRevealMeshes = [];
}
window._canalRevealRemoveTube = _canalRevealRemoveTube;

function _canalRevealAddTube() {
    if (typeof segState === 'undefined' || !segState || !segState.lastROI) return false;
    var dm = segState.maskDisplay || segState.mask;
    if (!dm) return false;
    if (typeof volumeMesh === 'undefined' || !volumeMesh) {
        window.dlog && window.dlog('[canalReveal] volumeMesh not ready');
        return false;
    }
    if (!volumeMeta || !volumeMeta.x) return false;

    // remove anteriores
    _canalRevealRemoveTube();

    // Construir curva em coords NORMALIZADAS do volumeMesh ([-0.5..+0.5] em cada eixo)
    // O volumeMesh é um BoxGeometry(1,1,1) com escala = (physX/maxDim, physY/maxDim, physZ/maxDim)
    // Ao adicionar o tube como filho do volumeMesh, ele herda escala+rotação automaticamente.
    var W = volumeMeta.x, H = volumeMeta.y, D = volumeMeta.z, WH = W * H;
    var roi = segState.lastROI;
    var ps = volumeMeta.pixelSpacing || 1;
    var st = volumeMeta.sliceThickness || 1;

    // Centroide por slice Z em coord-pixel
    var slices = [];
    for (var gz = roi.z0; gz <= roi.z1; gz++) {
        var sumX = 0, sumY = 0, n = 0;
        for (var gy = roi.y0; gy <= roi.y1; gy++) {
            for (var gx = roi.x0; gx <= roi.x1; gx++) {
                if (dm[gz * WH + gy * W + gx]) { sumX += gx; sumY += gy; n++; }
            }
        }
        if (n > 0) {
            var area = n * ps * ps;
            var rMm = Math.sqrt(area / Math.PI);
            slices.push({ z: gz, cx: sumX/n, cy: sumY/n, n: n, rMm: rMm });
        }
    }
    if (slices.length < 4) {
        showToast && showToast('Canal Reveal: poucos slices · segmente um pouco mais');
        return false;
    }

    // filtra outliers de raio
    var radii = slices.map(function(s){return s.rMm;}).slice().sort(function(a,b){return a-b;});
    var medianR = radii[Math.floor(radii.length/2)];
    var madArr = slices.map(function(s){return Math.abs(s.rMm - medianR);}).sort(function(a,b){return a-b;});
    var madR = madArr[Math.floor(madArr.length/2)] || (medianR * 0.3);
    var clean = slices.filter(function(s){ return s.rMm >= Math.max(0.05, medianR - 2.5*madR) && s.rMm <= medianR + 4.0*madR; });
    if (clean.length < 4) clean = slices;

    // suaviza
    for (var iter = 0; iter < 2; iter++) {
        var copy = clean.map(function(p){return {z:p.z, cx:p.cx, cy:p.cy, rMm:p.rMm};});
        for (var i = 1; i < clean.length-1; i++) {
            clean[i].cx = (copy[i-1].cx + copy[i].cx + copy[i+1].cx)/3;
            clean[i].cy = (copy[i-1].cy + copy[i].cy + copy[i+1].cy)/3;
            clean[i].rMm = (copy[i-1].rMm + copy[i].rMm + copy[i+1].rMm)/3;
        }
    }

    // Converte para coords normalizadas do volumeMesh:
    // BoxGeometry vai de -0.5..+0.5 nos 3 eixos (antes da escala/rotação do mesh)
    // Texture mapping: voxel (gx,gy,gz) ↔ posição local (gx/(W-1) - 0.5, gy/(H-1) - 0.5, gz/(D-1) - 0.5)
    // (a rotação do volumeMesh é aplicada no nível do mesh, então o filho herda automaticamente)
    var pts3D = clean.map(function(p){
        return new THREE.Vector3(
            (p.cx / Math.max(1, W-1)) - 0.5,
            (p.cy / Math.max(1, H-1)) - 0.5,
            (p.z  / Math.max(1, D-1)) - 0.5
        );
    });

    var curve = new THREE.CatmullRomCurve3(pts3D, false, 'catmullrom', 0.5);

    // Raio em coords normalizadas: r_mm escalado para fração de "1 unidade" do BoxGeometry.
    // Como volumeMesh.scale.x = physX/maxDim, a unidade local em x equivale a (physX/maxDim) em mundo.
    // Para um raio em mm aparecer com tamanho coerente em mundo:
    //   r_world = r_local * scale_local
    // Como pixelSpacing pode diferir entre x e y, escolhemos uma média conservadora:
    var maxDim = Math.max(W*ps, H*ps, D*st);
    var rMmAvg = (function(){ var s=0; for (var k=0;k<clean.length;k++) s+=clean[k].rMm; return Math.max(0.15, s/clean.length); })();
    // Como a escala local é diferente em cada eixo, o tube vai parecer "achatado" em qualquer plano
    // que seja anisotropico. Usamos a unidade média = r_local = r_mm / (média ponderada por eixo).
    // Aproximação prática: r_local = r_mm / maxDim  → tubo aparece consistente quando vols isotrópicos
    var rLocal = rMmAvg / maxDim * 0.95; // leve afinamento para fitar bem

    var tubularSegments = Math.max(40, Math.min(160, clean.length * 4));
    var tubeGeo;
    try { tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, rLocal, 12, false); }
    catch(e){ window.dlog && window.dlog('[canalReveal tube]', e); return false; }

    // Material
    var isObtur = (segState.activeMode === 'obturado');
    var mat;
    if (isObtur) {
        mat = new THREE.MeshStandardMaterial({
            color: 0xffaa44, emissive: 0x553311, emissiveIntensity: 0.55,
            metalness: 0.55, roughness: 0.28, side: THREE.DoubleSide,
            transparent: true, opacity: 0.95
        });
    } else {
        mat = new THREE.MeshStandardMaterial({
            color: 0x66e3d5, emissive: 0x12504a, emissiveIntensity: 0.6,
            metalness: 0.15, roughness: 0.45, side: THREE.DoubleSide,
            transparent: true, opacity: 0.92
        });
    }
    var tube = new THREE.Mesh(tubeGeo, mat);
    tube.renderOrder = 999;
    // adiciona como FILHO do volumeMesh — herda rotação e escala
    volumeMesh.add(tube);
    window._canalRevealMeshes.push(tube);

    // Ápice destacado
    try {
        var endPt = curve.getPoint(1);
        var apicalGeo = new THREE.SphereGeometry(rLocal * 1.2, 16, 16);
        var apicalMat = new THREE.MeshStandardMaterial({
            color: isObtur ? 0xffd066 : 0xa8fff0,
            emissive: isObtur ? 0x886622 : 0x224444,
            emissiveIntensity: 0.85,
            transparent: true, opacity: 0.95
        });
        var apicalMesh = new THREE.Mesh(apicalGeo, apicalMat);
        apicalMesh.position.copy(endPt);
        apicalMesh.renderOrder = 1000;
        volumeMesh.add(apicalMesh);
        window._canalRevealMeshes.push(apicalMesh);
    } catch(e){}

    // Luz de cena (na cena, não no volumeMesh) para destacar o tube
    try {
        var sceneRef = (typeof scene3D !== 'undefined') ? scene3D : (window._vrScene || null);
        if (sceneRef) {
            var rim = new THREE.PointLight(isObtur ? 0xff9933 : 0x66ffe5, 0.7, 4);
            rim.position.set(0.6, 0.6, 0.8);
            rim.userData.canalReveal = true;
            sceneRef.add(rim);
            window._canalRevealMeshes.push(rim);
        }
    } catch(e){}

    showToast && showToast('🩻 Canal Reveal ativado');
    return true;
}
window._canalRevealAddTube = _canalRevealAddTube;
// === FIM V1 PATCH Canal Reveal ===



// ---- Loop de animação ----
function animate3D() {
    if (animationId3D) {
        cancelAnimationFrame(animationId3D);
    }
    const tab = document.getElementById('tab-3d');
    // Se a aba não estiver visível, o loop dorme para poupar bateria
    if (!tab || tab.style.display === 'none' || !is3DInitialized) return;
    
    if (controls3D) controls3D.update();
    if (renderer3D && scene3D && camera3D) renderer3D.render(scene3D, camera3D);
    
    // Mantém rodando
    animationId3D = requestAnimationFrame(animate3D);
}

function on3DWindowResize() {
    if (!camera3D || !renderer3D) return;
    const container = document.getElementById('vrContainerMobile');
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const renderArea = document.getElementById('vr3d-render-area');
    const h = (renderArea && renderArea.clientHeight > 10)
        ? renderArea.clientHeight
        : Math.round(window.innerHeight * 0.56);
    camera3D.aspect = w / h;
    camera3D.updateProjectionMatrix();
    renderer3D.setSize(w, h);
}



// thicknessState: declarado e gerenciado acima

// ============================================================
// SISTEMA DE FILTROS — CANVAS OVERLAY (100% SAFARI iOS)
//
// Por que canvas.style.filter FALHA no Safari iOS:
//   O Cornerstone usa will-change:transform no canvas, criando uma
//   GPU compositing layer. No Safari iOS, filter:url(#svg-*) e
//   até alguns CSS filters são ignorados nessa camada.
//
// Solução — Canvas Overlay:
//   1. Cria um <canvas> overlay sobre cada viewport do Cornerstone.
//   2. Ao evento IMAGE_RENDERED, copia o canvas via ctx.drawImage()
//      com ctx.filter="brightness() contrast()".
//      → Esse filtro é aplicado PELO CPU/software, não pelo compositor,
//        por isso funciona no Safari iOS.
//   3. Sharpening via convolução 3×3 em ImageData puro JS.
//      → Zero dependência de SVG, funciona em absolutamente tudo.
// ============================================================

// ================================================================
// SISTEMA DE FILTROS v8
// Ambiente/Gamma: CSS filter direto no canvas do Cornerstone.
// Funciona no Safari iOS sem overlay, sem rAF, sem IMAGE_RENDERED.
// Sharp/Fine: overlay canvas com convolução JS.
// ================================================================

const _fs = { sharp:0, fine:0, bright:1.0, contrast:1.0 };
const _ovMap = {};
const _vpIds = ['axial-viewport','endo-axial','endo-coronal','endo-sagittal','modal-viewport'];

const _kernel = (s,f) => {
    // Coeficientes reduzidos: Sharp menos agressivo (0.55 em vez de 1.0),
    // Fine mais suave (0.08 em vez de 0.20). Resultado: nitidez útil sem halos.
    var e = -s * 0.55 - f * 0.08;
    var d = -f * 0.06;
    var c = 1 - 4*e - 4*d;
    return [d,e,d, e,c,e, d,e,d];
};

function _conv(id, k) {
    var src=new Uint8ClampedArray(id.data), d=id.data, W=id.width, H=id.height;
    for (var y=1;y<H-1;y++) for (var x=1;x<W-1;x++) {
        var r=0,g=0,b=0;
        for (var ky=-1;ky<=1;ky++) for (var kx=-1;kx<=1;kx++) {
            var kv=k[(ky+1)*3+(kx+1)], i=((y+ky)*W+(x+kx))*4;
            r+=src[i]*kv; g+=src[i+1]*kv; b+=src[i+2]*kv;
        }
        var j=(y*W+x)*4;
        d[j]=r<0?0:r>255?255:r; d[j+1]=g<0?0:g>255?255:g;
        d[j+2]=b<0?0:b>255?255:b; d[j+3]=src[j+3];
    }
}

// BUG 2 FIX: Filtros NUNCA aplicados no canvas fonte do Cornerstone.
// Aplicar CSS filter no canvas Cornerstone cria GPU compositing layer no
// iOS Safari que bloqueia eventos de toque do Wwwc (brilho/contraste).
// SOLUÇÃO: toda filtragem (bright+contrast+sharp+fine) vai no overlay canvas
// (pointer-events:none) — não interfere com o toque.
function _applyCSSFilter(el) {
    // Garante que o canvas fonte está sempre limpo de CSS filters
    var cs = el.querySelector('canvas:not([data-ov])');
    if (cs) { cs.style.filter = 'none'; cs.style.webkitFilter = 'none'; }
    // A pintura real é feita em _paintAllFilters(), chamada via hook
}

// Overlay canvas — para TODOS os filtros (bright+contrast+sharp+fine)
function _ov(el) {
    if (_ovMap[el.id]) return _ovMap[el.id];
    var ov = document.createElement('canvas');
    ov.setAttribute('data-ov','1');
    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:6;';
    el.style.position = 'relative';
    el.appendChild(ov);
    _ovMap[el.id] = ov;
    return ov;
}

// Pinta brightness+contrast+sharp+fine no overlay em uma única passagem
function _paintAllFilters(el) {
    var csCanvas = el.querySelector('canvas:not([data-ov])');
    if (!csCanvas || csCanvas.width === 0) return;

    var ov = _ovMap[el.id];
    if (!ov) {
        ov = document.createElement('canvas');
        ov.setAttribute('data-ov', '1');
        ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
        el.style.position = 'relative';
        el.appendChild(ov);
        _ovMap[el.id] = ov;
    }

    // FIX FAIXA/PRINT: comparar AMBAS as dimensões — o resize do EndoFocus muda
    // principalmente a ALTURA; comparando só width, o bitmap ficava com a altura
    // antiga e o CSS height:100% o esticava (faixa na tela, camada distorcida no print).
    if (ov.width !== csCanvas.width || ov.height !== csCanvas.height) {
        ov.width = csCanvas.width; ov.height = csCanvas.height;
    }

    var ctx = ov.getContext('2d');
    ctx.clearRect(0, 0, ov.width, ov.height);

    // Sem ajustes ativos? Overlay fica TRANSPARENTE (o canvas fonte aparece
    // por baixo, idêntico) — elimina a classe inteira de "imagem fantasma"
    // quando o viewport é redimensionado com filtros neutros.
    var needsPixelWork = (_fs.bright !== 1.0 || _fs.contrast !== 1.0 || _fs.sharp > 0 || _fs.fine > 0);
    if (!needsPixelWork) return;

    // Copia imagem fonte para o overlay
    ctx.drawImage(csCanvas, 0, 0);

    if (needsPixelWork) {
        var idata = ctx.getImageData(0, 0, ov.width, ov.height);
        var d = idata.data;

        // 1. Brightness + Contrast (manual, sem ctx.filter)
        if (_fs.bright !== 1.0 || _fs.contrast !== 1.0) {
            var br = _fs.bright;
            var co = _fs.contrast;
            for (var i = 0; i < d.length; i += 4) {
                // Brightness: multiplicar
                var r = d[i] * br;
                var g = d[i+1] * br;
                var b = d[i+2] * br;
                // Contrast: expandir/comprimir em torno de 128
                r = (r - 128) * co + 128;
                g = (g - 128) * co + 128;
                b = (b - 128) * co + 128;
                d[i]   = r < 0 ? 0 : r > 255 ? 255 : r;
                d[i+1] = g < 0 ? 0 : g > 255 ? 255 : g;
                d[i+2] = b < 0 ? 0 : b > 255 ? 255 : b;
            }
        }

        // 2. Sharp + Fine (convolução)
        if (_fs.sharp > 0 || _fs.fine > 0) {
            _conv(idata, _kernel(_fs.sharp, _fs.fine));
        }

        ctx.putImageData(idata, 0, 0);
    }
}

// _paintSharp é mantida para compatibilidade mas delega para _paintAllFilters
function _paintSharp(el) { _paintAllFilters(el); }

function _hook(el) {
    if (el._ovHooked) return;
    el._ovHooked = true;
    el.addEventListener('cornerstoneimagerendered', function() {
        // BUG 2 FIX: _applyCSSFilter agora só limpa o canvas fonte.
        // _paintAllFilters faz TUDO no overlay canvas (pointer-events:none).
        _applyCSSFilter(el);
        requestAnimationFrame(function(){ _paintAllFilters(el); });
    });
}

// SISTEMA DE FILTROS V9 - SINCRONIZADO COM DICOM


function updateFilters() {
    const isModalOpen = document.getElementById('modal-zoom') && document.getElementById('modal-zoom').style.display === 'flex';

    if (isModalOpen) {
        // Se o modal estiver aberto, captura e preserva os valores dos sliders do próprio modal
        const fineEl = document.getElementById('modal-fine-slider');
        const sharpEl = document.getElementById('modal-sharp-slider');
        if (fineEl && sharpEl) {
            _fs.fine = parseFloat(fineEl.value);
            _fs.sharp = parseFloat(sharpEl.value);
        }
        // Ambiente e Brilho continuam herdando do fundo
    } else {
        // Se o modal estiver fechado, lê do painel lateral esquerdo
        const inputs = document.querySelectorAll('.settings-container input[type="range"]');
        if (inputs.length < 4) return;

        const sv = parseFloat(inputs[0].value); // NITIDEZ
        const fv = parseFloat(inputs[1].value); // FINE
        const av = parseFloat(inputs[2].value); // AMBIENTE (BRIGHTNESS)
        const tv = parseFloat(inputs[3].value); // GAMMA/LUZ (CONTRAST)

        const spans = document.querySelectorAll('.settings-container .widget-info span');
        if (spans.length >= 4) {
            spans[0].innerText = sv.toFixed(1); spans[1].innerText = fv;
            spans[2].innerText = av.toFixed(1); spans[3].innerText = tv.toFixed(1) + ' mm';
        }

        _fs.sharp = sv; _fs.fine = fv; _fs.bright = av;
        _fs.contrast = 1.0 + (tv * 0.5);
    }

    _vpIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!el._filterHooked) {
            el.addEventListener('cornerstoneimagerendered', function() {
                _applyCSSFilter(el);
                requestAnimationFrame(function() { _paintAllFilters(el); });
            });
            el._filterHooked = true;
        }
        // Tenta via Cornerstone; se não houver imagem, repinta o overlay diretamente
        let csFired = false;
        try {
            const enabled = cornerstone.getEnabledElements().some(e => e.element === el);
            if (enabled) { cornerstone.updateImage(el); csFired = true; }
        } catch(e) {}
        if (!csFired) requestAnimationFrame(function() { _paintAllFilters(el); });
    });
}

document.querySelectorAll('.settings-container input[type="range"]').forEach(input => {
    input.addEventListener('input', updateFilters);
});

function _updateModalFilters() {
    const fineVal = parseFloat(document.getElementById('modal-fine-slider').value);
    const sharpVal = parseFloat(document.getElementById('modal-sharp-slider').value);
    
    // Atualiza as variáveis globais de filtro
    _fs.fine = fineVal;
    _fs.sharp = sharpVal;
    
    // Dispara a repintura no viewport do modal
    const el = document.getElementById('modal-viewport');
    if (el) {
        requestAnimationFrame(function() { _paintAllFilters(el); });
    }
}



var currentActiveTool = null;

// Ferramenta 1: ZOOM POR ARRASTO (Deslizar para dar zoom)
function toggleZoomMode() {
    const btn = document.getElementById('btn-tool-zoom');
    const viewports = ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal', 'pan-pano-viewer', 'pan-mini-viewer'];
    
    resetToolButtons(); // Desliga outras ferramentas
    
    if (currentActiveTool === 'Zoom') {
        currentActiveTool = null;
        btn.classList.remove('active-tool');
        setActiveDefaultTools(); // Volta para Pan/Scroll padrão
        // Reativa drag de ROI/linhas na panorâmica
        const pv = document.getElementById('pan-pano-viewer');
        if (pv) pv._zoomModeActive = false;
    } else {
        currentActiveTool = 'Zoom';
        btn.classList.add('active-tool');
        
        viewports.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                // Garante que zoom está registrado (pan-pano-viewer pode não ter)
                const enabledEls = cornerstone.getEnabledElements();
                const isEnabled = enabledEls.some(e => e.element === el);
                if (!isEnabled) return;
                cornerstoneTools.setToolActiveForElement(el, 'Zoom', { mouseButtonMask: 1, isTouchActive: true });
            } catch(err) {}
        });
        
        // Flag para panSetupRoiDrag pausar durante zoom (evita conflito de toque)
        const pv = document.getElementById('pan-pano-viewer');
        if (pv) pv._zoomModeActive = true;
    }
}

// Ferramenta 2: LUPA CIRCULAR (2.5x)
function toggleMagnify(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const btn = document.getElementById('btn-tool-lupa');
    const viewports = ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal'];
    
    // 1. Se a ferramenta já estiver ativa, nós a desligamos
    if (currentActiveTool === 'Magnify') {
        currentActiveTool = null;
        if(btn) btn.classList.remove('active-tool');
        resetToolButtons(); // Limpa tudo
        setActiveDefaultTools(); // Volta ao normal
        return;
    }

    // 2. Se não estiver ativa, primeiro limpamos qualquer outra ferramenta (Zoom, Mira, etc)
    resetToolButtons();

    // 3. Ativamos o estado global
    currentActiveTool = 'Magnify';
    if(btn) btn.classList.add('active-tool');

    // 4. Aplicamos a ativação em cada quadrante visível
    viewports.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // CRÍTICO: Força o Cornerstone a reconhecer o tamanho do quadrante no iOS
        cornerstone.resize(el, true);

        // Desativa ferramentas que podem roubar o toque da lupa
        try {
            cornerstoneTools.setToolDisabledForElement(el, 'PanMultiTouch');
            cornerstoneTools.setToolDisabledForElement(el, 'ZoomTouchPinch');
            cornerstoneTools.setToolDisabledForElement(el, 'StackScroll');
            cornerstoneTools.setToolDisabledForElement(el, 'Wwwc');
            cornerstoneTools.setToolDisabledForElement(el, 'Zoom');
        } catch (err) { console.log("Aviso: ferramenta não encontrada no viewport"); }

        // ATIVA A LUPA (Magnify) com prioridade absoluta
        cornerstoneTools.setToolActiveForElement(el, 'Magnify', { 
            mouseButtonMask: 1, 
            isTouchActive: true 
        });
    });

    console.log("Sistema de Magnificação Ativado: 2.5x");
}

// Auxiliar: Reseta o visual dos botões e desativa as ferramentas especiais
function resetToolButtons() {
    // 1. Visual dos botões
    const botoes = ['btn-tool-zoom', 'btn-tool-lupa', 'btn-tool-medida', 'btn-mpr-crosshair', 'btn-mpr-oblique'];
    botoes.forEach(id => {
        const b = document.getElementById(id);
        if(b) b.classList.remove('active-tool');
    });
    // Reseta visual dos botões Neumórficos no Modal
    const btnModalMedida = document.getElementById('btn-modal-lima'); // Corrigindo se necessário
    const btnModalText = document.getElementById('btn-modal-text');
    if (btnModalMedida) btnModalMedida.style.boxShadow = '4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light)';
    if (btnModalText) btnModalText.style.boxShadow = '4px 4px 8px var(--neu-shadow-dark), -4px -4px 8px var(--neu-shadow-light)';

    // 2. Limpeza de TODAS as viewports, incluindo Axial
    const ids = ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        try {
            const isEnabled = cornerstone.getEnabledElements().some(e => e.element === el);
            if (isEnabled) {
                // Desliga Zoom e Lupa
                cornerstoneTools.setToolDisabledForElement(el, 'Zoom');
                cornerstoneTools.setToolDisabledForElement(el, 'Magnify');
                
                // Coloca a régua em modo Passivo (visível mas não editável no reset rápido)
                setLengthReadOnlyForElement(el);

                
                // Limpa os listeners de mira
                el.removeEventListener('touchstart', startCrosshairDrag);
                el.removeEventListener('touchmove', moveCrosshair);
                
                cornerstone.updateImage(el);
            }
        } catch (err) {}
    });
    
    isCrosshairActive = false;
    currentActiveTool = null;

    // CORREÇÃO: reativa o StackScroll (estado padrão) nas viewports do Endo,
    // senão após o reset o dedo não rola nem ajusta contraste (ou inverte).
    ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal'].forEach(function(id){
        var el = document.getElementById(id);
        if (!el) return;
        try {
            if (cornerstone.getEnabledElements().some(function(e){ return e.element === el; })) {
                cornerstoneTools.setToolActiveForElement(el, 'StackScroll', { mouseButtonMask: 1, isTouchActive: true });
                cornerstoneTools.setToolPassiveForElement(el, 'Wwwc');
            }
        } catch(e) {}
    });
    // reflete o botão Stack/Scroll no estado "scroll"
    document.querySelectorAll('.vp-mode-btn').forEach(function(b){
        b.classList.remove('mode-wwwc'); b.classList.add('mode-scroll');
    });

}

function setLengthReadOnlyForElement(el) {
    if (!el) return;
    try {
        cornerstoneTools.setToolEnabledForElement(el, 'Length');
    } catch (enabledError) {
        try {
            cornerstoneTools.setToolPassiveForElement(el, 'Length');
        } catch (passiveError) {}
    }
}

function clearAllMeasurements() {
    if (typeof window.clearLengthMeasurementStore === 'function') {
        try { window.clearLengthMeasurementStore(); } catch (e) {}
    }

    const ids = ['axial-viewport', 'endo-axial', 'endo-coronal', 'endo-sagittal', 'modal-viewport'];
    ids.forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        try {
            cornerstoneTools.clearToolState(el, 'Length');
            cornerstone.updateImage(el);
        } catch (e) {}
    });

    indiceCorGlobal = 0;
}

function setActiveDefaultTools() {
    const viewports = [
        'axial-viewport',
        'endo-axial',
        'endo-coronal',
        'endo-sagittal',
        'pan-pano-viewer',
        'pan-mini-viewer'
    ];

    document.querySelectorAll('.pan-cut-item').forEach(function(el) {
        viewports.push(el);
    });

    viewports.forEach(function(idOrEl) {
        const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return;

        try {
            cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {});
        } catch (e) {}

        try {
            cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {});
        } catch (e) {}

        setLengthReadOnlyForElement(el);

        try {
            var _isEndo = (el.id === 'endo-axial' || el.id === 'endo-coronal' || el.id === 'endo-sagittal');
            var _cross = (typeof isCrosshairActive !== 'undefined') && isCrosshairActive;
            if (el.id === 'axial-viewport' || (_isEndo && !_cross)) {
                try { cornerstoneTools.addToolForElement(el, cornerstoneTools.StackScrollTool); } catch (e) {}
                cornerstoneTools.setToolActiveForElement(el, 'StackScroll', {
                    mouseButtonMask: 1,
                    isTouchActive: true
                });
            }
        } catch (e) {}
    });
}


// ==========================================================
// FINALIZAÇÃO REAL DA RÉGUA APÓS CRIAR UMA MEDIDA
// - Desliga o modo desenho da LengthTool
// - Remove visual ativo do botão Medida
// - Mantém as medidas visíveis/editáveis em modo passive
// - Não chama resetToolButtons(), para não bagunçar Mira/Oblíquo/Stack
// ==========================================================
function finishLengthMeasureCreation(element) {
    if (currentActiveTool !== 'Length') return;

    currentActiveTool = null;

    const btn = document.getElementById('btn-tool-medida');
    if (btn) {
        btn.classList.remove('active-tool');
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
    }

    const viewports = [
        'axial-viewport',
        'endo-axial',
        'endo-coronal',
        'endo-sagittal',
        'pan-pano-viewer',
        'pan-mini-viewer'
    ];

    document.querySelectorAll('.pan-cut-item').forEach(function(el) {
        viewports.push(el);
    });

    viewports.forEach(function(idOrEl) {
        const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return;

        try {
            const enabled = cornerstone.getEnabledElements().some(function(en) {
                return en.element === el;
            });
            if (!enabled) return;
        } catch (e) {
            return;
        }

        setLengthReadOnlyForElement(el);

        try {
            cornerstoneTools.setToolActiveForElement(el, 'PanMultiTouch', {});
        } catch (e) {}

        try {
            cornerstoneTools.setToolActiveForElement(el, 'ZoomTouchPinch', {});
        } catch (e) {}

        try {
            var _isEndo = (el.id === 'endo-axial' || el.id === 'endo-coronal' || el.id === 'endo-sagittal');
            var _cross = (typeof isCrosshairActive !== 'undefined') && isCrosshairActive;
            if (el.id === 'axial-viewport' || (_isEndo && !_cross)) {
                cornerstoneTools.setToolActiveForElement(el, 'StackScroll', {
                    mouseButtonMask: 1,
                    isTouchActive: true
                });
            }
        } catch (e) {}

        try {
            cornerstone.updateImage(el);
        } catch (e) {}
    });

    if (element) {
        try {
            if (typeof window.syncLengthMeasurementsForElement === 'function') {
                window.syncLengthMeasurementsForElement(element);
            } else {
                cornerstone.updateImage(element);
            }
        } catch (e) {}
    }
}


// Verifica se a medida já tem início e fim reais.
// Isso evita desligar a régua cedo demais caso o Cornerstone dispare evento
// com a medida ainda incompleta.
function isLengthMeasurementComplete(measurementData) {
    if (!measurementData || !measurementData.handles) return false;

    const s = measurementData.handles.start;
    const e = measurementData.handles.end;

    if (!s || !e) return false;
    if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(e.x) || !isFinite(e.y)) return false;

    const dx = e.x - s.x;
    const dy = e.y - s.y;

    return Math.sqrt(dx * dx + dy * dy) > 0.5;
}

// A finalização clínica da medida é: medida válida + dedo/mouse solto.
// Se o evento do Cornerstone já vier depois do touchend, finaliza no próximo frame.
// Se vier durante o gesto, espera o touchend/pointerup/mouseup.
let __pendingLengthFinish = null;
let __lengthPointerDown = false;
let __lengthFinishEventsWired = false;

function wireLengthFinishEventsOnce() {
    if (__lengthFinishEventsWired) return;
    __lengthFinishEventsWired = true;

    const markDown = function() {
        if (currentActiveTool === 'Length') {
            __lengthPointerDown = true;
        }
    };

    const markUp = function() {
        __lengthPointerDown = false;

        if (__pendingLengthFinish) {
            const pending = __pendingLengthFinish;
            __pendingLengthFinish = null;

            requestAnimationFrame(function() {
                finishLengthMeasureCreation(pending.element);
            });
        }
    };

    window.addEventListener('touchstart', markDown, true);
    window.addEventListener('pointerdown', markDown, true);
    window.addEventListener('mousedown', markDown, true);

    window.addEventListener('touchend', markUp, true);
    window.addEventListener('pointerup', markUp, true);
    window.addEventListener('mouseup', markUp, true);
    window.addEventListener('touchcancel', markUp, true);
    window.addEventListener('pointercancel', markUp, true);
}

wireLengthFinishEventsOnce();

function requestFinishLengthMeasureCreation(element, measurementData) {
    if (currentActiveTool !== 'Length') return;
    if (!isLengthMeasurementComplete(measurementData)) return;

    __pendingLengthFinish = {
        element: element,
        measurementData: measurementData
    };

    // Se o Cornerstone disparou o evento depois que o dedo já soltou,
    // finaliza no próximo frame. Não é delay mágico; é só esperar o DOM/tool
    // concluir o ciclo atual.
    if (!__lengthPointerDown) {
        const pending = __pendingLengthFinish;
        __pendingLengthFinish = null;

        requestAnimationFrame(function() {
            finishLengthMeasureCreation(pending.element);
        });
    }
}

function forceViewportSync() {
    const viewports = document.querySelectorAll('.viewport-element, #modal-viewport');
    viewports.forEach(element => {
        if (!element || element.style.display === 'none') return;
        try {
            // Só executa o resize se o Cornerstone reconhecer o elemento como ativo
            const isEnabled = cornerstone.getEnabledElements().some(e => e.element === element);
            if (isEnabled) {
                cornerstone.resize(element, true);
            }
        } catch (err) {}
    });
}

// Escuta redimensionamentos do sistema (Girar iPad/iPhone)
window.addEventListener('resize', () => {
    setTimeout(forceViewportSync, 150); // Delay para esperar o iOS terminar a animação de giro
});

function getPreciseImageCoords(element, event) {
    const canvas = element.querySelector('canvas');
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches ? event.touches[0] : event;
    
    // CRÍTICO: usa as dimensões do rect (CSS pixels), não do canvas físico
    const clientX = touch.clientX - rect.left;
    const clientY = touch.clientY - rect.top;
    
    // canvasToPixel já espera coords em CSS pixels (não físicos)
    return cornerstone.canvasToPixel(element, { x: clientX, y: clientY });
}

function toggleLengthMeasure(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const btn = document.getElementById('btn-tool-medida');
    const viewports = [
        'axial-viewport',
        'endo-axial',
        'endo-coronal',
        'endo-sagittal',
        'pan-pano-viewer',
        'pan-mini-viewer'
    ];

    document.querySelectorAll('.pan-cut-item').forEach(function(el) {
        viewports.push(el);
    });

    if (currentActiveTool === 'Length') {
        currentActiveTool = null;
        if (btn) btn.classList.remove('active-tool');

        viewports.forEach(function(idOrEl) {
            const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
            if (!el) return;
            setLengthReadOnlyForElement(el);
        });

        setActiveDefaultTools();
        return;
    }

    resetToolButtons();
    currentActiveTool = 'Length';
    if (btn) btn.classList.add('active-tool');

    setTimeout(function() {
        viewports.forEach(function(idOrEl) {
            const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
            if (!el) return;

            try { cornerstoneTools.setToolDisabledForElement(el, 'Wwwc'); } catch (e) {}
            try { cornerstoneTools.setToolDisabledForElement(el, 'PanMultiTouch'); } catch (e) {}
            try { cornerstoneTools.setToolDisabledForElement(el, 'ZoomTouchPinch'); } catch (e) {}
            try { cornerstoneTools.setToolDisabledForElement(el, 'StackScroll'); } catch (e) {}

            try {
                cornerstoneTools.setToolActiveForElement(el, 'Length', {
                    mouseButtonMask: 1,
                    isTouchActive: true
                });
            } catch (e) {}
        });
    }, 350);
}




// Adicione este sistema de edição por toque
let editingMeasurement = null;
let editingHandleIndex = null;
const HANDLE_HIT_RADIUS = 35; // pixels CSS — grande o suficiente para dedo

// findNearestHandle: touchX/touchY são CSS pixels relativos ao ELEMENTO.
// cornerstone.pixelToCanvas devolve device pixels do canvas interno.
// Faz a conversão CSS→device antes de comparar distâncias.
function findNearestHandle(element, touchX, touchY) {
    const toolState = cornerstoneTools.getToolState(element, 'Length');
    if (!toolState || !toolState.data || toolState.data.length === 0) return null;

    // Fator de escala: CSS px → device px do canvas
    let scX = 1, scY = 1;
    try {
        const cvs = element.querySelector('canvas');
        const rect = element.getBoundingClientRect();
        if (cvs && rect.width > 0 && rect.height > 0) {
            scX = cvs.width  / rect.width;
            scY = cvs.height / rect.height;
        }
    } catch(e) {}

    // touch em device px (mesmo espaço de pixelToCanvas)
    const tdx = touchX * scX;
    const tdy = touchY * scY;
    // Raios de hit também em device px (proporcional à densidade de pixel)
    const hitHandleR = HANDLE_HIT_RADIUS * Math.max(scX, scY);
    const hitLineR   = 28 * Math.max(scX, scY);

    for (let i = 0; i < toolState.data.length; i++) {
        const m = toolState.data[i];

        // 1. Testar handles (extremidades) — área maior
        const hs = [{ k: 'start', h: m.handles.start }, { k: 'end', h: m.handles.end }];
        for (const { k, h } of hs) {
            try {
                const cp = cornerstone.pixelToCanvas(element, h);
                if (Math.hypot(tdx - cp.x, tdy - cp.y) < hitHandleR) {
                    return { measureIndex: i, handleKey: k, measurement: m };
                }
            } catch(e) {}
        }

        // 2. Testar linha inteira
        try {
            const sc = cornerstone.pixelToCanvas(element, m.handles.start);
            const ec = cornerstone.pixelToCanvas(element, m.handles.end);
            if (pointToSegmentDist(tdx, tdy, sc, ec) < hitLineR) {
                return { measureIndex: i, handleKey: 'line', measurement: m };
            }
        } catch(e) {}
    }
    return null;
}

function pointToSegmentDist(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px-a.x)*dx + (py-a.y)*dy) / (dx*dx + dy*dy)));
    return Math.hypot(px - (a.x + t*dx), py - (a.y + t*dy));
}

// ── Estilo personalizado da LengthTool via cornerstoneTools.toolStyle ──────
// Aplicado após a lib carregar. Adiciona caixa ao redor do label e ticks.
function _applyMeasureStyle() {
    try {
        // Cor e tamanho base
        cornerstoneTools.toolStyle.setToolWidth(2);
        cornerstoneTools.toolColors.setToolColor('#00e5ff');
        cornerstoneTools.toolColors.setActiveColor('#00e5ff');
    } catch(e) {}
}
// Monkey-patch do renderer da LengthTool para adicionar ticks e caixa no label
function _patchLengthToolRenderer() {
    try {
        const LT = cornerstoneTools.LengthTool;
        if (!LT || !LT.prototype || LT.prototype._patchedVis) return;
        const origRender = LT.prototype.renderToolData;
        if (typeof origRender !== 'function') return;

        LT.prototype.renderToolData = function(evt) {
            // 1) Render original: linha + handles + texto nativo
            origRender.call(this, evt);

            // 2) Sobre-escreve o texto nativo com caixa bonita
            try {
                const ctx = evt.detail.canvasContext.canvas.getContext('2d');
                const el  = evt.detail.element;
                const ts  = cornerstoneTools.getToolState(el, 'Length');
                if (!ts || !ts.data) return;

           ts.data.forEach(m => {
                    // BUG 1 (slice-aware): medida de outro corte vem com visible=false.
                    // Sem este return, o custom redesenha a linha/ticks/caixa por cima
                    // e a medida nunca some ao trocar de corte.
                    if (m && m.visible === false) return;
                    if (!m.handles || !m.handles.start || !m.handles.end) return;
                    if (!m.cachedStats || m.cachedStats.length == null) return;

                    const col = m.color || '#00e5ff';
                    const sc  = cornerstone.pixelToCanvas(el, m.handles.start);
                    const ec  = cornerstone.pixelToCanvas(el, m.handles.end);

                    // BUG 2: LINHA PRINCIPAL na cor escolhida — o renderer nativo
                    // usa cornerstoneTools.toolColors (ciano global) e ignora m.color,
                    // então redesenhamos a linha por cima com a cor da medida.
                    ctx.save();
                    ctx.strokeStyle = col; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.lineTo(ec.x, ec.y); ctx.stroke();
                    ctx.restore();

                    // Ticks nas extremidades da linha — linhas perpendiculares à medida
                    const dx = ec.x - sc.x, dy = ec.y - sc.y;
                    const lineLen = Math.sqrt(dx*dx + dy*dy) || 1;
                    // Vetor perpendicular normalizado × metade do comprimento do tick
                    const TICK_HALF = 10; // px — comprimento total 20px
                    const px = -dy/lineLen * TICK_HALF, py = dx/lineLen * TICK_HALF;
                    ctx.save();
                    ctx.strokeStyle = col; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
                    // Tick no ponto inicial
                    ctx.beginPath(); ctx.moveTo(sc.x+px, sc.y+py); ctx.lineTo(sc.x-px, sc.y-py); ctx.stroke();
                    // Tick no ponto final
                    ctx.beginPath(); ctx.moveTo(ec.x+px, ec.y+py); ctx.lineTo(ec.x-px, ec.y-py); ctx.stroke();

                    // Caixa bonita na posição do textBox nativo
                    const labelTxt = m.cachedStats.length.toFixed(2) + ' mm';
                    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
                    const tw  = ctx.measureText(labelTxt).width;
                    const pad = 8, rw = tw + pad*2, rh = 24, rr = 7;

                    // Posição: textBox nativo ou meio da linha como fallback
                    let tx, ty;
                    if (m.handles.textBox && m.handles.textBox.hasBoundingBox &&
                        m.handles.textBox.boundingBox) {
                        tx = m.handles.textBox.boundingBox.left;
                        ty = m.handles.textBox.boundingBox.top;
                    } else if (m.handles.textBox) {
                        try {
                            const tbp = cornerstone.pixelToCanvas(el, m.handles.textBox);
                            tx = tbp.x - rw/2;
                            ty = tbp.y - rh/2;
                        } catch(e2) {
                            tx = (sc.x + ec.x)/2 - rw/2;
                            ty = (sc.y + ec.y)/2 - rh - 4;
                        }
                    } else {
                        tx = (sc.x + ec.x)/2 - rw/2;
                        ty = (sc.y + ec.y)/2 - rh - 4;
                    }

                    // Cobre o texto nativo com preto
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(tx - 6, ty - 6, rw + 12, rh + 12);

                    // Fundo escuro arredondado
                    ctx.fillStyle = 'rgba(6, 8, 20, 0.92)';
                    _roundRect(ctx, tx, ty, rw, rh, rr);
                    ctx.fill();

                    // Borda colorida
                    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
                    _roundRect(ctx, tx, ty, rw, rh, rr);
                    ctx.stroke();

                    // Texto
                    ctx.fillStyle = col;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(labelTxt, tx + rw/2, ty + rh/2);

                    ctx.restore();
                });
            } catch(er) {}
        };
        LT.prototype._patchedVis = true;
    } catch(e) {}
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
}
// Roda o patch depois que cornerstoneTools carregou
setTimeout(_applyMeasureStyle, 800);
setTimeout(_patchLengthToolRenderer, 900);

// ── PATCH LUPA QUADRADA ──────────────────────────────────────────────────
// O CornerstoneTools define canvas.width e canvas.height baseado no viewport do elemento.
// Se o viewport for retangular (ex: sagittal 200x400px), o canvas fica oval.
// Solução: MutationObserver que detecta quando .magnifyTool aparece no DOM
// e força canvas.width = canvas.height = 220px para renderização quadrada.
(function _patchMagnifySquare() {
    const MAGNIFY_SIZE = 140;
    const obs = new MutationObserver(mutations => {
        mutations.forEach(mu => {
            mu.addedNodes.forEach(node => {
                if (!node || node.nodeType !== 1) return;
                const el = node.classList && node.classList.contains('magnifyTool')
                    ? node
                    : node.querySelector && node.querySelector('.magnifyTool');
                if (!el) return;
                // Força o div
                el.style.width  = MAGNIFY_SIZE + 'px';
                el.style.height = MAGNIFY_SIZE + 'px';
                // Força o canvas interno (bitmap resolution)
                const cv = el.querySelector('canvas');
                if (cv) {
                    cv.width  = MAGNIFY_SIZE;
                    cv.height = MAGNIFY_SIZE;
                    cv.style.width  = MAGNIFY_SIZE + 'px';
                    cv.style.height = MAGNIFY_SIZE + 'px';
                }
                // Observa o canvas interno também para interceptar redimensionamentos
                const cvObs = new MutationObserver(() => {
                    const c = el.querySelector('canvas');
                    if (c && (c.width !== MAGNIFY_SIZE || c.height !== MAGNIFY_SIZE)) {
                        c.width  = MAGNIFY_SIZE;
                        c.height = MAGNIFY_SIZE;
                        c.style.width  = MAGNIFY_SIZE + 'px';
                        c.style.height = MAGNIFY_SIZE + 'px';
                    }
                });
                cvObs.observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ['width', 'height'] });
            });
        });
    });
    obs.observe(document.body, { childList: true, subtree: true });
})();

// ==========================================================
// MEDIDAS BONITAS — Abordagem correta para cornerstoneTools 4.x
//
// O cornerstoneTools 4 RECRIA o SVG a cada render via cornerstoneimagerendered.
// Qualquer setAttribute aplicado antes é APAGADO no próximo frame.
// A única solução: chamar _applyBeautifulMeasureSVG no evento
// cornerstoneimagerendered de CADA elemento viewport.
// ==========================================================
function _applyBeautifulMeasureSVG(rootEl) {
    const targets = rootEl ? [rootEl] : Array.from(
        document.querySelectorAll('.viewport-element, .pan-cut-item, #pan-pano-viewer, #pan-mini-viewer, #axial-viewport')
    );
    targets.forEach(el => {
        const layer = el.querySelector('.cornerstone-svg-layer');
        if (!layer) return;

        // Caixas de texto: rect dentro de qualquer <g>
        layer.querySelectorAll('g rect').forEach(rect => {
            rect.setAttribute('rx', '8');
            rect.setAttribute('ry', '8');
            const fill = rect.getAttribute('fill') || '';
            if (fill && fill !== 'none' && fill !== 'transparent') {
                rect.setAttribute('fill', 'rgba(6, 8, 18, 0.90)');
            }
            rect.setAttribute('stroke-width', '1.8');
        });

        // Textos
        layer.querySelectorAll('text').forEach(txt => {
            txt.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
            txt.setAttribute('font-weight', '800');
            // Só sobrescreve font-size se for menor que 12
            const fs = parseFloat(txt.getAttribute('font-size') || '12');
            if (fs < 12) txt.setAttribute('font-size', '13');
        });

        // Handles — esconde círculos (ticks são desenhados via canvas patch, não circles SVG)
        layer.querySelectorAll('circle').forEach(c => {
            // Esconde qualquer círculo de handle (raio pequeno = handle de medida)
            const r = parseFloat(c.getAttribute('r') || '3');
            if (r < 20) {
                c.setAttribute('r', '0');
                c.setAttribute('fill', 'none');
                c.setAttribute('stroke', 'none');
            }
        });
    });
}

// Hook em TODOS os viewports existentes e futuros via delegação no document
document.addEventListener('cornerstoneimagerendered', (e) => {
    // e.detail.element = o viewport que acabou de renderizar
    requestAnimationFrame(() => _applyBeautifulMeasureSVG(e.detail && e.detail.element));
}, true); // capture:true garante que roda antes de outros handlers

// Também dispara quando medida é adicionada/modificada
document.addEventListener('cornerstonetoolsmeasurementadded', (e) => {
    requestAnimationFrame(() => _applyBeautifulMeasureSVG(e.detail && e.detail.element));
});
document.addEventListener('cornerstonetoolsmeasurementmodified', (e) => {
    requestAnimationFrame(() => _applyBeautifulMeasureSVG(e.detail && e.detail.element));

    if (e.detail && e.detail.toolName === 'Length') {
        requestFinishLengthMeasureCreation(e.detail.element, e.detail.measurementData);
    }
});

// Aplicação inicial (viewports já carregados)
setTimeout(() => _applyBeautifulMeasureSVG(null), 2000);
setTimeout(() => _applyBeautifulMeasureSVG(null), 4000);

// Variáveis de controle para o Long Press
let measureLongPressTimer = null;
const MEASURE_LONG_PRESS_DURATION = 600; // 600ms para ativar a edição (suave)

// ==========================================================
// handleMeasurementTouchStart (CORRIGIDA - PRESERVA CORES)
// - Mantém o Long Press (evita arrasto acidental).
// - CORREÇÃO: Não apaga mais as cores das outras medidas ao selecionar uma.
// ==========================================================
function measurementsLookEqual(a, b) {
    if (!a || !b || !a.handles || !b.handles) return false;

    const eps = 0.001;
    const as = a.handles.start || {};
    const ae = a.handles.end || {};
    const bs = b.handles.start || {};
    const be = b.handles.end || {};

    const direct =
        Math.abs(as.x - bs.x) < eps &&
        Math.abs(as.y - bs.y) < eps &&
        Math.abs(ae.x - be.x) < eps &&
        Math.abs(ae.y - be.y) < eps;

    const reverse =
        Math.abs(as.x - be.x) < eps &&
        Math.abs(as.y - be.y) < eps &&
        Math.abs(ae.x - bs.x) < eps &&
        Math.abs(ae.y - bs.y) < eps;

    const sameSlice = (!a.sliceKey || !b.sliceKey || a.sliceKey === b.sliceKey);

    return sameSlice && (direct || reverse);
}

function removeLengthMeasurementRobust(element, measurement) {
    if (!element || !measurement) return;

    try {
        const ts = cornerstoneTools.getToolState(element, 'Length');
        if (ts && Array.isArray(ts.data)) {
            for (let i = ts.data.length - 1; i >= 0; i--) {
                const candidate = ts.data[i];
                if (candidate === measurement || measurementsLookEqual(candidate, measurement)) {
                    ts.data.splice(i, 1);
                }
            }
        }
    } catch (e) {}

    try {
        if (window.lengthMeasurementStore && typeof window.lengthMeasurementStore.forEach === 'function') {
            window.lengthMeasurementStore.forEach(function(arr, key) {
                for (let i = arr.length - 1; i >= 0; i--) {
                    const candidate = arr[i];
                    if (candidate === measurement || measurementsLookEqual(candidate, measurement)) {
                        arr.splice(i, 1);
                    }
                }
                if (!arr.length) {
                    window.lengthMeasurementStore.delete(key);
                }
            });
        }
    } catch (e) {}

    try {
        if (typeof window.syncLengthMeasurementsForElement === 'function') {
            window.syncLengthMeasurementsForElement(element);
        } else {
            cornerstone.updateImage(element);
        }
    } catch (e) {}
}

function handleMeasurementTouchStart(e) {
    const element = e.currentTarget;

    if (currentActiveTool === 'Length' && editingMeasurement === null) {
        return;
    }

    const rect = element.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = touch.clientX - rect.left;
    const ty = touch.clientY - rect.top;
    const hit = findNearestHandle(element, tx, ty);

    if (!hit) return;

    if (currentActiveTool === 'Length') {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (hit.handleKey !== 'line') {
            editingMeasurement = {
                element: element,
                measurement: hit.measurement,
                handleKey: hit.handleKey
            };

            const onMove = function(ev) {
                if (!editingMeasurement) return;
                const t2 = ev.touches[0];
                const pc = cornerstone.pageToPixel(editingMeasurement.element, t2.pageX, t2.pageY);
                editingMeasurement.measurement.handles[editingMeasurement.handleKey].x = pc.x;
                editingMeasurement.measurement.handles[editingMeasurement.handleKey].y = pc.y;
                editingMeasurement.measurement.invalidated = true;

                try {
                    if (typeof window.saveLengthMeasurementsForElement === 'function') {
                        window.saveLengthMeasurementsForElement(editingMeasurement.element);
                    }
                } catch (e) {}

                cornerstone.updateImage(editingMeasurement.element);
            };

            const onEnd = function() {
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onEnd);

                try {
                    if (editingMeasurement && typeof window.saveLengthMeasurementsForElement === 'function') {
                        window.saveLengthMeasurementsForElement(editingMeasurement.element);
                    }
                } catch (e) {}

                editingMeasurement = null;
            };

            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
        }
        return;
    }

    const startX = touch.clientX;
    const startY = touch.clientY;

    if (measureLongPressTimer) clearTimeout(measureLongPressTimer);

    measureLongPressTimer = setTimeout(function() {
        if (navigator.vibrate) navigator.vibrate(50);

        cornerstone.updateImage(element);

        showAnnotEditModal(
            '📏 Medida',
            ANNOT_COLORS,
            hit.measurement.color || '#00e5ff',
            function(c) {
                hit.measurement.color = c;
                hit.measurement.activeColor = c;
                hit.measurement.invalidated = true;

                try {
                    if (typeof window.saveLengthMeasurementsForElement === 'function') {
                        window.saveLengthMeasurementsForElement(element);
                    }
                } catch (e) {}

                ['endo-axial', 'endo-coronal', 'endo-sagittal', 'modal-viewport', 'axial-viewport'].forEach(function(vid) {
                    const vel = document.getElementById(vid);
                    if (!vel) return;
                    try {
                        if (typeof window.syncLengthMeasurementsForElement === 'function') {
                            window.syncLengthMeasurementsForElement(vel);
                        } else {
                            cornerstone.updateImage(vel);
                        }
                    } catch (e) {}
                });
            },
            function() {
                removeLengthMeasurementRobust(element, hit.measurement);

                ['endo-axial', 'endo-coronal', 'endo-sagittal', 'modal-viewport', 'axial-viewport'].forEach(function(vid) {
                    const vel = document.getElementById(vid);
                    if (!vel) return;
                    try {
                        if (typeof window.syncLengthMeasurementsForElement === 'function') {
                            window.syncLengthMeasurementsForElement(vel);
                        } else {
                            cornerstone.updateImage(vel);
                        }
                    } catch (e) {}
                });

                setLengthReadOnlyForElement(element);
            }
        );

        cleanupLongPressListeners();
    }, MEASURE_LONG_PRESS_DURATION);

    const onTouchMovePassive = function(ev) {
        const t2 = ev.touches[0];
        const dx = Math.abs(t2.clientX - startX);
        const dy = Math.abs(t2.clientY - startY);
        if (dx > 10 || dy > 10) {
            clearTimeout(measureLongPressTimer);
            cleanupLongPressListeners();
        }
    };

    const onTouchEndPassive = function() {
        clearTimeout(measureLongPressTimer);
        cleanupLongPressListeners();
    };

    function cleanupLongPressListeners() {
        window.removeEventListener('touchmove', onTouchMovePassive);
        window.removeEventListener('touchend', onTouchEndPassive);
    }

    window.addEventListener('touchmove', onTouchMovePassive, { passive: true });
    window.addEventListener('touchend', onTouchEndPassive, { passive: true });
}


// Mantive sua função _registerMeasureHandlers original intacta
function _registerMeasureHandlers() {
    ['axial-viewport','endo-axial','endo-coronal','endo-sagittal','pan-pano-viewer'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._measureHandlerAdded) {
            el.addEventListener('touchstart', handleMeasurementTouchStart, { passive:false });
            el._measureHandlerAdded = true;
        }
    });
}
// Registra na inicialização
_registerMeasureHandlers();
document.addEventListener('DOMContentLoaded', _registerMeasureHandlers);
setTimeout(_registerMeasureHandlers, 2000);

    