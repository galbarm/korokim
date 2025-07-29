//process.env.DEBUG = 'israeli-bank-scrapers:*';

import puppeteer, { BrowserContext } from 'puppeteer';
import crypto from 'crypto'
import mongoose from 'mongoose'
import Transaction from './transaction'
import config from 'config'
import { ScraperScrapingResult, createScraper } from 'israeli-bank-scrapers'
import nodemailer from 'nodemailer'
import winston from 'winston'
import moment from 'moment-timezone'

const transporter = nodemailer.createTransport({
  service: config.get('nodemailer.service'),
  auth: {
    user: config.get('nodemailer.auth.user'),
    pass: config.get('nodemailer.auth.pass')
  }
});

const accounts: any[] = config.get('accounts')
const toIgnore: string[] = config.get('toIgnore')
const discovered: string[] = []

const logger = winston.createLogger({
  level: 'debug',
  levels: winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: () => moment().tz('Asia/Jerusalem').format('YYYY-MM-DD HH:mm:ss.SSS') }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
      (info) => `[${info.timestamp}] ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console,
    new winston.transports.File({ filename: 'log.log' })
  ],
});


(async function () {
  const reconnectTimeout = 5000
  const db = mongoose.connection

  db.on('connecting', () => {
    logger.info('Connecting to MongoDB...')
  })

  db.on('error', (error) => {
    logger.error(`MongoDB connection error: ${error}`)
    mongoose.disconnect()
  });

  db.on('connected', () => {
    logger.info('Connected to MongoDB!')
  })

  db.once('open', () => {
    logger.info('MongoDB connection opened!')
  })

  db.on('reconnected', () => {
    logger.info('MongoDB reconnected!')
  })

  db.on('disconnected', () => {
    logger.error(`MongoDB disconnected! Reconnecting in ${reconnectTimeout / 1000}s...`)
    setTimeout(() => connectDB(), reconnectTimeout)
  });

  await connectDB()
  await fillDiscovered(startTimeMinusWeek())
  logger.info(`filled discovered with ${discovered.length} transactions`)

  updateLoop()
})()

async function connectDB() {
  mongoose.connect(config.get('mongoUrl'))
    .catch(() => { })
}

async function updateLoop() {
  try {
    for await (const account of accounts) {
      try {
        const browser = await puppeteer.launch({
          headless: true
        })
        const browserContext = await browser.createBrowserContext()

        const scrapingResult = await fetch(account, startTime(), browserContext)

        const transactions = convertResultToTransactions(scrapingResult)
        const newTransactions = transactions
          .filter(txn => !discovered.includes(txn._id))
          .filter(txn => !toIgnore.includes(txn.description))

        if (newTransactions.length > 0) {
          logger.notice(`New transactions: ${newTransactions}`)
        }

        for await (const transaction of newTransactions) {
          await transaction.save()
          logger.info(`saved id ${transaction._id}`)
          discovered.push(transaction._id)
          logger.info(`pushed id ${transaction._id}`)
        }

        browser.close()
      }
      catch (e) {
        logger.warning(`updating account ${account} failed: ${e}`)
      }
    }

    await sendMails()
  }
  catch (e) {
    logger.warning(`updating failed: ${e}`)
  }

  const interval = <number>config.get('updateIntervalMin')
  logger.info(`going to sleep for ${interval} mins`)
  setTimeout(updateLoop, 1000 * 60 * interval)

  // logger.info(`exiting`)
  // process.exit()
}


async function fillDiscovered(from: Date) {
  const docs = await Transaction.find({ date: { $gte: from } }, "_id")
  docs.forEach(doc => discovered.push(doc._id))
}


async function fetch(account: any, from: Date, browser: BrowserContext): Promise<ScraperScrapingResult> {
  const options = {
    companyId: account.company,
    startDate: from,
    browser,
    combineInstallments: false,
    //showBrowser: false,
    timeout: 120000,
    defaultTimeout: 120000,
    skipCloseBrowser: true
  }

  const credentials = {
    username: account.username,
    password: account.password,
    id: account.id,
    card6Digits: account.card6Digits,
    num: account.num,
    userCode: account.userCode
  }

  logger.info(`fetching company ${options.companyId}...`)
  
  const scraper = createScraper(options)
  const result = await scraper.scrape(credentials)

  logger.debug(result)

  if (result.success) {
    return result
  } else {
    throw new Error(result.errorType)
  }
}


function convertResultToTransactions(result: ScraperScrapingResult) {
  return result.accounts?.flatMap(account => account.txns.flatMap(txn => {
    return new Transaction({
      _id: crypto.createHash('md5').update(`${txn.identifier}-${txn.date}-${txn.originalAmount}-${txn.description}-${txn.memo}-${txn.status}`).digest('hex'),
      account: account.accountNumber,
      id: txn.identifier,
      status: txn.status,
      date: txn.date,
      originalAmount: txn.originalAmount,
      originalCurrency: txn.originalCurrency,
      chargedAmount: txn.chargedAmount,
      chargedCurrency: txn.chargedCurrency ?? "₪",
      description: txn.description,
      memo: txn.memo ?? "",
      sentMail: false
    })
  })) || []
}

async function sendMails() {
  const toSend = await Transaction.find({ sentMail: false })

  for await (const t of toSend) {
    const account = config.has(`friendlyNames.${t.account}`)
      ? `${config.get(`friendlyNames.${t.account}`)}`
      : `${t.account}`
    const date = moment(t.date).tz('Asia/Jerusalem').format('HH:mm - DD/MM/YYYY')
    const description = `${t.description}`
    const originalAmount = `${t.originalCurrency}${(-t.originalAmount).toFixed(2)}`
    const chargedAmount = `${t.chargedCurrency}${(-t.chargedAmount).toFixed(2)}`
    const status = t.status == "pending" ? "בתהליך אישור" : "סופי"
    const memo = `${t.memo}`

    const emailHtmlContent = `
<table style="border-collapse: collapse; max-width: 500px; width: 100%; font-family: Arial, sans-serif; background-color: #f9f9f9;">
  <colgroup>
    <col style="width: 75%;">
    <col style="width: 25%;">
  </colgroup>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${account}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">חשבון</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${date}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">תאריך</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${description}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">תיאור</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${originalAmount}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">סכום מקורי</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${chargedAmount}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">סכום לחיוב</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${status}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">סטטוס</th>
  </tr>
  <tr>
    <td style="border: 1px solid #dddddd; padding: 8px; text-align: right;">${memo}</td>
    <th style="border: 1px solid #dddddd; padding: 8px; text-align: right;">הערה</th>
  </tr>
</table>
    `

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

function startTime(): Date {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - <number>config.get('daysAgo'))
  return startDate
}

function startTimeMinusWeek(): Date {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (<number>config.get('daysAgo') + 7))
  return startDate
}