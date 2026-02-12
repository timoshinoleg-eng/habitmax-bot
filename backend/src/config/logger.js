/**
 * Конфигурация логирования Winston
 * @module config/logger
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Определение уровня логирования из окружения
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Кастомный формат для консоли в dev режиме
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Транспорт для файла с ротацией
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/habitmax-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(
    timestamp(),
    json()
  )
});

// Транспорт для ошибок
const errorFileTransport = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: combine(
    timestamp(),
    json()
  )
});

// Конфигурация логгера
const loggerConfig = {
  level: LOG_LEVEL,
  defaultMeta: {
    service: 'habitmax-bot',
    environment: NODE_ENV
  },
  transports: [
    fileRotateTransport,
    errorFileTransport
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
};

// Добавление консольного транспорта в dev режиме
if (NODE_ENV === 'development') {
  loggerConfig.transports.push(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      )
    })
  );
} else {
  // В production только JSON формат в консоль
  loggerConfig.transports.push(
    new winston.transports.Console({
      format: combine(
        timestamp(),
        json()
      )
    })
  );
}

// Создание логгера
export const logger = winston.createLogger(loggerConfig);

// Упрощенные методы для частых сценариев

/**
 * Логирование входящего вебхука
 * @param {Object} data - Данные вебхука
 */
export const logWebhook = (data) => {
  logger.debug('Вебхук получен', {
    type: data.type,
    userId: data.user?.id,
    timestamp: new Date().toISOString()
  });
};

/**
 * Логирование отправки сообщения
 * @param {number} userId - ID пользователя
 * @param {string} messageType - Тип сообщения
 * @param {boolean} success - Успешность отправки
 */
export const logMessageSent = (userId, messageType, success = true) => {
  const level = success ? 'debug' : 'warn';
  logger[level]('Отправка сообщения', {
    userId,
    messageType,
    success,
    timestamp: new Date().toISOString()
  });
};

/**
 * Логирование ошибки API
 * @param {string} apiName - Название API
 * @param {Error} error - Объект ошибки
 * @param {Object} context - Контекст ошибки
 */
export const logApiError = (apiName, error, context = {}) => {
  logger.error(`Ошибка API ${apiName}`, {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

/**
 * Логирование бизнес-события
 * @param {string} event - Тип события
 * @param {Object} data - Данные события
 */
export const logBusinessEvent = (event, data) => {
  logger.info('Бизнес-событие', {
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

export default logger;
