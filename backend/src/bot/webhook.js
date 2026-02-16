/**
 * Обработчик вебхуков от Max Platform
 * @module bot/webhook
 */

import { logger, logWebhook } from '../config/logger.js';
import * as db from '../services/databaseService.js';
import * as maxApi from '../services/maxApi.js';
import * as gamification from '../services/gamificationService.js';
import templates from '../templates/ru.json' assert { type: 'json' };

/**
 * Состояния онбординга
 */
const ONBOARDING_STATES = {
  START: 'START',
  TIMEZONE: 'TIMEZONE',
  QUIET_HOURS: 'QUIET_HOURS',
  CONSENT: 'CONSENT',
  TYPE_SELECT: 'TYPE_SELECT',
  COMPLETE: 'COMPLETE',
};

/**
 * Состояния создания рутины
 */
const ROUTINE_CREATION_STATES = {
  IDLE: 'IDLE',
  SELECT_TYPE: 'SELECT_TYPE',
  SELECT_TEMPLATE: 'SELECT_TEMPLATE',
  ENTER_TITLE: 'ENTER_TITLE',
  SELECT_SCHEDULE: 'SELECT_SCHEDULE',
  SELECT_TIME: 'SELECT_TIME',
  CONFIRM: 'CONFIRM',
};

// Временное хранилище состояний (в production использовать Redis)
const userStates = new Map();
const routineCreationData = new Map();

/**
 * Основной обработчик вебхука
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const handleWebhook = async (req, res) => {
  try {
    const update = req.body;
    logWebhook(update);

    // Отвечаем сразу, чтобы не блокировать Max API
    res.status(200).json({ ok: true });

    // Обработка разных типов обновлений
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (error) {
    logger.error('Ошибка обработки вебхука:', error);
    // Не отправляем ошибку клиенту, чтобы не нарушать протокол
  }
};

/**
 * Обработка входящего сообщения
 * @param {Object} message - Объект сообщения
 */
const handleMessage = async (message) => {
  const { from, text, chat } = message;
  
  // Проверка структуры сообщения от Max API
  if (!from || !from.id) {
    logger.warn('Получено сообщение без информации о пользователе:', message);
    return;
  }
  
  const userId = from.id;

  // Получаем или создаем пользователя
  const user = await db.getOrCreateUser(from);

  // Обработка команд
  if (text?.startsWith('/')) {
    await handleCommand(userId, text, user);
    return;
  }

  // Если пользователь не завершил онбординг
  if (!user.onboarding_completed) {
    await handleOnboarding(userId, text, user);
    return;
  }

  // Обработка создания рутины
  const creationState = routineCreationData.get(userId);
  if (creationState && creationState.state !== ROUTINE_CREATION_STATES.IDLE) {
    await handleRoutineCreation(userId, text, user);
    return;
  }

  // Smart Detection (без ИИ) - распознавание простых фраз
  await handleSmartDetection(userId, text, user);
};

/**
 * Обработка команд
 * @param {number} userId - ID пользователя
 * @param {string} text - Текст команды
 * @param {Object} user - Объект пользователя
 */
const handleCommand = async (userId, text, user) => {
  const command = text.split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1);

  switch (command) {
    case '/start':
      if (args[0]?.startsWith('app_auth')) {
        await handleMiniAppAuth(userId, args[0]);
      } else {
        await handleStart(userId, user);
      }
      break;

    case '/help':
      await sendHelp(userId);
      break;

    case '/today':
      await sendTodayReminders(userId);
      break;

    case '/add':
      await startRoutineCreation(userId);
      break;

    case '/list':
      await sendRoutinesList(userId);
      break;

    case '/stats':
      await sendStats(userId);
      break;

    case '/settings':
      await sendSettings(userId);
      break;

    case '/done':
      await handleDoneCommand(userId, args);
      break;

    case '/export':
      await handleExportRequest(userId);
      break;

    case '/delete':
      await handleDeleteRequest(userId);
      break;

    default:
      await maxApi.sendTextMessage(
        userId,
        templates.errors.invalid_input,
        { parseMode: 'Markdown' }
      );
  }
};

