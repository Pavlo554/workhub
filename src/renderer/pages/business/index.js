// src/renderer/pages/business/index.js
import { navigate } from '../../../core/router.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { db } from '../../services/firebase.js'
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import {
  ensureWorkspace, getWorkspace, getMembers, getPendingInvites,
  createInvite, deleteInvite, removeMember, updateMember,
} from '../../services/workspace.js'

const ALL_MODULES = [
  { id: 'dashboard',    icon: '⊞', label: 'Дашборд' },
  { id: 'clients',      icon: '👥', label: 'Клієнти' },
  { id: 'projects',     icon: '📁', label: 'Проекти' },
  { id: 'invoices',     icon: '📄', label: 'Рахунки' },
  { id: 'contracts',    icon: '📝', label: 'Договори' },
  { id: 'tasks',        icon: '✓',  label: 'Задачі' },
  { id: 'timer',        icon: '⏱',  label: 'Таймер' },
  { id: 'finances',     icon: '💰', label: 'Фінанси' },
  { id: 'tax-calendar', icon: '📅', label: 'Податки' },
  { id: 'appointments', icon: '🗓', label: 'Розклад' },
  { id: 'services',     icon: '💅', label: 'Послуги' },
  { id: 'content-plan', icon: '📱', label: 'Контент' },
  { id: 'accounts',     icon: '🔗', label: 'Акаунти' },
  { id: 'passwords',    icon: '🔑', label: 'Паролі' },
  { id: 'notes',        icon: '🗒', label: 'Нотатки' },
]

const NICHES = [
  { id: 'freelancer', icon: '💻', label: 'Фрілансер',       color: '#4F8EF7' },
  { id: 'accountant', icon: '📊', label: 'Бухгалтер / ФОП', color: '#34D399' },
  { id: 'smm',        icon: '📱', label: 'SMM / Маркетолог', color: '#A78BFA' },
  { id: 'beauty',     icon: '💅', label: 'Салон краси',      color: '#F472B6' },
]

export async function render(container) {
  injectStyles()

  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  // Тільки для власників
  if (profile?.accountType !== 'owner' && profile?.accountType !== undefined && !profile?.isWorkspaceOwner) {
    container.innerHTML = `<div class="biz-empty-access"><div>🔒</div><p>Ця сторінка доступна тільки власнику бізнесу</p></div>`
    return
  }

  // Гарантуємо що воркспейс існує в Firestore
  if (!profile?.isWorkspaceOwner) {
    await ensureWorkspace(user.uid, profile)
    updateProfileCache(user.uid, { workspaceId: user.uid, isWorkspaceOwner: true })
  }

  const workspaceId = profile?.workspaceId || user.uid

  // Skeleton
  container.innerHTML = `<div class="biz-page"><div class="biz-spinner"><div class="spinner"></div></div></div>`

  // Завантажуємо все паралельно
  const [workspace, members, invites] = await Promise.all([
    getWorkspace(workspaceId).catch(() => null),
    getMembers(workspaceId).catch(() => []),
    getPendingInvites(workspaceId).catch(() => []),
  ])

  const config = getProfessionConfig(profile?.profession)
  const niche  = NICHES.find(n => n.id === profile?.profession) || NICHES[0]

  renderPage(container, { profile, workspace, members, invites, config, niche, workspaceId, user })
}

