
try{(function(){'use strict';
function patchWhenReady(){if(typeof RX2DEngine==='undefined'||!RX2DEngine.canvas){setTimeout(patchWhenReady,200);return;}applyAll();}
function applyAll(){
var E=RX2DEngine,canvas=E.canvas;

// ═══ INJECT HTML ═══
var phaseBar=document.querySelector('#rx2d-workspace .rx2d-phase-bar');
if(phaseBar){var b=document.createElement('button');b.className='rx2d-phase-btn';b.textContent='5. ANOTAR';b.onclick=function(){E.setPhase(5);};phaseBar.appendChild(b);}
var p4=document.getElementById('rx2d-panel-4');
if(p4&&p4.parentNode){var p5=document.createElement('div');p5.className='rx2d-tools-panel';p5.id='rx2d-panel-5';p5.style.display='none';
p5.innerHTML='<button class="rx-anno-btn" id="rx-btn-arrow" onclick="rxAnno.setTool(\'arrow\',this)"><div class="ico">➤</div><div>Seta</div></button><button class="rx-anno-btn" id="rx-btn-text" onclick="rxAnno.setTool(\'text\',this)"><div class="ico">T</div><div>Texto</div></button><button class="rx-anno-btn" id="rx-btn-select" onclick="rxAnno.setTool(\'select\',this)"><div class="ico">✋</div><div>Mover</div></button><button class="rx-anno-btn green" onclick="rxCaptureToPortfolio()"><div class="ico">📸</div><div>Captura</div></button><button class="rx-anno-btn purple" onclick="openRXPortfolio()"><div class="ico">📁</div><div>Portfolio</div></button><button class="rx-anno-btn red" onclick="rxAnno.clearAll()"><div class="ico">🗑</div><div>Limpar</div></button>';
p4.parentNode.insertBefore(p5,p4.nextSibling);}

// ═══ GLASS OVERLAY — the key fix: physically blocks Hammer from seeing touches ═══
var va=document.getElementById('rx2d-view-area');
var glass=document.createElement('div');glass.id='rx-anno-glass';
if(va)va.appendChild(glass);

// Context menu
var cm=document.createElement('div');cm.id='rx-ctx-menu';
cm.innerHTML='<div class="rx-ctx-colors" id="rx-ctx-colors"></div><div class="rx-ctx-sep"></div><div class="rx-ctx-item" onclick="rxAnno.ctxEdit()"><span style="width:20px;text-align:center">✏️</span>Editar</div><div class="rx-ctx-item" onclick="rxAnno.ctxDup()"><span style="width:20px;text-align:center">📋</span>Duplicar</div><div class="rx-ctx-sep"></div><div class="rx-ctx-item" onclick="rxAnno.ctxDel()" style="color:#ff6b6b"><span style="width:20px;text-align:center">🗑</span>Excluir</div>';
if(va)va.appendChild(cm);

// Header portfolio btn
var hdr=document.querySelector('#rx2d-workspace > div:first-child');
if(hdr){var lb=hdr.querySelector('[onclick*="generateReport"]');if(lb){var pb=document.createElement('button');pb.className='neu-btn';pb.style.cssText='padding:5px 10px;font-size:9px;color:#d2bcff;border-color:rgba(210,188,255,.3);margin-right:4px';pb.textContent='📁';pb.onclick=function(){openRXPortfolio();};lb.parentNode.insertBefore(pb,lb);}}

// ═══ PATCH setPhase ═══
var _origSP=E.setPhase.bind(E);
E.setPhase=function(n){
    if(n<=4){_origSP(n);rxAnno.deactivate();}
    else if(n===5){
        document.querySelectorAll('.rx2d-phase-btn').forEach(function(b,i){b.classList.toggle('active',i===4);});
        document.querySelectorAll('.rx2d-tools-panel').forEach(function(p){p.style.display='none';});
        var p5=document.getElementById('rx2d-panel-5');if(p5)p5.style.display='flex';
        var gs=document.getElementById('rx2d-global-sliders');if(gs)gs.style.display='none';
        E.tool='pan';rxAnno.setTool('select',document.getElementById('rx-btn-select'));
    }
};

// ═══ EVENTS ON GLASS (not canvas — Hammer can't see these) ═══
var _ts={down:false,sx:0,sy:0,moved:false,lp:null};
glass.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length!==1)return;
    var t=e.touches[0],p=E._evtXY(t.clientX,t.clientY);
    _ts.down=true;_ts.sx=p.x;_ts.sy=p.y;_ts.moved=false;
    rxAnno._hStart(p.x,p.y);
    _ts.lp=setTimeout(function(){if(_ts.down&&!_ts.moved)rxAnno._hLongPress(t.clientX,t.clientY);},500);
},{passive:false});
glass.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(!_ts.down)return;clearTimeout(_ts.lp);
    var t=e.touches[0],p=E._evtXY(t.clientX,t.clientY);
    _ts.moved=true;rxAnno._hMove(p.x,p.y);
},{passive:false});
glass.addEventListener('touchend',function(e){
    if(!_ts.down)return;clearTimeout(_ts.lp);
    var p={x:_ts.sx,y:_ts.sy};
    if(e.changedTouches&&e.changedTouches[0])p=E._evtXY(e.changedTouches[0].clientX,e.changedTouches[0].clientY);
    if(!_ts.moved)rxAnno._hTap(p.x,p.y);else rxAnno._hEnd();
    _ts.down=false;
},{passive:false});
glass.addEventListener('mousedown',function(e){e.preventDefault();var p=E._evtXY(e.clientX,e.clientY);_ts.down=true;_ts.sx=p.x;_ts.sy=p.y;_ts.moved=false;rxAnno._hStart(p.x,p.y);});
glass.addEventListener('mousemove',function(e){if(!_ts.down)return;e.preventDefault();var p=E._evtXY(e.clientX,e.clientY);_ts.moved=true;rxAnno._hMove(p.x,p.y);});
glass.addEventListener('mouseup',function(e){if(!_ts.down)return;var p=E._evtXY(e.clientX,e.clientY);if(!_ts.moved)rxAnno._hTap(p.x,p.y);else rxAnno._hEnd();_ts.down=false;});

// ═══ PATCH drawUI ═══
var _origDU=E.drawUI.bind(E);
E.drawUI=function(){_origDU();try{rxAnno.draw(E.ctx);}catch(ex){console.error('[rxAnno draw]',ex);}};
E.captureAnnotatedCanvas=function(){this.render();return this.canvas.toDataURL('image/jpeg',0.92);};
console.log('[RX2D v4] Patched OK');
}// end applyAll

