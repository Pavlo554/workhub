// src/renderer/modules/contracts/contract-pdf.js
// Uses Electron's printToPDF (Chromium) — correct Cyrillic rendering.

export async function generateContractPDF(contract, profile) {
  const html     = buildHTML(contract, profile)
  const safeName = (contract.client || 'client').replace(/[^\wа-яА-ЯіІїЇєЄ]/g, '_')
  const filename = `Dogovir_${contract.number || 'DOG'}_${safeName}.pdf`

  if (window.electron?.pdf?.generate) {
    const result = await window.electron.pdf.generate(html, filename)
    if (result?.error) throw new Error(result.error)
  } else {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Дозвольте спливаючі вікна'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }
}

function buildHTML(contract, profile) {
  const money = v => Number(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2 })
  const fd    = d => d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<title>Договір ${esc(contract.number)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;background:#fff;line-height:1.6}
.page{max-width:760px;margin:0 auto;padding:44px 52px}
.center{text-align:center}
h1{font-size:20px;font-weight:900;letter-spacing:.06em;margin-bottom:4px}
.sub{font-size:13px;color:#555;margin-bottom:28px}
hr{border:none;border-top:1px solid #ddd;margin:18px 0}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:24px}
.party-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:5px}
.party-name{font-size:15px;font-weight:800;margin-bottom:6px}
.party-info{font-size:12px;color:#555}
.section{margin-bottom:20px}
.section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.section-body{font-size:13px;color:#222}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:48px;padding-top:20px;border-top:1px solid #ddd}
.sig-lbl{font-size:12px;font-weight:700;margin-bottom:28px}
.sig-line{border-top:1px solid #999;padding-top:4px;font-size:10px;color:#aaa;text-align:center}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:15mm 18mm}
}
</style>
</head>
<body>
<div class="page">
  <div class="center">
    <h1>ДОГОВІР</h1>
    <div class="sub">
      № ${esc(contract.number)}${contract.date ? ` &nbsp;·&nbsp; ${fd(contract.date)}` : ''}
      ${profile.city ? ` &nbsp;·&nbsp; м. ${esc(profile.city)}` : ''}
    </div>
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
      <div class="party-name">${esc(contract.client || '___')}</div>
    </div>
  </div>
  <hr>

  ${contract.subject ? `
  <div class="section">
    <div class="section-title">1. Предмет договору</div>
    <div class="section-body">${esc(contract.subject)}</div>
  </div>` : ''}

  ${contract.amount ? `
  <div class="section">
    <div class="section-title">${contract.subject ? '2.' : '1.'} Вартість послуг</div>
    <div class="section-body">
      Загальна вартість: <strong>₴${money(contract.amount)}</strong> (${money(contract.amount)} гривень).
    </div>
  </div>` : ''}

  ${(contract.startDate || contract.endDate) ? `
  <div class="section">
    <div class="section-title">Термін дії договору</div>
    <div class="section-body">
      ${contract.startDate ? `з ${fd(contract.startDate)}` : ''}
      ${contract.startDate && contract.endDate ? ' по ' : ''}
      ${contract.endDate ? fd(contract.endDate) : ''}
    </div>
  </div>` : ''}

  ${contract.notes ? `
  <div class="section">
    <div class="section-title">Додаткові умови</div>
    <div class="section-body">${esc(contract.notes)}</div>
  </div>` : ''}

  <div class="sigs">
    <div>
      <div class="sig-lbl">Виконавець:</div>
      <div class="sig-line">підпис</div>
    </div>
    <div>
      <div class="sig-lbl">Замовник:</div>
      <div class="sig-line">підпис</div>
    </div>
  </div>
</div>
</body>
</html>`
}

function esc(s) {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
