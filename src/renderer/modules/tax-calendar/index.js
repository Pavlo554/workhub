// src/renderer/modules/tax-calendar/index.js

const UK_MONTHS = {
  'січня':0,'лютого':1,'березня':2,'квітня':3,'травня':4,'червня':5,
  'липня':6,'серпня':7,'вересня':8,'жовтня':9,'листопада':10,'грудня':11,
}

const BADGE = {
  report:  { label: 'Звітність', color: '#FBBF24', bg: 'rgba(251,191,36,.12)' },
  payment: { label: 'Оплата',    color: '#F87171', bg: 'rgba(248,113,113,.12)' },
  other:   { label: 'Інше',      color: '#94A3B8', bg: 'rgba(148,163,184,.12)' },
}

const EVENTS = [
  { date: '20 січня',    title: 'Єдиний внесок (ЄСВ) за IV квартал',       desc: 'Сплата ЄСВ за жовтень–грудень',         type: 'payment', quarter: 1 },
  { date: '1 лютого',   title: 'Декларація про майновий стан і доходи',     desc: 'Для ФОП 3-ї групи за попередній рік',   type: 'report',  quarter: 1 },
  { date: '9 лютого',   title: 'Єдиний податок за IV квартал',              desc: 'Сплата ЄП для 1-ї та 2-ї групи',        type: 'payment', quarter: 1 },
  { date: '20 квітня',  title: 'Єдиний внесок (ЄСВ) за I квартал',         desc: 'Сплата ЄСВ за січень–березень',         type: 'payment', quarter: 2 },
  { date: '10 травня',  title: 'Єдиний податок за I квартал',               desc: 'Сплата ЄП для 1-ї та 2-ї групи',        type: 'payment', quarter: 2 },
  { date: '20 липня',   title: 'Єдиний внесок (ЄСВ) за II квартал',        desc: 'Сплата ЄСВ за квітень–червень',         type: 'payment', quarter: 3 },
  { date: '9 серпня',   title: 'Єдиний податок за II квартал',              desc: 'Сплата ЄП для 1-ї та 2-ї групи',        type: 'payment', quarter: 3 },
  { date: '20 жовтня',  title: 'Єдиний внесок (ЄСВ) за III квартал',       desc: 'Сплата ЄСВ за липень–вересень',         type: 'payment', quarter: 4 },
  { date: '9 листопада',title: 'Єдиний податок за III квартал',             desc: 'Сплата ЄП для 1-ї та 2-ї групи',        type: 'payment', quarter: 4 },
]

// ЄСВ мінімальний внесок 2026 (орієнтовно)
const ESV_MIN    = 1760
const TAX_1_GRP  = 302   // ~10% прожиткового мінімуму
const TAX_2_GRP  = 1510  // 20% мінімалки

const DONE_KEY = 'workhub_tax_done'
function getDoneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')) } catch { return new Set() }
}
function toggleDone(id) {
  const s = getDoneSet()
  s.has(id) ? s.delete(id) : s.add(id)
  localStorage.setItem(DONE_KEY, JSON.stringify([...s]))
}

function parseDate(str) {
  const [day, month] = str.trim().split(' ')
  const now = new Date()
  let year = now.getFullYear()
  const d = new Date(year, UK_MONTHS[month], parseInt(day))
  if (d < now) d.setFullYear(year + 1)
  return d
}

function daysUntil(str) {
  const d = parseDate(str)
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.round((d - now) / 86400000)
}

function urgencyClass(days, done) {
  if (done)     return 'tc-urge-done'
  if (days <= 0) return 'tc-urge-overdue'
  if (days <= 7) return 'tc-urge-critical'
  if (days <= 30) return 'tc-urge-soon'
  return 'tc-urge-ok'
}

function daysLabel(days, done) {
  if (done)       return '✓ Сплачено'
  if (days < 0)   return `Прострочено ${Math.abs(days)} дн`
  if (days === 0) return 'Сьогодні!'
  if (days === 1) return 'Завтра!'
  return `${days} днів`
}

