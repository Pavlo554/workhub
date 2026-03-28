// src/renderer/modules/tax-calendar/index.js
export async function render(container) {
  container.innerHTML = `
    <div class="page-wrap">
      <div class="page-header">
        <div>
          <h1 class="page-title">📅 Податковий календар</h1>
          <p class="page-subtitle">Важливі дати та дедлайни</p>
        </div>
      </div>

      <div class="tax-events">
        ${TAX_EVENTS.map(e => `
          <div class="tax-event-card">
            <div class="tax-event-date">${e.date}</div>
            <div class="tax-event-body">
              <div class="tax-event-title">${e.title}</div>
              <div class="tax-event-desc">${e.desc}</div>
            </div>
            <div class="tax-event-badge tax-badge-${e.type}">${BADGE_LABELS[e.type]}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
  injectStyles()
}

const BADGE_LABELS = { report: 'Звітність', payment: 'Оплата', other: 'Інше' }

const TAX_EVENTS = [
  { date: '20 січня',    title: 'Єдиний внесок (ЄСВ) за IV квартал', desc: 'Сплата ЄСВ за жовтень–грудень',                         type: 'payment' },
  { date: '1 лютого',   title: 'Декларація про майновий стан і доходи', desc: 'Для ФОП 3-ї групи за попередній рік',                  type: 'report'  },
  { date: '9 лютого',   title: 'Єдиний податок за IV квартал',         desc: 'Сплата ЄП для 1-ї та 2-ї групи',                       type: 'payment' },
  { date: '20 квітня',  title: 'Єдиний внесок (ЄСВ) за I квартал',    desc: 'Сплата ЄСВ за січень–березень',                        type: 'payment' },
  { date: '10 травня',  title: 'Єдиний податок за I квартал',          desc: 'Сплата ЄП для 1-ї та 2-ї групи',                       type: 'payment' },
  { date: '20 липня',   title: 'Єдиний внесок (ЄСВ) за II квартал',   desc: 'Сплата ЄСВ за квітень–червень',                        type: 'payment' },
  { date: '9 серпня',   title: 'Єдиний податок за II квартал',         desc: 'Сплата ЄП для 1-ї та 2-ї групи',                       type: 'payment' },
  { date: '20 жовтня',  title: 'Єдиний внесок (ЄСВ) за III квартал',  desc: 'Сплата ЄСВ за липень–вересень',                        type: 'payment' },
  { date: '9 листопада','title': 'Єдиний податок за III квартал',       desc: 'Сплата ЄП для 1-ї та 2-ї групи',                       type: 'payment' },
]

function injectStyles() {
  if (document.getElementById('tax-calendar-styles')) return
  const s = document.createElement('style')
  s.id = 'tax-calendar-styles'
  s.textContent = `
    .tax-events { display: flex; flex-direction: column; gap: 10px; max-width: 720px; }
    .tax-event-card {
      display: flex; align-items: center; gap: 16px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 16px 20px;
    }
    .tax-event-date {
      font-family: var(--font-mono); font-size: 12px; font-weight: 700;
      color: var(--text-muted); white-space: nowrap; min-width: 90px;
    }
    .tax-event-body { flex: 1; }
    .tax-event-title { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
    .tax-event-desc  { font-size: 12px; color: var(--text-secondary); }
    .tax-event-badge {
      font-size: 11px; font-weight: 700; padding: 3px 10px;
      border-radius: var(--radius-full); white-space: nowrap;
    }
    .tax-badge-payment { background: rgba(248,113,113,.15); color: #F87171; }
    .tax-badge-report  { background: rgba(251,191,36,.15);  color: #FBBF24; }
    .tax-badge-other   { background: var(--bg-tertiary);    color: var(--text-muted); }
  `
  document.head.appendChild(s)
}
