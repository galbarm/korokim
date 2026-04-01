import winston from 'winston'
import dayjs from './date'

const logger = winston.createLogger({
  level: 'debug',
  levels: winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: () => dayjs().tz('Asia/Jerusalem').format('YYYY-MM-DD HH:mm:ss.SSS') }),
    winston.format.printf(
      (info) => `[${info.timestamp}] ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console
  ],
});

export default logger