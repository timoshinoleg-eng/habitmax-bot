/**
 * Jest Setup
 * @module tests/setup
 */

import { jest } from '@jest/globals';

// Мокаем логгер
jest.mock('../src/config/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logWebhook: jest.fn(),
  logMessageSent: jest.fn(),
  logApiError: jest.fn(),
  logBusinessEvent: jest.fn(),
}));

// Мокаем конфигурацию
jest.mock('../src/config/index.js', () => ({
  config: {
    app: {
      name: 'HabitMax Test',
      version: '1.0.0',
      environment: 'test',
      port: 3000,
    },
    max: {
      apiUrl: 'https://platform-api.max.ru',
      token: 'test-token',
      rateLimit: {
        minTime: 36,
        maxConcurrent: 5,
      },
      constraints: {
        maxPayloadLength: 128,
        maxButtonsPerRow: 7,
        maxTotalButtons: 210,
      },
    },
    business: {
      escalation: {
        initial: 0,
        firstReminder: 15,
        secondReminder: 45,
        autoSkip: 60,
      },
      maxPostpones: 2,
      gracePeriod: 120,
      reminderDaysAhead: 30,
      defaultQuietHours: {
        start: '23:00',
        end: '08:00',
      },
      defaultTimezone: 'Europe/Moscow',
    },
    jwt: {
      secret: 'test-secret-key',
      expiresIn: '7d',
      refreshExpiresIn: '30d',
    },
  },
  validateConfig: jest.fn(),
  getPublicConfig: jest.fn(),
}));

// Глобальные моки
global.console = {
  ...console,
  // Отключаем лишний вывод в тестах
  log: jest.fn(),
  debug: jest.fn(),
};

// Очистка после каждого теста
afterEach(() => {
  jest.clearAllMocks();
});
