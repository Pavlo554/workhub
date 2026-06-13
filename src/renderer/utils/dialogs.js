// src/renderer/utils/dialogs.js
// Custom replacements for native prompt() / confirm() — not supported in Electron with contextIsolation

function injectBaseStyles() {
  if (document.getElementById('wh-dialog-styles')) return
  const s = document.createElement('style')
  s.id = 'wh-dialog-styles'
  s.textContent = `
    .wh-dlg-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.65);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; backdrop-filter: blur(4px);
      animation: wh-dlg-in .15s ease;
    }
    @keyframes wh-dlg-in { from { opacity:0; transform:scale(.96) } to { opacity:1; transform:scale(1) } }
    .wh-dlg-box {
      background: #1A1D27; border: 1px solid rgba(255,255,255,.12);
      border-radius: 12px; padding: 22px 24px; width: 380px;
      max-width: 90vw; box-shadow: 0 24px 64px rgba(0,0,0,.5);
    }
    .wh-dlg-msg {
      font-size: 14px; color: #F1F5F9; line-height: 1.5; margin-bottom: 16px;
    }
    .wh-dlg-input {
      width: 100%; background: #0F1117; border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px; padding: 9px 12px; color: #F1F5F9; font-size: 14px;
      outline: none; box-sizing: border-box; margin-bottom: 16px; transition: border .15s;
    }
    .wh-dlg-input:focus { border-color: #4F8EF7; }
    .wh-dlg-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .wh-dlg-cancel {
      padding: 8px 16px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,.12); background: transparent;
      color: #8B97B0; cursor: pointer; font-size: 13px;
    }
    .wh-dlg-cancel:hover { background: rgba(255,255,255,.06); color: #F1F5F9; }
    .wh-dlg-ok {
      padding: 8px 16px; border-radius: 8px; border: none;
      background: #4F8EF7; color: #fff; cursor: pointer;
      font-size: 13px; font-weight: 600;
    }
    .wh-dlg-ok:hover { background: #3b7de8; }
    .wh-dlg-ok.danger { background: #EF4444; }
    .wh-dlg-ok.danger:hover { background: #dc2626; }
  `
  document.head.appendChild(s)
}

// Replaces native prompt() — returns Promise<string|null>
export function wbPrompt(message, defaultValue = '') {
  injectBaseStyles()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'wh-dlg-overlay'
    overlay.innerHTML = `
      <div class="wh-dlg-box">
        <div class="wh-dlg-msg">${message}</div>
        <input class="wh-dlg-input" id="wh-dlg-in" value="${defaultValue.replace(/"/g, '&quot;')}" spellcheck="false">
        <div class="wh-dlg-actions">
          <button class="wh-dlg-cancel" id="wh-dlg-cancel">Скасувати</button>
          <button class="wh-dlg-ok" id="wh-dlg-ok">OK</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const input  = overlay.querySelector('#wh-dlg-in')
    const okBtn  = overlay.querySelector('#wh-dlg-ok')
    const cancel = overlay.querySelector('#wh-dlg-cancel')

    // Focus and select all text
    requestAnimationFrame(() => { input.focus(); input.select() })

    function done(val) { overlay.remove(); resolve(val) }

    okBtn.addEventListener('click',    () => done(input.value))
    cancel.addEventListener('click',   () => done(null))
    overlay.addEventListener('click',  e => { if (e.target === overlay) done(null) })
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  done(input.value)
      if (e.key === 'Escape') done(null)
    })
  })
}

// Replaces native confirm() — returns Promise<boolean>
export function wbConfirm(message, { okLabel = 'Підтвердити', danger = false } = {}) {
  injectBaseStyles()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'wh-dlg-overlay'
    overlay.innerHTML = `
      <div class="wh-dlg-box">
        <div class="wh-dlg-msg">${message}</div>
        <div class="wh-dlg-actions">
          <button class="wh-dlg-cancel" id="wh-dlg-cancel">Скасувати</button>
          <button class="wh-dlg-ok ${danger ? 'danger' : ''}" id="wh-dlg-ok">${okLabel}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    function done(val) { overlay.remove(); resolve(val) }

    overlay.querySelector('#wh-dlg-ok').addEventListener('click',     () => done(true))
    overlay.querySelector('#wh-dlg-cancel').addEventListener('click', () => done(false))
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false) })
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter')  { document.removeEventListener('keydown', handler); done(true)  }
      if (e.key === 'Escape') { document.removeEventListener('keydown', handler); done(false) }
    })
  })
}

// Simple non-blocking alert (toast-style) — replaces native alert()
export function wbAlert(message, type = 'info') {
  injectBaseStyles()
  const colors = { info: '#4F8EF7', error: '#EF4444', success: '#34D399', warning: '#F59E0B' }
  const toast = document.createElement('div')
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:#1A1D27; border:1px solid ${colors[type] || colors.info}44;
    border-left: 3px solid ${colors[type] || colors.info};
    border-radius:8px; padding:12px 20px; color:#F1F5F9; font-size:13px;
    z-index:9999; box-shadow:0 8px 32px rgba(0,0,0,.4);
    animation: wh-dlg-in .2s ease; max-width:400px; text-align:center;
  `
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}