// ═══════════════════════════════════════════════════════════
// ANNOTATION ENGINE
// ═══════════════════════════════════════════════════════════
window.rxAnno={
    items:[],sel:null,_tool:'none',_nid:1,_drag:null,_tmp:null,_ctxId:null,
    COLORS:['#FF4444','#FFEE58','#00E5FF','#00ff88','#FF9800','#E040FB','#FFFFFF','#64748b'],
    setTool:function(t,btn){
        this._tool=t;RX2DEngine.tool='anno_'+t;
        document.querySelectorAll('.rx-anno-btn').forEach(function(b){b.classList.remove('active');});
        if(btn)btn.classList.add('active');
        this.sel=null;this._hideCtx();
        // Toggle glass overlay
        var g=document.getElementById('rx-anno-glass');
        if(g)g.classList.add('active');
        RX2DEngine.render();
    },
    deactivate:function(){
        this._tool='none';this.sel=null;this._hideCtx();
        document.querySelectorAll('.rx-anno-btn').forEach(function(b){b.classList.remove('active');});
        var g=document.getElementById('rx-anno-glass');if(g)g.classList.remove('active');
    },
    clearAll:function(s){this.items=[];this.sel=null;this._tmp=null;this._hideCtx();RX2DEngine.render();if(!s)showToast('🗑 Anotações limpas');},
    _byId:function(id){for(var i=0;i<this.items.length;i++)if(this.items[i].id===id)return this.items[i];return null;},
    hit:function(cx,cy){var E=RX2DEngine;for(var i=this.items.length-1;i>=0;i--){var a=this.items[i];if(a.type==='arrow'){var s=E.imgToCanvas(a.x1,a.y1),e=E.imgToCanvas(a.x2,a.y2);if(Math.hypot(cx-e.x,cy-e.y)<30)return{id:a.id,part:'end'};if(Math.hypot(cx-s.x,cy-s.y)<30)return{id:a.id,part:'start'};if(this._dS(cx,cy,s.x,s.y,e.x,e.y)<24)return{id:a.id,part:'body'};}else if(a.type==='text'){var p=E.imgToCanvas(a.x1,a.y1),ctx=E.ctx;ctx.font='bold '+(a.fs||14)+'px -apple-system,Helvetica,sans-serif';var tw=ctx.measureText(a.txt||'').width;if(cx>=p.x-8&&cx<=p.x+tw+8&&cy>=p.y-24&&cy<=p.y+8)return{id:a.id,part:'body'};}}return null;},
    _dS:function(px,py,x1,y1,x2,y2){var dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(px-x1,py-y1);var t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));},
    _hStart:function(cx,cy){this._hideCtx();var E=RX2DEngine;if(this._tool==='arrow'){var ip=E.canvasToImg(cx,cy);this._tmp={type:'arrow',x1:ip.x,y1:ip.y,x2:ip.x,y2:ip.y,color:'#FF4444'};return;}if(this._tool==='select'){var h=this.hit(cx,cy);if(h){this.sel=h.id;var a=this._byId(h.id),ip2=E.canvasToImg(cx,cy);this._drag={id:h.id,part:h.part,ox:ip2.x-a.x1,oy:ip2.y-a.y1};}else{this.sel=null;}E.render();}},
    _hMove:function(cx,cy){var E=RX2DEngine,ip=E.canvasToImg(cx,cy);if(this._tmp){this._tmp.x2=ip.x;this._tmp.y2=ip.y;E.render();return;}if(this._drag){var a=this._byId(this._drag.id);if(!a)return;if(a.type==='arrow'){if(this._drag.part==='start'){a.x1=ip.x;a.y1=ip.y;}else if(this._drag.part==='end'){a.x2=ip.x;a.y2=ip.y;}else{var dx=ip.x-this._drag.ox-a.x1,dy=ip.y-this._drag.oy-a.y1;a.x1+=dx;a.y1+=dy;a.x2+=dx;a.y2+=dy;this._drag.ox=ip.x-a.x1;this._drag.oy=ip.y-a.y1;}}else if(a.type==='text'){a.x1=ip.x-this._drag.ox;a.y1=ip.y-this._drag.oy;}E.render();}},
    _hEnd:function(){if(this._tmp){var c=this._tmp;if(Math.hypot(c.x2-c.x1,c.y2-c.y1)>8)this.items.push({id:this._nid++,type:'arrow',x1:c.x1,y1:c.y1,x2:c.x2,y2:c.y2,color:c.color,lw:2.5});this._tmp=null;RX2DEngine.render();return;}this._drag=null;},
    _hTap:function(cx,cy){this._hideCtx();var E=RX2DEngine;if(this._tool==='text'){var ip=E.canvasToImg(cx,cy),txt=prompt('Texto:');if(txt&&txt.trim())this.items.push({id:this._nid++,type:'text',x1:ip.x,y1:ip.y,txt:txt.trim(),color:'#FFEE58',fs:14});E.render();return;}if(this._tool==='select'){var h=this.hit(cx,cy);this.sel=h?h.id:null;E.render();}},
    _hLongPress:function(clX,clY){var p=RX2DEngine._evtXY(clX,clY),h=this.hit(p.x,p.y);if(h){this.sel=h.id;this._ctxId=h.id;this._showCtx(clX,clY);RX2DEngine.render();}},
    _showCtx:function(clX,clY){var m=document.getElementById('rx-ctx-menu'),va=document.getElementById('rx2d-view-area');if(!m||!va)return;var r=va.getBoundingClientRect(),l=clX-r.left,t=clY-r.top;if(l+150>r.width)l=r.width-150;if(t+180>r.height)t-=180;if(l<4)l=4;if(t<4)t=4;m.style.left=l+'px';m.style.top=t+'px';var cd=document.getElementById('rx-ctx-colors'),a=this._byId(this._ctxId),cc=a?a.color:'#FF4444';cd.innerHTML=this.COLORS.map(function(c){return'<div class="rx-ctx-swatch'+(c===cc?' sel':'')+'" style="background:'+c+'" onclick="rxAnno.ctxColor(\''+c+'\')"></div>';}).join('');m.classList.add('show');},
    _hideCtx:function(){var m=document.getElementById('rx-ctx-menu');if(m)m.classList.remove('show');this._ctxId=null;},
    ctxColor:function(c){var a=this._byId(this._ctxId||this.sel);if(a){a.color=c;RX2DEngine.render();}this._hideCtx();},
    ctxDel:function(){var id=this._ctxId||this.sel;this.items=this.items.filter(function(a){return a.id!==id;});this.sel=null;this._hideCtx();RX2DEngine.render();},
    ctxEdit:function(){var a=this._byId(this._ctxId||this.sel);if(a&&a.type==='text'){var t=prompt('Editar:',a.txt);if(t!==null)a.txt=t;RX2DEngine.render();}this._hideCtx();},
    ctxDup:function(){var a=this._byId(this._ctxId||this.sel);if(!a)return;var d={};for(var k in a)d[k]=a[k];d.id=this._nid++;d.x1+=20;d.y1+=20;if(a.type==='arrow'){d.x2=a.x2+20;d.y2=a.y2+20;}this.items.push(d);this.sel=d.id;this._hideCtx();RX2DEngine.render();},
    draw:function(ctx){var E=RX2DEngine,self=this;this.items.forEach(function(a){self._dA(ctx,a,E,false);});if(this._tmp)this._dA(ctx,this._tmp,E,true);if(this.sel){var sa=this._byId(this.sel);if(sa)self._dSel(ctx,sa,E);}},
    _dA:function(ctx,a,E,tmp){if(a.type==='arrow'){var s=E.imgToCanvas(a.x1,a.y1),e=E.imgToCanvas(a.x2,a.y2);ctx.save();ctx.strokeStyle=a.color||'#FF4444';ctx.lineWidth=a.lw||2.5;if(tmp){ctx.setLineDash([6,4]);ctx.globalAlpha=0.6;}ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);ctx.stroke();if(tmp)ctx.setLineDash([]);var ang=Math.atan2(e.y-s.y,e.x-s.x),hl=16;ctx.fillStyle=a.color||'#FF4444';ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x-hl*Math.cos(ang-.35),e.y-hl*Math.sin(ang-.35));ctx.lineTo(e.x-hl*.55*Math.cos(ang),e.y-hl*.55*Math.sin(ang));ctx.lineTo(e.x-hl*Math.cos(ang+.35),e.y-hl*Math.sin(ang+.35));ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(s.x,s.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();}else if(a.type==='text'){var p=E.imgToCanvas(a.x1,a.y1);ctx.save();ctx.font='bold '+(a.fs||14)+'px -apple-system,Helvetica,sans-serif';ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=5;ctx.shadowOffsetX=1;ctx.shadowOffsetY=1;ctx.fillStyle=a.color||'#FFEE58';ctx.fillText(a.txt||'',p.x,p.y);ctx.restore();}},
    _dSel:function(ctx,a,E){ctx.save();ctx.strokeStyle='rgba(74,144,226,.85)';ctx.lineWidth=1.5;ctx.setLineDash([5,3]);if(a.type==='arrow'){var s=E.imgToCanvas(a.x1,a.y1),e=E.imgToCanvas(a.x2,a.y2);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.setLineDash([]);[s,e].forEach(function(pt){ctx.fillStyle='rgba(74,144,226,.9)';ctx.beginPath();ctx.arc(pt.x,pt.y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(pt.x,pt.y,5,0,Math.PI*2);ctx.fill();});}else if(a.type==='text'){var p=E.imgToCanvas(a.x1,a.y1);ctx.font='bold '+(a.fs||14)+'px -apple-system,Helvetica,sans-serif';var tw=ctx.measureText(a.txt||'').width;ctx.strokeRect(p.x-4,p.y-18,tw+8,26);}ctx.restore();}
};

