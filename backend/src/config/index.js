/**
 * Центральная конфигурация приложения
 * @module config
 */

import dotenv from 'dotenv';
import { logger } from './logger.js';

// Загрузка переменных окружения
dotenv.config();

/**
 * Конфигурация приложения
 */
export const config = {
  // Основные настройки
  app: {
    name: 'HabitMax Bot',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000'),
    mode: process.env.BOT_MODE || 'webhook', // 'webhook' или 'polling'
  },

  // Max API конфигурация
  max: {
    apiUrl: process.env.MAX_API_URL || 'https://platform-api.max.ru',
    token: process.env.MAX_API_TOKEN || '',
    webhookUrl: process.env.WEBHOOK_URL || '',
    rateLimit: {
      minTime: 36, // ~28 RPS (с буфером)
      maxConcurrent: 5,
    },
    constraints: {
      maxPayloadLength: 128, // Максимальная длина callback payload
      maxButtonsPerRow: 7,
      maxTotalButtons: 210,
    }
  },

  // База данных (поддержка DATABASE_URL для Render)
  database: (() => {
    if (process.env.DATABASE_URL) {
      try {
        const parsed = new URL(process.env.DATABASE_URL);
        return {
          host: parsed.hostname,
          port: parseInt(parsed.port) || 5432,
          name: parsed.pathname.slice(1),
          user: parsed.username,
          password: parsed.password,
          url: process.env.DATABASE_URL,
        };
      } catch (e) {
        logger.warn('Не удалось распарсить DATABASE_URL, используем fallback');
      }
    }
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      name: process.env.DB_NAME || 'habitmax',
      user: process.env.DB_USER || 'habitmax',
      password: process.env.DB_PASSWORD || 'secure_password',
      url: null,
    };
  })(),

  // Redis (поддержка REDIS_URL для Upstash/Render)
  redis: (() => {
    if (process.env.REDIS_URL) {
      try {
        const parsed = new URL(process.env.REDIS_URL);
        return {
          host: parsed.hostname,
          port: parseInt(parsed.port) || (parsed.protocol === 'rediss:' ? 6380 : 6379),
          password: parsed.password || process.env.REDIS_PASSWORD || '',
          url: process.env.REDIS_URL,
          tls: parsed.protocol === 'rediss:',
        };
      } catch (e) {
        logger.warn('Не удалось распарсить REDIS_URL, используем fallback');
      }
    }
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '',
      url: null,
      tls: false,
    };
  })(),

  // MinIO (S3-совместимое хранилище)
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucketName: process.env.MINIO_BUCKET || 'habitmax-exports',
  },

  // JWT для мини-приложения
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: '7d',
    refreshExpiresIn: '30d',
  },

  // Настройки бизнес-логики
  business: {
    // Эскалация напоминаний (в минутах)
    escalation: {
      initial: 0,
      firstReminder: 15,
      secondReminder: 45,
      autoSkip: 60,
    },
    // Максимальное количество отсрочек
    maxPostpones: 2,
    // Период благодати (в минутах)
    gracePeriod: 120,
    // Генерация напоминаний на N дней вперед
    reminderDaysAhead: 30,
    // Тихие часы по умолчанию
    defaultQuietHours: {
      start: '23:00',
      end: '08:00',
    },
    // Часовой пояс по умолчанию
    defaultTimezone: 'Europe/Moscow',
  },

  // GDPR / 152-ФЗ
  privacy: {
    // Время хранения данных после удаления аккаунта (дней)
    dataRetentionDays: 30,
    // Email для запросов на удаление
    privacyEmail: 'privacy@habitmax.ru',
    // Ссылка на политику конфиденциальности
    privacyPolicyUrl: 'https://habitmax.ru/privacy',
  },

  // Логирование
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};

/**
 * Валидация обязательных переменных окружения
 */
export const validateConfig = () => {
  const required = [
    'MAX_API_TOKEN',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Отсутствуют обязательные переменные окружения:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Валидация токена Max API
  if (config.max.token.length < 10) {
    logger.warn('Токен Max API выглядит слишком коротким');
  }

  logger.info('Конфигурация валидирована успешно');
};

/**
 * Безопасное получение конфигурации (без чувствительных данных)
 */
export const getPublicConfig = () => ({
  app: {
    name: config.app.name,
    version: config.app.version,
  },
  business: {
    maxPostpones: config.business.maxPostpones,
    gracePeriod: config.business.gracePeriod,
  },
  privacy: {
    privacyPolicyUrl: config.privacy.privacyPolicyUrl,
  }
});

export default config;