/**
 * Обработка /start
 * @param {number} userId - ID пользователя
 * @param {Object} user - Объект пользователя
 */
const handleStart = async (userId, user) => {
  if (user.onboarding_completed) {
    // Существующий пользователь
    const msg = templates.commands.start.existing_user;
    await maxApi.sendTextMessage(userId, msg, { parseMode: 'Markdown' });
  } else {
    // Новый пользователь - начинаем онбординг
    userStates.set(userId, { state: ONBOARDING_STATES.START });
    
    const welcome = templates.onboarding.welcome;
    await maxApi.sendMessageWithKeyboard(
      userId,
      welcome.text,
      [[
        { type: 'callback', text: welcome.buttons.start, payload: 'onboarding_start' }
      ]]
    );
  }
};

/**
 * Обработка онбординга
 * @param {number} userId - ID пользователя
 * @param {string} text - Текст сообщения
 * @param {Object} user - Объект пользователя
 */
const handleOnboarding = async (userId, text, user) => {
  const state = userStates.get(userId)?.state || ONBOARDING_STATES.START;

  switch (state) {
    case ONBOARDING_STATES.START:
      // Ожидаем нажатие кнопки
      break;

    case ONBOARDING_STATES.TIMEZONE:
      // Обработка выбора часового пояса
      break;

    case ONBOARDING_STATES.COMPLETE:
      // Онбординг завершен
      break;

    default:
      // Неизвестное состояние
      logger.warn('Неизвестное состояние онбординга', { userId, state });
  }
};

/**
 * Обработка callback query (нажатия кнопок)
 * @param {Object} callbackQuery - Объект callback query
 */
const handleCallbackQuery = async (callbackQuery) => {
  const { from, data, message } = callbackQuery;
  const userId = from.id;

  // Парсим payload
  const { action, params } = maxApi.parsePayload(data);

  logger.debug('Callback query получен', { userId, action, params });

  // Обработка разных действий
  switch (action) {
    // Онбординг
    case 'onboarding_start':
      await handleOnboardingTimezone(userId);
      break;

    case 'timezone':
      await handleTimezoneSelect(userId, params[0]);
      break;

    case 'quiet_hours':
      await handleQuietHours(userId, params[0]);
      break;

    case 'consent':
      await handleConsent(userId, params[0]);
      break;

    case 'type_select':
      await handleTypeSelect(userId, params[0]);
      break;

    // Напоминания
    case 'ok':
      await handleReminderComplete(userId, params[0]);
      break;

    case 'p15':
      await handleReminderPostpone(userId, params[0], 15);
      break;

    case 'skip':
      await handleReminderSkip(userId, params[0]);
      break;

    // Создание рутины
    case 'add':
      await handleAddRoutineCallback(userId, params);
      break;

    case 'template':
      await handleTemplateSelect(userId, params[0]);
      break;

    case 'schedule':
      await handleScheduleSelect(userId, params[0]);
      break;

    case 'time':
      await handleTimeSelect(userId, params[0]);
      break;

    case 'confirm':
      await handleRoutineConfirm(userId, params[0]);
      break;

    // Навигация
    case 'menu':
      await sendMainMenu(userId);
      break;

    case 'today':
      await sendTodayReminders(userId);
      break;

    default:
      logger.warn('Неизвестное действие callback', { action, params });
  }
};

/**
 * Шаг онбординга: выбор часового пояса
 * @param {number} userId - ID пользователя
 */
const handleOnboardingTimezone = async (userId) => {
  userStates.set(userId, { state: ONBOARDING_STATES.TIMEZONE });

  const tz = templates.onboarding.timezone;
  await maxApi.sendMessageWithKeyboard(
    userId,
    tz.text,
    [
      [
        { type: 'callback', text: tz.buttons.msk, payload: 'timezone|Europe/Moscow' },
        { type: 'callback', text: tz.buttons.spb, payload: 'timezone|Europe/Moscow' },
      ],
      [
        { type: 'callback', text: tz.buttons.ekb, payload: 'timezone|Asia/Yekaterinburg' },
        { type: 'callback', text: tz.buttons.other, payload: 'timezone|other' },
      ],
    ]
  );
};