function renderPage(container, { profile, workspace, members, invites, config, niche, workspaceId, user }) {
  const ownerModules = config.modules

  container.innerHTML = `
    <div class="biz-page">

      <!-- ── Шапка ── -->
      <div class="biz-topbar">
        <div class="biz-topbar-left">
          <div class="biz-logo" style="background:${niche.color}22;border:2px solid ${niche.color}44">
            <span style="color:${niche.color}">${initials(profile?.businessName || profile?.name)}</span>
          </div>
          <div>
            <div class="biz-company-name">${profile?.businessName || 'Мій бізнес'}</div>
            <div class="biz-niche-badge" style="color:${niche.color};background:${niche.color}18;border-color:${niche.color}33">
              ${niche.icon} ${niche.label}
            </div>
          </div>
        </div>
        <div class="biz-topbar-actions">
          <button class="btn btn-secondary" id="biz-edit-btn">✏️ Редагувати</button>
          <button class="btn btn-primary"   id="biz-invite-btn">+ Запросити</button>
        </div>
      </div>

      <!-- ── Статистика ── -->
      <div class="biz-stats-row">
        <div class="biz-stat-card">
          <div class="biz-stat-value">${members.length}</div>
          <div class="biz-stat-label">Учасників</div>
        </div>
        <div class="biz-stat-card">
          <div class="biz-stat-value">${ownerModules.length}</div>
          <div class="biz-stat-label">Активних модулів</div>
        </div>
        <div class="biz-stat-card">
          <div class="biz-stat-value">${invites.length}</div>
          <div class="biz-stat-label">Очікують вступу</div>
        </div>
        <div class="biz-stat-card">
          <div class="biz-stat-value">${(profile?.plan || 'free').toUpperCase()}</div>
          <div class="biz-stat-label">Поточний план</div>
        </div>
      </div>

      <div class="biz-body">

        <!-- ── Ліва колонка: інфо + модулі ── -->
        <div class="biz-col-left">

          <!-- Інформація про бізнес -->
          <div class="biz-card">
            <div class="biz-card-title">📋 Інформація</div>
            <div class="biz-info-list">
              ${infoRow('👤', 'Власник',   profile?.name || '—')}
              ${infoRow('📧', 'Email',     profile?.email || '—')}
              ${infoRow('📞', 'Телефон',   profile?.phone || '—')}
              ${infoRow('🏙', 'Місто',     profile?.city || '—')}
              ${infoRow('🌐', 'Сайт',      profile?.website || '—')}
              ${infoRow('📸', 'Instagram', profile?.instagram ? '@' + profile.instagram : '—')}
            </div>
          </div>

          <!-- Ніша і модулі -->
          <div class="biz-card">
            <div class="biz-card-title">🗂 Активні модулі</div>
            <div class="biz-modules-list">
              ${ownerModules.map(id => {
                const m = ALL_MODULES.find(x => x.id === id)
                if (!m) return ''
                return `
                  <div class="biz-module-row" data-route="${id}">
                    <span class="biz-module-icon">${m.icon}</span>
                    <span class="biz-module-label">${m.label}</span>
                    <span class="biz-module-arrow">→</span>
                  </div>
                `
              }).join('')}
            </div>
          </div>

        </div>

        <!-- ── Права колонка: команда ── -->
        <div class="biz-col-right">

          <div class="biz-card">
            <div class="biz-card-header">
              <div class="biz-card-title">👥 Команда</div>
              <span class="biz-member-count">${members.length + 1} осіб</span>
            </div>

            <!-- Власник -->
            <div class="biz-member-row biz-member-owner">
              <div class="biz-member-avatar" style="background:${niche.color}22;border:1.5px solid ${niche.color}44">
                <span style="color:${niche.color}">${initials(profile?.name)}</span>
              </div>
              <div class="biz-member-info">
                <div class="biz-member-name">${profile?.name || 'Власник'}</div>
                <div class="biz-member-role">🏢 Власник бізнесу</div>
              </div>
              <div class="biz-member-access">
                <span class="biz-access-badge biz-access-owner">Повний доступ</span>
              </div>
            </div>

            <!-- Учасники -->
            ${members.length === 0
              ? `<div class="biz-no-members">Немає учасників. Запросіть першого!</div>`
              : members.map(m => memberRow(m)).join('')
            }

          </div>

          <!-- Очікують -->
          ${invites.length > 0 ? `
            <div class="biz-card" style="margin-top:14px">
              <div class="biz-card-title">⏳ Очікують вступу</div>
              ${invites.map(i => `
                <div class="biz-invite-row">
                  <div class="biz-invite-code">${i.code}</div>
                  <div class="biz-invite-info">
                    <div class="biz-invite-role">${i.role}</div>
                    <div class="biz-invite-mods">${(i.modules || []).length} розділів</div>
                  </div>
                  <button class="biz-invite-copy" data-code="${i.code}" title="Скопіювати">📋</button>
                  <button class="biz-invite-del"  data-code="${i.code}" title="Видалити">✕</button>
                </div>
              `).join('')}
            </div>
          ` : ''}

        </div>
      </div>

    </div>

    <!-- ── Редагування бізнесу ── -->
    <div class="biz-overlay" id="biz-edit-modal" style="display:none">
      <div class="biz-modal">
        <div class="biz-modal-head">
          <h2>✏️ Редагувати бізнес</h2>
          <button class="biz-modal-close" id="biz-edit-close">✕</button>
        </div>
        <div class="biz-modal-body">

          <div class="biz-form-row">
            <label class="biz-label">Назва бізнесу *</label>
            <input type="text" class="input" id="edit-biz-name" value="${profile?.businessName || ''}" placeholder="Design Studio">
          </div>
          <div class="biz-form-row2">
            <div>
              <label class="biz-label">Телефон</label>
              <input type="tel" class="input" id="edit-biz-phone" value="${profile?.phone || ''}" placeholder="+380...">
            </div>
            <div>
              <label class="biz-label">Місто</label>
              <input type="text" class="input" id="edit-biz-city" value="${profile?.city || ''}" placeholder="Київ">
            </div>
          </div>
          <div class="biz-form-row2">
            <div>
              <label class="biz-label">Сайт</label>
              <input type="text" class="input" id="edit-biz-website" value="${profile?.website || ''}" placeholder="mysite.com">
            </div>
            <div>
              <label class="biz-label">Instagram</label>
              <input type="text" class="input" id="edit-biz-instagram" value="${profile?.instagram || ''}" placeholder="@username">
            </div>
          </div>

          <label class="biz-label" style="margin-top:16px">Сфера діяльності</label>
          <div class="biz-niche-grid" id="edit-niche-grid">
            ${NICHES.map(n => `
              <div class="biz-niche-card ${profile?.profession === n.id ? 'selected' : ''}" data-niche="${n.id}" style="--nc:${n.color}">
                <span>${n.icon}</span>
                <span>${n.label}</span>
              </div>
            `).join('')}
          </div>

        </div>
        <div class="biz-modal-foot">
          <button class="btn btn-secondary" id="biz-edit-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="biz-edit-save">Зберегти</button>
        </div>
      </div>
    </div>

    <!-- ── Запросити учасника ── -->
    <div class="biz-overlay" id="biz-invite-modal" style="display:none">
      <div class="biz-modal">
        <div class="biz-modal-head">
          <h2>👥 Запросити учасника</h2>
          <button class="biz-modal-close" id="biz-invite-close">✕</button>
        </div>
        <div class="biz-modal-body">
          <div class="biz-form-row">
            <label class="biz-label">Посада / роль *</label>
            <input type="text" class="input" id="inv-role" placeholder="Розробник, Дизайнер, Менеджер…" maxlength="40">
          </div>
          <label class="biz-label" style="margin-top:16px">Доступ до розділів</label>
          <div class="biz-modules-check" id="inv-modules">
            ${ownerModules.map(id => ALL_MODULES.find(x => x.id === id)).filter(Boolean).map(m => `
              <label class="biz-check-item">
                <input type="checkbox" value="${m.id}" checked>
                <span class="biz-check-box">
                  <span>${m.icon}</span><span>${m.label}</span>
                </span>
              </label>
            `).join('')}
          </div>
          <div id="inv-code-result" style="display:none">
            <div class="biz-code-block">
              <div class="biz-code-label">Код запрошення</div>
              <div class="biz-code-display" id="inv-code-val">------</div>
              <button class="btn btn-secondary" id="inv-copy-btn">📋 Скопіювати</button>
              <div class="biz-code-hint">Поділіться цим кодом з учасником. Він вводить його в розділі «Приєднатись».</div>
            </div>
          </div>
        </div>
        <div class="biz-modal-foot" id="inv-foot">
          <button class="btn btn-secondary" id="biz-invite-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="inv-generate">Згенерувати код</button>
        </div>
      </div>
    </div>

    <!-- ── Редагування учасника ── -->
    <div class="biz-overlay" id="biz-member-modal" style="display:none">
      <div class="biz-modal">
        <div class="biz-modal-head">
          <h2>✏️ Редагувати учасника</h2>
          <button class="biz-modal-close" id="biz-member-close">✕</button>
        </div>
        <div class="biz-modal-body">
          <div class="biz-form-row">
            <label class="biz-label">Посада / роль</label>
            <input type="text" class="input" id="member-role-input" maxlength="40">
          </div>
          <label class="biz-label" style="margin-top:16px">Доступ до розділів</label>
          <div class="biz-modules-check" id="member-modules-grid"></div>
        </div>
        <div class="biz-modal-foot">
          <button class="btn btn-ghost biz-remove-btn" id="member-remove-btn">🗑 Видалити з команди</button>
          <button class="btn btn-secondary" id="biz-member-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="biz-member-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  bindEvents(container, { profile, workspace, members, invites, config, niche, workspaceId, user })
}

// ── Рядок учасника ────────────────────────────────────────
function memberRow(m) {
  const mods = (m.modules || []).slice(0, 4).map(id => {
    const meta = ALL_MODULES.find(x => x.id === id)
    return meta ? `<span class="biz-mod-chip" title="${meta.label}">${meta.icon}</span>` : ''
  }).join('')
  const extra = (m.modules || []).length > 4 ? `<span class="biz-mod-more">+${m.modules.length - 4}</span>` : ''

  return `
    <div class="biz-member-row" data-uid="${m.id}">
      <div class="biz-member-avatar">
        <span>${initials(m.name)}</span>
      </div>
      <div class="biz-member-info">
        <div class="biz-member-name">${m.name || 'Без імені'}</div>
        <div class="biz-member-role">${m.role || '—'}</div>
      </div>
      <div class="biz-member-mods">${mods}${extra}</div>
      <button class="biz-member-edit-btn" data-uid="${m.id}" title="Редагувати">✏️</button>
    </div>
  `
}

function infoRow(icon, label, value) {
  return `
    <div class="biz-info-row">
      <span class="biz-info-icon">${icon}</span>
      <span class="biz-info-label">${label}</span>
      <span class="biz-info-value">${value}</span>
    </div>
  `
}

// ── Events ────────────────────────────────────────────────
function bindEvents(container, ctx) {
  const { profile, workspace, members, invites, workspaceId, user, niche } = ctx

  // Клік по модулю → перехід
  container.querySelectorAll('.biz-module-row').forEach(row => {
    row.addEventListener('click', () => navigate(row.dataset.route))
  })

  // ── Редагувати бізнес ───────────────────────────────────
  container.querySelector('#biz-edit-btn').addEventListener('click', () => {
    container.querySelector('#biz-edit-modal').style.display = 'flex'
  })
  container.querySelector('#biz-edit-close').addEventListener('click', () => {
    container.querySelector('#biz-edit-modal').style.display = 'none'
  })
  container.querySelector('#biz-edit-cancel').addEventListener('click', () => {
    container.querySelector('#biz-edit-modal').style.display = 'none'
  })

  let editNiche = profile?.profession || null
  container.querySelectorAll('#edit-niche-grid .biz-niche-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('#edit-niche-grid .biz-niche-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      editNiche = card.dataset.niche
    })
  })

  container.querySelector('#biz-edit-save').addEventListener('click', async () => {
    const businessName = container.querySelector('#edit-biz-name').value.trim()
    if (!businessName) { showToast('Введіть назву бізнесу'); return }

    const btn = container.querySelector('#biz-edit-save')
    btn.disabled = true

    try {
      const data = {
        businessName,
        phone:      container.querySelector('#edit-biz-phone').value.trim() || null,
        city:       container.querySelector('#edit-biz-city').value.trim()  || null,
        website:    container.querySelector('#edit-biz-website').value.trim()    || null,
        instagram:  container.querySelector('#edit-biz-instagram').value.trim()  || null,
        profession: editNiche || profile?.profession,
        accountType:    'owner',
        onboardingDone: true,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'users', user.uid), data)
      updateProfileCache(user.uid, data)

      // Оновлюємо sidebar
      const { renderNavigation } = await import('../../components/navigation.js')
      const sidebar = document.getElementById('sidebar')
      if (sidebar) renderNavigation(sidebar, { ...profile, ...data })

      container.querySelector('#biz-edit-modal').style.display = 'none'
      showToast('Збережено ✓')

      // Перерендер сторінки з новими даними
      const newProfile = { ...profile, ...data }
      const newNiche   = NICHES.find(n => n.id === newProfile.profession) || niche
      const newConfig  = (await import('../../../core/profession-config.js')).getProfessionConfig(newProfile.profession)
      renderPage(container, { ...ctx, profile: newProfile, niche: newNiche, config: newConfig })
      bindEvents(container, { ...ctx, profile: newProfile, niche: newNiche, config: newConfig })
    } catch (err) {
      console.error(err)
      showToast('Помилка збереження')
    } finally {
      btn.disabled = false
    }
  })

  // ── Запросити учасника ──────────────────────────────────
  container.querySelector('#biz-invite-btn').addEventListener('click', () => {
    container.querySelector('#biz-invite-modal').style.display = 'flex'
    container.querySelector('#inv-role').value = ''
    container.querySelector('#inv-code-result').style.display = 'none'
    container.querySelector('#inv-foot').style.display = 'flex'
    container.querySelectorAll('#inv-modules input').forEach(c => c.checked = true)
  })
  container.querySelector('#biz-invite-close').addEventListener('click', () => {
    container.querySelector('#biz-invite-modal').style.display = 'none'
  })
  container.querySelector('#biz-invite-cancel').addEventListener('click', () => {
    container.querySelector('#biz-invite-modal').style.display = 'none'
  })

  container.querySelector('#inv-generate').addEventListener('click', async () => {
    const role    = container.querySelector('#inv-role').value.trim()
    const modules = [...container.querySelectorAll('#inv-modules input:checked')].map(c => c.value)
    if (!role)            { showToast('Введіть посаду'); return }
    if (!modules.length)  { showToast('Оберіть хоча б один розділ'); return }

    const btn = container.querySelector('#inv-generate')
    btn.disabled = true

    try {
      const code = await createInvite(workspaceId, { role, modules })
      container.querySelector('#inv-code-val').textContent = code
      container.querySelector('#inv-code-result').style.display = 'block'
      container.querySelector('#inv-foot').style.display = 'none'
    } catch (err) {
      console.error(err)
      showToast('Помилка створення запрошення')
    } finally {
      btn.disabled = false
    }
  })

  container.querySelector('#inv-copy-btn').addEventListener('click', () => {
    const code = container.querySelector('#inv-code-val').textContent
    navigator.clipboard?.writeText(code)
    showToast(`Код ${code} скопійовано`)
  })

  // ── Pending invite actions ──────────────────────────────
  container.querySelectorAll('.biz-invite-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.code)
      showToast(`Код ${btn.dataset.code} скопійовано`)
    })
  })
  container.querySelectorAll('.biz-invite-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити це запрошення?')) return
      await deleteInvite(workspaceId, btn.dataset.code)
      showToast('Запрошення видалено')
      navigate('business')
    })
  })

  // ── Редагувати учасника ─────────────────────────────────
  container.querySelectorAll('.biz-member-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openMemberModal(btn.dataset.uid))
  })

  function openMemberModal(uid) {
    const member = members.find(m => m.id === uid)
    if (!member) return

    container.querySelector('#member-role-input').value = member.role || ''
    container.querySelector('#member-modules-grid').innerHTML = ownerModules
      .map(id => ALL_MODULES.find(x => x.id === id)).filter(Boolean).map(m => `
        <label class="biz-check-item">
          <input type="checkbox" value="${m.id}" ${(member.modules || []).includes(m.id) ? 'checked' : ''}>
          <span class="biz-check-box"><span>${m.icon}</span><span>${m.label}</span></span>
        </label>
      `).join('')

    container.querySelector('#biz-member-modal').dataset.uid = uid
    container.querySelector('#biz-member-modal').style.display = 'flex'
  }

  container.querySelector('#biz-member-close').addEventListener('click', () => {
    container.querySelector('#biz-member-modal').style.display = 'none'
  })
  container.querySelector('#biz-member-cancel').addEventListener('click', () => {
    container.querySelector('#biz-member-modal').style.display = 'none'
  })

  container.querySelector('#biz-member-save').addEventListener('click', async () => {
    const uid     = container.querySelector('#biz-member-modal').dataset.uid
    const role    = container.querySelector('#member-role-input').value.trim()
    const modules = [...container.querySelectorAll('#member-modules-grid input:checked')].map(c => c.value)
    if (!role || !modules.length) return

    const btn = container.querySelector('#biz-member-save')
    btn.disabled = true
    try {
      await updateMember(workspaceId, uid, { role, modules })
      container.querySelector('#biz-member-modal').style.display = 'none'
      showToast('Учасника оновлено')
      navigate('business')
    } catch (err) {
      console.error(err)
      showToast('Помилка збереження')
    } finally {
      btn.disabled = false
    }
  })

  container.querySelector('#member-remove-btn').addEventListener('click', async () => {
    const uid    = container.querySelector('#biz-member-modal').dataset.uid
    const member = members.find(m => m.id === uid)
    if (!confirm(`Видалити "${member?.name}" з команди?`)) return
    await removeMember(workspaceId, uid)
    container.querySelector('#biz-member-modal').style.display = 'none'
    showToast('Учасника видалено')
    navigate('business')
  })
}

// ── Helpers ───────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'B'
}

function showToast(msg) {
  const t = document.createElement('div')
  t.className = 'biz-toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2800)
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('business-styles')) return
  const s = document.createElement('style')
  s.id = 'business-styles'
  s.textContent = `
    .biz-page    { padding: 28px 36px; max-width: 1100px; }
    .biz-spinner { display: flex; justify-content: center; padding: 80px; }
    .biz-empty-access { text-align:center; padding: 80px; font-size: 18px; color: var(--text-muted); }

    /* Topbar */
    .biz-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
    .biz-topbar-left { display: flex; align-items: center; gap: 16px; }
    .biz-logo {
      width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 800;
    }
    .biz-company-name { font-family: var(--font-display); font-size: 24px; font-weight: 800; margin-bottom: 6px; }
    .biz-niche-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 700; padding: 3px 10px;
      border-radius: var(--radius-full); border: 1px solid;
    }
    .biz-topbar-actions { display: flex; gap: 10px; }

    /* Stats */
    .biz-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .biz-stat-card {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 18px 20px;
      text-align: center;
    }
    .biz-stat-value { font-family: var(--font-display); font-size: 28px; font-weight: 800; margin-bottom: 4px; }
    .biz-stat-label { font-size: 12px; color: var(--text-secondary); }

    /* Body layout */
    .biz-body { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
    @media (max-width: 800px) { .biz-body { grid-template-columns: 1fr; } }

    /* Card */
    .biz-card {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-xl); padding: 20px; margin-bottom: 14px;
    }
    .biz-card:last-child { margin-bottom: 0; }
    .biz-card-title  { font-family: var(--font-display); font-size: 15px; font-weight: 700; margin-bottom: 16px; }
    .biz-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .biz-member-count { font-size: 12px; color: var(--text-muted); }

    /* Info list */
    .biz-info-list  { display: flex; flex-direction: column; gap: 0; }
    .biz-info-row   { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
    .biz-info-row:last-child { border-bottom: none; }
    .biz-info-icon  { font-size: 15px; width: 22px; text-align: center; flex-shrink: 0; }
    .biz-info-label { font-size: 12px; color: var(--text-muted); width: 70px; flex-shrink: 0; }
    .biz-info-value { font-size: 13px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Modules list */
    .biz-modules-list { display: flex; flex-direction: column; gap: 2px; }
    .biz-module-row {
      display: flex; align-items: center; gap: 10px; padding: 9px 10px;
      border-radius: var(--radius-md); cursor: pointer; transition: background .15s;
    }
    .biz-module-row:hover { background: var(--bg-tertiary); }
    .biz-module-icon  { font-size: 16px; width: 22px; text-align: center; }
    .biz-module-label { flex: 1; font-size: 13px; font-weight: 500; }
    .biz-module-arrow { font-size: 12px; color: var(--text-muted); opacity: 0; transition: opacity .15s; }
    .biz-module-row:hover .biz-module-arrow { opacity: 1; }

    /* Members */
    .biz-member-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .biz-member-row:last-child { border-bottom: none; }
    .biz-member-owner { border-bottom: 2px solid var(--border); margin-bottom: 4px; padding-bottom: 14px; }
    .biz-member-avatar {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      background: var(--bg-tertiary); display: flex; align-items: center;
      justify-content: center; font-size: 14px; font-weight: 700;
    }
    .biz-member-info  { flex: 1; min-width: 0; }
    .biz-member-name  { font-size: 14px; font-weight: 600; }
    .biz-member-role  { font-size: 11px; color: var(--text-secondary); margin-top: 1px; }
    .biz-member-mods  { display: flex; gap: 4px; align-items: center; }
    .biz-mod-chip     { font-size: 15px; opacity: .75; }
    .biz-mod-more     { font-size: 11px; color: var(--text-muted); }
    .biz-member-edit-btn {
      background: none; border: 1px solid var(--border); border-radius: 6px;
      padding: 4px 7px; cursor: pointer; font-size: 12px;
      opacity: 0; transition: opacity .2s;
    }
    .biz-member-row:hover .biz-member-edit-btn { opacity: 1; }
    .biz-access-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); }
    .biz-access-owner { background: rgba(79,142,247,.15); color: var(--accent-blue); }
    .biz-no-members   { font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px 0; }

    /* Pending invites */
    .biz-invite-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 0; border-bottom: 1px solid var(--border);
    }
    .biz-invite-row:last-child { border-bottom: none; }
    .biz-invite-code { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 800; letter-spacing: 2px; color: var(--accent-blue); width: 72px; flex-shrink: 0; }
    .biz-invite-info { flex: 1; }
    .biz-invite-role { font-size: 13px; font-weight: 600; }
    .biz-invite-mods { font-size: 11px; color: var(--text-muted); }
    .biz-invite-copy, .biz-invite-del {
      background: none; border: 1px solid var(--border); border-radius: 6px;
      padding: 4px 8px; cursor: pointer; font-size: 12px; transition: all .2s;
    }
    .biz-invite-del:hover { border-color: #F87171; color: #F87171; }

    /* Modals */
    .biz-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
    .biz-modal {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-xl); width: 100%; max-width: 560px;
      max-height: 88vh; display: flex; flex-direction: column;
      box-shadow: var(--shadow-xl);
      animation: biz-in .2s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes biz-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .biz-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 0; flex-shrink: 0; }
    .biz-modal-head h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; }
    .biz-modal-close { background: none; border: none; font-size: 15px; color: var(--text-muted); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; transition: all .2s; }
    .biz-modal-close:hover { background: rgba(239,68,68,.12); color: #F87171; }
    .biz-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .biz-modal-foot { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 24px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }

    .biz-label    { display: block; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
    .biz-form-row { margin-bottom: 16px; }
    .biz-form-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }

    /* Niche selector in modal */
    .biz-niche-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .biz-niche-card {
      display: flex; align-items: center; gap: 8px;
      background: var(--bg-tertiary); border: 2px solid var(--border);
      border-radius: var(--radius-md); padding: 10px 12px;
      cursor: pointer; font-size: 13px; font-weight: 600; transition: all .15s;
    }
    .biz-niche-card:hover  { border-color: var(--nc); }
    .biz-niche-card.selected { border-color: var(--nc); background: color-mix(in srgb, var(--nc) 12%, transparent); color: var(--nc); }

    /* Module checkboxes */
    .biz-modules-check { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 16px; }
    .biz-check-item input { display: none; }
    .biz-check-box {
      display: flex; align-items: center; gap: 6px;
      background: var(--bg-tertiary); border: 1.5px solid var(--border);
      border-radius: var(--radius-md); padding: 7px 10px;
      font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s;
    }
    .biz-check-item input:checked + .biz-check-box { background: rgba(79,142,247,.1); border-color: var(--accent-blue); color: var(--accent-blue); }

    /* Invite code */
    .biz-code-block { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 20px; text-align: center; margin-top: 16px; }
    .biz-code-label   { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
    .biz-code-display { font-family: var(--font-mono, monospace); font-size: 40px; font-weight: 800; letter-spacing: 8px; color: var(--accent-blue); margin-bottom: 12px; }
    .biz-code-hint    { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 10px; }

    /* Toast */
    .biz-toast {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-full); padding: 10px 20px;
      font-size: 13px; font-weight: 600; z-index: 9999;
      animation: biz-toast .25s ease;
    }
    @keyframes biz-toast { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

    .btn-ghost { background: transparent; border: 1px solid transparent; color: var(--text-muted); }
    .btn-ghost:hover { border-color: #F87171; color: #F87171; }
    .biz-remove-btn { margin-right: auto; }
  `
  document.head.appendChild(s)
}
