/**
 * HabitMax Bot - Backend Entry Point
 * Чат-бот для привычек и напоминаний о лекарствах для платформы Max
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { config, validateConfig } from './config/index.js';
import { logger } from './config/logger.js';
import { checkConnection } from './config/database.js';
import { checkRedisConnection } from './config/redis.js';
import { initQueues, closeQueues, getQueueStats } from './scheduler/reminderQueue.js';
import { runMigrations } from './migrations/run.js';

import webhookHandler from './bot/webhook.js';
import apiRoutes from './api/routes.js';

// Загрузка переменных окружения
dotenv.config();

// Создание приложения Express
const app = express();

// Доверять прокси (Render использует прокси)
app.set('trust proxy', 1);

// ============================================
// MIDDLEWARE
// ============================================

// Безопасность
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Сжатие
app.use(compression());

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    success: false,
    error: 'Слишком много запросов, попробуйте позже',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Строгий rate limit для вебхука
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 60, // 60 запросов в минуту (с запасом для Max API)
  message: {
    success: false,
    error: 'Rate limit exceeded',
  },
});

// ============================================
// ROUTES
// ============================================

// Health check (без rate limit)
app.get('/health', async (req, res) => {
  const dbStatus = await checkConnection();
  const redisStatus = await checkRedisConnection();
  const queueStats = await getQueueStats();
  
  const status = dbStatus && redisStatus ? 200 : 503;
  
  res.status(status).json({
    status: status === 200 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.app.version,
    services: {
      database: dbStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected',
    },
    queues: queueStats,
  });
});

// Webhook endpoint
app.post('/webhook', webhookLimiter, webhookHandler.handleWebhook);

// API routes
app.use('/api', apiRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Внутренняя ошибка сервера' 
      : err.message,
  });
});

// ============================================
// SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    // Валидация конфигурации
    validateConfig();
    
    // Проверка подключения к БД
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    
    // Проверка подключения к Redis
    const redisConnected = await checkRedisConnection();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }
    
    // Запуск миграций
    await runMigrations();
    
    // Инициализация очередей
    await initQueues();
    
    // Запуск сервера
    const port = config.app.port;
    app.listen(port, () => {
      logger.info(`🚀 HabitMax Bot сервер запущен на порту ${port}`);
      logger.info(`📊 Health check: http://localhost:${port}/health`);
      logger.info(`🔗 Webhook: http://localhost:${port}/webhook`);
      logger.info(`📡 API: http://localhost:${port}/api`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  logger.info(`Получен сигнал ${signal}, начинаем graceful shutdown...`);
  
  try {
    // Закрываем очереди
    await closeQueues();
    logger.info('Очереди закрыты');
    
    // Здесь можно добавить закрытие других соединений
    
    logger.info('Graceful shutdown завершен');
    process.exit(0);
    
  } catch (error) {
    logger.error('Ошибка при graceful shutdown:', error);
    process.exit(1);
  }
};

// Обработка сигналов
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  logger.error('Необработанное исключение:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Необработанный rejection:', { reason, promise });
});

// Запуск сервера
startServer();

export default app;
