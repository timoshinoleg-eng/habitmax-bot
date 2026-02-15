/**
 * Конфигурация подключения к PostgreSQL
 * @module config/database
 */

import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

/**
 * Парсинг DATABASE_URL (Render format)
 * @param {string} url - PostgreSQL connection URL
 * @returns {Object} Параметры подключения
 */
const parseDatabaseUrl = (url) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      database: parsed.pathname.slice(1), // убираем ведущий /
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    logger.error('Ошибка парсинга DATABASE_URL:', error.message);
    return null;
  }
};

/**
 * Получение конфигурации БД
 */
const getDbConfig = () => {
  // Приоритет: DATABASE_URL (Render) > отдельные переменные
  if (process.env.DATABASE_URL) {
    const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
    if (parsed) {
      logger.info('Используется DATABASE_URL для подключения к PostgreSQL');
      return parsed;
    }
  }

  // Fallback на отдельные переменные
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'habitmax',
    user: process.env.DB_USER || 'habitmax',
    password: process.env.DB_PASSWORD || 'secure_password',
  };
};

const dbConfig = getDbConfig();

/**
 * Создание пула соединений с PostgreSQL
 */
const pool = new Pool({
  ...dbConfig,
  max: 20, // Максимальное количество соединений в пуле
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Для Render/SSL
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Обработка ошибок пула
pool.on('error', (err) => {
  logger.error('Неожиданная ошибка пула PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Выполнение SQL запроса с параметрами
 * @param {string} text - SQL запрос
 * @param {Array} params - Параметры запроса
 * @returns {Promise<Object>} Результат запроса
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('SQL запрос выполнен', { 
      query: text.substring(0, 100), 
      duration: `${duration}ms`,
      rows: result.rowCount 
    });
    return result;
  } catch (error) {
    logger.error('Ошибка SQL запроса:', { 
      query: text.substring(0, 100), 
      error: error.message 
    });
    throw error;
  }
};

/**
 * Получение клиента для транзакции
 * @returns {Promise<Object>} Клиент PostgreSQL
 */
export const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  
  // Переопределение query для логирования
  client.query = (...args) => {
    const start = Date.now();
    return originalQuery(...args).finally(() => {
      const duration = Date.now() - start;
      logger.debug('Транзакция SQL', { duration: `${duration}ms` });
    });
  };
  
  return client;
};

/**
 * Проверка подключения к БД
 */
export const checkConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    logger.info('Подключение к PostgreSQL установлено', { 
      time: result.rows[0].now 
    });
    return true;
  } catch (error) {
    logger.error('Ошибка подключения к PostgreSQL:', error.message);
    return false;
  }
};

/**
 * Закрытие пула соединений
 */
export const closePool = async () => {
  await pool.end();
  logger.info('Пул PostgreSQL закрыт');
};

export default pool;
