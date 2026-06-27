// src/renderer/pages/business/index.js
import { navigate } from '../../../core/router.js'
import { getCurrentUser, getUserProfile, updateProfileCache, getActivePathSegments } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { db } from '../../services/firebase.js'
import { doc, getDoc, getDocs, updateDoc, serverTimestamp, collection, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import {
  ensureWorkspace, getWorkspace, getMembers, getPendingInvites,
  createInvite, deleteInvite, removeMember, updateMember,
} from '../../services/workspace.js'
import { icon } from '../../utils/icons.js'

const NICHES = [
  { id: 'freelancer', iconName: 'laptop',     label: 'Фрілансер',        color: '#4F8EF7' },
  { id: 'accountant', iconName: 'bar-chart',  label: 'Бухгалтер / ФОП',  color: '#34D399' },
  { id: 'smm',        iconName: 'smartphone', label: 'SMM / Маркетолог',  color: '#A78BFA' },
  { id: 'beauty',     iconName: 'sparkles',   label: 'Салон краси',       color: '#F472B6' },
]

const ALL_MODULES = [
  { id: 'dashboard',        label: 'Дашборд' },
  { id: 'clients',          label: 'Клієнти' },
  { id: 'projects',         label: 'Проекти' },
  { id: 'invoices',         label: 'Рахунки' },
  { id: 'contracts',        label: 'Договори' },
  { id: 'tasks',            label: 'Задачі' },
  { id: 'timer',            label: 'Таймер' },
  { id: 'finances',         label: 'Фінанси' },
  { id: 'tax-calendar',     label: 'Податки' },
  { id: 'appointments',     label: 'Розклад' },
  { id: 'services',         label: 'Послуги' },
  { id: 'content-plan',     label: 'Контент' },
  { id: 'accounts',         label: 'Акаунти' },
  { id: 'passwords',        label: 'Паролі' },
  { id: 'notes',            label: 'Нотатки' },
  { id: 'documents',        label: 'Документи' },
  { id: 'api-keys',         label: 'API & Інтеграції' },
  { id: 'kanban',           label: 'Kanban' },
  { id: 'templates',        label: 'Шаблони' },
  { id: 'warehouse',        label: 'Склад' },
  { id: 'portfolio',        label: 'Портфоліо' },
  { id: 'hr',               label: 'Персонал' },
  { id: 'client-analytics', label: 'Аналітика' },
  { id: 'currency',         label: 'Валюти' },
  { id: 'reports',          label: 'Звіти' },
  { id: 'support',          label: 'Підтримка' },
]

// Modules that we load full docs for (to compute rich stats)
const RICH_COLLECTIONS = ['clients', 'invoices', 'tasks', 'projects', 'contracts', 'finances']
// Modules that we just count
const COUNT_COLLECTIONS = ['notes', 'passwords', 'appointments', 'services', 'warehouse',
                           'kanban', 'templates', 'portfolio', 'hr', 'documents', 'api-keys', 'accounts']

export async function render(container) {
  injectStyles()

  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  if (profile?.accountType !== 'owner' && profile?.accountType !== undefined && !profile?.isWorkspaceOwner) {
    container.innerHTML = `<div class="biz-empty-access"><div style="display:flex;justify-content:center;color:var(--text-muted)">${icon('x-circle', 40)}</div><p>Ця сторінка доступна тільки власнику бізнесу</p></div>`
    return
  }

  if (!profile?.isWorkspaceOwner) {
    await ensureWorkspace(user.uid, profile)
    updateProfileCache(user.uid, { workspaceId: user.uid, isWorkspaceOwner: true })
  }

  let activeBizProfile = null
  if (profile?.activeBusiness) {
    try {
      const bizSnap = await getDoc(doc(db, 'users', user.uid, 'businesses', profile.activeBusiness))
      if (bizSnap.exists()) activeBizProfile = { id: bizSnap.id, ...bizSnap.data() }
    } catch { /* ignore */ }
  }

  const effectiveProfile = activeBizProfile
    ? { ...profile, businessName: activeBizProfile.name, profession: activeBizProfile.profession, _isSecondary: true, _bizId: activeBizProfile.id }
    : profile

  const workspaceId = profile?.workspaceId || user.uid

  container.innerHTML = `<div class="biz-page"><div class="biz-spinner"><div class="spinner"></div></div></div>`

  const basePath = getActivePathSegments(user.uid)

  const loadDocs = async (col) => {
    try {
      const snap = await getDocs(collection(db, ...basePath, col))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { return [] }
  }
  const getCount = async (col) => {
    try {
      const snap = await getCountFromServer(collection(db, ...basePath, col))
      return snap.data().count
    } catch { return 0 }
  }

  // For secondary businesses — skip workspace/members loading (they're isolated)
  const isSecondary = !!activeBizProfile

  const [
    workspace, members, invites,
    clients, invoices, tasks, projects, contracts, finances,
    notesCount, passwordsCount, appointmentsCount, servicesCount,
    warehouseCount, kanbanCount, templatesCount, portfolioCount,
    hrCount, docsCount, apiKeysCount, accountsCount,
  ] = await Promise.all([
    isSecondary ? Promise.resolve(null)  : getWorkspace(workspaceId).catch(() => null),
    isSecondary ? Promise.resolve([])    : getMembers(workspaceId).catch(() => []),
    isSecondary ? Promise.resolve([])    : getPendingInvites(workspaceId).catch(() => []),
    loadDocs('clients'),
    loadDocs('invoices'),
    loadDocs('tasks'),
    loadDocs('projects'),
    loadDocs('contracts'),
    loadDocs('finances'),
    getCount('notes'),
    getCount('passwords'),
    getCount('appointments'),
    getCount('services'),
    getCount('warehouse'),
    getCount('kanban'),
    getCount('templates'),
    getCount('portfolio'),
    getCount('hr'),
    getCount('documents'),
    getCount('api-keys'),
    getCount('accounts'),
  ])

  const counts = {
    notes: notesCount, passwords: passwordsCount, appointments: appointmentsCount,
    services: servicesCount, warehouse: warehouseCount, kanban: kanbanCount,
    templates: templatesCount, portfolio: portfolioCount, hr: hrCount,
    documents: docsCount, 'api-keys': apiKeysCount, accounts: accountsCount,
  }

  const richData = { clients, invoices, tasks, projects, contracts, finances }

  const config = getProfessionConfig(effectiveProfile?.profession)
  const niche  = NICHES.find(n => n.id === effectiveProfile?.profession) || NICHES[0]

  renderPage(container, { profile: effectiveProfile, workspace, members, invites, config, niche, workspaceId, user, richData, counts })
}

// ── Compute derived stats ─────────────────────────────────
function computeStats(richData) {
  const now   = new Date()
  const thisM = now.getMonth()
  const thisY = now.getFullYear()
  const inThisMonth = d => d && d.getMonth() === thisM && d.getFullYear() === thisY

  const { clients = [], invoices = [], tasks = [], projects = [], contracts = [], finances = [] } = richData

  const paidThisMonth = invoices
    .filter(i => i.status === 'paid' && inThisMonth(i.createdAt?.toDate?.() || (i.date ? new Date(i.date) : null)))
    .reduce((s, i) => s + (i.amount || 0), 0)

  return {
    clients: {
      total:        clients.length,
      active:       clients.filter(c => c.status === 'active').length,
      inactive:     clients.filter(c => c.status === 'inactive' || c.status === 'archived').length,
      newThisMonth: clients.filter(c => inThisMonth(c.createdAt?.toDate?.())).length,
    },
    invoices: {
      total:        invoices.length,
      paidCount:    invoices.filter(i => i.status === 'paid').length,
      unpaidCount:  invoices.filter(i => i.status !== 'paid').length,
      paidAmount:   invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0),
      unpaidAmount: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount || 0), 0),
      paidThisMonth,
    },
    tasks: {
      total:      tasks.length,
      done:       tasks.filter(t => t.status === 'done').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      new:        tasks.filter(t => t.status === 'new' || !t.status).length,
      doneThisMonth: tasks.filter(t => t.status === 'done' && inThisMonth(t.createdAt?.toDate?.())).length,
    },
    projects: {
      total:    projects.length,
      active:   projects.filter(p => p.status === 'active' || p.status === 'in_progress').length,
      done:     projects.filter(p => p.status === 'done' || p.status === 'completed').length,
      pending:  projects.filter(p => !p.status || p.status === 'new' || p.status === 'pending').length,
    },
    contracts: {
      total:  contracts.length,
      active: contracts.filter(c => c.status === 'active' || c.status === 'signed').length,
      draft:  contracts.filter(c => c.status === 'draft' || !c.status).length,
    },
    finances: {
      total:   finances.length,
      income:  finances.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0),
      expense: finances.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0),
    },
  }
}