/**
 * Выбор часового пояса
 * @param {number} userId - ID пользователя
 * @param {string} timezone - Часовой пояс
 */
const handleTimezoneSelect = async (userId, timezone) => {
  if (timezone === 'other') {
    // TODO: Показать список всех часовых поясов
    timezone = 'Europe/Moscow';
  }

  await db.updateUser(userId, { timezone });
  userStates.set(userId, { state: ONBOARDING_STATES.QUIET_HOURS });

  const qh = templates.onboarding.quiet_hours;
  await maxApi.sendMessageWithKeyboard(
    userId,
    qh.text,
    [
      [
        { type: 'callback', text: qh.buttons.accept, payload: 'quiet_hours|accept' },
        { type: 'callback', text: qh.buttons.change, payload: 'quiet_hours|change' },
      ],
    ]
  );
};

/**
 * Обработка тихих часов
 * @param {number} userId - ID пользователя
 * @param {string} choice - Выбор пользователя
 */
const handleQuietHours = async (userId, choice) => {
  if (choice === 'change') {
    // TODO: Показать интерфейс изменения тихих часов
  }

  userStates.set(userId, { state: ONBOARDING_STATES.CONSENT });

  const consent = templates.onboarding.consent;
  await maxApi.sendMessageWithKeyboard(
    userId,
    consent.text,
    [
      [
        { type: 'callback', text: consent.buttons.agree, payload: 'consent|agree' },
      ],
    ]
  );
};

/**
 * Обработка согласия GDPR
 * @param {number} userId - ID пользователя
 * @param {string} choice - Выбор пользователя
 */
const handleConsent = async (userId, choice) => {
  if (choice !== 'agree') {
    await maxApi.sendTextMessage(
      userId,
      'Для использования бота необходимо дать согласие на обработку данных.',
      { parseMode: 'Markdown' }
    );
    return;
  }

  await db.updateUser(userId, {
    gdpr_consent: true,
    consent_date: new Date(),
  });

  userStates.set(userId, { state: ONBOARDING_STATES.TYPE_SELECT });

  const typeSelect = templates.onboarding.type_select;
  await maxApi.sendMessageWithKeyboard(
    userId,
    typeSelect.text,
    [
      [
        { type: 'callback', text: typeSelect.buttons.medication, payload: 'type_select|medication' },
        { type: 'callback', text: typeSelect.buttons.habits, payload: 'type_select|habits' },
      ],
      [
        { type: 'callback', text: typeSelect.buttons.tasks, payload: 'type_select|tasks' },
      ],
    ]
  );
};

/**
 * Выбор типа отслеживания
 * @param {number} userId - ID пользователя
 * @param {string} type - Тип
 */
const handleTypeSelect = async (userId, type) => {
  await db.updateUser(userId, {
    onboarding_completed: true,
    onboarding_state: ONBOARDING_STATES.COMPLETE,
  });

  userStates.delete(userId);

  const complete = templates.onboarding.complete;
  await maxApi.sendMessageWithKeyboard(
    userId,
    complete.text,
    [
      [
        { type: 'callback', text: complete.buttons.add_routine, payload: 'menu|add' },
        { type: 'callback', text: complete.buttons.open_app, payload: 'menu|app' },
      ],
    ]
  );

  // Создаем демо-напоминание через минуту
  // TODO: Реализовать через BullMQ
};

/**
 * Отправка списка напоминаний на сегодня
 * @param {number} userId - ID пользователя
 */
