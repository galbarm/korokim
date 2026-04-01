import config from 'config'
import nodemailer from 'nodemailer'
import dayjs from './date'
import logger from './logger'
import Transaction from './transaction'
import { generateTransactionEmailHtml } from './template'

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
    const date = dayjs(t.date).tz('Asia/Jerusalem').format('HH:mm - DD/MM/YYYY')
    const description = `${t.description}`
    const originalAmount = `${t.originalCurrency}${(-t.originalAmount).toFixed(2)}`
    const chargedAmount = `${t.chargedCurrency}${(-t.chargedAmount).toFixed(2)}`
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
      subject: `${description} - ${originalAmount}`,
      html: emailHtmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email for transaction ID ${t._id} sent. Info: ${info.messageId}`);

    await t.updateOne({ sentMail: true })
  }
}
