// GET /api/portal?t=TOKEN  →  HTML client portal page (no auth required)
const { db } = require('./_lib/firebase')

module.exports = async (req, res) => {
  const token = req.query.t
  if (!token) return res.status(400).send(errPage('Посилання не вказано'))

  try {
    const portalSnap = await db.collection('clientPortals').doc(token).get()
    if (!portalSnap.exists) return res.status(404).send(errPage('Посилання не дійсне або застаріле'))

    const { basePath, clientId, clientName, clientCompany, enabled } = portalSnap.data()
    if (!enabled) return res.status(403).send(errPage('Власник закрив доступ до порталу'))

    // basePath is e.g. "users/uid" or "users/uid/businesses/bizId"
    const base = basePath || ''

    const [invoicesSnap, projectsSnap] = await Promise.all([
      db.collection(`${base}/invoices`)
        .where('clientId', '==', clientId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get().catch(() => ({ docs: [] })),
      db.collection(`${base}/projects`)
        .where('clientId', '==', clientId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get().catch(() => ({ docs: [] })),
    ])

    const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(buildPortalHTML({ clientName, clientCompany, invoices, projects }))
  } catch (err) {
    console.error('portal error:', err)
    return res.status(500).send(errPage('Помилка сервера. Спробуйте пізніше.'))
  }
}

function errPage(msg) {
  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>WorkHub Portal</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#0D0F14;color:#F1F5F9;
display:flex;align-items:center;justify-content:center;height:100vh}.box{text-align:center;padding:24px}
.logo{font-size:22px;font-weight:900;margin-bottom:16px}.logo span{color:#4F8EF7}.msg{color:#94A3B8;font-size:14px}</style>
</head><body><div class="box"><div class="logo">Work<span>Hub</span></div><div class="msg">${msg}</div></div></body></html>`
}

function fmtMoney(v) { return Number(v || 0).toLocaleString('uk-UA') }
function fmtDate(v)  {
  if (!v) return '—'
  try { const d = v.toDate ? v.toDate() : new Date(v); return d.toLocaleDateString('uk-UA') } catch { return '—' }
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function buildPortalHTML({ clientName, clientCompany, invoices, projects }) {
  const totalInvoiced = invoices.reduce((s, i) => s + (i.amount || 0), 0)
  const totalPaid     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0)
  const unpaidCount   = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').length

  const sLabel = s => ({ paid:'Оплачено', unpaid:'Очікує', pending:'На розгляді', overdue:'Прострочено', cancelled:'Скасовано' }[s] || 'Очікує')
  const sColor = s => ({ paid:'#34D399', unpaid:'#FBBF24', pending:'#4F8EF7', overdue:'#F87171', cancelled:'#6B7280' }[s] || '#FBBF24')
  const pLabel = s => ({ active:'Активний', paused:'Пауза', done:'Завершено', cancelled:'Скасовано' }[s] || s || 'Активний')
  const pColor = s => ({ active:'#34D399', paused:'#FBBF24', done:'#4F8EF7', cancelled:'#6B7280' }[s] || '#34D399')

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(clientName)} — WorkHub Портал</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#0D0F14;color:#F1F5F9;min-height:100vh}
.wrap{max-width:820px;margin:0 auto;padding:32px 20px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;flex-wrap:wrap;gap:12px}
.logo{font-size:18px;font-weight:900}.logo span{color:#4F8EF7}
.client-hd .name{font-size:24px;font-weight:800}
.client-hd .co{font-size:13px;color:#94A3B8;margin-top:2px}
.kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.kpi{background:#1A1D2E;border:1.5px solid rgba(255,255,255,.07);border-radius:12px;padding:16px 18px}
.kpi-lbl{font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.kpi-val{font-size:22px;font-weight:800}
.card{background:#1A1D2E;border:1.5px solid rgba(255,255,255,.07);border-radius:14px;padding:20px;margin-bottom:14px}
.card-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#334155;padding:0 0 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}
td{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;vertical-align:middle}
tr:last-child td{border:none}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;white-space:nowrap}
.proj-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.proj-row:last-child{border:none}
.proj-name{font-size:14px;font-weight:600;margin-bottom:5px}
.prog{background:rgba(255,255,255,.08);border-radius:99px;height:5px;width:120px;overflow:hidden}
.prog-fill{height:100%;background:#4F8EF7;border-radius:99px}
.empty{color:#334155;font-size:13px;padding:16px 0;text-align:center}
.footer{text-align:center;font-size:12px;color:#1E293B;margin-top:28px;padding-bottom:20px}
.footer a{color:#334155;text-decoration:none}
@media(max-width:560px){.kpi-row{grid-template-columns:1fr 1fr}.kpi-row .kpi:last-child{grid-column:1/-1}th:nth-child(2){display:none}td:nth-child(2){display:none}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="logo">Work<span>Hub</span></div>
    <div class="client-hd">
      <div class="name">${esc(clientName)}</div>
      ${clientCompany ? `<div class="co">${esc(clientCompany)}</div>` : ''}
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-lbl">Виставлено</div>
      <div class="kpi-val">₴${fmtMoney(totalInvoiced)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Оплачено</div>
      <div class="kpi-val" style="color:#34D399">₴${fmtMoney(totalPaid)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Рахунків</div>
      <div class="kpi-val" style="color:${unpaidCount > 0 ? '#FBBF24' : '#94A3B8'}">${invoices.length}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Рахунки</div>
    ${invoices.length ? `
    <table>
      <thead><tr><th>№</th><th>Опис</th><th>Дата</th><th>Сума</th><th>Статус</th></tr></thead>
      <tbody>
        ${invoices.map(inv => `<tr>
          <td style="color:#64748B;font-size:12px">${esc(inv.number || '—')}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(inv.description || '—')}</td>
          <td style="color:#64748B;font-size:12px;white-space:nowrap">${fmtDate(inv.createdAt)}</td>
          <td style="font-weight:700;white-space:nowrap">₴${fmtMoney(inv.amount)}</td>
          <td><span class="badge" style="color:${sColor(inv.status)};background:${sColor(inv.status)}22">${sLabel(inv.status)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">Рахунків ще немає</div>`}
  </div>

  ${projects.length ? `
  <div class="card">
    <div class="card-title">Проекти</div>
    ${projects.map(p => `
      <div class="proj-row">
        <div>
          <div class="proj-name">${esc(p.name)}</div>
          ${p.progress != null ? `<div class="prog"><div class="prog-fill" style="width:${Math.min(p.progress||0,100)}%"></div></div>` : ''}
        </div>
        <div style="text-align:right">
          <span class="badge" style="color:${pColor(p.status)};background:${pColor(p.status)}22">${pLabel(p.status)}</span>
          ${p.progress != null ? `<div style="font-size:11px;color:#475569;margin-top:4px">${p.progress||0}%</div>` : ''}
        </div>
      </div>`).join('')}
  </div>` : ''}

  <div class="footer">Powered by <a href="https://workhub.app" target="_blank">WorkHub</a></div>
</div>
</body>
</html>`
}
