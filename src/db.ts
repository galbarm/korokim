import mongoose from 'mongoose'
import config from 'config'
import logger from './logger'

const reconnectTimeout = 5000
const db = mongoose.connection

db.on('connecting', () => {
  logger.info('Connecting to MongoDB...')
})

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
  logger.error('MongoDB disconnected!')
});

export async function connectDB() {
  while (true) {
    try {
      await mongoose.connect(config.get('mongoUrl'))
      return
    } catch (e: any) {
      logger.error(`MongoDB connect failed: ${e.stack ?? e}`)
      logger.info(`Reconnecting in ${reconnectTimeout / 1000}s...`)
      await new Promise(resolve => setTimeout(resolve, reconnectTimeout))
    }
  }
}
