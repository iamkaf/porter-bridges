/**
 * Winston-based logger with console and file transports
 * Maintains compatibility with existing code that passes objects
 */

import path from 'node:path';
import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: 'debug',
  defaultMeta: {
    project: 'linkie',
    source: 'porter-bridges'
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport with colorized output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Daily rotating file transport
    new winston.transports.File({
      filename: path.join('./logs', 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // Error-only file transport
    new winston.transports.File({
      filename: path.join('./logs', 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    new winston.transports.Http({
      host: 'localhost',
      port: 3000,
      path: '/api/ingest',
      ssl: false,
      batch: true,
      batchInterval: 5000,
    }),
  ],
});

// Wrapper to maintain compatibility with existing code
const logger = {
  info(message: string | object, metadata?: string | object) {
    if (typeof message === 'object' && typeof metadata === 'string') {
      // Pattern: logger.info(object, string) -> winston.info(string, object)
      winstonLogger.info(metadata, message);
    } else if (typeof message === 'object') {
      winstonLogger.info('Object data', message);
    } else {
      winstonLogger.info(message, metadata);
    }
  },

  warn(message: string | object, metadata?: string | object) {
    if (typeof message === 'object' && typeof metadata === 'string') {
      winstonLogger.warn(metadata, message);
    } else if (typeof message === 'object') {
      winstonLogger.warn('Object data', message);
    } else {
      winstonLogger.warn(message, metadata);
    }
  },

  error(message: string | object, metadata?: string | object) {
    if (typeof message === 'object' && typeof metadata === 'string') {
      winstonLogger.error(metadata, message);
    } else if (typeof message === 'object') {
      winstonLogger.error('Object data', message);
    } else {
      winstonLogger.error(message, metadata);
    }
  },

  debug(message: string | object, metadata?: string | object) {
    if (typeof message === 'object' && typeof metadata === 'string') {
      winstonLogger.debug(metadata, message);
    } else if (typeof message === 'object') {
      winstonLogger.debug('Object data', message);
    } else {
      winstonLogger.debug(message, metadata);
    }
  },
};

export { logger };
export default logger;
