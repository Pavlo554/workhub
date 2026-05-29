// src/renderer/services/plan-guard.js
// Перевірка лімітів плану та показ промпту для оновлення

import { navigate } from '../../core/router.js'
import { icon } from '../utils/icons.js'

/**
 * Показує модалку "досягнуто ліміту FREE"
 * @param {string} title   — заголовок (напр. "Ліміт: 50 клієнтів")
 * @param {string} message — пояснення
 */
export function showUpgradePrompt(title, message) {
  const existing = document.getElementById('upgrade-prompt-modal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.id = 'upgrade-prompt-modal'
  modal.className = 'upgrade-overlay'
  modal.innerHTML = `
    <div class="upgrade-modal">
      <div class="upgrade-icon">${icon('star', 40)}</div>
      <h2 class="upgrade-title">${title}</h2>
      <p class="upgrade-desc">${message}</p>
      <div class="upgrade-features">
        <div class="upgrade-feature" style="display:flex;align-items:center;gap:6px">${icon('check-circle', 14)}Необмежена кількість клієнтів</div>
        <div class="upgrade-feature" style="display:flex;align-items:center;gap:6px">${icon('check-circle', 14)}Необмежена кількість рахунків</div>
        <div class="upgrade-feature" style="display:flex;align-items:center;gap:6px">${icon('check-circle', 14)}Експорт PDF</div>
        <div class="upgrade-feature" style="display:flex;align-items:center;gap:6px">${icon('check-circle', 14)}Розширена аналітика</div>
      </div>
      <div class="upgrade-actions">
        <button class="btn btn-primary upgrade-btn-pro" id="upgrade-go-pro">
          ${icon('star', 15)} Оновити до PRO — ₴299/міс
        </button>
        <button class="btn btn-secondary upgrade-btn-cancel" id="upgrade-cancel">
          Залишитись на FREE
        </button>
      </div>
    </div>
  `

  injectStyles()
  document.body.appendChild(modal)

  modal.querySelector('#upgrade-go-pro').addEventListener('click', () => {
    modal.remove()
    navigate('subscribe')
  })
  modal.querySelector('#upgrade-cancel').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}

/**
 * Перевіряє чи може FREE-користувач додати новий запис
 * @param {object} profile   — профіль юзера
 * @param {string} resource  — 'clients' | 'invoices-monthly'
 * @param {number} current   — поточна кількість
 * @returns {boolean} true = дозволено, false = заблоковано (показана підказка)
 */
export function checkPlanLimit(profile, resource, current) {
  if (profile?.plan && profile.plan !== 'free') return true

  const limits = {
    'clients':          { limit: 50,  label: 'клієнтів',          unit: 'клієнтів' },
    'invoices-monthly': { limit: 20,  label: 'рахунків на місяць', unit: 'рахунків цього місяця' },
    'projects':         { limit: 10,  label: 'проектів',           unit: 'проектів' },
    'passwords':        { limit: 30,  label: 'паролів',            unit: 'паролів' },
  }

  const rule = limits[resource]
  if (!rule || current < rule.limit) return true

  showUpgradePrompt(
    `Ліміт FREE плану: ${rule.limit} ${rule.label}`,
    `Ви досягли ліміту ${rule.limit} ${rule.unit}. Оновіть план щоб продовжити.`
  )
  return false
}

function injectStyles() {
  if (document.getElementById('upgrade-prompt-styles')) return
  const style = document.createElement('style')
  style.id = 'upgrade-prompt-styles'
  style.textContent = `
    .upgrade-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:2000; padding:24px; }
    .upgrade-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:36px 32px; max-width:440px; width:100%; text-align:center; box-shadow:var(--shadow-xl); animation:scaleIn .25s cubic-bezier(0.34,1.2,0.64,1); }
    .upgrade-icon    { display:flex; align-items:center; justify-content:center; margin-bottom:16px; color:#F59E0B; }
    .upgrade-title   { font-family:var(--font-display); font-size:22px; font-weight:800; margin-bottom:10px; }
    .upgrade-desc    { font-size:14px; color:var(--text-secondary); margin-bottom:20px; line-height:1.5; }
    .upgrade-features { background:var(--bg-tertiary); border-radius:var(--radius-md); padding:16px; margin-bottom:24px; text-align:left; display:flex; flex-direction:column; gap:8px; }
    .upgrade-feature { font-size:13px; font-weight:600; color:#34D399; display:flex; align-items:center; gap:6px; }
    .upgrade-actions { display:flex; flex-direction:column; gap:10px; }
    .upgrade-btn-pro    { background:linear-gradient(135deg,#667eea 0%,#4F8EF7 100%); font-size:15px; font-weight:700; height:48px; }
    .upgrade-btn-cancel { font-size:13px; color:var(--text-muted); }
    @keyframes scaleIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}
