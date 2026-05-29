// src/renderer/pages/team/index.js
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  ensureWorkspace, getWorkspace, getMembers, getPendingInvites,
  createInvite, deleteInvite, removeMember, updateMember, updateWorkspaceName,
} from '../../services/workspace.js'

// Всі доступні модулі для призначення
const ALL_MODULES = [
  { id: 'dashboard',    label: 'Дашборд' },
  { id: 'clients',      label: 'Клієнти' },
  { id: 'projects',     label: 'Проекти' },
  { id: 'invoices',     label: 'Рахунки' },
  { id: 'contracts',    label: 'Договори' },
  { id: 'tasks',        label: 'Задачі' },
  { id: 'timer',        label: 'Таймер' },
  { id: 'finances',     label: 'Фінанси' },
  { id: 'tax-calendar', label: 'Податки' },
  { id: 'appointments', label: 'Розклад' },
  { id: 'services',     label: 'Послуги' },
  { id: 'content-plan', label: 'Контент' },
  { id: 'accounts',     label: 'Акаунти' },
  { id: 'passwords',    label: 'Паролі' },
  { id: 'notes',        label: 'Нотатки' },
]

export async function render(container) {
  injectStyles()

  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  if (!profile?.isWorkspaceOwner && !profile?.workspaceId) {
    // Перший вхід — автоматично створюємо воркспейс
    await ensureWorkspace(user.uid, profile)
    updateProfileCache(user.uid, { workspaceId: user.uid, isWorkspaceOwner: true })
  }

  const workspaceId = profile?.workspaceId || user.uid

  // Скелетон
  container.innerHTML = `
    <div class="tm-page">
      <div class="tm-header">
        <div>
          <h1 class="tm-title">${icon('team', 22)} Команда</h1>
          <p class="tm-sub">Керуйте учасниками та їх доступом до розділів</p>
        </div>
        <button class="btn btn-primary" id="tm-invite-btn">+ Запросити учасника</button>
      </div>
      <div class="tm-body">
        <div class="tm-spinner"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Invite modal -->
    <div class="tm-overlay" id="tm-invite-modal" style="display:none">
      <div class="tm-modal">
        <div class="tm-modal-head">
          <h2>Запросити учасника</h2>
          <button class="tm-close" id="tm-invite-close">${icon('x', 14)}</button>
        </div>
        <div class="tm-modal-body">
          <label class="tm-label">Посада / роль <span class="tm-req">*</span></label>
          <input type="text" class="input" id="tm-role-input" placeholder="Розробник, Дизайнер, Менеджер…" maxlength="40">
          <label class="tm-label" style="margin-top:20px">Доступ до розділів</label>
          <div class="tm-modules-grid" id="tm-modules-grid">
            ${ALL_MODULES.map(m => `
              <label class="tm-module-check">
                <input type="checkbox" value="${m.id}" checked>
                <span class="tm-module-box">
                  <span class="tm-module-icon">${icon(m.id, 13)}</span>
                  <span>${m.label}</span>
                </span>
              </label>
            `).join('')}
          </div>
          <div id="tm-code-wrap" style="display:none">
            <div class="tm-code-block">
              <div class="tm-code-label">Код запрошення</div>
              <div class="tm-code-row">
                <div class="tm-code" id="tm-code-display">------</div>
                <button class="btn btn-secondary" id="tm-copy-btn">${icon('copy', 14)} Скопіювати</button>
              </div>
              <div class="tm-code-hint">Поділіться цим кодом з учасником. Він вводить його в розділі «Приєднатись до команди».</div>
            </div>
          </div>
        </div>
        <div class="tm-modal-foot" id="tm-invite-foot">
          <button class="btn btn-secondary" id="tm-invite-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="tm-generate-btn">Згенерувати код</button>
        </div>
      </div>
    </div>

    <!-- Edit member modal -->
    <div class="tm-overlay" id="tm-edit-modal" style="display:none">
      <div class="tm-modal">
        <div class="tm-modal-head">
          <h2>Редагувати доступ</h2>
          <button class="tm-close" id="tm-edit-close">${icon('x', 14)}</button>
        </div>
        <div class="tm-modal-body">
          <label class="tm-label">Посада / роль</label>
          <input type="text" class="input" id="tm-edit-role" placeholder="Розробник…" maxlength="40">
          <label class="tm-label" style="margin-top:20px">Доступ до розділів</label>
          <div class="tm-modules-grid" id="tm-edit-modules"></div>
        </div>
        <div class="tm-modal-foot">
          <button class="btn btn-secondary" id="tm-edit-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="tm-edit-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  let members  = []
  let invites  = []
  let workspace = null

  async function loadData() {
    ;[workspace, members, invites] = await Promise.all([
      getWorkspace(workspaceId),
      getMembers(workspaceId),
      getPendingInvites(workspaceId),
    ])
    renderBody()
  }

  function renderBody() {
    const body = container.querySelector('.tm-body')

    body.innerHTML = `
      <!-- Workspace name -->
      <div class="tm-ws-row">
        <div class="tm-ws-name-wrap">
          <span class="tm-ws-icon">${icon('briefcase', 18)}</span>
          <span class="tm-ws-name" id="tm-ws-name">${workspace?.name || 'Моя команда'}</span>
          <button class="tm-ws-edit" id="tm-ws-edit-btn" title="Перейменувати">${icon('pencil', 13)}</button>
        </div>
        <div class="tm-ws-meta">${members.length} учасник${plural(members.length)}</div>
      </div>

      <!-- Members -->
      <div class="tm-section-title">Учасники</div>
      ${members.length === 0
        ? '<div class="tm-empty">Поки немає учасників. Запросіть першого!</div>'
        : `<div class="tm-members">${members.map(m => memberCard(m)).join('')}</div>`
      }

      <!-- Pending invites -->
      ${invites.length > 0 ? `
        <div class="tm-section-title" style="margin-top:28px">Очікують підтвердження</div>
        <div class="tm-invites">
          ${invites.map(i => `
            <div class="tm-invite-row" data-code="${i.code}">
              <div class="tm-invite-code">${i.code}</div>
              <div class="tm-invite-role">${i.role}</div>
              <div class="tm-invite-mods">${(i.modules || []).length} розділів</div>
              <button class="tm-invite-copy" data-code="${i.code}" title="Скопіювати код">${icon('copy', 13)}</button>
              <button class="tm-invite-del"  data-code="${i.code}" title="Видалити запрошення">${icon('x', 13)}</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `

    // Rename workspace
    body.querySelector('#tm-ws-edit-btn').addEventListener('click', async () => {
      const name = prompt('Нова назва команди:', workspace?.name || '')
      if (name?.trim()) {
        await updateWorkspaceName(workspaceId, name.trim())
        workspace.name = name.trim()
        body.querySelector('#tm-ws-name').textContent = name.trim()
      }
    })

    // Member actions
    body.querySelectorAll('.tm-member-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.uid))
    })
    body.querySelectorAll('.tm-member-remove').forEach(btn => {
      btn.addEventListener('click', () => confirmRemove(btn.dataset.uid, btn.dataset.name))
    })

    // Invite row actions
    body.querySelectorAll('.tm-invite-copy').forEach(btn => {
      btn.addEventListener('click', () => copyCode(btn.dataset.code))
    })
    body.querySelectorAll('.tm-invite-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити це запрошення?')) return
        await deleteInvite(workspaceId, btn.dataset.code)
        await loadData()
      })
    })
  }

  function memberCard(m) {
    const mods = (m.modules || []).map(id => {
      const meta = ALL_MODULES.find(x => x.id === id)
      return meta ? `<span class="tm-mod-chip">${meta.icon} ${meta.label}</span>` : ''
    }).join('')

    return `
      <div class="tm-member-card">
        <div class="tm-member-avatar">${initials(m.name)}</div>
        <div class="tm-member-info">
          <div class="tm-member-name">${m.name || 'Без імені'}</div>
          <div class="tm-member-role">${m.role || '—'}</div>
          <div class="tm-member-mods">${mods}</div>
        </div>
        <div class="tm-member-actions">
          <button class="btn btn-secondary tm-member-edit" data-uid="${m.id}">${icon('edit', 13)} Доступ</button>
          <button class="btn btn-ghost tm-member-remove" data-uid="${m.id}" data-name="${m.name}">Видалити</button>
        </div>
      </div>
    `
  }

  // ── Invite modal ──────────────────────────────────────────
  container.querySelector('#tm-invite-btn').addEventListener('click', () => {
    openInviteModal()
  })

  function openInviteModal() {
    container.querySelector('#tm-role-input').value = ''
    container.querySelector('#tm-code-wrap').style.display = 'none'
    container.querySelector('#tm-invite-foot').style.display = 'flex'
    // Reset all checkboxes to checked
    container.querySelectorAll('#tm-modules-grid input[type=checkbox]').forEach(c => c.checked = true)
    container.querySelector('#tm-invite-modal').style.display = 'flex'
  }

  container.querySelector('#tm-invite-close').addEventListener('click', closeInviteModal)
  container.querySelector('#tm-invite-cancel').addEventListener('click', closeInviteModal)
  function closeInviteModal() {
    container.querySelector('#tm-invite-modal').style.display = 'none'
  }

  container.querySelector('#tm-generate-btn').addEventListener('click', async () => {
    const role = container.querySelector('#tm-role-input').value.trim()
    if (!role) {
      container.querySelector('#tm-role-input').focus()
      container.querySelector('#tm-role-input').style.borderColor = '#F87171'
      return
    }
    const modules = [...container.querySelectorAll('#tm-modules-grid input:checked')].map(c => c.value)
    if (modules.length === 0) { alert('Оберіть хоча б один розділ'); return }

    const btn = container.querySelector('#tm-generate-btn')
    btn.disabled = true
    btn.textContent = '...'

    try {
      const code = await createInvite(workspaceId, { role, modules })
      container.querySelector('#tm-code-display').textContent = code
      container.querySelector('#tm-code-wrap').style.display = 'block'
      container.querySelector('#tm-invite-foot').style.display = 'none'
      await loadData()
    } finally {
      btn.disabled = false
      btn.textContent = 'Згенерувати код'
    }
  })

  container.querySelector('#tm-copy-btn').addEventListener('click', () => {
    const code = container.querySelector('#tm-code-display').textContent
    copyCode(code)
  })

  // ── Edit member modal ─────────────────────────────────────
  function openEditModal(uid) {
    const member = members.find(m => m.id === uid)
    if (!member) return

    container.querySelector('#tm-edit-role').value = member.role || ''
    const grid = container.querySelector('#tm-edit-modules')
    grid.innerHTML = ALL_MODULES.map(m => `
      <label class="tm-module-check">
        <input type="checkbox" value="${m.id}" ${(member.modules || []).includes(m.id) ? 'checked' : ''}>
        <span class="tm-module-box">
          <span class="tm-module-icon">${icon(m.id, 13)}</span>
          <span>${m.label}</span>
        </span>
      </label>
    `).join('')

    container.querySelector('#tm-edit-modal').dataset.uid = uid
    container.querySelector('#tm-edit-modal').style.display = 'flex'
  }

  container.querySelector('#tm-edit-close').addEventListener('click',  () => { container.querySelector('#tm-edit-modal').style.display = 'none' })
  container.querySelector('#tm-edit-cancel').addEventListener('click', () => { container.querySelector('#tm-edit-modal').style.display = 'none' })

  container.querySelector('#tm-edit-save').addEventListener('click', async () => {
    const uid     = container.querySelector('#tm-edit-modal').dataset.uid
    const role    = container.querySelector('#tm-edit-role').value.trim()
    const modules = [...container.querySelectorAll('#tm-edit-modules input:checked')].map(c => c.value)
    if (!role || modules.length === 0) return

    const btn = container.querySelector('#tm-edit-save')
    btn.disabled = true
    try {
      await updateMember(workspaceId, uid, { role, modules })
      container.querySelector('#tm-edit-modal').style.display = 'none'
      await loadData()
    } finally {
      btn.disabled = false
    }
  })

  // ── Remove member ─────────────────────────────────────────
  async function confirmRemove(uid, name) {
    if (!confirm(`Видалити "${name}" з команди?`)) return
    await removeMember(workspaceId, uid)
    await loadData()
  }

  // ── Helpers ───────────────────────────────────────────────
  function copyCode(code) {
    navigator.clipboard?.writeText(code).then(() => {
      showToast(`Код ${code} скопійовано`)
    })
  }

  function showToast(msg) {
    const t = document.createElement('div')
    t.className = 'tm-toast'
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2800)
  }

  function initials(name = '') {
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
  }

  function plural(n) {
    if (n % 10 === 1 && n % 100 !== 11) return ''
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'и'
    return 'ів'
  }

  await loadData()
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('team-styles')) return
  const s = document.createElement('style')
  s.id = 'team-styles'
  s.textContent = `
    .tm-page    { padding: 32px 36px; max-width: 960px; }
    .tm-header  { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; gap: 16px; }
    .tm-title   { font-family: var(--font-display); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
    .tm-sub     { font-size: 13px; color: var(--text-secondary); }

    .tm-ws-row      { display: flex; align-items: center; justify-content: space-between; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 24px; }
    .tm-ws-name-wrap { display: flex; align-items: center; gap: 10px; }
    .tm-ws-icon     { display:flex; align-items:center; color:var(--accent-blue); }
    .tm-ws-name     { font-size: 17px; font-weight: 700; }
    .tm-ws-edit     { display:flex; align-items:center; background: none; border: none; cursor: pointer; color:var(--text-muted); opacity: .5; transition: opacity .2s; }
    .tm-ws-edit:hover { opacity: 1; }
    .tm-ws-meta     { font-size: 13px; color: var(--text-secondary); }

    .tm-section-title { font-family: var(--font-display); font-size: 14px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; }

    .tm-empty { color: var(--text-muted); font-size: 14px; padding: 32px 0; text-align: center; }

    .tm-members { display: flex; flex-direction: column; gap: 10px; }
    .tm-member-card {
      display: flex; align-items: center; gap: 16px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 16px 20px;
      transition: border-color .2s;
    }
    .tm-member-card:hover { border-color: rgba(255,255,255,.12); }
    .tm-member-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--accent-blue-dim); color: var(--accent-blue);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 16px; flex-shrink: 0;
    }
    .tm-member-info   { flex: 1; min-width: 0; }
    .tm-member-name   { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
    .tm-member-role   { font-size: 12px; color: var(--accent-blue); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
    .tm-member-mods   { display: flex; flex-wrap: wrap; gap: 5px; }
    .tm-mod-chip      { background: var(--bg-tertiary); border-radius: var(--radius-full); padding: 3px 8px; font-size: 11px; font-weight: 500; }
    .tm-member-actions { display: flex; gap: 8px; flex-shrink: 0; }

    /* Pending invites */
    .tm-invites      { display: flex; flex-direction: column; gap: 8px; }
    .tm-invite-row   { display: flex; align-items: center; gap: 12px; background: var(--bg-secondary); border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 12px 16px; }
    .tm-invite-code  { font-family: var(--font-mono, monospace); font-size: 15px; font-weight: 800; letter-spacing: 3px; color: var(--accent-blue); }
    .tm-invite-role  { flex: 1; font-size: 13px; font-weight: 600; }
    .tm-invite-mods  { font-size: 12px; color: var(--text-muted); }
    .tm-invite-copy, .tm-invite-del {
      display:flex; align-items:center;
      background: none; border: 1px solid var(--border); border-radius: 6px;
      padding: 5px 8px; cursor: pointer; color:var(--text-secondary); transition: all .2s;
    }
    .tm-invite-copy:hover { background: var(--bg-tertiary); }
    .tm-invite-del:hover  { background: rgba(239,68,68,.1); border-color: #F87171; color: #F87171; }

    /* Modal */
    .tm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
    .tm-modal {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-xl); width: 100%; max-width: 580px;
      max-height: 88vh; display: flex; flex-direction: column;
      box-shadow: var(--shadow-xl);
      animation: tm-in .2s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes tm-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .tm-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 0; flex-shrink: 0; }
    .tm-modal-head h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; }
    .tm-close { background: none; border: none; font-size: 16px; color: var(--text-muted); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all .2s; }
    .tm-close:hover { background: rgba(239,68,68,.12); color: #F87171; }
    .tm-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .tm-modal-foot { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 24px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }

    .tm-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
    .tm-req   { color: #F87171; }

    .tm-modules-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .tm-module-check { cursor: pointer; }
    .tm-module-check input { display: none; }
    .tm-module-box {
      display: flex; align-items: center; gap: 7px;
      background: var(--bg-tertiary); border: 1.5px solid var(--border);
      border-radius: var(--radius-md); padding: 8px 10px;
      font-size: 13px; font-weight: 500; transition: all .15s;
    }
    .tm-module-check input:checked + .tm-module-box {
      background: rgba(79,142,247,.1); border-color: var(--accent-blue); color: var(--accent-blue);
    }
    .tm-module-icon { font-size: 15px; }

    /* Invite code */
    .tm-code-block { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 20px; margin-top: 20px; text-align: center; }
    .tm-code-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
    .tm-code-row   { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
    .tm-code       { font-family: var(--font-mono, monospace); font-size: 36px; font-weight: 800; letter-spacing: 8px; color: var(--accent-blue); }
    .tm-code-hint  { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

    /* Toast */
    .tm-toast {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: #1E2530; border: 1px solid var(--border); border-radius: var(--radius-full);
      padding: 10px 20px; font-size: 13px; font-weight: 600; z-index: 9999;
      animation: tm-toast-in .25s ease;
    }
    @keyframes tm-toast-in { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

    /* Ghost btn */
    .btn-ghost { background: transparent; border: 1px solid transparent; color: var(--text-muted); }
    .btn-ghost:hover { border-color: #F87171; color: #F87171; background: rgba(239,68,68,.08); }
  `
  document.head.appendChild(s)
}
