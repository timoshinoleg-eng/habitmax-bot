/**
 * Сервис для работы с базой данных
 * CRUD операции для всех сущностей
 * @module services/databaseService
 */

import { query, getClient } from '../config/database.js';
import { logger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// ПОЛЬЗОВАТЕЛИ
// ============================================

/**
 * Получение или создание пользователя
 * @param {Object} userData - Данные пользователя из Max API
 */
export const getOrCreateUser = async (userData) => {
  const { id, username, first_name, last_name } = userData;
  
  const result = await query(
    `INSERT INTO users (user_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) 
     DO UPDATE SET 
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       last_active = CURRENT_TIMESTAMP
     RETURNING *`,
    [id, username, first_name, last_name]
  );
  
  return result.rows[0];
};

/**
 * Получение пользователя по ID
 * @param {number} userId - ID пользователя
 */
export const getUserById = async (userId) => {
  const result = await query(
    'SELECT * FROM users WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  return result.rows[0] || null;
};

/**
 * Обновление пользователя
 * @param {number} userId - ID пользователя
 * @param {Object} updates - Поля для обновления
 */
export const updateUser = async (userId, updates) => {
  const allowedFields = [
    'timezone', 'quiet_hours_start', 'quiet_hours_end',
    'gdpr_consent', 'consent_date', 'onboarding_state',
    'onboarding_completed', 'current_streak', 'max_streak',
    'total_completed', 'level', 'points', 'is_active'
  ];
  
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  Object.entries(updates).forEach(([key, value]) => {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  values.push(userId);
  
  const result = await query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = $${paramIndex} 
     RETURNING *`,
    values
  );
  
  return result.rows[0];
};

/**
 * Мягкое удаление пользователя (GDPR)
 * @param {number} userId - ID пользователя
 */
export const softDeleteUser = async (userId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Помечаем пользователя как удаленного
    await client.query(
      `UPDATE users 
       SET is_active = false, 
           deleted_at = CURRENT_TIMESTAMP,
           username = NULL,
           first_name = NULL,
           last_name = NULL
       WHERE user_id = $1`,
      [userId]
    );
    
    // Отменяем все будущие напоминания
    await client.query(
      `UPDATE reminders 
       SET status = 'cancelled' 
       WHERE user_id = $1 
       AND scheduled_date >= CURRENT_DATE
       AND status = 'pending'`,
      [userId]
    );
    
    // Отзываем все сессии
    await client.query(
      'UPDATE sessions SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId]
    );
    
    await client.query('COMMIT');
    
    logger.info('Пользователь мягко удален', { userId });
    return { success: true };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// РУТИНЫ
// ============================================

/**
 * Создание рутины
 * @param {Object} routineData - Данные рутины
 */
export const createRoutine = async (routineData) => {
  const {
    user_id,
    type,
    title,
    description,
    icon = '⭐',
    dosage,
    medication_form,
    grace_period_minutes = 120,
    priority = 1,
  } = routineData;
  
  const result = await query(
    `INSERT INTO routines 
     (user_id, type, title, description, icon, dosage, medication_form, grace_period_minutes, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [user_id, type, title, description, icon, dosage, medication_form, grace_period_minutes, priority]
  );
  
  logger.info('Рутина создана', { routineId: result.rows[0].routine_id, userId: user_id });
  return result.rows[0];
};

/**
 * Получение рутин пользователя
 * @param {number} userId - ID пользователя
 * @param {boolean} activeOnly - Только активные
 */
export const getUserRoutines = async (userId, activeOnly = true) => {
  let sql = 'SELECT * FROM routines WHERE user_id = $1';
  const params = [userId];
  
  if (activeOnly) {
    sql += ' AND is_active = true AND deleted_at IS NULL';
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const result = await query(sql, params);
  return result.rows;
};

/**
 * Получение рутины по ID
 * @param {string} routineId - ID рутины
 */
export const getRoutineById = async (routineId) => {
  const result = await query(
    'SELECT * FROM routines WHERE routine_id = $1',
    [routineId]
  );
  return result.rows[0] || null;
};

/**
 * Обновление рутины
 * @param {string} routineId - ID рутины
 * @param {Object} updates - Поля для обновления
 */
export const updateRoutine = async (routineId, updates) => {
  const allowedFields = [
    'title', 'description', 'icon', 'dosage', 'medication_form',
    'is_active', 'grace_period_minutes', 'priority'
  ];
  
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  Object.entries(updates).forEach(([key, value]) => {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  values.push(routineId);
  
  const result = await query(
    `UPDATE routines SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP 
     WHERE routine_id = $${paramIndex} 
     RETURNING *`,
    values
  );
  
  return result.rows[0];
};

/**
 * Удаление рутины (мягкое)
 * @param {string} routineId - ID рутины
 */
export const deleteRoutine = async (routineId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Мягкое удаление рутины
    await client.query(
      'UPDATE routines SET deleted_at = CURRENT_TIMESTAMP, is_active = false WHERE routine_id = $1',
      [routineId]
    );
    
    // Отмена будущих напоминаний
    await client.query(
      `UPDATE reminders 
       SET status = 'cancelled' 
       WHERE routine_id = $1 
       AND scheduled_date >= CURRENT_DATE
       AND status = 'pending'`,
      [routineId]
    );
    
    await client.query('COMMIT');
    
    logger.info('Рутина удалена', { routineId });
    return { success: true };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// РАСПИСАНИЯ
// ============================================

/**
 * Создание расписания
 * @param {Object} scheduleData - Данные расписания
 */
export const createSchedule = async (scheduleData) => {
  const {
    routine_id,
    schedule_type,
    time_weekdays,
    time_weekends,
    custom_days,
    specific_times,
    end_date,
  } = scheduleData;
  
  const result = await query(
    `INSERT INTO schedules 
     (routine_id, schedule_type, time_weekdays, time_weekends, custom_days, specific_times, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [routine_id, schedule_type, time_weekdays, time_weekends, 
     JSON.stringify(custom_days), JSON.stringify(specific_times), end_date]
  );
  
  return result.rows[0];
};

/**
 * Получение расписаний рутины
 * @param {string} routineId - ID рутины
 */
export const getRoutineSchedules = async (routineId) => {
  const result = await query(
    'SELECT * FROM schedules WHERE routine_id = $1',
    [routineId]
  );
  return result.rows;
};

// ============================================
// НАПОМИНАНИЯ
// ============================================

/**
 * Создание напоминания
 * @param {Object} reminderData - Данные напоминания
 */
export const createReminder = async (reminderData) => {
  const {
    routine_id,
    user_id,
    scheduled_date,
    scheduled_time,
    max_postpones = 2,
  } = reminderData;
  
  const result = await query(
    `INSERT INTO reminders 
     (routine_id, user_id, scheduled_date, scheduled_time, max_postpones)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (routine_id, scheduled_date, scheduled_time) DO NOTHING
     RETURNING *`,
    [routine_id, user_id, scheduled_date, scheduled_time, max_postpones]
  );
  
  return result.rows[0];
};

/**
 * Получение напоминаний на дату
 * @param {number} userId - ID пользователя
 * @param {string} date - Дата (YYYY-MM-DD)
 */
export const getRemindersByDate = async (userId, date) => {
  const result = await query(
    `SELECT r.*, rt.title, rt.type, rt.icon, rt.dosage, rt.grace_period_minutes
     FROM reminders r
     JOIN routines rt ON r.routine_id = rt.routine_id
     WHERE r.user_id = $1 
     AND r.scheduled_date = $2
     AND rt.is_active = true
     ORDER BY r.scheduled_time`,
    [userId, date]
  );
  return result.rows;
};

/**
 * Получение ожидающих напоминаний для отправки
 * @param {string} time - Время (HH:MM)
 * @param {string} date - Дата (YYYY-MM-DD)
 */
export const getPendingReminders = async (time, date) => {
  const result = await query(
    `SELECT r.*, rt.title, rt.type, rt.icon, rt.dosage, rt.grace_period_minutes,
             u.timezone, u.quiet_hours_start, u.quiet_hours_end
     FROM reminders r
     JOIN routines rt ON r.routine_id = rt.routine_id
     JOIN users u ON r.user_id = u.user_id
     WHERE r.status = 'pending'
     AND r.scheduled_date = $1
     AND r.scheduled_time <= $2
     AND rt.is_active = true
     AND u.is_active = true
     AND u.onboarding_completed = true`,
    [date, time]
  );
  return result.rows;
};

/**
 * Обновление статуса напоминания
 * @param {string} reminderId - ID напоминания
 * @param {Object} updates - Поля для обновления
 */
export const updateReminder = async (reminderId, updates) => {
  const allowedFields = [
    'status', 'postpone_count', 'sent_at', 'completed_at',
    'confirmation_method', 'escalation_level', 'metadata'
  ];
  
  const setClauses = [];
  const values = [];
  let paramIndex = 1;
  
  Object.entries(updates).forEach(([key, value]) => {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  values.push(reminderId);
  
  const result = await query(
    `UPDATE reminders SET ${setClauses.join(', ')} 
     WHERE reminder_id = $${paramIndex} 
     RETURNING *`,
    values
  );
  
  return result.rows[0];
};

/**
 * Получение напоминания по ID
 * @param {string} reminderId - ID напоминания
 */
export const getReminderById = async (reminderId) => {
  const result = await query(
    `SELECT r.*, rt.title, rt.type, rt.icon, rt.dosage
     FROM reminders r
     JOIN routines rt ON r.routine_id = rt.routine_id
     WHERE r.reminder_id = $1`,
    [reminderId]
  );
  return result.rows[0] || null;
};

// ============================================
// СОБЫТИЯ
// ============================================

/**
 * Создание события
 * @param {Object} eventData - Данные события
 */
export const createEvent = async (eventData) => {
  const {
    reminder_id,
    user_id,
    routine_id,
    event_type,
    event_source = 'bot',
    metadata = {},
  } = eventData;
  
  const result = await query(
    `INSERT INTO events 
     (reminder_id, user_id, routine_id, event_type, event_source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [reminder_id, user_id, routine_id, event_type, event_source, JSON.stringify(metadata)]
  );
  
  return result.rows[0];
};

// ============================================
// ДОСТИЖЕНИЯ
// ============================================

/**
 * Создание достижения
 * @param {Object} achievementData - Данные достижения
 */
export const createAchievement = async (achievementData) => {
  const {
    user_id,
    badge_code,
    title,
    description,
    icon = '🏆',
    points = 0,
  } = achievementData;
  
  try {
    const result = await query(
      `INSERT INTO achievements 
       (user_id, badge_code, title, description, icon, points)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, badge_code) DO NOTHING
       RETURNING *`,
      [user_id, badge_code, title, description, icon, points]
    );
    
    if (result.rows.length > 0) {
      logger.info('Достижение получено', { userId: user_id, badge: badge_code });
    }
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Ошибка создания достижения:', error);
    return null;
  }
};

/**
 * Получение достижений пользователя
 * @param {number} userId - ID пользователя
 * @param {boolean} newOnly - Только новые
 */
export const getUserAchievements = async (userId, newOnly = false) => {
  let sql = 'SELECT * FROM achievements WHERE user_id = $1';
  const params = [userId];
  
  if (newOnly) {
    sql += ' AND is_new = true';
  }
  
  sql += ' ORDER BY achieved_at DESC';
  
  const result = await query(sql, params);
  return result.rows;
};

/**
 * Отметить достижения как просмотренные
 * @param {number} userId - ID пользователя
 */
export const markAchievementsAsSeen = async (userId) => {
  await query(
    'UPDATE achievements SET is_new = false WHERE user_id = $1',
    [userId]
  );
};

// ============================================
// ШАБЛОНЫ РУТИН
// ============================================

/**
 * Получение шаблонов рутин
 * @param {string} type - Тип рутины (habit, medication, task)
 * @param {boolean} popularOnly - Только популярные
 */
export const getRoutineTemplates = async (type = null, popularOnly = false) => {
  let sql = 'SELECT * FROM routine_templates WHERE 1=1';
  const params = [];
  let paramIndex = 1;
  
  if (type) {
    sql += ` AND type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }
  
  if (popularOnly) {
    sql += ' AND is_popular = true';
  }
  
  sql += ' ORDER BY is_popular DESC, title';
  
  const result = await query(sql, params);
  return result.rows;
};

// ============================================
// СТАТИСТИКА
// ============================================

/**
 * Получение статистики пользователя
 * @param {number} userId - ID пользователя
 */
export const getUserStats = async (userId) => {
  // Общая статистика
  const statsResult = await query(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
       COUNT(*) as total
     FROM reminders 
     WHERE user_id = $1`,
    [userId]
  );
  
  // Достижения
  const achievementsResult = await query(
    'SELECT COUNT(*) as count FROM achievements WHERE user_id = $1',
    [userId]
  );
  
  // Текущая серия
  const streakResult = await query(
    'SELECT current_streak, max_streak, level, points FROM users WHERE user_id = $1',
    [userId]
  );
  
  return {
    ...statsResult.rows[0],
    achievements: parseInt(achievementsResult.rows[0].count),
    ...streakResult.rows[0],
  };
};

export default {
  // Пользователи
  getOrCreateUser,
  getUserById,
  updateUser,
  softDeleteUser,
  // Рутины
  createRoutine,
  getUserRoutines,
  getRoutineById,
  updateRoutine,
  deleteRoutine,
  // Расписания
  createSchedule,
  getRoutineSchedules,
  // Напоминания
  createReminder,
  getRemindersByDate,
  getPendingReminders,
  updateReminder,
  getReminderById,
  // События
  createEvent,
  // Достижения
  createAchievement,
  getUserAchievements,
  markAchievementsAsSeen,
  // Шаблоны
  getRoutineTemplates,
  // Статистика
  getUserStats,
};
