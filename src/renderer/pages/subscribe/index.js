// src/renderer/pages/subscribe/index.js
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import {
  getPaymentConfig, getCryptoAddress, getMonobankJar,
  fetchCryptoRate, calculateCryptoAmount, createPendingPayment
} from '../../services/crypto-payment.js'
import { sendPaymentNotification } from '../../services/telegram-notifications.js'
import { db } from '../../services/firebase.js'
import { createLiqPayUrl } from '../../services/liqpay-client.js'
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'

const PLANS = [
  {
    id: 'free',
    name: 'FREE',
    price: 0,
    period: 'назавжди',
    svgIcon: icon('join', 32),
    color: '#64748B',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    features: [
      '+ До 50 клієнтів',
      '+ До 20 рахунків на місяць',
      '+ Базові звіти',
      '+ Email підтримка',
      '- Експорт в PDF',
      '- Аналітика',
      '- Автоматизація',
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    price: 299,
    period: 'місяць',
    svgIcon: icon('upgrade', 32),
    color: '#5B8DEF',
    gradient: 'linear-gradient(135deg, #667eea 0%, #5B8DEF 100%)',
    popular: true,
    savings: 'Найпопулярніший',
    features: [
      '+ Необмежено клієнтів',
      '+ Необмежено рахунків',
      '+ Розширені звіти',
      '+ Пріоритетна підтримка',
      '+ Експорт в PDF',
      '+ Повна аналітика',
      '+ Автоматизація процесів',
      '+ Кастомний брендінг',
    ],
  },
  {
    id: 'business',
    name: 'BUSINESS',
    price: 799,
    period: 'місяць',
    svgIcon: icon('business', 32),
    color: '#34D399',
    gradient: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
    savings: 'Для команд',
    features: [
      '+ Все з PRO +',
      '+ До 5 користувачів',
      '+ Командна робота',
      '+ API доступ',
      '+ Власний домен',
      '+ Інтеграції (1C, Excel)',
      '+ Персональний менеджер',
      '+ SLA підтримка 24/7',
    ],
  },
]

export async function render(container) {
  const user = getCurrentUser()
  const profile = await getUserProfile(user.uid)
  const currentPlan = profile?.plan || 'free'

  container.innerHTML = `
    <div class="sub-page">

      <!-- Hero -->
      <div class="sub-hero">
        <div class="sub-hero-inner">
          <div class="sub-hero-pill">${icon('upgrade', 12)} Преміум</div>
          <h1 class="sub-title">Оберіть свій план</h1>
          <p class="sub-subtitle">Розблокуйте всі можливості WorkHub та автоматизуйте бізнес</p>
        </div>
      </div>

      <!-- Current plan banner -->
      ${currentPlan !== 'free' ? '' : `
      <div class="sub-banner">
        <div class="sub-banner-left">
          <div class="sub-banner-icon">${getPlanSvgIcon(currentPlan, 32)}</div>
          <div>
            <div class="sub-banner-label">Поточний план</div>
            <div class="sub-banner-name">${currentPlan.toUpperCase()}</div>
          </div>
        </div>
        <button class="sub-upgrade-btn" data-plan="pro">${icon('upgrade', 14)} Оновити до PRO</button>
      </div>`}

      <!-- Plans -->
      <div class="sub-plans">
        ${PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id
          const badge = isCurrent
            ? `<div class="sub-badge sub-badge-active">${icon('check', 10)} Активний</div>`
            : plan.popular
            ? `<div class="sub-badge sub-badge-popular">${icon('upgrade', 10)} Популярний</div>`
            : plan.savings
            ? `<div class="sub-badge sub-badge-info">${plan.savings}</div>`
            : ''
          return `
          <div class="sub-card ${plan.popular ? 'sub-card-featured' : ''} ${isCurrent ? 'sub-card-current' : ''}"
               style="--pc:${plan.color};--pg:${plan.gradient}">
            ${badge}
            <div class="sub-card-top">
              <div class="sub-card-icon" style="background:${plan.gradient}">${plan.svgIcon}</div>
              <div class="sub-card-name">${plan.name}</div>
              <div class="sub-card-price">
                ${plan.price === 0
                  ? '<span class="sub-price-free">Безкоштовно</span>'
                  : `<span class="sub-price-val">₴${plan.price}</span><span class="sub-price-per">/ міс</span>`}
              </div>
            </div>
            <ul class="sub-features">
              ${plan.features.map(f => {
                const off = f.startsWith('-')
                return `<li class="sub-feat ${off ? 'sub-feat-off' : ''}">
                  <span class="sub-feat-dot ${off ? 'off' : ''}"></span>
                  <span>${f.substring(2)}</span>
                </li>`
              }).join('')}
            </ul>
            <button class="sub-btn ${isCurrent ? 'sub-btn-current' : 'sub-btn-buy'}"
                    ${isCurrent ? 'disabled' : ''} data-plan="${plan.id}">
              ${isCurrent ? `${icon('check', 14)} Ваш план` : plan.id === 'free' ? 'Обрати FREE' : 'Обрати план'}
            </button>
          </div>`
        }).join('')}
      </div>

      <!-- Why upgrade -->
      <div class="sub-why">
        <h2 class="sub-section-title">Чому варто оновитись?</h2>
        <div class="sub-why-grid">
          ${[
            { iconName: 'reports',  title: 'Розширена аналітика',    desc: 'Детальні звіти та графіки для прийняття рішень' },
            { iconName: 'upgrade',  title: 'Автоматизація',          desc: 'Автоматичні нагадування та шаблони документів' },
            { iconName: 'sparkles', title: 'Брендінг',               desc: 'Ваш логотип на рахунках і договорах' },
            { iconName: 'support',  title: 'Пріоритетна підтримка',  desc: 'Швидка відповідь та нові функції першими' },
          ].map(i => `
            <div class="sub-why-card">
              <div class="sub-why-icon">${icon(i.iconName, 32)}</div>
              <div class="sub-why-title">${i.title}</div>
              <div class="sub-why-desc">${i.desc}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- FAQ -->
      <div class="sub-faq">
        <h2 class="sub-section-title">Часті питання</h2>
        <div class="sub-faq-grid">
          ${[
            { q: 'Які способи оплати?',        a: 'Картка Visa/Mastercard через LiqPay (миттєва активація), Monobank або криптовалюта.' },
            { q: 'Можна скасувати підписку?',  a: 'Так, в будь-який момент. Доступ зберігається до кінця оплаченого терміну.' },
            { q: 'Що буде з моїми даними?',    a: 'Всі дані залишаються навіть після скасування підписки.' },
            { q: 'Коли активується план?',     a: 'LiqPay (картка) — автоматично одразу після оплати. Monobank / крипта — 1-2 год.' },
          ].map(i => `
            <div class="sub-faq-card">
              <div class="sub-faq-q">${i.q}</div>
              <div class="sub-faq-a">${i.a}</div>
            </div>`).join('')}
        </div>
      </div>

    </div>
  `

  injectStyles()

  container.querySelectorAll('.sub-btn, .sub-upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const planId = btn.dataset.plan
      if (!planId || planId === currentPlan) return
      if (planId === 'free') {
        if (confirm('Повернутися на безкоштовний план?')) alert('Функція скасування підписки в розробці')
      } else {
        showPaymentModal(planId)
      }
    })
  })

  async function showPaymentModal(planId) {
    const plan = PLANS.find(p => p.id === planId)
    const cfg  = await getPaymentConfig()
    const mono = getMonobankJar(cfg)
    const hasUsdt   = !!getCryptoAddress(cfg, 'USDT')
    const hasBtc    = !!getCryptoAddress(cfg, 'BTC')
    const hasEth    = !!getCryptoAddress(cfg, 'ETH')
    const hasCrypto = hasUsdt || hasBtc || hasEth
    const hasLiqPay = !!(cfg.liqpayPublicKey && cfg.liqpayPrivateKey)

    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon" style="background: ${plan.gradient}">${plan.svgIcon}</div>
            <div>
              <h2 class="modal-title">${plan.name} План</h2>
              <p class="modal-subtitle">₴${plan.price} / місяць</p>
            </div>
          </div>
          <button class="modal-close" id="close-payment">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="section-label">Оберіть спосіб оплати</div>
          <div class="payment-methods-grid">
            ${hasLiqPay ? `
            <button class="payment-method-card payment-method-featured" data-method="liqpay">
              <div class="payment-method-icon" style="color:#FF6B35">${icon('finances', 26)}</div>
              <div class="payment-method-content">
                <div class="payment-method-title">Картка (LiqPay) <span class="pay-auto-badge">Авто</span></div>
                <div class="payment-method-desc">Visa / Mastercard — миттєва активація</div>
              </div>
              <div class="payment-method-arrow">${icon('chevron-right', 16)}</div>
            </button>` : ''}
            ${mono ? `
            <button class="payment-method-card" data-method="monobank">
              <div class="payment-method-icon">${icon('finances', 26)}</div>
              <div class="payment-method-content">
                <div class="payment-method-title">Monobank</div>
                <div class="payment-method-desc">Картка / Банка — ручне підтвердження</div>
              </div>
              <div class="payment-method-arrow">${icon('chevron-right', 16)}</div>
            </button>` : ''}
            ${hasCrypto ? `
            <button class="payment-method-card" data-method="crypto">
              <div class="payment-method-icon" style="font-size:24px;font-weight:700">₿</div>
              <div class="payment-method-content">
                <div class="payment-method-title">Криптовалюта</div>
                <div class="payment-method-desc">${[hasUsdt?'USDT':null,hasBtc?'BTC':null,hasEth?'ETH':null].filter(Boolean).join(', ')}</div>
              </div>
              <div class="payment-method-arrow">${icon('chevron-right', 16)}</div>
            </button>` : ''}
            ${!hasLiqPay && !mono && !hasCrypto ? `
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">
              Способи оплати ще не налаштовані.<br>Зверніться до адміністратора.
            </div>` : ''}
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#close-payment').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

    modal.querySelectorAll('.payment-method-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.method
        modal.remove()
        if (method === 'liqpay')    showLiqPayPayment(plan)
        else if (method === 'monobank') showMonobankPayment(plan, cfg)
        else if (method === 'crypto')   showCryptoPayment(plan, cfg)
      })
    })
  }

  function showLiqPayPayment(plan) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container" style="max-width:460px">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon" style="background:linear-gradient(135deg,#FF6B35,#FF8C00)">${icon('finances', 24)}</div>
            <div>
              <h2 class="modal-title">Оплата карткою</h2>
              <p class="modal-subtitle">LiqPay — Visa / Mastercard</p>
            </div>
          </div>
          <button class="modal-close" id="close-liqpay">${icon('x', 16)}</button>
        </div>
        <div class="modal-body" id="liqpay-body">
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:40px 0;color:var(--text-muted)">
            <div class="btn-spinner" style="border-color:rgba(255,107,53,.3);border-top-color:#FF6B35;width:22px;height:22px"></div>
            <span style="font-size:14px">Створюємо платіж...</span>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    let unsubscribePlan = null

    const closeBtn = modal.querySelector('#close-liqpay')
    closeBtn.addEventListener('click', () => {
      if (unsubscribePlan) unsubscribePlan()
      modal.remove()
    })
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        if (unsubscribePlan) unsubscribePlan()
        modal.remove()
      }
    })

    createLiqPayUrl(user.uid, plan.id, 1)
      .then(({ url }) => {
        // Open LiqPay checkout in system browser
        if (window.electron?.openExternal) {
          window.electron.openExternal(url)
        } else {
          window.open(url, '_blank')
        }

        // Show waiting UI
        modal.querySelector('#liqpay-body').innerHTML = `
          <div class="liqpay-waiting">
            <div class="liqpay-waiting-icon">
              <div class="liqpay-pulse"></div>
              ${icon('finances', 36)}
            </div>
            <div class="liqpay-waiting-title">Очікуємо оплату</div>
            <div class="liqpay-waiting-desc">
              Сторінка оплати відкрита у браузері.<br>
              Після успішної оплати адміністратор активує підписку.
            </div>
            <div class="liqpay-plan-pill">
              ${plan.svgIcon} <strong>${plan.name}</strong> — ₴${plan.price} / міс
            </div>
            <div class="liqpay-status" id="liqpay-status">
              <div class="btn-spinner" style="border-color:rgba(255,107,53,.3);border-top-color:#FF6B35"></div>
              <span>Очікуємо підтвердження...</span>
            </div>
          </div>
        `

        // Listen for plan activation via Firestore onSnapshot (fires when admin approves OR webhook activates)
        unsubscribePlan = onSnapshot(doc(db, 'users', user.uid), snap => {
          const data = snap.data()
          if (data?.plan === plan.id) {
            unsubscribePlan()
            unsubscribePlan = null
            modal.remove()
            showSuccessModal(plan.name)
          }
        })
      })
      .catch(err => {
        console.error('createLiqPayUrl error:', err)
        modal.querySelector('#liqpay-body').innerHTML = `
          <div style="padding:24px;text-align:center">
            <div style="color:#F87171;font-size:14px;margin-bottom:16px">
              ${icon('x', 18)} Помилка: ${err.message || 'Не вдалося створити платіж'}
            </div>
            <button class="btn-primary-large" id="liqpay-retry" style="max-width:200px;margin:0 auto">
              Спробувати ще
            </button>
          </div>
        `
        modal.querySelector('#liqpay-retry')?.addEventListener('click', () => {
          modal.remove()
          showLiqPayPayment(plan)
        })
      })
  }

  function showMonobankPayment(plan, cfg) {
    const jarUrl = getMonobankJar(cfg)
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container" style="max-width:460px">
        <div class="modal-header">
          <h2 class="modal-title">Оплата через Monobank</h2>
          <button class="modal-close" id="close-mono">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="crypto-instructions-card" style="margin-bottom:20px">
            <div class="instructions-header">
              <span class="instructions-icon">${icon('copy', 18)}</span>
              <span class="instructions-title">Як оплатити</span>
            </div>
            <ol class="instructions-list">
              <li>Натисніть кнопку "Відкрити банку" нижче</li>
              <li>Переказуйте <strong>₴${plan.price}</strong> за план <strong>${plan.name}</strong></li>
              <li>У коментарі вкажіть ваш ID: <code style="font-family:monospace;font-size:12px">${user.uid.slice(0, 12)}</code></li>
              <li>Натисніть "Я оплатив" — ми активуємо протягом 1-2 год</li>
            </ol>
          </div>
          <a href="${jarUrl}" target="_blank" class="btn-primary-large btn-link-block" style="margin-bottom:14px">
            ${icon('external-link', 16)} Відкрити банку Monobank
          </a>
          <button class="btn-primary-large btn-confirm" id="confirm-mono">
            <span class="btn-check-icon">${icon('check', 18)}</span> Я оплатив
          </button>
          <div class="user-id-card" style="margin-top:14px">
            <span class="user-id-label">Ваш ID:</span>
            <code class="user-id-code">${user.uid.slice(0, 12)}</code>
            <button class="btn-copy-id" id="copy-uid">
              <span class="copy-icon">${icon('copy', 14)}</span>
            </button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#close-mono').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
    modal.querySelector('#copy-uid').addEventListener('click', () => {
      navigator.clipboard.writeText(user.uid)
      const copyEl = modal.querySelector('#copy-uid .copy-icon')
      copyEl.innerHTML = icon('check', 14)
      setTimeout(() => { copyEl.innerHTML = icon('copy', 14) }, 2000)
    })
    modal.querySelector('#confirm-mono').addEventListener('click', async () => {
      const btn = modal.querySelector('#confirm-mono')
      btn.disabled = true
      btn.innerHTML = '<div class="btn-spinner"></div> Відправляємо...'
      try {
        const payId = await createPendingPayment(user.uid, plan.id, plan.price, 'monobank', { userId: user.uid })
        await sendPaymentNotification({
          userId: user.uid, userName: profile.name, userEmail: user.email,
          planName: plan.name, amount: plan.price, currency: 'UAH',
          cryptoAmount: null, address: jarUrl, paymentId: payId
        })
        modal.remove()
        showWaitingModal(plan.name)
      } catch (err) {
        console.error('confirm-mono error:', err)
        btn.disabled = false
        btn.innerHTML = `<span class="btn-check-icon">${icon('check', 18)}</span> Я оплатив`
        showErrBanner(modal, `Помилка: ${err.message || 'невідома'}`)
      }
    })
  }

  function showCryptoPayment(plan, cfg) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container modal-crypto">
        <div class="modal-header">
          <h2 class="modal-title">Оплата криптовалютою</h2>
          <button class="modal-close" id="close-crypto">${icon('x', 16)}</button>
        </div>

        <div class="modal-body">
          <div class="crypto-step">
            <div class="crypto-step-number">1</div>
            <div class="crypto-step-content">
              <div class="section-label">Оберіть криптовалюту</div>
              <div class="crypto-currencies-grid">
                ${getCryptoAddress(cfg,'USDT') ? `<button class="crypto-currency-card" data-currency="USDT"><div class="crypto-currency-icon" style="font-weight:800">₮</div><div class="crypto-currency-name">USDT TRC20</div><div class="crypto-currency-badge">Найдешевша комісія</div></button>` : ''}
                ${getCryptoAddress(cfg,'BTC')  ? `<button class="crypto-currency-card" data-currency="BTC"><div class="crypto-currency-icon" style="font-weight:800">₿</div><div class="crypto-currency-name">Bitcoin</div></button>` : ''}
                ${getCryptoAddress(cfg,'ETH')  ? `<button class="crypto-currency-card" data-currency="ETH"><div class="crypto-currency-icon" style="font-weight:800">Ξ</div><div class="crypto-currency-name">Ethereum</div></button>` : ''}
              </div>
            </div>
          </div>

          <div class="crypto-details" id="crypto-details" style="display:none">

            <div class="crypto-step">
              <div class="crypto-step-number">2</div>
              <div class="crypto-step-content">
                <div class="crypto-amount-card">
                  <div class="crypto-amount-label">Сума до оплати</div>
                  <div class="crypto-amount-value" id="crypto-amount">0.00000000</div>
                  <div class="crypto-amount-fiat">≈ ₴${plan.price}</div>
                </div>
              </div>
            </div>

            <div class="crypto-step">
              <div class="crypto-step-number">3</div>
              <div class="crypto-step-content">
                <div class="crypto-address-card">
                  <div class="section-label">Адреса для переказу</div>
                  <div class="crypto-address-box">
                    <div class="crypto-address-text" id="crypto-address">...</div>
                  </div>
                  <button class="btn-copy" id="copy-address">
                    <span class="copy-icon">${icon('copy', 16)}</span>
                    <span class="copy-text">Копіювати адресу</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="crypto-instructions-card">
              <div class="instructions-header">
                <span class="instructions-icon">${icon('support', 18)}</span>
                <span class="instructions-title">Інструкція</span>
              </div>
              <ol class="instructions-list">
                <li>Скопіюйте адресу вище</li>
                <li>Відкрийте ваш крипто-гаманець (Trustee Plus, Binance)</li>
                <li>Надішліть <strong>точно вказану суму</strong></li>
                <li>Натисніть кнопку "Я оплатив" нижче</li>
                <li>Очікуйте підтвердження протягом 1-2 годин</li>
              </ol>
            </div>

            <button class="btn-primary-large btn-confirm" id="confirm-payment">
              <span class="btn-check-icon">${icon('check', 18)}</span>
              Я оплатив
            </button>

            <div class="user-id-card">
              <span class="user-id-label">Ваш ID:</span>
              <code class="user-id-code" id="user-id">${user.uid.slice(0, 12)}</code>
              <button class="btn-copy-id" id="copy-id">
                <span class="copy-icon">${icon('copy', 14)}</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    modal.querySelector('#close-crypto').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

    modal.querySelector('#copy-id')?.addEventListener('click', () => {
      navigator.clipboard.writeText(user.uid)
      const copyEl = modal.querySelector('#copy-id .copy-icon')
      copyEl.innerHTML = icon('check', 14)
      setTimeout(() => { copyEl.innerHTML = icon('copy', 14) }, 2000)
    })

    let currentPaymentId = null
    let currentCurrency  = null
    let currentCryptoAmt = null

    modal.querySelectorAll('.crypto-currency-card').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentCurrency = btn.dataset.currency
        modal.querySelectorAll('.crypto-currency-card').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        const address = getCryptoAddress(cfg, currentCurrency)
        if (!address) { alert('Адреса не налаштована. Зверніться в підтримку.'); return }

        modal.querySelector('#crypto-details').style.display = 'block'
        modal.querySelector('#crypto-amount').textContent = 'Завантаження курсу...'
        modal.querySelector('#crypto-address').textContent = address

        const rate = await fetchCryptoRate(currentCurrency)
        currentCryptoAmt = calculateCryptoAmount(plan.price, rate)
        modal.querySelector('#crypto-amount').textContent = `${currentCryptoAmt} ${currentCurrency}`

        modal.querySelector('#copy-address').onclick = () => {
          navigator.clipboard.writeText(address)
          const copyText = modal.querySelector('#copy-address .copy-text')
          const copyIconEl = modal.querySelector('#copy-address .copy-icon')
          copyIconEl.innerHTML = icon('check', 16)
          copyText.textContent = 'Скопійовано!'
          modal.querySelector('#copy-address').style.background = 'linear-gradient(135deg, #34D399, #10B981)'
          setTimeout(() => {
            copyIconEl.innerHTML = icon('copy', 16)
            copyText.textContent = 'Копіювати адресу'
            modal.querySelector('#copy-address').style.background = ''
          }, 2000)
        }

        try {
          currentPaymentId = await createPendingPayment(user.uid, plan.id, plan.price, currentCurrency, {
            cryptoAmount: currentCryptoAmt, address, userId: user.uid
          })
        } catch (err) { console.error(err) }
      })
    })

    modal.querySelector('#confirm-payment')?.addEventListener('click', async () => {
      if (!currentCurrency) { alert('Спочатку оберіть валюту'); return }
      const btn = modal.querySelector('#confirm-payment')
      btn.disabled = true
      btn.innerHTML = '<div class="btn-spinner"></div> Відправляємо...'
      try {
        if (!currentPaymentId) {
          currentPaymentId = await createPendingPayment(user.uid, plan.id, plan.price, currentCurrency, {
            cryptoAmount: currentCryptoAmt,
            address: getCryptoAddress(cfg, currentCurrency),
            userId: user.uid,
          })
        }
        await sendPaymentNotification({
          userId: user.uid, userName: profile.name, userEmail: user.email,
          planName: plan.name, amount: plan.price, currency: currentCurrency,
          cryptoAmount: currentCryptoAmt, address: getCryptoAddress(cfg, currentCurrency),
          paymentId: currentPaymentId
        })
        modal.remove()
        showWaitingModal(plan.name)
      } catch (err) {
        console.error('confirm-payment error:', err)
        btn.disabled = false
        btn.innerHTML = `<span class="btn-check-icon">${icon('check', 18)}</span> Я оплатив`
        showErrBanner(modal, `Помилка: ${err.message || 'невідома'}`)
      }
    })
  }

  function showErrBanner(modal, msg) {
    const existing = modal.querySelector('.sub-err-banner')
    if (existing) existing.remove()
    const el = document.createElement('div')
    el.className = 'sub-err-banner'
    el.style.cssText = 'margin-top:14px;padding:12px 16px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:10px;font-size:13px;color:#F87171;line-height:1.5'
    el.textContent = msg
    modal.querySelector('.modal-body').appendChild(el)
  }

  function showWaitingModal(planName) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container success-modal">
        <div class="success-icon-circle">
          <div class="success-icon">${icon('timer', 44)}</div>
        </div>
        <h2 class="success-title">Очікуємо підтвердження</h2>
        <p class="success-message">
          Ваша заявка на підписку <strong>${planName}</strong> відправлена.<br>
          Ми перевіримо платіж і активуємо підписку протягом <strong>1-2 годин</strong>.
        </p>
        <div class="success-note">
          ${icon('documents', 14)} Ви отримаєте email коли підписка буде активована
        </div>
        <button class="btn-primary-large" id="btn-understood">
          Зрозуміло
        </button>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#btn-understood').addEventListener('click', () => {
      modal.remove()
      location.reload()
    })
  }

  function showSuccessModal(planName) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container success-modal">
        <div class="success-icon-circle">
          <div class="success-icon">${icon('sparkles', 44)}</div>
        </div>
        <h2 class="success-title">Вітаємо!</h2>
        <p class="success-message">
          Підписка <strong>${planName}</strong> успішно активована
        </p>
        <button class="btn-primary-large" id="btn-great">
          Чудово!
        </button>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#btn-great').addEventListener('click', () => {
      modal.remove()
      location.reload()
    })
  }

  function getPlanColor(planId) {
    return PLANS.find(p => p.id === planId)?.color || '#64748B'
  }

  function getPlanGradient(planId) {
    return PLANS.find(p => p.id === planId)?.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }
}

function getPlanSvgIcon(planId, size = 28) {
  const map = { free: 'join', pro: 'upgrade', business: 'business' }
  return icon(map[planId] || 'upgrade', size)
}

function injectStyles() {
  if (document.getElementById('sub-styles')) return
  const s = document.createElement('style')
  s.id = 'sub-styles'
  s.textContent = `
  /* ── Page ── */
  .sub-page { padding: 40px 32px 64px; max-width: 1200px; margin: 0 auto; }

  /* ── Hero ── */
  .sub-hero { text-align: center; margin-bottom: 32px; }
  .sub-hero-inner { display: inline-flex; flex-direction: column; align-items: center; gap: 10px; }
  .sub-hero-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(91,141,239,.15); border: 1px solid rgba(91,141,239,.3);
    color: var(--accent-blue); padding: 5px 14px; border-radius: 50px;
    font-size: 12px; font-weight: 700; letter-spacing: .04em;
  }
  .sub-title { font-size: 36px; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
  .sub-subtitle { font-size: 15px; color: var(--text-secondary); max-width: 480px; line-height: 1.6; }

  /* ── Banner ── */
  .sub-banner {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 14px; padding: 16px 20px; margin-bottom: 28px; flex-wrap: wrap;
  }
  .sub-banner-left { display: flex; align-items: center; gap: 14px; }
  .sub-banner-icon { display: flex; align-items: center; color: var(--text-muted); }
  .sub-banner-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); font-weight: 600; }
  .sub-banner-name { font-size: 20px; font-weight: 800; line-height: 1.2; }
  .sub-upgrade-btn {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 10px 20px; background: linear-gradient(135deg,#667eea,#5B8DEF);
    border: none; border-radius: 10px; color: #fff; font-weight: 700;
    font-size: 14px; cursor: pointer; transition: all .25s; white-space: nowrap;
  }
  .sub-upgrade-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(91,141,239,.4); }

  /* ── Plans grid ── */
  .sub-plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 60px; align-items: start; }
  @media (max-width: 860px) { .sub-plans { grid-template-columns: 1fr; max-width: 420px; margin-inline: auto; } }

  /* ── Plan card ── */
  .sub-card {
    background: var(--bg-secondary); border: 1.5px solid var(--border);
    border-radius: 18px; padding: 28px 24px 24px; position: relative;
    transition: transform .25s, box-shadow .25s, border-color .25s;
    display: flex; flex-direction: column;
  }
  .sub-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.25); }
  .sub-card-featured { border-color: var(--pc); box-shadow: 0 0 0 1px var(--pc), 0 8px 24px rgba(91,141,239,.18); transform: translateY(-6px); }
  .sub-card-featured:hover { transform: translateY(-10px); box-shadow: 0 0 0 1px var(--pc), 0 18px 40px rgba(91,141,239,.25); }
  .sub-card-current { border-color: #34D399; }

  /* ── Badge ── */
  .sub-badge {
    position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
    padding: 4px 14px; border-radius: 50px; font-size: 11px; font-weight: 700;
    white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;
  }
  .sub-badge-popular { background: var(--pg); color: #fff; }
  .sub-badge-active  { background: #34D399; color: #fff; }
  .sub-badge-info    { background: rgba(52,211,153,.18); border: 1px solid rgba(52,211,153,.4); color: #34D399; }

  /* ── Card top ── */
  .sub-card-top { text-align: center; margin-bottom: 20px; }
  .sub-card-icon {
    width: 64px; height: 64px; border-radius: 16px;
    display: inline-flex; align-items: center; justify-content: center;
    margin-bottom: 12px; color: #fff;
  }
  .sub-card-name { font-size: 18px; font-weight: 800; letter-spacing: .02em; margin-bottom: 10px; }
  .sub-card-price { display: flex; align-items: baseline; justify-content: center; gap: 4px; }
  .sub-price-val { font-size: 40px; font-weight: 900; line-height: 1; }
  .sub-price-per { font-size: 13px; color: var(--text-muted); }
  .sub-price-free { font-size: 22px; font-weight: 700; color: var(--text-secondary); }

  /* ── Features ── */
  .sub-features {
    list-style: none; padding: 0; margin: 0 0 24px; flex: 1;
    border-top: 1px solid var(--border); padding-top: 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .sub-feat { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .sub-feat-off { color: var(--text-muted); }
  .sub-feat-dot { width: 7px; height: 7px; border-radius: 50%; background: #34D399; flex-shrink: 0; }
  .sub-feat-dot.off { background: var(--border); }

  /* ── Button ── */
  .sub-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; padding: 13px; border-radius: 10px; font-weight: 700;
    font-size: 14px; border: none; cursor: pointer; transition: all .25s; margin-top: auto;
  }
  .sub-btn-buy { background: var(--pg); color: #fff; }
  .sub-btn-buy:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  .sub-btn-current { background: var(--bg-tertiary); color: var(--text-muted); cursor: default; }

  /* ── Section title ── */
  .sub-section-title { font-size: 26px; font-weight: 800; text-align: center; margin-bottom: 28px; letter-spacing: -.01em; }

  /* ── Why grid ── */
  .sub-why { margin-bottom: 56px; }
  .sub-why-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .sub-why-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 14px; padding: 22px 20px; text-align: center;
    transition: border-color .2s, transform .2s;
  }
  .sub-why-card:hover { border-color: var(--accent-blue); transform: translateY(-3px); }
  .sub-why-icon {
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 10px; color: var(--accent-blue);
  }
  .sub-why-title { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
  .sub-why-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }

  /* ── FAQ ── */
  .sub-faq { margin-bottom: 40px; }
  .sub-faq-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  .sub-faq-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 12px; padding: 18px 20px; transition: border-color .2s;
  }
  .sub-faq-card:hover { border-color: var(--accent-blue); }
  .sub-faq-q { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
  .sub-faq-a { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }

  /* ── Modal ── */
  .modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:10000;padding:24px;animation:subFadeIn .2s; }
  @keyframes subFadeIn { from{opacity:0} to{opacity:1} }
  .modal-container { background:var(--bg-secondary);border:1px solid var(--border);border-radius:20px;width:100%;max-width:520px;box-shadow:0 24px 48px rgba(0,0,0,.5);animation:subSlideUp .25s;overflow:hidden; }
  .modal-crypto { max-width:580px; }
  @keyframes subSlideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  .modal-header { display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid var(--border); }
  .modal-header-content { display:flex;align-items:center;gap:14px; }
  .modal-icon { width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff; }
  .modal-title { font-size:20px;font-weight:800; }
  .modal-subtitle { font-size:13px;color:var(--text-secondary); }
  .modal-close {
    width:32px;height:32px;border-radius:8px;background:var(--bg-tertiary);border:none;
    cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;
    color:var(--text-muted);
  }
  .modal-close:hover { background:var(--border);color:var(--text-primary);transform:rotate(90deg); }
  .modal-body { padding:24px;max-height:72vh;overflow-y:auto; }
  .section-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:14px; }
  .payment-methods-grid { display:grid;gap:10px; }
  .payment-method-card {
    display:flex;align-items:center;gap:14px;background:var(--bg-tertiary);
    border:1.5px solid var(--border);border-radius:12px;padding:16px;
    cursor:pointer;transition:all .2s;text-align:left;
  }
  .payment-method-card:hover { border-color:var(--accent-blue);transform:translateX(3px); }
  .payment-method-icon { display:flex;align-items:center;justify-content:center;width:36px;height:36px;color:var(--text-secondary); }
  .payment-method-content { flex:1; }
  .payment-method-title { font-weight:700;font-size:15px;margin-bottom:2px; }
  .payment-method-desc { font-size:12px;color:var(--text-secondary); }
  .payment-method-arrow { display:flex;align-items:center;color:var(--text-muted); }
  .crypto-step { display:flex;gap:16px;margin-bottom:24px; }
  .crypto-step-number { width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#5B8DEF);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0; }
  .crypto-step-content { flex:1; }
  .crypto-currencies-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px; }
  .crypto-currency-card { background:var(--bg-tertiary);border:1.5px solid var(--border);border-radius:10px;padding:16px 10px;text-align:center;cursor:pointer;transition:all .2s; }
  .crypto-currency-card:hover { border-color:var(--accent-blue);transform:translateY(-3px); }
  .crypto-currency-card.active { border-color:var(--accent-blue);background:rgba(91,141,239,.1);box-shadow:0 0 0 1px var(--accent-blue); }
  .crypto-currency-icon { font-size:28px;margin-bottom:6px;line-height:1; }
  .crypto-currency-name { font-weight:700;font-size:13px;margin-bottom:3px; }
  .crypto-currency-badge { font-size:10px;color:#34D399;font-weight:600; }
  .crypto-amount-card { background:rgba(91,141,239,.08);border:1px solid rgba(91,141,239,.2);border-radius:12px;padding:20px;text-align:center; }
  .crypto-amount-label { font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px; }
  .crypto-amount-value { font-family:var(--font-mono,monospace);font-size:24px;font-weight:900;color:var(--accent-blue);word-break:break-all;margin-bottom:4px; }
  .crypto-amount-fiat { font-size:13px;color:var(--text-muted); }
  .crypto-address-box { background:var(--bg-primary);border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px; }
  .crypto-address-text { font-family:var(--font-mono,monospace);font-size:12px;word-break:break-all;line-height:1.7; }
  .btn-copy { width:100%;padding:13px;background:linear-gradient(135deg,#667eea,#5B8DEF);border:none;border-radius:10px;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:all .25s; }
  .btn-copy:hover { transform:translateY(-2px);box-shadow:0 6px 16px rgba(91,141,239,.4); }
  .copy-icon { display:flex;align-items:center; }
  .crypto-instructions-card { background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.22);border-radius:12px;padding:16px;margin-bottom:20px; }
  .instructions-header { display:flex;align-items:center;gap:8px;margin-bottom:12px; }
  .instructions-icon { display:flex;align-items:center;color:#FBBF24; }
  .instructions-title { font-weight:700;font-size:14px; }
  .instructions-list { margin:0;padding-left:18px; }
  .instructions-list li { font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:6px; }
  .btn-primary-large { width:100%;padding:14px;background:linear-gradient(135deg,#34D399,#10B981);border:none;border-radius:10px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:all .25s; }
  .btn-link-block { display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none; }
  .btn-primary-large:hover { transform:translateY(-2px);box-shadow:0 8px 20px rgba(52,211,153,.4); }
  .btn-primary-large:disabled { opacity:.55;cursor:not-allowed;transform:none;box-shadow:none; }
  .btn-confirm { display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px; }
  .btn-check-icon { display:flex;align-items:center; }
  .user-id-card { display:flex;align-items:center;gap:10px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:10px;padding:12px; }
  .user-id-label { font-size:12px;font-weight:600; }
  .user-id-code { flex:1;background:rgba(0,0,0,.25);padding:5px 9px;border-radius:6px;font-family:monospace;font-size:11px; }
  .btn-copy-id { width:32px;height:32px;border-radius:7px;background:rgba(251,191,36,.18);border:1px solid rgba(251,191,36,.35);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s;flex-shrink:0;color:var(--text-secondary); }
  .btn-copy-id:hover { background:rgba(251,191,36,.35); }
  .success-modal { max-width:440px;text-align:center; }
  .success-modal .modal-body { padding:36px 28px; }
  .success-icon-circle { width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#34D399,#10B981);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#fff; }
  .success-icon { display:flex;align-items:center;justify-content:center; }
  .success-title { font-size:26px;font-weight:800;margin-bottom:12px; }
  .success-message { font-size:15px;color:var(--text-secondary);line-height:1.6;margin-bottom:20px; }
  .success-note { display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(91,141,239,.08);border:1px solid rgba(91,141,239,.2);border-radius:10px;padding:14px;margin-bottom:24px;font-size:13px;line-height:1.6; }
  .btn-spinner { display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:subSpin .7s linear infinite; }
  @keyframes subSpin { to{transform:rotate(360deg)} }

  /* ── LiqPay ── */
  .pay-auto-badge {
    display:inline-flex;align-items:center;padding:2px 7px;background:rgba(255,107,53,.18);
    border:1px solid rgba(255,107,53,.35);color:#FF6B35;border-radius:50px;
    font-size:10px;font-weight:700;letter-spacing:.03em;margin-left:6px;vertical-align:middle;
  }
  .payment-method-featured {
    border-color:rgba(255,107,53,.45) !important;
    background:rgba(255,107,53,.05) !important;
  }
  .payment-method-featured:hover { border-color:#FF6B35 !important; }

  .liqpay-waiting { text-align:center;padding:16px 0 8px; }
  .liqpay-waiting-icon {
    position:relative;display:inline-flex;align-items:center;justify-content:center;
    width:80px;height:80px;border-radius:50%;
    background:linear-gradient(135deg,#FF6B35,#FF8C00);
    color:#fff;margin-bottom:20px;
  }
  .liqpay-pulse {
    position:absolute;inset:-6px;border-radius:50%;
    border:2px solid rgba(255,107,53,.4);
    animation:liqpayPulse 1.8s ease-in-out infinite;
  }
  @keyframes liqpayPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.12);opacity:.5} }
  .liqpay-waiting-title { font-size:20px;font-weight:800;margin-bottom:10px; }
  .liqpay-waiting-desc { font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px; }
  .liqpay-plan-pill {
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 16px;background:rgba(255,107,53,.1);
    border:1px solid rgba(255,107,53,.3);border-radius:50px;
    font-size:13px;margin-bottom:20px;
  }
  .liqpay-status {
    display:flex;align-items:center;justify-content:center;gap:10px;
    font-size:13px;color:var(--text-muted);
  }
  .liqpay-status .btn-spinner { border-color:rgba(255,107,53,.3);border-top-color:#FF6B35; }
  `
  document.head.appendChild(s)
}