export async function render(container) {
  injectStyles()
  let activeFilter = 'all'

  function buildHTML() {
    const done       = getDoneSet()
    const filtered   = activeFilter === 'all' ? EVENTS : EVENTS.filter(e => e.type === activeFilter)
    const totalCount = EVENTS.length
    const doneCount  = EVENTS.filter(e => done.has(e.date)).length
    const progress   = Math.round((doneCount / totalCount) * 100)

    // Next upcoming
    const upcoming = [...EVENTS]
      .filter(e => !done.has(e.date) && daysUntil(e.date) >= 0)
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0]

    // Next 3 upcoming (for sidebar)
    const nextThree = [...EVENTS]
      .filter(e => !done.has(e.date))
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
      .slice(0, 3)

    // Group by quarter
    const quarters = {}
    filtered.forEach(e => {
      const q = e.quarter
      if (!quarters[q]) quarters[q] = []
      quarters[q].push(e)
    })

    // Payments count / report count
    const payCount    = EVENTS.filter(e => e.type === 'payment').length
    const reportCount = EVENTS.filter(e => e.type === 'report').length
    const payDone     = EVENTS.filter(e => e.type === 'payment' && done.has(e.date)).length
    const repDone     = EVENTS.filter(e => e.type === 'report'  && done.has(e.date)).length

    // Total tax estimate (ЄСВ x4 quarters + ЄП x2 (1+2 group avg) x4 quarters)
    const esvTotal   = ESV_MIN * 4
    const taxTotal   = TAX_2_GRP * 4
    const yearTotal  = esvTotal + taxTotal

    return `
      <div class="tc-root">

        <!-- ══ LEFT COLUMN ══ -->
        <div class="tc-main">

          <div class="tc-header">
            <div>
              <h1 class="tc-title">📅 Податковий календар</h1>
              <p class="tc-subtitle">ФОП — важливі дати та дедлайни ${new Date().getFullYear()}</p>
            </div>
            <div class="tc-header-right">
              <div class="tc-progress-wrap">
                <div class="tc-progress-label">${doneCount} / ${totalCount} виконано</div>
                <div class="tc-progress-bar"><div class="tc-progress-fill" style="width:${progress}%"></div></div>
              </div>
            </div>
          </div>

          ${upcoming ? `
          <div class="tc-next-card ${daysUntil(upcoming.date) <= 7 ? 'tc-next-critical' : daysUntil(upcoming.date) <= 30 ? 'tc-next-soon' : 'tc-next-ok'}">
            <div class="tc-next-left">
              <div class="tc-next-eyebrow">⚡ Наступний дедлайн</div>
              <div class="tc-next-title">${upcoming.title}</div>
              <div class="tc-next-desc">${upcoming.desc}</div>
              <div class="tc-next-date-row">
                <span class="tc-next-date">📅 ${upcoming.date}</span>
                <span class="tc-badge" style="color:${BADGE[upcoming.type].color};background:${BADGE[upcoming.type].bg}">${BADGE[upcoming.type].label}</span>
              </div>
            </div>
            <div class="tc-next-right">
              <div class="tc-next-days">${daysUntil(upcoming.date)}</div>
              <div class="tc-next-days-label">днів залишилось</div>
            </div>
          </div>` : `
          <div class="tc-next-card tc-next-ok" style="justify-content:center;gap:16px">
            <div style="font-size:40px">🎉</div>
            <div><div class="tc-next-eyebrow">Все виконано!</div><div class="tc-next-title">Молодець, всі дедлайни закриті</div></div>
          </div>`}

          <div class="tc-toolbar">
            <div class="tc-filter-pills">
              <button class="tc-pill ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">Всі (${totalCount})</button>
              <button class="tc-pill ${activeFilter === 'payment' ? 'active' : ''}" data-filter="payment">💳 Оплати (${payCount})</button>
              <button class="tc-pill ${activeFilter === 'report' ? 'active' : ''}" data-filter="report">📋 Звітність (${reportCount})</button>
            </div>
            <button class="tc-reset-btn" id="tc-reset-btn">↺ Скинути позначки</button>
          </div>

          <div class="tc-list">
            ${Object.entries(quarters).map(([q, events]) => `
              <div class="tc-quarter-group">
                <div class="tc-quarter-label">
                  <span>Q${q}</span>
                  <span>${['','Січень–Березень','Квітень–Червень','Липень–Вересень','Жовтень–Грудень'][q]}</span>
                  <span class="tc-q-done">${events.filter(e => done.has(e.date)).length}/${events.length}</span>
                </div>
                ${events.map(e => {
                  const days  = daysUntil(e.date)
                  const isDone = done.has(e.date)
                  const uc    = urgencyClass(days, isDone)
                  const b     = BADGE[e.type]
                  return `
                    <div class="tc-event-row ${isDone ? 'tc-row-done' : ''} ${uc}">
                      <button class="tc-check ${isDone ? 'checked' : ''}" data-date="${e.date}">
                        ${isDone ? '✓' : ''}
                      </button>
                      <div class="tc-event-date-col">
                        <div class="tc-event-date">${e.date}</div>
                      </div>
                      <div class="tc-event-body">
                        <div class="tc-event-title">${e.title}</div>
                        <div class="tc-event-desc">${e.desc}</div>
                      </div>
                      <div class="tc-event-right">
                        <span class="tc-badge" style="color:${b.color};background:${b.bg}">${b.label}</span>
                        <span class="tc-days-chip ${uc}">${daysLabel(days, isDone)}</span>
                      </div>
                    </div>`
                }).join('')}
              </div>
            `).join('')}
          </div>

        </div>

        <!-- ══ RIGHT SIDEBAR ══ -->
        <div class="tc-sidebar">

          <!-- Progress card -->
          <div class="tc-sb-card">
            <div class="tc-sb-title">📊 Прогрес</div>
            <div class="tc-ring-wrap">
              <svg viewBox="0 0 100 100" class="tc-ring-svg">
                <circle cx="50" cy="50" r="36" fill="none" stroke="var(--bg-tertiary)" stroke-width="10"/>
                <circle cx="50" cy="50" r="36" fill="none" stroke="#4F8EF7" stroke-width="10"
                  stroke-dasharray="${(progress / 100 * 226).toFixed(1)} 226"
                  stroke-dashoffset="56.5" stroke-linecap="round"
                  style="transition:stroke-dasharray .6s"/>
              </svg>
              <div class="tc-ring-val">${progress}%</div>
            </div>
            <div class="tc-sb-stats">
              <div class="tc-sb-stat">
                <span class="tc-sb-stat-icon" style="color:#F87171">💳</span>
                <span>Оплати</span>
                <strong>${payDone}/${payCount}</strong>
              </div>
              <div class="tc-sb-stat">
                <span class="tc-sb-stat-icon" style="color:#FBBF24">📋</span>
                <span>Звітність</span>
                <strong>${repDone}/${reportCount}</strong>
              </div>
            </div>
          </div>

          <!-- Upcoming 3 -->
          <div class="tc-sb-card">
            <div class="tc-sb-title">⏰ Найближчі</div>
            ${nextThree.length ? nextThree.map(e => {
              const days = daysUntil(e.date)
              const uc   = urgencyClass(days, false)
              return `
                <div class="tc-upcoming-item">
                  <div class="tc-upcoming-dot ${uc}"></div>
                  <div class="tc-upcoming-info">
                    <div class="tc-upcoming-title">${e.title.replace('Єдиний ', '').replace(' квартал','')}</div>
                    <div class="tc-upcoming-date">${e.date}</div>
                  </div>
                  <div class="tc-upcoming-days ${uc}">${days}д</div>
                </div>`
            }).join('') : '<div class="tc-sb-empty">Всі виконані 🎉</div>'}
          </div>

          <!-- Tax calculator -->
          <div class="tc-sb-card" id="tc-calc-card">
            <div class="tc-sb-title">🧮 Калькулятор ФОП</div>
            <div class="tc-calc-groups">
              <button class="tc-calc-grp active" data-grp="2">2 група</button>
              <button class="tc-calc-grp" data-grp="3">3 група</button>
            </div>
            <div class="tc-calc-grp-hint" id="tc-grp-hint">Фіксований ЄП · до 10 найманих</div>
            <div class="tc-calc-field" id="tc-income-wrap" style="display:none">
              <label class="tc-calc-label">Місячний дохід, ₴</label>
              <input class="tc-calc-input" id="tc-income" type="number" placeholder="50000" min="0" />
            </div>
            <div class="tc-tax-rows" id="tc-calc-result">
              <div class="tc-tax-row">
                <span>ЄП / міс</span>
                <strong id="tc-ep-month">₴${TAX_2_GRP.toLocaleString('uk-UA')}</strong>
              </div>
              <div class="tc-tax-row">
                <span>ЄСВ / міс</span>
                <strong id="tc-esv-month">₴${Math.round(ESV_MIN/3).toLocaleString('uk-UA')}</strong>
              </div>
              <div class="tc-tax-row tc-tax-total">
                <span>Разом / міс</span>
                <strong id="tc-total-month" style="color:#34D399">₴${(TAX_2_GRP + Math.round(ESV_MIN/3)).toLocaleString('uk-UA')}</strong>
              </div>
              <div class="tc-tax-row">
                <span>Разом / рік</span>
                <strong id="tc-total-year">₴${((TAX_2_GRP + Math.round(ESV_MIN/3)) * 12).toLocaleString('uk-UA')}</strong>
              </div>
            </div>
          </div>

          <!-- Quick tips -->
          <div class="tc-sb-card tc-sb-tips">
            <div class="tc-sb-title">💡 Нагадування</div>
            <div class="tc-tip">📌 ЄСВ сплачується до 20-го числа після кварталу</div>
            <div class="tc-tip">📌 ЄП для 2-ї групи — до 20-го числа першого місяця кварталу</div>
            <div class="tc-tip">📌 Декларація 3-ї групи — до 10 числа 3-го місяця після кварталу</div>
          </div>

        </div>
      </div>
    `
  }

  function rerender() {
    container.innerHTML = buildHTML()
    attachEvents()
  }

  function attachEvents() {
    container.querySelectorAll('.tc-pill').forEach(btn => {
      btn.addEventListener('click', () => { activeFilter = btn.dataset.filter; rerender() })
    })
    container.querySelectorAll('.tc-check').forEach(btn => {
      btn.addEventListener('click', () => { toggleDone(btn.dataset.date); rerender() })
    })
    container.querySelector('#tc-reset-btn')?.addEventListener('click', () => {
      localStorage.removeItem(DONE_KEY); rerender()
    })

    // ── Калькулятор ФОП ───────────────────────────────────────
    let calcGrp = 2
    const ESV_MONTH = Math.round(ESV_MIN / 3)

    function calcUpdate() {
      const income = parseFloat(container.querySelector('#tc-income')?.value) || 0
      let ep, total

      if (calcGrp === 2) {
        ep    = TAX_2_GRP
        total = ep + ESV_MONTH
        container.querySelector('#tc-income-wrap').style.display = 'none'
      } else {
        // 3 група: 5% від доходу
        ep    = Math.round(income * 0.05)
        total = ep + ESV_MONTH
        container.querySelector('#tc-income-wrap').style.display = ''
      }

      container.querySelector('#tc-ep-month').textContent    = '₴' + ep.toLocaleString('uk-UA')
      container.querySelector('#tc-esv-month').textContent   = '₴' + ESV_MONTH.toLocaleString('uk-UA')
      container.querySelector('#tc-total-month').textContent = '₴' + total.toLocaleString('uk-UA')
      container.querySelector('#tc-total-year').textContent  = '₴' + (total * 12).toLocaleString('uk-UA')
    }

    container.querySelector('#tc-calc-card')?.querySelectorAll('.tc-calc-grp').forEach(btn => {
      btn.addEventListener('click', () => {
        calcGrp = parseInt(btn.dataset.grp)
        container.querySelector('#tc-calc-card').querySelectorAll('.tc-calc-grp').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        const hints = { 2: 'Фіксований ЄП · до 10 найманих', 3: '5% від доходу · будь-яка кількість' }
        container.querySelector('#tc-grp-hint').textContent = hints[calcGrp]
        calcUpdate()
      })
    })
    container.querySelector('#tc-income')?.addEventListener('input', calcUpdate)
  }

  rerender()
}

