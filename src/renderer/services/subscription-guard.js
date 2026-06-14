// src/renderer/services/subscription-guard.js
import { updateProfileCache } from './auth.js'
import { navigate } from '../../core/router.js'
import { icon } from '../utils/icons.js'

/**
 * Перевіряє термін підписки при старті.
 * - якщо минуло → знижує план до free + показує модалку
 * - якщо ≤3 дні → показує жовтий банер
 * Повертає (можливо оновлений) profile.
 */
// Повертає дату закінчення підписки з будь-якого з двох полів
function resolveExpiry(profile) {
  // Поле від адмін-панелі (ISO рядок) або від Cloud Function LiqPay (Firestore Timestamp)
  const raw = profile.subscriptionEnd ?? profile.planExpiresAt ?? null
  if (!raw) return null
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

export async function checkSubscriptionExpiry(uid, profile) {
  if (!profile || profile.plan === 'free') return profile

  const now = new Date()
  const end = resolveExpiry(profile)
  if (!end) return profile

  const msLeft   = end - now
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

  injectStyles()

  if (daysLeft <= 0) {
    // Строк минув — оновлюємо тільки локальний кеш
    // Запис у Firestore робить Cloud Function downgradeExpiredSubscriptions (scheduled)
    // або адмін-панель sweep. З клієнта план більше не пишемо (правила блокують).
    updateProfileCache(uid, { plan: 'free', subscriptionStatus: 'expired' })
    showExpiredModal(profile.plan)
    return { ...profile, plan: 'free', subscriptionStatus: 'expired' }
  }

  if (daysLeft <= 3) {
    // Якщо вже показано в цій сесії — не дублюємо
    if (!sessionStorage.getItem('sub-warning-dismissed')) {
      showWarningBanner(daysLeft, profile.plan)
    }
  }

  return profile
}

// ── Warning banner ────────────────────────────────────────
function showWarningBanner(daysLeft, planName) {
  if (document.getElementById('sub-expiry-banner')) return

  const banner = document.createElement('div')
  banner.id    = 'sub-expiry-banner'
  banner.className = 'sub-exp-banner'
  banner.innerHTML = `
    <div class="sub-exp-inner">
      <span class="sub-exp-icon">${icon('timer', 15)}</span>
      <span class="sub-exp-text">
        Підписка <strong>${planName.toUpperCase()}</strong> закінчується
        ${daysLeft === 1 ? '<strong>сьогодні</strong>' : `через <strong>${daysLeft} ${daysWord(daysLeft)}</strong>`}.
        Продовжіть підписку, щоб не втратити доступ до всіх функцій.
      </span>
      <button class="sub-exp-btn" id="sub-exp-renew">Продовжити підписку</button>
      <button class="sub-exp-close" id="sub-exp-close" title="Закрити">${icon('x', 13)}</button>
    </div>
  `

  document.body.appendChild(banner)

  banner.querySelector('#sub-exp-renew').addEventListener('click', () => {
    banner.remove()
    navigate('subscribe')
  })
  banner.querySelector('#sub-exp-close').addEventListener('click', () => {
    banner.style.animation = 'subExpBannerOut .2s forwards'
    setTimeout(() => banner.remove(), 200)
    sessionStorage.setItem('sub-warning-dismissed', '1')
  })
}

// ── Expired modal ─────────────────────────────────────────
function showExpiredModal(planName) {
  if (document.getElementById('sub-expired-modal')) return

  const modal = document.createElement('div')
  modal.id        = 'sub-expired-modal'
  modal.className = 'sub-exp-overlay'
  modal.innerHTML = `
    <div class="sub-exp-modal">
      <div class="sub-exp-modal-icon">${icon('timer', 44)}</div>
      <h2 class="sub-exp-modal-title">Підписка закінчилась</h2>
      <p class="sub-exp-modal-desc">
        Тарифний план <strong>${planName.toUpperCase()}</strong> завершив дію.<br>
        Ви автоматично переведені на <strong>FREE</strong> план.<br>
        Усі ваші дані збережені — оновіть підписку щоб відновити повний доступ.
      </p>
      <button class="sub-exp-modal-btn" id="sub-exp-buy">
        ${icon('upgrade', 16)} Купити новий тариф
      </button>
      <button class="sub-exp-modal-skip" id="sub-exp-skip">
        Продовжити на FREE
      </button>
    </div>
  `

  document.body.appendChild(modal)

  modal.querySelector('#sub-exp-buy').addEventListener('click', () => {
    modal.remove()
    navigate('subscribe')
  })
  modal.querySelector('#sub-exp-skip').addEventListener('click', () => {
    modal.style.animation = 'subExpFadeOut .2s forwards'
    setTimeout(() => modal.remove(), 200)
  })
}

// ── Helpers ───────────────────────────────────────────────
function daysWord(n) {
  if (n === 1) return 'день'
  if (n >= 2 && n <= 4) return 'дні'
  return 'днів'
}

function injectStyles() {
  if (document.getElementById('sub-expiry-styles')) return
  const s = document.createElement('style')
  s.id = 'sub-expiry-styles'
  s.textContent = `
    /* ── Warning banner ── */
    .sub-exp-banner {
      position: fixed;
      top: var(--titlebar-height, 36px);
      left: var(--sidebar-width, 220px);
      right: 0;
      z-index: 1500;
      background: linear-gradient(135deg, rgba(251,191,36,.1), rgba(245,158,11,.07));
      border-bottom: 1px solid rgba(251,191,36,.28);
      padding: 9px 16px;
      animation: subExpBannerIn .25s ease;
    }
    @keyframes subExpBannerIn  { from{opacity:0;transform:translateY(-100%)} to{opacity:1;transform:none} }
    @keyframes subExpBannerOut { from{opacity:1;transform:none} to{opacity:0;transform:translateY(-100%)} }
    .sub-exp-inner {
      display: flex; align-items: center; gap: 10px;
      max-width: 960px;
    }
    .sub-exp-icon  { display:flex; align-items:center; color:#FBBF24; flex-shrink:0; }
    .sub-exp-text  { flex:1; font-size:13px; color:var(--text-secondary); line-height:1.4; }
    .sub-exp-btn {
      padding: 6px 14px;
      background: linear-gradient(135deg, #F59E0B, #D97706);
      border: none; border-radius: 7px; color: #fff;
      font-size: 12px; font-weight: 700; cursor: pointer;
      white-space: nowrap; flex-shrink: 0; transition: all .2s;
    }
    .sub-exp-btn:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(245,158,11,.4); }
    .sub-exp-close {
      width:26px; height:26px; border-radius:6px; border:none; background:none;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      color:var(--text-muted); transition:background .15s; flex-shrink:0;
    }
    .sub-exp-close:hover { background:rgba(251,191,36,.15); color:var(--text-primary); }

    /* ── Expired overlay ── */
    .sub-exp-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.75); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 3000; padding: 24px;
      animation: subExpFadeIn .25s ease;
    }
    @keyframes subExpFadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes subExpFadeOut { from{opacity:1} to{opacity:0} }
    .sub-exp-modal {
      background: var(--bg-secondary);
      border: 1px solid rgba(239,68,68,.25);
      border-radius: 20px; padding: 40px 36px;
      max-width: 440px; width: 100%; text-align: center;
      box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(239,68,68,.12);
      animation: subExpSlideIn .3s cubic-bezier(0.34,1.2,0.64,1);
    }
    @keyframes subExpSlideIn { from{opacity:0;transform:translateY(28px) scale(.95)} to{opacity:1;transform:none} }
    .sub-exp-modal-icon {
      display: flex; align-items: center; justify-content: center;
      width: 88px; height: 88px; border-radius: 50%;
      background: linear-gradient(135deg, #EF4444, #DC2626);
      margin: 0 auto 22px; color: #fff;
    }
    .sub-exp-modal-title {
      font-size: 24px; font-weight: 800; margin-bottom: 12px; color: #F87171;
    }
    .sub-exp-modal-desc {
      font-size: 14px; color: var(--text-secondary);
      line-height: 1.7; margin-bottom: 28px;
    }
    .sub-exp-modal-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px;
      background: linear-gradient(135deg, #667eea, #4F8EF7);
      border: none; border-radius: 12px; color: #fff;
      font-size: 15px; font-weight: 800; cursor: pointer;
      margin-bottom: 12px; transition: all .25s;
    }
    .sub-exp-modal-btn:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(79,142,247,.4); }
    .sub-exp-modal-skip {
      width: 100%; padding: 10px; border: none; background: none;
      cursor: pointer; font-size: 13px; color: var(--text-muted); transition: color .15s;
    }
    .sub-exp-modal-skip:hover { color: var(--text-secondary); }
  `
  document.head.appendChild(s)
}
