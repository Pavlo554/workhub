// src/renderer/pages/settings/index.js
import { navigate, invalidateRoute } from '../../../core/router.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { auth, db } from '../../services/firebase.js'
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { t, getLang, setLang, SUPPORTED_LANGS } from '../../../core/i18n.js'
import { wbPrompt, wbAlert, wbConfirm } from '../../utils/dialogs.js'
import { applyTheme, applyAccent, ACCENT_COLORS } from '../../../core/theme.js'
import { icon } from '../../utils/icons.js'

export async function render(container) {
  injectStyles()

  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  let activeTab = 'profile'

  function renderPage() {
    container.innerHTML = `
      <div class="st-page">

        <!-- ── Sidebar ── -->
        <aside class="st-sidebar">
          <div class="st-sidebar-header">
            <div class="st-sidebar-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">
              ${initials(profile?.name)}
            </div>
            <div class="st-sidebar-info">
              <div class="st-sidebar-name">${profile?.name || 'Користувач'}</div>
              <div class="st-sidebar-email">${user.email}</div>
            </div>
          </div>

          <nav class="st-tabs">
            ${[
              { id: 'profile',       svgIcon: icon('clients', 16),        key: 'settings.tab.profile' },
              { id: 'language',      svgIcon: icon('globe', 16),          key: 'settings.tab.language' },
              { id: 'appearance',    svgIcon: icon('sparkles', 16),       key: 'settings.tab.appearance' },
              { id: 'notifications', svgIcon: icon('bell', 16),           key: 'settings.tab.notifications' },
              { id: 'security',      svgIcon: icon('passwords', 16),      key: 'settings.tab.security' },
              { id: 'subscription',  svgIcon: icon('upgrade', 16),        key: 'settings.tab.subscription' },
              { id: 'danger',        svgIcon: icon('alert-triangle', 16), key: 'settings.tab.danger' },
            ].map(tab => `
              <button class="st-tab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                <span class="st-tab-icon">${tab.svgIcon}</span>
                <span class="st-tab-label">${tab.label || t(tab.key)}</span>
              </button>
            `).join('')}
          </nav>

          <div class="st-sidebar-footer">
            <div class="st-plan-badge st-plan-${profile?.plan || 'free'}">
              ${(profile?.plan || 'FREE').toUpperCase()} ПЛАН
            </div>
            <div class="st-legal-links">
              <a href="#" id="legal-terms-link">Умови</a>
              <a href="#" id="legal-privacy-link">Конфіденційність</a>
              <a href="#" id="legal-cookies-link">Cookies</a>
            </div>
          </div>
        </aside>

        <!-- ── Content ── -->
        <main class="st-content" id="st-content">
          ${renderTab(activeTab, profile, user)}
        </main>

      </div>
    `

    container.querySelectorAll('.st-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab
        container.querySelectorAll('.st-tab').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        const content = container.querySelector('#st-content')
        content.innerHTML = renderTab(activeTab, profile, user)
        content.scrollTop = 0
        attachTabEvents(content, activeTab, profile, user)
      })
    })

    attachTabEvents(container.querySelector('#st-content'), activeTab, profile, user)

    const openLegal = (tab) => (e) => {
      e.preventDefault()
      location.hash = `#${tab}`
      invalidateRoute('legal')
      navigate('legal')
    }
    container.querySelector('#legal-terms-link')?.addEventListener('click', openLegal('terms'))
    container.querySelector('#legal-privacy-link')?.addEventListener('click', openLegal('privacy'))
    container.querySelector('#legal-cookies-link')?.addEventListener('click', openLegal('cookies'))
  }

  renderPage()

  // Re-render in-place when language changes — keeps current tab, no Firebase round-trip
  function onLangChange() { renderPage() }
  window.addEventListener('lang-change', onLangChange)

  // Cleanup when the slot is removed from DOM (route change / invalidate)
  new MutationObserver((_, obs) => {
    if (!document.body.contains(container)) {
      window.removeEventListener('lang-change', onLangChange)
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}

// ── Tab renderer ─────────────────────────────────────────────
function renderTab(tab, profile, user) {
  switch (tab) {
    case 'profile':       return renderProfile(profile, user)
    case 'language':      return renderLanguage()
    case 'appearance':    return renderAppearance()
    case 'notifications': return renderNotifications()
    case 'security':      return renderSecurity(profile)
    case 'subscription':  return renderSubscription(profile)
    case 'danger':        return renderDanger()
    default: return ''
  }
}

const NICHES = [
  { id: 'freelancer', iconName: 'laptop',     label: 'Фрілансер',       color: '#4F8EF7', desc: 'Проекти, рахунки, договори, таймер' },
  { id: 'accountant', iconName: 'calculator', label: 'Бухгалтер / ФОП', color: '#34D399', desc: 'Фінанси, рахунки, податковий календар' },
  { id: 'smm',        iconName: 'smartphone', label: 'SMM / Маркетолог', color: '#A78BFA', desc: 'Контент-план, акаунти, клієнти' },
  { id: 'beauty',     iconName: 'sparkles',   label: 'Салон краси',     color: '#F472B6', desc: 'Записи, послуги, розклад' },
  { id: 'custom',     iconName: 'settings2',  label: 'Інша ніша',       color: '#94A3B8', desc: 'Вибрати модулі вручну' },
]

// ── Profile tab ───────────────────────────────────────────────
function renderProfile(profile, user) {
  const currentNiche = profile?.profession || null
  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">${t('profile.title')}</h2>
          <p class="st-panel-subtitle">Ваше ім'я, контакти та бізнес</p>
        </div>
      </div>

      <div class="st-avatar-row">
        <div class="st-big-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">
          ${initials(profile?.name)}
        </div>
        <div>
          <div class="st-avatar-name">${profile?.name || 'Користувач'}</div>
          <div class="st-avatar-email">${user.email}</div>
          <div class="st-avatar-plan st-plan-${profile?.plan || 'free'}">${(profile?.plan || 'free').toUpperCase()}</div>
        </div>
      </div>

      <h3 class="st-section-label" style="margin-top:24px">Особиста інформація</h3>
      <div class="st-form-grid">
        <div class="st-field">
          <label class="st-label">${t('profile.name')}</label>
          <input class="st-input" type="text" id="input-name" value="${esc(profile?.name || '')}" placeholder="${t('profile.name_placeholder')}">
        </div>

        <div class="st-field">
          <label class="st-label">${t('profile.email')}</label>
          <div class="st-input-wrap">
            <input class="st-input st-input-disabled" type="email" value="${esc(user.email)}" disabled>
            <span class="st-input-lock">${icon('passwords', 13)}</span>
          </div>
          <span class="st-hint">${t('profile.email_hint')}</span>
        </div>

        <div class="st-field">
          <label class="st-label">${t('profile.phone')}</label>
          <input class="st-input" type="tel" id="input-phone" value="${esc(profile?.phone || '')}" placeholder="${t('profile.phone_placeholder')}">
        </div>

        <div class="st-field">
          <label class="st-label">${t('profile.city')}</label>
          <input class="st-input" type="text" id="input-city" value="${esc(profile?.city || '')}" placeholder="${t('profile.city_placeholder')}">
        </div>
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="save-profile-btn">
          ${icon('download', 15)} ${t('profile.save')}
        </button>
      </div>

      <div class="st-divider" style="margin:28px 0"></div>

      <h3 class="st-section-label">Мій бізнес</h3>
      <p class="st-panel-subtitle" style="margin-bottom:20px">Використовується в рахунках, договорах та навігації</p>

      <div class="st-form-grid">
        <div class="st-field" style="grid-column:1/-1">
          <label class="st-label">Назва бізнесу або ваше ім'я *</label>
          <input class="st-input" type="text" id="input-business"
            value="${esc(profile?.businessName || '')}"
            placeholder="ФОП Іванов або Design Studio">
        </div>

        <div class="st-field">
          <label class="st-label">Веб-сайт</label>
          <input class="st-input" type="text" id="input-website"
            value="${esc(profile?.website || '')}" placeholder="yoursite.com">
        </div>

        <div class="st-field">
          <label class="st-label">Instagram</label>
          <div class="st-input-wrap">
            <span class="st-input-at">@</span>
            <input class="st-input st-input-at-pad" type="text" id="input-instagram"
              value="${esc(profile?.instagram || '')}" placeholder="username">
          </div>
        </div>

        <div class="st-field">
          <label class="st-label">Telegram</label>
          <div class="st-input-wrap">
            <span class="st-input-at">@</span>
            <input class="st-input st-input-at-pad" type="text" id="input-telegram"
              value="${esc(profile?.telegram || '')}" placeholder="username або канал">
          </div>
        </div>
      </div>

      <div class="st-field" style="margin-top:20px">
        <label class="st-label" style="margin-bottom:12px">Сфера діяльності</label>
        <div class="st-niche-grid" id="niche-grid">
          ${NICHES.map(n => `
            <button class="st-niche-card ${currentNiche === n.id || (!currentNiche && n.id === 'custom') ? 'active' : ''}"
              data-niche="${n.id}" style="--nc:${n.color}">
              <span class="st-niche-icon">${icon(n.iconName, 20)}</span>
              <div class="st-niche-body">
                <div class="st-niche-title">${n.label}</div>
                <div class="st-niche-desc">${n.desc}</div>
              </div>
              <div class="st-niche-check">${icon('check', 11)}</div>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="st-field" style="margin-top:20px;max-width:280px">
        <label class="st-label">Група ФОП</label>
        <select class="st-input" id="input-fop-group">
          <option value="" ${!profile?.fopGroup ? 'selected' : ''}>Не ФОП / не вказано</option>
          <option value="1" ${profile?.fopGroup === '1' ? 'selected' : ''}>1 група</option>
          <option value="2" ${profile?.fopGroup === '2' ? 'selected' : ''}>2 група</option>
          <option value="3" ${profile?.fopGroup === '3' ? 'selected' : ''}>3 група</option>
        </select>
        <div class="st-field-hint">Використовується для розрахунку єдиного податку у "Звітах"</div>
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="save-business-btn">
          ${icon('business', 15)} Зберегти та оновити меню
        </button>
      </div>
    </div>
  `
}

// ── Language tab ──────────────────────────────────────────────
function renderLanguage() {
  const current = getLang()
  const DATE_FORMATS = {
    uk: 'дд.мм.рррр',
    en: 'mm/dd/yyyy',
    pl: 'dd.mm.rrrr',
  }
  const CURRENCIES = {
    uk: '₴ Гривня (UAH)',
    en: '$ Dollar (USD)',
    pl: 'zł Złoty (PLN)',
  }

  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">${t('lang.title')}</h2>
          <p class="st-panel-subtitle">${t('lang.subtitle')}</p>
        </div>
      </div>

      <div class="st-lang-grid">
        ${SUPPORTED_LANGS.map(l => `
          <button class="st-lang-card ${current === l.code ? 'active' : ''}" data-lang="${l.code}">
            <div class="st-lang-flag">${l.flag}</div>
            <div class="st-lang-info">
              <div class="st-lang-name">${l.label}</div>
              <div class="st-lang-desc">${t(`lang.${l.code}_desc`)}</div>
            </div>
            <div class="st-lang-check">
              <div class="st-check-circle ${current === l.code ? 'checked' : ''}">
                ${current === l.code ? icon('check', 11) : ''}
              </div>
            </div>
          </button>
        `).join('')}
      </div>

      <div class="st-divider" style="margin: 28px 0 24px"></div>

      <h3 class="st-section-label">${t('lang.region')}</h3>
      <div class="st-form-grid">
        <div class="st-field">
          <label class="st-label">${t('lang.date_format')}</label>
          <div class="st-input st-input-readonly">
            ${icon('tax-calendar', 14)} ${DATE_FORMATS[current] || 'дд.мм.рррр'}
          </div>
        </div>
        <div class="st-field">
          <label class="st-label">${t('lang.currency')}</label>
          <div class="st-input st-input-readonly">
            ${icon('finances', 14)} ${CURRENCIES[current] || '₴ Гривня'}
          </div>
        </div>
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="save-lang-btn">
          ${icon('globe', 15)} ${t('lang.apply')}
        </button>
      </div>
    </div>
  `
}

// ── Appearance tab ────────────────────────────────────────────
function renderAppearance() {
  const saved = localStorage.getItem('workhub_theme') || 'dark'
  const themes = [
    { id: 'dark',   label: 'Темна',    svgIcon: icon('moon', 14),    desc: 'Зручно для очей вночі' },
    { id: 'light',  label: 'Світла',   svgIcon: icon('sun', 14),     desc: 'Класичний білий інтерфейс' },
    { id: 'system', label: 'Системна', svgIcon: icon('monitor', 14), desc: 'Слідує за налаштуваннями ОС' },
  ]
  const accents = [
    { id: 'blue',   color: '#4F8EF7', label: 'Синій' },
    { id: 'purple', color: '#A78BFA', label: 'Фіолет' },
    { id: 'green',  color: '#34D399', label: 'Зелений' },
    { id: 'orange', color: '#FB923C', label: 'Помаранч' },
    { id: 'pink',   color: '#F472B6', label: 'Рожевий' },
  ]
  const savedAccent = localStorage.getItem('workhub_accent') || 'blue'

  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">Зовнішній вигляд</h2>
          <p class="st-panel-subtitle">Тема оформлення та акцентний колір</p>
        </div>
      </div>

      <h3 class="st-section-label">Тема</h3>
      <div class="st-theme-grid">
        ${themes.map(th => `
          <button class="st-theme-card ${saved === th.id ? 'active' : ''}" data-theme="${th.id}">
            <div class="st-theme-preview st-theme-preview-${th.id}">
              <div class="st-preview-sidebar"></div>
              <div class="st-preview-content">
                <div class="st-preview-bar"></div>
                <div class="st-preview-cards">
                  <div class="st-preview-card"></div>
                  <div class="st-preview-card"></div>
                </div>
              </div>
            </div>
            <div class="st-theme-label">
              ${th.svgIcon}
              <span>${th.label}</span>
            </div>
            <div class="st-theme-desc">${th.desc}</div>
            ${saved === th.id ? '<div class="st-theme-active-badge">Активна</div>' : ''}
          </button>
        `).join('')}
      </div>

      <div class="st-divider" style="margin: 28px 0 24px"></div>

      <h3 class="st-section-label">Акцентний колір</h3>
      <div class="st-accent-row">
        ${accents.map(a => `
          <button class="st-accent-btn ${savedAccent === a.id ? 'active' : ''}" data-accent="${a.id}" style="--ac:${a.color}" title="${a.label}">
            <div class="st-accent-dot" style="background:${a.color}"></div>
            ${savedAccent === a.id ? `<div class="st-accent-check">${icon('check', 10)}</div>` : ''}
          </button>
        `).join('')}
      </div>

    </div>
  `
}

// ── Security tab ──────────────────────────────────────────────
function renderSecurity(profile) {
  const totpOn = !!profile?.totpEnabled
  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">${t('security.title')}</h2>
          <p class="st-panel-subtitle">Зміна пароля та управління сесіями</p>
        </div>
      </div>

      <h3 class="st-section-label">Двофакторна автентифікація (2FA)</h3>
      <div class="st-session-row">
        <div class="st-session-icon">${icon('lock', 22)}</div>
        <div class="st-session-info">
          <div class="st-session-name">Google Authenticator / Authy</div>
          <div class="st-session-meta">${totpOn ? 'Увімкнено — при вході в Адмін панель потрібен код' : 'Вимкнено — рекомендовано для Owner-акаунту'}</div>
        </div>
        ${totpOn
          ? `<button class="st-btn st-btn-secondary" id="totp-disable-btn">Вимкнути</button>`
          : `<button class="st-btn st-btn-primary" id="totp-enable-btn">Увімкнути 2FA</button>`}
      </div>
      <div id="totp-setup-box"></div>

      <div class="st-divider" style="margin: 28px 0 24px"></div>

      <div class="st-security-alert">
        <div class="st-security-alert-icon">${icon('passwords', 22)}</div>
        <div class="st-security-alert-text">${t('security.warning')}</div>
      </div>

      <h3 class="st-section-label">Зміна пароля</h3>
      <div class="st-form-grid">
        <div class="st-field" style="grid-column:1/-1">
          <label class="st-label">${t('security.current_pass')}</label>
          <div class="st-input-wrap">
            <input class="st-input" type="password" id="input-current-password" placeholder="••••••••">
            <button class="st-eye-btn" data-target="input-current-password">${icon('eye', 15)}</button>
          </div>
        </div>
        <div class="st-field">
          <label class="st-label">${t('security.new_pass')}</label>
          <div class="st-input-wrap">
            <input class="st-input" type="password" id="input-new-password" placeholder="••••••••">
            <button class="st-eye-btn" data-target="input-new-password">${icon('eye', 15)}</button>
          </div>
          <span class="st-hint">${t('security.new_pass_hint')}</span>
          <div class="st-strength-bar" id="strength-bar">
            <div class="st-strength-fill" id="strength-fill"></div>
          </div>
          <div class="st-strength-label" id="strength-label"></div>
        </div>
        <div class="st-field">
          <label class="st-label">${t('security.confirm_pass')}</label>
          <div class="st-input-wrap">
            <input class="st-input" type="password" id="input-confirm-password" placeholder="••••••••">
            <button class="st-eye-btn" data-target="input-confirm-password">${icon('eye', 15)}</button>
          </div>
        </div>
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="change-password-btn">
          ${icon('passwords', 15)} ${t('security.change_btn')}
        </button>
      </div>

      <div class="st-divider" style="margin: 28px 0 24px"></div>

      <h3 class="st-section-label">${t('security.sessions')}</h3>
      <div class="st-session-row">
        <div class="st-session-icon">${icon('laptop', 22)}</div>
        <div class="st-session-info">
          <div class="st-session-name">WorkHub Desktop</div>
          <div class="st-session-meta">${t('security.sessions_desc')} · ${new Date().toLocaleDateString('uk-UA')}</div>
        </div>
        <div class="st-session-badge">Активна</div>
      </div>
    </div>
  `
}

// ── Subscription tab ──────────────────────────────────────────
function renderSubscription(profile) {
  const plan = profile?.plan || 'free'
  const plans = [
    { id: 'free',     svgIcon: icon('join', 28),     name: 'FREE',     price: '0 грн',   descKey: 'sub.free_desc',  color: '#94A3B8' },
    { id: 'pro',      svgIcon: icon('upgrade', 28),  name: 'PRO',      price: '299 грн', descKey: 'sub.pro_desc',   color: '#4F8EF7' },
    { id: 'business', svgIcon: icon('business', 28), name: 'BUSINESS', price: '799 грн', descKey: 'sub.biz_desc',   color: '#A78BFA' },
  ]

  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">${t('sub.title')}</h2>
          <p class="st-panel-subtitle">${t('sub.current_plan')}: <strong style="color:var(--accent-blue)">${plan.toUpperCase()}</strong></p>
        </div>
        <div class="st-plan-status-badge ${profile?.subscriptionStatus === 'active' ? 'active' : ''}">
          ${profile?.subscriptionStatus === 'active' ? t('sub.active') : t('sub.inactive')}
        </div>
      </div>

      ${profile?.subscriptionEnd ? `
        <div class="st-sub-expiry">
          ${icon('tax-calendar', 14)} ${t('sub.expires')} <strong>${new Date(profile.subscriptionEnd).toLocaleDateString('uk-UA')}</strong>
        </div>
      ` : ''}

      <div class="st-plans-grid">
        ${plans.map(p => `
          <div class="st-plan-card ${plan === p.id ? 'current' : ''}" style="--plan-color:${p.color}">
            <div class="st-plan-icon">${p.svgIcon}</div>
            <div class="st-plan-name" style="color:${p.color}">${p.name}</div>
            <div class="st-plan-price">${p.price}<span class="st-plan-period">/міс</span></div>
            <div class="st-plan-desc">${t(p.descKey)}</div>
            ${plan === p.id
              ? `<div class="st-plan-current-badge">Ваш план</div>`
              : `<button class="st-btn st-btn-outline st-btn-plan" data-plan="${p.id}" style="--plan-color:${p.color}">
                  Обрати ${p.name}
                </button>`
            }
          </div>
        `).join('')}
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="manage-sub-btn">
          ${icon('credit-card', 15)} ${t('sub.manage')}
        </button>
      </div>
    </div>
  `
}

// ── Danger zone tab ───────────────────────────────────────────
function renderDanger() {
  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title" style="color:#F87171">${t('danger.title')}</h2>
          <p class="st-panel-subtitle">Незворотні дії з вашим акаунтом</p>
        </div>
      </div>

      <div class="st-danger-card">
        <div class="st-danger-row">
          <div class="st-danger-icon">${icon('logout', 20)}</div>
          <div class="st-danger-info">
            <div class="st-danger-title">${t('danger.logout_title')}</div>
            <div class="st-danger-desc">${t('danger.logout_desc')}</div>
          </div>
          <button class="st-btn st-btn-ghost" id="logout-btn">${t('danger.logout_btn')}</button>
        </div>

        <div class="st-danger-divider"></div>

        <div class="st-danger-row">
          <div class="st-danger-icon st-danger-icon-red">${icon('trash', 20)}</div>
          <div class="st-danger-info">
            <div class="st-danger-title">${t('danger.delete_title')}</div>
            <div class="st-danger-desc">${t('danger.delete_desc')}</div>
          </div>
          <button class="st-btn st-btn-danger" id="delete-account-btn">${t('danger.delete_btn')}</button>
        </div>
      </div>

      <div class="st-notice st-notice-warn" style="margin-top:20px">
        ${icon('alert-triangle', 14)}
        <span>Видалення акаунта призведе до безповоротної втрати всіх ваших даних, включаючи клієнтів, проекти, рахунки та інше.</span>
      </div>
    </div>
  `
}

// ── Notifications tab ─────────────────────────────────────────
const NOTIF_KEY = 'workhub_notifications'

function getNotifSettings() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}') } catch { return {} }
}

function renderNotifications() {
  const s = getNotifSettings()
  const rows = [
    { id: 'task_due',     iconName: 'tasks',        title: 'Дедлайни задач',     desc: 'Нагадування за день до дедлайну' },
    { id: 'tax_calendar', iconName: 'tax-calendar', title: 'Податковий календар', desc: 'Нагадування про звіти та платежі' },
    { id: 'new_client',   iconName: 'clients',      title: 'Новий клієнт',        desc: 'Сповіщення про нові записи клієнтів' },
    { id: 'invoice_paid', iconName: 'invoices',     title: 'Оплата рахунку',      desc: 'Коли рахунок позначено як оплачений' },
    { id: 'team_updates', iconName: 'team',         title: 'Оновлення команди',   desc: 'Дії учасників у спільному просторі' },
  ]

  return `
    <div class="st-panel">
      <div class="st-panel-header">
        <div>
          <h2 class="st-panel-title">Сповіщення</h2>
          <p class="st-panel-subtitle">Обирайте, про що отримувати нагадування</p>
        </div>
      </div>

      <h3 class="st-section-label">В застосунку</h3>
      <div class="st-notif-list">
        ${rows.map(r => `
          <div class="st-notif-row">
            <div class="st-notif-icon">${icon(r.iconName, 18)}</div>
            <div class="st-notif-info">
              <div class="st-notif-title">${r.title}</div>
              <div class="st-notif-desc">${r.desc}</div>
            </div>
            <label class="st-toggle">
              <input type="checkbox" data-notif="${r.id}" ${s[r.id] !== false ? 'checked' : ''}>
              <span class="st-toggle-track"><span class="st-toggle-thumb"></span></span>
            </label>
          </div>
        `).join('')}
      </div>

      <div class="st-divider" style="margin:28px 0 24px"></div>

      <h3 class="st-section-label">Email</h3>
      <div class="st-notif-list">
        <div class="st-notif-row">
          <div class="st-notif-icon">${icon('documents', 18)}</div>
          <div class="st-notif-info">
            <div class="st-notif-title">Email-дайджест</div>
            <div class="st-notif-desc">Щотижневий звіт про активність</div>
          </div>
          <label class="st-toggle">
            <input type="checkbox" data-notif="email_digest" ${s['email_digest'] ? 'checked' : ''}>
            <span class="st-toggle-track"><span class="st-toggle-thumb"></span></span>
          </label>
        </div>
        <div class="st-notif-row">
          <div class="st-notif-icon">${icon('passwords', 18)}</div>
          <div class="st-notif-info">
            <div class="st-notif-title">Безпека акаунта</div>
            <div class="st-notif-desc">Вхід з нового пристрою, зміна пароля</div>
          </div>
          <label class="st-toggle">
            <input type="checkbox" data-notif="email_security" checked disabled>
            <span class="st-toggle-track st-toggle-track-locked"><span class="st-toggle-thumb"></span></span>
          </label>
        </div>
      </div>

      <div class="st-actions">
        <button class="st-btn st-btn-primary" id="save-notif-btn">
          ${icon('download', 15)} Зберегти налаштування
        </button>
      </div>
    </div>
  `
}

function attachNotifications(content) {
  content.querySelector('#save-notif-btn')?.addEventListener('click', () => {
    const s = {}
    content.querySelectorAll('[data-notif]').forEach(el => {
      if (!el.disabled) s[el.dataset.notif] = el.checked
    })
    localStorage.setItem(NOTIF_KEY, JSON.stringify(s))
    showToast('Налаштування збережено', 'success')
  })
}

// ── Event handlers per tab ────────────────────────────────────
function attachTabEvents(content, tab, profile, user) {
  switch (tab) {
    case 'profile':       attachProfile(content, profile, user); break
    case 'language':      attachLanguage(content); break
    case 'appearance':    attachAppearance(content); break
    case 'notifications': attachNotifications(content); break
    case 'security':      attachSecurity(content, user); break
    case 'subscription':  attachSubscription(content); break
    case 'danger':        attachDanger(content); break
  }
}

function attachProfile(content, profile, user) {
  content.querySelector('#save-profile-btn')?.addEventListener('click', async () => {
    const name  = content.querySelector('#input-name').value.trim()
    const phone = content.querySelector('#input-phone').value.trim()
    const city  = content.querySelector('#input-city').value.trim()
    if (!name) { showToast(t('profile.name_required'), 'error'); return }

    const btn = content.querySelector('#save-profile-btn')
    btn.disabled = true
    btn.innerHTML = `<div class="spinner" style="width:14px;height:14px"></div> ${t('common.saving')}`

    try {
      const data = { name, phone, city, updatedAt: serverTimestamp() }
      await updateDoc(doc(db, 'users', user.uid), data)
      updateProfileCache(user.uid, data)
      showToast(t('profile.saved'), 'success')
    } catch (err) {
      console.error(err)
      showToast(t('profile.error'), 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = `${icon('download', 15)} ${t('profile.save')}`
    }
  })

  let selectedNiche = profile?.profession || null

  content.querySelectorAll('.st-niche-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedNiche = card.dataset.niche === 'custom' ? null : card.dataset.niche
      content.querySelectorAll('.st-niche-card').forEach(c => c.classList.remove('active'))
      card.classList.add('active')
    })
  })

  content.querySelector('#save-business-btn')?.addEventListener('click', async () => {
    const businessName = content.querySelector('#input-business')?.value.trim()
    const website      = content.querySelector('#input-website')?.value.trim()
    const instagram    = content.querySelector('#input-instagram')?.value.trim()
    const telegram     = content.querySelector('#input-telegram')?.value.trim()
    const fopGroup     = content.querySelector('#input-fop-group')?.value || ''

    if (!businessName) { showToast('Введіть назву бізнесу', 'error'); return }

    const btn = content.querySelector('#save-business-btn')
    btn.disabled = true
    btn.innerHTML = `<div class="spinner" style="width:14px;height:14px"></div> ${t('common.saving')}`

    try {
      const data = {
        businessName, website, instagram, telegram, fopGroup,
        profession:     selectedNiche,
        accountType:    'owner',
        onboardingDone: true,
        updatedAt:      serverTimestamp(),
      }
      await updateDoc(doc(db, 'users', user.uid), data)
      updateProfileCache(user.uid, data)

      const { renderNavigation } = await import('../../components/navigation.js')
      const updatedProfile = { ...profile, ...data }
      const sidebar = document.getElementById('sidebar')
      if (sidebar) renderNavigation(sidebar, updatedProfile)

      showToast('Бізнес збережено. Меню оновлено', 'success')
    } catch (err) {
      console.error(err)
      showToast(t('profile.error'), 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = `${icon('business', 15)} Зберегти та оновити меню`
    }
  })
}

function attachLanguage(content) {
  let selectedLang = getLang()

  content.querySelectorAll('.st-lang-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedLang = card.dataset.lang
      content.querySelectorAll('.st-lang-card').forEach(c => c.classList.remove('active'))
      content.querySelectorAll('.st-check-circle').forEach(c => { c.classList.remove('checked'); c.innerHTML = '' })
      card.classList.add('active')
      const circle = card.querySelector('.st-check-circle')
      circle.classList.add('checked')
      circle.innerHTML = icon('check', 11)
    })
  })

  content.querySelector('#save-lang-btn')?.addEventListener('click', async () => {
    setLang(selectedLang)

    try {
      const u = getCurrentUser()
      if (u) await updateDoc(doc(db, 'users', u.uid), { language: selectedLang })
    } catch { /* non-critical */ }

    showToast(t('lang.saved'), 'success')
  })
}

function attachAppearance(content) {
  content.querySelectorAll('.st-theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const themeId = card.dataset.theme
      localStorage.setItem('workhub_theme', themeId)
      applyTheme(themeId)
      content.querySelectorAll('.st-theme-card').forEach(c => {
        c.classList.remove('active')
        c.querySelector('.st-theme-active-badge')?.remove()
      })
      card.classList.add('active')
      const badge = document.createElement('div')
      badge.className = 'st-theme-active-badge'
      badge.textContent = 'Активна'
      card.appendChild(badge)
      showToast('Тему змінено', 'success')
    })
  })

  content.querySelectorAll('.st-accent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const accentId = btn.dataset.accent
      localStorage.setItem('workhub_accent', accentId)
      applyAccent(accentId)
      content.querySelectorAll('.st-accent-btn').forEach(b => {
        b.classList.remove('active')
        b.querySelector('.st-accent-check')?.remove()
      })
      btn.classList.add('active')
      const chk = document.createElement('div')
      chk.className = 'st-accent-check'
      chk.innerHTML = icon('check', 10)
      btn.appendChild(chk)
      showToast('Колір акценту змінено', 'success')
    })
  })
}

function attachSecurity(content, user) {
  content.querySelector('#input-new-password')?.addEventListener('input', (e) => {
    const val = e.target.value
    const fill  = content.querySelector('#strength-fill')
    const label = content.querySelector('#strength-label')
    if (!fill || !label) return

    let strength = 0
    if (val.length >= 6) strength++
    if (val.length >= 10) strength++
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) strength++
    if (/\d/.test(val)) strength++
    if (/[^a-zA-Z0-9]/.test(val)) strength++

    const levels = [
      { w: '0%',   color: 'transparent', text: '' },
      { w: '20%',  color: '#F87171', text: 'Дуже слабкий' },
      { w: '40%',  color: '#FB923C', text: 'Слабкий' },
      { w: '60%',  color: '#FBBF24', text: 'Середній' },
      { w: '80%',  color: '#34D399', text: 'Сильний' },
      { w: '100%', color: '#10B981', text: 'Дуже сильний' },
    ]
    const lvl = levels[strength] || levels[0]
    fill.style.width = lvl.w
    fill.style.background = lvl.color
    label.textContent = lvl.text
    label.style.color = lvl.color
  })

  content.querySelectorAll('.st-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = content.querySelector(`#${btn.dataset.target}`)
      if (!input) return
      input.type = input.type === 'password' ? 'text' : 'password'
      btn.innerHTML = input.type === 'password' ? icon('eye', 15) : icon('eye-off', 15)
    })
  })

  content.querySelector('#change-password-btn')?.addEventListener('click', async () => {
    const currentPass  = content.querySelector('#input-current-password').value
    const newPass      = content.querySelector('#input-new-password').value
    const confirmPass  = content.querySelector('#input-confirm-password').value

    if (!currentPass || !newPass || !confirmPass) { showToast(t('security.fill_all'), 'error'); return }
    if (newPass.length < 6)          { showToast(t('security.min_length'), 'error'); return }
    if (newPass !== confirmPass)     { showToast(t('security.mismatch'), 'error'); return }

    const btn = content.querySelector('#change-password-btn')
    btn.disabled = true

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPass)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPass)
      showToast(t('security.changed'), 'success')
      content.querySelector('#input-current-password').value = ''
      content.querySelector('#input-new-password').value     = ''
      content.querySelector('#input-confirm-password').value = ''
    } catch (err) {
      console.error(err)
      const msg = err.code === 'auth/wrong-password' ? t('security.wrong_pass') : t('security.error')
      showToast(msg, 'error')
    } finally {
      btn.disabled = false
    }
  })

  // ── 2FA (TOTP) ─────────────────────────────────────────────
  content.querySelector('#totp-enable-btn')?.addEventListener('click', async () => {
    const { generateSecret, buildOtpAuthUri, verifyTotpCode } = await import('../../services/totp.js')
    const { db } = await import('../../services/firebase.js')
    const { doc, setDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')

    const secret = generateSecret()
    const uri    = buildOtpAuthUri(secret, user.email)
    const box = content.querySelector('#totp-setup-box')
    box.innerHTML = `
      <div class="st-info-card" style="margin-top:14px">
        <div class="st-info-card-icon">${icon('lock', 22)}</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;flex:1">
          1. Відкрий <b style="color:var(--text-primary)">Google Authenticator</b> (чи Authy) → "Додати акаунт" → "Скан QR-коду"<br>
          <div id="totp-qr" style="width:188px;height:188px;background:#fff;border-radius:10px;margin:12px 0;display:flex;align-items:center;justify-content:center"></div>
          Або введи код вручну (тип — Time-based):
          <div style="margin:8px 0;padding:10px 14px;background:var(--bg-tertiary);border-radius:8px;font-family:monospace;font-size:15px;letter-spacing:2px;word-break:break-all">${secret}</div>
          2. Введи 6-значний код із застосунку щоб підтвердити:
          <div style="display:flex;gap:8px;margin-top:10px">
            <input class="st-input" id="totp-confirm-code" placeholder="123456" maxlength="6" style="max-width:140px;font-family:monospace;font-size:16px;letter-spacing:3px">
            <button class="st-btn st-btn-primary" id="totp-confirm-btn">Підтвердити</button>
          </div>
        </div>
      </div>`
    renderTotpQr(box.querySelector('#totp-qr'), uri)
    box.querySelector('#totp-confirm-btn').addEventListener('click', async () => {
      const code = box.querySelector('#totp-confirm-code').value.trim()
      if (!/^\d{6}$/.test(code)) { showToast('Введіть 6-значний код', 'error'); return }
      const ok = await verifyTotpCode(secret, code)
      if (!ok) { showToast('Код невірний, спробуйте ще раз', 'error'); return }
      try {
        await setDoc(doc(db, 'twoFactorSecrets', user.uid), { secret, createdAt: serverTimestamp() })
        await updateDoc(doc(db, 'users', user.uid), { totpEnabled: true })
        showToast('2FA увімкнено', 'success')
        box.innerHTML = ''
        content.querySelector('#totp-enable-btn').replaceWith(Object.assign(document.createElement('button'), {
          className: 'st-btn st-btn-secondary', id: 'totp-disable-btn', textContent: 'Вимкнути',
        }))
        location.reload()
      } catch (err) { showToast('Помилка: ' + err.message, 'error') }
    })
  })

  content.querySelector('#totp-disable-btn')?.addEventListener('click', async () => {
    if (!confirm('Вимкнути двофакторну автентифікацію?')) return
    const { db } = await import('../../services/firebase.js')
    const { doc, deleteDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
    try {
      await deleteDoc(doc(db, 'twoFactorSecrets', user.uid))
      await updateDoc(doc(db, 'users', user.uid), { totpEnabled: false })
      showToast('2FA вимкнено', 'success')
      location.reload()
    } catch (err) { showToast('Помилка: ' + err.message, 'error') }
  })
}

function attachSubscription(content) {
  content.querySelector('#manage-sub-btn')?.addEventListener('click', () => navigate('subscribe'))
  content.querySelectorAll('.st-btn-plan').forEach(btn => {
    btn.addEventListener('click', () => navigate('subscribe'))
  })
}

function attachDanger(content) {
  content.querySelector('#logout-btn')?.addEventListener('click', async () => {
    if (!await wbConfirm(t('danger.logout_confirm'), { okLabel: t('danger.logout_btn'), danger: true })) return
    try {
      await signOut(auth)
      window.location.reload()
    } catch { showToast(t('common.error'), 'error') }
  })

  content.querySelector('#delete-account-btn')?.addEventListener('click', async () => {
    const answer = await wbPrompt(t('danger.delete_prompt'))
    if (answer === 'ВИДАЛИТИ' || answer === 'DELETE' || answer === 'USUŃ') {
      wbAlert(t('danger.delete_wip'), 'warning')
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'U'
}

function esc(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Lazy-load the QR lib once (cdnjs is already CSP-whitelisted) and render
// the otpauth:// URI as a scannable code — the secret never leaves the
// device, the library only draws pixels from the string we already have.
let _qrLibPromise = null
function loadQrLib() {
  if (window.QRCode) return Promise.resolve()
  if (_qrLibPromise) return _qrLibPromise
  _qrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return _qrLibPromise
}
async function renderTotpQr(el, uri) {
  if (!el) return
  try {
    await loadQrLib()
    el.innerHTML = ''
    new window.QRCode(el, { text: uri, width: 168, height: 168, colorDark: '#000000', colorLight: '#ffffff' })
  } catch {
    el.innerHTML = `<span style="color:#1a1a2e;font-size:11px;padding:8px;text-align:center">QR недоступний — скористайтесь кодом нижче</span>`
  }
}

function showToast(msg, type = 'info') {
  document.querySelector('.st-toast')?.remove()
  const el = document.createElement('div')
  el.className = `st-toast st-toast-${type}`
  el.textContent = msg
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('st-toast-show'))
  setTimeout(() => { el.classList.remove('st-toast-show'); setTimeout(() => el.remove(), 300) }, 3000)
}

// ── Styles ────────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('settings-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'settings-styles'
  s.textContent = `

    /* ── Layout ── */
    .st-page {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: calc(100vh - 40px);
    }

    /* ── Sidebar ── */
    .st-sidebar {
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 28px 0 20px;
      position: sticky;
      top: 0;
      height: calc(100vh - 40px);
      overflow-y: auto;
    }
    .st-sidebar-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .st-sidebar-avatar {
      width: 72px; height: 72px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; font-weight: 800; color: #fff;
      margin-bottom: 12px; flex-shrink: 0;
      box-shadow: 0 6px 20px rgba(102,126,234,.35), 0 0 0 4px var(--bg-secondary);
    }
    .st-sidebar-name  { font-size: 15px; font-weight: 700; margin-bottom: 3px; }
    .st-sidebar-email { font-size: 11px; color: var(--text-muted); word-break: break-all; }

    /* ── Tabs ── */
    .st-tabs { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; flex: 1; }
    .st-tab {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: var(--radius-md);
      background: none; border: none; cursor: pointer;
      font-size: 13.5px; font-weight: 500; color: var(--text-secondary);
      text-align: left; transition: all .15s; width: 100%;
    }
    .st-tab:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .st-tab.active {
      background: linear-gradient(90deg, rgba(91,141,239,.16), rgba(91,141,239,.05));
      color: var(--accent-blue); font-weight: 700;
      box-shadow: inset 2.5px 0 0 var(--accent-blue);
    }
    .st-tab-icon {
      width: 22px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .st-tab-icon svg { opacity: 0.8; }
    .st-tab.active .st-tab-icon svg { opacity: 1; }
    .st-tab-label { flex: 1; }

    .st-sidebar-footer { padding: 16px 20px 0; border-top: 1px solid var(--border); margin-top: 16px; }
    .st-legal-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .st-legal-links a { font-size: 11px; color: var(--text-muted); text-decoration: none; }
    .st-legal-links a:hover { color: var(--text-secondary); text-decoration: underline; }
    .st-plan-badge {
      text-align: center; padding: 5px 12px; border-radius: var(--radius-full);
      font-size: 11px; font-weight: 800; letter-spacing: .06em;
    }
    .st-plan-free     { background: rgba(148,163,184,.15); color: #94A3B8; }
    .st-plan-pro      { background: rgba(91,141,239,.15);  color: var(--accent-blue); }
    .st-plan-business { background: rgba(167,139,250,.15); color: #A78BFA; }

    /* ── Content panel ── */
    .st-content {
      padding: 36px 40px;
      overflow-y: auto;
      max-width: 780px;
      height: calc(100vh - 40px);
      box-sizing: border-box;
    }
    .st-panel-header {
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 12px;
      margin-bottom: 28px;
    }
    .st-panel-title {
      font-family: var(--font-display); font-size: 22px; font-weight: 800;
      margin-bottom: 4px; letter-spacing: -0.02em;
      position: relative; padding-left: 14px;
    }
    .st-panel-title::before {
      content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 4px;
      border-radius: 3px; background: linear-gradient(180deg,#667eea,#5B8DEF);
    }
    .st-panel-subtitle { font-size: 13px; color: var(--text-muted); margin-left: 14px; }
    .st-field-hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    /* ── Avatar row ── */
    .st-avatar-row {
      display: flex; align-items: center; gap: 20px;
      padding: 20px; background: var(--bg-secondary);
      border: 1px solid var(--border); border-radius: var(--radius-xl);
      margin-bottom: 24px;
      box-shadow: 0 4px 18px rgba(0,0,0,.18);
      transition: box-shadow .2s, border-color .2s;
    }
    .st-avatar-row:hover { border-color: rgba(91,141,239,.3); box-shadow: 0 6px 24px rgba(0,0,0,.24); }
    .st-big-avatar {
      width: 72px; height: 72px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; font-weight: 800; color: #fff; flex-shrink: 0;
      box-shadow: 0 6px 20px rgba(102,126,234,.35);
    }
    .st-avatar-name  { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
    .st-avatar-email { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
    .st-avatar-plan  { display: inline-flex; padding: 2px 10px; border-radius: var(--radius-full); font-size: 10px; font-weight: 800; letter-spacing: .06em; }

    /* ── Form ── */
    .st-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .st-field { display: flex; flex-direction: column; gap: 6px; }
    .st-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
    .st-input {
      width: 100%; box-sizing: border-box;
      padding: 10px 14px; background: var(--bg-secondary);
      border: 1.5px solid var(--border); border-radius: var(--radius-md);
      font-size: 13.5px; color: var(--text-primary);
      transition: border-color .15s; outline: none;
      font-family: inherit;
    }
    .st-input:focus { border-color: var(--accent-blue); background: var(--bg-primary); }
    .st-input-disabled { opacity: .5; cursor: not-allowed; }
    .st-input-readonly {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: var(--text-secondary);
      background: var(--bg-tertiary); cursor: default;
    }
    .st-input-readonly svg { color: var(--text-muted); flex-shrink: 0; }
    .st-input-wrap { position: relative; }
    .st-input-wrap .st-input { width: 100%; padding-right: 44px; box-sizing: border-box; }
    .st-input-lock {
      position: absolute; right: 12px; top: 50%;
      transform: translateY(-50%); pointer-events: none;
      display: flex; align-items: center; color: var(--text-muted);
    }
    .st-eye-btn {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer;
      padding: 4px; display: flex; align-items: center;
      color: var(--text-muted); border-radius: var(--radius-sm);
      transition: color .15s, background .15s;
    }
    .st-eye-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
    .st-hint { font-size: 11px; color: var(--text-muted); }
    .st-divider { height: 1px; background: var(--border); }
    .st-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); margin-bottom: 14px; }

    /* ── Actions ── */
    .st-actions { margin-top: 24px; display: flex; gap: 10px; }
    .st-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: var(--radius-md);
      font-size: 13.5px; font-weight: 700; cursor: pointer;
      border: none; transition: all .18s;
    }
    .st-btn:active { transform: scale(.97); }
    .st-btn-primary {
      background: linear-gradient(135deg,#667eea,#5B8DEF);
      color: #fff; box-shadow: 0 2px 10px rgba(91,141,239,.25);
    }
    .st-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(91,141,239,.4); }
    .st-btn-primary:disabled { opacity: .6; transform: none; box-shadow: none; }
    .st-btn-ghost, .st-btn-secondary {
      background: var(--bg-secondary); border: 1.5px solid var(--border);
      color: var(--text-primary);
    }
    .st-btn-ghost:hover, .st-btn-secondary:hover { border-color: var(--accent-blue); background: var(--bg-tertiary); }
    .st-btn-danger { background: linear-gradient(135deg,#EF4444,#DC2626); color: #fff; box-shadow: 0 2px 10px rgba(239,68,68,.2); }
    .st-btn-danger:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(239,68,68,.4); }
    .st-btn-outline {
      background: none; border: 1.5px solid var(--plan-color,var(--border));
      color: var(--plan-color, var(--text-primary));
    }
    .st-btn-outline:hover { background: color-mix(in srgb, var(--plan-color,#fff) 10%, transparent); }
    .st-btn-plan { width: 100%; justify-content: center; margin-top: auto; }

    /* ── Language ── */
    .st-lang-grid { display: flex; flex-direction: column; gap: 10px; }
    .st-lang-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px 18px; background: var(--bg-secondary);
      border: 2px solid var(--border); border-radius: var(--radius-xl);
      cursor: pointer; transition: all .15s; text-align: left; width: 100%;
      box-shadow: 0 2px 8px rgba(0,0,0,.1);
    }
    .st-lang-card:hover { border-color: rgba(255,255,255,.2); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,.16); }
    .st-lang-card.active { border-color: var(--accent-blue); background: rgba(91,141,239,.07); box-shadow: 0 4px 16px rgba(91,141,239,.18); }
    .st-lang-flag  { font-size: 28px; flex-shrink: 0; }
    .st-lang-info  { flex: 1; }
    .st-lang-name  { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
    .st-lang-desc  { font-size: 12px; color: var(--text-muted); }
    .st-lang-check { flex-shrink: 0; }
    .st-check-circle {
      width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      transition: all .15s; color: transparent;
    }
    .st-check-circle.checked {
      background: var(--accent-blue); border-color: var(--accent-blue);
      color: #fff;
    }

    /* ── Appearance ── */
    .st-theme-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
    .st-theme-card {
      background: var(--bg-secondary); border: 2px solid var(--border);
      border-radius: var(--radius-xl); padding: 14px;
      cursor: pointer; transition: all .15s; text-align: left; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,.1);
    }
    .st-theme-card:hover { border-color: rgba(255,255,255,.2); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.2); }
    .st-theme-card.active { border-color: var(--accent-blue); box-shadow: 0 6px 18px rgba(91,141,239,.2); }
    .st-theme-preview {
      height: 80px; border-radius: var(--radius-md); overflow: hidden;
      display: flex; margin-bottom: 10px;
    }
    .st-theme-preview-dark   { background: #0F1117; }
    .st-theme-preview-light  { background: #F8FAFC; }
    .st-theme-preview-system { background: linear-gradient(to right, #0F1117 50%, #F8FAFC 50%); }
    .st-preview-sidebar { width: 26px; background: rgba(255,255,255,.08); flex-shrink: 0; }
    .st-theme-preview-light .st-preview-sidebar { background: rgba(0,0,0,.06); }
    .st-preview-content { flex: 1; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
    .st-preview-bar     { height: 8px; border-radius: 4px; background: rgba(255,255,255,.12); width: 60%; }
    .st-theme-preview-light .st-preview-bar { background: rgba(0,0,0,.1); }
    .st-preview-cards   { display: flex; gap: 4px; flex: 1; }
    .st-preview-card    { flex: 1; border-radius: 4px; background: rgba(255,255,255,.07); }
    .st-theme-preview-light .st-preview-card { background: rgba(0,0,0,.07); }
    .st-theme-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; margin-bottom: 3px; color: var(--text-primary); }
    .st-theme-label svg { color: var(--text-muted); }
    .st-theme-desc  { font-size: 11px; color: var(--text-muted); }
    .st-theme-active-badge {
      position: absolute; top: 8px; right: 8px;
      background: var(--accent-blue); color: #fff;
      font-size: 10px; font-weight: 800; padding: 2px 8px;
      border-radius: var(--radius-full);
    }
    .st-accent-row  { display: flex; gap: 10px; align-items: center; }
    .st-accent-btn  {
      width: 36px; height: 36px; border-radius: 50%;
      border: 2.5px solid transparent; cursor: pointer;
      background: none; display: flex; align-items: center;
      justify-content: center; position: relative; transition: all .15s;
    }
    .st-accent-btn:hover  { transform: scale(1.15); }
    .st-accent-btn.active { border-color: var(--ac, #fff); }
    .st-accent-dot  { width: 22px; height: 22px; border-radius: 50%; }
    .st-accent-check {
      position: absolute; display: flex; align-items: center; justify-content: center;
      color: #fff; pointer-events: none;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));
    }

    /* ── Security ── */
    .st-security-alert {
      display: flex; align-items: center; gap: 12px;
      background: rgba(251,191,36,.1); border: 1px solid rgba(251,191,36,.3);
      border-radius: var(--radius-md); padding: 14px 16px;
      margin-bottom: 24px;
    }
    .st-security-alert-icon { flex-shrink: 0; display: flex; align-items: center; color: #FBBF24; }
    .st-security-alert-text { font-size: 13px; line-height: 1.5; }
    .st-strength-bar {
      height: 4px; background: var(--bg-tertiary); border-radius: 2px;
      margin-top: 6px; overflow: hidden;
    }
    .st-strength-fill { height: 100%; border-radius: 2px; transition: all .3s; width: 0; }
    .st-strength-label { font-size: 11px; font-weight: 600; margin-top: 4px; min-height: 14px; }
    .st-session-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; background: var(--bg-secondary);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      box-shadow: 0 2px 10px rgba(0,0,0,.12); transition: box-shadow .2s, border-color .2s;
    }
    .st-session-row:hover { border-color: rgba(91,141,239,.25); box-shadow: 0 4px 16px rgba(0,0,0,.18); }
    .st-session-icon  { display: flex; align-items: center; color: var(--text-muted); }
    .st-session-info  { flex: 1; }
    .st-session-name  { font-size: 14px; font-weight: 600; }
    .st-session-meta  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .st-session-badge {
      font-size: 11px; font-weight: 800; padding: 3px 10px;
      border-radius: var(--radius-full); background: rgba(52,211,153,.15); color: #34D399;
    }

    /* ── Payments ── */
    .st-info-card {
      background: var(--bg-tertiary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 16px 20px;
      margin-bottom: 24px; display: flex; gap: 14px; align-items: flex-start;
      box-shadow: 0 2px 10px rgba(0,0,0,.1);
    }
    .st-info-card-icon { flex-shrink: 0; display: flex; align-items: center; color: var(--accent-blue); }
    .st-keys-active {
      display: flex; align-items: center; gap: 8px;
      margin: 8px 0; font-size: 13px; color: #34D399; font-weight: 500;
    }
    .st-keys-active svg { flex-shrink: 0; }

    /* ── Subscription ── */
    .st-plans-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 24px; }
    .st-plan-card {
      background: var(--bg-secondary); border: 2px solid var(--border);
      border-radius: var(--radius-xl); padding: 20px;
      display: flex; flex-direction: column; gap: 8px;
      transition: all .2s; position: relative;
      box-shadow: 0 2px 10px rgba(0,0,0,.12);
    }
    .st-plan-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,.2); }
    .st-plan-card.current { border-color: var(--plan-color); background: color-mix(in srgb, var(--plan-color) 6%, var(--bg-secondary)); box-shadow: 0 6px 20px color-mix(in srgb, var(--plan-color) 25%, transparent); }
    .st-plan-icon { display: flex; align-items: center; color: var(--plan-color, var(--text-muted)); }
    .st-plan-name { font-size: 11px; font-weight: 800; letter-spacing: .08em; }
    .st-plan-price { font-family: var(--font-display); font-size: 26px; font-weight: 800; line-height: 1; }
    .st-plan-period { font-size: 13px; font-weight: 400; color: var(--text-muted); }
    .st-plan-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; flex: 1; }
    .st-plan-current-badge {
      text-align: center; padding: 6px; border-radius: var(--radius-md);
      font-size: 11px; font-weight: 800;
      background: color-mix(in srgb, var(--plan-color) 15%, transparent);
      color: var(--plan-color);
    }
    .st-plan-status-badge {
      padding: 5px 14px; border-radius: var(--radius-full);
      font-size: 12px; font-weight: 700;
      background: rgba(148,163,184,.15); color: #94A3B8;
    }
    .st-plan-status-badge.active { background: rgba(52,211,153,.15); color: #34D399; }
    .st-sub-expiry {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; background: var(--bg-secondary);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      font-size: 13px; margin-bottom: 20px; color: var(--text-secondary);
    }
    .st-sub-expiry svg { color: var(--text-muted); flex-shrink: 0; }

    /* ── Danger ── */
    .st-danger-card {
      background: var(--bg-secondary);
      border: 2px solid rgba(239,68,68,.25); border-radius: var(--radius-xl);
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(239,68,68,.08);
    }
    .st-danger-row { display: flex; align-items: center; gap: 14px; padding: 20px 22px; }
    .st-danger-divider { height: 1px; background: rgba(239,68,68,.15); }
    .st-danger-icon {
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; width: 32px; color: var(--text-muted);
    }
    .st-danger-icon-red { color: var(--accent-red); }
    .st-danger-info { flex: 1; }
    .st-danger-title { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
    .st-danger-desc { font-size: 12px; color: var(--text-muted); }

    /* ── Notice ── */
    .st-notice {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; background: rgba(91,141,239,.08);
      border: 1px solid rgba(91,141,239,.2); border-radius: var(--radius-md);
      font-size: 12px; color: var(--text-secondary); line-height: 1.5;
    }
    .st-notice svg { flex-shrink: 0; margin-top: 1px; }
    .st-notice-warn {
      background: rgba(251,191,36,.08); border-color: rgba(251,191,36,.25);
      color: #FBBF24;
    }

    /* ── Toast ── */
    .st-toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      padding: 12px 20px; border-radius: var(--radius-md);
      background: var(--bg-secondary); border: 1px solid var(--border);
      box-shadow: var(--shadow-xl); font-size: 13.5px; font-weight: 600;
      transform: translateY(20px); opacity: 0; transition: all .25s;
    }
    .st-toast-show { transform: translateY(0); opacity: 1; }
    .st-toast-success { border-left: 4px solid #34D399; }
    .st-toast-error   { border-left: 4px solid #F87171; }
    .st-toast-info    { border-left: 4px solid #5B8DEF; }

    /* ── Niche cards ── */
    .st-niche-grid { display: flex; flex-direction: column; gap: 8px; }
    .st-niche-card {
      display: flex; align-items: center; gap: 14px;
      padding: 13px 16px; background: var(--bg-secondary);
      border: 2px solid var(--border); border-radius: var(--radius-lg);
      cursor: pointer; transition: all .15s; text-align: left; width: 100%;
    }
    .st-niche-card:hover { border-color: color-mix(in srgb, var(--nc) 60%, transparent); }
    .st-niche-card.active {
      border-color: var(--nc);
      background: color-mix(in srgb, var(--nc) 8%, var(--bg-secondary));
    }
    .st-niche-icon {
      flex-shrink: 0; width: 28px;
      display: flex; align-items: center; justify-content: center;
      color: var(--nc);
    }
    .st-niche-body  { flex: 1; min-width: 0; }
    .st-niche-title { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
    .st-niche-desc  { font-size: 11px; color: var(--text-muted); }
    .st-niche-check {
      width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
      background: var(--bg-tertiary); border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      color: transparent; transition: all .2s;
    }
    .st-niche-card.active .st-niche-check {
      background: var(--nc); border-color: var(--nc); color: #fff;
    }

    /* @ prefix input */
    .st-input-at { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 700; font-size: 14px; pointer-events: none; }
    .st-input-at-pad { padding-left: 30px !important; }

    /* ── Notifications ── */
    .st-notif-list { display: flex; flex-direction: column; gap: 2px; }
    .st-notif-row {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px; border-radius: var(--radius-md);
      transition: background .15s;
    }
    .st-notif-row:hover { background: var(--bg-secondary); }
    .st-notif-icon {
      flex-shrink: 0; width: 28px;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-muted);
    }
    .st-notif-info  { flex: 1; min-width: 0; }
    .st-notif-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .st-notif-desc  { font-size: 12px; color: var(--text-muted); }

    .st-toggle { position: relative; flex-shrink: 0; cursor: pointer; }
    .st-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
    .st-toggle-track {
      display: block; width: 44px; height: 24px; border-radius: var(--radius-full);
      background: var(--bg-tertiary); border: 1.5px solid var(--border);
      transition: all .2s; position: relative;
    }
    .st-toggle-thumb {
      position: absolute; top: 2px; left: 2px;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--text-muted); transition: all .2s;
    }
    .st-toggle input:checked + .st-toggle-track {
      background: var(--accent-blue); border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(91,141,239,.18);
    }
    .st-toggle input:checked + .st-toggle-track .st-toggle-thumb {
      transform: translateX(20px); background: #fff;
    }
    .st-toggle-track-locked { opacity: .5; }
    .st-toggle input:disabled + .st-toggle-track { cursor: not-allowed; }

    /* ── Responsive ── */
    @media (max-width: 720px) {
      .st-page { grid-template-columns: 1fr; }
      .st-sidebar { height: auto; position: static; border-right: none; border-bottom: 1px solid var(--border); flex-direction: row; flex-wrap: wrap; padding: 12px; }
      .st-sidebar-header { display: none; }
      .st-tabs { flex-direction: row; gap: 4px; flex: none; padding: 0; }
      .st-tab-label { display: none; }
      .st-sidebar-footer { display: none; }
      .st-content { padding: 20px; height: auto; }
      .st-form-grid { grid-template-columns: 1fr; }
      .st-theme-grid { grid-template-columns: 1fr; }
      .st-plans-grid { grid-template-columns: 1fr; }
    }
  `
  document.head.appendChild(s)
}