// ── Render page ───────────────────────────────────────────
function renderPage(container, ctx) {
  const { profile, members, invites, config, niche, user, richData, counts } = ctx
  const ownerModules = config.modules
  const stats = computeStats(richData)

  const fmt = n => n >= 1000000 ? (n / 1000000).toFixed(1) + 'М' : n >= 1000 ? Math.round(n / 1000) + 'к' : n

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
              ${icon(niche.iconName, 12)} ${niche.label}
            </div>
          </div>
        </div>
        <div class="biz-topbar-actions">
          <button class="btn btn-secondary" id="biz-edit-btn">${icon('edit', 14)} Редагувати</button>
          ${!profile?._isSecondary ? `<button class="btn btn-primary" id="biz-invite-btn">+ Запросити</button>` : `<button class="btn btn-primary" id="biz-invite-btn" style="display:none"></button>`}
        </div>
      </div>

      <!-- ── KPI рядок ── -->
      <div class="biz-kpi-row">
        <div class="biz-kpi-card biz-kpi--revenue">
          <div class="biz-kpi-icon">${icon('finances', 24)}</div>
          <div class="biz-kpi-body">
            <div class="biz-kpi-label">Дохід цього місяця</div>
            <div class="biz-kpi-value">₴${stats.invoices.paidThisMonth.toLocaleString('uk-UA')}</div>
            <div class="biz-kpi-sub">${stats.invoices.paidCount} оплачених рахунків</div>
          </div>
        </div>
        <div class="biz-kpi-card biz-kpi--clients">
          <div class="biz-kpi-icon">${icon('clients', 24)}</div>
          <div class="biz-kpi-body">
            <div class="biz-kpi-label">Клієнти</div>
            <div class="biz-kpi-value">${stats.clients.total}</div>
            <div class="biz-kpi-sub">${stats.clients.active} активних · +${stats.clients.newThisMonth} цього місяця</div>
          </div>
        </div>
        <div class="biz-kpi-card biz-kpi--tasks">
          <div class="biz-kpi-icon">${icon('check-circle', 24)}</div>
          <div class="biz-kpi-body">
            <div class="biz-kpi-label">${ownerModules.includes('tasks') ? 'Задачі' : 'Проекти'}</div>
            <div class="biz-kpi-value">${ownerModules.includes('tasks') ? `${stats.tasks.done} / ${stats.tasks.total}` : `${stats.projects.active} / ${stats.projects.total}`}</div>
            <div class="biz-kpi-sub">${ownerModules.includes('tasks') ? `${stats.tasks.inProgress} в роботі · ${stats.tasks.new} нових` : `${stats.projects.done} виконано`}</div>
          </div>
        </div>
        <div class="biz-kpi-card biz-kpi--team">
          <div class="biz-kpi-icon">${icon('team', 24)}</div>
          <div class="biz-kpi-body">
            <div class="biz-kpi-label">Команда & план</div>
            <div class="biz-kpi-value">${members.length + 1} осіб</div>
            <div class="biz-kpi-sub" style="color:${profile?.plan === 'business' ? '#A78BFA' : profile?.plan === 'pro' ? '#4F8EF7' : '#94A3B8'};font-weight:700">${(profile?.plan || 'free').toUpperCase()} ПЛАН</div>
          </div>
        </div>
      </div>

      <!-- ── Панель керування ── -->
      <div class="bcp-section">
        <div class="bcp-section-head">
          <div class="bcp-section-title">${icon('bar-chart', 16)} Панель керування</div>
          <div class="bcp-section-sub">${ownerModules.length} активних модулів</div>
        </div>
        <div class="bcp-grid">
          ${renderControlPanel(ownerModules, stats, counts, richData)}
        </div>
      </div>

      <!-- ── Нижня секція ── -->
      <div class="biz-body">

        <!-- Ліва: інфо + модулі -->
        <div class="biz-col-left">
          <div class="biz-card">
            <div class="biz-card-title">${icon('info', 15)} Інформація</div>
            <div class="biz-info-list">
              ${infoRow('user', 'Власник', profile?.name || '—')}
              ${infoRow('mail', 'Email',   profile?.email || '—')}
              ${!profile?._isSecondary ? `
                ${infoRow('phone', 'Телефон',   profile?.phone || '—')}
                ${infoRow('map-pin', 'Місто',     profile?.city || '—')}
                ${infoRow('globe', 'Сайт',      profile?.website || '—')}
                ${infoRow('globe', 'Instagram', profile?.instagram ? '@' + profile.instagram : '—')}
                ${profile?.tgChannel ? infoRow('send', 'Telegram', `<a href="https://t.me/${profile.tgChannel.replace(/^@/, '')}" target="_blank" class="biz-link">@${profile.tgChannel.replace(/^@/, '')}</a>`) : infoRow('send', 'Telegram', '—')}
                ${(() => {
                  const cur = profile?.workingCurrency || 'uah'
                  const labels = { usd: '$ Долари (USD)', eur: '€ Євро (EUR)', uah: '₴ Гривня (UAH)', crypto: `₿ Крипта${profile?.cryptoType ? ' · ' + profile.cryptoType : ''}` }
                  return infoRow('finances', 'Валюта', labels[cur] || '₴ Гривня (UAH)')
                })()}
                ${infoRow('file', 'ІПН/ЄДРПОУ', profile?.taxCode || '—')}
                ${infoRow('bank', 'Банк',       profile?.bankName || '—')}
                ${infoRow('bank', 'IBAN',       profile?.iban || '—')}
              ` : `
                <div class="biz-secondary-note">
                  Це окремий бізнес — контактні дані зберігаються в Редагувати
                </div>
              `}
            </div>
          </div>

        </div>

        <!-- Права: команда + telegram -->
        <div class="biz-col-right">
          <div class="biz-card">
            <div class="biz-card-header">
              <div class="biz-card-title">${icon('team', 15)} Команда</div>
              ${!profile?._isSecondary ? `<span class="biz-member-count">${members.length + 1} осіб</span>` : ''}
            </div>
            ${profile?._isSecondary
              ? `<div class="biz-secondary-team-note">
                  <div class="biz-stn-icon">${icon('briefcase', 22)}</div>
                  <div>
                    <div class="biz-stn-title">Окремий бізнес</div>
                    <div class="biz-stn-sub">Цей бізнес має власний ізольований простір. Команда управляється через головний акаунт.</div>
                  </div>
                </div>
                <div class="biz-member-row biz-member-owner">
                  <div class="biz-member-avatar" style="background:${niche.color}22;border:1.5px solid ${niche.color}44">
                    <span style="color:${niche.color}">${initials(profile?.name)}</span>
                  </div>
                  <div class="biz-member-info">
                    <div class="biz-member-name">${profile?.name || 'Власник'}</div>
                    <div class="biz-member-role">${icon('briefcase', 12)} Власник бізнесу</div>
                  </div>
                  <div class="biz-member-access">
                    <span class="biz-access-badge biz-access-owner">Повний доступ</span>
                  </div>
                </div>`
              : `<div class="biz-member-row biz-member-owner">
                  <div class="biz-member-avatar" style="background:${niche.color}22;border:1.5px solid ${niche.color}44">
                    <span style="color:${niche.color}">${initials(profile?.name)}</span>
                  </div>
                  <div class="biz-member-info">
                    <div class="biz-member-name">${profile?.name || 'Власник'}</div>
                    <div class="biz-member-role">${icon('briefcase', 12)} Власник бізнесу</div>
                  </div>
                  <div class="biz-member-access">
                    <span class="biz-access-badge biz-access-owner">Повний доступ</span>
                  </div>
                </div>
                ${members.length === 0
                  ? `<div class="biz-no-members">Немає учасників. Запросіть першого!</div>`
                  : members.map(m => memberRow(m)).join('')}`
            }
          </div>

          ${invites.length > 0 ? `
            <div class="biz-card" style="margin-top:14px">
              <div class="biz-card-title">${icon('timer', 15)} Очікують вступу</div>
              ${invites.map(i => `
                <div class="biz-invite-row">
                  <div class="biz-invite-code">${i.code}</div>
                  <div class="biz-invite-info">
                    <div class="biz-invite-role">${i.role}</div>
                    <div class="biz-invite-mods">${(i.modules || []).length} розділів</div>
                  </div>
                  <button class="biz-invite-copy" data-code="${i.code}" title="Скопіювати">${icon('copy', 13)}</button>
                  <button class="biz-invite-del"  data-code="${i.code}" title="Видалити">${icon('x', 13)}</button>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${members.length === 0 ? `
            <div class="biz-card biz-tips-card" style="margin-top:14px">
              <div class="biz-card-title">${icon('zap', 15)} Поради для старту</div>
              <div class="biz-tips-list">
                <div class="biz-tip-row"><span class="biz-tip-num">1</span><div><div class="biz-tip-title">Заповніть інформацію</div><div class="biz-tip-desc">Додайте телефон, сайт та соцмережі</div></div></div>
                <div class="biz-tip-row"><span class="biz-tip-num">2</span><div><div class="biz-tip-title">Запросіть команду</div><div class="biz-tip-desc">Натисніть «+ Запросити» і поділіться кодом</div></div></div>
                <div class="biz-tip-row"><span class="biz-tip-num">3</span><div><div class="biz-tip-title">Налаштуйте модулі</div><div class="biz-tip-desc">Увімкніть лише потрібні розділи</div></div></div>
              </div>
            </div>
          ` : ''}

        </div>
      </div>
    </div>

    <!-- ── Редагування бізнесу ── -->
    <div class="biz-overlay" id="biz-edit-modal" style="display:none">
      <div class="biz-modal">
        <div class="biz-modal-head">
          <h2>${icon('edit', 18)} Редагувати бізнес</h2>
          <button class="biz-modal-close" id="biz-edit-close">${icon('x', 14)}</button>
        </div>
        <div class="biz-modal-body">
          <div class="biz-form-row">
            <label class="biz-label">Назва бізнесу *</label>
            <input type="text" class="input" id="edit-biz-name" value="${profile?.businessName || ''}" placeholder="Design Studio">
          </div>
          ${!profile?._isSecondary ? `
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
          <div class="biz-form-row2">
            <div>
              <label class="biz-label">Telegram канал</label>
              <input type="text" class="input" id="edit-biz-tgchannel" value="${profile?.tgChannel || ''}" placeholder="@mychannel">
            </div>
            <div>
              <label class="biz-label">Токен бота</label>
              <input type="text" class="input" id="edit-biz-tgtoken" value="${profile?.tgBotToken || ''}" placeholder="123456:ABC-DEF...">
            </div>
          </div>
          <div class="biz-form-section">
            <label class="biz-label">Реквізити ФОП (для рахунків/виплат)</label>
            <div class="biz-form-row2">
              <div>
                <label class="biz-label">ІПН / ЄДРПОУ</label>
                <input type="text" class="input" id="edit-biz-taxcode" value="${profile?.taxCode || ''}" placeholder="1234567890">
              </div>
              <div>
                <label class="biz-label">Банк</label>
                <input type="text" class="input" id="edit-biz-bank" value="${profile?.bankName || ''}" placeholder="АТ КБ «ПриватБанк»">
              </div>
            </div>
            <div class="biz-form-row" style="margin-top:10px">
              <label class="biz-label">IBAN / Розрахунковий рахунок</label>
              <input type="text" class="input" id="edit-biz-iban" value="${profile?.iban || ''}" placeholder="UA00 0000 0000 0000 0000 0000 0">
            </div>
            <div class="biz-form-row2" style="margin-top:10px">
              <div>
                <label class="biz-label">Тип криптовалюти (для оплат)</label>
                <select class="input" id="edit-biz-cryptotype">
                  ${['USDT TRC20','USDT ERC20','BTC','ETH','BNB','SOL','TON'].map(ct => `
                    <option value="${ct}" ${(profile?.cryptoAddrType || profile?.cryptoType || 'USDT TRC20') === ct ? 'selected' : ''}>${ct}</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="biz-label">Адреса криптокошелька</label>
                <input type="text" class="input" id="edit-biz-cryptoaddr" value="${profile?.cryptoAddress || ''}" placeholder="0x... або TXxxxxx...">
              </div>
            </div>
          </div>
          ` : ''}
          <div class="biz-form-section">
            <label class="biz-label">Валюта розрахунків</label>
            <div class="biz-currency-grid" id="edit-currency-grid">
              ${[
                { id: 'usd',    sym: '$',  label: 'Долари',   code: 'USD' },
                { id: 'eur',    sym: '€',  label: 'Євро',     code: 'EUR' },
                { id: 'uah',    sym: '₴',  label: 'Гривня',   code: 'UAH' },
                { id: 'crypto', sym: '₿',  label: 'Крипта',   code: 'CRYPTO' },
              ].map(c => `
                <button class="biz-currency-btn ${(profile?.workingCurrency || 'uah') === c.id ? 'selected' : ''}" data-currency="${c.id}">
                  <span class="biz-currency-sym">${c.sym}</span>
                  <span class="biz-currency-name">${c.label}</span>
                  <span class="biz-currency-code">${c.code}</span>
                </button>
              `).join('')}
            </div>
            <div class="biz-crypto-row" id="edit-crypto-row" style="display:${profile?.workingCurrency === 'crypto' ? 'flex' : 'none'}">
              <label class="biz-label" style="margin-bottom:6px">Тип криптовалюти</label>
              <div class="biz-crypto-grid" id="edit-crypto-grid">
                ${['USDT TRC20','USDT ERC20','BTC','ETH','BNB','SOL','TON'].map(ct => `
                  <button class="biz-crypto-btn ${(profile?.cryptoType || 'USDT TRC20') === ct ? 'selected' : ''}" data-crypto="${ct}">${ct}</button>
                `).join('')}
              </div>
            </div>
          </div>
          <label class="biz-label" style="margin-top:16px">Сфера діяльності</label>
          <div class="biz-niche-grid" id="edit-niche-grid">
            ${NICHES.map(n => `
              <div class="biz-niche-card ${profile?.profession === n.id ? 'selected' : ''}" data-niche="${n.id}" style="--nc:${n.color}">
                <span>${icon(n.iconName, 14)}</span><span>${n.label}</span>
              </div>`).join('')}
            <div class="biz-niche-card biz-niche-custom ${!profile?.profession || !NICHES.find(n=>n.id===profile?.profession) ? 'selected' : ''}" data-niche="custom" style="--nc:#A78BFA;grid-column:span 2">
              <span>${icon('settings', 14)}</span><span>Інша ніша — вибрати модулі вручну</span>
            </div>
          </div>
          <label class="biz-label" style="margin-top:16px">Активні модулі</label>
          <div class="biz-modules-edit-grid" id="edit-modules-grid">
            ${ALL_MODULES.filter(m => m.id !== 'dashboard').map(m => {
              const active = profile?.selectedModules?.includes(m.id) || config.modules.includes(m.id)
              return `<label class="biz-mod-toggle ${active ? 'active' : ''}" data-mod="${m.id}">
                <span>${icon(m.id, 12)}</span><span>${m.label}</span><span class="biz-mod-chk">${icon('check', 9)}</span>
              </label>`
            }).join('')}
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
          <h2>${icon('team', 18)} Запросити учасника</h2>
          <button class="biz-modal-close" id="biz-invite-close">${icon('x', 14)}</button>
        </div>
        <div class="biz-modal-body">
          <div class="biz-form-row">
            <label class="biz-label">Посада / роль *</label>
            <input type="text" class="input" id="inv-role" placeholder="Розробник, Дизайнер…" maxlength="40">
          </div>
          <label class="biz-label" style="margin-top:16px">Доступ до розділів</label>
          <div class="biz-modules-check" id="inv-modules">
            ${ownerModules.map(id => ALL_MODULES.find(x => x.id === id)).filter(Boolean).map(m => `
              <label class="biz-check-item">
                <input type="checkbox" value="${m.id}" checked>
                <span class="biz-check-box"><span>${icon(m.id, 12)}</span><span>${m.label}</span></span>
              </label>`).join('')}
          </div>
          <div id="inv-code-result" style="display:none">
            <div class="biz-code-block">
              <div class="biz-code-label">Код запрошення</div>
              <div class="biz-code-display" id="inv-code-val">------</div>
              <button class="btn btn-secondary" id="inv-copy-btn">${icon('copy', 13)} Скопіювати</button>
              <div class="biz-code-hint">Поділіться цим кодом з учасником.</div>
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
          <h2>${icon('edit', 18)} Редагувати учасника</h2>
          <button class="biz-modal-close" id="biz-member-close">${icon('x', 14)}</button>
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
          <button class="btn btn-ghost biz-remove-btn" id="member-remove-btn">${icon('x-circle', 14)} Видалити з команди</button>
          <button class="btn btn-secondary" id="biz-member-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="biz-member-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  bindEvents(container, ctx)
}

// ── Control Panel Cards ───────────────────────────────────
function renderControlPanel(modules, stats, counts, richData) {
  const SKIP = ['dashboard']
  return modules
    .filter(id => !SKIP.includes(id))
    .map(id => renderModuleCard(id, stats, counts, richData))
    .join('')
}

function renderModuleCard(id, stats, counts, richData) {
  const meta = ALL_MODULES.find(m => m.id === id)
  if (!meta) return ''

  const colorMap = {
    clients: '#4F8EF7', projects: '#34D399', invoices: '#F59E0B', contracts: '#A78BFA',
    tasks: '#F472B6', timer: '#38BDF8', finances: '#34D399', 'tax-calendar': '#FB923C',
    appointments: '#E879F9', services: '#F472B6', 'content-plan': '#38BDF8', accounts: '#A3E635',
    passwords: '#94A3B8', notes: '#6EE7B7', documents: '#4F8EF7', 'api-keys': '#A78BFA',
    kanban: '#FB923C', templates: '#F59E0B', warehouse: '#94A3B8', portfolio: '#A78BFA',
    hr: '#34D399', 'client-analytics': '#4F8EF7', currency: '#F59E0B',
    reports: '#4F8EF7', support: '#38BDF8',
  }
  const color = colorMap[id] || '#94A3B8'

  let mainValue = '—'
  let rows = []
  let progress = null

  switch (id) {
    case 'clients': {
      const s = stats.clients
      mainValue = s.total
      rows = [
        { dot: '#34D399', label: 'Активних',           val: s.active },
        { dot: '#94A3B8', label: 'Неактивних',          val: s.inactive },
        { dot: color,     label: 'Нових цього місяця',  val: '+' + s.newThisMonth },
      ]
      progress = s.total ? Math.round((s.active / s.total) * 100) : 0
      break
    }
    case 'projects': {
      const s = stats.projects
      mainValue = s.total
      rows = [
        { dot: '#4F8EF7', label: 'Активних',  val: s.active },
        { dot: '#34D399', label: 'Виконано',  val: s.done },
        { dot: '#94A3B8', label: 'Очікують',  val: s.pending },
      ]
      progress = s.total ? Math.round(((s.active + s.done) / s.total) * 100) : 0
      break
    }
    case 'invoices': {
      const s = stats.invoices
      mainValue = '₴' + (s.paidAmount >= 1000 ? Math.round(s.paidAmount / 1000) + 'к' : s.paidAmount)
      rows = [
        { dot: '#34D399', label: 'Оплачено',   val: s.paidCount + ' рах.' },
        { dot: '#FBBF24', label: 'Очікується', val: s.unpaidCount + ' · ₴' + (s.unpaidAmount >= 1000 ? Math.round(s.unpaidAmount / 1000) + 'к' : s.unpaidAmount) },
        { dot: color,     label: 'Цього місяця', val: '₴' + (s.paidThisMonth >= 1000 ? Math.round(s.paidThisMonth / 1000) + 'к' : s.paidThisMonth) },
      ]
      const total = s.paidAmount + s.unpaidAmount
      progress = total ? Math.round((s.paidAmount / total) * 100) : 0
      break
    }
    case 'contracts': {
      const s = stats.contracts
      mainValue = s.total
      rows = [
        { dot: '#34D399', label: 'Активних', val: s.active },
        { dot: '#94A3B8', label: 'Чернетки', val: s.draft },
      ]
      progress = s.total ? Math.round((s.active / s.total) * 100) : 0
      break
    }
    case 'tasks': {
      const s = stats.tasks
      mainValue = s.total
      rows = [
        { dot: '#34D399', label: 'Виконано',  val: s.done },
        { dot: '#FBBF24', label: 'В роботі',  val: s.inProgress },
        { dot: '#94A3B8', label: 'Нових',     val: s.new },
      ]
      progress = s.total ? Math.round((s.done / s.total) * 100) : 0
      break
    }
    case 'finances': {
      const s = stats.finances
      mainValue = s.total
      rows = [
        { dot: '#34D399', label: 'Доходи',  val: '₴' + (s.income >= 1000 ? Math.round(s.income / 1000) + 'к' : s.income) },
        { dot: '#F87171', label: 'Витрати', val: '₴' + (s.expense >= 1000 ? Math.round(s.expense / 1000) + 'к' : s.expense) },
      ]
      break
    }
    default: {
      const cnt = counts[id] ?? 0
      mainValue = cnt
      const descMap = {
        notes:            'нотаток збережено',
        passwords:        'паролів збережено',
        appointments:     'записів у розкладі',
        services:         'послуг у каталозі',
        warehouse:        'позицій на складі',
        kanban:           'карток у Kanban',
        templates:        'шаблонів',
        portfolio:        'робіт у портфоліо',
        hr:               'співробітників',
        documents:        'документів',
        'api-keys':       'API інтеграцій',
        accounts:         'соцмереж / акаунтів',
        'content-plan':   'постів у плані',
        'client-analytics': 'Аналітика клієнтів',
        timer:            'Трекер часу',
        'tax-calendar':   'Податковий календар',
        currency:         'Курси валют',
        reports:          'Звіти та метрики',
        support:          'Центр підтримки',
      }
      rows = [{ dot: color, label: descMap[id] || 'записів', val: '' }]
    }
  }

  const progressBar = progress !== null
    ? `<div class="bcp-progress-wrap">
        <div class="bcp-progress-track">
          <div class="bcp-progress-fill" style="width:${progress}%;background:${color}"></div>
        </div>
        <span class="bcp-progress-pct">${progress}%</span>
      </div>`
    : ''

  return `
    <div class="bcp-card" data-route="${id}" style="--bcp-color:${color}">
      <div class="bcp-card-top">
        <div class="bcp-header">
          <span class="bcp-icon">${icon(meta.id, 16)}</span>
          <span class="bcp-title">${meta.label}</span>
        </div>
        <div class="bcp-main-value">${mainValue}</div>
      </div>
      <div class="bcp-rows">
        ${rows.map(r => `
          <div class="bcp-row">
            <span class="bcp-row-dot" style="background:${r.dot}"></span>
            <span class="bcp-row-label">${r.label}</span>
            ${r.val !== '' ? `<span class="bcp-row-val">${r.val}</span>` : ''}
          </div>`).join('')}
      </div>
      ${progressBar}
      <div class="bcp-footer">
        <span class="bcp-go">Відкрити →</span>
      </div>
    </div>
  `
}

// ── Member row ─────────────────────────────────────────────
function memberRow(m) {
  const mods = (m.modules || []).slice(0, 4).map(id => {
    const meta = ALL_MODULES.find(x => x.id === id)
    return meta ? `<span class="biz-mod-chip" title="${meta.label}">${icon(id, 14)}</span>` : ''
  }).join('')
  const extra = (m.modules || []).length > 4 ? `<span class="biz-mod-more">+${m.modules.length - 4}</span>` : ''
  return `
    <div class="biz-member-row" data-uid="${m.id}">
      <div class="biz-member-avatar"><span>${initials(m.name)}</span></div>
      <div class="biz-member-info">
        <div class="biz-member-name">${m.name || 'Без імені'}</div>
        <div class="biz-member-role">${m.role || '—'}</div>
      </div>
      <div class="biz-member-mods">${mods}${extra}</div>
      <button class="biz-member-edit-btn" data-uid="${m.id}" title="Редагувати">${icon('edit', 13)}</button>
    </div>`
}

function infoRow(iconName, label, value) {
  return `
    <div class="biz-info-row">
      <span class="biz-info-icon">${icon(iconName, 14)}</span>
      <span class="biz-info-label">${label}</span>
      <span class="biz-info-value">${value}</span>
    </div>`
}

// ── Events ─────────────────────────────────────────────────
function bindEvents(container, ctxIn) {
  const ctx = ctxIn
  const { profile, workspace, members, invites, workspaceId, user, niche, config } = ctx
  const ownerModules = config.modules

  container.querySelectorAll('.biz-module-row').forEach(row => {
    row.addEventListener('click', () => navigate(row.dataset.route))
  })
  container.querySelectorAll('.bcp-card').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.route))
  })

  // ── Редагувати бізнес ──────────────────────────────────
  container.querySelector('#biz-edit-btn').addEventListener('click', () => {
    container.querySelector('#biz-edit-modal').style.display = 'flex'
  })
  const closeEdit = () => container.querySelector('#biz-edit-modal').style.display = 'none'
  container.querySelector('#biz-edit-close').addEventListener('click', closeEdit)
  container.querySelector('#biz-edit-cancel').addEventListener('click', closeEdit)

  let editNiche = profile?.profession || null
  container.querySelectorAll('#edit-niche-grid .biz-niche-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('#edit-niche-grid .biz-niche-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      editNiche = card.dataset.niche === 'custom' ? null : card.dataset.niche
      if (card.dataset.niche !== 'custom') {
        const defaults = {
          freelancer: ['clients','projects','invoices','contracts','tasks','timer','passwords','notes'],
          accountant: ['clients','finances','invoices','contracts','tax-calendar','passwords','notes'],
          smm:        ['clients','content-plan','accounts','tasks','passwords','notes'],
          beauty:     ['clients','appointments','services','finances','notes'],
        }
        const mods = defaults[card.dataset.niche] || []
        container.querySelectorAll('#edit-modules-grid .biz-mod-toggle').forEach(el => {
          el.classList.toggle('active', mods.includes(el.dataset.mod))
        })
      }
    })
  })

  container.querySelectorAll('#edit-modules-grid .biz-mod-toggle').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('active'))
  })

  container.querySelector('#edit-currency-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.biz-currency-btn')
    if (!btn) return
    container.querySelectorAll('#edit-currency-grid .biz-currency-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    const cryptoRow = container.querySelector('#edit-crypto-row')
    if (cryptoRow) cryptoRow.style.display = btn.dataset.currency === 'crypto' ? 'flex' : 'none'
  })

  container.querySelector('#edit-crypto-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.biz-crypto-btn')
    if (!btn) return
    container.querySelectorAll('#edit-crypto-grid .biz-crypto-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })

  container.querySelector('#biz-edit-save').addEventListener('click', async () => {
    const businessName = container.querySelector('#edit-biz-name').value.trim()
    if (!businessName) { showToast('Введіть назву бізнесу'); return }

    const btn = container.querySelector('#biz-edit-save')
    btn.disabled = true

    const activeMods = ['dashboard', ...Array.from(
      container.querySelectorAll('#edit-modules-grid .biz-mod-toggle.active')
    ).map(el => el.dataset.mod)]

    try {
      const newProfession = editNiche || null

      if (profile?._isSecondary && profile?._bizId) {
        const bizData = { name: businessName, profession: newProfession, modules: activeMods, updatedAt: serverTimestamp() }
        await updateDoc(doc(db, 'users', user.uid, 'businesses', profile._bizId), bizData)
        updateProfileCache(user.uid, { activeBusinessName: businessName, activeBusinessProfession: newProfession, activeBusinessModules: activeMods })
        closeEdit()
        showToast('Збережено')
        const newNiche  = NICHES.find(n => n.id === newProfession) || niche
        const newConfig = (await import('../../../core/profession-config.js')).getProfessionConfig(newProfession)
        renderPage(container, { ...ctx, profile: { ...profile, businessName, profession: newProfession }, niche: newNiche, config: newConfig })
        btn.disabled = false
        return
      }

      const data = {
        businessName, profession: newProfession, selectedModules: activeMods,
        phone:      container.querySelector('#edit-biz-phone')?.value.trim()     || null,
        city:       container.querySelector('#edit-biz-city')?.value.trim()      || null,
        website:    container.querySelector('#edit-biz-website')?.value.trim()   || null,
        instagram:  container.querySelector('#edit-biz-instagram')?.value.trim() || null,
        tgChannel:       container.querySelector('#edit-biz-tgchannel')?.value.trim() || null,
        tgBotToken:      container.querySelector('#edit-biz-tgtoken')?.value.trim()   || null,
        taxCode:         container.querySelector('#edit-biz-taxcode')?.value.trim()   || null,
        bankName:        container.querySelector('#edit-biz-bank')?.value.trim()      || null,
        iban:            container.querySelector('#edit-biz-iban')?.value.trim()      || null,
        cryptoAddrType:  container.querySelector('#edit-biz-cryptotype')?.value        || null,
        cryptoAddress:   container.querySelector('#edit-biz-cryptoaddr')?.value.trim() || null,
        workingCurrency: container.querySelector('#edit-currency-grid .biz-currency-btn.selected')?.dataset.currency || 'uah',
        cryptoType:      container.querySelector('#edit-crypto-grid .biz-crypto-btn.selected')?.dataset.crypto       || null,
        accountType: 'owner', onboardingDone: true, updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'users', user.uid), data)
      updateProfileCache(user.uid, data)

      const { renderNavigation } = await import('../../components/navigation.js')
      const { getUserProfile: getUp } = await import('../../services/auth.js')
      const freshProfile = await getUp(user.uid)
      const sidebar = document.getElementById('sidebar')
      if (sidebar) renderNavigation(sidebar, freshProfile)

      closeEdit()
      showToast('Збережено')

      const newNiche  = NICHES.find(n => n.id === newProfession) || niche
      const newConfig = (await import('../../../core/profession-config.js')).getProfessionConfig(newProfession)
      renderPage(container, { ...ctx, profile: { ...profile, ...data }, niche: newNiche, config: newConfig })
    } catch (err) {
      console.error(err)
      showToast('Помилка збереження')
    } finally {
      btn.disabled = false
    }
  })

  // ── Запросити учасника ─────────────────────────────────
  container.querySelector('#biz-invite-btn').addEventListener('click', () => {
    container.querySelector('#biz-invite-modal').style.display = 'flex'
    container.querySelector('#inv-role').value = ''
    container.querySelector('#inv-code-result').style.display = 'none'
    container.querySelector('#inv-foot').style.display = 'flex'
    container.querySelectorAll('#inv-modules input').forEach(c => c.checked = true)
  })
  container.querySelector('#biz-invite-close').addEventListener('click', () => { container.querySelector('#biz-invite-modal').style.display = 'none' })
  container.querySelector('#biz-invite-cancel').addEventListener('click', () => { container.querySelector('#biz-invite-modal').style.display = 'none' })

  container.querySelector('#inv-generate').addEventListener('click', async () => {
    const role    = container.querySelector('#inv-role').value.trim()
    const modules = [...container.querySelectorAll('#inv-modules input:checked')].map(c => c.value)
    if (!role)           { showToast('Введіть посаду'); return }
    if (!modules.length) { showToast('Оберіть хоча б один розділ'); return }
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

  // ── Учасники ───────────────────────────────────────────
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
          <span class="biz-check-box"><span>${icon(m.id, 12)}</span><span>${m.label}</span></span>
        </label>`).join('')
    container.querySelector('#biz-member-modal').dataset.uid = uid
    container.querySelector('#biz-member-modal').style.display = 'flex'
  }

  container.querySelector('#biz-member-close').addEventListener('click',  () => { container.querySelector('#biz-member-modal').style.display = 'none' })
  container.querySelector('#biz-member-cancel').addEventListener('click', () => { container.querySelector('#biz-member-modal').style.display = 'none' })

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

  // ── Telegram ───────────────────────────────────────────
  if (profile?.tgChannel && profile?.tgBotToken) {
    loadTgAnalytics(container, profile)
  }
  container.querySelector('#tg-refresh-btn')?.addEventListener('click', () => loadTgAnalytics(container, profile))
}

