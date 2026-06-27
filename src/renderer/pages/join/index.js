// src/renderer/pages/join/index.js
import { navigate } from '../../../core/router.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { lookupInvite, joinWorkspace, getWorkspace } from '../../services/workspace.js'
import { icon } from '../../utils/icons.js'

export async function render(container) {
  injectStyles()

  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  // Якщо вже в команді — показуємо інфо
  if (profile?.workspaceId) {
    renderAlreadyMember(container, profile)
    return
  }

  container.innerHTML = `
    <div class="join-wrap">
      <div class="join-card">
        <div class="join-icon">${icon('clients', 40)}</div>
        <h1 class="join-title">Приєднатись до команди</h1>
        <p class="join-sub">Введіть 6-значний код, який надав вам власник воркспейсу</p>

        <div class="join-input-row">
          <input
            type="text"
            class="join-code-input"
            id="join-code"
            placeholder="ABCDEF"
            maxlength="6"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn btn-primary join-check-btn" id="join-check">Перевірити</button>
        </div>
        <div class="join-error" id="join-error" style="display:none"></div>

        <button class="join-skip-btn" id="join-skip">Пропустити поки що →</button>

        <!-- Preview (shown after valid code) -->
        <div class="join-preview" id="join-preview" style="display:none">
          <div class="join-preview-ws" id="join-preview-ws"></div>
          <div class="join-preview-role" id="join-preview-role"></div>
          <div class="join-preview-mods" id="join-preview-mods"></div>
          <button class="btn btn-primary join-confirm-btn" id="join-confirm">${icon('check', 14)} Підтвердити і приєднатись</button>
        </div>
      </div>
    </div>
  `

  const codeInput   = container.querySelector('#join-code')
  const checkBtn    = container.querySelector('#join-check')
  const errorEl     = container.querySelector('#join-error')
  const previewEl   = container.querySelector('#join-preview')

  let currentInvite = null
  let workspaceInfo = null

  // Auto-uppercase
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  })
  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkBtn.click()
  })

  container.querySelector('#join-skip').addEventListener('click', async () => {
    await ensureSidebar(profile)
    navigate('dashboard')
  })

  checkBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim()
    if (code.length < 6) {
      showError('Код має 6 символів')
      return
    }
    hideError()
    previewEl.style.display = 'none'
    checkBtn.disabled = true
    checkBtn.textContent = '...'

    try {
      const invite = await lookupInvite(code)
      if (!invite) {
        showError('Код не знайдено або вже використано')
        return
      }

      const ws = await getWorkspace(invite.workspaceId)

      currentInvite = invite
      workspaceInfo = ws

      showPreview(invite, ws)
    } catch (err) {
      showError('Помилка при перевірці коду')
      console.error(err)
    } finally {
      checkBtn.disabled = false
      checkBtn.textContent = 'Перевірити'
    }
  })

  container.querySelector('#join-confirm').addEventListener('click', async () => {
    if (!currentInvite) return
    const btn = container.querySelector('#join-confirm')
    btn.disabled = true
    btn.textContent = '...'

    try {
      await joinWorkspace(user.uid, profile, currentInvite)
      updateProfileCache(user.uid, {
        workspaceId:      currentInvite.workspaceId,
        isWorkspaceOwner: false,
        workspaceRole:    currentInvite.role,
        workspaceModules: currentInvite.modules,
        workspaceName:    workspaceInfo?.name || null,
      })
      // Оновлюємо навігацію і переходимо на дашборд
      const { renderNavigation } = await import('../../components/navigation.js')
      const updatedProfile = await import('../../services/auth.js').then(m => {
        m.clearProfileCache()
        return m.getUserProfile(user.uid)
      })
      await ensureSidebar(updatedProfile)
      navigate('dashboard')
    } catch (err) {
      btn.disabled = false
      btn.innerHTML = `${icon('check', 14)} Підтвердити і приєднатись`
      showError('Помилка приєднання. Спробуйте ще раз.')
      console.error(err)
    }
  })

  function showPreview(invite, ws) {
    const MODULE_LABELS = {
      dashboard: 'Дашборд', clients: 'Клієнти', projects: 'Проекти',
      invoices: 'Рахунки', contracts: 'Договори', tasks: 'Задачі',
      timer: 'Таймер', finances: 'Фінанси', 'tax-calendar': 'Податки',
      appointments: 'Розклад', services: 'Послуги', 'content-plan': 'Контент',
      accounts: 'Акаунти', passwords: 'Паролі', notes: 'Нотатки',
    }

    container.querySelector('#join-preview-ws').innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:7px">${icon('briefcase', 16)} ${ws?.name || 'Команда'}</span>`
    container.querySelector('#join-preview-role').innerHTML =
      `Ваша роль: <strong>${invite.role}</strong>`
    container.querySelector('#join-preview-mods').innerHTML =
      (invite.modules || []).map(id =>
        `<span class="join-mod-chip">${icon(id, 12)} ${MODULE_LABELS[id] || id}</span>`
      ).join('')

    previewEl.style.display = 'block'
  }

  async function ensureSidebar(p) {
    const { renderNavigation } = await import('../../components/navigation.js')
    let sidebar = document.getElementById('sidebar')
    if (!sidebar) {
      sidebar = document.createElement('div')
      sidebar.id = 'sidebar'
      document.getElementById('app').prepend(sidebar)
    }
    renderNavigation(sidebar, p)
  }

  function showError(msg) {
    errorEl.textContent = msg
    errorEl.style.display = 'block'
  }
  function hideError() {
    errorEl.style.display = 'none'
  }
}

