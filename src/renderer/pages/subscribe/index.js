// src/renderer/pages/subscribe/index.js
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { createPayment, openLiqPayCheckout, updateSubscription } from '../../services/liqpay.js'
import { getCryptoAddress, calculateCryptoAmount, createPendingPayment } from '../../services/crypto-payment.js'
import { sendPaymentNotification } from '../../services/telegram-notifications.js'

const PLANS = [
  {
    id: 'free',
    name: 'FREE',
    price: 0,
    period: 'назавжди',
    icon: '🎁',
    color: '#64748B',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    features: [
      '✓ До 50 клієнтів',
      '✓ До 20 рахунків на місяць',
      '✓ Базові звіти',
      '✓ Email підтримка',
      '✗ Експорт в PDF',
      '✗ Аналітика',
      '✗ Автоматизація',
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    price: 299,
    period: 'місяць',
    icon: '⭐',
    color: '#4F8EF7',
    gradient: 'linear-gradient(135deg, #667eea 0%, #4F8EF7 100%)',
    popular: true,
    savings: 'Найпопулярніший',
    features: [
      '✓ Необмежено клієнтів',
      '✓ Необмежено рахунків',
      '✓ Розширені звіти',
      '✓ Пріоритетна підтримка',
      '✓ Експорт в PDF',
      '✓ Повна аналітика',
      '✓ Автоматизація процесів',
      '✓ Кастомний брендінг',
    ],
  },
  {
    id: 'business',
    name: 'BUSINESS',
    price: 799,
    period: 'місяць',
    icon: '🚀',
    color: '#34D399',
    gradient: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
    savings: 'Для команд',
    features: [
      '✓ Все з PRO +',
      '✓ До 5 користувачів',
      '✓ Командна робота',
      '✓ API доступ',
      '✓ Власний домен',
      '✓ Інтеграції (1C, Excel)',
      '✓ Персональний менеджер',
      '✓ SLA підтримка 24/7',
    ],
  },
]

export async function render(container) {
  const user = getCurrentUser()
  const profile = await getUserProfile(user.uid)
  const currentPlan = profile?.plan || 'free'

  container.innerHTML = `
    <div class="subscribe-page">
      
      <div class="subscribe-hero">
        <div class="hero-badge">💎 Преміум функції</div>
        <h1 class="subscribe-title">Оберіть свій план</h1>
        <p class="subscribe-subtitle">Розблокуйте всі можливості WorkHub та автоматизуйте свій бізнес</p>
      </div>

      <div class="current-plan-card" style="border-image: ${getPlanGradient(currentPlan)} 1;">
        <div class="current-plan-content">
          <div class="current-plan-icon">${getPlanIcon(currentPlan)}</div>
          <div class="current-plan-info">
            <div class="current-plan-label">Ваш поточний план</div>
            <div class="current-plan-name">${currentPlan.toUpperCase()}</div>
          </div>
          ${currentPlan === 'free' ? `
            <button class="upgrade-quick-btn" data-plan="pro">
              ⭐ Оновити до PRO
            </button>
          ` : ''}
        </div>
      </div>

      <div class="plans-container">
        ${PLANS.map(plan => `
          <div class="plan-card ${plan.popular ? 'plan-popular' : ''} ${currentPlan === plan.id ? 'plan-current' : ''}" 
               data-plan="${plan.id}"
               style="--plan-color: ${plan.color}; --plan-gradient: ${plan.gradient}">
            
            ${plan.popular ? '<div class="plan-badge-popular">⭐ Популярний</div>' : ''}
            ${plan.savings && plan.id !== currentPlan ? `<div class="plan-savings">${plan.savings}</div>` : ''}
            ${currentPlan === plan.id ? '<div class="plan-badge-current">✓ Активний</div>' : ''}
            
            <div class="plan-header">
              <div class="plan-icon-circle" style="background: ${plan.gradient}">
                <span class="plan-icon-emoji">${plan.icon}</span>
              </div>
              <div class="plan-name">${plan.name}</div>
            </div>

            <div class="plan-pricing">
              <div class="plan-price-amount">
                ${plan.price === 0 ? 'Безкоштовно' : `<span class="price-currency">₴</span>${plan.price}`}
              </div>
              ${plan.price > 0 ? `<div class="plan-price-period">/ ${plan.period}</div>` : ''}
            </div>

            <ul class="plan-features-list">
              ${plan.features.map(f => {
                const isDisabled = f.startsWith('✗')
                const icon = isDisabled ? '✗' : '✓'
                const text = f.substring(2)
                return `
                  <li class="plan-feature-item ${isDisabled ? 'disabled' : ''}">
                    <span class="feature-icon ${isDisabled ? 'icon-disabled' : 'icon-enabled'}">${icon}</span>
                    <span class="feature-text">${text}</span>
                  </li>
                `
              }).join('')}
            </ul>

            <button class="plan-btn ${currentPlan === plan.id ? 'plan-btn-current' : 'plan-btn-choose'}"
                    ${currentPlan === plan.id ? 'disabled' : ''}
                    data-plan="${plan.id}">
              ${currentPlan === plan.id ? '✓ Ваш план' : plan.id === 'free' ? 'Обрати FREE' : 'Обрати план'}
            </button>
          </div>
        `).join('')}
      </div>

      <div class="features-comparison">
        <h2 class="comparison-title">Чому варто оновитись?</h2>
        <div class="comparison-grid">
          <div class="comparison-item">
            <div class="comparison-icon">📊</div>
            <div class="comparison-name">Розширена аналітика</div>
            <div class="comparison-desc">Детальні звіти та графіки для прийняття рішень</div>
          </div>
          <div class="comparison-item">
            <div class="comparison-icon">⚡</div>
            <div class="comparison-name">Автоматизація</div>
            <div class="comparison-desc">Автоматичні нагадування та шаблони документів</div>
          </div>
          <div class="comparison-item">
            <div class="comparison-icon">🎨</div>
            <div class="comparison-name">Брендінг</div>
            <div class="comparison-desc">Ваш логотип на рахунках і договорах</div>
          </div>
          <div class="comparison-item">
            <div class="comparison-icon">🔒</div>
            <div class="comparison-name">Пріоритет</div>
            <div class="comparison-desc">Швидка підтримка та нові функції першими</div>
          </div>
        </div>
      </div>

      <div class="faq-section">
        <h2 class="faq-title">Часті питання</h2>
        <div class="faq-grid">
          <div class="faq-card">
            <div class="faq-question">💳 Які способи оплати?</div>
            <div class="faq-answer">Приймаємо картки Visa/Mastercard або криптовалюту (BTC, ETH, USDT)</div>
          </div>
          <div class="faq-card">
            <div class="faq-question">🔄 Можна скасувати підписку?</div>
            <div class="faq-answer">Так, в будь-який момент без додаткових комісій</div>
          </div>
          <div class="faq-card">
            <div class="faq-question">📊 Що станеться з моїми даними?</div>
            <div class="faq-answer">Всі дані зберігаються навіть після скасування підписки</div>
          </div>
          <div class="faq-card">
            <div class="faq-question">₿ Як працює крипто-оплата?</div>
            <div class="faq-answer">Надсилаєте крипту, натискаєте "Я оплатив" — активуємо протягом 1-2 годин</div>
          </div>
        </div>
      </div>

    </div>
  `

  injectStyles()

  // Обробники кнопок
  container.querySelectorAll('.plan-btn, .upgrade-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const planId = btn.dataset.plan
      if (planId === currentPlan) return
      
      if (planId === 'free') {
        if (confirm('Повернутися на безкоштовний план?')) {
          alert('Функція скасування підписки в розробці')
        }
      } else {
        showPaymentModal(planId)
      }
    })
  })

  function showPaymentModal(planId) {
    const plan = PLANS.find(p => p.id === planId)
    
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="modal-icon" style="background: ${plan.gradient}">${plan.icon}</div>
            <div>
              <h2 class="modal-title">${plan.name} План</h2>
              <p class="modal-subtitle">₴${plan.price} / місяць</p>
            </div>
          </div>
          <button class="modal-close" id="close-payment">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="payment-methods-section">
            <div class="section-label">Оберіть спосіб оплати</div>
            
            <div class="payment-methods-grid">
              <button class="payment-method-card" data-method="card">
                <div class="payment-method-icon">💳</div>
                <div class="payment-method-content">
                  <div class="payment-method-title">Банківська картка</div>
                  <div class="payment-method-desc">Visa, Mastercard</div>
                </div>
                <div class="payment-method-arrow">→</div>
              </button>
              
              <button class="payment-method-card" data-method="crypto">
                <div class="payment-method-icon">₿</div>
                <div class="payment-method-content">
                  <div class="payment-method-title">Криптовалюта</div>
                  <div class="payment-method-desc">BTC, ETH, USDT</div>
                </div>
                <div class="payment-method-arrow">→</div>
              </button>
            </div>
          </div>

          <div class="payment-guarantee">
            <div class="guarantee-icon">🔒</div>
            <div class="guarantee-text">
              <strong>Безпечна оплата</strong>
              <span>Автоматичне продовження • Повернення протягом 14 днів</span>
            </div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    modal.querySelector('#close-payment').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove()
    })

    modal.querySelectorAll('.payment-method-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.method
        modal.remove()
        
        if (method === 'card') {
          showCardPayment(plan)
        } else if (method === 'crypto') {
          showCryptoPayment(plan)
        }
      })
    })
  }

  function showCardPayment(plan) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container" style="max-width:450px">
        <div class="modal-header">
          <h2 class="modal-title">Оплата карткою</h2>
          <button class="modal-close" id="close-payment">✕</button>
        </div>
        <div class="modal-body">
          <div class="payment-info-box">
            <div class="info-icon">🔒</div>
            <div class="info-text">
              <strong>Безпечна оплата через LiqPay</strong>
              <span>Платіжна система ПриватБанку</span>
            </div>
          </div>
          <button class="btn-primary-large" id="pay-card-btn">
            Оплатити ₴${plan.price}
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    modal.querySelector('#close-payment').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

    modal.querySelector('#pay-card-btn').addEventListener('click', async () => {
      const btn = modal.querySelector('#pay-card-btn')
      btn.disabled = true
      btn.innerHTML = '<div class="btn-spinner"></div> Підготовка...'

      try {
        const { data, signature } = await createPayment(user.uid, plan.id, plan.price)
        
        openLiqPayCheckout(data, signature, async () => {
          try {
            await updateSubscription(user.uid, plan.id)
            updateProfileCache(user.uid, { plan: plan.id, subscriptionStatus: 'active' })
          } catch (err) {
            console.error('Subscription update error:', err)
          }
          modal.remove()
          showSuccessModal(plan.name)
          setTimeout(() => location.reload(), 2000)
        })
      } catch (err) {
        console.error(err)
        alert('Помилка створення платежу')
        btn.disabled = false
        btn.innerHTML = `Оплатити ₴${plan.price}`
      }
    })
  }

  function showCryptoPayment(plan) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container modal-crypto">
        <div class="modal-header">
          <h2 class="modal-title">Оплата криптовалютою</h2>
          <button class="modal-close" id="close-crypto">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="crypto-step">
            <div class="crypto-step-number">1</div>
            <div class="crypto-step-content">
              <div class="section-label">Оберіть криптовалюту</div>
              <div class="crypto-currencies-grid">
                <button class="crypto-currency-card" data-currency="USDT">
                  <div class="crypto-currency-icon">₮</div>
                  <div class="crypto-currency-name">USDT</div>
                  <div class="crypto-currency-badge">Рекомендовано</div>
                </button>
                <button class="crypto-currency-card" data-currency="BTC">
                  <div class="crypto-currency-icon">₿</div>
                  <div class="crypto-currency-name">Bitcoin</div>
                </button>
                <button class="crypto-currency-card" data-currency="ETH">
                  <div class="crypto-currency-icon">Ξ</div>
                  <div class="crypto-currency-name">Ethereum</div>
                </button>
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
                    <span class="copy-icon">📋</span>
                    <span class="copy-text">Копіювати адресу</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="crypto-instructions-card">
              <div class="instructions-header">
                <span class="instructions-icon">💡</span>
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
              <span class="btn-check-icon">✓</span>
              Я оплатив
            </button>

            <div class="user-id-card">
              <span class="user-id-label">Ваш ID:</span>
              <code class="user-id-code" id="user-id">${user.uid.slice(0, 12)}</code>
              <button class="btn-copy-id" id="copy-id">
                <span class="copy-icon">📋</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    modal.querySelector('#close-crypto').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

    // Копіювання ID
    modal.querySelector('#copy-id')?.addEventListener('click', () => {
      navigator.clipboard.writeText(user.uid)
      const btn = modal.querySelector('#copy-id')
      const icon = btn.querySelector('.copy-icon')
      icon.textContent = '✓'
      setTimeout(() => icon.textContent = '📋', 2000)
    })

    let currentPaymentId = null
    let currentCurrency = null

    // Обробка вибору валюти
    modal.querySelectorAll('.crypto-currency-card').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentCurrency = btn.dataset.currency
        
        modal.querySelectorAll('.crypto-currency-card').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        const address = getCryptoAddress(currentCurrency)
        
        if (!address || address.includes('YOUR')) {
          alert('Адреса не налаштована. Зверніться в підтримку.')
          return
        }

        modal.querySelector('#crypto-details').style.display = 'block'

        const cryptoAmount = calculateCryptoAmount(plan.price, currentCurrency)
        modal.querySelector('#crypto-amount').textContent = `${cryptoAmount} ${currentCurrency}`
        modal.querySelector('#crypto-address').textContent = address

        // Копіювання адреси
        modal.querySelector('#copy-address').onclick = () => {
          navigator.clipboard.writeText(address)
          const copyBtn = modal.querySelector('#copy-address')
          const copyText = copyBtn.querySelector('.copy-text')
          const copyIcon = copyBtn.querySelector('.copy-icon')
          copyIcon.textContent = '✓'
          copyText.textContent = 'Скопійовано!'
          copyBtn.style.background = 'linear-gradient(135deg, #34D399 0%, #10B981 100%)'
          setTimeout(() => {
            copyIcon.textContent = '📋'
            copyText.textContent = 'Копіювати адресу'
            copyBtn.style.background = ''
          }, 2000)
        }

        // Створюємо очікуваний платіж
        try {
          currentPaymentId = await createPendingPayment(user.uid, plan.id, plan.price, currentCurrency)
        } catch (err) {
          console.error('Error:', err)
        }
      })
    })

    // Кнопка "Я оплатив"
    modal.querySelector('#confirm-payment')?.addEventListener('click', async () => {
      if (!currentPaymentId || !currentCurrency) {
        alert('Спочатку оберіть валюту')
        return
      }

      const btn = modal.querySelector('#confirm-payment')
      btn.disabled = true
      btn.innerHTML = '<div class="btn-spinner"></div> Відправляємо...'

      try {
        await sendPaymentNotification({
          userId: user.uid,
          userName: profile.name,
          userEmail: user.email,
          planName: plan.name,
          amount: plan.price,
          currency: currentCurrency,
          cryptoAmount: calculateCryptoAmount(plan.price, currentCurrency),
          address: getCryptoAddress(currentCurrency),
          paymentId: currentPaymentId
        })

        modal.remove()
        showWaitingModal(plan.name)

      } catch (err) {
        console.error(err)
        alert('Помилка відправки сповіщення')
        btn.disabled = false
        btn.innerHTML = '<span class="btn-check-icon">✓</span> Я оплатив'
      }
    })
  }

  function showWaitingModal(planName) {
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal-container success-modal">
        <div class="success-icon-circle">
          <div class="success-icon">⏳</div>
        </div>
        <h2 class="success-title">Очікуємо підтвердження</h2>
        <p class="success-message">
          Ваша заявка на підписку <strong>${planName}</strong> відправлена.<br>
          Ми перевіримо платіж і активуємо підписку протягом <strong>1-2 годин</strong>.
        </p>
        <div class="success-note">
          📧 Ви отримаєте email коли підписка буде активована
        </div>
        <button class="btn-primary-large" id="btn-understood">
          Зрозуміло
        </button>
      </div>
    `
    document.body.appendChild(modal)

    // ✅ ВИПРАВЛЕНО: Додав event listener замість inline onclick
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
          <div class="success-icon">🎉</div>
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

    // ✅ ВИПРАВЛЕНО: Додав event listener
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

  function getPlanIcon(planId) {
    return PLANS.find(p => p.id === planId)?.icon || '🎁'
  }
}

function injectStyles() {
  if (document.getElementById('subscribe-styles-v3')) return
  const style = document.createElement('style')
  style.id = 'subscribe-styles-v3'
  style.textContent = `
    .subscribe-page { padding: 48px 36px; max-width: 1400px; margin: 0 auto; }

    /* Hero */
    .subscribe-hero { text-align: center; margin-bottom: 48px; }
    .hero-badge { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 8px 20px; border-radius: 50px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .subscribe-title { font-family: var(--font-display); font-size: 48px; font-weight: 900; letter-spacing: -0.03em; margin-bottom: 16px; background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .subscribe-subtitle { font-size: 18px; color: var(--text-secondary); max-width: 600px; margin: 0 auto; line-height: 1.6; }

    /* Current Plan */
    .current-plan-card { background: var(--bg-secondary); border: 3px solid; border-image-slice: 1; border-radius: var(--radius-xl); padding: 24px; margin-bottom: 48px; }
    .current-plan-content { display: flex; align-items: center; gap: 20px; }
    .current-plan-icon { font-size: 48px; }
    .current-plan-info { flex: 1; }
    .current-plan-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; }
    .current-plan-name { font-size: 28px; font-weight: 800; font-family: var(--font-display); }
    .upgrade-quick-btn { padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); border: none; border-radius: var(--radius-md); color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; transition: all .3s; }
    .upgrade-quick-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,142,247,0.4); }

    /* Plans */
    .plans-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 80px; }
    .plan-card { background: var(--bg-secondary); border: 2px solid var(--border); border-radius: var(--radius-xl); padding: 32px; position: relative; transition: all .4s cubic-bezier(0.4, 0, 0.2, 1); }
    .plan-card:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-color: var(--plan-color); }
    .plan-popular { border-color: var(--plan-color); box-shadow: 0 0 0 1px var(--plan-color), 0 8px 30px rgba(79,142,247,0.2); }
    .plan-popular:hover { box-shadow: 0 0 0 1px var(--plan-color), 0 20px 50px rgba(79,142,247,0.3); }
    .plan-current { border-color: #34D399; background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(52,211,153,0.05) 100%); }

    .plan-badge-popular { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--plan-gradient); color: #fff; padding: 6px 16px; border-radius: 50px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; white-space: nowrap; }
    .plan-savings { position: absolute; top: -14px; right: 24px; background: rgba(52,211,153,0.2); border: 1px solid rgba(52,211,153,0.4); color: #34D399; padding: 6px 14px; border-radius: 50px; font-size: 11px; font-weight: 700; }
    .plan-badge-current { position: absolute; top: -14px; right: 24px; background: #34D399; color: #fff; padding: 6px 16px; border-radius: 50px; font-size: 12px; font-weight: 700; }

    .plan-header { text-align: center; margin-bottom: 24px; }
    .plan-icon-circle { width: 80px; height: 80px; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .plan-icon-emoji { font-size: 40px; }
    .plan-name { font-family: var(--font-display); font-size: 24px; font-weight: 800; }

    .plan-pricing { text-align: center; margin-bottom: 32px; }
    .plan-price-amount { font-family: var(--font-display); font-size: 48px; font-weight: 900; line-height: 1; }
    .price-currency { font-size: 28px; }
    .plan-price-period { font-size: 14px; color: var(--text-secondary); margin-top: 8px; }

    .plan-features-list { list-style: none; padding: 0; margin: 0 0 32px 0; }
    .plan-feature-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .plan-feature-item:last-child { border-bottom: none; }
    .feature-icon { font-size: 16px; flex-shrink: 0; }
    .icon-enabled { color: #34D399; }
    .icon-disabled { color: var(--text-muted); }
    .feature-text { font-size: 14px; line-height: 1.5; }
    .plan-feature-item.disabled .feature-text { color: var(--text-muted); }

    .plan-btn { width: 100%; padding: 14px; border-radius: var(--radius-md); font-weight: 700; font-size: 15px; transition: all .3s; border: none; cursor: pointer; }
    .plan-btn-choose { background: var(--plan-gradient); color: #fff; }
    .plan-btn-choose:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.3); }
    .plan-btn-current { background: var(--bg-tertiary); color: var(--text-secondary); cursor: not-allowed; }

    /* Comparison */
    .features-comparison { margin-bottom: 80px; }
    .comparison-title { font-family: var(--font-display); font-size: 32px; font-weight: 800; text-align: center; margin-bottom: 40px; }
    .comparison-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
    .comparison-item { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px; text-align: center; transition: all .3s; }
    .comparison-item:hover { transform: translateY(-4px); border-color: var(--accent-blue); }
    .comparison-icon { font-size: 48px; margin-bottom: 16px; }
    .comparison-name { font-weight: 700; font-size: 18px; margin-bottom: 8px; }
    .comparison-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }

    /* FAQ */
    .faq-section { margin-bottom: 60px; }
    .faq-title { font-family: var(--font-display); font-size: 32px; font-weight: 800; text-align: center; margin-bottom: 40px; }
    .faq-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .faq-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; transition: all .3s; }
    .faq-card:hover { border-color: var(--accent-blue); transform: translateY(-2px); }
    .faq-question { font-weight: 700; font-size: 15px; margin-bottom: 10px; }
    .faq-answer { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }

    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 24px; animation: fadeIn .3s; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .modal-container { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-xl); width: 100%; max-width: 550px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); animation: slideUp .3s; overflow: hidden; }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    
    .modal-crypto { max-width: 600px; }
    
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 28px; border-bottom: 1px solid var(--border); }
    .modal-header-content { display: flex; align-items: center; gap: 16px; }
    .modal-icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .modal-title { font-family: var(--font-display); font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .modal-subtitle { font-size: 14px; color: var(--text-secondary); }
    .modal-close { width: 36px; height: 36px; border-radius: 8px; background: var(--bg-tertiary); border: none; font-size: 18px; cursor: pointer; transition: all .2s; }
    .modal-close:hover { background: var(--border); transform: rotate(90deg); }
    
    .modal-body { padding: 28px; max-height: 70vh; overflow-y: auto; }
    
    .section-label { font-size: 13px; font-weight: 700; margin-bottom: 16px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

    /* Payment Methods */
    .payment-methods-section { margin-bottom: 24px; }
    .payment-methods-grid { display: grid; gap: 12px; }
    .payment-method-card { display: flex; align-items: center; gap: 16px; background: var(--bg-tertiary); border: 2px solid var(--border); border-radius: var(--radius-lg); padding: 20px; transition: all .3s; cursor: pointer; text-align: left; }
    .payment-method-card:hover { border-color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 8%, var(--bg-tertiary)); transform: translateX(4px); }
    .payment-method-icon { font-size: 36px; }
    .payment-method-content { flex: 1; }
    .payment-method-title { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
    .payment-method-desc { font-size: 13px; color: var(--text-secondary); }
    .payment-method-arrow { font-size: 24px; color: var(--text-muted); }

    .payment-guarantee { display: flex; align-items: center; gap: 16px; background: rgba(79,142,247,0.08); border: 1px solid rgba(79,142,247,0.2); border-radius: var(--radius-md); padding: 16px; }
    .guarantee-icon { font-size: 32px; }
    .guarantee-text { flex: 1; }
    .guarantee-text strong { display: block; margin-bottom: 4px; font-size: 14px; }
    .guarantee-text span { font-size: 12px; color: var(--text-secondary); }

    .payment-info-box { display: flex; align-items: center; gap: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px; }
    .info-icon { font-size: 36px; }
    .info-text strong { display: block; font-size: 15px; margin-bottom: 4px; }
    .info-text span { font-size: 13px; color: var(--text-secondary); }

    /* Crypto */
    .crypto-step { display: flex; gap: 20px; margin-bottom: 28px; }
    .crypto-step-number { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; }
    .crypto-step-content { flex: 1; }

    .crypto-currencies-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .crypto-currency-card { background: var(--bg-tertiary); border: 2px solid var(--border); border-radius: var(--radius-md); padding: 20px 12px; text-align: center; transition: all .3s; cursor: pointer; }
    .crypto-currency-card:hover { border-color: var(--accent-blue); transform: translateY(-4px); }
    .crypto-currency-card.active { border-color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-tertiary)); box-shadow: 0 0 0 1px var(--accent-blue); }
    .crypto-currency-icon { font-size: 40px; margin-bottom: 8px; }
    .crypto-currency-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .crypto-currency-badge { font-size: 10px; color: #34D399; font-weight: 600; }

    .crypto-amount-card { background: linear-gradient(135deg, rgba(79,142,247,0.1) 0%, rgba(102,126,234,0.05) 100%); border: 1px solid rgba(79,142,247,0.2); border-radius: var(--radius-md); padding: 24px; text-align: center; }
    .crypto-amount-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .crypto-amount-value { font-family: var(--font-mono); font-size: 28px; font-weight: 900; color: var(--accent-blue); margin-bottom: 8px; word-break: break-all; }
    .crypto-amount-fiat { font-size: 14px; color: var(--text-muted); }

    .crypto-address-card { }
    .crypto-address-box { background: var(--bg-primary); border: 2px solid var(--border); border-radius: var(--radius-md); padding: 18px; margin-bottom: 14px; }
    .crypto-address-text { font-family: var(--font-mono); font-size: 13px; word-break: break-all; line-height: 1.8; color: var(--text-primary); }

    .btn-copy { width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); border: none; border-radius: var(--radius-md); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all .3s; }
    .btn-copy:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,142,247,0.4); }
    .copy-icon { font-size: 18px; }

    .crypto-instructions-card { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.25); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px; }
    .instructions-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .instructions-icon { font-size: 20px; }
    .instructions-title { font-weight: 700; font-size: 15px; }
    .instructions-list { margin: 0; padding-left: 20px; }
    .instructions-list li { font-size: 13px; color: var(--text-secondary); line-height: 1.8; margin-bottom: 8px; }

    .btn-primary-large { width: 100%; padding: 16px; background: linear-gradient(135deg, #34D399 0%, #10B981 100%); border: none; border-radius: var(--radius-md); color: #fff; font-weight: 800; font-size: 16px; cursor: pointer; transition: all .3s; }
    .btn-primary-large:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(52,211,153,0.4); }
    .btn-primary-large:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    .btn-confirm { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 20px; background: linear-gradient(135deg, #34D399 0%, #10B981 100%); }

    .btn-check-icon { font-size: 20px; }

    .user-id-card { display: flex; align-items: center; gap: 12px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); border-radius: var(--radius-md); padding: 14px; }
    .user-id-label { font-size: 13px; font-weight: 600; }
    .user-id-code { flex: 1; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; }
    .btn-copy-id { width: 36px; height: 36px; border-radius: 8px; background: rgba(251,191,36,0.2); border: 1px solid rgba(251,191,36,0.4); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .2s; flex-shrink: 0; }
    .btn-copy-id:hover { background: rgba(251,191,36,0.4); }

    /* Success Modal */
    .success-modal { max-width: 480px; text-align: center; }
    .success-modal .modal-body { padding: 40px 32px; }
    .success-icon-circle { width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #34D399 0%, #10B981 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    .success-icon { font-size: 52px; }
    .success-title { font-family: var(--font-display); font-size: 28px; font-weight: 800; margin-bottom: 16px; }
    .success-message { font-size: 16px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; }
    .success-note { background: rgba(79,142,247,0.08); border: 1px solid rgba(79,142,247,0.2); border-radius: var(--radius-md); padding: 16px; margin-bottom: 28px; font-size: 14px; line-height: 1.6; }

    .btn-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `
  document.head.appendChild(style)
}