// src/renderer/modules/contracts/contract-pdf.js
// Генерація PDF договору

export async function generateContractPDF(contract, profile) {
  const { jsPDF } = window.jspdf

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Шрифт (jsPDF підтримує кирилицю через Arial)
  doc.setFont('helvetica')
  
  let y = 20 // Поточна позиція по вертикалі

  // Заголовок
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ДОГОВІР', 105, y, { align: 'center' })
  y += 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`№ ${contract.number}`, 105, y, { align: 'center' })
  y += 15

  // Дата
  doc.setFontSize(10)
  const dateStr = formatDate(contract.date)
  doc.text(`м. ${profile.city || '_________'}, ${dateStr}`, 20, y)
  y += 15

  // Сторони договору
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Сторони договору:', 20, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  
  // Виконавець
  doc.text(`ВИКОНАВЕЦЬ: ${profile.businessName || profile.name}`, 20, y)
  y += 6
  if (profile.phone) {
    doc.text(`Телефон: ${profile.phone}`, 20, y)
    y += 6
  }
  if (profile.email) {
    doc.text(`Email: ${profile.email}`, 20, y)
    y += 6
  }
  y += 4

  // Замовник
  doc.text(`ЗАМОВНИК: ${contract.client}`, 20, y)
  y += 12

  // Предмет договору
  doc.setFont('helvetica', 'bold')
  doc.text('1. ПРЕДМЕТ ДОГОВОРУ', 20, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  const subjectLines = doc.splitTextToSize(contract.subject, 170)
  doc.text(subjectLines, 20, y)
  y += subjectLines.length * 5 + 10

  // Вартість
  if (contract.amount) {
    doc.setFont('helvetica', 'bold')
    doc.text('2. ВАРТІСТЬ ПОСЛУГ', 20, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.text(`Загальна вартість послуг становить: ${formatMoney(contract.amount)} грн`, 20, y)
    y += 6
    doc.text(`(${numberToWords(contract.amount)} гривень)`, 20, y)
    y += 12
  }

  // Термін дії
  if (contract.startDate && contract.endDate) {
    const section = contract.amount ? '3' : '2'
    doc.setFont('helvetica', 'bold')
    doc.text(`${section}. ТЕРМІН ДІЇ ДОГОВОРУ`, 20, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.text(`Договір діє з ${formatDate(contract.startDate)} по ${formatDate(contract.endDate)}`, 20, y)
    y += 12
  }

  // Примітки
  if (contract.notes) {
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text('ДОДАТКОВІ УМОВИ:', 20, y)
    y += 8

    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(contract.notes, 170)
    doc.text(notesLines, 20, y)
    y += notesLines.length * 5 + 10
  }

  // Підписи (в кінці сторінки)
  const signY = 260
  doc.setFont('helvetica', 'bold')
  doc.text('ВИКОНАВЕЦЬ:', 20, signY)
  doc.text('ЗАМОВНИК:', 110, signY)

  doc.setFont('helvetica', 'normal')
  doc.text('_________________', 20, signY + 10)
  doc.text('_________________', 110, signY + 10)

  // Зберігаємо PDF
  const filename = `Dogovir_${contract.number}_${contract.client}.pdf`
  doc.save(filename)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatMoney(amount) {
  return amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numberToWords(num) {
  // Спрощена версія - просто округлюємо
  return Math.round(num).toString()
}