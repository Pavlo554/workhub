// src/renderer/app.js
import { addRoute, navigate } from '../core/router.js'
import { onAuthChange, getUserProfile } from './services/auth.js'

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
addRoute('subscribe',         () => import('./pages/subscribe/index.js'))
addRoute('admin',             () => import('./pages/admin/index.js'))
addRoute('team',              () => import('./pages/team/index.js'))
addRoute('join',              () => import('./pages/join/index.js'))
addRoute('business',          () => import('./pages/business/index.js'))

// ── Модулі (спільні для всіх) ─────────────────────────────
addRoute('clients',           () => import('./modules/clients/index.js'))
addRoute('tasks',             () => import('./modules/tasks/index.js'))
addRoute('notes',             () => import('./modules/notes/index.js'))
addRoute('passwords',         () => import('./modules/passwords/index.js'))

// ── Модулі Фрілансер ──────────────────────────────────────
addRoute('projects',          () => import('./modules/projects/index.js'))
addRoute('timer',             () => import('./modules/timer/index.js'))
addRoute('invoices',          () => import('./modules/invoices/index.js'))
addRoute('contracts',         () => import('./modules/contracts/index.js'))

// ── Модулі Бухгалтер ──────────────────────────────────────
addRoute('finances',          () => import('./modules/finances/index.js'))
addRoute('tax-calendar',      () => import('./modules/tax-calendar/index.js'))

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
    navigate('login')
    return
  }

  const profile = await getUserProfile(user.uid)

  // ── Онбординг ──────────────────────────────────────────
  // Старі юзери (без accountType але з onboardingDone) — одразу на dashboard
  if (!profile?.accountType && profile?.onboardingDone) {
    showSidebar(profile)
    navigate('dashboard')
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

  // Все ок — показуємо app
  showSidebar(profile)
  navigate('dashboard')
})

// ── Sidebar ───────────────────────────────────────────────
function showSidebar(profile) {
  let sidebar = document.getElementById('sidebar')
  if (!sidebar) {
    sidebar = document.createElement('div')
    sidebar.id = 'sidebar'
    document.getElementById('app').prepend(sidebar)
  }
  
  // Завжди оновлюємо навігацію з актуальним профілем
  import('./components/navigation.js').then(m => m.renderNavigation(sidebar, profile))
}

function hideSidebar() {
  document.getElementById('sidebar')?.remove()
}