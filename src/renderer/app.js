// src/renderer/app.js
import { addRoute, navigate, clearModuleCache, setPageTracker, prefetchRoute } from '../core/router.js'
import { onAuthChange, getUserProfile, logoutUser, getCurrentUser, getImpersonation, stopImpersonation } from './services/auth.js'
import { checkSubscriptionExpiry }                              from './services/subscription-guard.js'
import { initTheme }                                            from '../core/theme.js'
import { renderNavigation }                                     from './components/navigation.js'
import { trackPage, identifyUser }                              from './services/analytics.js'
import { initAutoUpdater }                                      from './services/updater.js'
import { initErrorLogger }                                      from './services/error-logger.js'
import { startPresenceHeartbeat, stopPresenceHeartbeat }         from './services/presence.js'
import { trackLogin }                                           from './services/device-tracking.js'

initErrorLogger()
setPageTracker(trackPage)
initAutoUpdater()

initTheme()


// ── Маршрути Auth ─────────────────────────────────────────
addRoute('login',             () => import('./pages/auth/login.js'))
addRoute('register',          () => import('./pages/auth/register.js'))

// ── Маршрути Онбординг ────────────────────────────────────
addRoute('choose-role',       () => import('./pages/onboarding/choose-role.js'))
addRoute('choose-profession', () => import('./pages/onboarding/choose-profession.js'))
addRoute('setup-business',    () => import('./pages/onboarding/setup-business.js'))

// ── Головні маршрути ──────────────────────────────────────
addRoute('dashboard',         () => import('./pages/dashboard/index.js'))
addRoute('profile',           () => import('./pages/profile/index.js'))
addRoute('settings',          () => import('./pages/settings/index.js'))
addRoute('faq',               () => import('./modules/faq/index.js'))
addRoute('subscribe',         () => import('./pages/subscribe/index.js'))
addRoute('admin',             () => import('./pages/admin/index.js'))
addRoute('legal',             () => import('./pages/legal/index.js'))
addRoute('team',              () => import('./pages/team/index.js'))
addRoute('join',              () => import('./pages/join/index.js'))
addRoute('business',          () => import('./pages/business/index.js'))

// ── Модулі (спільні для всіх) ─────────────────────────────
addRoute('clients',           () => import('./modules/clients/index.js'))
addRoute('tasks',             () => import('./modules/tasks/index.js'))
addRoute('notes',             () => import('./modules/notes/index.js'))
addRoute('documents',         () => import('./modules/documents/index.js'))
addRoute('api-keys',          () => import('./modules/api-keys/index.js'))
addRoute('passwords',         () => import('./modules/passwords/index.js'))
addRoute('templates',         () => import('./modules/templates/index.js'))
addRoute('warehouse',         () => import('./modules/warehouse/index.js'))
addRoute('portfolio',         () => import('./modules/portfolio/index.js'))
addRoute('hr',                () => import('./modules/hr/index.js'))
addRoute('currency',          () => import('./modules/currency/index.js'))
addRoute('support',           () => import('./modules/support/index.js'))
addRoute('reports',           () => import('./modules/reports/index.js'))

// ── Модулі Фрілансер ──────────────────────────────────────
addRoute('projects',          () => import('./modules/projects/index.js'))
addRoute('timer',             () => import('./modules/timer/index.js'))
addRoute('invoices',          () => import('./modules/invoices/index.js'))
addRoute('contracts',         () => import('./modules/contracts/index.js'))

// ── Модулі Бухгалтер ──────────────────────────────────────
addRoute('finances',          () => import('./modules/finances/index.js'))
addRoute('tax-calendar',      () => import('./modules/tax-calendar/index.js'))
addRoute('payment-calendar',  () => import('./modules/payment-calendar/index.js'))
addRoute('tax-reports',       () => import('./modules/tax-reports/index.js'))

// ── Модулі 1С-стиль (Каса / Банк / Зарплата) ─────────────
addRoute('cashbook',          () => import('./modules/cashbook/index.js'))
addRoute('bank',              () => import('./modules/bank/index.js'))
addRoute('payroll',           () => import('./modules/payroll/index.js'))
addRoute('prro',              () => import('./modules/prro/index.js'))

// ── Модулі Салон краси ────────────────────────────────────
addRoute('appointments',      () => import('./modules/appointments/index.js'))
addRoute('services',          () => import('./modules/services/index.js'))

// ── Модулі SMM ────────────────────────────────────────────
addRoute('content-plan',      () => import('./modules/content-plan/index.js'))
addRoute('accounts',          () => import('./modules/accounts/index.js'))

// ── Titlebar кнопки ───────────────────────────────────────
document.getElementById('tb-minimize')?.addEventListener('click', () => window.electron?.minimize())
document.getElementById('tb-maximize')?.addEventListener('click', () => window.electron?.maximize())
document.getElementById('tb-close')?.addEventListener('click',    () => window.electron?.close())