const sendTodayReminders = async (userId) => {
  const today = new Date().toISOString().split('T')[0];
  const reminders = await db.getRemindersByDate(userId, today);

  if (reminders.length === 0) {
    await maxApi.sendTextMessage(
      userId,
      templates.commands.today.empty,
      { parseMode: 'Markdown' }
    );
    return;
  }

  let message = templates.commands.today.header.replace('{date}', formatDate(today));
  
  let completed = 0;
  reminders.forEach(reminder => {
    const status = getStatusEmoji(reminder.status);
    const line = templates.commands.today[`item_${reminder.status}`]
      .replace('{icon}', reminder.icon)
      .replace('{title}', reminder.title)
      .replace('{time}', reminder.scheduled_time.substring(0, 5));
    
    message += line + '\n';
    if (reminder.status === 'completed') completed++;
  });

  const percent = Math.round((completed / reminders.length) * 100);
  message += templates.commands.today.progress
    .replace('{completed}', completed)
    .replace('{total}', reminders.length)
    .replace('{percent}', percent);

  await maxApi.sendTextMessage(userId, message, { parseMode: 'Markdown' });
};

/**
 * Получение эмодзи статуса
 * @param {string} status - Статус
 */
const getStatusEmoji = (status) => {
  const emojis = {
    pending: '⏳',
    sent: '🔔',
    completed: '✅',
    skipped: '❌',
    postponed: '⏰',
  };
  return emojis[status] || '⏳';
};

/**
 * Форматирование даты
 * @param {string} dateString - Дата в формате YYYY-MM-DD
 */
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = { day: 'numeric', month: 'long', weekday: 'long' };
  return date.toLocaleDateString('ru-RU', options);
};

/**
 * Отправка помощи
 * @param {number} userId - ID пользователя
 */
const sendHelp = async (userId) => {
  await maxApi.sendTextMessage(
    userId,
    templates.commands.help.text,
    { parseMode: 'Markdown' }
  );
};

/**
 * Отправка статистики
 * @param {number} userId - ID пользователя
 */
const sendStats = async (userId) => {
  const stats = await db.getUserStats(userId);
  const levelInfo = gamification.getLevelInfo(stats.level);

  let message = templates.commands.stats.header;
  message += templates.commands.stats.streak
    .replace('{streak}', stats.current_streak)
    .replace('{max_streak}', stats.max_streak);
  message += templates.commands.stats.level
    .replace('{level}', levelInfo.name)
    .replace('{points}', stats.points);
  
  const rate = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;
  
  message += templates.commands.stats.completion
    .replace('{completed}', stats.completed)
    .replace('{skipped}', stats.skipped)
    .replace('{rate}', rate);
  message += templates.commands.stats.achievements
    .replace('{count}', stats.achievements);

  await maxApi.sendTextMessage(userId, message, { parseMode: 'Markdown' });
};

/**
 * Отправка настроек
 * @param {number} userId - ID пользователя
 */
const sendSettings = async (userId) => {
  const settings = templates.commands.settings;
  await maxApi.sendMessageWithKeyboard(
    userId,
    settings.text,
    [
      [
        { type: 'callback', text: settings.buttons.timezone, payload: 'settings|timezone' },
        { type: 'callback', text: settings.buttons.quiet_hours, payload: 'settings|quiet_hours' },
      ],
      [
        { type: 'callback', text: settings.buttons.notifications, payload: 'settings|notifications' },
      ],
      [
        { type: 'callback', text: settings.buttons.export, payload: 'settings|export' },
        { type: 'callback', text: settings.buttons.delete, payload: 'settings|delete' },
      ],
    ]
  );
};

/**
 * Начало создания рутины
 * @param {number} userId - ID пользователя
 */
const startRoutineCreation = async (userId) => {
  routineCreationData.set(userId, {
    state: ROUTINE_CREATION_STATES.SELECT_TYPE,
    data: {},
  });

  const add = templates.commands.add.select_type;
  await maxApi.sendMessageWithKeyboard(
    userId,
    add.text,
    [
      [
        { type: 'callback', text: add.buttons.medication, payload: 'add|type|medication' },
        { type: 'callback', text: add.buttons.habit, payload: 'add|type|habit' },
      ],
      [
        { type: 'callback', text: add.buttons.task, payload: 'add|type|task' },
      ],
    ]
  );
};

/**
 * Обработка callback при создании рутины
 * @param {number} userId - ID пользователя
 * @param {Array} params - Параметры
 */