function renderAlreadyMember(container, profile) {
  container.innerHTML = `
    <div class="join-wrap">
      <div class="join-card">
        <div class="join-icon">${profile.isWorkspaceOwner ? icon('briefcase', 40) : icon('check-circle', 40)}</div>
        <h1 class="join-title">${profile.isWorkspaceOwner ? 'Ви власник команди' : 'Ви вже в команді'}</h1>
        <p class="join-sub">
          ${profile.isWorkspaceOwner
            ? 'Ви є власником воркспейсу. Управляйте командою через розділ «Команда» в меню.'
            : `Ваша роль: <strong>${profile.workspaceRole || '—'}</strong>`
          }
        </p>
        <button class="btn btn-primary" id="join-go-btn" style="margin-top:24px">
          ${profile.isWorkspaceOwner ? 'Управління командою' : 'На головну'}
        </button>
      </div>
    </div>
  `
  container.querySelector('#join-go-btn').addEventListener('click', () => {
    navigate(profile.isWorkspaceOwner ? 'team' : 'dashboard')
  })
}

function injectStyles() {
  if (document.getElementById('join-styles')) return
  const s = document.createElement('style')
  s.id = 'join-styles'
  s.textContent = `
    .join-wrap {
      display: flex; align-items: center; justify-content: center;
      min-height: calc(100vh - 60px); padding: 32px;
    }
    .join-card {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-xl); padding: 48px 40px;
      width: 100%; max-width: 480px; text-align: center;
    }
    .join-icon  { display:flex; align-items:center; justify-content:center; width:72px; height:72px; border-radius:18px; background:rgba(79,142,247,.1); color:var(--accent-blue); margin:0 auto 20px; }
    .join-icon svg { flex-shrink:0; }
    .join-title { font-family: var(--font-display); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 10px; }
    .join-sub   { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 28px; }

    .join-input-row { display: flex; gap: 10px; margin-bottom: 12px; }
    .join-code-input {
      flex: 1; background: var(--bg-tertiary); border: 1.5px solid var(--border);
      border-radius: var(--radius-md); padding: 12px 16px;
      font-family: var(--font-mono, monospace); font-size: 22px; font-weight: 800;
      letter-spacing: 6px; text-align: center; text-transform: uppercase;
      color: var(--text-primary); outline: none; transition: border-color .2s;
    }
    .join-code-input:focus { border-color: var(--accent-blue); }
    .join-check-btn { flex-shrink: 0; }

    .join-error {
      background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3);
      border-radius: var(--radius-md); padding: 10px 14px;
      font-size: 13px; color: #F87171; margin-bottom: 12px;
    }

    .join-preview {
      background: var(--bg-tertiary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 20px; margin-top: 16px; text-align: left;
    }
    .join-preview-ws   { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
    .join-preview-role { font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; }
    .join-preview-mods { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
    .join-mod-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--bg-secondary); border-radius: var(--radius-full);
      padding: 4px 10px; font-size: 12px; font-weight: 500;
    }
    .join-confirm-btn { width: 100%; }

    .join-skip-btn {
      background: none; border: none; cursor: pointer;
      font-size: 13px; color: var(--text-muted);
      margin-top: 4px; transition: color .2s; padding: 4px;
    }
    .join-skip-btn:hover { color: var(--text-secondary); }
  `
  document.head.appendChild(s)
}
