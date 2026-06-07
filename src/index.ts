import Transaction from './transaction'
import config from 'config'
import logger from './logger'
import { connectDB, disconnectDB } from './db'
import { sendMails } from './mailer'
import { scrape, convertResultToTransactions } from './scraper'
import { ping } from './healthcheck'
import { setTimeout as sleep } from 'node:timers/promises'

const accounts: any[] = config.get('accounts')
const toIgnore: string[] = config.get('toIgnore')
const discovered = new Set<string>()


async function main() {
  await connectDB()
  await fillDiscovered(startTimeMinusWeek())
  logger.info(`filled discovered with ${discovered.size} transactions`)

  if (process.env.CI) {
    await updateLoop()
    await disconnectDB()
    process.exit(0)
  } else {
    while (true) {
      await updateLoop()
      const interval = <number>config.get('updateIntervalMin')
      logger.info(`going to sleep for ${interval} mins`)
      await sleep(1000 * 60 * interval)
    }
  }
}

main()

async function updateLoop() {
  try {
    const succeeded: any[] = []

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
        
        succeeded.push(account)
      }
      catch (e) {
        logger.warning(`updating account ${account.company} failed: ${e}`)
      }
    }

    await sendMails()

    for (const account of succeeded) {
      if (account.pingUrl) ping(account.pingUrl)
    }
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