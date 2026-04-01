import Transaction from './transaction'
import config from 'config'
import logger from './logger'
import { connectDB } from './db'
import { sendMails } from './mailer'
import { scrape, convertResultToTransactions } from './scraper'
import { setTimeout as sleep } from 'node:timers/promises'

const accounts: any[] = config.get('accounts')
const toIgnore: string[] = config.get('toIgnore')
const discovered = new Set<string>()


async function main() {
  await connectDB()
  await fillDiscovered(startTimeMinusWeek())
  logger.info(`filled discovered with ${discovered.size} transactions`)

  while (true) {
    await updateLoop()
    const interval = <number>config.get('updateIntervalMin')
    logger.info(`going to sleep for ${interval} mins`)
    await sleep(1000 * 60 * interval)
  }
}

main()

async function updateLoop() {
  try {
    for (const account of accounts) {
      try {
        const scrapingResult = await scrape(account, startTime())

        const transactions = convertResultToTransactions(scrapingResult)
        const newTransactions = transactions
          .filter(txn => !discovered.has(txn._id))
          .filter(txn => !toIgnore.includes(txn.description))

        if (newTransactions.length > 0) {
          logger.notice(`New transactions: ${JSON.stringify(newTransactions, null, 2)}`)
        }

        for (const transaction of newTransactions) {
          await transaction.save()
          logger.info(`saved id ${transaction._id}`)
          discovered.add(transaction._id)
          logger.info(`pushed id ${transaction._id}`)
        }
      }
      catch (e) {
        logger.warning(`updating account ${account.company} failed: ${e}`)
      }
    }

    await sendMails()
  }
  catch (e) {
    logger.warning(`updating failed: ${e}`)
  }

}


async function fillDiscovered(from: Date) {
  const docs = await Transaction.find({ date: { $gte: from } }, "_id")
  docs.forEach(doc => discovered.add(doc._id))
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