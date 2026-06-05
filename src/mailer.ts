import config from 'config'
import nodemailer from 'nodemailer'
import dayjs from './date'
import logger from './logger'
import Transaction from './transaction'
import { generateTransactionEmailHtml } from './template'

const timezone = config.get<string>('timezone')

const currencySymbols: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
}

const RLM = '\u200F'    // Right-to-Left Mark
const NBSP = '\u00A0'   // Non-Breaking Space


function rtlSubject(...parts: string[]) {
  return `${RLM}${parts.join(`${NBSP}${NBSP}|${NBSP}${NBSP}${RLM}`)}`
}

function formatAmount(currency: string, amount: number): string {
  const symbol = currencySymbols[currency] ?? currency
  return `${symbol}${amount.toFixed(2)}`
}

const transporter = nodemailer.createTransport({
  service: config.get('nodemailer.service'),
  auth: {
    user: config.get('nodemailer.auth.user'),
    pass: config.get('nodemailer.auth.pass')
  }
});

export async function sendMails() {
  const toSend = await Transaction.find({ sentMail: false })

  for (const t of toSend) {
    const account = config.has(`friendlyNames.${t.account}`)
      ? `${config.get(`friendlyNames.${t.account}`)}`
      : `${t.account}`
    const date = dayjs(t.date).tz(timezone).format('HH:mm - DD/MM/YYYY')
    const shortDate = dayjs(t.date).tz(timezone).format('DD/MM HH:mm')
    const description = `${t.description}`
    const originalAmount = formatAmount(t.originalCurrency, -t.originalAmount)
    const chargedAmount = formatAmount(t.chargedCurrency, -t.chargedAmount)
    const status = t.status == "pending" ? "בתהליך אישור" : "סופי"
    const memo = `${t.memo}`

    const emailHtmlContent = generateTransactionEmailHtml({
      account,
      date,
      description,
      originalAmount,
      chargedAmount,
      status,
      memo
    })

    const mailOptions = {
      from: <string>config.get('nodemailer.from'),
      to: <string>config.get('nodemailer.to'),
      subject: rtlSubject(description, originalAmount, shortDate),
      html: emailHtmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email for transaction ID ${t._id} sent. Info: ${info.messageId}`);

    await t.updateOne({ sentMail: true })
  }
}