// Capture
// --- PATCH: Captura Inteligente para Odontometria ---
window.rxCaptureToPortfolio=function(){
    if(!RX2DEngine.img){showToast('⚠ Carregue radiografia');return;}
    var du=RX2DEngine.captureAnnotatedCanvas();
    var m = {};
    var lbl='Captura RX · '+new Date().toLocaleTimeString('pt-BR');
    
    // Se a imagem está calibrada e tem uma medida, salva os dados completos
    if(RX2DEngine.isCalibrated && (RX2DEngine.lineStart || RX2DEngine.measurePts.length > 1)){
        var px=0;
        if(RX2DEngine.lineStart && RX2DEngine.lineEnd) {
            px = Math.hypot(RX2DEngine.lineEnd.x - RX2DEngine.lineStart.x, RX2DEngine.lineEnd.y - RX2DEngine.lineStart.y);
        } else {
            for(var i=1; i < RX2DEngine.measurePts.length; i++) {
                px += Math.hypot(RX2DEngine.measurePts[i].x - RX2DEngine.measurePts[i-1].x, RX2DEngine.measurePts[i].y - RX2DEngine.measurePts[i-1].y);
            }
        }
        
        var mm = px * RX2DEngine.calibrationFactor;
        m = {
            CRD: mm.toFixed(2),
            CRT: (mm - 1.0).toFixed(2),
            CAD: (mm - 1.0).toFixed(2),
            CPA: (mm + 0.5).toFixed(2)
        };
        lbl = 'Medição Radiográfica · CRD=' + m.CRD + ' mm';
    }
    
    rxPfAddItem('Radiografia 2D', du, lbl, m);
};
// Templates
var TPLS={necrose:{name:'Necrose+Lesão',ico:'🦷',diag:{pri:'Necrose pulpar com periodontite apical sintomática',dif:'Abscesso apical crônico'},plano:{obj:'Debridamento, desinfecção e obturação do SCR',cond:'Tratamento endodôntico'},proto:{irrigP:'NaOCl 2,5%',irrigC:'EDTA 17% por 3 min',ativ:'PUI',medic:'Ca(OH)₂',obtur:'Cone único + biocerâmico',selam:'Resina composta',ctrl:'Rx 3,6,12m'},res:{mot:'Dor espontânea / sensibilidade à percussão',hip:'Necrose pulpar com envolvimento periapical'}},retrat:{name:'Retratamento',ico:'🔄',diag:{pri:'Tratamento endodôntico prévio insatisfatório',dif:'Fratura radicular, perfuração'},plano:{obj:'Remoção material obturador e reobturação',cond:'Retratamento'},proto:{irrigP:'NaOCl 5,25%',irrigC:'EDTA 17% + CHX 2%',ativ:'XP-Endo Finisher + PUI',medic:'Ca(OH)₂ 14-21d',obtur:'Condensação vertical aquecida',ctrl:'Rx 3,6,12,24m'},res:{mot:'Persistência de sintomas pós-tratamento',hip:'Falha do tratamento anterior'}},controle:{name:'Controle',ico:'📋',diag:{pri:'Acompanhamento pós-operatório'},plano:{obj:'Avaliar reparo periapical',cond:'Controle clínico e radiográfico'},res:{mot:'Controle pós-tratamento',hip:'Verificar reparo'}},dor:{name:'Dor Persistente',ico:'⚡',diag:{pri:'Dor pós-operatória persistente',dif:'Fratura, canal perdido, neuropática'},plano:{obj:'Identificar causa',cond:'Avaliação + CBCT se necessário'},res:{mot:'Dor persistente após endodontia',hip:'Etiologia a investigar'}},fratura:{name:'Susp. Fratura',ico:'💔',diag:{pri:'Suspeita de fratura radicular vertical',dif:'Periodontite apical, reabsorção'},plano:{obj:'Confirmar/descartar FRV',cond:'CBCT + sondagem + transiluminação'},res:{mot:'Dor localizada, bolsa isolada',hip:'Suspeita de FRV'}},inicial:{name:'Avaliação',ico:'🔍',diag:{pri:''},plano:{obj:'Avaliação endodôntica inicial',cond:'Exame clínico + testes + Rx'},res:{mot:'Avaliação endodôntica',hip:''}}};
var LIMA_P={ptg:{n:'ProTaper Gold',sis:'ProTaper Gold (Dentsply)',seq:'SX,S1,S2,F1,F2,F3',ini:'#15(S1)',fin:'#30(F3)'},wog:{n:'WaveOne Gold',sis:'WaveOne Gold (Dentsply)',seq:'Primary(025/.07)',ini:'Glide #10',fin:'#25'},rb:{n:'Reciproc Blue',sis:'Reciproc Blue (VDW)',seq:'R25',ini:'Glide #10-15',fin:'#25'},ptn:{n:'ProTaper Next',sis:'ProTaper Next (Dentsply)',seq:'X1,X2,X3',ini:'Glide #10',fin:'#30(X3)'},man:{n:'K-Files',sis:'Limas K manuais',seq:'#10,#15,#20,#25,#30,#35',ini:'#10',fin:'#35'},xps:{n:'XP-Endo',sis:'XP-Endo Shaper (FKG)',seq:'#30/.01 exp.',ini:'Glide #15',fin:'#30'}};