const handleAddRoutineCallback = async (userId, params) => {
  const [field, value] = params;
  const creation = routineCreationData.get(userId);

  if (!creation) {
    await startRoutineCreation(userId);
    return;
  }

  switch (field) {
    case 'type':
      creation.data.type = value;
      creation.state = ROUTINE_CREATION_STATES.SELECT_TEMPLATE;
      await showTemplates(userId, value);
      break;

    case 'template':
      if (value === 'custom') {
        creation.state = ROUTINE_CREATION_STATES.ENTER_TITLE;
        await maxApi.sendTextMessage(
          userId,
          templates.commands.add.enter_title.text,
          { parseMode: 'Markdown' }
        );
      } else {
        // Выбран шаблон
        const template = await db.getRoutineTemplates().then(t => t.find(tt => tt.template_id == value));
        if (template) {
          creation.data.title = template.title;
          creation.data.icon = template.icon;
          creation.data.dosage = template.dosage;
          creation.state = ROUTINE_CREATION_STATES.SELECT_SCHEDULE;
          await showScheduleOptions(userId);
        }
      }
      break;

    case 'schedule':
      creation.data.schedule_type = value;
      creation.state = ROUTINE_CREATION_STATES.SELECT_TIME;
      await showTimeOptions(userId);
      break;

    case 'time':
      creation.data.time = value;
      creation.state = ROUTINE_CREATION_STATES.CONFIRM;
      await showConfirmation(userId);
      break;

    case 'confirm':
      if (value === 'yes') {
        await saveRoutine(userId);
      } else {
        routineCreationData.delete(userId);
        await maxApi.sendTextMessage(userId, '❌ Создание отменено');
      }
      break;
  }
};

/**
 * Показать шаблоны
 * @param {number} userId - ID пользователя
 * @param {string} type - Тип рутины
 */
const showTemplates = async (userId, type) => {
  const templates_list = await db.getRoutineTemplates(type, true);
  
  const buttons = templates_list.map(t => ({
    type: 'callback',
    text: `${t.icon} ${t.title}`,
    payload: `add|template|${t.template_id}`,
  }));

  // Разбиваем на ряды по 2 кнопки
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  // Добавляем кнопку "Свой вариант"
  rows.push([{
    type: 'callback',
    text: templates.commands.add.select_template.buttons.custom,
    payload: 'add|template|custom',
  }]);

  await maxApi.sendMessageWithKeyboard(
    userId,
    templates.commands.add.select_template.text,
    rows
  );
};

/**
 * Показать опции расписания
 * @param {number} userId - ID пользователя
 */
const showScheduleOptions = async (userId) => {
  const schedule = templates.commands.add.select_schedule;
  await maxApi.sendMessageWithKeyboard(
    userId,
    schedule.text,
    [
      [
        { type: 'callback', text: schedule.buttons.daily, payload: 'add|schedule|daily' },
      ],
      [
        { type: 'callback', text: schedule.buttons.weekdays, payload: 'add|schedule|weekdays' },
      ],
      [
        { type: 'callback', text: schedule.buttons.custom, payload: 'add|schedule|custom' },
      ],
    ]
  );
};

/**
 * Показать опции времени
 * @param {number} userId - ID пользователя
 */
const showTimeOptions = async (userId) => {
  const time = templates.commands.add.select_time;
  await maxApi.sendMessageWithKeyboard(
    userId,
    time.text,
    [
      [
        { type: 'callback', text: time.buttons.morning, payload: 'add|time|07:00' },
        { type: 'callback', text: time.buttons.noon, payload: 'add|time|12:00' },
      ],
      [
        { type: 'callback', text: time.buttons.evening, payload: 'add|time|20:00' },
        { type: 'callback', text: time.buttons.custom, payload: 'add|time|custom' },
      ],
    ]
  );
};

/**
 * Показать подтверждение
 * @param {number} userId - ID пользователя
 */
