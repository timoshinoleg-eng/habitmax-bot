/**
 * Очередь напоминаний на BullMQ
 * @module scheduler/reminderQueue
 */

import { Queue, Worker, Job } from 'bullmq';
import { bullRedis, bullSubscriber } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import * as db from '../services/databaseService.js';
import * as maxApi from '../services/maxApi.js';
import * as gamification from '../services/gamificationService.js';
import templates from '../templates/ru.json' assert { type: 'json' };

/**
 * Очередь напоминаний
 */
export const reminderQueue = new Queue('reminders', {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

/**
 * Очередь эскалации напоминаний
 */
export const escalationQueue = new Queue('escalation', {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
  },
});

/**
 * Очередь для фоновых задач (генерация напоминаний, экспорт)
 */
export const backgroundQueue = new Queue('background', {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});

/**
 * Добавление задачи отправки напоминания
 * @param {Object} reminder - Данные напоминания
 * @param {Date} scheduledTime - Запланированное время
 */
export const scheduleReminder = async (reminder, scheduledTime) => {
  const jobId = `reminder:${reminder.reminder_id}`;
  
  const job = await reminderQueue.add(
    'send-reminder',
    {
      reminderId: reminder.reminder_id,
      userId: reminder.user_id,
      routineId: reminder.routine_id,
      title: reminder.title,
      type: reminder.type,
      icon: reminder.icon,
      dosage: reminder.dosage,
      scheduledTime: reminder.scheduled_time,
    },
    {
      jobId,
      delay: Math.max(0, scheduledTime.getTime() - Date.now()),
      priority: reminder.type === 'medication' ? 10 : 5, // Лекарства выше приоритетом
    }
  );

  logger.debug('Напоминание запланировано', {
    jobId,
    reminderId: reminder.reminder_id,
    scheduledTime,
  });

  return job;
};

/**
 * Добавление задачи эскалации
 * @param {string} reminderId - ID напоминания
 * @param {number} level - Уровень эскалации (1, 2, 3)
 * @param {number} delayMinutes - Задержка в минутах
 */
export const scheduleEscalation = async (reminderId, level, delayMinutes) => {
  const jobId = `escalation:${reminderId}:${level}`;
  
  const job = await escalationQueue.add(
    'escalate-reminder',
    {
      reminderId,
      level,
    },
    {
      jobId,
      delay: delayMinutes * 60 * 1000,
    }
  );

  logger.debug('Эскалация запланирована', {
    jobId,
    reminderId,
    level,
    delayMinutes,
  });

  return job;
};

/**
 * Отмена запланированных задач для напоминания
 * @param {string} reminderId - ID напоминания
 */
export const cancelReminderJobs = async (reminderId) => {
  // Отменяем основное напоминание
  await reminderQueue.remove(`reminder:${reminderId}`);
  
  // Отменяем все эскалации
  for (let level = 1; level <= 3; level++) {
    await escalationQueue.remove(`escalation:${reminderId}:${level}`);
  }

  logger.debug('Задачи отменены', { reminderId });
};

/**
 * Worker для отправки напоминаний
 */
const reminderWorker = new Worker(
  'reminders',
  async (job) => {
    const { reminderId, userId, title, type, icon, dosage, scheduledTime } = job.data;

    logger.info('Отправка напоминания', { reminderId, userId, title });

    try {
      // Проверяем, не выполнено ли уже
      const reminder = await db.getReminderById(reminderId);
      if (!reminder || reminder.status !== 'pending') {
        logger.debug('Напоминание уже обработано', { reminderId, status: reminder?.status });
        return { skipped: true, reason: 'already_processed' };
      }

      // Проверяем тихие часы
      const user = await db.getUserById(userId);
      if (isQuietHours(user)) {
        logger.debug('Тихие часы, откладываем', { userId });
        // Перепланируем на конец тихих часов
        const nextTime = getEndOfQuietHours(user);
        await scheduleReminder(reminder, nextTime);
        return { postponed: true, reason: 'quiet_hours' };
      }

      // Формируем сообщение
      const template = templates.reminders[type]?.initial || templates.reminders.habit.initial;
      const context = getContextMessage(type, scheduledTime);
      
      const messageText = template.text
        .replace('{title}', title)
        .replace('{dosage}', dosage ? ` (${dosage})` : '')
        .replace('{context}', context);

      // Формируем кнопки
      const buttons = [
        [
          { 
            type: 'callback', 
            text: template.buttons.taken || template.buttons.done, 
            payload: maxApi.createPayload('ok', { r: reminderId })
          },
        ],
        [
          { 
            type: 'callback', 
            text: template.buttons.postpone_15, 
            payload: maxApi.createPayload('p15', { r: reminderId })
          },
          { 
            type: 'callback', 
            text: template.buttons.skip, 
            payload: maxApi.createPayload('skip', { r: reminderId })
          },
        ],
      ];

      // Отправляем сообщение
      await maxApi.sendMessageWithKeyboard(userId, messageText, buttons);

      // Обновляем статус
      await db.updateReminder(reminderId, {
        status: 'sent',
        sent_at: new Date(),
      });

      // Запланируем первую эскалацию
      await scheduleEscalation(reminderId, 1, config.business.escalation.firstReminder);

      return { sent: true };

    } catch (error) {
      logger.error('Ошибка отправки напоминания:', error);
      throw error; // Повторная попытка
    }
  },
  {
    connection: bullRedis,
    concurrency: 5,
  }
);

/**
 * Worker для эскалации напоминаний
 */
const escalationWorker = new Worker(
  'escalation',
  async (job) => {
    const { reminderId, level } = job.data;

    logger.info('Эскалация напоминания', { reminderId, level });

    try {
      // Получаем актуальное состояние
      const reminder = await db.getReminderById(reminderId);
      if (!reminder) {
        return { skipped: true, reason: 'not_found' };
      }

      // Если уже выполнено или пропущено - отменяем эскалацию
      if (reminder.status === 'completed' || reminder.status === 'skipped') {
        return { skipped: true, reason: `status_${reminder.status}` };
      }

      // Обновляем уровень эскалации
      await db.updateReminder(reminderId, { escalation_level: level });

      const template = templates.reminders[reminder.type];
      const escalationTemplate = template[`escalation_${level}`];

      if (!escalationTemplate) {
        // Автоматический пропуск на уровне 3
        if (level >= 3) {
          await handleAutoSkip(reminder);
          return { autoSkipped: true };
        }
        return { skipped: true, reason: 'no_template' };
      }

      // Формируем сообщение эскалации
      const messageText = escalationTemplate.text
        .replace('{title}', reminder.title)
        .replace('{dosage}', reminder.dosage ? ` (${reminder.dosage})` : '');

      // Кнопки для эскалации
      let buttons;
      if (level === 1) {
        buttons = [
          [
            { 
              type: 'callback', 
              text: escalationTemplate.buttons.taken, 
              payload: maxApi.createPayload('ok', { r: reminderId })
            },
          ],
          [
            { 
              type: 'callback', 
              text: escalationTemplate.buttons.remind_again, 
              payload: maxApi.createPayload('p15', { r: reminderId })
            },
          ],
        ];
      } else {
        buttons = [
          [
            { 
              type: 'callback', 
              text: escalationTemplate.buttons.taken, 
              payload: maxApi.createPayload('ok', { r: reminderId })
            },
            { 
              type: 'callback', 
              text: escalationTemplate.buttons.skip, 
              payload: maxApi.createPayload('skip', { r: reminderId })
            },
          ],
        ];
      }

      // Отправляем
      await maxApi.sendMessageWithKeyboard(reminder.user_id, messageText, buttons);

      // Запланируем следующую эскалацию
      const nextLevel = level + 1;
      const nextDelay = level === 1 
        ? config.business.escalation.secondReminder - config.business.escalation.firstReminder
        : config.business.escalation.autoSkip - config.business.escalation.secondReminder;

      if (nextLevel <= 3) {
        await scheduleEscalation(reminderId, nextLevel, nextDelay);
      }

      return { escalated: true, level };

    } catch (error) {
      logger.error('Ошибка эскалации:', error);
      throw error;
    }
  },
  {
    connection: bullRedis,
    concurrency: 3,
  }
);

/**
 * Worker для фоновых задач
 */
const backgroundWorker = new Worker(
  'background',
  async (job) => {
    const { type, data } = job.data;

    logger.info('Фоновая задача', { type, jobId: job.id });

    switch (type) {
      case 'generate-reminders':
        return await generateReminders(data.userId, data.routineId);
      
      case 'export-data':
        return await exportUserData(data.userId, data.format);
      
      case 'cleanup-old-data':
        return await cleanupOldData();
      
      default:
        logger.warn('Неизвестный тип фоновой задачи', { type });
        return { skipped: true };
    }
  },
  {
    connection: bullRedis,
    concurrency: 2,
  }
);

/**
 * Автоматический пропуск напоминания
 * @param {Object} reminder - Данные напоминания
 */
const handleAutoSkip = async (reminder) => {
  await db.updateReminder(reminder.reminder_id, {
    status: 'skipped',
  });

  await db.createEvent({
    reminder_id: reminder.reminder_id,
    user_id: reminder.user_id,
    routine_id: reminder.routine_id,
    event_type: 'auto_skipped',
    event_source: 'system',
  });

  // Уведомляем пользователя
  const template = templates.reminders[reminder.type]?.auto_skip;
  if (template) {
    const message = template.text.replace('{title}', reminder.title);
    await maxApi.sendTextMessage(reminder.user_id, message, { parseMode: 'Markdown' });
  }

  // Обновляем геймификацию
  await gamification.handleSkip(reminder.user_id);
};

/**
 * Проверка тихих часов
 * @param {Object} user - Данные пользователя
 */
const isQuietHours = (user) => {
  if (!user.quiet_hours_start || !user.quiet_hours_end) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  if (user.quiet_hours_start <= user.quiet_hours_end) {
    return currentTime >= user.quiet_hours_start && currentTime <= user.quiet_hours_end;
  } else {
    // Переход через полночь
    return currentTime >= user.quiet_hours_start || currentTime <= user.quiet_hours_end;
  }
};

/**
 * Получение времени окончания тихих часов
 * @param {Object} user - Данные пользователя
 */
const getEndOfQuietHours = (user) => {
  const now = new Date();
  const [hours, minutes] = user.quiet_hours_end.split(':');
  const endTime = new Date(now);
  endTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  if (endTime <= now) {
    endTime.setDate(endTime.getDate() + 1);
  }
  
  return endTime;
};

/**
 * Получение контекстного сообщения
 * @param {string} type - Тип рутины
 * @param {string} scheduledTime - Запланированное время
 */
const getContextMessage = (type, scheduledTime) => {
  const hour = parseInt(scheduledTime?.split(':')[0] || 0);
  
  if (type === 'medication') {
    if (hour >= 20) return 'До сна осталось немного времени 🌙';
    if (hour < 10) return 'Хорошего начала дня! ☀️';
    return 'Не забудьте принять! 💊';
  }
  
  if (type === 'habit') {
    if (hour < 10) return 'Отличное время для привычки! 🌅';
    return 'Пора выполнить привычку! 💪';
  }
  
  return '';
};

/**
 * Генерация напоминаний для рутины
 * @param {number} userId - ID пользователя
 * @param {string} routineId - ID рутины
 */
const generateReminders = async (userId, routineId) => {
  try {
    const routine = await db.getRoutineById(routineId);
    const schedules = await db.getRoutineSchedules(routineId);
    
    if (!routine || !schedules.length) {
      return { error: 'Routine or schedules not found' };
    }

    const daysAhead = config.business.reminderDaysAhead;
    const generated = [];

    for (const schedule of schedules) {
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay() || 7; // 1=Пн, 7=Вс

        // Определяем время и нужно ли создавать напоминание
        let time = null;
        let shouldCreate = false;

        switch (schedule.schedule_type) {
          case 'daily':
            time = schedule.time_weekdays;
            shouldCreate = true;
            break;
          
          case 'weekdays':
            if (dayOfWeek <= 5) {
              time = schedule.time_weekdays;
              shouldCreate = true;
            } else {
              time = schedule.time_weekends;
              shouldCreate = true;
            }
            break;
          
          case 'custom':
            const customDays = schedule.custom_days || [];
            if (customDays.includes(dayOfWeek)) {
              time = schedule.time_weekdays;
              shouldCreate = true;
            }
            break;
        }

        if (shouldCreate && time) {
          const reminder = await db.createReminder({
            routine_id: routineId,
            user_id: userId,
            scheduled_date: dateStr,
            scheduled_time: time,
          });

          if (reminder) {
            generated.push(reminder);
            
            // Запланируем отправку
            const scheduledDateTime = new Date(dateStr + 'T' + time);
            if (scheduledDateTime > new Date()) {
              await scheduleReminder(reminder, scheduledDateTime);
            }
          }
        }
      }
    }

    logger.info('Напоминания сгенерированы', {
      userId,
      routineId,
      count: generated.length,
    });

    return { generated: generated.length };

  } catch (error) {
    logger.error('Ошибка генерации напоминаний:', error);
    throw error;
  }
};

