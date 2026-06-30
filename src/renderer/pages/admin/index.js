// src/renderer/pages/admin/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache, startImpersonation } from '../../services/auth.js'
import { navigate, invalidateRoute } from '../../../core/router.js'
import {
  collection, collectionGroup, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit, addDoc, arrayUnion, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'
import { wbConfirm, wbAlert } from '../../utils/dialogs.js'
import { uploadToCloudinary } from '../../services/cloudinary.js'
import { ONLINE_THRESHOLD_MS } from '../../services/presence.js'
import { logSubscriptionChange, getSubscriptionHistory, SOURCE_LABEL } from '../../services/subscription-history.js'
import { getLoginEvents } from '../../services/device-tracking.js'
import { addMonths } from '../../../core/permissions.js'

const PLAN_META = {
  free:     { label: 'FREE',     color: '#94A3B8', price: 0 },
  pro:      { label: 'PRO',      color: '#4F8EF7', price: 299 },
  business: { label: 'BUSINESS', color: '#A78BFA', price: 799 },
}
const TABS = [
  { id: 'overview',       iconName: 'dashboard',    label: 'Огляд' },
  { id: 'analytics',      iconName: 'bar-chart',    label: 'Аналітика' },
  { id: 'users',          iconName: 'clients',      label: 'Користувачі' },
  { id: 'payments',       iconName: 'credit-card',  label: 'Платежі' },
  { id: 'support',        iconName: 'support',      label: 'Підтримка' },
  { id: 'notifications',  iconName: 'bell',         label: 'Новини' },
  { id: 'faq',            iconName: 'info',         label: 'FAQ' },
  { id: 'errors',         iconName: 'alert-triangle', label: 'Помилки' },
]
const ADMIN_TAB = { id: 'admins', iconName: 'shield', label: 'Адміни' }

const TICKET_TYPE_META = {
  bug:     { label: 'Bug Report', color: '#F87171', bg: 'rgba(248,113,113,.12)', iconName: 'x-circle' },
  feature: { label: 'Пропозиція', color: '#A78BFA', bg: 'rgba(167,139,250,.12)', iconName: 'zap' },
  support: { label: 'Підтримка',  color: '#4F8EF7', bg: 'rgba(79,142,247,.12)',  iconName: 'message-circle' },
}
const TICKET_STATUS_META = {
  new:         { label: 'Нова',      color: '#94A3B8', iconName: 'info' },
  open:        { label: 'Відкрита',  color: '#4F8EF7', iconName: 'eye' },
  in_progress: { label: 'В роботі',  color: '#FBBF24', iconName: 'timer' },
  resolved:    { label: 'Вирішено',  color: '#34D399', iconName: 'check-circle' },
  closed:      { label: 'Закрита',   color: '#475569', iconName: 'x-circle' },
}
const TICKET_PRIORITY_META = {
  low:      { label: 'Низький',   color: '#94A3B8' },
  medium:   { label: 'Середній', color: '#FBBF24' },
  high:     { label: 'Високий',  color: '#FB923C' },
  critical: { label: 'Критич.',  color: '#F87171' },
}

// Показує екран запиту 6-значного TOTP-коду. Повертає true якщо код вірний.
async function show2faGate(container, user) {
  return new Promise(resolve => {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:70vh;gap:16px">
        <div style="color:var(--text-muted)">${icon('lock', 48)}</div>
        <div style="font-size:18px;font-weight:700">Двофакторна автентифікація</div>
        <div style="font-size:13px;color:var(--text-muted)">Введіть код із Google Authenticator / Authy</div>
        <input id="g2fa-code" type="text" maxlength="6" placeholder="123456"
          style="font-family:monospace;font-size:22px;letter-spacing:6px;text-align:center;width:180px;padding:10px;background:var(--bg-secondary);border:1.5px solid var(--border);border-radius:10px;color:var(--text-primary)">
        <div id="g2fa-err" style="color:#F87171;font-size:12px;min-height:16px"></div>
        <button class="btn btn-primary" id="g2fa-submit">Підтвердити</button>
        <button class="btn btn-secondary" id="g2fa-back">← Назад</button>
      </div>`
    const input = container.querySelector('#g2fa-code')
    const errEl = container.querySelector('#g2fa-err')
    setTimeout(() => input.focus(), 50)

    async function trySubmit() {
      const code = input.value.trim()
      if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Введіть 6 цифр'; return }
      try {
        const { db } = await import('../../services/firebase.js')
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
        const { verifyTotpCode } = await import('../../services/totp.js')
        const snap = await getDoc(doc(db, 'twoFactorSecrets', user.uid))
        if (!snap.exists()) { errEl.textContent = '2FA не налаштовано коректно'; resolve(true); return }
        const ok = await verifyTotpCode(snap.data().secret, code)
        if (!ok) { errEl.textContent = 'Невірний код'; return }
        localStorage.setItem('wh-2fa-verified-' + user.uid, String(Date.now()))
        resolve(true)
      } catch (err) { errEl.textContent = 'Помилка: ' + err.message }
    }
    container.querySelector('#g2fa-submit').addEventListener('click', trySubmit)
    container.querySelector('#g2fa-back').addEventListener('click', () => { resolve(false); navigate('dashboard') })
    input.addEventListener('keydown', e => { if (e.key === 'Enter') trySubmit() })
  })
}

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  if (!profile?.isAdmin && !profile?.isOwner) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <div style="color:var(--text-muted)">${icon('alert-triangle', 48)}</div>
        <div style="font-size:18px;font-weight:700">Доступ заборонено</div>
        <div style="font-size:14px;color:var(--text-muted)">У вас немає прав адміністратора</div>
        <button class="btn btn-secondary" id="back-btn">← Назад</button>
      </div>`
    container.querySelector('#back-btn').addEventListener('click', () => navigate('dashboard'))
    return
  }

  // ── 2FA gate (раз на сесію) ────────────────────────────────
  const _2faTs = localStorage.getItem('wh-2fa-verified-' + user.uid)
  const _2faOk = _2faTs && (Date.now() - Number(_2faTs)) < 30 * 24 * 60 * 60 * 1000
  if (profile?.totpEnabled && !_2faOk) {
    const passed = await show2faGate(container, user)
    if (!passed) return
  }

  injectStyles()

  const isOwner = profile?.isOwner === true
  let myRole = null
  if (!isOwner && profile?.adminRoleId) {
    try {
      const roleSnap = await getDoc(doc(db, 'adminRoles', profile.adminRoleId))
      if (roleSnap.exists()) myRole = { id: roleSnap.id, ...roleSnap.data() }
    } catch {}
  }
  // Owner бачить усе. Звичайний admin без ролі — лише Огляд (безпечний дефолт),
  // доки Owner не видасть конкретні права через вкладку "Адміни".
  const myAllowedTabs = isOwner
    ? TABS.map(t => t.id)
    : (myRole?.allowedTabs?.length ? myRole.allowedTabs : ['overview'])

  const visibleTabs = [
    ...TABS.filter(t => myAllowedTabs.includes(t.id)),
    ...(isOwner ? [ADMIN_TAB] : []),
  ]

  let activeTab  = visibleTabs[0]?.id || 'overview'
  let allUsers   = []
  let allPayments = []
  let allAnnouncements = []
  let allTickets  = []
  let allRoles    = []
  let allTemplates = []
  let payFilter   = 'pending'
  let ticketTypeFilter   = 'all'
  let ticketStatusFilter = 'all'
  let selectedUids = new Set()

  container.innerHTML = `
    <div class="adm-page">

      <div class="adm-header">
        <div>
          <h1 class="adm-title">Адмін панель</h1>
          <p class="adm-subtitle">WorkHub · Управління системою</p>
        </div>
        <div class="adm-header-right">
          <div class="adm-global-search">
            ${icon('search', 13)}
            <input type="text" id="adm-global-search-inp" placeholder="Пошук за UID або email…" autocomplete="off">
          </div>
          <button class="adm-refresh-btn" id="adm-refresh">↻ Оновити</button>
          ${isOwner ? `<button class="adm-refresh-btn" id="adm-backup-btn">${icon('download', 13)} Бекап бази</button>` : ''}
          <span class="adm-badge">${icon('clients', 13)} ${profile.name || user.email} ${isOwner ? '· OWNER' : ''}</span>
        </div>
      </div>

      <div id="owner-bootstrap-banner"></div>

      <div class="adm-tabs" id="adm-tabs">
        ${visibleTabs.map(t => `
          <button class="adm-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
            <span class="adm-tab-icon">${icon(t.iconName, 14)}</span> ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- ── OVERVIEW ── -->
      <div id="tab-overview" class="adm-panel">
        <div class="adm-stats-row" id="adm-stats">
          ${[0,1,2,3,4,5].map(() => `<div class="adm-skel"></div>`).join('')}
        </div>
        <div class="adm-overview-grid">
          <div class="adm-card" id="recent-regs-card">
            <div class="adm-card-title">${icon('timer', 15)} Нові реєстрації</div>
            <div id="recent-regs-list"><div class="adm-loading"></div></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('bar-chart', 15)} По планах</div>
            <div id="plan-breakdown"></div>
          </div>
          <div class="adm-card" id="adm-activity-card">
            <div class="adm-card-title">${icon('calendar', 15)} Активність (7 днів)</div>
            <div class="adm-activity-bars" id="adm-activity-bars"></div>
          </div>
        </div>
      </div>

      <!-- ── ANALYTICS ── -->
      <div id="tab-analytics" class="adm-panel" style="display:none">
        <div class="adm-an-grid">
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('calendar', 15)} Реєстрації за останні 30 днів</div>
            <div class="adm-chart-wrap" id="reg-chart"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('finances', 15)} Дохід по планах</div>
            <div id="revenue-breakdown"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('refresh', 15)} Конверсія free → paid</div>
            <div id="conversion-stats"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('globe', 15)} Ніші користувачів</div>
            <div id="niche-breakdown"></div>
          </div>
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('bar-chart', 15)} Використання модулів</div>
            <div id="module-usage-breakdown"></div>
          </div>
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('refresh', 15)} Retention — % користувачів що повертаються</div>
            <div id="retention-breakdown"></div>
          </div>
        </div>
      </div>

      <!-- ── USERS ── -->
      <div id="tab-users" class="adm-panel" style="display:none">
        <div class="adm-toolbar">
          <div class="adm-search">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${icon('search', 14)}</span>
            <input type="text" id="users-search" placeholder="Пошук за іменем, email або бізнесом…">
          </div>
          <select id="plan-filter" class="adm-select">
            <option value="all">Всі плани</option>
            <option value="free">FREE</option>
            <option value="pro">PRO</option>
            <option value="business">BUSINESS</option>
          </select>
          <select id="status-filter" class="adm-select">
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="banned">Забановані</option>
          </select>
          <button class="adm-btn adm-btn-ghost" id="export-csv-btn">⬇ CSV</button>
          <span class="adm-count-label" id="users-count-label"></span>
        </div>
        <div class="adm-bulk-bar" id="adm-bulk-bar" style="display:none">
          <span id="adm-bulk-count">0 вибрано</span>
          <button class="adm-action-btn adm-btn-ban" id="bulk-ban-btn">Бан</button>
          <button class="adm-action-btn adm-btn-revoke" id="bulk-plan-btn">Забрати план</button>
          <button class="adm-action-btn adm-btn-delete" id="bulk-delete-btn">Видалити</button>
          <button class="adm-btn adm-btn-ghost adm-btn-sm" id="bulk-clear-btn">Скасувати</button>
        </div>
        <div id="users-table-wrap"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── PAYMENTS ── -->
      <div id="tab-payments" class="adm-panel" style="display:none">

        <!-- Налаштування способів оплати -->
        <div class="adm-pay-config" id="pay-config-block">
          <div class="adm-section-title" style="margin-bottom:16px">Налаштування способів оплати</div>

          <!-- AIFO -->
          <div class="adm-pay-config" style="margin-bottom:18px;padding:16px;background:rgba(91,141,239,.06);border:1px solid rgba(91,141,239,.25);border-radius:12px">
            <div style="font-size:12px;font-weight:700;color:#5B8DEF;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">
              AIFO — Автоматична оплата карткою
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Shop ID</label>
                <input class="adm-input" id="cfg-aifo-shop" placeholder="123" type="text">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Secret Key <span id="cfg-aifo-secret-status" style="color:#34D399;font-weight:700"></span></label>
                <input class="adm-input" id="cfg-aifo-secret" placeholder="Введіть, щоб змінити ключ" type="password">
              </div>
              <div style="grid-column:1/-1">
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Webhook Secret <span id="cfg-aifo-webhook-secret-status" style="color:#34D399;font-weight:700"></span></label>
                <input class="adm-input" id="cfg-aifo-webhook-secret" placeholder="Введіть, щоб змінити ключ" type="password">
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
              Shop ID / Secret Key — з кабінету aifo.pro → Інформація про касу. Webhook Secret — окремий ключ, що автогенерується при створенні вебхука (Мої магазини → Вебхуки). URL вебхука для AIFO: https://workhub-aifo.vercel.app/api/aifo-webhook
            </div>
          </div>

          <!-- Ручна оплата -->
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
            Ручна оплата (Monobank / Крипта)
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">USDT TRC20 адреса</label>
              <input class="adm-input" id="cfg-usdt" placeholder="TXxxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Bitcoin (BTC) адреса</label>
              <input class="adm-input" id="cfg-btc" placeholder="1Axxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Ethereum (ETH) адреса</label>
              <input class="adm-input" id="cfg-eth" placeholder="0xxxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Monobank банка (URL)</label>
              <input class="adm-input" id="cfg-mono" placeholder="https://send.monobank.ua/jar/..." type="text">
            </div>
          </div>
          <button class="adm-action-btn adm-btn-approve" id="save-pay-cfg" style="padding:8px 20px">Зберегти реквізити</button>
          <span id="pay-cfg-status" style="font-size:12px;margin-left:12px;color:var(--text-muted)"></span>
        </div>

        <div class="adm-toolbar" style="margin-top:20px">
          <div class="adm-filter-pills" id="pay-filter-tabs">
            <button class="adm-pill active" data-status="pending">Очікують</button>
            <button class="adm-pill" data-status="approved">Підтверджені</button>
            <button class="adm-pill" data-status="rejected">Відхилені</button>
          </div>
          <span class="adm-count-label" id="pay-count-label"></span>
        </div>
        <div id="payments-list"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── SUPPORT ── -->
      <div id="tab-support" class="adm-panel" style="display:none">
        <div class="adm-toolbar">
          <div class="adm-filter-pills" id="ticket-type-pills">
            <button class="adm-pill active" data-type="all">Всі</button>
            <button class="adm-pill" data-type="bug">Bug</button>
            <button class="adm-pill" data-type="feature">Ідея</button>
            <button class="adm-pill" data-type="support">Підтримка</button>
          </div>
          <div class="adm-filter-pills" id="ticket-status-pills">
            <button class="adm-pill active" data-status="all">Всі статуси</button>
            <button class="adm-pill" data-status="new">Нові</button>
            <button class="adm-pill" data-status="open">Відкриті</button>
            <button class="adm-pill" data-status="in_progress">В роботі</button>
            <button class="adm-pill" data-status="resolved">Вирішені</button>
          </div>
          <span class="adm-count-label" id="ticket-count-label"></span>
          <button class="adm-btn adm-btn-ghost adm-btn-sm" id="manage-templates-btn" style="margin-left:auto">${icon('pencil', 12)} Шаблони відповідей</button>
        </div>
        <div id="tickets-list"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── NOTIFICATIONS ── -->
      <div id="tab-notifications" class="adm-panel" style="display:none">
        <div class="adm-notif-layout">

          <div class="adm-card adm-notif-form-card">
            <div class="adm-card-title">Нове повідомлення</div>
            <div class="adm-field">
              <label>Тип</label>
              <div class="adm-type-row" id="notif-type-row">
                <button class="adm-type-btn active" data-type="info">Інфо</button>
                <button class="adm-type-btn" data-type="success">Успіх</button>
                <button class="adm-type-btn" data-type="warning">Увага</button>
                <button class="adm-type-btn" data-type="error">Важливо</button>
              </div>
            </div>
            <div class="adm-field">
              <label>Заголовок</label>
              <input type="text" class="adm-input" id="notif-title" placeholder="Заголовок повідомлення">
            </div>
            <div class="adm-field">
              <label>Текст</label>
              <textarea class="adm-input adm-textarea" id="notif-body" placeholder="Текст повідомлення…" rows="4"></textarea>
            </div>
            <div class="adm-field">
              <label>Отримувачі</label>
              <select class="adm-input adm-select" id="notif-target">
                <option value="all">Всі користувачі</option>
                <option value="free">Тільки FREE план</option>
                <option value="pro">Тільки PRO план</option>
                <option value="business">Тільки BUSINESS план</option>
                <option value="paid">Всі платні (PRO + BUSINESS)</option>
              </select>
            </div>
            <button class="adm-btn adm-btn-primary" id="send-notif-btn">Надіслати</button>
          </div>

          <div class="adm-card adm-notif-list-card">
            <div class="adm-card-title">Попередні повідомлення</div>
            <div id="notif-history"><div class="adm-loading"></div></div>
          </div>

        </div>
      </div>

      <!-- ── FAQ ── -->
      <div id="tab-faq" class="adm-panel" style="display:none">
        <div class="adm-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="adm-card-title">Часті запитання</div>
            <button class="adm-btn adm-btn-primary" id="faq-add-btn">+ Додати питання</button>
          </div>
          <div id="faq-admin-list"><div class="adm-loading"></div></div>
        </div>
      </div>

      <!-- FAQ edit modal -->
      <div class="adm-overlay" id="faq-modal" style="display:none">
        <div class="adm-modal" style="max-width:520px">
          <div class="adm-modal-head">
            <h2 id="faq-modal-title">Нове питання</h2>
            <button class="adm-modal-close" id="faq-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="adm-modal-body" style="gap:10px">
            <div class="adm-field">
              <label>Категорія</label>
              <input type="text" class="adm-input" id="faq-f-category" placeholder="напр. Оплата">
            </div>
            <div class="adm-field">
              <label>Питання</label>
              <input type="text" class="adm-input" id="faq-f-question" placeholder="Текст питання">
            </div>
            <div class="adm-field">
              <label>Відповідь — додавайте блоки в потрібному порядку (текст, фото, текст, фото...)</label>
              <div id="faq-f-blocks" style="display:flex;flex-direction:column;gap:8px"></div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button type="button" class="adm-btn adm-btn-secondary" id="faq-add-text-block">+ Текст</button>
                <button type="button" class="adm-btn adm-btn-secondary" id="faq-add-image-block">+ Фото</button>
              </div>
              <input type="file" id="faq-image-input" accept="image/*" style="display:none">
            </div>
            <div class="adm-field">
              <label>Порядок (менше число — вище в списку)</label>
              <input type="number" class="adm-input" id="faq-f-order" value="0">
            </div>
          </div>
          <div class="adm-modal-foot">
            <button class="adm-btn adm-btn-secondary" id="faq-modal-cancel">Скасувати</button>
            <button class="adm-btn adm-btn-primary" id="faq-modal-save">Зберегти</button>
          </div>
        </div>
      </div>

      <!-- ── ERRORS ── -->
      <div id="tab-errors" class="adm-panel" style="display:none">
        <div class="adm-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="adm-card-title">Журнал помилок</div>
            <button class="adm-btn adm-btn-secondary" id="clear-errors-btn">Очистити всі</button>
          </div>
          <div id="errors-list"><div class="adm-loading"></div></div>
        </div>
      </div>

      <!-- ── ADMINS (Owner only) ── -->
      ${isOwner ? `
      <div id="tab-admins" class="adm-panel" style="display:none">
        <div class="adm-an-grid">
          <div class="adm-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div class="adm-card-title">${icon('shield', 15)} Ролі адмінів</div>
              <button class="adm-btn adm-btn-primary adm-btn-sm" id="role-new-btn">+ Нова роль</button>
            </div>
            <div id="roles-list"><div class="adm-loading"></div></div>
          </div>
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('clients', 15)} Адміністратори</div>
            <div id="admins-list"><div class="adm-loading"></div></div>
          </div>
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('timer', 15)} Журнал дій адмінів</div>
            <div id="admin-logs-list"><div class="adm-loading"></div></div>
          </div>
        </div>
      </div>` : ''}

    </div>
  `

  // Початкова видимість панелі відповідно до прав поточного адміна
  container.querySelectorAll('.adm-panel').forEach(p => {
    p.style.display = p.id === `tab-${activeTab}` ? '' : 'none'
  })

  // ── Owner bootstrap (якщо власника системи ще не призначено) ──
  function renderOwnerBootstrap() {
    const banner = container.querySelector('#owner-bootstrap-banner')
    if (!banner) return
    const hasOwner = allUsers.some(u => u.isOwner === true)
    if (isOwner || hasOwner) { banner.innerHTML = ''; return }
    banner.innerHTML = `
      <div class="adm-pay-config" style="border-color:rgba(167,139,250,.35);background:rgba(167,139,250,.06);margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700;margin-bottom:4px">Власник системи ще не призначений</div>
            <div style="font-size:13px;color:var(--text-muted)">Owner отримує повний доступ до адмінки і може створювати ролі для інших адмінів.</div>
          </div>
          <button class="adm-btn adm-btn-primary" id="claim-owner-btn">Стати Owner</button>
        </div>
      </div>`
    banner.querySelector('#claim-owner-btn').addEventListener('click', async () => {
      if (!await wbConfirm('Призначити себе власником системи? Ця дія дає повний доступ до адмінки.', { okLabel: 'Стати Owner' })) return
      try {
        const batch = writeBatch(db)
        batch.set(doc(db, 'config', 'ownerClaim'), { uid: user.uid, claimedAt: serverTimestamp() })
        batch.update(doc(db, 'users', user.uid), { isOwner: true })
        await batch.commit()
        updateProfileCache(user.uid, { isOwner: true })
        await addDoc(collection(db, 'adminLogs'), {
          actorUid: user.uid, actorName: profile.name || user.email,
          action: 'Призначив себе Owner', targetUid: null, targetName: null, details: null,
          createdAt: serverTimestamp(),
        })
        invalidateRoute('admin')
        navigate('admin')
      } catch (err) {
        showToast('Помилка: ' + (err.message || 'хтось вже став Owner раніше'), 'error')
      }
    })
  }

  // ── Tab switching ─────────────────────────────────────────
  container.querySelector('#adm-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.adm-tab')
    if (!btn) return
    activeTab = btn.dataset.tab
    container.querySelectorAll('.adm-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    container.querySelectorAll('.adm-panel').forEach(p => p.style.display = 'none')
    container.querySelector(`#tab-${activeTab}`).style.display = 'block'
  })

  // ── Ticket filter pills ───────────────────────────────────
  container.querySelector('#ticket-type-pills').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#ticket-type-pills .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    ticketTypeFilter = btn.dataset.type
    renderTickets()
  })
  container.querySelector('#ticket-status-pills').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#ticket-status-pills .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    ticketStatusFilter = btn.dataset.status
    renderTickets()
  })
  container.querySelector('#manage-templates-btn')?.addEventListener('click', () => openTemplatesModal())

  // ── Payment filter pills ───────────────────────────────────
  container.querySelector('#pay-filter-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#pay-filter-tabs .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    payFilter = btn.dataset.status
    renderPayments()
  })

  // ── Search/filter ─────────────────────────────────────────
  container.querySelector('#users-search').addEventListener('input', renderUsersTable)
  container.querySelector('#plan-filter').addEventListener('change', renderUsersTable)
  container.querySelector('#status-filter').addEventListener('change', renderUsersTable)
  container.querySelector('#export-csv-btn').addEventListener('click', exportCSV)
  container.querySelector('#adm-refresh').addEventListener('click', loadAndRender)
  container.querySelector('#adm-backup-btn')?.addEventListener('click', exportBackup)

  // ── Бекап бази одним кліком (Owner) ────────────────────────
  async function exportBackup() {
    const btn = container.querySelector('#adm-backup-btn')
    const origLabel = btn.innerHTML
    btn.disabled = true; btn.innerHTML = '⏳ Експортую…'
    try {
      const collNames = ['users', 'tickets', 'announcements', 'adminLogs', 'adminRoles', 'supportTemplates']
      const data = { exportedAt: new Date().toISOString(), exportedBy: user.email }
      for (const name of collNames) {
        const snap = await getDocs(collection(db, name))
        data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      }
      const json = JSON.stringify(data, (_, v) => v?.toDate ? v.toDate().toISOString() : v, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workhub_backup_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      logAdminAction('Експортував бекап бази', null, null)
      showToast('Бекап завантажено')
    } catch (err) {
      console.error('exportBackup:', err)
      showToast('Помилка експорту: ' + err.message, 'error')
    } finally {
      btn.disabled = false; btn.innerHTML = origLabel
    }
  }

  // ── Global search (UID / email) ───────────────────────────
  const gsBox = container.querySelector('.adm-global-search')
  const gsInp = container.querySelector('#adm-global-search-inp')
  gsInp.addEventListener('input', () => {
    document.getElementById('adm-gsr-dropdown')?.remove()
    const q = gsInp.value.trim().toLowerCase()
    if (!q) return
    const matches = allUsers.filter(u =>
      u.id.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
    ).slice(0, 8)

    const dd = document.createElement('div')
    dd.id = 'adm-gsr-dropdown'
    dd.className = 'adm-global-search-dropdown'
    dd.innerHTML = matches.length
      ? matches.map(u => `
          <div class="adm-gsr-item" data-uid="${u.id}">
            <div class="adm-avatar" style="width:28px;height:28px;font-size:12px">${(u.name||'?')[0].toUpperCase()}</div>
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:600">${u.name || '—'}</div>
              <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email || u.id}</div>
            </div>
          </div>`).join('')
      : `<div class="adm-gsr-empty">Нічого не знайдено</div>`
    gsBox.appendChild(dd)

    dd.querySelectorAll('.adm-gsr-item').forEach(item => {
      item.addEventListener('click', () => {
        gsInp.value = ''
        dd.remove()
        openUserDetail(item.dataset.uid)
      })
    })
  })
  document.addEventListener('click', e => {
    if (!gsBox.contains(e.target)) document.getElementById('adm-gsr-dropdown')?.remove()
  })

  // ── Notifications ─────────────────────────────────────────
  let notifType = 'info'
  container.querySelector('#notif-type-row').addEventListener('click', e => {
    const btn = e.target.closest('.adm-type-btn')
    if (!btn) return
    container.querySelectorAll('.adm-type-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    notifType = btn.dataset.type
  })

  container.querySelector('#send-notif-btn').addEventListener('click', async () => {
    const title  = container.querySelector('#notif-title').value.trim()
    const body   = container.querySelector('#notif-body').value.trim()
    const target = container.querySelector('#notif-target').value
    if (!title || !body) { showToast('Заповніть заголовок і текст', 'error'); return }

    const btn = container.querySelector('#send-notif-btn')
    btn.disabled = true; btn.textContent = '...'

    try {
      await addDoc(collection(db, 'announcements'), {
        title, body, type: notifType, target,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile.name || user.email,
      })
      container.querySelector('#notif-title').value = ''
      container.querySelector('#notif-body').value  = ''
      showToast('Повідомлення надіслано')
      await loadAnnouncements()
      renderAnnouncements()
    } catch (err) {
      console.error(err); showToast('Помилка надсилання', 'error')
    } finally {
      btn.disabled = false; btn.textContent = 'Надіслати'
    }
  })

  // ── Payment config ────────────────────────────────────────
  async function loadPayCfg() {
    const paySnap = await getDoc(doc(db, 'config', 'payments'))
    if (paySnap.exists()) {
      const d = paySnap.data()
      container.querySelector('#cfg-usdt').value       = d.address_usdt     || ''
      container.querySelector('#cfg-btc').value        = d.address_btc      || ''
      container.querySelector('#cfg-eth').value        = d.address_eth      || ''
      container.querySelector('#cfg-mono').value       = d.monobankJar      || ''
      container.querySelector('#cfg-aifo-shop').value  = d.aifoShopId       || ''
      const aifoStatus = container.querySelector('#cfg-aifo-secret-status')
      if (aifoStatus) aifoStatus.textContent = d.aifoKeyConfigured ? '✓ встановлено' : ''
      const webhookStatus = container.querySelector('#cfg-aifo-webhook-secret-status')
      if (webhookStatus) webhookStatus.textContent = d.aifoWebhookSecretConfigured ? '✓ встановлено' : ''
    }
  }

  container.querySelector('#save-pay-cfg').addEventListener('click', async () => {
    const btn = container.querySelector('#save-pay-cfg')
    const st  = container.querySelector('#pay-cfg-status')
    btn.disabled = true
    try {
      const aifoShopId      = container.querySelector('#cfg-aifo-shop').value.trim()
      const aifoSecret      = container.querySelector('#cfg-aifo-secret').value.trim()
      const aifoWebhookSecret = container.querySelector('#cfg-aifo-webhook-secret').value.trim()

      await Promise.all([
        // Public payment config
        setDoc(doc(db, 'config', 'payments'), {
          address_usdt:    container.querySelector('#cfg-usdt').value.trim() || null,
          address_btc:     container.querySelector('#cfg-btc').value.trim()  || null,
          address_eth:     container.querySelector('#cfg-eth').value.trim()  || null,
          monobankJar:     container.querySelector('#cfg-mono').value.trim() || null,
          aifoShopId:      aifoShopId || null,
          ...(aifoSecret ? { aifoKeyConfigured: true } : {}),
          ...(aifoWebhookSecret ? { aifoWebhookSecretConfigured: true } : {}),
          updatedAt:       serverTimestamp(),
        }),
        // AIFO secret key — write-only, admin-only doc (read by our Vercel backend via Admin SDK)
        (aifoShopId || aifoSecret || aifoWebhookSecret)
          ? setDoc(doc(db, 'config', 'aifo_keys'), {
              ...(aifoShopId ? { shopId: aifoShopId } : {}),
              ...(aifoSecret ? { secretKey: aifoSecret } : {}),
              ...(aifoWebhookSecret ? { webhookSecret: aifoWebhookSecret } : {}),
              updatedAt: serverTimestamp(),
            }, { merge: true })
          : Promise.resolve(),
      ])
      container.querySelector('#cfg-aifo-secret').value = ''
      container.querySelector('#cfg-aifo-webhook-secret').value = ''
      st.textContent = 'Збережено'
      setTimeout(() => { st.textContent = '' }, 3000)
    } catch (err) {
      console.error(err); st.textContent = 'Помилка'
    } finally { btn.disabled = false }
  })

  // ── Load ──────────────────────────────────────────────────
  async function loadAndRender() {
    const [users, payments, announcements, tickets, roles, templates] = await Promise.all([
      loadAllUsers(), loadAllPayments(), loadAnnouncements(), loadAllTickets(), loadAdminRoles(), loadTemplates()
    ])
    allUsers         = users
    allPayments      = payments
    allAnnouncements = announcements
    allTickets       = tickets
    allRoles         = roles
    allTemplates     = templates
    renderOverview()
    renderAnalytics()
    renderUsersTable()
    renderPayments()
    renderTickets()
    renderAnnouncements()
    loadAndRenderFaq()
    loadAndRenderErrors()
    renderOwnerBootstrap()
    if (isOwner) { renderRolesList(); renderAdminsList(); loadAndRenderAdminLogs() }

    sweepExpiredSubscriptions(allUsers).then(count => {
      if (count > 0) {
        renderOverview(); renderAnalytics(); renderUsersTable()
        showToast(`Скинуто ${count} прострочених підписок`)
      }
    })
  }

  async function loadAdminRoles() {
    try {
      const snap = await getDocs(collection(db, 'adminRoles'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  async function loadTemplates() {
    try {
      const snap = await getDocs(collection(db, 'supportTemplates'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  // ── Шаблони швидких відповідей ──────────────────────────────
  function openTemplatesModal() {
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    const render = () => {
      modal.innerHTML = `
        <div class="adm-modal" style="max-width:520px">
          <div class="adm-modal-head">
            <h2>${icon('pencil', 18)} Шаблони відповідей</h2>
            <button class="adm-modal-close" id="tpl-close">${icon('x', 14)}</button>
          </div>
          <div class="adm-modal-body" style="gap:10px">
            <button class="adm-btn adm-btn-primary adm-btn-sm" id="tpl-new-btn">+ Новий шаблон</button>
            <div id="tpl-list" style="display:flex;flex-direction:column;gap:8px">
              ${allTemplates.length ? allTemplates.map(t => `
                <div class="adm-user-row" style="align-items:flex-start">
                  <div style="flex:1;min-width:0">
                    <div class="adm-user-name">${esc(t.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:2px;white-space:pre-wrap">${esc(t.text).slice(0, 120)}${t.text.length > 120 ? '…' : ''}</div>
                  </div>
                  <div class="adm-action-btns">
                    <button class="adm-action-btn" data-action="edit-tpl" data-id="${t.id}">${icon('pencil', 12)}</button>
                    <button class="adm-action-btn adm-btn-delete" data-action="del-tpl" data-id="${t.id}">${icon('trash', 12)}</button>
                  </div>
                </div>`).join('') : '<div class="adm-empty">Шаблонів ще немає</div>'}
            </div>
          </div>
          <div class="adm-modal-foot">
            <button class="adm-btn adm-btn-ghost" id="tpl-done">Готово</button>
          </div>
        </div>`
      modal.querySelector('#tpl-close').addEventListener('click', () => modal.remove())
      modal.querySelector('#tpl-done').addEventListener('click', () => modal.remove())
      modal.querySelector('#tpl-new-btn').addEventListener('click', () => openTemplateEditModal(null, render))
      modal.querySelectorAll('[data-action="edit-tpl"]').forEach(btn => {
        btn.addEventListener('click', () => openTemplateEditModal(allTemplates.find(t => t.id === btn.dataset.id), render))
      })
      modal.querySelectorAll('[data-action="del-tpl"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await wbConfirm('Видалити цей шаблон?', { okLabel: 'Видалити', danger: true })) return
          await deleteDoc(doc(db, 'supportTemplates', btn.dataset.id))
          allTemplates = allTemplates.filter(t => t.id !== btn.dataset.id)
          render()
        })
      })
    }
    render()
    document.body.appendChild(modal)
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  }

  function openTemplateEditModal(existing, onSaved) {
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.style.zIndex = '1100'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:460px">
        <div class="adm-modal-head">
          <h2>${existing ? 'Редагувати шаблон' : 'Новий шаблон'}</h2>
          <button class="adm-modal-close" id="tplm-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:12px">
          <div class="adm-field">
            <label>Назва</label>
            <input class="adm-input" id="tplm-name" value="${esc(existing?.name || '')}" placeholder="Напр. Привітання">
          </div>
          <div class="adm-field">
            <label>Текст відповіді</label>
            <textarea class="adm-input adm-textarea" id="tplm-text" rows="5">${esc(existing?.text || '')}</textarea>
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="tplm-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="tplm-save">Зберегти</button>
        </div>
      </div>`
    document.body.appendChild(modal)
    const close = () => modal.remove()
    modal.querySelector('#tplm-close').addEventListener('click', close)
    modal.querySelector('#tplm-cancel').addEventListener('click', close)
    modal.addEventListener('click', e => { if (e.target === modal) close() })
    modal.querySelector('#tplm-save').addEventListener('click', async () => {
      const name = modal.querySelector('#tplm-name').value.trim()
      const text = modal.querySelector('#tplm-text').value.trim()
      if (!name || !text) { showToast('Заповніть назву і текст', 'error'); return }
      const btn = modal.querySelector('#tplm-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        if (existing) {
          await updateDoc(doc(db, 'supportTemplates', existing.id), { name, text })
          Object.assign(existing, { name, text })
        } else {
          const ref = await addDoc(collection(db, 'supportTemplates'), { name, text, createdAt: serverTimestamp() })
          allTemplates.push({ id: ref.id, name, text })
        }
        close(); onSaved()
      } catch (err) { showToast('Помилка: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  // ═══════════════════════════════════════════════════════════
  // ADMINS TAB (Owner only) — ролі та призначення адмінів
  // ═══════════════════════════════════════════════════════════
  function renderRolesList() {
    const el = container.querySelector('#roles-list')
    if (!el) return
    if (!allRoles.length) { el.innerHTML = '<div class="adm-empty">Ролей ще немає</div>'; return }
    el.innerHTML = allRoles.map(r => `
      <div class="adm-user-row" data-rid="${r.id}" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="adm-user-name">${esc(r.name || '—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            ${(r.allowedTabs || []).map(id => TABS.find(t => t.id === id)?.label || id).join(', ') || 'Без доступу'}
          </div>
        </div>
        <div class="adm-action-btns">
          <button class="adm-action-btn" data-action="edit-role" data-rid="${r.id}">${icon('pencil', 12)}</button>
          <button class="adm-action-btn adm-btn-delete" data-action="del-role" data-rid="${r.id}">${icon('trash', 12)}</button>
        </div>
      </div>`).join('')

    el.querySelectorAll('[data-action="edit-role"]').forEach(btn => {
      btn.addEventListener('click', () => openRoleModal(allRoles.find(r => r.id === btn.dataset.rid)))
    })
    el.querySelectorAll('[data-action="del-role"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = allRoles.find(r => r.id === btn.dataset.rid)
        if (!await wbConfirm('Видалити цю роль? Адміни з цією роллю втратять доступ до вкладок.', { okLabel: 'Видалити', danger: true })) return
        await deleteDoc(doc(db, 'adminRoles', btn.dataset.rid))
        allRoles = allRoles.filter(r => r.id !== btn.dataset.rid)
        renderRolesList(); renderAdminsList()
        showToast('Роль видалено')
        logAdminAction('Видалено роль', null, r?.name)
      })
    })
  }

  function openRoleModal(role = null) {
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:480px">
        <div class="adm-modal-head">
          <h2>${icon('shield', 18)} ${role ? 'Редагувати роль' : 'Нова роль'}</h2>
          <button class="adm-modal-close" id="rm-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:12px">
          <div class="adm-field">
            <label>Назва ролі</label>
            <input class="adm-input" id="rm-name" value="${esc(role?.name || '')}" placeholder="Напр. Support Admin">
          </div>
          <div class="adm-field">
            <label>Доступні вкладки</label>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${TABS.map(t => `
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                  <input type="checkbox" value="${t.id}" ${role?.allowedTabs?.includes(t.id) ? 'checked' : ''}>
                  ${icon(t.iconName, 13)} ${t.label}
                </label>`).join('')}
            </div>
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="rm-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="rm-save">Зберегти</button>
        </div>
      </div>`
    document.body.appendChild(modal)
    const close = () => modal.remove()
    modal.querySelector('#rm-close').addEventListener('click', close)
    modal.querySelector('#rm-cancel').addEventListener('click', close)
    modal.addEventListener('click', e => { if (e.target === modal) close() })

    modal.querySelector('#rm-save').addEventListener('click', async () => {
      const name = modal.querySelector('#rm-name').value.trim()
      if (!name) { showToast('Введіть назву ролі', 'error'); return }
      const allowedTabs = [...modal.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value)
      const btn = modal.querySelector('#rm-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        if (role) {
          await updateDoc(doc(db, 'adminRoles', role.id), { name, allowedTabs, updatedAt: serverTimestamp() })
          Object.assign(role, { name, allowedTabs })
        } else {
          const ref = await addDoc(collection(db, 'adminRoles'), { name, allowedTabs, createdAt: serverTimestamp() })
          allRoles.push({ id: ref.id, name, allowedTabs })
        }
        close(); renderRolesList(); renderAdminsList()
        showToast('Роль збережено')
        logAdminAction(role ? 'Редаговано роль' : 'Створено роль', null, name)
      } catch (err) { showToast('Помилка: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  container.querySelector('#role-new-btn')?.addEventListener('click', () => openRoleModal())

  function renderAdminsList() {
    const el = container.querySelector('#admins-list')
    if (!el) return
    const admins = allUsers.filter(u => u.isAdmin || u.isOwner)
    if (!admins.length) { el.innerHTML = '<div class="adm-empty">Адмінів немає</div>'; return }

    el.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>Користувач</th><th>Роль</th><th>Дії</th></tr></thead>
        <tbody>
          ${admins.map(u => `
            <tr>
              <td>
                <div class="adm-user-cell">
                  <div class="adm-avatar">${(u.name || '?')[0].toUpperCase()}</div>
                  <div>
                    <div class="adm-user-name">${esc(u.name || '—')} ${u.isOwner ? '<span class="adm-admin-badge" style="background:rgba(167,139,250,.18);color:#A78BFA">OWNER</span>' : ''}</div>
                    <div class="adm-user-email">${esc(u.email || u.id)}</div>
                  </div>
                </div>
              </td>
              <td>
                ${u.isOwner
                  ? `<span style="color:var(--text-muted);font-size:12px">Повний доступ</span>`
                  : `<select class="adm-input adm-select adm-role-select" data-uid="${u.id}" style="font-size:12px;padding:6px 10px">
                      <option value="">— без ролі (тільки Огляд) —</option>
                      ${allRoles.map(r => `<option value="${r.id}" ${u.adminRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
                    </select>`
                }
              </td>
              <td>
                ${!u.isOwner ? `<button class="adm-action-btn adm-btn-revoke" data-uid="${u.id}" data-action="revoke-admin-tab">${icon('shield-off', 13)} Зняти адміна</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`

    el.querySelectorAll('.adm-role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const uid = sel.dataset.uid
        const roleId = sel.value || null
        try {
          await updateDoc(doc(db, 'users', uid), { adminRoleId: roleId })
          const u = allUsers.find(u => u.id === uid); if (u) u.adminRoleId = roleId
          showToast('Роль призначено')
          const roleName = allRoles.find(r => r.id === roleId)?.name || '—'
          logAdminAction(`Призначено роль "${roleName}"`, uid, u?.name || u?.email)
        } catch (err) { showToast('Помилка: ' + err.message, 'error') }
      })
    })

    el.querySelectorAll('[data-action="revoke-admin-tab"]').forEach(btn => {
      btn.addEventListener('click', async () => { await revokeAdmin(btn.dataset.uid); renderAdminsList() })
    })
  }

  async function loadAndRenderAdminLogs() {
    const el = container.querySelector('#admin-logs-list')
    if (!el) return
    try {
      const snap = await getDocs(query(collection(db, 'adminLogs'), orderBy('createdAt', 'desc'), limit(200)))
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!logs.length) { el.innerHTML = '<div class="adm-empty">Дій ще немає</div>'; return }
      el.innerHTML = `
        <table class="adm-table">
          <thead><tr><th>Адмін</th><th>Дія</th><th>Кого стосується</th><th>Дата</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td style="font-size:13px">${esc(l.actorName || l.actorUid || '—')}</td>
                <td style="font-size:13px">${esc(l.action || '—')}</td>
                <td style="font-size:13px;color:var(--text-muted)">${esc(l.targetName || '—')}</td>
                <td style="font-size:12px;color:var(--text-muted)">${l.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
    } catch (err) {
      el.innerHTML = `<div class="adm-empty" style="color:#F87171">Помилка завантаження: ${err.message}</div>`
    }
  }

  // ── FAQ ──────────────────────────────────────────────────────────────────
  let allFaq = []
  let editingFaqId = null

  async function loadAndRenderFaq() {
    const el = container.querySelector('#faq-admin-list')
    if (!el) return
    try {
      const snap = await getDocs(query(collection(db, 'faq'), orderBy('order', 'asc')))
      allFaq = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {
      try {
        const snap = await getDocs(collection(db, 'faq'))
        allFaq = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      } catch (err) {
        el.innerHTML = `<div class="adm-empty" style="color:#F87171">Помилка завантаження: ${err.message}</div>`
        return
      }
    }
    renderFaqList()
  }

  function renderFaqList() {
    const el = container.querySelector('#faq-admin-list')
    if (!el) return
    if (!allFaq.length) { el.innerHTML = `<div class="adm-empty">Питань ще немає</div>`; return }
    el.innerHTML = allFaq.map(f => `
      <div class="adm-card" style="margin-bottom:8px;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          ${f.category ? `<div style="font-size:11px;font-weight:700;color:var(--accent-blue);text-transform:uppercase;margin-bottom:4px">${esc(f.category)}</div>` : ''}
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${esc(f.question)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);white-space:pre-wrap">${esc((f.answer || '').slice(0, 160))}${(f.answer || '').length > 160 ? '…' : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="adm-btn adm-btn-secondary faq-edit-btn" data-id="${f.id}">${icon('pencil', 12)}</button>
          <button class="adm-btn adm-btn-secondary faq-del-btn" data-id="${f.id}">${icon('trash', 12)}</button>
        </div>
      </div>
    `).join('')

    el.querySelectorAll('.faq-edit-btn').forEach(btn =>
      btn.addEventListener('click', () => openFaqModal(allFaq.find(f => f.id === btn.dataset.id))))
    el.querySelectorAll('.faq-del-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await wbConfirm('Видалити це питання?')) return
        await deleteDoc(doc(db, 'faq', btn.dataset.id))
        allFaq = allFaq.filter(f => f.id !== btn.dataset.id)
        renderFaqList()
      }))
  }

  // Content blocks for the answer being edited: [{type:'text', text} | {type:'image', url}]
  let faqBlocks = []

  function renderFaqBlocks() {
    const el = container.querySelector('#faq-f-blocks')
    if (!faqBlocks.length) {
      el.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Додайте текст або фото нижче</div>`
      return
    }
    el.innerHTML = faqBlocks.map((b, i) => `
      <div class="adm-card" style="padding:10px;display:flex;align-items:flex-start;gap:8px">
        ${b.type === 'image'
          ? `<img src="${b.url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0">`
          : `<textarea class="adm-input faq-block-text" data-i="${i}" rows="2" style="flex:1" placeholder="Текст...">${esc(b.text || '')}</textarea>`
        }
        <button type="button" class="adm-btn adm-btn-secondary faq-block-up"   data-i="${i}" title="Вище" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="adm-btn adm-btn-secondary faq-block-down" data-i="${i}" title="Нижче" ${i === faqBlocks.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="adm-btn adm-btn-secondary faq-block-del"  data-i="${i}" title="Видалити">${icon('trash', 12)}</button>
      </div>
    `).join('')

    el.querySelectorAll('.faq-block-text').forEach(ta =>
      ta.addEventListener('input', () => { faqBlocks[Number(ta.dataset.i)].text = ta.value }))
    el.querySelectorAll('.faq-block-del').forEach(btn =>
      btn.addEventListener('click', () => { faqBlocks.splice(Number(btn.dataset.i), 1); renderFaqBlocks() }))
    el.querySelectorAll('.faq-block-up').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i)
        ;[faqBlocks[i - 1], faqBlocks[i]] = [faqBlocks[i], faqBlocks[i - 1]]
        renderFaqBlocks()
      }))
    el.querySelectorAll('.faq-block-down').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i)
        ;[faqBlocks[i + 1], faqBlocks[i]] = [faqBlocks[i], faqBlocks[i + 1]]
        renderFaqBlocks()
      }))
  }

  function openFaqModal(faq = null) {
    editingFaqId = faq?.id || null
    container.querySelector('#faq-modal-title').textContent = faq ? 'Редагувати питання' : 'Нове питання'
    container.querySelector('#faq-f-category').value = faq?.category || ''
    container.querySelector('#faq-f-question').value = faq?.question || ''
    container.querySelector('#faq-f-order').value     = faq?.order ?? allFaq.length
    faqBlocks = faq?.content?.length
      ? faq.content.map(b => ({ ...b }))
      : (faq?.answer ? [{ type: 'text', text: faq.answer }] : [])
    renderFaqBlocks()
    container.querySelector('#faq-modal').style.display = 'flex'
  }
  function closeFaqModal() {
    container.querySelector('#faq-modal').style.display = 'none'
    editingFaqId = null
    faqBlocks = []
  }

  container.querySelector('#faq-add-btn')?.addEventListener('click', () => openFaqModal())
  container.querySelector('#faq-modal-close')?.addEventListener('click', closeFaqModal)
  container.querySelector('#faq-modal-cancel')?.addEventListener('click', closeFaqModal)
  container.querySelector('#faq-modal')?.addEventListener('click', e => {
    if (e.target.id === 'faq-modal') closeFaqModal()
  })

  container.querySelector('#faq-add-text-block')?.addEventListener('click', () => {
    faqBlocks.push({ type: 'text', text: '' })
    renderFaqBlocks()
  })
  container.querySelector('#faq-add-image-block')?.addEventListener('click', () => {
    container.querySelector('#faq-image-input').click()
  })
  container.querySelector('#faq-image-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const btn = container.querySelector('#faq-add-image-block')
    btn.disabled = true
    btn.textContent = 'Завантаження...'
    try {
      const { url } = await uploadToCloudinary(file)
      faqBlocks.push({ type: 'image', url })
      renderFaqBlocks()
    } catch (err) {
      await wbAlert('Помилка завантаження фото: ' + err.message)
    } finally {
      btn.disabled = false
      btn.textContent = '+ Фото'
    }
  })

  container.querySelector('#faq-modal-save')?.addEventListener('click', async () => {
    const question = container.querySelector('#faq-f-question').value.trim()
    const content  = faqBlocks.filter(b => b.type === 'image' || (b.type === 'text' && b.text.trim()))
    if (!question || !content.length) { await wbAlert('Заповніть питання і хоча б один блок відповіді'); return }

    const payload = {
      category: container.querySelector('#faq-f-category').value.trim() || null,
      question,
      content,
      // Plain-text fallback used for search and by any older client build
      answer: content.filter(b => b.type === 'text').map(b => b.text).join('\n\n'),
      order:    Number(container.querySelector('#faq-f-order').value) || 0,
      updatedAt: serverTimestamp(),
    }

    const btn = container.querySelector('#faq-modal-save')
    btn.disabled = true
    try {
      if (editingFaqId) {
        await updateDoc(doc(db, 'faq', editingFaqId), payload)
        const idx = allFaq.findIndex(f => f.id === editingFaqId)
        if (idx !== -1) allFaq[idx] = { ...allFaq[idx], ...payload }
      } else {
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'faq'), payload)
        allFaq.push({ id: ref.id, ...payload })
      }
      allFaq.sort((a, b) => (a.order || 0) - (b.order || 0))
      closeFaqModal()
      renderFaqList()
      invalidateRoute('faq')
    } catch (err) {
      await wbAlert('Помилка збереження: ' + err.message)
    } finally {
      btn.disabled = false
    }
  })

  async function loadAndRenderErrors() {
    const el = container.querySelector('#errors-list')
    if (!el) return
    try {
      const snap = await getDocs(query(collection(db, 'errors'), orderBy('createdAt', 'desc'), limit(300)))
      const errors = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!errors.length) { el.innerHTML = `<div class="adm-empty">Помилок немає</div>`; return }

      // Групуємо однакові помилки (той самий тип+маршрут+повідомлення) — інакше
      // журнал швидко перетворюється на список ідентичних дублікатів
      const groups = new Map()
      for (const e of errors) {
        const key = `${e.type || 'error'}|${e.route || ''}|${(e.message || '').slice(0, 200)}`
        if (!groups.has(key)) groups.set(key, { ...e, ids: [e.id], count: 0, lastSeen: e.createdAt, firstSeen: e.createdAt, users: new Set() })
        const g = groups.get(key)
        g.count++
        g.ids.push(e.id)
        if (e.userEmail) g.users.add(e.userEmail)
        const ts = e.createdAt?.toMillis?.() ?? 0
        if (ts > (g.lastSeen?.toMillis?.() ?? 0))  g.lastSeen  = e.createdAt
        if (ts < (g.firstSeen?.toMillis?.() ?? Infinity)) g.firstSeen = e.createdAt
      }
      const grouped = [...groups.values()].sort((a, b) => (b.lastSeen?.toMillis?.() ?? 0) - (a.lastSeen?.toMillis?.() ?? 0))

      el.innerHTML = grouped.map(e => {
        const ts = e.lastSeen?.toDate?.()?.toLocaleString('uk-UA') || '—'
        const typeColor = e.type === 'uncaught' ? '#F87171' : e.type === 'promise' ? '#FBBF24' : '#94A3B8'
        const usersList = [...e.users]
        return `
          <div class="err-row" data-ids="${e.ids.join(',')}">
            <div class="err-top">
              <span class="err-type" style="color:${typeColor}">${e.type || 'error'}</span>
              ${e.count > 1 ? `<span class="err-count">×${e.count}</span>` : ''}
              <span class="err-route">${e.route || '—'}</span>
              <span class="err-ver">v${e.appVersion || '?'}</span>
              <span class="err-ts">${ts}</span>
              <button class="err-del" data-ids="${e.ids.join(',')}">✕</button>
            </div>
            <div class="err-msg">${e.message || ''}</div>
            ${e.stack ? `<pre class="err-stack">${e.stack.slice(0, 500)}</pre>` : ''}
            ${usersList.length ? `<div class="err-user">${icon('user', 12)} ${usersList.slice(0, 3).join(', ')}${usersList.length > 3 ? ` +${usersList.length - 3}` : ''}</div>` : ''}
          </div>`
      }).join('')

      el.querySelectorAll('.err-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ids = btn.dataset.ids.split(',')
          const batch = writeBatch(db)
          ids.forEach(id => batch.delete(doc(db, 'errors', id)))
          await batch.commit()
          btn.closest('.err-row').remove()
        })
      })
    } catch (err) {
      el.innerHTML = `<div class="adm-empty" style="color:#F87171">Помилка завантаження: ${err.message}</div>`
    }
  }

  container.querySelector('#clear-errors-btn')?.addEventListener('click', async () => {
    if (!await wbConfirm('Видалити всі помилки?')) return
    const snap = await getDocs(collection(db, 'errors'))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    container.querySelector('#errors-list').innerHTML = `<div class="adm-empty">Помилок немає</div>`
    showToast('Журнал очищено')
  })

  await Promise.all([loadAndRender(), loadPayCfg()])

  // ═══════════════════════════════════════════════════════════
  // LOADERS
  // ═══════════════════════════════════════════════════════════
  async function loadAllUsers() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  // Знижує всіх юзерів з простроченою підпискою до FREE (викликається у фоні)
  async function sweepExpiredSubscriptions(users) {
    const now     = new Date()
    const expired = users.filter(u => {
      if (u.plan === 'free' || u.subscriptionStatus === 'expired') return false
      // Перевіряємо обидва можливі поля для дати закінчення
      const raw = u.subscriptionEnd ?? u.planExpiresAt ?? null
      if (!raw) return false
      const end = raw?.toDate ? raw.toDate() : new Date(raw)
      return !isNaN(end.getTime()) && end < now
    })
    if (!expired.length) return 0

    const batch = writeBatch(db)
    for (const u of expired) {
      batch.update(doc(db, 'users', u.id), {
        plan:               'free',
        subscriptionStatus: 'expired',
        updatedAt:          serverTimestamp(),
      })
      batch.set(doc(collection(db, 'users', u.id, 'subscriptionHistory')), {
        plan: 'free', previousPlan: u.plan, source: 'system_expire',
        amount: null, months: null, changedBy: null, changedByName: null, note: null,
        createdAt: serverTimestamp(),
      })
      // Оновлюємо локальний масив
      Object.assign(u, { plan: 'free', subscriptionStatus: 'expired' })
    }
    try {
      await batch.commit()
      console.log(`[Admin] Знижено ${expired.length} прострочених підписок`)
    } catch (err) {
      console.error('[Admin] sweepExpiredSubscriptions error:', err)
    }
    return expired.length
  }

  async function loadAllPayments() {
    try {
      const snap = await getDocs(query(collectionGroup(db, 'pendingPayments'), limit(300)))
      return snap.docs
        .map(d => ({ id: d.id, userId: d.ref.parent.parent.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    } catch (err) { console.error(err); return [] }
  }

  async function loadAllTickets() {
    try {
      const snap = await getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(300)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  async function loadAnnouncements() {
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  // ═══════════════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════════════
  function renderOverview() {
    const total    = allUsers.length
    const byPlan   = { free: 0, pro: 0, business: 0 }
    allUsers.forEach(u => { byPlan[u.plan || 'free']++ })

    const paid        = byPlan.pro + byPlan.business
    const revenue     = byPlan.pro * 299 + byPlan.business * 799
    const pendingCnt  = allPayments.filter(p => p.status === 'pending').length
    const banned      = allUsers.filter(u => u.isBanned).length
    const conversion  = total > 0 ? ((paid / total) * 100).toFixed(1) : '0'

    // New today
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const newToday = allUsers.filter(u => {
      const d = u.createdAt?.toDate?.()
      return d && d >= todayStart
    }).length

    // Онлайн / активні зараз (heartbeat lastSeenAt)
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    const onlineNow = allUsers.filter(u => {
      const ts = u.lastSeenAt?.toMillis?.()
      return ts && (now - ts) <= ONLINE_THRESHOLD_MS
    }).length
    const activeToday = allUsers.filter(u => {
      const ts = u.lastSeenAt?.toMillis?.()
      return ts && ts >= dayAgo
    }).length

    const stats = [
      { svgIcon: icon('clients', 20),     value: total,      label: 'Всього юзерів',         color: '' },
      { svgIcon: `<span class="adm-online-dot"></span>`, value: onlineNow, label: 'Онлайн зараз', color: 'green' },
      { svgIcon: icon('bar-chart', 20),   value: activeToday, label: 'Активні за 24г',        color: 'blue' },
      { svgIcon: icon('plus', 20),        value: newToday,   label: 'Нових сьогодні',        color: 'blue' },
      { svgIcon: icon('upgrade', 20),     value: paid,       label: 'Платних підписок',      color: 'purple' },
      { svgIcon: icon('finances', 20),    value: `₴${revenue.toLocaleString()}`, label: 'Місячний дохід', color: 'green' },
      { svgIcon: icon('timer', 20),       value: pendingCnt, label: 'Платежів на перевірці', color: 'orange' },
      { svgIcon: icon('bar-chart', 20),   value: `${conversion}%`, label: 'Конверсія free→paid', color: '' },
    ]

    container.querySelector('#adm-stats').innerHTML = stats.map(s => `
      <div class="adm-stat-card ${s.color ? 'adm-stat-' + s.color : ''}">
        <div class="adm-stat-icon">${s.svgIcon}</div>
        <div class="adm-stat-val">${s.value}</div>
        <div class="adm-stat-lbl">${s.label}</div>
      </div>
    `).join('')

    // Recent registrations
    const recent = allUsers.slice(0, 6)
    container.querySelector('#recent-regs-list').innerHTML = recent.map(u => `
      <div class="adm-user-row" style="cursor:pointer" data-uid="${u.id}">
        <div class="adm-avatar">${(u.name || u.email || '?')[0].toUpperCase()}</div>
        <div class="adm-user-info">
          <div class="adm-user-name">${u.name || '—'}</div>
          <div class="adm-user-email">${u.email || u.id}</div>
        </div>
        <span class="adm-plan-pill" style="color:${(PLAN_META[u.plan]||PLAN_META.free).color};background:${(PLAN_META[u.plan]||PLAN_META.free).color}18">
          ${(PLAN_META[u.plan]||PLAN_META.free).label}
        </span>
      </div>
    `).join('')

    container.querySelectorAll('#recent-regs-list .adm-user-row').forEach(row => {
      row.addEventListener('click', () => openUserDetail(row.dataset.uid))
    })

    // Plan breakdown bars
    container.querySelector('#plan-breakdown').innerHTML = Object.entries(byPlan).map(([plan, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0
      const m   = PLAN_META[plan]
      return `
        <div class="adm-break-row">
          <span class="adm-break-label" style="color:${m.color}">${m.label}</span>
          <div class="adm-break-bar-wrap">
            <div class="adm-break-bar" style="width:${pct}%;background:${m.color}"></div>
          </div>
          <span class="adm-break-count">${count} <span style="color:var(--text-muted)">(${pct}%)</span></span>
        </div>`
    }).join('')

    // Activity bars (registrations by day, last 7 days)
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = allUsers.filter(u => {
        const created = u.createdAt?.toDate?.()
        return created && created >= d && created < next
      }).length
      days.push({ label: d.toLocaleDateString('uk-UA', { weekday: 'short' }), count })
    }
    const maxDay = Math.max(...days.map(d => d.count), 1)
    container.querySelector('#adm-activity-bars').innerHTML = days.map(d => `
      <div class="adm-act-col">
        <div class="adm-act-bar-wrap">
          <div class="adm-act-bar" style="height:${Math.round((d.count / maxDay) * 100)}%"></div>
        </div>
        <div class="adm-act-count">${d.count}</div>
        <div class="adm-act-label">${d.label}</div>
      </div>
    `).join('')
  }

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════
  function renderAnalytics() {
    // Registrations last 30 days
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = allUsers.filter(u => {
        const created = u.createdAt?.toDate?.()
        return created && created >= d && created < next
      }).length
      days.push({ label: i % 5 === 0 ? d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '', count })
    }
    const maxDay = Math.max(...days.map(d => d.count), 1)
    container.querySelector('#reg-chart').innerHTML = `
      <div class="adm-reg-chart">
        ${days.map(d => `
          <div class="adm-reg-col" title="${d.count} реєстрацій">
            <div class="adm-reg-bar" style="height:${Math.round((d.count / maxDay) * 80) + 2}px"></div>
            <div class="adm-reg-label">${d.label}</div>
          </div>
        `).join('')}
      </div>`

    // Revenue breakdown
    const byPlan = { free: 0, pro: 0, business: 0 }
    allUsers.forEach(u => { byPlan[u.plan || 'free']++ })
    const totalRev = byPlan.pro * 299 + byPlan.business * 799
    container.querySelector('#revenue-breakdown').innerHTML = `
      <div class="adm-rev-total">₴${totalRev.toLocaleString('uk-UA')}<span style="font-size:13px;color:var(--text-muted)">/міс</span></div>
      ${Object.entries(byPlan).filter(([p]) => p !== 'free').map(([plan, count]) => {
        const rev = count * PLAN_META[plan].price
        const pct = totalRev > 0 ? Math.round((rev / totalRev) * 100) : 0
        return `
          <div class="adm-break-row">
            <span class="adm-break-label" style="color:${PLAN_META[plan].color}">${PLAN_META[plan].label}</span>
            <div class="adm-break-bar-wrap">
              <div class="adm-break-bar" style="width:${pct}%;background:${PLAN_META[plan].color}"></div>
            </div>
            <span class="adm-break-count">₴${rev.toLocaleString()}</span>
          </div>`
      }).join('')}`

    // Conversion
    const total = allUsers.length
    const paid  = byPlan.pro + byPlan.business
    const conv  = total > 0 ? ((paid / total) * 100).toFixed(1) : '0'
    container.querySelector('#conversion-stats').innerHTML = `
      <div class="adm-conv-ring">
        <svg viewBox="0 0 100 100" class="adm-ring-svg">
          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-tertiary)" stroke-width="10"/>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#4F8EF7" stroke-width="10"
            stroke-dasharray="${(parseFloat(conv) / 100 * 238).toFixed(1)} 238"
            stroke-dashoffset="59.5" stroke-linecap="round"/>
        </svg>
        <div class="adm-ring-val">${conv}%</div>
      </div>
      <div class="adm-conv-row"><span>FREE</span><strong>${byPlan.free}</strong></div>
      <div class="adm-conv-row"><span>Платні</span><strong style="color:#4F8EF7">${paid}</strong></div>
      <div class="adm-conv-row"><span>Конверсія</span><strong style="color:#34D399">${conv}%</strong></div>`

    // Niches
    const niches = {}
    allUsers.forEach(u => { const n = u.profession || 'other'; niches[n] = (niches[n] || 0) + 1 })
    const nicheMap = { freelancer: 'Фрілансер', accountant: 'Бухгалтер', smm: 'SMM', beauty: 'Салон краси', other: 'Інша' }
    const nicheTotal = Object.values(niches).reduce((a, b) => a + b, 0) || 1
    container.querySelector('#niche-breakdown').innerHTML = Object.entries(niches)
      .sort((a, b) => b[1] - a[1])
      .map(([n, count]) => {
        const pct = Math.round((count / nicheTotal) * 100)
        return `
          <div class="adm-break-row">
            <span class="adm-break-label" style="font-size:12px">${nicheMap[n] || n}</span>
            <div class="adm-break-bar-wrap">
              <div class="adm-break-bar" style="width:${pct}%;background:#4F8EF7"></div>
            </div>
            <span class="adm-break-count">${count}</span>
          </div>`
      }).join('')

    // Module usage — рахуємо по selectedModules / activeBusinessModules
    const modLabels = { dashboard:'Дашборд',clients:'Клієнти',projects:'Проекти',invoices:'Рахунки',contracts:'Договори',tasks:'Задачі',timer:'Таймер',finances:'Фінанси','tax-calendar':'Податки',appointments:'Розклад',services:'Послуги','content-plan':'Контент',accounts:'Акаунти',passwords:'Паролі',notes:'Нотатки',documents:'Документи','api-keys':'API',hr:'Персонал',warehouse:'Склад',reports:'Звіти',support:'Підтримка',portfolio:'Портфоліо',templates:'Шаблони',currency:'Валюти',cashbook:'Каса',bank:'Банк',payroll:'Зарплата',prro:'ПРРО' }
    const modUsage = {}
    let usersWithModules = 0
    allUsers.forEach(u => {
      const mods = u.selectedModules || u.activeBusinessModules
      if (!mods?.length) return
      usersWithModules++
      mods.forEach(m => { if (m !== 'dashboard') modUsage[m] = (modUsage[m] || 0) + 1 })
    })
    const modTotal = usersWithModules || 1
    container.querySelector('#module-usage-breakdown').innerHTML = Object.entries(modUsage)
      .sort((a, b) => b[1] - a[1])
      .map(([m, count]) => {
        const pct = Math.round((count / modTotal) * 100)
        return `
          <div class="adm-break-row">
            <span class="adm-break-label" style="font-size:12px">${modLabels[m] || m}</span>
            <div class="adm-break-bar-wrap">
              <div class="adm-break-bar" style="width:${pct}%;background:#34D399"></div>
            </div>
            <span class="adm-break-count">${count} <span style="color:var(--text-muted)">(${pct}%)</span></span>
          </div>`
      }).join('') || '<div class="adm-empty">Немає даних</div>'

    // Retention — % юзерів кожного "віку" (тижні з реєстрації) що досі активні
    // (lastSeenAt дотягнувся до цього тижня). Heartbeat пише lastSeenAt раз/хв
    // доки застосунок відкритий, тож це проксі "повернувся в застосунок".
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const nowMs = Date.now()
    const usersWithDates = allUsers
      .map(u => ({ created: u.createdAt?.toMillis?.(), lastSeen: u.lastSeenAt?.toMillis?.() }))
      .filter(u => u.created)

    const retentionWeeks = [1, 2, 3, 4, 6, 8].map(week => {
      const eligible = usersWithDates.filter(u => nowMs - u.created >= week * WEEK_MS)
      const retained = eligible.filter(u => u.lastSeen && u.lastSeen - u.created >= week * WEEK_MS)
      return { week, pct: eligible.length ? Math.round((retained.length / eligible.length) * 100) : null, total: eligible.length }
    })

    const retEl = container.querySelector('#retention-breakdown')
    if (!usersWithDates.some(u => u.lastSeen)) {
      retEl.innerHTML = `<div class="adm-empty">Дані ще накопичуються (потрібен час роботи heartbeat-трекера)</div>`
    } else {
      retEl.innerHTML = `
        <div class="adm-ret-chart">
          ${retentionWeeks.map(r => `
            <div class="adm-ret-col" title="${r.total} користувачів старші за ${r.week} тиж.">
              <div class="adm-ret-bar-wrap">
                <div class="adm-ret-bar" style="height:${r.pct === null ? 0 : Math.max(r.pct, 2)}%">
                  ${r.pct !== null ? `<div class="adm-ret-tip">${r.pct}%</div>` : ''}
                </div>
              </div>
              <div class="adm-ret-label">${r.pct === null ? '—' : `тиж. ${r.week}`}</div>
            </div>
          `).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:10px">
          % користувачів, які відкривали застосунок через N тижнів після реєстрації (з тих, хто вже стільки існує)
        </div>`
    }
  }

  // ═══════════════════════════════════════════════════════════
  // USERS TABLE
  // ═══════════════════════════════════════════════════════════
  function renderUsersTable() {
    const q      = container.querySelector('#users-search').value.toLowerCase().trim()
    const planF  = container.querySelector('#plan-filter').value
    const statF  = container.querySelector('#status-filter').value

    let list = allUsers
    if (q) list = list.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.businessName?.toLowerCase().includes(q))
    if (planF !== 'all') list = list.filter(u => (u.plan || 'free') === planF)
    if (statF === 'active') list = list.filter(u => !u.isBanned)
    if (statF === 'banned') list = list.filter(u => u.isBanned)

    container.querySelector('#users-count-label').textContent = `${list.length} / ${allUsers.length}`

    if (!list.length) {
      container.querySelector('#users-table-wrap').innerHTML = '<div class="adm-empty">Користувачів не знайдено</div>'
      return
    }

    container.querySelector('#users-table-wrap').innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th><input type="checkbox" class="adm-row-checkbox" id="bulk-select-all"></th>
          <th>Користувач</th><th>Бізнес / ніша</th><th>План</th>
          <th>Підписка до</th><th>Реєстрація</th><th>Дії</th>
        </tr></thead>
        <tbody>
          ${list.map(u => {
            const pm     = PLAN_META[u.plan || 'free'] || PLAN_META.free
            const regD   = u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const _rawExpiry = u.subscriptionEnd ?? u.planExpiresAt ?? null
            const _expiryDate = _rawExpiry ? (_rawExpiry?.toDate ? _rawExpiry.toDate() : new Date(_rawExpiry)) : null
            const subEnd = _expiryDate && !isNaN(_expiryDate) ? _expiryDate.toLocaleDateString('uk-UA') : '—'
            const banned = u.isBanned
            const isOnline = u.lastSeenAt?.toMillis?.() && (Date.now() - u.lastSeenAt.toMillis()) <= ONLINE_THRESHOLD_MS
            return `
              <tr class="${banned ? 'adm-row-banned' : ''}" data-uid="${u.id}" style="cursor:pointer">
                <td><input type="checkbox" class="adm-row-checkbox bulk-row-cb" data-uid="${u.id}" ${selectedUids.has(u.id) ? 'checked' : ''}></td>
                <td>
                  <div class="adm-user-cell">
                    <div style="position:relative">
                      <div class="adm-avatar ${banned ? 'adm-avatar-banned' : ''}">${(u.name || '?')[0].toUpperCase()}</div>
                      ${isOnline ? `<span class="adm-online-dot" style="position:absolute;bottom:-2px;right:-2px;border:2px solid var(--bg-secondary)"></span>` : ''}
                    </div>
                    <div>
                      <div class="adm-user-name">${u.name || '—'} ${u.isAdmin ? '<span class="adm-admin-badge">Admin</span>' : ''} ${banned ? '<span class="adm-banned-badge">Banned</span>' : ''}</div>
                      <div class="adm-user-email">${u.email || u.id}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="font-size:13px">${u.businessName || '—'}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${profLabel(u.profession)}</div>
                </td>
                <td><span class="adm-plan-pill" style="color:${pm.color};background:${pm.color}18">${pm.label}</span></td>
                <td style="font-size:13px">${subEnd}</td>
                <td style="font-size:13px">${regD}</td>
                <td>
                  <div class="adm-action-btns">
                    <button class="adm-action-btn" data-uid="${u.id}" data-plan="${u.plan||'free'}" data-action="plan">План</button>
                    ${(u.plan && u.plan !== 'free') ? `<button class="adm-action-btn adm-btn-revoke" data-uid="${u.id}" data-action="revoke-plan" title="Забрати план">${icon('x-circle', 13)} Забрати план</button>` : ''}
                    ${isOwner ? (u.isAdmin
                      ? `<button class="adm-action-btn adm-btn-revoke" data-uid="${u.id}" data-action="revoke-admin" title="Зняти адміна">${icon('shield-off', 13)}</button>`
                      : `<button class="adm-action-btn adm-btn-admin" data-uid="${u.id}" data-action="admin" title="Зробити адміном">${icon('settings', 13)}</button>`
                    ) : ''}
                    <button class="adm-action-btn ${banned ? 'adm-btn-unban' : 'adm-btn-ban'}" data-uid="${u.id}" data-banned="${banned}" data-action="ban">
                      ${banned ? 'Розбан' : 'Бан'}
                    </button>
                    <button class="adm-action-btn adm-btn-delete" data-uid="${u.id}" data-action="delete" title="Видалити акаунт">${icon('trash', 13)}</button>
                  </div>
                </td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    // Row click → detail
    container.querySelectorAll('#users-table-wrap tbody tr').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.adm-action-btns') || e.target.closest('.adm-row-checkbox')) return
        openUserDetail(row.dataset.uid)
      })
    })

    // Action buttons
    container.querySelectorAll('.adm-action-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const action = btn.dataset.action
        if (action === 'plan')         openChangePlanModal(btn.dataset.uid, btn.dataset.plan)
        if (action === 'revoke-plan')  await revokePlan(btn.dataset.uid)
        if (action === 'admin')        await makeAdmin(btn.dataset.uid)
        if (action === 'revoke-admin') await revokeAdmin(btn.dataset.uid)
        if (action === 'ban')          await toggleBan(btn.dataset.uid, btn.dataset.banned === 'true')
        if (action === 'delete')       await deleteUser(btn.dataset.uid)
      })
    })

    // ── Bulk selection ───────────────────────────────────────
    container.querySelectorAll('.bulk-row-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedUids.add(cb.dataset.uid)
        else             selectedUids.delete(cb.dataset.uid)
        updateBulkBar()
      })
    })
    container.querySelector('#bulk-select-all')?.addEventListener('change', e => {
      list.forEach(u => { if (e.target.checked) selectedUids.add(u.id); else selectedUids.delete(u.id) })
      renderUsersTable()
    })
    updateBulkBar()
  }

  function updateBulkBar() {
    const bar = container.querySelector('#adm-bulk-bar')
    if (!bar) return
    if (selectedUids.size === 0) { bar.style.display = 'none'; return }
    bar.style.display = 'flex'
    container.querySelector('#adm-bulk-count').textContent = `${selectedUids.size} вибрано`
  }

  container.querySelector('#bulk-clear-btn')?.addEventListener('click', () => {
    selectedUids.clear(); renderUsersTable()
  })

  container.querySelector('#bulk-ban-btn')?.addEventListener('click', async () => {
    const ids = [...selectedUids]
    if (!await wbConfirm(`Забанити ${ids.length} користувача(ів)?`, { okLabel: 'Забанити', danger: true })) return
    const batch = writeBatch(db)
    ids.forEach(uid => batch.update(doc(db, 'users', uid), { isBanned: true, updatedAt: serverTimestamp() }))
    await batch.commit()
    ids.forEach(uid => { const u = allUsers.find(u => u.id === uid); if (u) u.isBanned = true })
    selectedUids.clear()
    renderUsersTable(); renderOverview()
    showToast(`Забановано ${ids.length} користувача(ів)`)
    logAdminAction(`Масовий бан (${ids.length})`, null, ids.join(', '))
  })

  container.querySelector('#bulk-plan-btn')?.addEventListener('click', async () => {
    const ids = [...selectedUids]
    if (!await wbConfirm(`Забрати тарифний план у ${ids.length} користувача(ів)? Усі перейдуть на FREE.`, { okLabel: 'Забрати план', danger: true })) return
    const batch = writeBatch(db)
    const prevPlans = {}
    ids.forEach(uid => {
      prevPlans[uid] = allUsers.find(u => u.id === uid)?.plan || 'free'
      batch.update(doc(db, 'users', uid), {
        plan: 'free', subscriptionEnd: null, subscriptionStatus: 'inactive', updatedAt: serverTimestamp(),
      })
      batch.set(doc(collection(db, 'users', uid, 'subscriptionHistory')), {
        plan: 'free', previousPlan: prevPlans[uid], source: 'revoke',
        amount: null, months: null, changedBy: user.uid, changedByName: profile.name || user.email, note: null,
        createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
    ids.forEach(uid => { const u = allUsers.find(u => u.id === uid); if (u) Object.assign(u, { plan: 'free', subscriptionStatus: 'inactive' }) })
    selectedUids.clear()
    renderUsersTable(); renderOverview(); renderAnalytics()
    showToast(`Плани знято у ${ids.length} користувача(ів)`)
    logAdminAction(`Масове скидання плану (${ids.length})`, null, ids.join(', '))
  })

  container.querySelector('#bulk-delete-btn')?.addEventListener('click', async () => {
    const ids = [...selectedUids]
    if (!await wbConfirm(`Видалити ${ids.length} акаунт(ів)? Цю дію не можна скасувати.`, { okLabel: 'Видалити', danger: true })) return
    const batch = writeBatch(db)
    ids.forEach(uid => batch.delete(doc(db, 'users', uid)))
    await batch.commit()
    allUsers = allUsers.filter(u => !ids.includes(u.id))
    selectedUids.clear()
    renderUsersTable(); renderOverview()
    showToast(`Видалено ${ids.length} акаунт(ів)`)
    logAdminAction(`Масове видалення (${ids.length})`, null, ids.join(', '))
  })

  // ── User detail modal ─────────────────────────────────────
  async function openUserDetail(uid) {
    const u = allUsers.find(u => u.id === uid)
    if (!u) return

    // Load businesses
    let businesses = []
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'businesses'))
      businesses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {}
    const subHistory = await getSubscriptionHistory(uid)
    const loginEvents = await getLoginEvents(uid)

    const pm = PLAN_META[u.plan || 'free'] || PLAN_META.free
    const regD = u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) || '—'
    const modules = u.selectedModules || []

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal adm-modal-lg">
        <div class="adm-modal-head">
          <h2>Картка користувача</h2>
          <button class="adm-modal-close" id="ud-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body adm-detail-body">

          <!-- Left: profile -->
          <div class="adm-detail-left">
            <div class="adm-detail-avatar">${(u.name || '?')[0].toUpperCase()}</div>
            <div class="adm-detail-name">${u.name || '—'}</div>
            <div class="adm-detail-email">${u.email || u.id}</div>
            <span class="adm-plan-pill adm-plan-pill-lg" style="color:${pm.color};background:${pm.color}18">${pm.label}</span>
            ${u.isBanned ? '<div class="adm-banned-badge" style="margin-top:8px">Забанований</div>' : ''}

            <div class="adm-detail-meta">
              ${metaRow('', 'Телефон', u.phone)}
              ${metaRow('', 'Місто', u.city)}
              ${metaRow('', 'Бізнес', u.businessName)}
              ${metaRow('', 'Ніша', profLabel(u.profession))}
              ${metaRow('', 'Зареєстрований', regD)}
              ${metaRow('', 'UID', `<span style="font-family:monospace;font-size:10px">${u.id}</span>`)}
            </div>

            <div class="adm-detail-actions">
              ${(isOwner || myAllowedTabs.includes('users')) ? `<button class="adm-btn adm-btn-primary" id="ud-impersonate" style="background:linear-gradient(135deg,#A78BFA,#8B5CF6)">${icon('eye',13)} Відкрити CRM користувача</button>` : ''}
              <button class="adm-btn adm-btn-primary" id="ud-change-plan">${icon('credit-card',13)} Змінити план</button>
              ${(u.plan && u.plan !== 'free') ? `<button class="adm-btn adm-btn-warning" id="ud-revoke-plan">${icon('x-circle',13)} Забрати план</button>` : ''}
              <button class="adm-btn adm-btn-secondary" id="ud-edit-profile">${icon('edit',13)} Редагувати профіль</button>
              <button class="adm-btn adm-btn-secondary" id="ud-edit-modules">${icon('grid',13)} Редагувати модулі</button>
              <button class="adm-btn ${u.isBanned ? 'adm-btn-success' : 'adm-btn-danger'}" id="ud-ban-btn">
                ${u.isBanned ? 'Розбанити' : 'Забанити'}
              </button>
              ${isOwner ? (u.isAdmin
                ? `<button class="adm-btn adm-btn-warning" id="ud-revoke-admin-btn">${icon('shield-off',13)} Зняти адміна</button>`
                : `<button class="adm-btn adm-btn-ghost" id="ud-admin-btn">Зробити адміном</button>`
              ) : ''}
              <button class="adm-btn adm-btn-ghost" id="ud-reset-onb" title="Скинути онбординг">↺ Скинути онбординг</button>
              <button class="adm-btn adm-btn-danger" id="ud-delete-btn" style="margin-top:4px">${icon('trash',13)} Видалити акаунт</button>
            </div>

            ${u.adminNote ? `<div class="adm-admin-note" id="ud-note-display">${icon('pencil',12)} ${u.adminNote}</div>` : ''}
            <button class="adm-btn adm-btn-ghost adm-btn-sm" id="ud-add-note" style="margin-top:8px;font-size:11px">
              ${icon('pencil',11)} ${u.adminNote ? 'Редагувати нотатку' : '+ Нотатка адміна'}
            </button>
          </div>

          <!-- Right: businesses + modules -->
          <div class="adm-detail-right">

            <div class="adm-detail-uid">
              <span style="font-family:monospace;font-size:11px;color:var(--text-muted)">${u.id}</span>
              <button class="adm-btn adm-btn-ghost adm-btn-sm" id="ud-copy-uid">${icon('copy',11)} Копіювати UID</button>
            </div>

            <h3 class="adm-detail-section">Бізнеси (${businesses.length + 1})</h3>
            <div class="adm-biz-list">
              <div class="adm-biz-item adm-biz-main">
                <span class="adm-biz-icon">${icon('building', 16)}</span>
                <div>
                  <div class="adm-biz-name">${u.businessName || 'Основний бізнес'}</div>
                  <div class="adm-biz-niche">${profLabel(u.profession)}</div>
                </div>
                <span class="adm-biz-badge">Основний</span>
              </div>
              ${businesses.map(b => `
                <div class="adm-biz-item">
                  <span class="adm-biz-icon">${icon('building', 16)}</span>
                  <div>
                    <div class="adm-biz-name">${b.name || '—'}</div>
                    <div class="adm-biz-niche">${profLabel(b.profession)}</div>
                  </div>
                </div>`).join('')}
            </div>

            <h3 class="adm-detail-section" style="margin-top:20px">Активні модулі (${modules.length})</h3>
            <div class="adm-modules-wrap" id="ud-modules-display">
              ${modules.length ? modules.map(id => {
                const labels = { dashboard:'Дашборд',clients:'Клієнти',projects:'Проекти',invoices:'Рахунки',contracts:'Договори',tasks:'Задачі',timer:'Таймер',finances:'Фінанси','tax-calendar':'Податки',appointments:'Розклад',services:'Послуги','content-plan':'Контент',accounts:'Акаунти',passwords:'Паролі',notes:'Нотатки',documents:'Документи','api-keys':'API',hr:'Персонал',warehouse:'Склад',reports:'Звіти',support:'Підтримка',portfolio:'Портфоліо',templates:'Шаблони',currency:'Валюти',cashbook:'Каса',bank:'Банк',payroll:'Зарплата',prro:'ПРРО' }
                return `<span class="adm-mod-chip">${icon(id, 12)} ${labels[id]||id}</span>`
              }).join('') : '<span style="color:var(--text-muted);font-size:13px">Немає модулів</span>'}
            </div>

            ${(() => {
              const rawExp = u.subscriptionEnd ?? u.planExpiresAt ?? null
              if ((u.plan === 'free' || !u.plan) && !rawExp) return ''
              let endStr = '—', daysLeft = null
              if (rawExp) {
                const end = rawExp?.toDate ? rawExp.toDate() : new Date(rawExp)
                if (!isNaN(end.getTime())) {
                  endStr   = end.toLocaleDateString('uk-UA')
                  daysLeft = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24))
                }
              }
              const daysColor  = daysLeft === null ? '#94A3B8' : daysLeft > 7 ? '#34D399' : daysLeft > 3 ? '#FBBF24' : daysLeft > 0 ? '#FB923C' : '#F87171'
              const daysLabel  = daysLeft === null ? '—' : daysLeft > 0 ? `${daysLeft} дн.` : 'Прострочено'
              const statusColor = u.subscriptionStatus === 'active' && (daysLeft === null || daysLeft > 0) ? '#34D399' : '#F87171'
              const statusLabel = u.subscriptionStatus === 'active' && (daysLeft === null || daysLeft > 0) ? 'Активна' : 'Прострочена / Неактивна'
              return `
                <h3 class="adm-detail-section" style="margin-top:20px">Підписка</h3>
                <div class="adm-detail-meta">
                  ${metaRow('', 'Діє до', endStr)}
                  ${daysLeft !== null ? metaRow('', 'Залишилось', `<strong style="color:${daysColor}">${daysLabel}</strong>`) : ''}
                  ${metaRow('', 'Статус', `<span style="color:${statusColor}">${statusLabel}</span>`)}
                </div>`
            })()}

            ${subHistory.length ? `
            <h3 class="adm-detail-section" style="margin-top:20px">Історія підписки (${subHistory.length})</h3>
            <div class="adm-sub-history">
              ${subHistory.map(h => {
                const hPm = PLAN_META[h.plan] || PLAN_META.free
                const hDate = h.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'
                return `
                  <div class="adm-sub-hist-row">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span class="adm-plan-pill" style="color:${hPm.color};background:${hPm.color}18;font-size:10px">${hPm.label}</span>
                      ${h.previousPlan && h.previousPlan !== h.plan ? `<span style="font-size:11px;color:var(--text-muted)">з ${h.previousPlan.toUpperCase()}</span>` : ''}
                    </div>
                    <div style="font-size:12px;color:var(--text-muted)">${SOURCE_LABEL[h.source] || h.source}${h.changedByName ? ` · ${esc(h.changedByName)}` : ''}${h.months ? ` · ${h.months} міс` : ''}${h.amount ? ` · ₴${h.amount}` : ''}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${hDate}</div>
                  </div>`
              }).join('')}
            </div>` : ''}

            ${loginEvents.length ? `
            <h3 class="adm-detail-section" style="margin-top:20px">Останні входи (${loginEvents.length})</h3>
            <div class="adm-sub-history">
              ${loginEvents.map(le => {
                const leDate = le.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'
                return `
                  <div class="adm-sub-hist-row" style="${le.isNewDevice ? 'border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.06)' : ''}">
                    <div style="display:flex;align-items:center;gap:6px">
                      ${le.isNewDevice ? `<span style="font-size:10px;font-weight:700;color:#F59E0B;background:rgba(245,158,11,.15);padding:1px 6px;border-radius:99px">НОВИЙ ПРИСТРІЙ</span>` : ''}
                      <span style="font-size:12px">${esc(le.platform || '—')}</span>
                    </div>
                    <div style="font-size:12px;color:var(--text-muted);font-family:monospace">${esc(le.ip || 'IP невідомий')}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${leDate}</div>
                  </div>`
              }).join('')}
            </div>` : ''}
          </div>

        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#ud-close').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
    modal.querySelector('#ud-change-plan')?.addEventListener('click', () => { modal.remove(); openChangePlanModal(uid, u.plan || 'free') })
    modal.querySelector('#ud-impersonate')?.addEventListener('click', async () => {
      if (!await wbConfirm(
        `Відкрити CRM користувача «${u.name || u.email}» у режимі перегляду?\n\nВи побачите і зможете редагувати його дані (клієнти, задачі, рахунки тощо), як він сам.`,
        { okLabel: 'Відкрити' }
      )) return
      modal.remove()
      startImpersonation(uid, u.name || u.email)
      await logAdminAction('Відкрив CRM користувача (режим перегляду)', uid, u.name || u.email)
      window.dispatchEvent(new CustomEvent('impersonate-start'))
    })
    modal.querySelector('#ud-revoke-plan')?.addEventListener('click', async () => { modal.remove(); await revokePlan(uid) })
    modal.querySelector('#ud-ban-btn')?.addEventListener('click', async () => { modal.remove(); await toggleBan(uid, u.isBanned) })
    modal.querySelector('#ud-admin-btn')?.addEventListener('click', async () => { modal.remove(); await makeAdmin(uid) })
    modal.querySelector('#ud-revoke-admin-btn')?.addEventListener('click', async () => { modal.remove(); await revokeAdmin(uid) })
    modal.querySelector('#ud-delete-btn')?.addEventListener('click', async () => { modal.remove(); await deleteUser(uid) })
    modal.querySelector('#ud-edit-profile')?.addEventListener('click', () => openEditProfileModal(uid, u, modal))
    modal.querySelector('#ud-edit-modules')?.addEventListener('click', () => openEditModulesModal(uid, u, modal))
    modal.querySelector('#ud-copy-uid')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(uid)
      showToast('UID скопійовано')
    })
    modal.querySelector('#ud-reset-onb')?.addEventListener('click', async () => {
      if (!await wbConfirm(`Скинути онбординг для ${u.name || u.email}? Користувач побачить екран вибору ніші.`, { okLabel: 'Скинути' })) return
      try {
        await updateDoc(doc(db, 'users', uid), { onboardingDone: false, profession: null, accountType: null })
        const idx = allUsers.findIndex(x => x.id === uid)
        if (idx !== -1) { allUsers[idx].onboardingDone = false; allUsers[idx].profession = null }
        modal.remove(); showToast('Онбординг скинуто')
      } catch (err) { showToast('Помилка: ' + err.message, 'error') }
    })
    modal.querySelector('#ud-add-note')?.addEventListener('click', () => openAddNoteModal(uid, u, modal))
  }

  // ── Edit profile modal ────────────────────────────────────
  function openEditProfileModal(uid, u, parentModal) {
    parentModal?.remove()
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:440px">
        <div class="adm-modal-head">
          <h2>${icon('edit',18)} Редагувати профіль</h2>
          <button class="adm-modal-close" id="ep-close">${icon('x',14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:12px">
          <div class="adm-field"><label>Ім'я</label>
            <input class="adm-input" id="ep-name" value="${u.name||''}" placeholder="Ім'я користувача">
          </div>
          <div class="adm-field"><label>Назва бізнесу</label>
            <input class="adm-input" id="ep-biz" value="${u.businessName||''}" placeholder="Назва бізнесу">
          </div>
          <div class="adm-field"><label>Телефон</label>
            <input class="adm-input" id="ep-phone" value="${u.phone||''}" placeholder="+380XXXXXXXXX">
          </div>
          <div class="adm-field"><label>Місто</label>
            <input class="adm-input" id="ep-city" value="${u.city||''}" placeholder="Київ">
          </div>
          <div class="adm-field"><label>Ніша</label>
            <select class="adm-input adm-select" id="ep-profession">
              <option value="">— не обрано —</option>
              <option value="freelancer" ${u.profession==='freelancer'?'selected':''}>Фрілансер</option>
              <option value="accountant" ${u.profession==='accountant'?'selected':''}>Бухгалтер / ФОП</option>
              <option value="smm"        ${u.profession==='smm'?'selected':''}>SMM / Маркетолог</option>
              <option value="beauty"     ${u.profession==='beauty'?'selected':''}>Салон краси</option>
            </select>
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="ep-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="ep-save">Зберегти</button>
        </div>
      </div>`
    document.body.appendChild(modal)
    modal.querySelector('#ep-close').addEventListener('click',  () => { modal.remove(); openUserDetail(uid) })
    modal.querySelector('#ep-cancel').addEventListener('click', () => { modal.remove(); openUserDetail(uid) })
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); openUserDetail(uid) } })
    modal.querySelector('#ep-save').addEventListener('click', async () => {
      const btn = modal.querySelector('#ep-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        const upd = {
          name:         modal.querySelector('#ep-name').value.trim() || null,
          businessName: modal.querySelector('#ep-biz').value.trim()  || null,
          phone:        modal.querySelector('#ep-phone').value.trim() || null,
          city:         modal.querySelector('#ep-city').value.trim()  || null,
          profession:   modal.querySelector('#ep-profession').value   || null,
          updatedAt:    serverTimestamp(),
        }
        await updateDoc(doc(db, 'users', uid), upd)
        const idx = allUsers.findIndex(x => x.id === uid)
        if (idx !== -1) Object.assign(allUsers[idx], upd)
        modal.remove(); renderUsersTable()
        showToast('Профіль оновлено')
        openUserDetail(uid)
      } catch (err) { showToast('Помилка: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  // ── Edit modules modal ────────────────────────────────────
  const ALL_MODULE_IDS = ['dashboard','clients','projects','invoices','contracts','tasks','timer','finances','tax-calendar','appointments','services','content-plan','accounts','passwords','notes','documents','api-keys','hr','warehouse','reports','support','portfolio','templates','currency','cashbook','bank','payroll','prro']
  const MODULE_LABELS  = { dashboard:'Дашборд',clients:'Клієнти',projects:'Проекти',invoices:'Рахунки',contracts:'Договори',tasks:'Задачі',timer:'Таймер',finances:'Фінанси','tax-calendar':'Податки',appointments:'Розклад',services:'Послуги','content-plan':'Контент',accounts:'Акаунти',passwords:'Паролі',notes:'Нотатки',documents:'Документи','api-keys':'API',hr:'Персонал',warehouse:'Склад',reports:'Звіти',support:'Підтримка',portfolio:'Портфоліо',templates:'Шаблони',currency:'Валюти',cashbook:'Каса',bank:'Банк',payroll:'Зарплата',prro:'ПРРО' }

  function openEditModulesModal(uid, u, parentModal) {
    parentModal?.remove()
    const current = u.selectedModules || []
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:600px">
        <div class="adm-modal-head">
          <h2>${icon('grid',18)} Модулі користувача</h2>
          <button class="adm-modal-close" id="em-close">${icon('x',14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:10px">
          <div style="display:flex;gap:8px;margin-bottom:4px">
            <button class="adm-btn adm-btn-ghost adm-btn-sm" id="em-all">Обрати всі</button>
            <button class="adm-btn adm-btn-ghost adm-btn-sm" id="em-none">Зняти всі</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px" id="em-grid">
            ${ALL_MODULE_IDS.map(id => `
              <label style="display:flex;align-items:center;gap:6px;background:var(--bg-tertiary);border:1.5px solid ${current.includes(id)?'var(--accent-blue)':'var(--border)'};border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:500;transition:border .15s">
                <input type="checkbox" value="${id}" ${current.includes(id)?'checked':''} style="display:none">
                <span>${icon(id,12)}</span>
                <span>${MODULE_LABELS[id]||id}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="em-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="em-save">Зберегти</button>
        </div>
      </div>`
    document.body.appendChild(modal)

    // Highlight checked
    modal.querySelectorAll('#em-grid label').forEach(lbl => {
      const cb = lbl.querySelector('input')
      lbl.style.borderColor = cb.checked ? 'var(--accent-blue)' : 'var(--border)'
      lbl.style.color       = cb.checked ? 'var(--accent-blue)' : ''
      cb.addEventListener('change', () => {
        lbl.style.borderColor = cb.checked ? 'var(--accent-blue)' : 'var(--border)'
        lbl.style.color       = cb.checked ? 'var(--accent-blue)' : ''
      })
    })

    modal.querySelector('#em-all').addEventListener('click',  () => modal.querySelectorAll('#em-grid input').forEach(c => { c.checked = true;  c.dispatchEvent(new Event('change')) }))
    modal.querySelector('#em-none').addEventListener('click', () => modal.querySelectorAll('#em-grid input').forEach(c => { c.checked = false; c.dispatchEvent(new Event('change')) }))
    modal.querySelector('#em-close').addEventListener('click',  () => { modal.remove(); openUserDetail(uid) })
    modal.querySelector('#em-cancel').addEventListener('click', () => { modal.remove(); openUserDetail(uid) })
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); openUserDetail(uid) } })

    modal.querySelector('#em-save').addEventListener('click', async () => {
      const btn = modal.querySelector('#em-save')
      btn.disabled = true; btn.textContent = '...'
      const selected = [...modal.querySelectorAll('#em-grid input:checked')].map(c => c.value)
      try {
        await updateDoc(doc(db, 'users', uid), { selectedModules: selected, updatedAt: serverTimestamp() })
        const idx = allUsers.findIndex(x => x.id === uid)
        if (idx !== -1) allUsers[idx].selectedModules = selected
        modal.remove(); showToast(`Модулі збережено (${selected.length})`)
        openUserDetail(uid)
      } catch (err) { showToast('Помилка: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  // ── Add/edit admin note ───────────────────────────────────
  function openAddNoteModal(uid, u, parentModal) {
    parentModal?.remove()
    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:400px">
        <div class="adm-modal-head">
          <h2>${icon('pencil',18)} Нотатка адміна</h2>
          <button class="adm-modal-close" id="an-close">${icon('x',14)}</button>
        </div>
        <div class="adm-modal-body">
          <textarea class="adm-input adm-textarea" id="an-text" rows="4" placeholder="Внутрішня нотатка про цього користувача…">${u.adminNote||''}</textarea>
          <p style="font-size:11px;color:var(--text-muted);margin-top:6px">Нотатка видна тільки адміністраторам</p>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="an-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="an-save">Зберегти</button>
        </div>
      </div>`
    document.body.appendChild(modal)
    modal.querySelector('#an-close').addEventListener('click',  () => { modal.remove(); openUserDetail(uid) })
    modal.querySelector('#an-cancel').addEventListener('click', () => { modal.remove(); openUserDetail(uid) })
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); openUserDetail(uid) } })
    modal.querySelector('#an-save').addEventListener('click', async () => {
      const note = modal.querySelector('#an-text').value.trim()
      const btn  = modal.querySelector('#an-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        await updateDoc(doc(db, 'users', uid), { adminNote: note || null })
        const idx = allUsers.findIndex(x => x.id === uid)
        if (idx !== -1) allUsers[idx].adminNote = note || null
        modal.remove(); showToast('Нотатку збережено')
        openUserDetail(uid)
      } catch (err) { showToast('Помилка: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  function metaRow(icon, label, val) {
    if (!val) return ''
    return `<div class="adm-meta-row"><span>${icon}</span><span class="adm-meta-label">${label}</span><span class="adm-meta-val">${val}</span></div>`
  }

  // ── Audit log ────────────────────────────────────────────
  async function logAdminAction(action, targetUid = null, targetName = null, details = null) {
    try {
      await addDoc(collection(db, 'adminLogs'), {
        actorUid:  user.uid,
        actorName: profile.name || user.email,
        action, targetUid, targetName, details,
        createdAt: serverTimestamp(),
      })
    } catch (err) { console.error('logAdminAction:', err) }
  }

  // ── Make admin ────────────────────────────────────────────
  async function makeAdmin(uid) {
    if (!await wbConfirm('Зробити цього користувача адміністратором?', { okLabel: 'Так, зробити адміном' })) return
    try {
      await updateDoc(doc(db, 'users', uid), { isAdmin: true })
      const u = allUsers.find(u => u.id === uid); if (u) u.isAdmin = true
      renderUsersTable(); showToast('Права адміна надано')
      logAdminAction('Призначено адміном', uid, u?.name || u?.email)
    } catch (err) { console.error(err); showToast('Помилка', 'error') }
  }

  // ── Revoke admin ──────────────────────────────────────────
  async function revokeAdmin(uid) {
    const u = allUsers.find(u => u.id === uid)
    if (!await wbConfirm(`Зняти права адміна у «${u?.name || uid}»?`, { okLabel: 'Зняти', danger: true })) return
    try {
      await updateDoc(doc(db, 'users', uid), { isAdmin: false })
      if (u) u.isAdmin = false
      renderUsersTable(); showToast('Права адміна знято')
      logAdminAction('Знято права адміна', uid, u?.name || u?.email)
    } catch (err) { console.error(err); showToast('Помилка', 'error') }
  }

  // ── Revoke plan (downgrade to FREE) ─────────────────────────
  async function revokePlan(uid) {
    const u = allUsers.find(u => u.id === uid)
    if (!await wbConfirm(`Забрати тарифний план у «${u?.name || uid}»? Користувача буде переведено на FREE.`, { okLabel: 'Забрати план', danger: true })) return
    try {
      const prevPlan = u?.plan || 'free'
      const upd = {
        plan: 'free', subscriptionEnd: null, subscriptionStatus: 'inactive',
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'users', uid), upd)
      if (u) Object.assign(u, upd)
      renderUsersTable(); renderOverview(); renderAnalytics()
      showToast('План знято, переведено на FREE')
      logAdminAction('Забрано тарифний план', uid, u?.name || u?.email)
      logSubscriptionChange(uid, {
        plan: 'free', previousPlan: prevPlan, source: 'revoke',
        changedBy: user.uid, changedByName: profile.name || user.email,
      })
    } catch (err) { console.error(err); showToast('Помилка: ' + err.message, 'error') }
  }

  // ── Delete user ───────────────────────────────────────────
  async function deleteUser(uid) {
    const u = allUsers.find(u => u.id === uid)
    const name = u?.name || u?.email || uid
    if (!await wbConfirm(
      `Видалити акаунт «${name}»?\n\nПрофіль буде видалено. Користувач не зможе увійти в систему.`,
      { okLabel: 'Видалити', danger: true }
    )) return

    try {
      await deleteDoc(doc(db, 'users', uid))
      allUsers = allUsers.filter(u => u.id !== uid)
      renderUsersTable(); renderOverview()
      showToast(`Акаунт «${name}» видалено`)
      logAdminAction('Видалено акаунт', uid, name)
    } catch (err) {
      console.error('deleteUser error:', err)
      showToast(err.message || 'Помилка видалення', 'error')
    }
  }

  // ── Ban / unban ───────────────────────────────────────────
  async function toggleBan(uid, isBanned) {
    const action = isBanned ? 'розбанити' : 'забанити'
    if (!await wbConfirm(`Ви впевнені що хочете ${action} цього користувача?`, { okLabel: isBanned ? 'Розбанити' : 'Забанити', danger: !isBanned })) return
    try {
      await updateDoc(doc(db, 'users', uid), { isBanned: !isBanned, updatedAt: serverTimestamp() })
      const u = allUsers.find(u => u.id === uid); if (u) u.isBanned = !isBanned
      renderUsersTable(); renderOverview()
      showToast(isBanned ? 'Користувача розбановано' : 'Користувача забановано')
      logAdminAction(isBanned ? 'Розбановано' : 'Забановано', uid, u?.name || u?.email)
    } catch (err) { console.error(err); showToast('Помилка', 'error') }
  }

  // ── Change plan modal ─────────────────────────────────────
  function openChangePlanModal(uid, currentPlan) {
    const u = allUsers.find(u => u.id === uid); if (!u) return

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:420px">
        <div class="adm-modal-head">
          <h2>${icon('edit', 18)} Змінити план</h2>
          <button class="adm-modal-close" id="cp-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:14px">
          <div class="adm-user-cell" style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
            <div class="adm-avatar">${(u.name || '?')[0].toUpperCase()}</div>
            <div>
              <div class="adm-user-name">${u.name || '—'}</div>
              <div class="adm-user-email">${u.email || u.id}</div>
            </div>
          </div>
          <div class="adm-plan-picker">
            ${Object.entries(PLAN_META).map(([plan, m]) => `
              <button class="adm-plan-pick ${currentPlan === plan ? 'active' : ''}" data-plan="${plan}" style="--pc:${m.color}">
                <div class="adm-plan-pick-name" style="color:${m.color}">${m.label}</div>
                <div class="adm-plan-pick-price">₴${m.price}/міс</div>
              </button>`).join('')}
          </div>
          <div class="adm-field">
            <label>Підписка до</label>
            <input type="date" class="adm-input" id="cp-end" value="${(() => { const r = u.subscriptionEnd ?? u.planExpiresAt; if (!r) return nextMonth(); const d = r?.toDate ? r.toDate() : new Date(r); return isNaN(d) ? nextMonth() : d.toISOString().split('T')[0] })()}">
          </div>
          <div class="adm-field">
            <label>Коментар (необов'язково)</label>
            <input type="text" class="adm-input" id="cp-reason" placeholder="Вручну, промо, тест...">
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="cp-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="cp-save">Зберегти</button>
        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#cp-close').addEventListener('click',  () => modal.remove())
    modal.querySelector('#cp-cancel').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

    let selectedPlan = currentPlan
    modal.querySelectorAll('.adm-plan-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.adm-plan-pick').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        selectedPlan = btn.dataset.plan
      })
    })

    modal.querySelector('#cp-save').addEventListener('click', async () => {
      const endDate = modal.querySelector('#cp-end').value
      const btn     = modal.querySelector('#cp-save')
      btn.disabled  = true; btn.textContent = '...'
      try {
        const upd = {
          plan: selectedPlan, subscriptionEnd: endDate ? new Date(endDate).toISOString() : null,
          subscriptionStatus: selectedPlan === 'free' ? 'inactive' : 'active',
          updatedAt: serverTimestamp(), adminNote: modal.querySelector('#cp-reason').value.trim() || null,
        }
        await updateDoc(doc(db, 'users', uid), upd)
        const idx = allUsers.findIndex(u => u.id === uid)
        if (idx !== -1) Object.assign(allUsers[idx], upd)
        if (uid === user.uid) updateProfileCache(uid, upd)
        modal.remove(); renderUsersTable(); renderOverview(); renderAnalytics()
        showToast(`План змінено на ${selectedPlan.toUpperCase()}`)
        logAdminAction(`Змінено план на ${selectedPlan.toUpperCase()}`, uid, u.name || u.email)
        logSubscriptionChange(uid, {
          plan: selectedPlan, previousPlan: currentPlan, source: 'admin',
          months: null, changedBy: user.uid, changedByName: profile.name || user.email,
          note: modal.querySelector('#cp-reason').value.trim() || null,
        })
      } catch (err) { console.error(err); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  // ═══════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════
  function renderPayments() {
    const filtered = allPayments.filter(p => p.status === payFilter)
    const el = container.querySelector('#payments-list')
    container.querySelector('#pay-count-label').textContent = `${filtered.length} записів`

    if (!filtered.length) {
      el.innerHTML = `<div class="adm-empty">${payFilter === 'pending' ? 'Немає платежів на перевірці' : 'Немає записів'}</div>`
      return
    }

    el.innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th>Користувач</th><th>План</th><th>Термін</th><th>Сума</th><th>Крипто</th><th>Дата</th><th>ID платежу</th>
          <th>${payFilter === 'pending' ? 'Дії' : 'Статус'}</th>
        </tr></thead>
        <tbody>
          ${filtered.map(p => {
            const u    = allUsers.find(u => u.id === p.userId)
            const date = p.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const pm   = PLAN_META[p.planId||'pro'] || PLAN_META.pro
            return `
              <tr>
                <td>
                  <div class="adm-user-cell">
                    <div class="adm-avatar" style="width:30px;height:30px;font-size:12px">${(u?.name||'?')[0].toUpperCase()}</div>
                    <div>
                      <div class="adm-user-name">${u?.name||'—'}</div>
                      <div class="adm-user-email">${u?.email||p.userId.slice(0,12)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="adm-plan-pill" style="color:${pm.color};background:${pm.color}18">${pm.label}</span></td>
                <td style="font-size:12px;color:var(--text-muted)">${p.months || 1} міс</td>
                <td><strong>₴${p.amount}</strong></td>
                <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${p.cryptoAmount ? `${p.cryptoAmount} ${p.currency||''}` : '—'}</td>
                <td>${date}</td>
                <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${(p.paymentId||p.id).slice(0,16)}…</td>
                <td>
                  ${payFilter === 'pending'
                    ? `<div class="adm-action-btns">
                        <button class="adm-action-btn adm-btn-approve" data-pid="${p.id}" data-uid="${p.userId}" data-plan="${p.planId||'pro'}">${icon('check', 13)} Підтвердити</button>
                        <button class="adm-action-btn adm-btn-rej"     data-pid="${p.id}" data-uid="${p.userId}">${icon('x', 13)}</button>
                       </div>`
                    : `<span class="adm-status-chip adm-status-${p.status}">${p.status==='approved'?icon('check',11)+' Підтверджено':icon('x',11)+' Відхилено'}</span>`
                  }
                </td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    el.querySelectorAll('.adm-btn-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Підтвердити платіж і активувати підписку?')) return
        btn.disabled = true; btn.textContent = '...'
        try {
          const p0 = allPayments.find(p => p.id === btn.dataset.pid)
          const months = p0?.months || 1
          const endDate = addMonths(new Date(), months)
          await Promise.all([
            updateDoc(doc(db, 'users', btn.dataset.uid), { plan: btn.dataset.plan||'pro', subscriptionEnd: endDate.toISOString(), subscriptionStatus: 'active', updatedAt: serverTimestamp() }),
            updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: user.uid }),
          ])
          const p = allPayments.find(p => p.id === btn.dataset.pid); if (p) p.status = 'approved'
          const u = allUsers.find(u => u.id === btn.dataset.uid)
          const prevPlan = u?.plan || 'free'
          if (u) { u.plan = btn.dataset.plan||'pro'; u.subscriptionStatus = 'active' }
          renderPayments(); renderOverview(); renderAnalytics()
          showToast('Підписку активовано')
          logSubscriptionChange(btn.dataset.uid, {
            plan: btn.dataset.plan || 'pro', previousPlan: prevPlan, source: 'payment',
            amount: p0?.amount || null, months, changedBy: user.uid, changedByName: profile.name || user.email,
          })
        } catch (err) { console.error(err); btn.disabled = false; btn.innerHTML = icon('check', 13) + ' Підтвердити' }
      })
    })

    el.querySelectorAll('.adm-btn-rej').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Відхилити цей платіж?')) return
        try {
          await updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), { status: 'rejected', rejectedAt: serverTimestamp(), rejectedBy: user.uid })
          const p = allPayments.find(p => p.id === btn.dataset.pid); if (p) p.status = 'rejected'
          renderPayments(); renderOverview()
        } catch (err) { console.error(err) }
      })
    })
  }

  // ═══════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════
  function renderTickets() {
    let list = allTickets
    if (ticketTypeFilter   !== 'all') list = list.filter(t => t.type   === ticketTypeFilter)
    if (ticketStatusFilter !== 'all') list = list.filter(t => t.status === ticketStatusFilter)

    const el = container.querySelector('#tickets-list')
    container.querySelector('#ticket-count-label').textContent = `${list.length} заявок`

    if (!list.length) {
      el.innerHTML = '<div class="adm-empty">Заявок не знайдено</div>'
      return
    }

    el.innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th>Тип</th><th>Заголовок</th><th>Від</th>
          <th>Пріоритет</th><th>Статус</th><th>Дата</th><th>Відп.</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(t => {
            const tm = TICKET_TYPE_META[t.type]         || TICKET_TYPE_META.support
            const sm = TICKET_STATUS_META[t.status]     || TICKET_STATUS_META.new
            const pm = TICKET_PRIORITY_META[t.priority] || TICKET_PRIORITY_META.medium
            const date = t.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const replyCnt = t.replies?.length || 0
            const isNew = t.status === 'new'
            return `
              <tr style="cursor:pointer${isNew ? ';font-weight:600' : ''}" data-tid="${t.id}">
                <td><span class="adm-plan-pill" style="color:${tm.color};background:${tm.bg}">${icon(tm.iconName, 12)} ${tm.label}</span></td>
                <td style="max-width:260px">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
                  ${isNew ? '<span style="font-size:10px;color:#4F8EF7;font-weight:800">● НОВА</span>' : ''}
                </td>
                <td>
                  <div style="font-size:13px">${esc(t.userName || '—')}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${esc(t.userEmail || '')} ${t.appVersion ? `· v${esc(t.appVersion)}` : ''}</div>
                </td>
                <td style="color:${pm.color};font-size:12px;font-weight:700">● ${pm.label}</td>
                <td style="color:${sm.color};font-size:12px;font-weight:700">${icon(sm.iconName, 12)} ${sm.label}</td>
                <td style="font-size:12px">${date}</td>
                <td style="font-size:12px;color:var(--text-muted)">${replyCnt > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px">${icon('message-circle', 12)} ${replyCnt}</span>` : '—'}</td>
                <td>
                  <button class="adm-action-btn adm-btn-delete" data-tid="${t.id}" data-action="del-ticket" title="Видалити заявку">${icon('trash', 12)}</button>
                </td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    el.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('[data-action="del-ticket"]')) return
        openTicketDetailAdmin(row.dataset.tid)
      })
    })

    el.querySelectorAll('[data-action="del-ticket"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const t = allTickets.find(x => x.id === btn.dataset.tid)
        if (!await wbConfirm(`Видалити заявку "${t?.title || ''}"? Цю дію не можна скасувати.`, { okLabel: 'Видалити', danger: true })) return
        try {
          await deleteDoc(doc(db, 'tickets', btn.dataset.tid))
          allTickets = allTickets.filter(x => x.id !== btn.dataset.tid)
          renderTickets()
          showToast('Заявку видалено')
          logAdminAction('Видалено заявку підтримки', null, t?.title)
        } catch (err) { showToast('Помилка: ' + err.message, 'error') }
      })
    })
  }

  function openTicketDetailAdmin(ticketId) {
    const t = allTickets.find(t => t.id === ticketId)
    if (!t) return
    const tm = TICKET_TYPE_META[t.type]         || TICKET_TYPE_META.support
    const sm = TICKET_STATUS_META[t.status]     || TICKET_STATUS_META.new
    const pm = TICKET_PRIORITY_META[t.priority] || TICKET_PRIORITY_META.medium
    const date = t.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal adm-modal-lg" style="max-width:700px">
        <div class="adm-modal-head" style="flex-wrap:wrap;gap:8px">
          <span class="adm-plan-pill" style="color:${tm.color};background:${tm.bg};font-size:12px">${icon(tm.iconName, 12)} ${tm.label}</span>
          <h2 style="font-family:var(--font-display);font-size:17px;font-weight:800;flex:1;min-width:0">${esc(t.title)}</h2>
          <button class="adm-btn adm-btn-danger adm-btn-sm" id="tad-delete">${icon('trash',12)} Видалити</button>
          <button class="adm-modal-close" id="tad-close">${icon('x', 14)}</button>
        </div>

        <div style="display:flex;align-items:center;gap:12px;padding:10px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap">
          <span style="color:${sm.color};font-size:12px;font-weight:700">${icon(sm.iconName, 12)} ${sm.label}</span>
          <span style="color:${pm.color};font-size:12px;font-weight:700">● ${pm.label}</span>
          <span style="font-size:12px;color:var(--text-muted)">${esc(t.userName||'—')} · ${esc(t.userEmail||'')}</span>
          ${t.appVersion ? `<span style="font-size:11px;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 8px;border-radius:99px;font-family:monospace">v${esc(t.appVersion)}</span>` : ''}
          <span style="font-size:12px;color:var(--text-muted)">${date}</span>
          <div style="margin-left:auto;display:flex;gap:6px" id="tad-status-btns">
            ${Object.entries(TICKET_STATUS_META).map(([id, m]) => `
              <button class="adm-action-btn ${t.status === id ? 'adm-btn-approve' : ''}" data-set-status="${id}" style="font-size:11px;display:inline-flex;align-items:center;gap:4px">${icon(m.iconName, 11)} ${m.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="adm-modal-body" style="max-height:420px;overflow-y:auto;gap:12px;padding:16px 24px" id="tad-thread">
          <!-- Original -->
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-lg);padding:14px">
            <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-muted)">${esc(t.userName||'Користувач')}</div>
            <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${esc(t.description)}</div>
            ${(t.attachments||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${t.attachments.map(a => `<a href="${a.url}" target="_blank"><img src="${a.url}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></a>`).join('')}</div>` : ''}
          </div>
          ${(t.replies || []).map(r => `
            <div style="background:${r.fromAdmin ? 'rgba(79,142,247,.08)' : 'var(--bg-tertiary)'};border:1px solid ${r.fromAdmin ? 'rgba(79,142,247,.2)' : 'var(--border)'};border-radius:var(--radius-lg);padding:14px;${r.fromAdmin ? 'margin-left:24px' : 'margin-right:24px'}">
              <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:${r.fromAdmin ? 'var(--accent-blue)' : 'var(--text-muted)'}">
                ${r.fromAdmin ? icon('shield', 12) + ' ' : ''}${esc(r.authorName || (r.fromAdmin ? 'Адмін' : 'Користувач'))}
                ${r.fromAdmin ? '<span style="font-size:10px;background:rgba(79,142,247,.15);color:var(--accent-blue);padding:1px 6px;border-radius:99px;margin-left:4px">Адмін</span>' : ''}
              </div>
              <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${esc(r.text)}</div>
              ${(r.attachments||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${r.attachments.map(a => `<a href="${a.url}" target="_blank"><img src="${a.url}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></a>`).join('')}</div>` : ''}
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${r.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'}</div>
            </div>
          `).join('')}
        </div>

        <div class="adm-modal-foot" style="flex-direction:column;gap:10px;align-items:stretch">
          ${allTemplates.length ? `
          <select class="adm-input adm-select" id="tad-template-sel" style="font-size:12px">
            <option value="">— Вставити шаблон відповіді —</option>
            ${allTemplates.map(tpl => `<option value="${tpl.id}">${esc(tpl.name)}</option>`).join('')}
          </select>` : ''}
          <textarea class="adm-input adm-textarea" id="tad-reply" placeholder="Написати відповідь користувачеві… (Ctrl+V щоб вставити скріншот)" rows="3" style="min-height:70px"></textarea>
          <div id="tad-attach-previews" style="display:flex;flex-wrap:wrap;gap:8px"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <input type="file" id="tad-attach-files" multiple accept="image/*" style="display:none">
            <button type="button" class="adm-btn adm-btn-ghost" id="tad-attach-btn" style="margin-right:auto">${icon('image', 13)} Фото</button>
            <button class="adm-btn adm-btn-ghost" id="tad-cancel">Закрити</button>
            <button class="adm-btn adm-btn-primary" id="tad-send">${icon('send', 14)} Надіслати відповідь</button>
          </div>
        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#tad-close').addEventListener('click',  () => modal.remove())
    modal.querySelector('#tad-cancel').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
    modal.querySelector('#tad-delete').addEventListener('click', async () => {
      if (!await wbConfirm(`Видалити заявку "${t.title}"? Цю дію не можна скасувати.`, { okLabel: 'Видалити', danger: true })) return
      try {
        await deleteDoc(doc(db, 'tickets', ticketId))
        allTickets = allTickets.filter(x => x.id !== ticketId)
        modal.remove()
        renderTickets()
        showToast('Заявку видалено')
        logAdminAction('Видалено заявку підтримки', null, t.title)
      } catch (err) { showToast('Помилка: ' + err.message, 'error') }
    })

    // Status change
    modal.querySelector('#tad-status-btns').addEventListener('click', async e => {
      const btn = e.target.closest('[data-set-status]')
      if (!btn) return
      const newStatus = btn.dataset.setStatus
      try {
        await updateDoc(doc(db, 'tickets', ticketId), { status: newStatus, updatedAt: serverTimestamp() })
        const idx = allTickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) allTickets[idx].status = newStatus
        modal.remove()
        renderTickets()
        showToast(`Статус змінено: ${TICKET_STATUS_META[newStatus]?.label}`)
      } catch (err) { console.error(err) }
    })

    // ── Attach photos to reply ─────────────────────────────────
    let tadFiles = []
    function addTadPreview(file) {
      const wrap = modal.querySelector('#tad-attach-previews')
      const item = document.createElement('div')
      item.style.position = 'relative'
      const reader = new FileReader()
      reader.onload = e => {
        item.innerHTML = `
          <img src="${e.target.result}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
          <button type="button" data-filename="${file.name}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#EF4444;color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon('x', 10)}</button>
        `
        item.querySelector('button').addEventListener('click', () => {
          tadFiles = tadFiles.filter(f => f.name !== file.name)
          item.remove()
        })
      }
      reader.readAsDataURL(file)
      wrap.appendChild(item)
    }
    modal.querySelector('#tad-template-sel')?.addEventListener('change', e => {
      const tpl = allTemplates.find(t => t.id === e.target.value)
      if (tpl) {
        const textarea = modal.querySelector('#tad-reply')
        textarea.value = textarea.value ? `${textarea.value}\n${tpl.text}` : tpl.text
        e.target.value = ''
        textarea.focus()
      }
    })
    modal.querySelector('#tad-attach-btn').addEventListener('click', () => modal.querySelector('#tad-attach-files').click())
    modal.querySelector('#tad-attach-files').addEventListener('change', e => {
      Array.from(e.target.files).forEach(file => {
        if (tadFiles.some(f => f.name === file.name && f.size === file.size)) return
        tadFiles.push(file)
        addTadPreview(file)
      })
      e.target.value = ''
    })
    modal.querySelector('#tad-reply').addEventListener('paste', e => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgs  = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
      if (!imgs.length) return
      e.preventDefault()
      imgs.forEach((file, i) => {
        const named = new File([file], file.name || `screenshot_${Date.now()}_${i}.png`, { type: file.type })
        if (tadFiles.some(f => f.name === named.name && f.size === named.size)) return
        tadFiles.push(named)
        addTadPreview(named)
      })
    })

    // Send reply
    modal.querySelector('#tad-send').addEventListener('click', async () => {
      const text = modal.querySelector('#tad-reply').value.trim()
      if (!text && !tadFiles.length) { modal.querySelector('#tad-reply').focus(); return }
      const btn = modal.querySelector('#tad-send')
      btn.disabled = true; btn.textContent = '...'
      try {
        const attachments = await Promise.all(tadFiles.map(file => uploadToCloudinary(file)))
        const reply = {
          text,
          attachments,
          fromAdmin: true,
          authorName: profile.name || user.email,
          createdAt: new Date(),
        }
        const newStatus = t.status === 'new' || t.status === 'open' ? 'in_progress' : t.status
        await updateDoc(doc(db, 'tickets', ticketId), {
          replies: arrayUnion(reply),
          status: newStatus,
          updatedAt: serverTimestamp(),
        })
        const idx = allTickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) {
          allTickets[idx].replies = [...(allTickets[idx].replies || []), reply]
          allTickets[idx].status  = newStatus
        }
        modal.remove()
        renderTickets()
        showToast('Відповідь надіслано')
      } catch (err) { console.error(err); btn.disabled = false; btn.innerHTML = icon('send', 14) + ' Надіслати відповідь' }
    })
  }

  function esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ═══════════════════════════════════════════════════════════
  // ANNOUNCEMENTS
  // ═══════════════════════════════════════════════════════════
  function renderAnnouncements() {
    const el = container.querySelector('#notif-history')
    if (!allAnnouncements.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px 0">Повідомлень ще немає</div>'
      return
    }
    const typeIcon = { info: icon('info',14), success: icon('check-circle',14), warning: icon('warning',14), error: icon('x-circle',14) }
    const targetLabel = { all: 'Всі', free: 'FREE', pro: 'PRO', business: 'BUSINESS', paid: 'Платні' }
    el.innerHTML = allAnnouncements.map(n => {
      const date = n.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
      return `
        <div class="adm-notif-item adm-notif-${n.type||'info'}">
          <div class="adm-notif-item-head">
            <span class="adm-notif-type-icon">${typeIcon[n.type]||icon('info',14)}</span>
            <span class="adm-notif-item-title">${n.title}</span>
            <span class="adm-notif-target">${targetLabel[n.target]||n.target}</span>
            <span class="adm-notif-date">${date}</span>
            <button class="adm-notif-del" data-id="${n.id}" title="Видалити">${icon('x', 12)}</button>
          </div>
          <div class="adm-notif-item-body">${n.body}</div>
          <div class="adm-notif-by">Відправив: ${n.createdByName || '—'}</div>
        </div>`
    }).join('')

    el.querySelectorAll('.adm-notif-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await deleteDoc(doc(db, 'announcements', btn.dataset.id))
          allAnnouncements = allAnnouncements.filter(n => n.id !== btn.dataset.id)
          renderAnnouncements()
        } catch (err) { console.error(err) }
      })
    })
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT CSV
  // ═══════════════════════════════════════════════════════════
  function exportCSV() {
    const headers = ['UID', 'Ім\'я', 'Email', 'Бізнес', 'Ніша', 'План', 'Підписка до', 'Зареєстрований', 'Забанований']
    const rows = allUsers.map(u => [
      u.id, u.name||'', u.email||'', u.businessName||'', u.profession||'',
      u.plan||'free', (() => { const r = u.subscriptionEnd ?? u.planExpiresAt; if (!r) return ''; const d = r?.toDate ? r.toDate() : new Date(r); return isNaN(d) ? '' : d.toLocaleDateString('uk-UA') })(),
      u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '',
      u.isBanned ? 'Так' : 'Ні',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `workhub-users-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    showToast('CSV експортовано')
  }

  // ── Helpers ───────────────────────────────────────────────
  function profLabel(id) {
    return { freelancer:'Фрілансер', accountant:'Бухгалтер', smm:'SMM', beauty:'Салон' }[id] || '—'
  }
  function nicheIcon(id) {
    return icon({ freelancer:'laptop', accountant:'bar-chart', smm:'smartphone', beauty:'sparkles' }[id] || 'briefcase', 14)
  }
  function nextMonth() {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]
  }
  function showToast(msg, type = 'success') {
    document.getElementById('adm-toast')?.remove()
    const el = document.createElement('div')
    el.id = 'adm-toast'
    el.className = `adm-toast adm-toast-${type}`
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 2800)
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('admin-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'admin-styles'
  s.textContent = `
    .adm-page    { padding: 28px 36px; max-width: 1300px; }
    .adm-header  { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px; gap:16px; }
    .adm-title   { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; }
    .adm-subtitle{ font-size:13px; color:var(--text-muted); }
    .adm-header-right { display:flex; gap:10px; align-items:center; }
    .adm-badge   { font-size:12px; font-weight:600; padding:5px 14px; background:rgba(239,68,68,.12); color:#F87171; border-radius:var(--radius-full); border:1px solid rgba(239,68,68,.2); }
    .adm-refresh-btn { font-size:13px; font-weight:600; padding:5px 14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all .15s; color:var(--text-secondary); }
    .adm-refresh-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }

    .adm-global-search { position:relative; display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); color:var(--text-muted); min-width:240px; }
    .adm-global-search input { background:none; border:none; outline:none; color:var(--text-primary); font-size:13px; flex:1; min-width:0; }
    .adm-global-search-dropdown { position:absolute; top:100%; left:0; right:0; margin-top:6px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-xl); z-index:50; max-height:360px; overflow-y:auto; }
    .adm-gsr-item { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; transition:background .15s; }
    .adm-gsr-item:hover { background:var(--bg-tertiary); }
    .adm-gsr-empty { padding:14px; font-size:13px; color:var(--text-muted); text-align:center; }

    .adm-bulk-bar { display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:12px; background:rgba(79,142,247,.08); border:1px solid rgba(79,142,247,.25); border-radius:var(--radius-md); font-size:13px; font-weight:600; }
    .adm-row-checkbox { width:16px; height:16px; cursor:pointer; }

    /* Tabs */
    .adm-tabs  { display:flex; gap:4px; margin-bottom:22px; background:var(--bg-secondary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border); width:fit-content; }
    .adm-tab   { display:flex; align-items:center; gap:6px; padding:7px 18px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; background:none; transition:all .15s; white-space:nowrap; }
    .adm-tab:hover  { color:var(--text-primary); }
    .adm-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    /* Stats row */
    .adm-stats-row  { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }
    .adm-stat-card  { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 16px; }
    .adm-online-dot { display:inline-block; width:10px; height:10px; border-radius:50%; background:#34D399; box-shadow:0 0 0 0 rgba(52,211,153,.6); animation:adm-pulse 2s infinite; }
    @keyframes adm-pulse { 0%{box-shadow:0 0 0 0 rgba(52,211,153,.6)} 70%{box-shadow:0 0 0 8px rgba(52,211,153,0)} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} }
    .adm-stat-blue   { border-color:rgba(79,142,247,.3); }
    .adm-stat-purple { border-color:rgba(167,139,250,.3); }
    .adm-stat-green  { border-color:rgba(52,211,153,.3); }
    .adm-stat-orange { border-color:rgba(245,158,11,.3); }
    .adm-stat-icon   { display:flex; align-items:center; margin-bottom:8px; color:var(--text-secondary); }
    .adm-stat-val    { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:3px; line-height:1; }
    .adm-stat-lbl    { font-size:11px; color:var(--text-muted); }
    .adm-skel        { height:90px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); animation:skel-pulse 1.4s ease infinite; }
    @keyframes skel-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Overview grid */
    .adm-overview-grid { display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:14px; }
    .adm-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:20px; }
    .adm-card-wide { grid-column: 1/-1; }
    .adm-card-title { font-family:var(--font-display); font-size:15px; font-weight:700; margin-bottom:16px; }

    /* Activity bars */
    .adm-activity-bars { display:flex; align-items:flex-end; gap:6px; height:80px; }
    .adm-act-col  { display:flex; flex-direction:column; align-items:center; gap:2px; flex:1; }
    .adm-act-bar-wrap { flex:1; width:100%; display:flex; align-items:flex-end; }
    .adm-act-bar  { width:100%; min-height:3px; background:var(--accent-blue); border-radius:3px 3px 0 0; opacity:.8; }
    .adm-act-count{ font-size:10px; font-weight:700; color:var(--text-muted); }
    .adm-act-label{ font-size:9px; color:var(--text-muted); text-transform:capitalize; }

    /* Breakdown */
    .adm-break-row   { display:flex; align-items:center; gap:10px; padding:7px 0; }
    .adm-break-label { font-size:12px; font-weight:700; width:80px; flex-shrink:0; }
    .adm-break-bar-wrap { flex:1; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden; }
    .adm-break-bar   { height:100%; border-radius:3px; transition:width .5s; }
    .adm-break-count { font-size:12px; color:var(--text-secondary); width:70px; text-align:right; flex-shrink:0; }

    /* Analytics */
    .adm-an-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .adm-chart-wrap { overflow-x:auto; }
    .adm-reg-chart { display:flex; align-items:flex-end; gap:3px; height:100px; padding-bottom:18px; min-width:500px; }
    .adm-reg-col   { display:flex; flex-direction:column; align-items:center; flex:1; min-width:14px; }
    .adm-reg-bar   { width:100%; background:linear-gradient(180deg,#4F8EF7,#667eea); border-radius:3px 3px 0 0; min-height:3px; transition:height .3s; }
    .adm-reg-label { font-size:9px; color:var(--text-muted); margin-top:4px; white-space:nowrap; }
    .adm-ret-chart { display:flex; align-items:flex-end; gap:10px; height:120px; padding-bottom:18px; }
    .adm-ret-col   { display:flex; flex-direction:column; align-items:center; flex:1; height:100%; }
    .adm-ret-bar-wrap { flex:1; width:100%; display:flex; align-items:flex-end; }
    .adm-ret-bar   { width:100%; background:linear-gradient(180deg,#34D399,#10B981); border-radius:5px 5px 0 0; min-height:2px; position:relative; transition:height .5s cubic-bezier(.34,1.56,.64,1); }
    .adm-ret-tip   { position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:700; white-space:nowrap; }
    .adm-ret-label { font-size:11px; color:var(--text-muted); margin-top:6px; }
    .adm-rev-total { font-family:var(--font-display); font-size:32px; font-weight:800; margin-bottom:14px; }
    .adm-conv-ring { position:relative; width:100px; height:100px; margin:8px auto 12px; }
    .adm-ring-svg  { width:100%; height:100%; transform:rotate(-90deg); }
    .adm-ring-val  { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:18px; font-weight:800; }
    .adm-conv-row  { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
    .adm-conv-row:last-child { border:none; }

    /* Toolbar */
    .adm-toolbar     { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .adm-search      { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:9px 14px; flex:1; max-width:400px; transition:border-color .15s; }
    .adm-search:focus-within { border-color:var(--accent-blue); }
    .adm-search input { flex:1; background:none; font-size:14px; color:var(--text-primary); outline:none; }
    .adm-search input::placeholder { color:var(--text-muted); }
    .adm-select      { padding:8px 12px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); cursor:pointer; }
    .adm-count-label { font-size:13px; color:var(--text-muted); white-space:nowrap; }
    .adm-filter-pills { display:flex; gap:6px; }
    .adm-pill { padding:6px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .adm-pill:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .adm-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Table */
    .adm-table     { width:100%; border-collapse:collapse; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
    .adm-table th  { text-align:left; padding:11px 14px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--bg-tertiary); border-bottom:1px solid var(--border); }
    .adm-table td  { padding:11px 14px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .adm-table tr:last-child td { border-bottom:none; }
    .adm-table tr:hover td { background:rgba(255,255,255,.02); }
    .adm-row-banned td { opacity:.6; }

    .adm-user-cell   { display:flex; align-items:center; gap:10px; }
    .adm-avatar      { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .adm-avatar-banned { filter:grayscale(1); opacity:.7; }
    .adm-user-name   { font-weight:600; font-size:13px; }
    .adm-user-email  { font-size:11px; color:var(--text-muted); }
    .adm-user-row    { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
    .adm-user-row:last-child { border-bottom:none; }
    .adm-user-info   { flex:1; min-width:0; }
    .adm-plan-pill   { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); white-space:nowrap; }
    .adm-plan-pill-lg { font-size:13px; padding:5px 14px; }
    .adm-admin-badge { display:inline-flex; font-size:10px; font-weight:800; padding:2px 7px; background:rgba(245,158,11,.15); color:#F59E0B; border-radius:var(--radius-full); margin-left:6px; }
    .adm-banned-badge { display:inline-flex; font-size:10px; font-weight:800; padding:2px 7px; background:rgba(239,68,68,.15); color:#F87171; border-radius:var(--radius-full); margin-left:6px; }
    .adm-action-btns { display:flex; gap:5px; align-items:center; }
    .adm-action-btn  { font-size:11px; font-weight:600; padding:4px 9px; border-radius:var(--radius-sm); cursor:pointer; transition:all .15s; border:1px solid var(--border); background:var(--bg-tertiary); white-space:nowrap; }
    .adm-action-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }
    .adm-btn-approve:hover,.adm-btn-approve { color:#34D399; border-color:rgba(52,211,153,.4); }
    .adm-btn-rej:hover     { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-btn-ban:hover     { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-btn-unban:hover   { color:#34D399; border-color:rgba(52,211,153,.4); }
    .adm-btn-admin:hover   { color:#F59E0B; border-color:rgba(245,158,11,.4); }
    .adm-btn-revoke:hover  { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-btn-delete:hover  { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-status-chip { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .adm-status-approved { background:rgba(52,211,153,.12); color:#34D399; }
    .adm-status-rejected { background:rgba(239,68,68,.12); color:#F87171; }

    /* Buttons */
    .adm-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; border:none; transition:all .15s; }
    .adm-btn-primary { background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; }
    .adm-btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .adm-btn-primary:disabled { opacity:.6; transform:none; box-shadow:none; }
    .adm-btn-ghost { background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); }
    .adm-btn-ghost:hover { border-color:var(--accent-blue); }
    .adm-btn-danger { background:rgba(239,68,68,.15); color:#F87171; border:1.5px solid rgba(239,68,68,.3); }
    .adm-btn-danger:hover { background:rgba(239,68,68,.25); }
    .adm-btn-success { background:rgba(52,211,153,.15); color:#34D399; border:1.5px solid rgba(52,211,153,.3); }
    .adm-btn-success:hover { background:rgba(52,211,153,.25); }
    .adm-btn-warning { background:rgba(245,158,11,.15); color:#F59E0B; border:1.5px solid rgba(245,158,11,.3); }
    .adm-btn-warning:hover { background:rgba(245,158,11,.25); }
    .adm-btn-secondary { background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); }
    .adm-btn-secondary:hover { border-color:var(--accent-blue); }

    /* Modals */
    .adm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:2000; padding:24px; }
    .adm-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow-xl); animation:adm-in .2s cubic-bezier(.34,1.2,.64,1); }
    .adm-modal-lg { max-width:840px; }
    @keyframes adm-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .adm-modal-head { display:flex; align-items:center; justify-content:space-between; padding:22px 24px 0; flex-shrink:0; }
    .adm-modal-head h2 { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .adm-modal-close { background:none; border:none; font-size:14px; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; transition:all .15s; }
    .adm-modal-close:hover { background:var(--bg-tertiary); color:var(--text-primary); }
    .adm-modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; flex:1; }
    .adm-modal-foot { display:flex; gap:10px; justify-content:flex-end; padding:14px 24px; border-top:1px solid var(--border); flex-shrink:0; }
    .adm-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .adm-input { width:100%; box-sizing:border-box; padding:10px 14px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:14px; color:var(--text-primary); outline:none; transition:border-color .15s; font-family:inherit; }
    .adm-input:focus { border-color:var(--accent-blue); }
    .adm-pay-config { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px 24px; margin-bottom:4px; }
    .adm-textarea { resize:vertical; min-height:80px; }

    /* Plan picker */
    .adm-plan-picker { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .adm-plan-pick   { padding:12px; border-radius:var(--radius-md); background:var(--bg-tertiary); border:2px solid var(--border); cursor:pointer; transition:all .15s; text-align:center; }
    .adm-plan-pick:hover { border-color:var(--pc,var(--border)); }
    .adm-plan-pick.active { border-color:var(--pc); background:color-mix(in srgb,var(--pc) 10%,var(--bg-tertiary)); }
    .adm-plan-pick-name  { font-size:13px; font-weight:800; margin-bottom:3px; }
    .adm-plan-pick-price { font-size:11px; color:var(--text-muted); }

    /* User detail */
    .adm-detail-body  { display:grid; grid-template-columns:220px 1fr; gap:20px; }
    .adm-detail-left  { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; }
    .adm-detail-avatar{ width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:30px; font-weight:800; display:flex; align-items:center; justify-content:center; }
    .adm-detail-name  { font-size:17px; font-weight:800; }
    .adm-detail-email { font-size:12px; color:var(--text-muted); word-break:break-all; }
    .adm-detail-meta  { width:100%; margin-top:8px; }
    .adm-meta-row     { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; }
    .adm-meta-row:last-child { border:none; }
    .adm-sub-history  { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .adm-sub-hist-row { display:flex; flex-direction:column; gap:3px; padding:8px 10px; background:var(--bg-tertiary); border-radius:var(--radius-md); }
    .adm-meta-label   { color:var(--text-muted); width:70px; flex-shrink:0; }
    .adm-meta-val     { flex:1; text-align:left; font-weight:500; overflow:hidden; text-overflow:ellipsis; }
    .adm-detail-actions { display:flex; flex-direction:column; gap:8px; width:100%; margin-top:8px; }
    .adm-btn-secondary  { background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); }
    .adm-btn-secondary:hover { border-color:var(--accent-blue); color:var(--accent-blue); }
    .adm-btn-sm         { padding:4px 10px; font-size:11px; font-weight:600; }
    .adm-admin-note     { font-size:12px; color:#F59E0B; background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.25); border-radius:8px; padding:8px 12px; margin-top:10px; display:flex; align-items:flex-start; gap:6px; line-height:1.5; }
    .adm-detail-uid     { display:flex; align-items:center; gap:8px; justify-content:space-between; background:var(--bg-tertiary); border-radius:8px; padding:8px 12px; margin-bottom:12px; }
    .adm-detail-section { font-size:13px; font-weight:700; color:var(--text-secondary); border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px; }
    .adm-biz-list     { display:flex; flex-direction:column; gap:8px; }
    .adm-biz-item     { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--bg-tertiary); border-radius:var(--radius-md); }
    .adm-biz-main     { border:1px solid rgba(79,142,247,.3); }
    .adm-biz-icon     { display:flex; align-items:center; flex-shrink:0; color:var(--text-secondary); }
    .adm-biz-name     { font-size:13px; font-weight:600; }
    .adm-biz-niche    { font-size:11px; color:var(--text-muted); }
    .adm-biz-badge    { font-size:10px; font-weight:800; padding:2px 8px; background:rgba(79,142,247,.15); color:var(--accent-blue); border-radius:var(--radius-full); margin-left:auto; }
    .adm-modules-wrap { display:flex; flex-wrap:wrap; gap:6px; }
    .adm-mod-chip     { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-full); background:var(--bg-tertiary); border:1px solid var(--border); }

    /* Notifications */
    .adm-notif-layout    { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .adm-notif-form-card { display:flex; flex-direction:column; gap:14px; }
    .adm-notif-list-card { overflow-y:auto; max-height:600px; }
    .adm-type-row        { display:flex; gap:6px; flex-wrap:wrap; }
    .adm-type-btn        { padding:6px 12px; border-radius:var(--radius-md); font-size:12px; font-weight:600; border:1.5px solid var(--border); background:var(--bg-tertiary); cursor:pointer; transition:all .15s; }
    .adm-type-btn:hover  { border-color:var(--accent-blue); }
    .adm-type-btn.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .adm-notif-item      { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--border); }
    .adm-notif-info    { border-left-color:#4F8EF7; }
    .adm-notif-success { border-left-color:#34D399; }
    .adm-notif-warning { border-left-color:#F59E0B; }
    .adm-notif-error   { border-left-color:#F87171; }
    .adm-notif-item-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .adm-notif-type-icon { font-size:15px; flex-shrink:0; }
    .adm-notif-item-title{ font-size:13px; font-weight:700; flex:1; }
    .adm-notif-target    { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--radius-full); background:rgba(79,142,247,.12); color:var(--accent-blue); flex-shrink:0; }
    .adm-notif-date      { font-size:11px; color:var(--text-muted); flex-shrink:0; }
    .adm-notif-del       { background:none; border:none; font-size:11px; color:var(--text-muted); cursor:pointer; padding:2px 4px; border-radius:4px; flex-shrink:0; }
    .adm-notif-del:hover { color:#F87171; }
    .adm-notif-item-body { font-size:12px; color:var(--text-secondary); margin-bottom:6px; line-height:1.5; }
    .adm-notif-by        { font-size:10px; color:var(--text-muted); }

    /* Misc */
    .adm-empty       { color:var(--text-muted); font-size:14px; text-align:center; padding:48px; }
    .adm-loading     { display:flex; justify-content:center; padding:20px; }
    .adm-loading::after { content:''; width:20px; height:20px; border:2px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:adm-spin .7s linear infinite; }
    .adm-loading-big { display:flex; justify-content:center; padding:60px; }
    .adm-loading-big::after { content:''; width:32px; height:32px; border:3px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:adm-spin .7s linear infinite; }
    @keyframes adm-spin { to{transform:rotate(360deg)} }

    /* Error log */
    .err-row { padding:14px; border:1px solid var(--border); border-radius:10px; margin-bottom:10px; background:var(--bg-secondary); }
    .err-top { display:flex; align-items:center; gap:10px; margin-bottom:6px; font-size:12px; flex-wrap:wrap; }
    .err-type { font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
    .err-count { font-weight:700; font-size:11px; background:rgba(248,113,113,.15); color:#F87171; padding:1px 7px; border-radius:99px; }
    .err-route { color:var(--text-muted); }
    .err-ver { color:var(--text-muted); }
    .err-ts { color:var(--text-muted); margin-left:auto; }
    .err-del { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:0 4px; }
    .err-del:hover { color:#F87171; }
    .err-msg { font-size:13px; color:var(--text-primary); margin-bottom:4px; }
    .err-stack { font-size:11px; color:var(--text-muted); white-space:pre-wrap; word-break:break-all; margin:6px 0 0; padding:8px; background:var(--bg-primary); border-radius:6px; max-height:120px; overflow:auto; }
    .err-user { font-size:12px; color:var(--text-muted); margin-top:6px; display:flex; align-items:center; gap:4px; }

    /* Toast */
    .adm-toast { position:fixed; bottom:24px; right:24px; padding:12px 20px; border-radius:var(--radius-md); font-size:14px; font-weight:600; box-shadow:var(--shadow-xl); z-index:9999; opacity:0; transform:translateY(8px); transition:all .25s; border-left:3px solid #34D399; background:var(--bg-secondary); border:1px solid var(--border); }
    .adm-toast.show { opacity:1; transform:translateY(0); }
    .adm-toast-success { border-left:3px solid #34D399; }
    .adm-toast-error   { border-left:3px solid #F87171; }

    @media (max-width:1100px) {
      .adm-stats-row { grid-template-columns:repeat(3,1fr); }
      .adm-overview-grid { grid-template-columns:1fr; }
      .adm-an-grid { grid-template-columns:1fr; }
      .adm-detail-body { grid-template-columns:1fr; }
      .adm-notif-layout { grid-template-columns:1fr; }
    }
  `
  document.head.appendChild(s)
}
