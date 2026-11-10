
/* TAREFA 5.3 — PDF premium + trava anti-aba-dupla (#3 e #4) */
(function(){
  if (window._odontoPdfPremiumInstalled) return;
  window._odontoPdfPremiumInstalled = true;
  function recuoOf(c){ return (c && typeof c.recuo === 'number') ? c.recuo : 1.0; }
  function voxelStr(){ try{ if(typeof volumeMeta!=='undefined' && volumeMeta && volumeMeta.pixelSpacing) return volumeMeta.pixelSpacing.toFixed(2)+' mm'; }catch(e){} return 'n/d'; }
  window.gerarRelatorioPDF = function(){
    if (window._pdfBusy) return;                 // #3 — trava: touchend + click abriam 2 abas
    window._pdfBusy = true;
    setTimeout(function(){ window._pdfBusy = false; }, 1200);
    var st = window.endoCanalState;
    var ids = st ? Object.keys(st.canals) : [];
    var dente = (st && st.selectedTooth) || '';
    var nome = (document.getElementById('odonto-dente-nome')||{}).innerText || '';
    var vox = voxelStr();
    var dateStr = new Date().toLocaleDateString('pt-BR');
    var timeStr = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    var canais = [];
    if (ids.length){
      ids.forEach(function(id){ var c=st.canals[id]; var rec=recuoOf(c);
        var crd=(typeof c.mm==='number'&&c.mm>0)?c.mm:null;
        canais.push({nome:c.nome, acc:(c.tipo==='acessorio'), crd:crd, rec:rec, crt:(crd!=null?Math.max(0.1,crd-rec):null)});
      });
    } else {
      var d=window._odontometriaData;
      if(!d||!d.CRD){ alert('Meça ao menos um canal na Lima Virtual primeiro.'); window._pdfBusy=false; return; }
      var r=(typeof d.recuo==='number')?d.recuo:1.0;
      canais.push({nome:'Canal único',acc:false,crd:d.CRD,rec:r,crt:Math.max(0.1,d.CRD-r)});
    }
    var measured = canais.filter(function(c){return c.crd!=null;}).length;
    if(!measured){ alert('Nenhum canal medido ainda.'); window._pdfBusy=false; return; }
    var rows = canais.map(function(c){
      return '<tr><td class="cn">'+c.nome+(c.acc?' <span class="acc">acessório</span>':'')+'</td>'
        +'<td class="num">'+(c.crd!=null?c.crd.toFixed(1):'—')+'</td>'
        +'<td class="num rec">'+c.rec.toFixed(1)+'</td>'
        +'<td class="num crt">'+(c.crt!=null?c.crt.toFixed(1):'—')+'</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Odontometria CBCT</title><style>'
      +'*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      +'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:#eef2f7;padding:24px;}'
      +'.sheet{max-width:720px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.16);}'
      +'.hero{background:linear-gradient(135deg,#0b3b66 0%,#0e7490 55%,#0891b2 100%);color:#fff;padding:26px 30px;position:relative;}'
      +'.hero h1{font-size:21px;font-weight:800;}.hero .sub{font-size:11px;opacity:.85;margin-top:3px;}'
      +'.hero .badge{position:absolute;top:24px;right:30px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);border-radius:30px;padding:8px 16px;font-size:12px;font-weight:800;}'
      +'.meta{display:flex;gap:22px;padding:16px 30px;background:#f8fafc;border-bottom:1px solid #e8edf3;font-size:11px;color:#475569;}.meta b{color:#0f172a;}'
      +'.body{padding:24px 30px;}.tooth{font-size:15px;font-weight:800;color:#0b3b66;margin-bottom:14px;display:flex;align-items:center;gap:10px;}'
      +'.tooth .fdi{background:#0b3b66;color:#fff;border-radius:10px;padding:5px 12px;font-size:14px;letter-spacing:1px;}'
      +'table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;margin-bottom:18px;border:1px solid #e3e9f1;border-radius:12px;overflow:hidden;}'
      +'thead th{background:#0b3b66;color:#fff;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;padding:11px 14px;text-align:center;font-weight:700;}thead th:first-child{text-align:left;}'
      +'tbody td{padding:12px 14px;border-bottom:1px solid #eef2f7;}tbody tr:last-child td{border-bottom:none;}tbody tr:nth-child(even){background:#f8fafc;}'
      +'.cn{font-weight:800;color:#0f172a;}.acc{font-size:9px;background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:20px;font-weight:700;}'
      +'.num{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:#334155;}.rec{color:#b45309;}'
      +'.crt{background:#059669;color:#fff;font-weight:900;font-size:15px;}'
      +'.legend{display:flex;gap:18px;font-size:9.5px;color:#64748b;margin-bottom:18px;flex-wrap:wrap;}.legend b{color:#0f172a;}'
      +'.note{background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 16px;font-size:11px;color:#0c4a6e;line-height:1.7;margin-bottom:14px;}'
      +'.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;font-size:10.5px;color:#92400e;line-height:1.7;}.warn b{color:#78350f;}'
      +'.ftr{padding:16px 30px;background:#f8fafc;border-top:1px solid #e8edf3;font-size:8.5px;color:#94a3b8;display:flex;justify-content:space-between;}'
      +'.actions{text-align:center;margin:22px 0 6px;}.actions button{background:linear-gradient(135deg,#0e7490,#0891b2);color:#fff;border:none;border-radius:11px;padding:13px 38px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(8,145,178,.35);}'
      +'@media print{body{background:#fff;padding:0;}.sheet{box-shadow:none;border-radius:0;max-width:none;}.noprint{display:none;}}'
      +'<\/style><\/head><body><div class="sheet">'
      +'<div class="hero"><h1>🦷 Odontometria CBCT</h1><div class="sub">Relatório de comprimentos por canal · estimativa pré-operatória</div><div class="badge">CBCT · voxel '+vox+'</div></div>'
      +'<div class="meta"><div><b>Data:</b> '+dateStr+' '+timeStr+'</div><div><b>Canais medidos:</b> '+measured+'/'+canais.length+'</div><div><b>Voxel:</b> '+vox+'</div></div>'
      +'<div class="body"><div class="tooth"><span class="fdi">'+(dente||'—')+'</span><span>'+(nome||'Dente')+'</span></div>'
      +'<table><thead><tr><th>Canal</th><th>CRD (mm)</th><th>Recuo (mm)</th><th>CRT (mm)</th></tr></thead><tbody>'+rows+'</tbody></table>'
      +'<div class="legend"><span><b>CRD</b> Comprimento Real do Dente</span><span><b>Recuo</b> apical</span><span><b>CRT</b> Comprimento Real de Trabalho</span></div>'
      +'<div class="note"><b>Metodologia:</b> CRD medido na Lima Virtual sobre o CBCT. CRT = CRD − recuo apical (padrão 1,0 mm, ajustável por canal conforme anatomia).</div>'
      +'<div class="warn"><b>⚠ Importante:</b> valores são <b>estimativa pré-operatória</b> por CBCT (voxel '+vox+'). A constrição apical varia em relação ao ápice radiográfico — confirme o comprimento de trabalho com <b>localizador apical eletrônico</b> no intraoperatório. O CBCT não substitui a medição eletrônica.</div>'
      +'<div class="actions noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div></div>'
      +'<div class="ftr"><span>EndoScan CBCT · uso exclusivo diagnóstico</span><span>Gerado em '+dateStr+'</span></div>'
      +'<\/div><\/body><\/html>';
    var W = window.open('', '_blank');
    if(!W){ alert('Permita pop-ups neste site para gerar o PDF.'); window._pdfBusy=false; return; }
    W.document.write(html); W.document.close();
    setTimeout(function(){ try{ W.focus(); }catch(e){} }, 300);
  };
})();
