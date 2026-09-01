// Yeh industryPdf.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
import jsPDF from 'jspdf'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2

function cleanText(value) {
  return String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\*\*/g, '')
    .replace(/#+\s*/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

function safeName(value) {
  return cleanText(value || 'Datalytics_Report').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
}

function addBackground(doc) {
  doc.setFillColor(6, 11, 20)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  doc.setFillColor(9, 18, 32)
  doc.roundedRect(8, 8, PAGE_W - 16, PAGE_H - 16, 4, 4, 'F')

  doc.setDrawColor(34, 197, 94)
  doc.setLineWidth(0.25)
  doc.line(8, 20, PAGE_W - 8, 20)

  doc.setFillColor(34, 197, 94)
  doc.rect(8, 8, 58, 2.5, 'F')
  doc.setFillColor(249, 115, 22)
  doc.rect(66, 8, 34, 2.5, 'F')
}

function addFooter(doc, pageNo) {
  doc.setDrawColor(35, 48, 68)
  doc.line(MARGIN, 282, PAGE_W - MARGIN, 282)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(125, 143, 166)
  doc.text('Datalytics Intelligence Export', MARGIN, 288)
  doc.text(`Page ${pageNo}`, PAGE_W - MARGIN, 288, { align: 'right' })
}

function addPage(doc) {
  doc.addPage()
  addBackground(doc)
  addFooter(doc, doc.internal.getNumberOfPages())
  return 28
}

function writeWrapped(doc, text, x, y, maxWidth, options = {}) {
  const lineHeight = options.lineHeight || 5.3
  const size = options.size || 10
  const color = options.color || [226, 232, 240]
  const font = options.font || 'normal'
  const lines = doc.splitTextToSize(cleanText(text), maxWidth)

  doc.setFont('helvetica', font)
  doc.setFontSize(size)
  doc.setTextColor(...color)

  for (const line of lines) {
    if (y > 274) y = addPage(doc)
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

function addSection(doc, section, y) {
  if (y > 250) y = addPage(doc)

  const title = cleanText(section.title || 'Insight Section').toUpperCase()
  doc.setFillColor(13, 24, 39)
  doc.setDrawColor(39, 56, 79)
  doc.roundedRect(MARGIN, y - 6, CONTENT_W, 12, 2, 2, 'FD')
  doc.setFillColor(34, 197, 94)
  doc.roundedRect(MARGIN + 2, y - 3.5, 2, 7, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(248, 250, 252)
  doc.text(title, MARGIN + 8, y + 1)
  y += 12

  const body = Array.isArray(section.items)
    ? section.items.map((item, index) => `${index + 1}. ${cleanText(item)}`).join('\n')
    : cleanText(section.body || section.text || 'Not available.')

  y = writeWrapped(doc, body || 'Not available.', MARGIN + 4, y, CONTENT_W - 8, {
    size: 9.2,
    lineHeight: 5.2,
    color: [203, 213, 225],
  })

  return y + 8
}

export function saveIndustryPdf({
  title,
  subtitle,
  datasetName,
  metrics = [],
  sections = [],
  filePrefix = 'Datalytics_Report',
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  addBackground(doc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(34, 197, 94)
  doc.text('DATALYTICS', MARGIN, 25)

  doc.setTextColor(248, 250, 252)
  doc.setFontSize(24)
  doc.text(cleanText(title || 'Intelligence Report'), MARGIN, 44)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(148, 163, 184)
  doc.text(cleanText(subtitle || 'Executive analytics export'), MARGIN, 52)

  doc.setFontSize(8)
  doc.setTextColor(125, 143, 166)
  doc.text(`Dataset: ${cleanText(datasetName || 'Uploaded Dataset')}`, MARGIN, 62)
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 68)

  let y = 82
  const cardW = (CONTENT_W - 8) / 3
  metrics.slice(0, 6).forEach((metric, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = MARGIN + col * (cardW + 4)
    const cy = y + row * 22
    doc.setFillColor(11, 24, 38)
    doc.setDrawColor(34, 197, 94)
    doc.roundedRect(x, cy, cardW, 17, 2.5, 2.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(cleanText(metric.label).toUpperCase(), x + 4, cy + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(248, 250, 252)
    doc.text(cleanText(metric.value), x + 4, cy + 13)
  })

  y += metrics.length > 3 ? 52 : 30
  doc.setFillColor(249, 115, 22)
  doc.roundedRect(MARGIN, y, 34, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text('EXECUTIVE PDF', MARGIN + 4, y + 4.8)
  y += 18

  sections.forEach((section) => {
    y = addSection(doc, section, y)
  })

  addFooter(doc, 1)
  doc.save(`${safeName(filePrefix)}_${Date.now()}.pdf`)
}
