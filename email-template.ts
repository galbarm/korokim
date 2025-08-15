import fs from 'fs'

interface TransactionEmailData {
  account: string
  date: string
  description: string
  originalAmount: string
  chargedAmount: string
  status: string
  memo: string
}

export function generateTransactionEmailHtml(data: TransactionEmailData): string {
  let template = fs.readFileSync('transaction-email.html', 'utf8')
  
  Object.entries(data).forEach(([key, value]) => {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value)
  })
  
  return template
}