const showConfirmation = async (userId) => {
  const creation = routineCreationData.get(userId);
  const data = creation.data;

  const typeNames = {
    medication: '💊 Лекарство',
    habit: '🥤 Привычка',
    task: '📋 Дело',
  };

  const scheduleNames = {
    daily: 'Каждый день',
    weekdays: 'Будни/Выходные',
    custom: 'Выбранные дни',
  };

  let message = templates.commands.add.confirm.text
    .replace('{type}', typeNames[data.type])
    .replace('{title}', data.title)
    .replace('{schedule}', scheduleNames[data.schedule_type])
    .replace('{time}', data.time);

  await maxApi.sendMessageWithKeyboard(
    userId,
    message,
    [
      [
        { type: 'callback', text: templates.commands.add.confirm.buttons.confirm, payload: 'add|confirm|yes' },
      ],
      [
        { type: 'callback', text: templates.commands.add.confirm.buttons.edit, payload: 'add|type|' + data.type },
      ],
      [
        { type: 'callback', text: templates.commands.add.confirm.buttons.cancel, payload: 'add|confirm|no' },
      ],
    ]
  );
};

/**
 * Сохранение рутины
 * @param {number} userId - ID пользователя
 */
const saveRoutine = async (userId) => {
  const creation = routineCreationData.get(userId);
  const data = creation.data;

  try {
    // Создаем рутину
    const routine = await db.createRoutine({
      user_id: userId,
      type: data.type,
      title: data.title,
      icon: data.icon || '⭐',
      dosage: data.dosage,
    });

    // Создаем расписание
    const scheduleData = {
      routine_id: routine.routine_id,
      schedule_type: data.schedule_type,
    };

    if (data.schedule_type === 'weekdays') {
      scheduleData.time_weekdays = data.time;
      scheduleData.time_weekends = data.time;
    } else {
      scheduleData.time_weekdays = data.time;
    }

    await db.createSchedule(scheduleData);

    // Генерируем напоминания
    // TODO: Вызвать сервис генерации напоминаний

    routineCreationData.delete(userId);

    const successMsg = templates.commands.add.success
      .replace('{icon}', routine.icon)
      .replace('{title}', routine.title)
      .replace('{schedule}', data.schedule_type === 'daily' ? 'каждый день' : 'по расписанию')
      .replace('{time}', data.time);

    await maxApi.sendTextMessage(userId, successMsg, { parseMode: 'Markdown' });

  } catch (error) {
    logger.error('Ошибка сохранения рутины:', error);
    await maxApi.sendTextMessage(userId, templates.errors.general);
  }
};

/**
 * Обработка выполнения напоминания
 * @param {number} userId - ID пользователя
 * @param {string} reminderId - ID напоминания
 */
const handleReminderComplete = async (userId, reminderId) => {
  try {
    const reminder = await db.getReminderById(reminderId);
    if (!reminder || reminder.user_id != userId) {
      await maxApi.sendTextMessage(userId, templates.errors.not_found);
      return;
    }

    // Обновляем статус
    await db.updateReminder(reminderId, {
      status: 'completed',
      completed_at: new Date(),
      confirmation_method: 'push',
    });

    // Создаем событие
    await db.createEvent({
      reminder_id: reminderId,
      user_id: userId,
      routine_id: reminder.routine_id,
      event_type: 'completed',
      event_source: 'bot',
    });

    // Обновляем геймификацию
    const result = await gamification.handleCompletion(userId, reminderId, reminder.type);

    // Формируем ответ
    const template = templates.reminders.completion_success[reminder.type];
    let message = template
      .replace('{title}', reminder.title)
      .replace('{streak_text}', result.streak.current > 1 
        ? templates.reminders.streak_text.replace('{streak}', result.streak.current)
        : '');

    await maxApi.sendTextMessage(userId, message, { parseMode: 'Markdown' });

    // Показываем новые достижения
    if (result.achievements.length > 0) {
      for (const achievement of result.achievements) {
        const badgeMsg = templates.achievements.new_badge
          .replace('{title}', achievement.title)
          .replace('{description}', achievement.description)
          .replace('{points}', achievement.points);
        await maxApi.sendTextMessage(userId, badgeMsg, { parseMode: 'Markdown' });
      }
    }

  } catch (error) {
    logger.error('Ошибка обработки выполнения:', error);
    await maxApi.sendTextMessage(userId, templates.errors.general);
  }
};

