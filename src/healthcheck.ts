import https from 'node:https'
import logger from './logger'

export function ping(pingUrl: string, suffix = '') {
  const url = `${pingUrl}${suffix}`
  https.get(url, (_res) => {
    // success - no logging needed
  }).on('error', (e) => {
    logger.warning(`healthchecks ping failed: ${e.message}`)
  })
}
