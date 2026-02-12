/**
 * Клиент для работы с Max Platform API
 * Реализует rate limiting, retry-логику и обработку ошибок
 * @module services/maxApi
 */

import axios from 'axios';
import Bottleneck from 'bottleneck';
import { config } from '../config/index.js';
import { logger, logApiError } from '../config/logger.js';

/**
 * Rate limiter для соблюдения ограничений Max API (30 RPS)
 * Используем 28 RPS с буфером для безопасности
 */
const limiter = new Bottleneck({
  minTime: config.max.rateLimit.minTime, // ~28 RPS
  maxConcurrent: config.max.rateLimit.maxConcurrent,
});

/**
 * HTTP клиент для Max API
 */
const maxClient = axios.create({
  baseURL: config.max.apiUrl,
  timeout: 30000,
  headers: {
    'Authorization': config.max.token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Интерцептор для логирования запросов
maxClient.interceptors.request.use(
  (request) => {
    logger.debug('Max API Request', {
      method: request.method,
      url: request.url,
    });
    return request;
  },
  (error) => {
    logApiError('Max API Request', error);
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ответов
maxClient.interceptors.response.use(
  (response) => {
    logger.debug('Max API Response', {
      status: response.status,
      url: response.config.url,
    });
    return response;
  },
  (error) => {
    if (error.response) {
      logApiError('Max API Response', error, {
        status: error.response.status,
        data: error.response.data,
      });
    }
    return Promise.reject(error);
  }
);

/**
 * Задержка выполнения
 * @param {number} ms - Миллисекунды
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Отправка сообщения с retry-логикой
 * @param {number} userId - ID пользователя
 * @param {Object} message - Объект сообщения
 * @param {number} retries - Количество попыток
 * @returns {Promise<Object>} Результат отправки
 */
export const sendMessage = async (userId, message, retries = 3) => {
  return limiter.schedule(async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await maxClient.post('/messages', {
          user_id: userId,
          ...message,
        });
        
        logger.debug('Сообщение отправлено', { userId, attempt });
        return {
          success: true,
          messageId: response.data.message_id,
          data: response.data,
        };
        
      } catch (error) {
        const status = error.response?.status;
        
        // Обработка rate limit (429)
        if (status === 429) {
          const delay = 1000 * Math.pow(2, attempt);
          logger.warn(`Rate limit exceeded, retrying in ${delay}ms`, { userId, attempt });
          await sleep(delay);
          continue;
        }
        
        // Обработка других ошибок
        if (attempt === retries - 1) {
          logger.error('Не удалось отправить сообщение после всех попыток', {
            userId,
            error: error.message,
          });
          throw error;
        }
        
        // Экспоненциальная задержка для других ошибок
        await sleep(500 * Math.pow(2, attempt));
      }
    }
    
    throw new Error('Max retries exceeded');
  });
};

/**
 * Отправка текстового сообщения
 * @param {number} userId - ID пользователя
 * @param {string} text - Текст сообщения
 * @param {Object} options - Дополнительные опции
 */
export const sendTextMessage = async (userId, text, options = {}) => {
  const message = {
    type: 'text',
    text,
    parse_mode: options.parseMode || 'Markdown',
  };
  
  if (options.inlineKeyboard) {
    message.attachments = [{
      type: 'inline_keyboard',
      payload: {
        buttons: options.inlineKeyboard,
      },
    }];
  }
  
  if (options.replyMarkup) {
    message.reply_markup = options.replyMarkup;
  }
  
  return sendMessage(userId, message);
};

/**
 * Отправка сообщения с inline keyboard
 * @param {number} userId - ID пользователя
 * @param {string} text - Текст сообщения
 * @param {Array} buttons - Массив кнопок
 * @param {Object} options - Дополнительные опции
 */
export const sendMessageWithKeyboard = async (userId, text, buttons, options = {}) => {
  // Валидация payload кнопок (макс 128 символов)
  const validatedButtons = buttons.map(row => 
    row.map(button => {
      if (button.payload && button.payload.length > config.max.constraints.maxPayloadLength) {
        logger.warn('Payload кнопки превышает 128 символов, обрезаем', {
          original: button.payload,
          length: button.payload.length,
        });
        button.payload = button.payload.substring(0, config.max.constraints.maxPayloadLength);
      }
      return button;
    })
  );
  
  return sendTextMessage(userId, text, {
    ...options,
    inlineKeyboard: validatedButtons,
  });
};

/**
 * Редактирование сообщения
 * @param {number} userId - ID пользователя
 * @param {string} messageId - ID сообщения
 * @param {Object} newMessage - Новое содержимое
 */
export const editMessage = async (userId, messageId, newMessage) => {
  return limiter.schedule(async () => {
    try {
      const response = await maxClient.put(`/messages/${messageId}`, {
        user_id: userId,
        ...newMessage,
      });
      
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logApiError('editMessage', error, { userId, messageId });
      throw error;
    }
  });
};

/**
 * Удаление сообщения
 * @param {number} userId - ID пользователя
 * @param {string} messageId - ID сообщения
 */
export const deleteMessage = async (userId, messageId) => {
  return limiter.schedule(async () => {
    try {
      await maxClient.delete(`/messages/${messageId}`, {
        data: { user_id: userId },
      });
      
      return { success: true };
    } catch (error) {
      logApiError('deleteMessage', error, { userId, messageId });
      throw error;
    }
  });
};

/**
 * Установка webhook
 * @param {string} url - URL вебхука
 */
export const setWebhook = async (url) => {
  try {
    const response = await maxClient.post('/subscriptions', {
      url,
      events: ['message', 'callback_query'],
    });
    
    logger.info('Webhook установлен', { url });
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logApiError('setWebhook', error, { url });
    throw error;
  }
};

/**
 * Удаление webhook
 */
export const deleteWebhook = async () => {
  try {
    await maxClient.delete('/subscriptions');
    logger.info('Webhook удален');
    return { success: true };
  } catch (error) {
    logApiError('deleteWebhook', error);
    throw error;
  }
};

/**
 * Получение информации о боте
 */
export const getMe = async () => {
  try {
    const response = await maxClient.get('/me');
    return response.data;
  } catch (error) {
    logApiError('getMe', error);
    throw error;
  }
};

/**
 * Отправка действия "печатает..."
 * @param {number} userId - ID пользователя
 */
export const sendChatAction = async (userId) => {
  try {
    await maxClient.post('/chatActions', {
      user_id: userId,
      action: 'typing',
    });
  } catch (error) {
    // Не критичная ошибка, просто логируем
    logger.debug('Не удалось отправить chat action', { userId, error: error.message });
  }
};

/**
 * Проверка работоспособности API
 */
export const healthCheck = async () => {
  try {
    await getMe();
    return { status: 'ok', api: 'connected' };
  } catch (error) {
    return { 
      status: 'error', 
      api: 'disconnected',
      error: error.message 
    };
  }
};

/**
 * Форматирование inline keyboard для Max API
 * @param {Array} buttons - Массив кнопок
 * @returns {Array} Отформатированные кнопки
 */
export const formatInlineKeyboard = (buttons) => {
  // Ограничение на количество кнопок в ряду (макс 7)
  const maxPerRow = config.max.constraints.maxButtonsPerRow;
  
  return buttons.map(row => {
    // Если в ряду больше 7 кнопок, разбиваем
    if (row.length > maxPerRow) {
      const chunks = [];
      for (let i = 0; i < row.length; i += maxPerRow) {
        chunks.push(row.slice(i, i + maxPerRow));
      }
      return chunks;
    }
    return [row];
  }).flat();
};

/**
 * Создание callback payload с проверкой длины
 * @param {string} action - Действие
 * @param {Object} data - Данные
 * @returns {string} Сформированный payload
 */
export const createPayload = (action, data = {}) => {
  // Формат: action|param1|param2|...
  const parts = [action];
  
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      parts.push(String(value));
    }
  });
  
  const payload = parts.join('|');
  
  // Проверка длины
  if (payload.length > config.max.constraints.maxPayloadLength) {
    logger.warn('Payload превышает 128 символов', {
      payload,
      length: payload.length,
    });
    return payload.substring(0, config.max.constraints.maxPayloadLength);
  }
  
  return payload;
};

/**
 * Парсинг callback payload
 * @param {string} payload - Payload из callback
 * @returns {Object} Распарсенные данные
 */
export const parsePayload = (payload) => {
  const parts = payload.split('|');
  return {
    action: parts[0],
    params: parts.slice(1),
  };
};

export default {
  sendMessage,
  sendTextMessage,
  sendMessageWithKeyboard,
  editMessage,
  deleteMessage,
  setWebhook,
  deleteWebhook,
  getMe,
  sendChatAction,
  healthCheck,
  formatInlineKeyboard,
  createPayload,
  parsePayload,
};