/**
 * Обработка отсрочки напоминания
 * @param {number} userId - ID пользователя
 * @param {string} reminderId - ID напоминания
 * @param {number} minutes - Минуты отсрочки
 */
const handleReminderPostpone = async (userId, reminderId, minutes) => {
  try {
    const reminder = await db.getReminderById(reminderId);
    if (!reminder || reminder.user_id != userId) {
      await maxApi.sendTextMessage(userId, templates.errors.not_found);
      return;
    }

    if (reminder.postpone_count >= reminder.max_postpones) {
      await maxApi.sendTextMessage(
        userId,
        '⚠️ Достигнуто максимальное количество отсрочек для этого напоминания.',
        { parseMode: 'Markdown' }
      );
      return;
    }

    await db.updateReminder(reminderId, {
      status: 'postponed',
      postpone_count: reminder.postpone_count + 1,
    });

    // TODO: Запланировать новое напоминание через BullMQ

    const message = templates.reminders.postpone_success.replace('{minutes}', minutes);
    await maxApi.sendTextMessage(userId, message, { parseMode: 'Markdown' });

  } catch (error) {
    logger.error('Ошибка отсрочки напоминания:', error);
    await maxApi.sendTextMessage(userId, templates.errors.general);
  }
};

/**
 * Обработка пропуска напоминания
 * @param {number} userId - ID пользователя
 * @param {string} reminderId - ID напоминания
 */
const handleReminderSkip = async (userId, reminderId) => {
  try {
    const reminder = await db.getReminderById(reminderId);
    if (!reminder || reminder.user_id != userId) {
      await maxApi.sendTextMessage(userId, templates.errors.not_found);
      return;
    }

    await db.updateReminder(reminderId, {
      status: 'skipped',
    });

    await db.createEvent({
      reminder_id: reminderId,
      user_id: userId,
      routine_id: reminder.routine_id,
      event_type: 'skipped',
      event_source: 'bot',
    });

    // Обновляем геймификацию
    await gamification.handleSkip(userId);

    await maxApi.sendTextMessage(
      userId,
      templates.reminders.skip_success,
      { parseMode: 'Markdown' }
    );

  } catch (error) {
    logger.error('Ошибка пропуска напоминания:', error);
    await maxApi.sendTextMessage(userId, templates.errors.general);
  }
};

/**
 * Обработка команды /done
 * @param {number} userId - ID пользователя
 * @param {Array} args - Аргументы команды
 */
const handleDoneCommand = async (userId, args) => {
  const today = new Date().toISOString().split('T')[0];
  const reminders = await db.getRemindersByDate(userId, today);
  
  const pending = reminders.filter(r => r.status === 'sent' || r.status === 'pending');

  if (pending.length === 0) {
    await maxApi.sendTextMessage(
      userId,
      '✅ На сегодня нет активных напоминаний.',
      { parseMode: 'Markdown' }
    );
    return;
  }

  // Если указано название - ищем по подстроке
  if (args.length > 0) {
    const searchTerm = args.join(' ').toLowerCase();
    const found = pending.find(r => 
      r.title.toLowerCase().includes(searchTerm)
    );

    if (found) {
      await handleReminderComplete(userId, found.reminder_id);
    } else {
      await maxApi.sendTextMessage(
        userId,
        `❌ Не найдено напоминание с названием "${searchTerm}"`,
        { parseMode: 'Markdown' }
      );
    }
    return;
  }

  // Показываем список с кнопками
  const buttons = pending.map(r => [{
    type: 'callback',
    text: `✅ ${r.icon} ${r.title} (${r.scheduled_time.substring(0, 5)})`,
    payload: `ok|${r.reminder_id}`,
  }]);

  await maxApi.sendMessageWithKeyboard(
    userId,
    '📋 *Отметить выполненным:*\n\nВыберите рутину:',
    buttons
  );
};

/**
 * Smart Detection - распознавание простых фраз
 * @param {number} userId - ID пользователя
 * @param {string} text - Текст сообщения
 * @param {Object} user - Объект пользователя
 */
