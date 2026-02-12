/**
 * REST API Routes для мини-приложения HabitMax
 * @module api/routes
 */

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import * as db from '../services/databaseService.js';
import * as gamification from '../services/gamificationService.js';
import { backgroundQueue } from '../scheduler/reminderQueue.js';

const router = Router();

/**
 * Middleware для валидации
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Middleware для аутентификации JWT
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Токен не предоставлен',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.userId = decoded.userId;
    req.user = await db.getUserById(decoded.userId);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не найден',
      });
    }
    
    next();
  } catch (error) {
    logger.error('Ошибка верификации токена:', error);
    return res.status(403).json({
      success: false,
      error: 'Недействительный токен',
    });
  }
};

// ============================================
// АУТЕНТИФИКАЦИЯ
// ============================================

/**
 * POST /api/auth/exchange
 * Обмен кода авторизации на JWT токен
 */
router.post(
  '/auth/exchange',
  [
    body('code').isString().notEmpty().withMessage('Код авторизации обязателен'),
    validate,
  ],
  async (req, res) => {
    try {
      const { code } = req.body;

      // TODO: Верификация кода через Max API
      // Пока упрощенная версия: код = userId
      const userId = parseInt(code);
      
      if (isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: 'Недействительный код',
        });
      }

      const user = await db.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Пользователь не найден',
        });
      }

      // Генерируем JWT
      const token = jwt.sign(
        { userId: user.user_id, username: user.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.user_id, type: 'refresh' },
        config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Сохраняем сессию
      await db.query(
        `INSERT INTO sessions (user_id, token, refresh_token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', $4, $5)`,
        [userId, token, refreshToken, req.ip, req.headers['user-agent']]
      );

      res.json({
        success: true,
        data: {
          token,
          refreshToken,
          expiresIn: 604800, // 7 дней в секундах
          user: {
            id: user.user_id,
            username: user.username,
            firstName: user.first_name,
            timezone: user.timezone,
            level: user.level,
            points: user.points,
          },
        },
      });
    } catch (error) {
      logger.error('Ошибка обмена кода:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Обновление токена
 */
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token не предоставлен',
      });
    }

    const decoded = jwt.verify(refreshToken, config.jwt.secret);
    
    if (decoded.type !== 'refresh') {
      return res.status(403).json({
        success: false,
        error: 'Недействительный refresh token',
      });
    }

    // Проверяем сессию
    const sessionResult = await db.query(
      'SELECT * FROM sessions WHERE refresh_token = $1 AND is_revoked = false',
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Сессия не найдена или отозвана',
      });
    }

    // Генерируем новый токен
    const newToken = jwt.sign(
      { userId: decoded.userId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Обновляем сессию
    await db.query(
      'UPDATE sessions SET token = $1, last_used_at = CURRENT_TIMESTAMP WHERE refresh_token = $2',
      [newToken, refreshToken]
    );

    res.json({
      success: true,
      data: {
        token: newToken,
        expiresIn: 604800,
      },
    });
  } catch (error) {
    logger.error('Ошибка обновления токена:', error);
    res.status(403).json({
      success: false,
      error: 'Недействительный refresh token',
    });
  }
});

// ============================================
// РУТИНЫ
// ============================================

/**
 * GET /api/routines
 * Получение списка рутин пользователя
 */
