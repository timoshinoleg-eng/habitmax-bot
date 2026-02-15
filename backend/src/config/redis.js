/**
 * Конфигурация подключения к Redis
 * Используется для BullMQ очередей и кэширования
 * @module config/redis
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

/**
 * Парсинг REDIS_URL (Upstash/Render format)
 * Поддерживает: redis:// и rediss:// (TLS)
 * @param {string} url - Redis connection URL
 * @returns {Object} Параметры подключения
 */
const parseRedisUrl = (url) => {
  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === 'rediss:';
    
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || (isTls ? 6380 : 6379),
      password: parsed.password || undefined,
      tls: isTls ? {} : undefined,
    };
  } catch (error) {
    logger.error('Ошибка парсинга REDIS_URL:', error.message);
    return null;
  }
};

/**
 * Получение конфигурации Redis
 */
const getRedisConfig = (db = 0) => {
  const baseConfig = {
    db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Повторное подключение к Redis через ${delay}ms (попытка ${times})`);
      return delay;
    },
    maxRetriesPerRequest: db === 0 ? 3 : null, // BullMQ требует null
  };

  // Приоритет: REDIS_URL (Upstash/Render) > отдельные переменные
  if (process.env.REDIS_URL) {
    const parsed = parseRedisUrl(process.env.REDIS_URL);
    if (parsed) {
      logger.info(`Используется REDIS_URL для подключения (DB ${db})`);
      return { ...baseConfig, ...parsed };
    }
  }

  // Fallback на отдельные переменные
  return {
    ...baseConfig,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
};

/**
 * Создание экземпляра Redis клиента
 */
export const redisClient = new Redis(getRedisConfig(0));

/**
 * Создание экземпляра Redis для BullMQ (требуется отдельное соединение)
 */
export const bullRedis = new Redis(getRedisConfig(1));

/**
 * Создание экземпляра Redis для подписчика BullMQ
 */
export const bullSubscriber = new Redis(getRedisConfig(1));

// Обработка событий Redis
redisClient.on('connect', () => {
  logger.info('Redis клиент подключен');
});

redisClient.on('ready', () => {
  logger.info('Redis готов к работе');
});

redisClient.on('error', (err) => {
  logger.error('Ошибка Redis:', err.message);
});

redisClient.on('reconnecting', () => {
  logger.warn('Переподключение к Redis...');
});

/**
 * Проверка подключения к Redis
 */
export const checkRedisConnection = async () => {
  try {
    const result = await redisClient.ping();
    logger.info('Подключение к Redis проверено', { ping: result });
    return true;
  } catch (error) {
    logger.error('Ошибка подключения к Redis:', error.message);
    return false;
  }
};

/**
 * Закрытие всех Redis соединений
 */
export const closeRedisConnections = async () => {
  await redisClient.quit();
  await bullRedis.quit();
  await bullSubscriber.quit();
  logger.info('Все Redis соединения закрыты');
};

/**
 * Кэширование данных с TTL
 * @param {string} key - Ключ кэша
 * @param {Object} data - Данные для кэширования
 * @param {number} ttl - Время жизни в секундах (по умолчанию 300)
 */
export const setCache = async (key, data, ttl = 300) => {
  try {
    await redisClient.setex(key, ttl, JSON.stringify(data));
    logger.debug('Данные закэшированы', { key, ttl });
  } catch (error) {
    logger.error('Ошибка кэширования:', error.message);
  }
};

/**
 * Получение данных из кэша
 * @param {string} key - Ключ кэша
 * @returns {Object|null} Кэшированные данные или null
 */
export const getCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Ошибка получения из кэша:', error.message);
    return null;
  }
};

/**
 * Удаление данных из кэша
 * @param {string} key - Ключ кэша
 */
export const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
    logger.debug('Кэш удален', { key });
  } catch (error) {
    logger.error('Ошибка удаления кэша:', error.message);
  }
};

export default redisClient;
