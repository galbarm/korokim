import crypto from 'crypto'
import Debug from 'debug'
import mongoose from 'mongoose'
import Transaction from './transaction'
import config from 'config'
import {ScraperScrapingResult, createScraper} from 'israeli-bank-scrapers'
import sgMail from '@sendgrid/mail'

const debug = Debug('korokim')
sgMail.setApiKey(config.get('sendGridAPIKey'))

const accounts: any[] = config.get('accounts')
const discovered: string[] = [];


(async function () {
  debug("connecting to mongodb")
  await mongoose.connect(config.get('mongoUrl'))
  debug("connected to mongodb")

  await fillDiscovered()
  debug(`filled discovered with ${discovered.length} transactions`)

  updateLoop()
})()


async function updateLoop() {
  for await (const account of accounts) {
    try {
      const scrapingResult = await fetch(account)
      debug("fetched scraped transactions")
      debug(scrapingResult)

      const transactions = convertResultToTransactions(scrapingResult)
      const newTransactions = transactions.filter(txn => !discovered.includes(txn._id))

      debug(`New transactions: ${newTransactions}`)

      for await (const transaction of newTransactions) {
        await transaction.save()
        discovered.push(transaction._id)
      }
    }
    catch (e) {
      debug(`updating account failed: ${e}`)
    }
  }

  await sendMails()

  const interval = <number>config.get('updateIntervalMin')
  debug(`going to sleep for ${interval} mins`)
  setTimeout(updateLoop, 1000 * 60 * interval)
}


async function fillDiscovered() {
  const docs = await Transaction.find({}, "_id")
  docs.forEach(doc => discovered.push(doc._id))
}


async function fetch(account: any): Promise<ScraperScrapingResult> {
  var date = new Date()
  date.setDate(date.getDate() - <number>config.get('daysAgo'));

  const options = {
    companyId: account.company,
    startDate: date,
    combineInstallments: false,
    showBrowser: false,
    timeout: 60000,
    defaultTimeout: 60000
  }

  const credentials = {
    username: account.username,
    password: account.password,
    id: account.id,
    card6Digits: account.card6Digits,
    num: account.num,
    userCode: account.userCode
  }

  debug(`fetching company ${options.companyId}...`)
  
  const scraper = createScraper(options)
  const result = await scraper.scrape(credentials)

  if (result.success) {
    return result
  } else {
    debug(result)
    throw new Error(result.errorType)
  }
}


function convertResultToTransactions(result: ScraperScrapingResult) {
  return result.accounts?.flatMap(account => account.txns.flatMap(txn => {
    return new Transaction({
      _id: crypto.createHash('md5').update(`${txn.identifier}-${txn.date}-${txn.originalAmount}-${txn.description}-${txn.memo}`).digest('hex'),
      account: account.accountNumber,
      id: txn.identifier,
      status: txn.status,
      date: txn.date,
      amount: txn.originalAmount,
      description: txn.description,
      memo: txn.memo,
      sentMail: false
    })
  })) || []
}

async function sendMails() {
  const toSend = await Transaction.find({ sentMail: false })
  for await (const t of toSend) {

    const account = config.get(`friendlyNames.${t.account}`) || t.account
    const status = t.status == "pending" ? "בתהליך אישור" : "סופי"
    const date = t.date.toLocaleString('he-IL', { year: '2-digit', month: '2-digit', day: '2-digit', hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })



    const msg = {
      to: <string[]>config.get('targets'),
      from: <string>config.get('sender'),
      subject: `חיוב חדש - ${t.description} - ₪${-t.amount}`,
      text:
        `חשבון: ${account}
תאריך: ${date}
שם העסק: ${t.description}
סכום: ₪${-t.amount}
הערה: ${t.memo}
סטטוס: ${status}`
    }

    const result = await sgMail.send(msg)
    debug(`email sent. sendgrid send result: ${result}`)

    await t.updateOne({ sentMail: true })
  }
}