/**
 * Экспорт данных пользователя
 * @param {number} userId - ID пользователя
 * @param {string} format - Формат (json, csv)
 */
const exportUserData = async (userId, format) => {
  // TODO: Реализовать экспорт данных
  logger.info('Экспорт данных', { userId, format });
  return { exported: true };
};

/**
 * Очистка старых данных
 */
const cleanupOldData = async () => {
  // TODO: Реализовать очистку старых данных
  logger.info('Очистка старых данных');
  return { cleaned: true };
};

// Обработка событий workers

reminderWorker.on('completed', (job, result) => {
  logger.debug('Напоминание обработано', { jobId: job.id, result });
});

reminderWorker.on('failed', (job, err) => {
  logger.error('Ошибка обработки напоминания:', { jobId: job.id, error: err.message });
});

escalationWorker.on('completed', (job, result) => {
  logger.debug('Эскалация обработана', { jobId: job.id, result });
});

escalationWorker.on('failed', (job, err) => {
  logger.error('Ошибка эскалации:', { jobId: job.id, error: err.message });
});

backgroundWorker.on('completed', (job, result) => {
  logger.debug('Фоновая задача выполнена', { jobId: job.id, result });
});

backgroundWorker.on('failed', (job, err) => {
  logger.error('Ошибка фоновой задачи:', { jobId: job.id, error: err.message });
});

/**
 * Инициализация очередей
 */
export const initQueues = async () => {
  logger.info('Очереди инициализированы');
};

/**
 * Очистка очередей
 */
export const closeQueues = async () => {
  await reminderQueue.close();
  await escalationQueue.close();
  await backgroundQueue.close();
  await reminderWorker.close();
  await escalationWorker.close();
  await backgroundWorker.close();
  logger.info('Очереди закрыты');
};

/**
 * Получение статистики очередей
 */
export const getQueueStats = async () => {
  const [reminderCount, escalationCount, backgroundCount] = await Promise.all([
    reminderQueue.getJobCounts(),
    escalationQueue.getJobCounts(),
    backgroundQueue.getJobCounts(),
  ]);

  return {
    reminders: reminderCount,
    escalation: escalationCount,
    background: backgroundCount,
  };
};

export default {
  reminderQueue,
  escalationQueue,
  backgroundQueue,
  scheduleReminder,
  scheduleEscalation,
  cancelReminderJobs,
  initQueues,
  closeQueues,
  getQueueStats,
};
