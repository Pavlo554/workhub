// src/renderer/modules/invoices/invoice-pdf.js
// Generates PDF via Electron's printToPDF (proper Cyrillic support, real download).

const PAY_LABELS = {
  card:   'Банківська картка',
  crypto: 'Криптовалюта',
  cash:   'Готівка',
}

export async function generateInvoicePDF(invoice, profile) {
  const html     = buildHTML(invoice, profile)
  const safeName = (invoice.client || 'client').replace(/[^\wа-яА-ЯіІїЇєЄ]/g, '_')
  const filename = `Rakhunok_${invoice.number || 'INV'}_${safeName}.pdf`

  if (window.electron?.pdf?.generate) {
    const result = await window.electron.pdf.generate(html, filename)
    if (result?.error) throw new Error(result.error)
  } else {
    // Browser fallback (non-Electron): open print dialog
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Дозвольте спливаючі вікна'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }
}

function buildHTML(invoice, profile) {
  const dateStr  = formatDate(invoice.date)
  const payLabel = PAY_LABELS[invoice.payMethod] || invoice.payMethod || '—'
  const isPaid   = invoice.status === 'paid'
  const money    = v => Number(v).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<title>Рахунок ${esc(invoice.number)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff}
.page{max-width:760px;margin:0 auto;padding:44px 52px;position:relative}
.stamp{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);
  font-size:80px;font-weight:900;letter-spacing:.06em;color:rgba(34,197,94,.1);
  pointer-events:none;white-space:nowrap;z-index:0}
.hd{text-align:center;margin-bottom:28px}
.hd-title{font-size:30px;font-weight:900;letter-spacing:.04em}
.hd-num{font-size:14px;color:#555;margin-top:4px}
.hd-date{font-size:12px;color:#888;margin-top:2px}
hr{border:none;border-top:1px solid #ddd;margin:20px 0}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:24px}
.party-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:6px}
.party-name{font-size:16px;font-weight:800;margin-bottom:6px}
.party-info{font-size:12px;color:#555;line-height:1.7}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
thead th{background:#f4f4f4;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:2px solid #ddd}
thead th:last-child{text-align:right;width:130px}
tbody td{padding:12px 10px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
tbody td:last-child{text-align:right;font-weight:700;white-space:nowrap}
.totals{display:flex;justify-content:flex-end;margin-bottom:28px}
.totals-box{width:280px}
.total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666;border-bottom:1px solid #eee}
.total-main{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;
  background:#e8f0fe;border-radius:8px;margin-top:10px}
.total-main span:first-child{font-size:13px;font-weight:700;color:#1d4ed8}
.total-main span:last-child{font-size:17px;font-weight:900;color:#1d4ed8}
.section-title{font-size:13px;font-weight:700;margin-bottom:8px}
.info-line{font-size:12px;color:#444;line-height:1.9;word-break:break-all}
.notes{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px 16px;margin-bottom:24px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:44px;padding-top:20px;border-top:1px solid #ddd}
.sig-lbl{font-size:12px;font-weight:700;margin-bottom:32px}
.sig-line{border-top:1px solid #999;padding-top:4px;font-size:10px;color:#aaa;text-align:center}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:15mm 18mm}
}
</style>
</head>
<body>
<div class="page">
${isPaid ? '<div class="stamp">ОПЛАЧЕНО</div>' : ''}
<div class="hd">
  <div class="hd-title">РАХУНОК</div>
  <div class="hd-num">№ ${esc(invoice.number)}</div>
  <div class="hd-date">м. ${esc(profile.city || '___')}, ${dateStr}</div>
</div>
<hr>
<div class="parties">
  <div>
    <div class="party-lbl">Виконавець</div>
    <div class="party-name">${esc(profile.businessName || profile.name || '___')}</div>
    <div class="party-info">
      ${profile.phone ? `Тел: ${esc(profile.phone)}<br>` : ''}
      ${profile.email ? `Email: ${esc(profile.email)}<br>` : ''}
      ${profile.taxId ? `ІПН: ${esc(profile.taxId)}` : ''}
    </div>
  </div>
  <div>
    <div class="party-lbl">Замовник</div>
    <div class="party-name">${esc(invoice.client || '___')}</div>
  </div>
</div>
<hr>
<table>
  <thead><tr><th>Опис послуг / робіт</th><th>Сума</th></tr></thead>
  <tbody>
    <tr>
      <td>${esc(invoice.description || '—')}</td>
      <td>₴${money(invoice.amount)}</td>
    </tr>
  </tbody>
</table>
<div class="totals">
  <div class="totals-box">
    <div class="total-row"><span>Всього без ПДВ:</span><span>₴${money(invoice.amount)}</span></div>
    <div class="total-main"><span>До сплати:</span><span>₴${money(invoice.amount)}</span></div>
  </div>
</div>
<div style="margin-bottom:24px">
  <div class="section-title">Реквізити оплати</div>
  <div class="info-line">
    Спосіб оплати: ${esc(payLabel)}<br>
    ${invoice.payMethod === 'crypto' && invoice.cryptoAddr ? `Адреса: ${esc(invoice.cryptoAddr)}<br>` : ''}
    ${profile.iban     ? `IBAN: ${esc(profile.iban)}<br>` : ''}
    ${profile.bankName ? `Банк: ${esc(profile.bankName)}`  : ''}
  </div>
</div>
${invoice.note ? `
<div class="notes">
  <div class="section-title">Примітки</div>
  <div class="info-line">${esc(invoice.note)}</div>
</div>` : ''}
<div class="sigs">
  <div><div class="sig-lbl">Виконавець:</div><div class="sig-line">підпис</div></div>
  <div><div class="sig-lbl">Замовник:</div><div class="sig-line">підпис</div></div>
</div>
</div>
</body>
</html>`
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatDate(dateStr) {
  if (!dateStr) return '__.__.____'
  return new Date(dateStr).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
}