const handleSmartDetection = async (userId, text, user) => {
  // Регулярки для распознавания
  const patterns = {
    completion: /(выпил|сделал|готово|принял|выполнил|съел).*(таблет|вод|лекарство|магний|витамин)/i,
    skip: /(пропустил|не смог|забыл).*(таблет|вод|лекарство)/i,
    postpone: /(отложи|напомни позже|через).*(минут|час)/i,
  };

  if (patterns.completion.test(text)) {
    // Ищем последнее активное напоминание
    const today = new Date().toISOString().split('T')[0];
    const reminders = await db.getRemindersByDate(userId, today);
    const sent = reminders.find(r => r.status === 'sent');

    if (sent) {
      await maxApi.sendMessageWithKeyboard(
        userId,
        `Вы имели в виду *${sent.title}*?`,
        [[
          { type: 'callback', text: '✅ Да, отметить', payload: `ok|${sent.reminder_id}` },
          { type: 'callback', text: '❌ Нет', payload: 'menu|cancel' },
        ]]
      );
    }
  }
};

/**
 * Отправка списка рутин
 * @param {number} userId - ID пользователя
 */
const sendRoutinesList = async (userId) => {
  const routines = await db.getUserRoutines(userId);

  if (routines.length === 0) {
    await maxApi.sendTextMessage(
      userId,
      templates.commands.list.empty,
      { parseMode: 'Markdown' }
    );
    return;
  }

  let message = templates.commands.list.header;
  
  routines.forEach(routine => {
    const line = routine.is_active
      ? templates.commands.list.item_active
      : templates.commands.list.item_inactive;
    
    message += line
      .replace('{icon}', routine.icon)
      .replace('{title}', routine.title)
      .replace('{schedule}', 'ежедневно') // TODO: Получать реальное расписание
      .replace('{time}', '08:00') + '\n';
  });

  message += templates.commands.list.footer;

  await maxApi.sendTextMessage(userId, message, { parseMode: 'Markdown' });
};

/**
 * Обработка запроса на экспорт данных
 * @param {number} userId - ID пользователя
 */
const handleExportRequest = async (userId) => {
  await maxApi.sendTextMessage(
    userId,
    templates.gdpr.export_request,
    { parseMode: 'Markdown' }
  );
  // TODO: Создать задачу на экспорт через BullMQ
};

/**
 * Обработка запроса на удаление
 * @param {number} userId - ID пользователя
 */
const handleDeleteRequest = async (userId) => {
  await maxApi.sendMessageWithKeyboard(
    userId,
    templates.gdpr.delete_confirm,
    [[
      { type: 'callback', text: templates.gdpr.delete_buttons.confirm, payload: 'delete|confirm' },
      { type: 'callback', text: templates.gdpr.delete_buttons.cancel, payload: 'menu|cancel' },
    ]]
  );
};

/**
 * Отправка главного меню
 * @param {number} userId - ID пользователя
 */
const sendMainMenu = async (userId) => {
  await maxApi.sendMessageWithKeyboard(
    userId,
    '🏠 *Главное меню*\n\nВыберите действие:',
    [
      [
        { type: 'callback', text: '📅 Сегодня', payload: 'menu|today' },
        { type: 'callback', text: '➕ Добавить', payload: 'menu|add' },
      ],
      [
        { type: 'callback', text: '📋 Список', payload: 'menu|list' },
        { type: 'callback', text: '📊 Статистика', payload: 'menu|stats' },
      ],
      [
        { type: 'callback', text: '⚙️ Настройки', payload: 'menu|settings' },
      ],
    ]
  );
};

/**
 * Обработка авторизации мини-приложения
 * @param {number} userId - ID пользователя
 * @param {string} code - Код авторизации
 */
const handleMiniAppAuth = async (userId, code) => {
  // TODO: Реализовать обмен кода на JWT
  await maxApi.sendTextMessage(
    userId,
    templates.mini_app.auth_success,
    { parseMode: 'Markdown' }
  );
};

export default {
  handleWebhook,
};
