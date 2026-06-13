import config from 'config'
import { setTimeout as sleep } from 'node:timers/promises'
import Transaction from './transaction'
import logger from './logger'
import { Account } from './types'
import { connectDB, disconnectDB } from './db'
import { sendMails } from './mailer'
import { scrape, convertResultToTransactions } from './scraper'
import { ping } from './healthcheck'

const accounts: Account[] = config.get('accounts')
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
      const interval = config.get('updateIntervalMin') as number
      logger.info(`going to sleep for ${interval} mins`)
      await sleep(1000 * 60 * interval)
    }
  }
}

main()

async function updateLoop() {
  try {
    const succeeded: Account[] = []

    for (const account of accounts.filter(a => !(process.env.CI && a.skipInGHA))) {
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
      } catch (e) {
        logger.warning(`updating account ${account.company} failed: ${e}`)
      }
    }

    await sendMails()

    for (const account of succeeded) {
      if (account.pingUrl) ping(account.pingUrl)
    }
  } catch (e) {
    logger.warning(`updating failed: ${e}`)
  }
}

async function fillDiscovered(from: Date) {
  const docs = await Transaction.find({ date: { $gte: from } }, "_id")
  docs.forEach(doc => discovered.add(doc._id))
}

function startTime(): Date {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (config.get('daysAgo') as number))
  return startDate
}

function startTimeMinusWeek(): Date {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (config.get('daysAgo') as number + 7))
  return startDate
}