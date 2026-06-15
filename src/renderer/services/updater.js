let _initialized = false

export function initAutoUpdater() {
  if (_initialized || !window.electron?.updater) return
  _initialized = true

  window.electron.updater.onAvailable((info) => {
    showBanner(`Завантаження оновлення ${info.version}...`, 'info', null)
  })

  window.electron.updater.onProgress((p) => {
    const pct = Math.round(p.percent)
    const banner = document.getElementById('updater-banner')
    if (banner) banner.querySelector('.upd-text').textContent =
      `Завантаження оновлення... ${pct}%`
  })

  window.electron.updater.onDownloaded((info) => {
    showBanner(
      `Оновлення ${info.version} готове до встановлення`,
      'ready',
      () => window.electron.updater.installNow()
    )
  })

  window.electron.updater.onError?.((msg) => {
    console.warn('[updater] error:', msg)
  })
}

function showBanner(text, type, onAction) {
  document.getElementById('updater-banner')?.remove()

  const banner = document.createElement('div')
  banner.id = 'updater-banner'
  banner.innerHTML = `
    <span class="upd-text">${text}</span>
    ${type === 'ready' ? `<button class="upd-btn">Перезапустити та встановити</button>` : ''}
    <button class="upd-close">✕</button>
  `
  Object.assign(banner.style, {
    position:   'fixed',
    bottom:     '20px',
    right:      '20px',
    background: type === 'ready' ? '#10B981' : '#3B82F6',
    color:      '#fff',
    padding:    '10px 16px',
    borderRadius: '10px',
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    zIndex:     '9999',
    fontSize:   '13px',
    boxShadow:  '0 4px 20px rgba(0,0,0,0.3)',
  })

  banner.querySelector('.upd-close').addEventListener('click', () => banner.remove())
  if (onAction) banner.querySelector('.upd-btn')?.addEventListener('click', onAction)

  document.body.appendChild(banner)
}