// ── Auth Guard ────────────────────────────────────────────
onAuthChange(async (user) => {
  if (!user) {
    hideSidebar()
    stopPresenceHeartbeat()
    navigate('login')
    return
  }

  const profile = await getUserProfile(user.uid)

  // Ban check (was in loginUser but caused double Firestore read)
  if (profile?.isBanned) {
    hideSidebar()
    sessionStorage.setItem('auth-error', 'Ваш акаунт заблоковано. Зверніться до підтримки')
    navigate('login')
    logoutUser() // fire-and-forget — onAuthStateChanged will re-trigger but user sees login immediately
    return
  }

  // ── Онбординг ──────────────────────────────────────────
  // Старі юзери (без accountType але з onboardingDone) — перевіряємо чи є ніша
  if (!profile?.accountType && profile?.onboardingDone) {
    if (!profile?.profession) {
      hideSidebar()
      navigate('choose-profession')
      return
    }
    showSidebar(profile)
    navigate('dashboard')
    identifyUser(user.uid, { plan: profile.plan ?? 'free', profession: profile.profession ?? 'unknown', role: 'owner' })
    checkSubscriptionExpiry(user.uid, profile)
    return
  }

  // Новий юзер — ще не обрав роль
  if (!profile?.accountType) {
    hideSidebar()
    navigate('choose-role')
    return
  }

  // Власник: не пройшов онбординг до кінця
  if (profile.accountType === 'owner' && !profile.onboardingDone) {
    hideSidebar()
    navigate(profile.profession ? 'setup-business' : 'choose-profession')
    return
  }

  // Є акаунт але немає ніші — питаємо
  if (profile.accountType === 'owner' && !profile.profession) {
    hideSidebar()
    navigate('choose-profession')
    return
  }

  // Все ок — показуємо app
  showSidebar(profile)
  _realProfile = profile
  navigate('dashboard')
  startPresenceHeartbeat(user.uid)
  trackLogin(user.uid)

  identifyUser(user.uid, {
    plan:       profile.plan        ?? 'free',
    profession: profile.profession  ?? 'unknown',
    role:       profile.accountType ?? 'unknown',
  })

  // Перевірка терміну підписки (після рендеру UI)
  checkSubscriptionExpiry(user.uid, profile)
})

// ── Режим перегляду користувача (admin impersonation) ───────
let _realProfile = null

window.addEventListener('impersonate-start', async () => {
  const imp = getImpersonation()
  if (!imp) return
  clearModuleCache()
  const targetProfile = await getUserProfile(getCurrentUser().uid)
  showSidebar(targetProfile)
  renderImpersonationBanner()
  navigate('dashboard')
})

function renderImpersonationBanner() {
  document.getElementById('impersonate-banner')?.remove()
  const imp = getImpersonation()
  if (!imp) return

  const banner = document.createElement('div')
  banner.id = 'impersonate-banner'
  banner.innerHTML = `
    <span>👁 Перегляд CRM користувача: <strong>${imp.name}</strong></span>
    <button id="impersonate-exit-btn">Вийти з режиму перегляду</button>
  `
  Object.assign(banner.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '99999',
    background: '#A78BFA', color: '#1a1a2e', padding: '8px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
    fontSize: '13px', fontWeight: '700', boxShadow: '0 2px 12px rgba(0,0,0,.3)',
  })
  document.body.appendChild(banner)
  const appEl = document.getElementById('app')
  if (appEl) appEl.style.marginTop = '36px'

  banner.querySelector('#impersonate-exit-btn').addEventListener('click', () => {
    stopImpersonation()
    clearModuleCache()
    showSidebar(_realProfile)
    banner.remove()
    if (appEl) appEl.style.marginTop = ''
    navigate('admin')
  })
}

// ── Sidebar ───────────────────────────────────────────────
let _cachedProfile = null

// Most-visited modules — warm their dynamic import once per session, in
// idle time, so the first real click feels instant (only Firestore latency
// remains, not also the module download/parse).
const PREFETCH_ROUTES = ['clients', 'projects', 'invoices', 'finances', 'tasks', 'settings']
let _prefetched = false
function prefetchCommonModules() {
  if (_prefetched) return
  _prefetched = true
  const run = () => PREFETCH_ROUTES.forEach(r => prefetchRoute(r))
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 1500)
}

function showSidebar(profile) {
  _cachedProfile = profile
  prefetchCommonModules()
  let sidebar = document.getElementById('sidebar')
  if (!sidebar) {
    sidebar = document.createElement('div')
    sidebar.id = 'sidebar'
    document.getElementById('app').prepend(sidebar)
  }
  // navigation.js already imported at top — no dynamic import delay
  renderNavigation(sidebar, profile)
}

function hideSidebar() {
  document.getElementById('sidebar')?.remove()
  clearModuleCache()
}

// Re-render sidebar when language changes (router handles current page separately)
window.addEventListener('lang-change', () => {
  const sidebar = document.getElementById('sidebar')
  if (sidebar && _cachedProfile) renderNavigation(sidebar, _cachedProfile)
})