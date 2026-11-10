
  try {
    const { Archive } = await import(new URL('vendor/libarchive/main.js', document.baseURI).href);
    Archive.init({ workerUrl: new URL('vendor/libarchive/dist/worker-bundle.js', document.baseURI).href });
    window.LibArchive = Archive;
    window.__RAR_ENGINE_READY__ = true;
    console.log('[RAR] libarchive.js carregado com worker local:', new URL('vendor/libarchive/dist/worker-bundle.js', document.baseURI).href);
  } catch (e) {
    window.LibArchive = null;
    window.__RAR_ENGINE_READY__ = false;
    console.warn('[RAR] libarchive.js não carregou (suporte a .rar desativado):', e);
  }
