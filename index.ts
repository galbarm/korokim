import crypto from 'crypto'
import mongoose from 'mongoose'
import Transaction from './transaction'
import config from 'config'
import { ScraperScrapingResult, createScraper } from 'israeli-bank-scrapers'
import sgMail from '@sendgrid/mail'
import winston from 'winston'
import moment from 'moment-timezone'

sgMail.setApiKey(config.get('sendGrid.apiKey'))

const accounts: any[] = config.get('accounts')
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
        const scrapingResult = await fetch(account, startTime())

        const transactions = convertResultToTransactions(scrapingResult)
        const newTransactions = transactions.filter(txn => !discovered.includes(txn._id))

        if (newTransactions.length > 0) {
          logger.notice(`New transactions: ${newTransactions}`)
        }

        for await (const transaction of newTransactions) {
          await transaction.save()
          discovered.push(transaction._id)
        }
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

  // const interval = <number>config.get('updateIntervalMin')
  // logger.info(`going to sleep for ${interval} mins`)
  // setTimeout(updateLoop, 1000 * 60 * interval)

  logger.info(`exiting`)
  process.exit()
}


async function fillDiscovered(from: Date) {
  const docs = await Transaction.find({ date: { $gte: from } }, "_id")
  docs.forEach(doc => discovered.push(doc._id))
}


async function fetch(account: any, from: Date): Promise<ScraperScrapingResult> {
  const options = {
    companyId: account.company,
    startDate: from,
    combineInstallments: false,
    showBrowser: false,
    timeout: 120000,
    defaultTimeout: 120000
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
    const templateData = {
      account: `${config.get(`friendlyNames.${t.account}`) || t.account}`,
      date: moment(t.date).tz('Asia/Jerusalem').format('HH:mm - DD/MM/YYYY'),
      description: `${t.description}`,
      originalAmount: `${t.originalCurrency}${(-t.originalAmount).toFixed(2)}`,
      chargedAmount: `${t.chargedCurrency}${(-t.chargedAmount).toFixed(2)}`,
      status: t.status == "pending" ? "בתהליך אישור" : "סופי",
      memo: `${t.memo}`
    }

    const msg = {
      from: {
        email: <string>config.get('sendGrid.from.email'),
        name: <string>config.get('sendGrid.from.name')
      },
      to: <string[]>config.get('sendGrid.targets'),
      templateId: <string>config.get('sendGrid.templateId'),
      dynamicTemplateData: templateData
    }

    const result = await sgMail.send(msg)
    logger.info(`email for transaction id ${t._id} sent. sendgrid send result: ${result}`)

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