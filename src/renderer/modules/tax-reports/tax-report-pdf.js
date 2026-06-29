// src/renderer/modules/tax-reports/tax-report-pdf.js
// Generates PDF via Electron's printToPDF (proper Cyrillic support, real download).

export async function generateTaxReportPDF(data, profile) {
  const html     = buildHTML(data, profile)
  const filename = `Zvit_${data.label.replace(/\s+/g, '_')}.pdf`

  if (window.electron?.pdf?.generate) {
    const result = await window.electron.pdf.generate(html, filename)
    if (result?.error) throw new Error(result.error)
  } else {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Дозвольте спливаючі вікна'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }
}

function buildHTML(data, profile) {
  const { label, income, expense, profit, vatTotal, payrollCost, invoiced, paid, invoices, warehouse, warehouseValue, fopGroup, epAmount, esvOwn } = data
  const money = v => Number(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<title>Звіт ${esc(label)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff}
.page{max-width:760px;margin:0 auto;padding:44px 52px}
.hd{text-align:center;margin-bottom:24px}
.hd-title{font-size:26px;font-weight:900;letter-spacing:.03em}
.hd-sub{font-size:13px;color:#555;margin-top:4px}
hr{border:none;border-top:1px solid #ddd;margin:18px 0}
.party-info{font-size:12px;color:#555;line-height:1.7;margin-bottom:20px}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
.kpi-box{border:1px solid #eee;border-radius:8px;padding:10px 12px}
.kpi-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-bottom:4px}
.kpi-val{font-size:16px;font-weight:800}
.section-title{font-size:14px;font-weight:800;margin:18px 0 10px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
thead th{background:#f4f4f4;padding:7px 9px;text-align:left;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.04em;color:#666;border-bottom:2px solid #ddd}
tbody td{padding:8px 9px;border-bottom:1px solid #eee;font-size:12px}
tbody td:last-child{text-align:right}
.empty{font-size:12px;color:#999;padding:8px 0}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:15mm 18mm}
}
</style>
</head>
<body>
<div class="page">
<div class="hd">
  <div class="hd-title">ЗВІТ</div>
  <div class="hd-sub">${esc(label)}</div>
</div>
<hr>
<div class="party-info">
  ${esc(profile.businessName || profile.name || '')}<br>
  ${profile.taxId ? `ІПН: ${esc(profile.taxId)}<br>` : ''}
  Сформовано: ${new Date().toLocaleDateString('uk-UA')}
</div>

<div class="kpi-grid">
  <div class="kpi-box"><div class="kpi-lbl">Дохід</div><div class="kpi-val">₴${money(income)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">Витрати</div><div class="kpi-val">₴${money(expense)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">Чистий прибуток</div><div class="kpi-val">₴${money(profit)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">Виставлено / оплачено</div><div class="kpi-val">₴${money(invoiced)} / ₴${money(paid)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">Зарплата нарахована</div><div class="kpi-val">₴${money(payrollCost)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">ПДВ нарахований</div><div class="kpi-val">₴${money(vatTotal)}</div></div>
  ${fopGroup ? `
  <div class="kpi-box"><div class="kpi-lbl">Єдиний податок (${esc(fopGroup)} гр.)</div><div class="kpi-val">₴${money(epAmount)}</div></div>
  <div class="kpi-box"><div class="kpi-lbl">ЄСВ (особистий)</div><div class="kpi-val">₴${money(esvOwn)}</div></div>
  ` : ''}
</div>

<div class="section-title">Рахунки за період (${invoices.length})</div>
${invoices.length ? `
<table>
  <thead><tr><th>Дата</th><th>Клієнт</th><th>Статус</th><th>Сума</th></tr></thead>
  <tbody>
    ${invoices.map(inv => `
      <tr>
        <td>${esc(inv.dateStr)}</td>
        <td>${esc(inv.clientName)}</td>
        <td>${esc(inv.statusLabel)}</td>
        <td>₴${money(inv.amount)}</td>
      </tr>`).join('')}
  </tbody>
</table>` : `<div class="empty">Рахунків за цей період немає</div>`}

${warehouse.length ? `
<div class="section-title">Товарні залишки (${warehouse.length}) — на суму ₴${money(warehouseValue)}</div>
<table>
  <thead><tr><th>Товар</th><th>Категорія</th><th>К-сть</th><th>Ціна</th><th>Сума</th></tr></thead>
  <tbody>
    ${warehouse.map(item => `
      <tr>
        <td>${esc(item.name)}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.qtyStr)}</td>
        <td>₴${money(item.price)}</td>
        <td>₴${money(item.value)}</td>
      </tr>`).join('')}
  </tbody>
</table>` : ''}

</div>
</body>
</html>`
}

function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