// ═══ STATE ═══
window.rxPfState={pac:{nome:'',idade:'',sexo:'',id:'',data:'',queixa:''},prof:{nome:'',cro:'',clin:'',cont:''},res:{mot:'',hip:'',sint:'',hist:''},diag:{pri:'',dif:'',obs:''},plano:{obj:'',cond:'',lim:''},limas:{dente:'',crd:'',crt:'',cpa:'',cad:'',ini:'',fin:'',seq:'',sis:'',irrig:'',medic:'',obs:''},proto:{isolam:true,acesso:'',paten:'',instrum:'',irrigP:'NaOCl 2,5%',irrigC:'EDTA 17%',ativ:'',medic:'',obtur:'',selam:'',ctrl:'',obs:''},conc:{res:'',prox:''},items:[],fotos:[]};
function rxPfSave(){try{localStorage.setItem('endo-rx-pf4',JSON.stringify(rxPfState));}catch(e){}}
function rxPfLoad(){try{var s=localStorage.getItem('endo-rx-pf4');if(s)Object.assign(rxPfState,JSON.parse(s));}catch(e){}}
rxPfLoad();
function rxPfAddItem(t,d,l,m){rxPfState.items.push({type:t,du:d||'',lbl:l||'',met:m||{},ts:Date.now()});rxPfSave();try{_rxRI();}catch(e){}showToast('📁 Portfolio 2D');}
function _rxRI(){var t=document.getElementById('rpf-items');if(!t)return;if(!rxPfState.items.length){t.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,.2);text-align:center;padding:12px">Use 📸 Capturar</div>';return;}var h='';rxPfState.items.forEach(function(it,i){h+='<div class="pf-item-card">'+(it.du?'<img class="pf-item-thumb" src="'+it.du+'">':'')+'<div class="pf-item-info"><div class="pf-item-type" style="color:rgba(74,144,226,.7)">'+it.type+'</div><div class="pf-item-desc">'+it.lbl+'</div></div><button class="pf-item-remove" onclick="rxPfState.items.splice('+i+',1);rxPfSave();_rxRI();">✕</button></div>';});t.innerHTML=h;}
// --- PATCH: Fotos Clínicas (Grandes + Legenda) ---
function _rxRF() {
    var g = document.getElementById('rpf-fotos');
    if (!g) return;
    
    // Converte strings legadas em objetos (compatibilidade com salvamentos antigos)
    rxPfState.fotos = rxPfState.fotos.map(function(f) { 
        return typeof f === 'string' ? {url: f, leg: ''} : f; 
    });

    var h = '';
    rxPfState.fotos.forEach(function(f, i) {
        h += '<div style="margin-bottom:16px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:12px; position:relative;">';
        h += '<img src="' + f.url + '" style="width:100%; border-radius:10px; max-height:350px; object-fit:contain; background:#000; box-shadow:inset 0 0 10px rgba(0,0,0,0.8);">';
        h += '<input type="text" placeholder="Adicionar legenda clínica..." value="' + f.leg + '" oninput="rxPfUpdLeg(' + i + ', this.value)" style="width:100%; margin-top:10px; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#fff; font-size:12px; outline:none; font-family:-apple-system, sans-serif;">';
        h += '<button onclick="rxPfState.fotos.splice(' + i + ',1); rxPfSave(); _rxRF();" style="position:absolute; top:20px; right:20px; background:rgba(255,60,60,0.8); color:#fff; border:none; border-radius:50%; width:28px; height:28px; font-size:14px; font-weight:bold; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.5); backdrop-filter:blur(4px);">✕</button>';
        h += '</div>';
    });
    h += '<div class="pf-add-photo" style="width:100%; height:auto; padding:20px; font-size:14px; font-weight:700; color:#4A90E2; border-color:rgba(74,144,226,0.3); background:rgba(74,144,226,0.05);" onclick="document.getElementById(\'rpf-fi\').click()">📸 ADICIONAR FOTO CLÍNICA</div>';
    g.innerHTML = h;
    // Força o grid a ser 1 coluna para as fotos ficarem grandes
    g.style.display = 'block'; 
}

window.rxPfPhotos = function(files) {
    if (!files) return;
    Array.from(files).forEach(function(f) {
        var r = new FileReader();
        r.onload = function(e) {
            rxPfState.fotos.push({url: e.target.result, leg: ''});
            rxPfSave(); _rxRF();
        };
        r.readAsDataURL(f);
    });
};

window.rxPfUpdLeg = function(i, val) {
    rxPfState.fotos[i].leg = val;
    rxPfSave();
};
// ------------------------------------------------
// ═══ MODAL ═══
window.openRXPortfolio = function() {
    rxPfLoad();
    
    if (!rxPfState.pac.data || rxPfState.pac.data.trim() === '') {
        rxPfState.pac.data = new Date().toLocaleDateString('pt-BR');
    }

    var m = document.getElementById('rx-portfolio-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'rx-portfolio-modal';
        m.innerHTML = _bldPf();
        document.body.appendChild(m);
    }
    
    _rxPop();
    _rxRI();
    _rxRF();
    m.classList.add('active');

    setTimeout(() => {
        const rxDateInput = document.getElementById('rpf-pac-data');
        if (rxDateInput) {
            rxDateInput.addEventListener('input', function() { window.applyDateMask(this); });
        }
    }, 100);
};
window.closeRXPortfolio=function(){_rxCol();rxPfSave();var m=document.getElementById('rx-portfolio-modal');if(m)m.classList.remove('active');};

function _bldPf(){var S=function(id,t,b,c){return'<div class="pf-section'+(c?' collapsed':'')+'" id="rpf-s-'+id+'"><div class="pf-section-head" onclick="this.parentElement.classList.toggle(\'collapsed\')"><div class="pf-section-title">'+t+'</div><div class="pf-section-arrow">▾</div></div><div class="pf-section-body">'+b+'</div></div>';};var F=function(id,l,p,ta){return'<div class="pf-field"><label class="pf-label">'+l+'</label>'+(ta?'<textarea class="pf-textarea" id="rpf-'+id+'" placeholder="'+(p||'')+'"></textarea>':'<input class="pf-input" id="rpf-'+id+'" placeholder="'+(p||'')+'">')+'</div>';};var P=function(id,l,p){return'<div class="rx-proto-row"><div class="rx-proto-lbl">'+l+'</div><input class="rx-proto-inp" id="rpf-p-'+id+'" placeholder="'+(p||'')+'"></div>';};
var h='<div class="pf-header"><div class="pf-title" style="color:#4A90E2">📁 Portfolio Radiográfico 2D</div><button onclick="closeRXPortfolio()" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer">✕</button></div><div class="pf-body">';
var tH='<div class="rx-tpl-grid">';for(var k in TPLS)tH+='<div class="rx-tpl-btn" onclick="rxApplyTpl(\''+k+'\')"><div class="tpl-ico">'+TPLS[k].ico+'</div><div class="tpl-name">'+TPLS[k].name+'</div></div>';tH+='</div>';
h+=S('tpl','🗂 Templates',tH);
h+=S('pac','👤 Paciente',F('pac-nome','Nome','Paciente')+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+F('pac-idade','Idade','35')+F('pac-sexo','Sexo','M/F')+'</div>'+F('pac-id','Prontuário','ID')+F('pac-data','Data','DD/MM/AAAA')+F('pac-queixa','Queixa','',1));
h+=S('prof','🩺 Profissional',F('prof-nome','Nome','Dr(a)')+F('prof-cro','CRO','CRO-UF')+F('prof-clin','Clínica','')+F('prof-cont','Contato',''),1);
h+=S('res','📋 Resumo',F('res-mot','Motivo','',1)+F('res-hip','Hipótese','',1)+F('res-sint','Sintomas','',1)+F('res-hist','Histórico','',1)+'<button onclick="rxAutoSummary()" style="margin-top:6px;background:rgba(74,144,226,.12);border:1px solid rgba(74,144,226,.3);color:#4A90E2;font-size:10px;font-weight:800;padding:8px 12px;border-radius:8px;cursor:pointer;width:100%">✨ Gerar Resumo</button>');
h+=S('items','📎 Imagens','<div class="pf-items-tray" id="rpf-items"><div style="font-size:10px;color:rgba(255,255,255,.2);text-align:center;padding:12px">Use 📸 Capturar</div></div>');
h+=S('fotos','📷 Fotos Clínicas','<div class="pf-photos-grid" id="rpf-fotos"><div class="pf-add-photo" onclick="document.getElementById(\'rpf-fi\').click()">+</div></div><input type="file" id="rpf-fi" accept="image/*" multiple style="display:none" onchange="rxPfPhotos(this.files)">');
h+=S('diag','🎯 Diagnóstico',F('diag-pri','Principal','',1)+F('diag-dif','Diferencial','',1)+F('diag-obs','Obs','',1));
h+=S('plano','📐 Plano',F('pl-obj','Objetivo','',1)+F('pl-cond','Conduta','',1)+F('pl-lim','Riscos/Limitações','',1));
var lpH='';for(var lk in LIMA_P)lpH+='<span class="rx-preset-chip" onclick="rxLimaP(\''+lk+'\')">'+LIMA_P[lk].n+'</span>';
h+=S('limas','🔧 Limas',lpH+'<div class="rx-lima-grid">'+F('li-dente','Dente','46')+F('li-crd','CRD','mm')+F('li-crt','CRT','mm')+F('li-cpa','CPA','mm')+F('li-cad','CAD','mm')+F('li-ini','Lima Ini','#10')+F('li-fin','Lima Fin','#35')+'</div>'+F('li-seq','Sequência','')+F('li-sis','Sistema','')+F('li-irrig','Irrigantes','NaOCl 2,5%')+F('li-medic','Medicação','Ca(OH)₂')+F('li-obs','Obs','',1)+'<button onclick="rxAutoLimas()" style="margin-top:6px;background:rgba(74,144,226,.12);border:1px solid rgba(74,144,226,.3);color:#4A90E2;font-size:10px;font-weight:800;padding:8px 12px;border-radius:8px;cursor:pointer">↻ Dados do Módulo 2D</button>');
h+=S('proto','📝 Protocolo','<div style="font-size:9px;color:rgba(255,255,255,.3);margin-bottom:8px;font-style:italic">Ref: ESE 2023, AAE</div><div class="rx-proto-row"><input type="checkbox" style="width:18px;height:18px;accent-color:#4A90E2" id="rpf-p-isolam" checked><div class="rx-proto-lbl">Isolamento</div><div style="flex:1;font-size:10px;color:rgba(255,255,255,.4)">Dique + grampo</div></div>'+P('acesso','Acesso','Broca esf. + Endo-Z')+P('paten','Patência','#10 + PathFile')+P('instrum','Instrumentação','')+P('irrigP','Irrigação','NaOCl 2,5%')+P('irrigC','Quelante','EDTA 17%')+P('ativ','Ativação','PUI / XP-Endo')+P('medic','Medicação','Ca(OH)₂')+P('obtur','Obturação','Biocerâmico')+P('selam','Selamento','CIV + resina')+P('ctrl','Controle','Rx 6,12,24m')+F('p-obs','Obs','',1),1);
h+=S('conc','✅ Conclusão',F('conc-res','Resumo Final','',1)+F('conc-prox','Próximos Passos','',1));
h+='</div><div class="pf-footer"><button class="pf-footer-btn pf-btn-save" style="background:linear-gradient(135deg,rgba(74,144,226,.5),rgba(40,100,200,.35));border-color:rgba(74,144,226,.5)" onclick="_rxCol();rxPfSave();showToast(\'💾 Salvo\')">💾 Salvar</button><button class="pf-footer-btn pf-btn-export" onclick="openRXExport()">📤 Exportar</button><button class="pf-footer-btn" style="background:rgba(255,155,200,.1);color:#ff9bc8;border:1px solid rgba(255,155,200,.3);font-size:10px" onclick="openRXApres()">🎬 Apresentação</button></div>';
return h;}

function _rxCol(){var s=rxPfState,g=function(id){var e=document.getElementById('rpf-'+id);return e?e.value:'';},gc=function(id){var e=document.getElementById('rpf-'+id);return e?!!e.checked:false;};s.pac={nome:g('pac-nome'),idade:g('pac-idade'),sexo:g('pac-sexo'),id:g('pac-id'),data:g('pac-data'),queixa:g('pac-queixa')};s.prof={nome:g('prof-nome'),cro:g('prof-cro'),clin:g('prof-clin'),cont:g('prof-cont')};s.res={mot:g('res-mot'),hip:g('res-hip'),sint:g('res-sint'),hist:g('res-hist')};s.diag={pri:g('diag-pri'),dif:g('diag-dif'),obs:g('diag-obs')};s.plano={obj:g('pl-obj'),cond:g('pl-cond'),lim:g('pl-lim')};s.limas={dente:g('li-dente'),crd:g('li-crd'),crt:g('li-crt'),cpa:g('li-cpa'),cad:g('li-cad'),ini:g('li-ini'),fin:g('li-fin'),seq:g('li-seq'),sis:g('li-sis'),irrig:g('li-irrig'),medic:g('li-medic'),obs:g('li-obs')};s.proto={isolam:gc('p-isolam'),acesso:g('p-acesso'),paten:g('p-paten'),instrum:g('p-instrum'),irrigP:g('p-irrigP'),irrigC:g('p-irrigC'),ativ:g('p-ativ'),medic:g('p-medic'),obtur:g('p-obtur'),selam:g('p-selam'),ctrl:g('p-ctrl'),obs:g('p-obs')};s.conc={res:g('conc-res'),prox:g('conc-prox')};}
function _rxPop(){var s=rxPfState,se=function(id,v){var e=document.getElementById('rpf-'+id);if(e)e.value=v||'';},sc=function(id,v){var e=document.getElementById('rpf-'+id);if(e)e.checked=!!v;};se('pac-nome',s.pac.nome);se('pac-idade',s.pac.idade);se('pac-sexo',s.pac.sexo);se('pac-id',s.pac.id);se('pac-data',s.pac.data);se('pac-queixa',s.pac.queixa);se('prof-nome',s.prof.nome);se('prof-cro',s.prof.cro);se('prof-clin',s.prof.clin);se('prof-cont',s.prof.cont);se('res-mot',s.res.mot);se('res-hip',s.res.hip);se('res-sint',s.res.sint);se('res-hist',s.res.hist);se('diag-pri',s.diag.pri);se('diag-dif',s.diag.dif);se('diag-obs',s.diag.obs);se('pl-obj',s.plano.obj);se('pl-cond',s.plano.cond);se('pl-lim',s.plano.lim);se('li-dente',s.limas.dente);se('li-crd',s.limas.crd);se('li-crt',s.limas.crt);se('li-cpa',s.limas.cpa);se('li-cad',s.limas.cad);se('li-ini',s.limas.ini);se('li-fin',s.limas.fin);se('li-seq',s.limas.seq);se('li-sis',s.limas.sis);se('li-irrig',s.limas.irrig);se('li-medic',s.limas.medic);se('li-obs',s.limas.obs);sc('p-isolam',s.proto.isolam);se('p-acesso',s.proto.acesso);se('p-paten',s.proto.paten);se('p-instrum',s.proto.instrum);se('p-irrigP',s.proto.irrigP);se('p-irrigC',s.proto.irrigC);se('p-ativ',s.proto.ativ);se('p-medic',s.proto.medic);se('p-obtur',s.proto.obtur);se('p-selam',s.proto.selam);se('p-ctrl',s.proto.ctrl);se('p-obs',s.proto.obs);se('conc-res',s.conc.res);se('conc-prox',s.conc.prox);}

// Actions
window.rxApplyTpl=function(k){var t=TPLS[k];if(!t)return;_rxCol();var s=rxPfState;if(t.diag){if(t.diag.pri)s.diag.pri=t.diag.pri;if(t.diag.dif)s.diag.dif=t.diag.dif;}if(t.plano){if(t.plano.obj)s.plano.obj=t.plano.obj;if(t.plano.cond)s.plano.cond=t.plano.cond;}if(t.proto)for(var pk in t.proto)if(t.proto[pk])s.proto[pk]=t.proto[pk];if(t.res){if(t.res.mot&&!s.res.mot)s.res.mot=t.res.mot;if(t.res.hip&&!s.res.hip)s.res.hip=t.res.hip;}_rxPop();showToast('✓ '+t.name);};
window.rxLimaP=function(k){var p=LIMA_P[k];if(!p)return;var se=function(id,v){var e=document.getElementById('rpf-'+id);if(e)e.value=v||'';};se('li-sis',p.sis);se('li-seq',p.seq);se('li-ini',p.ini);se('li-fin',p.fin);showToast('✓ '+p.n);};
window.rxAutoLimas=function(){if(!RX2DEngine.isCalibrated){showToast('⚠ Calibre primeiro');return;}var px=0;if(RX2DEngine.lineStart&&RX2DEngine.lineEnd)px=Math.hypot(RX2DEngine.lineEnd.x-RX2DEngine.lineStart.x,RX2DEngine.lineEnd.y-RX2DEngine.lineStart.y);else if(RX2DEngine.measurePts.length>1)for(var i=1;i<RX2DEngine.measurePts.length;i++)px+=Math.hypot(RX2DEngine.measurePts[i].x-RX2DEngine.measurePts[i-1].x,RX2DEngine.measurePts[i].y-RX2DEngine.measurePts[i-1].y);if(!px){showToast('⚠ Faça medição');return;}var mm=px*RX2DEngine.calibrationFactor,se=function(id,v){var e=document.getElementById('rpf-'+id);if(e)e.value=v;};se('li-crd',mm.toFixed(2));se('li-crt',(mm-1).toFixed(2));se('li-cpa',(mm+.5).toFixed(2));se('li-cad',(mm-1).toFixed(2));showToast('✓ Dados do módulo 2D');};

// ═══ RESUMO SEMI-AUTOMÁTICO (fix: expande seção + scroll) ═══
window.rxAutoSummary=function(){
    try{_rxCol();}catch(e){}
    var s=rxPfState,p=[];
    if(s.pac.nome)p.push('Paciente '+s.pac.nome+(s.pac.idade?', '+s.pac.idade+' anos':'')+'.');
    if(s.res.mot)p.push('Motivo: '+s.res.mot+'.');
    if(s.res.hip)p.push('Hipótese: '+s.res.hip+'.');
    if(s.diag.pri)p.push('Diagnóstico: '+s.diag.pri+'.');
    if(s.diag.dif)p.push('DD: '+s.diag.dif+'.');
    if(s.plano.obj)p.push('Conduta: '+s.plano.obj+'.');
    if(s.limas.crd)p.push('CRD='+s.limas.crd+'mm, CRT='+(s.limas.crt||'--')+'mm.');
    if(s.limas.sis)p.push('Sistema: '+s.limas.sis+'.');
    if(s.items.length)p.push(s.items.length+' imagem(ns).');
    var txt=p.join(' ')||'Preencha os campos para gerar resumo.';
    // Expand conclusion section if collapsed
    var sec=document.getElementById('rpf-s-conc');
    if(sec&&sec.classList.contains('collapsed'))sec.classList.remove('collapsed');
    var el=document.getElementById('rpf-conc-res');
    if(el){el.value=txt;el.style.height='auto';el.style.height=el.scrollHeight+'px';el.scrollIntoView({behavior:'smooth',block:'center'});}
    showToast('✨ Resumo gerado');
};

// ═══ EXPORT ═══
window.openRXExport=function(){var m=document.getElementById('rx-export-menu-modal');if(!m){m=document.createElement('div');m.id='rx-export-menu-modal';m.innerHTML='<div class="export-menu-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-size:16px;font-weight:900;color:#4A90E2">📤 Exportar</div><button onclick="document.getElementById(\'rx-export-menu-modal\').classList.remove(\'active\')" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer">✕</button></div><div class="export-opt" onclick="rxExportPDF()"><div class="export-opt-ico">📄</div><div class="export-opt-txt"><div class="export-opt-t">PDF Premium</div><div class="export-opt-s">Relatório com capa + protocolo</div></div></div><div class="export-opt" onclick="rxExportHTML()"><div class="export-opt-ico">🌐</div><div class="export-opt-txt"><div class="export-opt-t">HTML Standalone</div><div class="export-opt-s">Apresentação dark mode</div></div></div><div class="export-opt" onclick="rxShare()"><div class="export-opt-ico">📲</div><div class="export-opt-txt"><div class="export-opt-t">Compartilhar</div><div class="export-opt-s">WhatsApp com documento</div></div></div></div>';document.body.appendChild(m);}m.classList.add('active');};

// ═══ SHARE — gera HTML e compartilha como arquivo ═══
// ═══ SHARE — gera HTML e compartilha como arquivo ═══
// ═══ SHARE — GERA TEXTO E ABRE WHATSAPP DIRETAMENTE ═══
window.rxShare=function(){
    try{document.getElementById('rx-export-menu-modal').classList.remove('active');}catch(e){}
    _rxCol(); 
    var s=rxPfState;
    
    // 1. Cria um texto estruturado para o WhatsApp
    var texto = "🦷 *EndoSlice Pro - Caso Clínico*\n\n";
    if(s.pac.nome) texto += "👤 *Paciente:* " + s.pac.nome + "\n";
    if(s.diag.pri) texto += "🎯 *Diagnóstico:* " + s.diag.pri + "\n";
    if(s.plano.cond) texto += "📐 *Plano:* " + s.plano.cond + "\n";
    if(s.limas.crd) texto += "📏 *CRD:* " + s.limas.crd + "mm | *CRT:* " + (s.limas.crt||'--') + "mm\n";
    texto += "\n📄 _O laudo foi gerado e salvo no seu aparelho. Anexe o arquivo PDF ou HTML nesta conversa!_";
    
    var encodedText = encodeURIComponent(texto);
    var htmlContent = _buildShareHTML(s);
    var blob = new Blob([htmlContent],{type:'text/html'});
    var fileName = 'EndoSlice_Laudo_' + (s.pac.nome||'Caso').replace(/\s+/g,'_') + '.html';
    
    // 2. Tenta usar a aba de compartilhamento nativa (iOS/Android)
    if(navigator.share && navigator.canShare){
        var file = new File([blob], fileName, {type:'text/html'});
        navigator.share({
            title: 'Laudo EndoSlice',
            text: texto,
            files: [file]
        }).catch(function(){
            fallbackWa();
        });
    } else {
        fallbackWa();
    }

    // 3. Fallback: Baixa o arquivo silenciosamente e FORÇA a abertura do WhatsApp
    function fallbackWa() {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        
        setTimeout(function(){
            window.location.href = "whatsapp://send?text=" + encodedText;
        }, 400);
        showToast('Abrindo WhatsApp...');
    }
};

// HTML simplificado para enviar junto caso o usuário queira
function _buildShareHTML(s){
    var dt=new Date().toLocaleDateString('pt-BR');
    var css='*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#f8fafc;line-height:1.6}.c{max-width:720px;margin:auto;padding:20px}.cv{background:linear-gradient(135deg,#1e3a8a,#3b82f6);padding:30px 20px;border-radius:20px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.3)}.cv h1{font-size:24px;font-weight:900;letter-spacing:1px;margin-bottom:8px;color:#fff}.cv .sub{color:#93c5fd;font-size:13px;font-weight:600}.sl{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:20px;margin-top:20px}.sh{font-size:14px;color:#60a5fa;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:8px}.sb{font-size:13px}.t b{color:#94a3b8}.im{width:100%;margin-top:16px;background:#000;border-radius:12px;display:block;max-height:60vh;object-fit:contain}.ft{font-size:8px;color:#444;text-align:center;padding:20px 0;margin-top:20px}.img-leg{padding:12px;background:#0f172a;color:#cbd5e1;font-size:12px;font-style:italic;text-align:center;border-radius:0 0 12px 12px}';

    var h='<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laudo - '+(s.pac.nome||'Paciente')+'<\/title><style>'+css+'<\/style><\/head><body><div class="c">';
    h+='<div class="cv"><h1>EndoSlice Pro<\/h1><div class="sub">Relatório Radiográfico - '+dt+'<\/div>';
    if(s.pac.nome) h+='<div style="margin-top:12px;font-size:15px;font-weight:700;color:#fff">'+s.pac.nome+'<\/div>';
    h+='<\/div>';

    if(s.diag.pri) h+='<div class="sl"><div class="sh">🎯 Diagnóstico<\/div><div class="sb"><div class="t"><b>Principal:<\/b> '+s.diag.pri+'<\/div><\/div><\/div>';

    s.items.forEach(function(it){
        h+='<div class="sl"><div class="sh">📎 '+it.type+'<\/div><div class="sb"><div class="t">'+it.lbl+'<\/div>'+(it.du?'<img class="im" src="'+it.du+'">':'')+'<\/div><\/div>';
    });

    if(s.fotos && s.fotos.length > 0){
        s.fotos.forEach(function(f, i){
            var url = typeof f === 'string' ? f : f.url;
            var leg = typeof f === 'string' ? '' : f.leg;
            h+='<div class="sl"><div class="sh">📷 Foto Clínica '+(i+1)+'<\/div><div class="sb"><img class="im" src="'+url+'" style="margin-top:0;border-radius:12px 12px 0 0;">';
            h+='<div class="img-leg">'+(leg||'Registro clínico')+'<\/div><\/div><\/div>';
        });
    }

    h+='<div class="ft">EndoSlice Pro<\/div><\/div><\/body><\/html>';
    return h;
}

// ═══ PDF PREMIUM NEUMÓRFICO (MÉTRICAS INDIVIDUAIS) ═══
window.rxExportPDF=function(){
    try{document.getElementById('rx-export-menu-modal').classList.remove('active');}catch(e){}
    closeRXPortfolio(); _rxCol(); var s = rxPfState, dt = new Date().toLocaleDateString('pt-BR');

    var c = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#E0E5EC;color:#4A5568;max-width:900px;margin:auto;padding:30px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.cover{background:#E0E5EC;border-radius:30px;box-shadow:12px 12px 24px #a3b1c6,-12px -12px 24px #ffffff;padding:50px 40px;text-align:center;margin-bottom:40px;border:3px solid rgba(255,255,255,0.6)}'
    + '.cover h1{font-size:34px;font-weight:900;color:#4A90E2;letter-spacing:2px;margin-bottom:8px}'
    + '.cover p{font-size:12px;color:#7A8294;text-transform:uppercase;letter-spacing:3px;font-weight:800}'
    + '.cover .pac{font-size:24px;font-weight:800;color:#2D3748;margin-top:35px}'
    + '.cover .dt{font-size:13px;color:#A0AEC0;margin-top:8px;font-weight:600}'
    + '.section{background:#E0E5EC;border-radius:24px;box-shadow:8px 8px 16px #a3b1c6,-8px -8px 16px #ffffff;padding:35px;margin-bottom:35px;page-break-inside:avoid}'
    + '.sec-title{font-size:16px;font-weight:900;color:#4A90E2;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid rgba(74,144,226,0.2);padding-bottom:10px;margin-bottom:20px}'
    + '.row{font-size:14px;color:#4A5568;margin-bottom:10px;display:flex;align-items:baseline}'
    + '.row b{color:#2D3748;min-width:140px;font-weight:800}'
    + '.img-card{background:#E0E5EC;border-radius:18px;box-shadow:inset 6px 6px 12px #a3b1c6,inset -6px -6px 12px #ffffff;padding:15px;margin-bottom:25px;page-break-inside:avoid}'
    + '.img-card img{width:100%;max-height:450px;object-fit:contain;background:#000;border-radius:12px;display:block}'
    + '.img-legend{padding:14px 10px 4px;font-size:13px;font-style:italic;color:#718096;text-align:center;font-weight:600}'
    + '.odonto-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}'
    + '.odonto-card{border-radius:12px;padding:14px;text-align:center;border:1.5px solid;box-shadow:0 4px 10px rgba(0,0,0,0.05)}'
    + '.odonto-lbl{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}'
    + '.odonto-val{font-size:32px;font-weight:900;font-family:"Courier New",monospace;line-height:1.15}'
    + '.odonto-fml{background:#f5f8ff;border-radius:10px;padding:14px;font-size:11px;color:#4A5568;line-height:1.8;margin-bottom:18px;border:1px solid #bfdbfe}'
    + '.table-proto{width:100%;border-collapse:collapse;margin:15px 0}.table-proto td{padding:12px 15px;font-size:13px;border-bottom:1px solid rgba(163,177,198,0.3)}.table-proto td:first-child{font-weight:800;color:#2D3748;width:180px}'
    + '.footer{text-align:center;font-size:11px;color:#A0AEC0;padding:20px 0;margin-top:40px;font-weight:800;letter-spacing:1px;text-transform:uppercase}'
    + '.print-btn{display:block;margin:30px auto;background:#E0E5EC;color:#4A90E2;border:none;padding:18px 50px;border-radius:999px;font-weight:900;font-size:16px;cursor:pointer;box-shadow:6px 6px 14px #a3b1c6,-6px -6px 14px #ffffff;transition:all 0.2s}'
    + '.print-btn:active{box-shadow:inset 4px 4px 8px #a3b1c6,inset -4px -4px 8px #ffffff;color:#2D3748}'
    + '@media print{.print-btn{display:none}body{background:#fff;padding:0}.cover,.section{box-shadow:none;border:1px solid #e2e8f0}.img-card,.odonto-card{box-shadow:none;border:1px solid #e2e8f0}.odonto-fml{background:#f8fafc}}';

    var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Laudo - '+s.pac.nome+'<\/title><style>'+c+'<\/style><\/head><body>'
    + '<div class="cover"><h1>EndoSlice Pro<\/h1><p>Relatório de Radiologia 2D<\/p>'
    + '<div class="pac">'+(s.pac.nome||'Paciente')+'<\/div><div class="dt">'+dt+' • '+(s.prof.nome||'Dr(a)')+'<\/div><\/div>';

    var A = function(t,b){ if(b.trim()) h+='<div class="section"><div class="sec-title">'+t+'<\/div>'+b+'<\/div>'; };
    
    var rxImages = []; var odontoItems = [];
    s.items.forEach(function(it){
        if(it.met && Object.keys(it.met).length > 0) { odontoItems.push(it); } 
        else { rxImages.push(it); }
    });

    A('1. Avaliação Clínica', (s.pac.idade?'<div class="row"><b>Idade/Sexo:<\/b> '+s.pac.idade+' '+(s.pac.sexo||'')+'<\/div>':'')+(s.res.mot?'<div class="row"><b>Motivo:<\/b> '+s.res.mot+'<\/div>':'')+(s.diag.pri?'<div class="row"><b>Diagnóstico:<\/b> '+s.diag.pri+'<\/div>':'')+(s.plano.cond?'<div class="row"><b>Conduta:<\/b> '+s.plano.cond+'<\/div>':''));

    if(rxImages.length){
        var ic = '';
        rxImages.forEach(function(it){ ic += '<div class="img-card">' + (it.du?'<img src="'+it.du+'">':'') + '<div class="img-legend"><b>'+it.type+'<\/b> — '+it.lbl+'<\/div><\/div>'; });
        A('2. Imagens Radiográficas', ic);
    }
    
    if(s.fotos.length){
        var fc = '';
        s.fotos.forEach(function(f){
            var url = typeof f==='string'?f:f.url;
            var leg = typeof f==='string'?'Registro Clínico':(f.leg||'Registro Clínico');
            fc += '<div class="img-card"><img src="'+url+'"><div class="img-legend">'+leg+'<\/div><\/div>';
        });
        A('3. Fotos Clínicas', fc);
    }

    A('4. Diagnóstico', (s.diag.pri?'<div class="row"><b>Principal:<\/b> '+s.diag.pri+'<\/div>':'')+(s.diag.dif?'<div class="row"><b>Diferencial:<\/b> '+s.diag.dif+'<\/div>':'')+(s.diag.obs?'<div class="row"><b>Obs:<\/b> '+s.diag.obs+'<\/div>':''));
    A('5. Plano de Tratamento', (s.plano.obj?'<div class="row"><b>Objetivo:<\/b> '+s.plano.obj+'<\/div>':'')+(s.plano.cond?'<div class="row"><b>Conduta:<\/b> '+s.plano.cond+'<\/div>':'')+(s.plano.lim?'<div class="row"><b>Riscos/Limit.:<\/b> '+s.plano.lim+'<\/div>':''));

    if(odontoItems.length > 0){
        var lc = '';
        odontoItems.forEach(function(it){
            lc += '<div class="img-card" style="border: 2px solid #4A90E2; box-shadow: 0 10px 20px rgba(74,144,226,0.15);">' + (it.du?'<img src="'+it.du+'">':'');
            lc += '<div class="img-legend" style="color:#4A90E2; font-size:14px;"><b>Medição Radiográfica<\/b> — '+it.lbl+'<\/div>';
            
            // GRID DE MÉTRICAS INDIVIDUAL PARA CADA IMAGEM
            lc += '<div class="odonto-grid" style="padding: 0 15px;">';
            if(it.met.CRD) lc+='<div class="odonto-card" style="border-color:#f0a800;background:#fffbf0;"><div class="odonto-lbl" style="color:#c88000;">CRD<\/div><div class="odonto-val" style="color:#c88000;">'+it.met.CRD+' mm<\/div><\/div>';
            if(it.met.CAD) lc+='<div class="odonto-card" style="border-color:#007AFF;background:#f0f7ff;"><div class="odonto-lbl" style="color:#007AFF;">CAD<\/div><div class="odonto-val" style="color:#007AFF;">'+it.met.CAD+' mm<\/div><\/div>';
            if(it.met.CRT) lc+='<div class="odonto-card" style="border-color:#34C759;background:#f0fff4;"><div class="odonto-lbl" style="color:#1e9e3c;">CRT<\/div><div class="odonto-val" style="color:#1e9e3c;">'+it.met.CRT+' mm<\/div><\/div>';
            if(it.met.CPA) lc+='<div class="odonto-card" style="border-color:#999;background:#f8f8f8;"><div class="odonto-lbl" style="color:#666;">CPA<\/div><div class="odonto-val" style="color:#444;">'+it.met.CPA+' mm<\/div><\/div>';
            lc += '<\/div><\/div>'; // fecha grid e img-card
        });
        A('6. Odontometria', lc);
    }

    var ins='';
    if(s.limas.dente && !odontoItems.length) ins += '<div class="row"><b>Dente Medido:<\/b> '+s.limas.dente+'<\/div>';
    if(s.limas.sis) ins+='<div class="row"><b>Sistema:<\/b> '+s.limas.sis+'<\/div>';
    if(s.limas.seq) ins+='<div class="row"><b>Sequência:<\/b> '+s.limas.seq+'<\/div>';
    if(s.limas.ini) ins+='<div class="row"><b>Lima Inicial:<\/b> '+s.limas.ini+'<\/div>';
    if(s.limas.fin) ins+='<div class="row"><b>Lima Final:<\/b> '+s.limas.fin+'<\/div>';
    if(s.limas.irrig) ins+='<div class="row"><b>Irrigantes:<\/b> '+s.limas.irrig+'<\/div>';
    if(s.limas.medic) ins+='<div class="row"><b>Medicação:<\/b> '+s.limas.medic+'<\/div>';
    A('7. Instrumentação', ins);

    var ptc='<table class="table-proto">';
    if(s.proto.isolam) ptc+='<tr><td>Isolamento<\/td><td>✓ Absoluto<\/td><\/tr>';
    [['acesso','Acesso'],['paten','Patência'],['instrum','Instrumentação'],['irrigP','Irrigação Principal'],['irrigC','Irrigação Complementar'],['ativ','Ativação'],['medic','Medicação'],['obtur','Obturação'],['selam','Selamento'],['ctrl','Controle']].forEach(function(p){if(s.proto[p[0]]) ptc+='<tr><td>'+p[1]+'<\/td><td>'+s.proto[p[0]]+'<\/td><\/tr>';});
    ptc+='<\/table>'; if(s.proto.obs) ptc+='<div class="row" style="margin-top:15px"><b>Obs:<\/b> '+s.proto.obs+'<\/div>';
    A('8. Protocolo Clínico', ptc);

    if(s.conc.res) A('9. Conclusão', '<div class="row">'+s.conc.res+(s.conc.prox?'<br><br><b>Próximos passos:<\/b> '+s.conc.prox:'')+'<\/div>');

    h += '<button class="print-btn" onclick="window.print()">🖨️ Salvar PDF / Imprimir<\/button>';
    h += '<div class="footer">Documento gerado digitalmente via plataforma EndoSlice Pro<\/div><\/body><\/html>';

    var w = window.open('','_blank'); if(!w){alert('Permita pop-ups no seu navegador para gerar o PDF.');return;}
    w.document.write(h); w.document.close();
    setTimeout(function(){try{w.print();}catch(e){}}, 600);
};

// ═══ HTML EXPORT ═══
window.rxExportHTML=function(){try{document.getElementById('rx-export-menu-modal').classList.remove('active');}catch(e){}_rxCol();var s=rxPfState;var html=_buildShareHTML(s);var blob=new Blob([html],{type:'text/html'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='EndoSlice_RX_'+(s.pac.nome||'Caso').replace(/\s+/g,'_')+'.html';document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);showToast('📤 HTML exportado');};

// ═══ APRESENTAÇÃO DE CASO (como módulo 3D) ═══
// ═══ APRESENTAÇÃO DE CASO PREMIUM ═══
window.openRXApres=function(){
    closeRXPortfolio();_rxCol();rxPfSave();
    var m=document.getElementById('rx-apresentacao');
    if(!m){m=document.createElement('div');m.id='rx-apresentacao';document.body.appendChild(m);}
    m.innerHTML=_buildApres();m.classList.add('active');
};
window.closeRXApres=function(){var m=document.getElementById('rx-apresentacao');if(m)m.classList.remove('active');};

// ═══ APRESENTAÇÃO DE CASO PREMIUM (COMPLETA) ═══
function _buildApres() {
    var s = rxPfState;
    
    // Header Fixo com Efeito Glassmorphism
    var h = '<div class="ap-header" style="display:flex;justify-content:space-between;align-items:center;padding:env(safe-area-inset-top,20px) 24px 16px;background:rgba(10,12,20,0.8);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);border-bottom:1px solid rgba(255,255,255,.05);position:sticky;top:0;z-index:10;">'
    + '<div style="font-size:18px;font-weight:900;background:linear-gradient(90deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">🎬 Caso Clínico<\/div>'
    + '<div style="display:flex;gap:8px">'
    + '<button onclick="rxExportHTML()" style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);color:#60a5fa;font-size:12px;font-weight:800;border-radius:10px;padding:8px 14px;cursor:pointer">HTML<\/button>'
    + '<button onclick="rxShare()" style="background:rgba(74,144,226,.15);border:1px solid rgba(74,144,226,.3);color:#60a5fa;font-size:12px;font-weight:800;border-radius:10px;padding:8px 14px;cursor:pointer">SHARE<\/button>'
    + '<button onclick="closeRXApres()" style="background:rgba(255,255,255,0.05);border:none;color:#fff;font-size:14px;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕<\/button>'
    + '<\/div><\/div>';
    
    // Estilos de Animação CSS embutidos
    h += '<style>'
    + '@keyframes fadeInUpAp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }'
    + '.ap-slide-card { margin-bottom:30px; border-radius:20px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); box-shadow:0 10px 40px rgba(0,0,0,0.4); overflow:hidden; animation:fadeInUpAp 0.6s ease forwards; opacity:0; }'
    + '.ap-slide-img { width:100%; border-radius:12px; box-shadow:0 8px 25px rgba(0,0,0,0.6); margin-bottom:12px; background:#000; object-fit:contain; max-height:50vh; display:block; }'
    + '.ap-metric-box { padding:10px; background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.3); border-radius:10px; text-align:center; flex:1; min-width:80px; }'
    + '.ap-metric-val { font-size:22px; font-weight:900; color:#60a5fa; font-family:monospace; line-height:1; margin-bottom:4px; }'
    + '.ap-metric-lbl { font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; font-weight:700; }'
    + '<\/style>';

    h += '<div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:24px 16px;background:radial-gradient(circle at top right, #111827, #020617);">';
    
    var delayIdx = 0; 
    function sl(title, bodyHtml) { 
        var d = (delayIdx * 0.15).toFixed(2); delayIdx++;
        return '<div class="ap-slide-card" style="animation-delay:' + d + 's;">'
             + '<div style="padding:16px 20px;background:linear-gradient(135deg,rgba(74,144,226,.08),rgba(96,165,250,.04));border-bottom:1px solid rgba(255,255,255,0.04)">'
             + '<div style="font-size:16px;font-weight:800;color:#e2e8f0;letter-spacing:1px;">' + title + '<\/div>'
             + '<\/div>'
             + '<div style="padding:20px">' + bodyHtml + '<\/div>'
             + '<\/div>'; 
    }
    var tx = function(t){ return '<div style="font-size:14px;color:#94a3b8;line-height:1.8">' + t + '<\/div>'; };

    // Filtra as Imagens
    var rxImages = []; var odontoImages = [];
    s.items.forEach(function(it){
        if(it.lbl.includes('CRD') || (it.met && Object.keys(it.met).length > 0)) { odontoImages.push(it); } 
        else { rxImages.push(it); }
    });

    // 1. Paciente e Resumo
    if(s.pac.nome) {
        var pb = '<strong style="color:#fff;font-size:18px;">' + s.pac.nome + '<\/strong>' + (s.pac.idade ? ' · ' + s.pac.idade + (s.pac.idade.includes('anos')?'':' anos') : '') + (s.pac.sexo ? ' · ' + s.pac.sexo : '');
        if(s.pac.queixa) pb += '<br><br><div style="padding:12px;background:rgba(96,165,250,0.1);border-left:3px solid #60a5fa;border-radius:0 8px 8px 0;color:#93c5fd;"><strong>Queixa:<\/strong> ' + s.pac.queixa + '<\/div>';
        if(s.res.mot) pb += '<br><strong style="color:#fff;">Motivo:<\/strong> ' + s.res.mot;
        if(s.res.hip) pb += '<br><strong style="color:#fff;">Hipótese:<\/strong> ' + s.res.hip;
        if(s.res.sint) pb += '<br><strong style="color:#fff;">Sintomas:<\/strong> ' + s.res.sint;
        h += sl('👤 Perfil Clínico', tx(pb));
    }

    // 2. Imagens Radiográficas
    if (rxImages.length > 0) {
        rxImages.forEach(function(it, idx){
            var ib = ''; if(it.du) ib += '<img src="' + it.du + '" class="ap-slide-img">';
            ib += '<div style="color:#cbd5e1;font-weight:600;font-size:14px;text-align:center;">' + it.lbl + '<\/div>';
            h += sl('<span style="color:#60a5fa">RADIOGRAFIA ' + (idx+1) + '<\/span>', ib);
        });
    }

    // 3. Fotos Clínicas
    if (s.fotos && s.fotos.length > 0) {
        var fb = '<div style="display:grid;grid-template-columns:1fr;gap:16px">';
        s.fotos.forEach(function(f){
            var url = typeof f === 'string' ? f : f.url;
            var leg = typeof f === 'string' ? '' : f.leg;
            fb += '<div><img src="' + url + '" class="ap-slide-img" style="object-fit:cover;max-height:40vh;margin-bottom:8px;">';
            if(leg) fb += '<div style="text-align:center;font-style:italic;color:#cbd5e1;font-size:13px;">"' + leg + '"<\/div>';
            fb += '<\/div>';
        });
        fb += '<\/div>';
        h += sl('<span style="color:#a78bfa">📷 FOTOS CLÍNICAS<\/span>', fb);
    }

    // 4. Diagnóstico
    if(s.diag.pri) {
        var db = '<strong style="color:#fff;">Principal:<\/strong> ' + s.diag.pri;
        if(s.diag.dif) db += '<br><strong style="color:#fff;">Diferencial:<\/strong> ' + s.diag.dif;
        h += sl('🎯 Diagnóstico', tx(db));
    }

    // 5. Plano 
    if(s.plano.cond || s.plano.obj) { 
        var plb = '';
        if (s.plano.obj) plb += '<strong style="color:#fff;">Objetivo:<\/strong> ' + s.plano.obj + '<br>';
        if (s.plano.cond) plb += '<strong style="color:#fff;">Conduta:<\/strong> ' + s.plano.cond;
        h += sl('📐 Plano de Ação', tx(plb)); 
    }

    // 6. Odontometria 
    if (odontoImages.length > 0 || s.limas.crd) {
        var ob = '';
        odontoImages.forEach(function(it){
            if(it.du) ob += '<img src="' + it.du + '" class="ap-slide-img" style="border: 2px solid #60a5fa;">';
            ob += '<div style="color:#60a5fa;font-weight:700;font-size:14px;text-align:center;margin-bottom:15px;">' + it.lbl + '<\/div>';
        });

        if(s.limas.dente) ob += '<strong style="color:#fff;font-size:14px;">Dente:<\/strong> <span style="color:#94a3b8;">' + s.limas.dente + '<\/span><br><br>';

        if(s.limas.crd || s.limas.crt || s.limas.cad || s.limas.cpa){
            ob += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px;">';
            ['crd','crt','cad','cpa'].forEach(function(k){
                if(s.limas[k]) {
                    var cor = k==='crd'?'#f0a800':k==='cad'?'#007AFF':k==='crt'?'#34C759':'#999';
                    ob += '<div class="ap-metric-box" style="border-color:rgba(255,255,255,0.1); background:rgba(255,255,255,0.02);"><div class="ap-metric-val" style="color:'+cor+'">' + s.limas[k] + '<\/div><div class="ap-metric-lbl">' + k.toUpperCase() + '<\/div><\/div>';
                }
            });
            ob += '<\/div>';
        }
        h += sl('📏 Odontometria', tx(ob));
    }

    // 7. Instrumentação
    if (s.limas.sis || s.limas.seq) {
        var ins = '';
        if(s.limas.sis) ins += '<strong style="color:#fff;">Sistema:<\/strong> ' + s.limas.sis + '<br>';
        if(s.limas.seq) ins += '<strong style="color:#fff;">Sequência:<\/strong> ' + s.limas.seq + '<br>';
        if(s.limas.ini) ins += '<strong style="color:#fff;">Lima Inicial:<\/strong> ' + s.limas.ini + '<br>';
        if(s.limas.fin) ins += '<strong style="color:#fff;">Lima Final:<\/strong> ' + s.limas.fin + '<br>';
        if(s.limas.irrig) ins += '<strong style="color:#fff;">Irrigantes:<\/strong> ' + s.limas.irrig + '<br>';
        if(s.limas.medic) ins += '<strong style="color:#fff;">Medicação:<\/strong> ' + s.limas.medic + '<br>';
        h += sl('🔧 Instrumentação', tx(ins));
    }

    // 8. Protocolo Clínico
    var protoCount = 0;
    var ptc = '<div style="display:grid;grid-template-columns:1fr;gap:10px;">';
    if(s.proto.isolam) { ptc += '<div style="padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;"><strong style="color:#fff;">Isolamento:<\/strong> ✓ Absoluto<\/div>'; protoCount++; }
    [['acesso','Acesso'],['paten','Patência'],['instrum','Instrumentação'],['irrigP','Irrigação Principal'],['irrigC','Irrigação Complementar'],['ativ','Ativação'],['medic','Medicação'],['obtur','Obturação'],['selam','Selamento'],['ctrl','Controle']].forEach(function(p){
        if(s.proto[p[0]]) { ptc += '<div style="padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;"><strong style="color:#fff;">' + p[1] + ':<\/strong> ' + s.proto[p[0]] + '<\/div>'; protoCount++; }
    });
    ptc += '<\/div>';
    if (protoCount > 0) h += sl('📝 Protocolo Endodôntico', tx(ptc));

    // 9. Conclusão
    if(s.conc.res){
        var cb = s.conc.res;
        if(s.conc.prox) cb += '<br><br><strong style="color:#fff;">Próximos passos:<\/strong> ' + s.conc.prox;
        h += sl('✅ Conclusão', tx(cb));
    }
    
    h += '<\/div>'; 
    return h;
}

// ═══ Init ═══
if(document.readyState==='complete'||document.readyState==='interactive')setTimeout(patchWhenReady,100);
else document.addEventListener('DOMContentLoaded',function(){setTimeout(patchWhenReady,100);});
console.log('[RX2D v4] Loaded');
})();}catch(e){console.error('[RX2D v4] FATAL:',e);}