router.get('/routines', authenticateToken, async (req, res) => {
  try {
    const routines = await db.getUserRoutines(req.userId);
    
    // Добавляем расписания
    const routinesWithSchedules = await Promise.all(
      routines.map(async (routine) => {
        const schedules = await db.getRoutineSchedules(routine.routine_id);
        return {
          id: routine.routine_id,
          type: routine.type,
          title: routine.title,
          description: routine.description,
          icon: routine.icon,
          dosage: routine.dosage,
          isActive: routine.is_active,
          gracePeriod: routine.grace_period_minutes,
          priority: routine.priority,
          schedules: schedules.map(s => ({
            id: s.schedule_id,
            type: s.schedule_type,
            timeWeekdays: s.time_weekdays,
            timeWeekends: s.time_weekends,
            customDays: s.custom_days,
            specificTimes: s.specific_times,
          })),
        };
      })
    );

    res.json({
      success: true,
      data: routinesWithSchedules,
    });
  } catch (error) {
    logger.error('Ошибка получения рутин:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * POST /api/routines
 * Создание новой рутины
 */
router.post(
  '/routines',
  authenticateToken,
  [
    body('type').isIn(['habit', 'medication', 'task']).withMessage('Неверный тип рутины'),
    body('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Название обязательно (1-100 символов)'),
    body('schedule.type').isIn(['daily', 'weekdays', 'custom']).withMessage('Неверный тип расписания'),
    body('schedule.time').isString().matches(/^\d{2}:\d{2}$/).withMessage('Время должно быть в формате HH:MM'),
    validate,
  ],
  async (req, res) => {
    try {
      const { type, title, description, icon, dosage, schedule } = req.body;

      // Создаем рутину
      const routine = await db.createRoutine({
        user_id: req.userId,
        type,
        title,
        description,
        icon: icon || '⭐',
        dosage,
      });

      // Создаем расписание
      const scheduleData = {
        routine_id: routine.routine_id,
        schedule_type: schedule.type,
        time_weekdays: schedule.time,
      };

      if (schedule.type === 'weekdays') {
        scheduleData.time_weekends = schedule.weekendTime || schedule.time;
      }

      if (schedule.customDays) {
        scheduleData.custom_days = schedule.customDays;
      }

      await db.createSchedule(scheduleData);

      // Генерируем напоминания в фоне
      await backgroundQueue.add('generate-reminders', {
        type: 'generate-reminders',
        data: { userId: req.userId, routineId: routine.routine_id },
      });

      res.status(201).json({
        success: true,
        data: {
          id: routine.routine_id,
          type: routine.type,
          title: routine.title,
          icon: routine.icon,
        },
      });
    } catch (error) {
      logger.error('Ошибка создания рутины:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

/**
 * PATCH /api/routines/:id
 * Обновление рутины
 */
router.patch(
  '/routines/:id',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Неверный ID рутины'),
    validate,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Проверяем принадлежность
      const routine = await db.getRoutineById(id);
      if (!routine || routine.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Рутина не найдена',
        });
      }

      const updated = await db.updateRoutine(id, updates);

      res.json({
        success: true,
        data: {
          id: updated.routine_id,
          title: updated.title,
          isActive: updated.is_active,
        },
      });
    } catch (error) {
      logger.error('Ошибка обновления рутины:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

/**
 * DELETE /api/routines/:id
 * Удаление рутины
 */
router.delete(
  '/routines/:id',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Неверный ID рутины'),
    validate,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;

      // Проверяем принадлежность
      const routine = await db.getRoutineById(id);
      if (!routine || routine.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Рутина не найдена',
        });
      }

      await db.deleteRoutine(id);

      res.json({
        success: true,
        message: 'Рутина удалена',
      });
    } catch (error) {
      logger.error('Ошибка удаления рутины:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

// ============================================
// НАПОМИНАНИЯ
// ============================================

/**
 * GET /api/reminders/today
 * Получение напоминаний на сегодня
 */
router.get('/reminders/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const reminders = await db.getRemindersByDate(req.userId, today);

    const formatted = reminders.map(r => ({
      id: r.reminder_id,
      routineId: r.routine_id,
      title: r.title,
      type: r.type,
      icon: r.icon,
      dosage: r.dosage,
      time: r.scheduled_time,
      status: r.status,
      canPostpone: r.postpone_count < r.max_postpones,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    logger.error('Ошибка получения напоминаний:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * POST /api/reminders/:id/complete
 * Отметка напоминания как выполненного
 */
router.post(
  '/reminders/:id/complete',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Неверный ID напоминания'),
    validate,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;

      const reminder = await db.getReminderById(id);
      if (!reminder || reminder.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Напоминание не найдено',
        });
      }

      // Обновляем статус
      await db.updateReminder(id, {
        status: 'completed',
        completed_at: new Date(),
        confirmation_method: 'miniapp',
      });

      // Создаем событие
      await db.createEvent({
        reminder_id: id,
        user_id: req.userId,
        routine_id: reminder.routine_id,
        event_type: 'completed',
        event_source: 'miniapp',
      });

      // Обновляем геймификацию
      const result = await gamification.handleCompletion(req.userId, id, reminder.type);

      res.json({
        success: true,
        data: {
          streak: result.streak.current,
          newAchievements: result.achievements.length,
          pointsEarned: result.points,
        },
      });
    } catch (error) {
      logger.error('Ошибка отметки напоминания:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

/**
 * POST /api/reminders/:id/postpone
 * Отсрочка напоминания
 */
router.post(
  '/reminders/:id/postpone',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Неверный ID напоминания'),
    body('minutes').isInt({ min: 5, max: 60 }).withMessage('Минуты должны быть от 5 до 60'),
    validate,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { minutes } = req.body;

      const reminder = await db.getReminderById(id);
      if (!reminder || reminder.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Напоминание не найдено',
        });
      }

      if (reminder.postpone_count >= reminder.max_postpones) {
        return res.status(400).json({
          success: false,
          error: 'Достигнуто максимальное количество отсрочек',
        });
      }

      await db.updateReminder(id, {
        status: 'postponed',
        postpone_count: reminder.postpone_count + 1,
      });

      // TODO: Запланировать новое напоминание

      res.json({
        success: true,
        data: {
          postponedMinutes: minutes,
          remainingPostpones: reminder.max_postpones - reminder.postpone_count - 1,
        },
      });
    } catch (error) {
      logger.error('Ошибка отсрочки напоминания:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

// ============================================
// СТАТИСТИКА
// ============================================

/**
 * GET /api/stats
 * Получение статистики пользователя
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserStats(req.userId);
    const levelInfo = gamification.getLevelInfo(stats.level);
    const levelProgress = await gamification.getLevelProgress(req.userId);

    // Получаем данные для графика (последние 7 дней)
    const chartData = await getWeeklyStats(req.userId);

    res.json({
      success: true,
      data: {
        streak: {
          current: stats.current_streak,
          max: stats.max_streak,
        },
        level: {
          code: stats.level,
          name: levelInfo.name,
          icon: levelInfo.icon,
          points: stats.points,
          progress: levelProgress.progress,
          nextLevelPoints: levelProgress.next,
        },
        completion: {
          total: parseInt(stats.total),
          completed: parseInt(stats.completed),
          skipped: parseInt(stats.skipped),
          rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        },
        achievements: {
          total: stats.achievements,
        },
        chart: chartData,
      },
    });
  } catch (error) {
    logger.error('Ошибка получения статистики:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * Получение статистики за неделю
 * @param {number} userId - ID пользователя
 */
async function getWeeklyStats(userId) {
  const result = await db.query(
    `SELECT 
       scheduled_date,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
       COUNT(*) as total
     FROM reminders 
     WHERE user_id = $1 
     AND scheduled_date >= CURRENT_DATE - INTERVAL '6 days'
     GROUP BY scheduled_date
     ORDER BY scheduled_date`,
    [userId]
  );

  return result.rows.map(row => ({
    date: row.scheduled_date,
    completed: parseInt(row.completed),
    skipped: parseInt(row.skipped),
    total: parseInt(row.total),
    rate: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
  }));
}

// ============================================
// ДОСТИЖЕНИЯ
// ============================================

/**
 * GET /api/achievements
 * Получение достижений пользователя
 */
router.get('/achievements', authenticateToken, async (req, res) => {
  try {
    const achievements = await db.getUserAchievements(req.userId);

    res.json({
      success: true,
      data: achievements.map(a => ({
        id: a.achievement_id,
        code: a.badge_code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        points: a.points,
        achievedAt: a.achieved_at,
        isNew: a.is_new,
      })),
    });
  } catch (error) {
    logger.error('Ошибка получения достижений:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * POST /api/achievements/mark-seen
 * Отметить достижения как просмотренные
 */
router.post('/achievements/mark-seen', authenticateToken, async (req, res) => {
  try {
    await db.markAchievementsAsSeen(req.userId);

    res.json({
      success: true,
      message: 'Достижения отмечены как просмотренные',
    });
  } catch (error) {
    logger.error('Ошибка отметки достижений:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

// ============================================
// НАСТРОЙКИ
// ============================================

/**
 * GET /api/settings
 * Получение настроек пользователя
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      data: {
        timezone: user.timezone,
        quietHours: {
          start: user.quiet_hours_start,
          end: user.quiet_hours_end,
        },
        notifications: true, // TODO: Добавить поле в БД
      },
    });
  } catch (error) {
    logger.error('Ошибка получения настроек:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

/**
 * PATCH /api/settings
 * Обновление настроек
 */
router.patch(
  '/settings',
  authenticateToken,
  [
    body('timezone').optional().isString(),
    body('quietHours.start').optional().matches(/^\d{2}:\d{2}$/),
    body('quietHours.end').optional().matches(/^\d{2}:\d{2}$/),
    validate,
  ],
  async (req, res) => {
    try {
      const updates = {};

      if (req.body.timezone) {
        updates.timezone = req.body.timezone;
      }

      if (req.body.quietHours) {
        if (req.body.quietHours.start) {
          updates.quiet_hours_start = req.body.quietHours.start;
        }
        if (req.body.quietHours.end) {
          updates.quiet_hours_end = req.body.quietHours.end;
        }
      }

      await db.updateUser(req.userId, updates);

      res.json({
        success: true,
        message: 'Настройки обновлены',
      });
    } catch (error) {
      logger.error('Ошибка обновления настроек:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
      });
    }
  }
);

// ============================================
// ШАБЛОНЫ
// ============================================

/**
 * GET /api/templates
 * Получение шаблонов рутин
 */
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const { type, popular } = req.query;
    const templates = await db.getRoutineTemplates(
      type || null,
      popular === 'true'
    );

    res.json({
      success: true,
      data: templates.map(t => ({
        id: t.template_id,
        type: t.type,
        title: t.title,
        description: t.description,
        icon: t.icon,
        dosage: t.dosage,
        defaultTime: t.default_time,
        isPopular: t.is_popular,
      })),
    });
  } catch (error) {
    logger.error('Ошибка получения шаблонов:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

/**
 * GET /health
 * Проверка работоспособности
 */
router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
