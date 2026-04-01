import crypto from 'crypto'
import { ScraperScrapingResult, createScraper } from 'israeli-bank-scrapers'
import Transaction from './transaction'
import logger from './logger'

export async function scrape(account: any, from: Date): Promise<ScraperScrapingResult> {
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

export function convertResultToTransactions(result: ScraperScrapingResult) {
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