function injectStyles() {
  document.getElementById('tax-calendar-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'tax-calendar-styles'
  s.textContent = `
    /* ── Root layout ── */
    .tc-root {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 24px;
      padding: 28px 32px;
      height: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    .tc-main    { overflow-y: auto; display: flex; flex-direction: column; gap: 20px; padding-right: 4px; }
    .tc-sidebar { overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px; }

    /* ── Header ── */
    .tc-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; flex-wrap:wrap; }
    .tc-title   { font-family:var(--font-display); font-size:24px; font-weight:800; margin-bottom:4px; }
    .tc-subtitle { font-size:13px; color:var(--text-muted); }
    .tc-progress-wrap { text-align:right; }
    .tc-progress-label { font-size:12px; color:var(--text-muted); margin-bottom:6px; font-weight:600; }
    .tc-progress-bar  { width:140px; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden; }
    .tc-progress-fill { height:100%; background:linear-gradient(90deg,#34D399,#4F8EF7); border-radius:3px; transition:width .6s; }

    /* ── Next deadline card ── */
    .tc-next-card {
      display:flex; justify-content:space-between; align-items:center; gap:20px;
      padding:22px 26px; border-radius:var(--radius-xl);
      background:var(--bg-secondary); border:1.5px solid var(--border);
      position:relative; overflow:hidden; flex-shrink:0;
    }
    .tc-next-card::before {
      content:''; position:absolute; inset:0; pointer-events:none;
      background:linear-gradient(135deg,var(--tc-nc,rgba(79,142,247,.05)) 0%,transparent 60%);
    }
    .tc-next-critical { --tc-nc:rgba(248,113,113,.08); border-color:rgba(248,113,113,.4); }
    .tc-next-soon     { --tc-nc:rgba(251,191,36,.06);  border-color:rgba(251,191,36,.3); }
    .tc-next-ok       { --tc-nc:rgba(79,142,247,.05);  }
    .tc-next-eyebrow  { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); margin-bottom:6px; }
    .tc-next-title    { font-family:var(--font-display); font-size:17px; font-weight:800; margin-bottom:4px; }
    .tc-next-desc     { font-size:13px; color:var(--text-secondary); margin-bottom:10px; }
    .tc-next-date-row { display:flex; align-items:center; gap:10px; }
    .tc-next-date     { font-size:12px; font-weight:700; color:var(--text-muted); }
    .tc-next-right    { text-align:center; flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:4px; }
    .tc-next-days     { font-family:var(--font-display); font-size:52px; font-weight:900; line-height:1; }
    .tc-next-days-label { font-size:11px; color:var(--text-muted); font-weight:600; }

    /* ── Toolbar ── */
    .tc-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; flex-shrink:0; }
    .tc-filter-pills { display:flex; gap:6px; }
    .tc-pill { padding:6px 14px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .tc-pill:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .tc-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .tc-reset-btn { font-size:12px; color:var(--text-muted); background:none; border:none; cursor:pointer; padding:4px 8px; border-radius:var(--radius-sm); transition:all .15s; }
    .tc-reset-btn:hover { color:var(--text-primary); background:var(--bg-secondary); }

    /* ── List ── */
    .tc-list { display:flex; flex-direction:column; gap:20px; padding-bottom: 24px; }
    .tc-quarter-group {}
    .tc-quarter-label {
      display:flex; align-items:center; gap:8px;
      font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
      color:var(--text-muted); padding:0 0 8px 0; border-bottom:1px solid var(--border); margin-bottom:8px;
    }
    .tc-quarter-label span:first-child { color:var(--accent-blue); }
    .tc-quarter-label span:last-child { flex:1; }
    .tc-q-done { margin-left:auto; background:var(--bg-tertiary); padding:2px 8px; border-radius:var(--radius-full); font-size:10px; color:var(--text-muted); font-weight:700; }

    /* ── Event rows ── */
    .tc-event-row {
      display:flex; align-items:center; gap:12px; padding:13px 16px;
      border-radius:var(--radius-lg); background:var(--bg-secondary); border:1px solid var(--border);
      margin-bottom:6px; transition:all .15s; border-left:3px solid transparent;
    }
    .tc-event-row:last-child { margin-bottom:0; }
    .tc-event-row:hover { border-color:var(--accent-blue); transform:translateX(2px); }
    .tc-row-done { opacity:.45; }
    .tc-row-done:hover { opacity:.65; }
    .tc-urge-overdue  { border-left-color:#F87171 !important; }
    .tc-urge-critical { border-left-color:#F87171 !important; }
    .tc-urge-soon     { border-left-color:#FBBF24 !important; }
    .tc-urge-ok       { border-left-color:var(--border); }
    .tc-urge-done     { border-left-color:#34D399 !important; }

    .tc-check {
      width:22px; height:22px; border-radius:50%; border:2px solid var(--border); background:none;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:800; color:#34D399; flex-shrink:0; transition:all .15s;
    }
    .tc-check:hover { border-color:#34D399; background:rgba(52,211,153,.08); }
    .tc-check.checked { background:rgba(52,211,153,.15); border-color:#34D399; }

    .tc-event-date-col { min-width:88px; flex-shrink:0; }
    .tc-event-date  { font-size:12px; font-weight:700; color:var(--text-muted); font-family:var(--font-mono,monospace); }
    .tc-event-body  { flex:1; min-width:0; }
    .tc-event-title { font-size:13px; font-weight:600; margin-bottom:2px; }
    .tc-event-desc  { font-size:11px; color:var(--text-secondary); }
    .tc-event-right { display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0; }

    .tc-badge { font-size:10px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); white-space:nowrap; }
    .tc-days-chip { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--radius-full); white-space:nowrap; }
    .tc-days-chip.tc-urge-overdue  { background:rgba(248,113,113,.15); color:#F87171; }
    .tc-days-chip.tc-urge-critical { background:rgba(248,113,113,.12); color:#F87171; }
    .tc-days-chip.tc-urge-soon     { background:rgba(251,191,36,.12);  color:#FBBF24; }
    .tc-days-chip.tc-urge-ok       { background:var(--bg-tertiary);    color:var(--text-muted); }
    .tc-days-chip.tc-urge-done     { background:rgba(52,211,153,.12);  color:#34D399; }

    /* ══ SIDEBAR ══ */
    .tc-sb-card {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); padding:18px;
    }
    .tc-sb-title { font-size:13px; font-weight:700; margin-bottom:14px; }
    .tc-sb-hint  { font-size:11px; color:var(--text-muted); margin-top:-10px; margin-bottom:12px; }
    .tc-sb-empty { font-size:12px; color:var(--text-muted); text-align:center; padding:8px 0; }

    /* Ring */
    .tc-ring-wrap { position:relative; width:90px; height:90px; margin:0 auto 16px; }
    .tc-ring-svg  { width:100%; height:100%; transform:rotate(-90deg); }
    .tc-ring-val  { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:18px; font-weight:800; }

    .tc-sb-stats  { display:flex; flex-direction:column; gap:8px; }
    .tc-sb-stat   { display:flex; align-items:center; gap:8px; font-size:12px; }
    .tc-sb-stat strong { margin-left:auto; font-weight:700; }

    /* Upcoming */
    .tc-upcoming-item { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); }
    .tc-upcoming-item:last-child { border-bottom:none; }
    .tc-upcoming-dot  { width:8px; height:8px; border-radius:50%; flex-shrink:0; background:var(--border); }
    .tc-upcoming-dot.tc-urge-critical,.tc-upcoming-dot.tc-urge-overdue { background:#F87171; }
    .tc-upcoming-dot.tc-urge-soon  { background:#FBBF24; }
    .tc-upcoming-dot.tc-urge-ok    { background:#4F8EF7; }
    .tc-upcoming-info { flex:1; min-width:0; }
    .tc-upcoming-title { font-size:11px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tc-upcoming-date  { font-size:10px; color:var(--text-muted); }
    .tc-upcoming-days  { font-size:11px; font-weight:700; flex-shrink:0; color:var(--text-muted); }
    .tc-upcoming-days.tc-urge-critical,.tc-upcoming-days.tc-urge-overdue { color:#F87171; }
    .tc-upcoming-days.tc-urge-soon  { color:#FBBF24; }

    /* Tax rows */
    .tc-tax-rows { display:flex; flex-direction:column; gap:6px; }
    .tc-tax-row  { display:flex; justify-content:space-between; font-size:12px; padding:5px 0; border-bottom:1px solid var(--border); }
    .tc-tax-row:last-child { border:none; }
    .tc-tax-total { margin-top:4px; font-weight:700; font-size:13px; }
    .tc-tax-total strong { color:#34D399; }

    /* Tips */
    .tc-sb-tips { }
    .tc-tip { font-size:11px; color:var(--text-secondary); line-height:1.6; padding:5px 0; border-bottom:1px solid var(--border); }
    .tc-tip:last-child { border:none; }

    /* Calculator */
    .tc-calc-groups { display:flex; gap:6px; margin-bottom:8px; }
    .tc-calc-grp {
      flex:1; padding:6px 10px; border-radius:var(--radius-sm); font-size:12px; font-weight:700;
      border:1.5px solid var(--border); background:var(--bg-tertiary); color:var(--text-muted);
      cursor:pointer; transition:all .15s;
    }
    .tc-calc-grp:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .tc-calc-grp.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .tc-calc-grp-hint { font-size:10px; color:var(--text-muted); margin-bottom:12px; text-align:center; }
    .tc-calc-field { margin-bottom:10px; }
    .tc-calc-label { font-size:11px; color:var(--text-muted); font-weight:600; display:block; margin-bottom:5px; }
    .tc-calc-input {
      width:100%; box-sizing:border-box; padding:8px 12px;
      background:var(--bg-tertiary); border:1.5px solid var(--border);
      border-radius:var(--radius-sm); font-size:13px; color:var(--text-primary);
      outline:none; transition:border-color .15s;
    }
    .tc-calc-input:focus { border-color:var(--accent-blue); }

    @media (max-width:1100px) {
      .tc-root { grid-template-columns:1fr; }
      .tc-sidebar { display:none; }
    }
  `
  document.head.appendChild(s)
}
