// src/renderer/modules/invoices/invoice-pdf.js

const PAY_LABELS = {
  card:   'Банківська картка',
  crypto: 'Криптовалюта',
  cash:   'Готівка',
}

export async function generateInvoicePDF(invoice, profile) {
  const { jsPDF } = window.jspdf

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica')

  const L = 20    // left margin
  const R = 190   // right margin
  const W = R - L // content width
  let y = 20

  // ── Header ────────────────────────────────────────────────
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('РАХУНОК', 105, y, { align: 'center' })
  y += 8

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`№ ${invoice.number}`, 105, y, { align: 'center' })
  y += 6

  const dateStr = formatDate(invoice.date)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`м. ${profile.city || '___________'}, ${dateStr}`, 105, y, { align: 'center' })
  doc.setTextColor(0)
  y += 12

  // ── Divider ───────────────────────────────────────────────
  doc.setDrawColor(200)
  doc.setLineWidth(0.4)
  doc.line(L, y, R, y)
  y += 10

  // ── Parties: two-column block ─────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(120)
  doc.text('ВИКОНАВЕЦЬ', L, y)
  doc.text('ЗАМОВНИК', 110, y)
  doc.setTextColor(0)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(profile.businessName || profile.name || '___________', L, y)
  doc.text(invoice.client, 110, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const execLines = []
  if (profile.phone) execLines.push(`Тел: ${profile.phone}`)
  if (profile.email) execLines.push(`Email: ${profile.email}`)
  if (profile.taxId) execLines.push(`ІПН: ${profile.taxId}`)

  execLines.forEach(line => {
    doc.text(line, L, y)
    y += 5.5
  })

  y += 6

  // ── Divider ───────────────────────────────────────────────
  doc.setDrawColor(200)
  doc.line(L, y, R, y)
  y += 10

  // ── Services description ──────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Послуги / опис робіт', L, y)
  y += 8

  // Table header
  doc.setFillColor(245, 245, 245)
  doc.roundedRect(L, y - 4, W, 8, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text('Опис', L + 2, y + 1)
  doc.text('Сума', R - 2, y + 1, { align: 'right' })
  doc.setTextColor(0)
  y += 10

  // Table row(s)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const descLines = doc.splitTextToSize(invoice.description, W - 30)
  const rowH = Math.max(descLines.length * 5.5 + 8, 14)

  doc.setDrawColor(220)
  doc.setLineWidth(0.3)
  doc.rect(L, y - 2, W, rowH)

  doc.text(descLines, L + 2, y + 3)
  doc.text(`₴${formatMoney(invoice.amount)}`, R - 2, y + 3, { align: 'right' })
  y += rowH + 4

  // ── Totals block ──────────────────────────────────────────
  const totalsX = 130
  const totalsW = R - totalsX

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80)
  doc.text('Всього без ПДВ:', totalsX, y)
  doc.setTextColor(0)
  doc.text(`₴${formatMoney(invoice.amount)}`, R, y, { align: 'right' })
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setFillColor(240, 248, 255)
  doc.roundedRect(totalsX - 2, y - 4, totalsW + 2, 10, 1, 1, 'F')
  doc.setTextColor(40, 100, 220)
  doc.text('До сплати:', totalsX, y + 2)
  doc.text(`₴${formatMoney(invoice.amount)}`, R, y + 2, { align: 'right' })
  doc.setTextColor(0)
  y += 16

  // ── Payment details ───────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Реквізити оплати', L, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const payLabel = PAY_LABELS[invoice.payMethod] || invoice.payMethod || '—'
  doc.text(`Спосіб оплати: ${payLabel}`, L, y)
  y += 6

  if (invoice.payMethod === 'crypto' && invoice.cryptoAddr) {
    doc.text(`Адреса: ${invoice.cryptoAddr}`, L, y)
    y += 6
  }

  if (profile.iban) {
    doc.text(`IBAN: ${profile.iban}`, L, y)
    y += 6
  }
  if (profile.bankName) {
    doc.text(`Банк: ${profile.bankName}`, L, y)
    y += 6
  }

  y += 6

  // ── Notes ─────────────────────────────────────────────────
  if (invoice.note) {
    doc.setDrawColor(200)
    doc.line(L, y, R, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Примітки:', L, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(invoice.note, W)
    doc.text(noteLines, L, y)
    y += noteLines.length * 5.5 + 8
  }

  // ── Signatures ────────────────────────────────────────────
  const signY = Math.max(y + 10, 245)
  doc.setDrawColor(200)
  doc.line(L, signY - 2, R, signY - 2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Виконавець:', L, signY + 6)
  doc.text('Замовник:', 110, signY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setDrawColor(80)
  doc.line(L, signY + 18, L + 55, signY + 18)
  doc.line(110, signY + 18, 110 + 55, signY + 18)
  doc.setFontSize(8)
  doc.setTextColor(140)
  doc.text('підпис', L + 27, signY + 22, { align: 'center' })
  doc.text('підпис', 110 + 27, signY + 22, { align: 'center' })

  // ── Status stamp (if paid) ────────────────────────────────
  if (invoice.status === 'paid') {
    doc.saveGraphicsState()
    doc.setGState(doc.GState({ opacity: 0.12 }))
    doc.setTextColor(34, 197, 94)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(48)
    doc.text('ОПЛАЧЕНО', 105, 148, { align: 'center', angle: 30 })
    doc.restoreGraphicsState()
    doc.setTextColor(0)
  }

  const filename = `Rakhunok_${invoice.number}_${invoice.client.replace(/\s+/g, '_')}.pdf`
  doc.save(filename)
}

function formatDate(dateStr) {
  if (!dateStr) return '__.__.____'
  const d = new Date(dateStr)
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatMoney(amount) {
  return Number(amount).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
