
    // 1. INJETOR DO BOTÃO TOGGLE E LIMPEZA DE BOTÕES INÚTEIS
    (function injectLightModeToggle() {
        function tryInject() {
            const settingsMenu = document.querySelector('.settings-container');
            if (!settingsMenu) { setTimeout(tryInject, 500); return; }

            // --- REMOVER BOTÃO "INVERTER VERTICAL" ---
            const flipBtn = document.querySelector('button[onclick*="toggleVerticalFlip"]');
            if (flipBtn) {
                const label = flipBtn.previousElementSibling;
                if (label && label.classList.contains('widget-info')) {
                    label.remove(); // Remove o título "ORIENTAÇÃO"
                }
                flipBtn.remove(); // Remove o botão
            }

            // --- INJETAR BOTÃO LIGHT MODE ---
            if (document.getElementById('light-mode-toggle')) return; 

            const btn = document.createElement('button');
            btn.id = 'light-mode-toggle';
            btn.style.cssText = 'width:100%; padding:14px; background:linear-gradient(145deg, #FDFDFE, #E8EEF5); border:1px solid #FFF; border-radius:12px; color:#1E293B; font-weight:900; font-size:12px; letter-spacing:1px; margin-top:15px; margin-bottom:5px; box-shadow: 0 6px 12px rgba(150,165,185,0.3), inset 0 3px 5px #FFF, inset 0 -4px 8px rgba(180,195,215,0.6); cursor:pointer; transition: all 0.2s ease;';
            btn.innerHTML = '☀️ LIGHT CLINICAL MODE';

            btn.onclick = function(e) {
                e.preventDefault(); e.stopPropagation();
                const body = document.body;
                body.classList.toggle('theme-light-clinical');
                const isLight = body.classList.contains('theme-light-clinical');
                localStorage.setItem('endo-light-mode', isLight ? '1' : '0');
                
                if (isLight) {
                    btn.innerHTML = '🌙 VOLTAR PARA DARK MODE';
                    btn.style.background = '#1A1D24';
                    btn.style.color = '#00E5FF';
                    btn.style.border = '1px solid rgba(255,255,255,0.05)';
                    btn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.1), inset 0 -4px 8px rgba(0,0,0,0.8)';
                } else {
                    btn.innerHTML = '☀️ LIGHT CLINICAL MODE';
                    btn.style.background = 'linear-gradient(145deg, #FDFDFE, #E8EEF5)';
                    btn.style.color = '#1E293B';
                    btn.style.border = '1px solid #FFF';
                    btn.style.boxShadow = '0 6px 12px rgba(150,165,185,0.3), inset 0 3px 5px #FFF, inset 0 -4px 8px rgba(180,195,215,0.6)';
                }
            };

            btn.onmousedown = () => btn.style.transform = 'scale(0.96)';
            btn.onmouseup = () => btn.style.transform = 'scale(1)';
            btn.ontouchstart = () => btn.style.transform = 'scale(0.96)';
            btn.ontouchend = () => btn.style.transform = 'scale(1)';

            if (localStorage.getItem('endo-light-mode') === '1') {
                document.body.classList.add('theme-light-clinical');
                btn.innerHTML = '🌙 VOLTAR PARA DARK MODE';
                btn.style.background = '#1A1D24';
                btn.style.color = '#00E5FF';
                btn.style.border = '1px solid rgba(255,255,255,0.05)';
                btn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.1), inset 0 -4px 8px rgba(0,0,0,0.8)';
            }

            const closeBtnWrap = Array.from(settingsMenu.children).find(el => el.innerHTML.includes('ENCERRAR ANÁLISE'));
            if (closeBtnWrap) settingsMenu.insertBefore(btn, closeBtnWrap);
            else settingsMenu.appendChild(btn);
        }
        document.addEventListener('DOMContentLoaded', tryInject);
        tryInject(); 
    })();
