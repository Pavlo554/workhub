// src/renderer/modules/currency/index.js
import { icon } from '../../utils/icons.js'

const CACHE_KEY = 'workhub_fx_rates'
const CACHE_TTL = 3600_000 // 1 hour

// Converter dropdown — popular currencies
const CONVERTER_CONVERTER_CURRENCIES = [
  { code: 'UAH', name: 'Гривня',             flag: '🇺🇦', symbol: '₴' },
  { code: 'USD', name: 'Долар США',           flag: '🇺🇸', symbol: '$' },
  { code: 'EUR', name: 'Євро',               flag: '🇪🇺', symbol: '€' },
  { code: 'GBP', name: 'Фунт стерлінгів',    flag: '🇬🇧', symbol: '£' },
  { code: 'PLN', name: 'Злотий',             flag: '🇵🇱', symbol: 'zł' },
  { code: 'CHF', name: 'Франк',              flag: '🇨🇭', symbol: '₣' },
  { code: 'CZK', name: 'Чеська крона',       flag: '🇨🇿', symbol: 'Kč' },
  { code: 'CAD', name: 'Канадський долар',   flag: '🇨🇦', symbol: 'C$' },
  { code: 'JPY', name: 'Японська єна',       flag: '🇯🇵', symbol: '¥' },
  { code: 'CNY', name: 'Китайський юань',    flag: '🇨🇳', symbol: '¥' },
  { code: 'AED', name: 'Дирхам ОАЕ',        flag: '🇦🇪', symbol: 'د.إ' },
  { code: 'TRY', name: 'Турецька ліра',      flag: '🇹🇷', symbol: '₺' },
  { code: 'GEL', name: 'Грузинський ларі',   flag: '🇬🇪', symbol: '₾' },
  { code: 'MDL', name: 'Молдовський лей',    flag: '🇲🇩', symbol: 'L' },
  { code: 'AZN', name: 'Азербайджанський манат', flag: '🇦🇿', symbol: '₼' },
]

