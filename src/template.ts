import fs from 'fs'
import path from 'path'
import escapeHtml from 'escape-html'

interface TransactionEmailData {
  account: string
  date: string
  description: string
  originalAmount: string
  chargedAmount: string
  status: string
  memo: string
}

const templatePath = path.resolve(__dirname, '..', 'src', 'template.html')
const templateCache = fs.readFileSync(
  fs.existsSync(templatePath) ? templatePath : path.join(__dirname, 'template.html'),
  'utf8'
)

export function generateTransactionEmailHtml(data: TransactionEmailData): string {
  let template = templateCache
  
  Object.entries(data).forEach(([key, value]) => {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), escapeHtml(value))
  })
  
  return template
}