// ==========================================================
// INJEÇÃO DOS GRIPS — SISTEMA UNIFICADO v2.0
// Usa addEventListener robusto (não onclick), seguro para iOS Safari
// ==========================================================
document.addEventListener("DOMContentLoaded", function() {
    // 1. Anula lógicas antigas de swipe que conflitam
    if (window._setupFabSwipe) window._setupFabSwipe = function(){};

    // 2. Helper: cria um grip e adiciona ao body
    function createGrip(id, content) {
        // Remove duplicata se existir
        var old = document.getElementById(id);
        if (old) old.remove();
        var el = document.createElement('div');
        el.id = id;
        el.className = 'ios-grip-hitbox';
        el.innerHTML = content;
        document.body.appendChild(el);
        return el;
    }

    // 3. Helper: bind de toque iOS-safe (toque simples via pointerup com fallback)
    function bindTap(el, handler) {
        var startX = 0, startY = 0, startTime = 0;
        
        el.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = Date.now();
            // NÃO usar preventDefault aqui para permitir :active CSS
        }, { passive: true });

        el.addEventListener('touchend', function(e) {
            var dx = Math.abs(e.changedTouches[0].clientX - startX);
            var dy = Math.abs(e.changedTouches[0].clientY - startY);
            var dt = Date.now() - startTime;
            // Aceita toque simples: deslocamento < 15px e duração < 500ms
            if (dx < 15 && dy < 15 && dt < 500) {
                e.preventDefault();
                e.stopPropagation();
                handler();
            }
        }, { passive: false });

        // Fallback click para desktop
        el.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    // 4. Cria os grips
    var gripL = createGrip('grip-left', '<div class="ios-grip-line"></div>');
    var gripR = createGrip('grip-right', '<div class="ios-grip-line"></div>');
    var gripB = createGrip('grip-bottom', '<div class="ios-grip-line"></div>');

    // 5. Bind das ações
    bindTap(gripL, function() { window.toggleLeft(); });
    bindTap(gripR, function() { window.toggleRight(); });
    bindTap(gripB, function() { window.showDock(); });

    // 6. Atualiza grip inferior no estado inicial
    setTimeout(function() {
        if (typeof _updateBottomGrip === 'function') _updateBottomGrip();
    }, 500);

    // 7. Observer para reagir a mudanças na class .hidden da dock
    var dockEl = document.getElementById('dockNav');
    if (dockEl && typeof MutationObserver !== 'undefined') {
        var obs = new MutationObserver(function() {
            if (typeof _updateBottomGrip === 'function') _updateBottomGrip();
        });
        obs.observe(dockEl, { attributes: true, attributeFilter: ['class'] });
    }

    console.log('[UI v2.0] Grips injetados com sucesso');
});