// Flag overrides for NBU currencies not in the converter list
const FLAGS = {
  UAH:'🇺🇦',
  DZD:'🇩🇿', AUD:'🇦🇺', BDT:'🇧🇩', CAD:'🇨🇦', CNY:'🇨🇳', CZK:'🇨🇿',
  DKK:'🇩🇰', HKD:'🇭🇰', HUF:'🇭🇺', INR:'🇮🇳', IDR:'🇮🇩', ILS:'🇮🇱',
  JPY:'🇯🇵', KZT:'🇰🇿', KRW:'🇰🇷', LBP:'🇱🇧', MYR:'🇲🇾', MXN:'🇲🇽',
  MDL:'🇲🇩', NZD:'🇳🇿', NOK:'🇳🇴', SAR:'🇸🇦', SGD:'🇸🇬', VND:'🇻🇳',
  ZAR:'🇿🇦', SEK:'🇸🇪', CHF:'🇨🇭', THB:'🇹🇭', AED:'🇦🇪', TND:'🇹🇳',
  EGP:'🇪🇬', GBP:'🇬🇧', USD:'🇺🇸', RSD:'🇷🇸', AZN:'🇦🇿', RON:'🇷🇴',
  TRY:'🇹🇷', XDR:'🌐', EUR:'🇪🇺', GEL:'🇬🇪', PLN:'🇵🇱',
  XAU:'🥇', XAG:'🥈', XPT:'⚪', XPD:'⚫',
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="fx-page">
      <div class="fx-header">
        <div>
          <h1 class="fx-title">Валютний конвертер</h1>
          <p class="fx-sub" id="fx-rates-ts">Завантаження курсів НБУ...</p>
        </div>
        <button class="fx-refresh-btn" id="fx-refresh" title="Оновити курси">↻ Оновити</button>
      </div>

      <!-- Converter card -->
      <div class="fx-converter-card">
        <div class="fx-converter-row">
          <div class="fx-input-group">
            <label class="fx-label">Сума</label>
            <div class="fx-amount-wrap">
              <input type="number" class="fx-amount-input" id="fx-from-amount" value="100" min="0" step="any">
              <select class="fx-currency-select" id="fx-from-cur">
                ${CONVERTER_CONVERTER_CURRENCIES.map(c => `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${c.flag} ${c.code} — ${c.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <button class="fx-swap-btn" id="fx-swap" title="Поміняти місцями">⇄</button>

          <div class="fx-input-group">
            <label class="fx-label">Результат</label>
            <div class="fx-amount-wrap">
              <input type="number" class="fx-amount-input fx-result" id="fx-to-amount" readonly>
              <select class="fx-currency-select" id="fx-to-cur">
                ${CONVERTER_CONVERTER_CURRENCIES.map(c => `<option value="${c.code}" ${c.code === 'UAH' ? 'selected' : ''}>${c.flag} ${c.code} — ${c.name}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="fx-rate-display" id="fx-rate-display">
          Завантаження...
        </div>
      </div>

      <!-- Rates table — all NBU currencies -->
      <div class="fx-card">
        <div class="fx-card-head">
          <span class="fx-card-title">${icon('bar-chart', 14)} Всі курси НБУ до гривні</span>
          <div style="display:flex;align-items:center;gap:10px">
            <input class="fx-search" id="fx-search" placeholder="Пошук валюти..." type="text">
            <span class="fx-rates-date" id="fx-rates-date"></span>
          </div>
        </div>
        <div id="fx-rates-grid" class="fx-rates-grid">
          ${Array(12).fill(0).map(() => `
            <div class="fx-rate-card fx-rate-loading"><div class="fx-shimmer"></div></div>
          `).join('')}
        </div>
      </div>

      <!-- Cross rates -->
      <div class="fx-card">
        <div class="fx-card-head">
          <span class="fx-card-title">${icon('refresh', 14)} Крос-курси</span>
        </div>
        <div id="fx-cross-table" class="fx-cross-wrap">
          <div class="fx-loading"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `

  const { rates, allItems, exchangeDate } = await loadRates()
  updateUI(container, rates, allItems, exchangeDate)

  container.querySelector('#fx-from-amount').addEventListener('input', () => convert(container, rates))
  container.querySelector('#fx-from-cur').addEventListener('change',  () => convert(container, rates))
  container.querySelector('#fx-to-cur').addEventListener('change',    () => convert(container, rates))

  container.querySelector('#fx-search').addEventListener('input', e => {
    renderRatesGrid(container, rates, allItems, e.target.value.trim())
  })

  container.querySelector('#fx-swap').addEventListener('click', () => {
    const fromSel = container.querySelector('#fx-from-cur')
    const toSel   = container.querySelector('#fx-to-cur')
    const fromAmt = container.querySelector('#fx-from-amount')
    const toAmt   = container.querySelector('#fx-to-amount')
    const tmp = fromSel.value
    fromSel.value = toSel.value
    toSel.value = tmp
    fromAmt.value = toAmt.value || fromAmt.value
    convert(container, rates)
  })

  container.querySelector('#fx-refresh').addEventListener('click', async () => {
    const btn = container.querySelector('#fx-refresh')
    btn.disabled = true
    btn.textContent = '⌛ Оновлення...'
    localStorage.removeItem(CACHE_KEY)
    const fresh = await loadRates()
    updateUI(container, fresh.rates, fresh.allItems, fresh.exchangeDate)
    btn.disabled = false
    btn.textContent = '↻ Оновити'
  })
}

async function loadRates() {
  const FALLBACK = {
    rates: { UAH: 1, USD: 44.26, EUR: 51.33, GBP: 59.40, PLN: 12.10, CHF: 56.29, CZK: 2.11, CAD: 32.07, JPY: 0.278, CNY: 6.51, AED: 12.05, TRY: 0.968, GEL: 16.56, MDL: 2.55, AZN: 26.05 },
    allItems: [],
    exchangeDate: null,
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      // Validate new format: must have nested rates object
      if (Date.now() - parsed.ts < CACHE_TTL && parsed.data?.rates) {
        return parsed.data
      }
    }
  } catch { /* skip */ }

  try {
    const resp = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json')
    if (!resp.ok) throw new Error('NBU HTTP ' + resp.status)
    const list = await resp.json()

    const rates = { UAH: 1 }
    for (const item of list) rates[item.cc] = item.rate

    const exchangeDate = list[0]?.exchangedate || null

    const result = { rates, allItems: list, exchangeDate }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }))
    } catch { /* quota */ }
    return result
  } catch (err) {
    console.warn('NBU fetch failed, using fallback:', err.message)
    return FALLBACK
  }
}

function updateUI(container, rates, allItems, exchangeDate) {
  renderRatesGrid(container, rates, allItems, '')
  renderCrossTable(container, rates)
  convert(container, rates)
  updateTimestamp(container, rates, exchangeDate)
}

function renderRatesGrid(container, rates, allItems, search) {
  const grid = container.querySelector('#fx-rates-grid')
  const dateEl = container.querySelector('#fx-rates-date')
  if (!grid) return

  // Use live NBU items if available, else fall back to converter currencies
  const safeRates = rates || {}
  let items = allItems && allItems.length > 0
    ? allItems
    : CONVERTER_CONVERTER_CURRENCIES.filter(c => c.code !== 'UAH').map(c => ({
        cc: c.code, txt: c.name, rate: safeRates[c.code] || 0, exchangedate: ''
      }))

  if (search) {
    const q = search.toLowerCase()
    items = items.filter(i =>
      i.cc.toLowerCase().includes(q) || i.txt.toLowerCase().includes(q)
    )
  }

  if (dateEl && items[0]?.exchangedate) {
    dateEl.textContent = 'Дані на ' + items[0].exchangedate
  }

  if (!items.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Нічого не знайдено</div>`
    return
  }

  grid.innerHTML = items.map(item => {
    const rate = item.rate
    if (!rate) return ''
    const flag = FLAGS[item.cc] || '🏳️'
    const inv  = rate > 0 ? (1 / rate).toFixed(rate < 0.01 ? 6 : rate < 1 ? 4 : 2) : '—'
    return `
      <div class="fx-rate-card">
        <div class="fx-rate-flag">${flag}</div>
        <div class="fx-rate-code">${item.cc}</div>
        <div class="fx-rate-name">${item.txt}</div>
        <div class="fx-rate-val">₴ ${rate >= 1 ? rate.toFixed(2) : rate.toFixed(4)}</div>
        <div class="fx-rate-inv">${inv} ${item.cc} = ₴1</div>
      </div>
    `
  }).join('')
}

function renderCrossTable(container, rates) {
  const el = container.querySelector('#fx-cross-table')
  if (!el) return

  const pairs = ['USD', 'EUR', 'GBP', 'PLN']
  el.innerHTML = `
    <table class="fx-cross-table">
      <thead>
        <tr>
          <th></th>
          ${pairs.map(c => `<th>${FLAGS[c] || ''} ${c}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${pairs.map(from => `
          <tr>
            <td class="fx-cross-from">${FLAGS[from] || ''} ${from}</td>
            ${pairs.map(to => {
              if (from === to) return `<td class="fx-cross-same">—</td>`
              const rate = rates[to] / rates[from]
              return `<td class="fx-cross-val">${rate.toFixed(4)}</td>`
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function convert(container, rates) {
  const fromAmt = parseFloat(container.querySelector('#fx-from-amount').value) || 0
  const fromCur = container.querySelector('#fx-from-cur').value
  const toCur   = container.querySelector('#fx-to-cur').value
  const toAmtEl = container.querySelector('#fx-to-amount')
  const rateEl  = container.querySelector('#fx-rate-display')

  const rateFrom = rates[fromCur] || 1
  const rateTo   = rates[toCur] || 1
  const result = (fromAmt * rateFrom) / rateTo

  toAmtEl.value = result.toFixed(2)

  const crossRate = rateFrom / rateTo
  const flagFrom = FLAGS[fromCur] || ''
  const flagTo   = FLAGS[toCur]   || ''

  rateEl.innerHTML = `
    <span class="fx-rate-eq">1 ${flagFrom} ${fromCur} = <strong>${crossRate.toFixed(4)}</strong> ${flagTo} ${toCur}</span>
    <span class="fx-rate-eq-inv">&nbsp;·&nbsp; 1 ${flagTo} ${toCur} = ${(1 / crossRate).toFixed(4)} ${fromCur}</span>
  `
}

function updateTimestamp(container, rates, exchangeDate) {
  const ts = container.querySelector('#fx-rates-ts')
  if (!ts) return
  const isLive = !!rates.USD && Math.abs(rates.USD - 44.26) > 0.5
  if (isLive && exchangeDate) {
    ts.textContent = `Офіційний курс НБУ · Дані на ${exchangeDate}`
  } else if (isLive) {
    ts.textContent = `Офіційний курс НБУ · Завантажено ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
  } else {
    ts.textContent = 'Офлайн — приблизні значення'
  }
}

function injectStyles() {
  document.getElementById('fx-styles')?.remove()
  const style = document.createElement('style')
  style.id = 'fx-styles'
  style.textContent = `
  .fx-page { padding: 28px 32px; display: flex; flex-direction: column; gap: 22px; }

  .fx-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .fx-title { font-family: var(--font-display); font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
  .fx-sub { font-size: 12px; color: var(--text-muted); margin: 0; }

  .fx-refresh-btn {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 9px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer; color: var(--text-primary); transition: all .15s;
  }
  .fx-refresh-btn:hover:not(:disabled) { border-color: var(--accent-blue); color: var(--accent-blue); }
  .fx-refresh-btn:disabled { opacity: .6; cursor: not-allowed; }

  /* Converter */
  .fx-converter-card {
    background: linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated));
    border: 1px solid var(--border); border-radius: var(--radius-xl);
    padding: 28px; position: relative; overflow: hidden;
  }
  .fx-converter-card::before {
    content: ''; position: absolute; top: -40px; right: -40px;
    width: 200px; height: 200px; border-radius: 50%;
    background: radial-gradient(circle, rgba(79,142,247,.08) 0%, transparent 70%);
  }
  .fx-converter-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: end; margin-bottom: 20px; }
  @media (max-width: 800px) { .fx-converter-row { grid-template-columns: 1fr; } .fx-swap-btn { transform: rotate(90deg); margin:0 auto; } }
  @media (max-width: 600px) { .fx-page { padding: 16px; } .fx-rates-grid { grid-template-columns: repeat(auto-fill,minmax(110px,1fr)); } }

  .fx-input-group { display: flex; flex-direction: column; gap: 8px; }
  .fx-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .fx-amount-wrap { display: flex; flex-direction: column; gap: 6px; }
  .fx-amount-input {
    background: var(--bg-tertiary); border: 2px solid var(--border);
    border-radius: var(--radius-md); padding: 12px 14px;
    font-size: 22px; font-weight: 700; color: var(--text-primary);
    outline: none; transition: border-color .15s; width: 100%;
  }
  .fx-amount-input:focus { border-color: var(--accent-blue); }
  .fx-amount-input.fx-result { color: #34D399; background: rgba(52,211,153,.06); border-color: rgba(52,211,153,.3); }
  .fx-currency-select {
    background: var(--bg-tertiary); border: 1.5px solid var(--border);
    border-radius: var(--radius-md); padding: 8px 12px;
    font-size: 13px; font-weight: 600; color: var(--text-primary);
    cursor: pointer; outline: none;
  }
  .fx-currency-select:focus { border-color: var(--accent-blue); }

  .fx-swap-btn {
    width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--border);
    background: var(--bg-tertiary); font-size: 18px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .2s; align-self: center; flex-shrink: 0; color: var(--text-primary);
  }
  .fx-swap-btn:hover { border-color: var(--accent-blue); background: rgba(79,142,247,.1); color: var(--accent-blue); transform: scale(1.1); }

  .fx-rate-display { font-size: 13px; color: var(--text-secondary); padding-top: 4px; border-top: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 4px; }
  .fx-rate-eq strong { color: var(--accent-blue); }
  .fx-rate-eq-inv { color: var(--text-muted); }

  /* Cards */
  .fx-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .fx-card-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .fx-card-title { font-size: 13px; font-weight: 700; }
  .fx-rates-date { font-size: 11px; color: var(--text-muted); }
  .fx-loading { display: flex; justify-content: center; padding: 32px; }

  /* Rates grid */
  .fx-rates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 14px; }
  .fx-rate-card {
    background: var(--bg-tertiary); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 14px 12px; text-align: center;
    transition: all .18s;
  }
  .fx-rate-card:hover { border-color: var(--accent-blue); transform: translateY(-2px); }
  .fx-rate-loading { min-height: 90px; }
  .fx-shimmer { height: 100%; border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%); background-size: 200%; animation: ca-sh 1.4s infinite; }
  .fx-rate-flag { font-size: 24px; margin-bottom: 6px; }
  .fx-rate-code { font-size: 14px; font-weight: 800; margin-bottom: 2px; }
  .fx-rate-name { font-size: 10px; color: var(--text-muted); margin-bottom: 8px; }
  .fx-rate-val  { font-family: var(--font-display); font-size: 18px; font-weight: 800; color: var(--accent-blue); }
  .fx-rate-inv  { font-size: 10px; color: var(--text-muted); margin-top: 3px; }

  /* Search */
  .fx-search {
    background: var(--bg-tertiary); border: 1.5px solid var(--border);
    border-radius: var(--radius-md); padding: 6px 12px;
    font-size: 12px; color: var(--text-primary); outline: none; width: 160px;
    transition: border-color .15s;
  }
  .fx-search:focus { border-color: var(--accent-blue); }

  /* Cross table */
  .fx-cross-wrap { overflow-x: auto; padding: 14px; }
  .fx-cross-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .fx-cross-table th { padding: 8px 12px; text-align: center; font-size: 12px; font-weight: 700; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
  .fx-cross-table td { padding: 10px 12px; text-align: center; border-bottom: 1px solid rgba(255,255,255,.04); }
  .fx-cross-from { font-weight: 700; text-align: left !important; }
  .fx-cross-val { font-weight: 600; font-family: var(--font-mono, monospace); font-size: 13px; }
  .fx-cross-same { color: var(--text-muted); }
  .fx-cross-table tr:hover td { background: var(--bg-tertiary); }
  `
  document.head.appendChild(style)
}