async function loadTgAnalytics(container, profile) {
  const body = container.querySelector('#tg-analytics-body')
  if (!body) return
  body.innerHTML = `<div class="tg-loading"><div class="spinner"></div></div>`
  const result = await window.electron.tg.fetchChannel(profile.tgBotToken, profile.tgChannel)
  if (result.error) { body.innerHTML = `<div class="tg-error">${icon('alert-triangle', 14)} ${result.error}</div>`; return }
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n
  body.innerHTML = `
    <div class="tg-stats-row">
      <div class="tg-stat">
        <div class="tg-stat-val">${fmt(result.subscribers)}</div>
        <div class="tg-stat-lbl">Підписників</div>
      </div>
    </div>
    <div class="tg-channel-info">
      <div class="tg-channel-name">${result.title || ''}</div>
      ${result.description ? `<div class="tg-channel-desc">${result.description}</div>` : ''}
      ${result.link ? `<a href="${result.link}" target="_blank" class="tg-open-link">Відкрити канал →</a>` : ''}
    </div>`
}

// ── Helpers ────────────────────────────────────────────────
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

// ── Styles ─────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('business-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'business-styles'
  s.textContent = `
    .biz-page    { padding: 28px 36px; max-width: 1600px; }
    .biz-spinner { display: flex; justify-content: center; padding: 80px; }
    .biz-empty-access { text-align:center; padding: 80px; font-size: 18px; color: var(--text-muted); }

    /* Topbar */
    .biz-topbar       { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
    .biz-topbar-left  { display: flex; align-items: center; gap: 16px; }
    .biz-logo         { width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; }
    .biz-company-name { font-family: var(--font-display); font-size: 24px; font-weight: 800; margin-bottom: 6px; }
    .biz-niche-badge  { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: var(--radius-full); border: 1px solid; }
    .biz-topbar-actions { display: flex; gap: 10px; }

    /* KPI row */
    .biz-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    @media (max-width: 900px) { .biz-kpi-row { grid-template-columns: repeat(2, 1fr); } }
    .biz-kpi-card {
      background: var(--bg-secondary); border: 1.5px solid var(--border);
      border-radius: var(--radius-xl); padding: 18px 20px;
      display: flex; align-items: flex-start; gap: 14px; transition: border-color .2s;
    }
    .biz-kpi-card:hover { border-color: rgba(255,255,255,.12); }
    .biz-kpi-icon  { display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:12px; background:var(--bg-tertiary); color:var(--text-secondary); flex-shrink: 0; }
    .biz-kpi-body  { flex: 1; min-width: 0; }
    .biz-kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin-bottom: 5px; }
    .biz-kpi-value { font-family: var(--font-display); font-size: 26px; font-weight: 800; line-height: 1.1; margin-bottom: 5px; }
    .biz-kpi-sub   { font-size: 11px; color: var(--text-muted); font-weight: 500; }
    .biz-kpi--revenue { border-left: 3px solid #34D399; } .biz-kpi--revenue .biz-kpi-icon { color:#34D399; background:rgba(52,211,153,.1); }
    .biz-kpi--clients { border-left: 3px solid #4F8EF7; } .biz-kpi--clients .biz-kpi-icon { color:#4F8EF7; background:rgba(79,142,247,.1); }
    .biz-kpi--tasks   { border-left: 3px solid #F472B6; } .biz-kpi--tasks .biz-kpi-icon   { color:#F472B6; background:rgba(244,114,182,.1); }
    .biz-kpi--team    { border-left: 3px solid #A78BFA; } .biz-kpi--team .biz-kpi-icon    { color:#A78BFA; background:rgba(167,139,250,.1); }

    /* Control Panel section */
    .bcp-section      { margin-bottom: 28px; }
    .bcp-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .bcp-section-title { font-family: var(--font-display); font-size: 17px; font-weight: 800; display:flex; align-items:center; gap:8px; }
    .bcp-section-sub   { font-size: 12px; color: var(--text-muted); background: var(--bg-tertiary); padding: 3px 10px; border-radius: var(--radius-full); }

    .bcp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }

    /* Module card */
    .bcp-card {
      background: var(--bg-secondary);
      border: 1.5px solid var(--border);
      border-top: 3px solid var(--bcp-color);
      border-radius: var(--radius-xl);
      padding: 16px 18px;
      cursor: pointer;
      transition: all .18s;
      display: flex; flex-direction: column; gap: 10px;
    }
    .bcp-card:hover {
      border-color: var(--bcp-color);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,.3);
    }
    .bcp-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .bcp-header   { display: flex; align-items: center; gap: 7px; }
    .bcp-icon     { display:flex; align-items:center; color:var(--bcp-color); flex-shrink: 0; }
    .bcp-title    { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
    .bcp-main-value {
      font-family: var(--font-display); font-size: 24px; font-weight: 800;
      color: var(--bcp-color); line-height: 1; text-align: right; flex-shrink: 0;
    }

    .bcp-rows   { display: flex; flex-direction: column; gap: 5px; flex: 1; }
    .bcp-row    { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .bcp-row-dot   { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .bcp-row-label { color: var(--text-muted); flex: 1; }
    .bcp-row-val   { font-weight: 700; color: var(--text-primary); flex-shrink: 0; }

    .bcp-progress-wrap  { display: flex; align-items: center; gap: 8px; }
    .bcp-progress-track { flex: 1; height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden; }
    .bcp-progress-fill  { height: 100%; border-radius: 2px; transition: width .6s; }
    .bcp-progress-pct   { font-size: 10px; color: var(--text-muted); font-weight: 700; width: 30px; text-align: right; flex-shrink: 0; }

    .bcp-footer { margin-top: 2px; }
    .bcp-go     { font-size: 11px; font-weight: 700; color: var(--bcp-color); opacity: 0; transition: opacity .15s; }
    .bcp-card:hover .bcp-go { opacity: 1; }

    /* Bottom layout */
    .biz-body { display: grid; grid-template-columns: 300px 1fr; gap: 16px; }
    @media (min-width: 1400px) { .biz-body { grid-template-columns: 360px 1fr; } }
    @media (max-width: 800px)  { .biz-body { grid-template-columns: 1fr; } }

    /* Card */
    .biz-card         { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 20px; margin-bottom: 14px; }
    .biz-card:last-child { margin-bottom: 0; }
    .biz-card-title   { font-family: var(--font-display); font-size: 15px; font-weight: 700; margin-bottom: 16px; display:flex; align-items:center; gap:7px; }
    .biz-card-header  { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .biz-member-count { font-size: 12px; color: var(--text-muted); }

    /* Info */
    .biz-info-list  { display: flex; flex-direction: column; }
    .biz-info-row   { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
    .biz-info-row:last-child { border-bottom: none; }
    .biz-info-icon  { display:flex; align-items:center; justify-content:center; width: 22px; color:var(--text-muted); flex-shrink: 0; }
    .biz-info-label { font-size: 12px; color: var(--text-muted); width: 70px; flex-shrink: 0; }
    .biz-info-value { font-size: 13px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Modules list */
    .biz-modules-list { display: flex; flex-direction: column; gap: 2px; }
    .biz-module-row   { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: var(--radius-md); cursor: pointer; transition: background .15s; }
    .biz-module-row:hover { background: var(--bg-tertiary); }
    .biz-module-icon  { display:flex; align-items:center; justify-content:center; width: 22px; color: var(--text-secondary); }
    .biz-module-label { flex: 1; font-size: 13px; font-weight: 500; }
    .biz-module-arrow { font-size: 12px; color: var(--text-muted); opacity: 0; transition: opacity .15s; }
    .biz-module-row:hover .biz-module-arrow { opacity: 1; }

    /* Members */
    .biz-member-row    { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .biz-member-row:last-child { border-bottom: none; }
    .biz-member-owner  { border-bottom: 2px solid var(--border); margin-bottom: 4px; padding-bottom: 14px; }
    .biz-member-avatar { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
    .biz-member-info   { flex: 1; min-width: 0; }
    .biz-member-name   { font-size: 14px; font-weight: 600; }
    .biz-member-role   { font-size: 11px; color: var(--text-secondary); margin-top: 1px; display:flex; align-items:center; gap:4px; }
    .biz-member-mods   { display: flex; gap: 4px; align-items: center; }
    .biz-mod-chip      { display:flex; align-items:center; color:var(--text-muted); }
    .biz-mod-more      { font-size: 11px; color: var(--text-muted); }
    .biz-member-edit-btn { display:flex; align-items:center; background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; cursor: pointer; opacity: 0; transition: opacity .2s; color: var(--text-secondary); }
    .biz-member-row:hover .biz-member-edit-btn { opacity: 1; }
    .biz-access-badge  { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); }
    .biz-access-owner  { background: rgba(79,142,247,.15); color: var(--accent-blue); }
    .biz-no-members    { font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px 0; }

    /* Pending invites */
    .biz-invite-row    { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .biz-invite-row:last-child { border-bottom: none; }
    .biz-invite-code   { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 800; letter-spacing: 2px; color: var(--accent-blue); width: 72px; flex-shrink: 0; }
    .biz-invite-info   { flex: 1; }
    .biz-invite-role   { font-size: 13px; font-weight: 600; }
    .biz-invite-mods   { font-size: 11px; color: var(--text-muted); }
    .biz-invite-copy, .biz-invite-del { display:flex; align-items:center; background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; cursor: pointer; color: var(--text-secondary); transition: all .2s; }
    .biz-invite-del:hover { border-color: #F87171; color: #F87171; }

    /* Modals */
    .biz-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
    .biz-modal   { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-xl); width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: var(--shadow-xl); animation: biz-in .2s cubic-bezier(.34,1.2,.64,1); }
    @keyframes biz-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .biz-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 0; flex-shrink: 0; }
    .biz-modal-head h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; }
    .biz-modal-close { display:flex; align-items:center; justify-content:center; background: none; border: none; color: var(--text-muted); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; transition: all .2s; }
    .biz-modal-close:hover { background: rgba(239,68,68,.12); color: #F87171; }
    .biz-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
    .biz-modal-foot { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 24px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }

    .biz-label    { display: block; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
    .biz-form-row { margin-bottom: 16px; }
    .biz-form-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }

    /* Niche selector */
    /* Currency selector */
    .biz-form-section { margin-top: 16px; }
    .biz-currency-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-top: 8px; margin-bottom: 12px; }
    .biz-currency-btn {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 12px 8px; border-radius: var(--radius-lg);
      border: 1.5px solid var(--border); background: var(--bg-tertiary);
      cursor: pointer; transition: all .15s;
    }
    .biz-currency-btn:hover { border-color: var(--accent-blue); }
    .biz-currency-btn.selected { border-color: var(--accent-blue); background: rgba(79,142,247,.12); }
    .biz-currency-sym  { font-size: 20px; font-weight: 800; font-family: var(--font-display); color: var(--text-primary); }
    .biz-currency-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .biz-currency-code { font-size: 10px; font-weight: 700; color: var(--text-muted); letter-spacing: .06em; }
    .biz-currency-btn.selected .biz-currency-sym,
    .biz-currency-btn.selected .biz-currency-name { color: var(--accent-blue); }

    .biz-crypto-row  { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); border: 1px solid var(--border); }
    .biz-crypto-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .biz-crypto-btn  {
      padding: 5px 12px; border-radius: var(--radius-full); font-size: 12px; font-weight: 700;
      border: 1.5px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary);
      cursor: pointer; transition: all .15s;
    }
    .biz-crypto-btn:hover   { border-color: #F59E0B; color: var(--text-primary); }
    .biz-crypto-btn.selected { border-color: #F59E0B; background: rgba(245,158,11,.12); color: #F59E0B; }

    .biz-niche-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .biz-niche-card { display: flex; align-items: center; gap: 8px; background: var(--bg-tertiary); border: 2px solid var(--border); border-radius: var(--radius-md); padding: 10px 12px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all .15s; }
    .biz-niche-card:hover  { border-color: var(--nc); }
    .biz-niche-card.selected { border-color: var(--nc); background: color-mix(in srgb, var(--nc) 12%, transparent); color: var(--nc); }
    .biz-niche-custom { font-size: 12px; color: var(--text-muted); border-style: dashed; }
    .biz-niche-custom.selected { border-style: solid; color: var(--nc); }

    /* Module edit grid */
    .biz-modules-edit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
    .biz-mod-toggle { display: flex; align-items: center; gap: 5px; padding: 7px 8px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--bg-tertiary); cursor: pointer; font-size: 12px; font-weight: 500; transition: all .12s; user-select: none; }
    .biz-mod-toggle:hover { border-color: rgba(255,255,255,.2); }
    .biz-mod-toggle.active { border-color: #4F8EF7; background: rgba(79,142,247,.1); color: #4F8EF7; }
    .biz-mod-chk { margin-left: auto; font-size: 10px; font-weight: 800; opacity: 0; }
    .biz-mod-toggle.active .biz-mod-chk { opacity: 1; }

    /* Checkboxes */
    .biz-modules-check { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 16px; }
    .biz-check-item input { display: none; }
    .biz-check-box { display: flex; align-items: center; gap: 6px; background: var(--bg-tertiary); border: 1.5px solid var(--border); border-radius: var(--radius-md); padding: 7px 10px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; }
    .biz-check-item input:checked + .biz-check-box { background: rgba(79,142,247,.1); border-color: var(--accent-blue); color: var(--accent-blue); }

    /* Invite code */
    .biz-code-block   { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 20px; text-align: center; margin-top: 16px; }
    .biz-code-label   { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
    .biz-code-display { font-family: var(--font-mono, monospace); font-size: 40px; font-weight: 800; letter-spacing: 8px; color: var(--accent-blue); margin-bottom: 12px; }
    .biz-code-hint    { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 10px; }

    /* Secondary business notes */
    .biz-secondary-note {
      font-size: 12px; color: var(--text-muted); padding: 10px 12px;
      background: rgba(167,139,250,.08); border: 1px solid rgba(167,139,250,.2);
      border-radius: var(--radius-md); margin-top: 4px; line-height: 1.5;
    }
    .biz-secondary-team-note {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px; margin-bottom: 14px;
      background: rgba(79,142,247,.06); border: 1px solid rgba(79,142,247,.15);
      border-radius: var(--radius-md);
    }
    .biz-stn-icon  { display:flex; align-items:center; color:var(--accent-blue); flex-shrink: 0; }
    .biz-stn-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
    .biz-stn-sub   { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

    /* Tips */
    .biz-tips-list { display: flex; flex-direction: column; }
    .biz-tip-row   { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .biz-tip-row:last-child { border-bottom: none; }
    .biz-tip-num   { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; background: rgba(79,142,247,.15); color: var(--accent-blue); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
    .biz-tip-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .biz-tip-desc  { font-size: 12px; color: var(--text-muted); line-height: 1.4; }

    /* Toast */
    .biz-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 10px 20px; font-size: 13px; font-weight: 600; z-index: 9999; animation: biz-toast .25s ease; }
    @keyframes biz-toast { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

    /* Misc */
    .btn-ghost     { background: transparent; border: 1px solid transparent; color: var(--text-muted); }
    .btn-ghost:hover { border-color: #F87171; color: #F87171; }
    .biz-remove-btn { margin-right: auto; }
    .biz-link       { color: var(--accent-blue); text-decoration: none; }
    .biz-link:hover { text-decoration: underline; }

    /* Telegram analytics */
    .tg-analytics-card { border-color: rgba(37,172,219,.3); }
    .tg-refresh-btn    { background: none; border: 1px solid var(--border); border-radius: 8px; padding: 4px 9px; cursor: pointer; font-size: 16px; color: var(--text-muted); transition: all .2s; }
    .tg-refresh-btn:hover { background: rgba(37,172,219,.1); color: #29b6d6; border-color: #29b6d6; }
    .tg-loading { display: flex; justify-content: center; padding: 24px; }
    .tg-error   { color: #F87171; font-size: 13px; padding: 8px 0; }
    .tg-no-token { font-size: 13px; color: var(--text-secondary); }
    .tg-no-token p { margin: 0 0 8px; }
    .tg-hint    { font-size: 12px; color: var(--text-muted); line-height: 1.7; background: var(--bg-tertiary); border-radius: var(--radius-md); padding: 10px 12px; }
    .tg-stats-row { display: flex; gap: 12px; margin-bottom: 14px; }
    .tg-stat    { background: rgba(37,172,219,.08); border: 1px solid rgba(37,172,219,.2); border-radius: var(--radius-lg); padding: 14px 20px; text-align: center; flex: 1; }
    .tg-stat-val { font-family: var(--font-display); font-size: 28px; font-weight: 800; color: #29b6d6; }
    .tg-stat-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .tg-channel-info { padding-top: 10px; }
    .tg-channel-name { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    .tg-channel-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 10px; }
    .tg-open-link    { display: inline-block; font-size: 13px; font-weight: 600; color: #29b6d6; text-decoration: none; }
    .tg-open-link:hover { text-decoration: underline; }
  `
  document.head.appendChild(s)
}
