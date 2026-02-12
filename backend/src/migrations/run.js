/**
 * Скрипт запуска миграций базы данных
 * @module migrations/run
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getClient } from '../config/database.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Создание таблицы миграций
 */
const createMigrationsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    )
  `);
  logger.info('Таблица миграций проверена');
};

/**
 * Получение списка выполненных миграций
 */
const getExecutedMigrations = async () => {
  const result = await query('SELECT filename FROM migrations ORDER BY id');
  return new Set(result.rows.map(row => row.filename));
};

/**
 * Вычисление checksum файла
 */
const calculateChecksum = async (filepath) => {
  const crypto = await import('crypto');
  const content = await fs.readFile(filepath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Выполнение одной миграции
 */
const executeMigration = async (filename, filepath) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Чтение SQL файла
    const sql = await fs.readFile(filepath, 'utf-8');
    
    // Выполнение миграции
    logger.info(`Выполнение миграции: ${filename}`);
    await client.query(sql);
    
    // Запись в таблицу миграций
    const checksum = await calculateChecksum(filepath);
    await client.query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );
    
    await client.query('COMMIT');
    logger.info(`Миграция ${filename} выполнена успешно`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Ошибка выполнения миграции ${filename}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Запуск всех миграций
 */
export const runMigrations = async () => {
  try {
    logger.info('Начало выполнения миграций...');
    
    // Создание таблицы миграций
    await createMigrationsTable();
    
    // Получение выполненных миграций
    const executed = await getExecutedMigrations();
    
    // Чтение директории миграций
    const files = await fs.readdir(__dirname);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    logger.info(`Найдено ${sqlFiles.length} миграций`);
    
    // Выполнение новых миграций
    for (const filename of sqlFiles) {
      if (executed.has(filename)) {
        logger.debug(`Миграция ${filename} уже выполнена, пропуск`);
        continue;
      }
      
      const filepath = path.join(__dirname, filename);
      await executeMigration(filename, filepath);
    }
    
    logger.info('Все миграции выполнены успешно');
    
  } catch (error) {
    logger.error('Ошибка при выполнении миграций:', error);
    throw error;
  }
};

/**
 * Откат последней миграции
 */
export const rollbackMigration = async () => {
  const client = await getClient();
  
  try {
    const result = await query(
      'SELECT filename FROM migrations ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      logger.info('Нет миграций для отката');
      return;
    }
    
    const filename = result.rows[0].filename;
    logger.warn(`Откат миграции: ${filename}`);
    
    // Примечание: для полноценного отката нужны down-миграции
    // В данной реализации просто удаляем запись
    await client.query('BEGIN');
    await client.query('DELETE FROM migrations WHERE filename = $1', [filename]);
    await client.query('COMMIT');
    
    logger.info(`Миграция ${filename} отмечена как не выполненная`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Ошибка отката миграции:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Запуск при прямом вызове скрипта
if (process.argv[1] === __filename) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

export default runMigrations;
