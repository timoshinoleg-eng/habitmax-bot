/**
 * Сервис геймификации
 * Расчет streak'ов, достижений, уровней
 * @module services/gamificationService
 */

import { query } from '../config/database.js';
import { logger } from '../config/logger.js';
import * as db from './databaseService.js';

/**
 * Уровни пользователей
 */
const LEVELS = {
  novice: { name: 'Новичок', minPoints: 0, icon: '🌱' },
  regular: { name: 'Постоянный', minPoints: 100, icon: '🌿' },
  pro: { name: 'Профи', minPoints: 500, icon: '🌳' },
  legend: { name: 'Легенда', minPoints: 1000, icon: '👑' },
};

/**
 * Определение уровня по очкам
 * @param {number} points - Количество очков
 */
export const getLevelByPoints = (points) => {
  if (points >= LEVELS.legend.minPoints) return 'legend';
  if (points >= LEVELS.pro.minPoints) return 'pro';
  if (points >= LEVELS.regular.minPoints) return 'regular';
  return 'novice';
};

/**
 * Получение информации об уровне
 * @param {string} levelCode - Код уровня
 */
export const getLevelInfo = (levelCode) => {
  return LEVELS[levelCode] || LEVELS.novice;
};

/**
 * Расчет текущей серии (streak) пользователя
 * @param {number} userId - ID пользователя
 */
export const calculateStreak = async (userId) => {
  try {
    const result = await query(
      `SELECT * FROM calculate_streak($1)`,
      [userId]
    );
    
    return {
      current: result.rows[0]?.current_streak || 0,
      max: result.rows[0]?.max_streak || 0,
    };
  } catch (error) {
    logger.error('Ошибка расчета streak:', error);
    return { current: 0, max: 0 };
  }
};

/**
 * Обновление streak пользователя
 * @param {number} userId - ID пользователя
 */
export const updateUserStreak = async (userId) => {
  try {
    const streak = await calculateStreak(userId);
    
    // Получаем текущий max_streak
    const userResult = await query(
      'SELECT max_streak FROM users WHERE user_id = $1',
      [userId]
    );
    
    const currentMax = userResult.rows[0]?.max_streak || 0;
    const newMax = Math.max(currentMax, streak.current);
    
    await query(
      `UPDATE users 
       SET current_streak = $1, 
           max_streak = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3`,
      [streak.current, newMax, userId]
    );
    
    logger.debug('Streak обновлен', { userId, streak: streak.current, max: newMax });
    
    return { ...streak, max: newMax };
  } catch (error) {
    logger.error('Ошибка обновления streak:', error);
    return { current: 0, max: 0 };
  }
};

/**
 * Проверка и начисление достижений
 * @param {number} userId - ID пользователя
 * @param {string} eventType - Тип события
 * @param {Object} context - Контекст события
 */
export const checkAchievements = async (userId, eventType, context = {}) => {
  const newAchievements = [];
  
  try {
    // Получаем текущую статистику пользователя
    const userResult = await query(
      'SELECT current_streak, total_completed, total_skipped FROM users WHERE user_id = $1',
      [userId]
    );
    
    const user = userResult.rows[0];
    if (!user) return newAchievements;
    
    // Достижение: 3 дня подряд
    if (user.current_streak >= 3) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'streak_3',
        title: 'Новичок',
        description: '3 дня подряд без пропусков',
        icon: '🥉',
        points: 10,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: 7 дней подряд
    if (user.current_streak >= 7) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'streak_7',
        title: 'Недельный чемпион',
        description: '7 дней подряд без пропусков',
        icon: '🥈',
        points: 25,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: 30 дней подряд
    if (user.current_streak >= 30) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'streak_30',
        title: 'Месяц дисциплины',
        description: '30 дней подряд без пропусков',
        icon: '🥇',
        points: 100,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: 100 выполнений
    if (user.total_completed >= 100) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'century',
        title: 'Сотня',
        description: '100 выполненных рутин',
        icon: '💯',
        points: 50,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: 500 выполнений
    if (user.total_completed >= 500) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'five_hundred',
        title: 'Полтысячи',
        description: '500 выполненных рутин',
        icon: '🏆',
        points: 200,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: Ранняя пташка (выполнено до 08:00)
    if (eventType === 'completed' && context.hour && context.hour < 8) {
      const achievement = await db.createAchievement({
        user_id: userId,
        badge_code: 'early_bird',
        title: 'Ранняя пташка',
        description: 'Выполнено до 08:00',
        icon: '🐦',
        points: 5,
      });
      if (achievement) newAchievements.push(achievement);
    }
    
    // Достижение: Идеальная неделя (проверяем отдельно)
    if (eventType === 'completed') {
      const perfectWeek = await checkPerfectWeek(userId);
      if (perfectWeek) {
        const achievement = await db.createAchievement({
          user_id: userId,
          badge_code: 'perfect_week',
          title: 'Идеальная неделя',
          description: '100% выполнение за неделю',
          icon: '⭐',
          points: 50,
        });
        if (achievement) newAchievements.push(achievement);
      }
    }
    
    // Достижение: Мастер лекарств (50 лекарств подряд)
    if (context.routineType === 'medication') {
      const medStreak = await checkMedicationStreak(userId);
      if (medStreak >= 50) {
        const achievement = await db.createAchievement({
          user_id: userId,
          badge_code: 'medication_master',
          title: 'Мастер лекарств',
          description: '50 лекарств подряд без пропусков',
          icon: '💊',
          points: 75,
        });
        if (achievement) newAchievements.push(achievement);
      }
    }
    
    // Начисление очков и обновление уровня
    if (newAchievements.length > 0) {
      const totalPoints = newAchievements.reduce((sum, a) => sum + a.points, 0);
      await addPoints(userId, totalPoints);
    }
    
    return newAchievements;
    
  } catch (error) {
    logger.error('Ошибка проверки достижений:', error);
    return [];
  }
};

/**
 * Проверка идеальной недели
 * @param {number} userId - ID пользователя
 */
const checkPerfectWeek = async (userId) => {
  try {
    const result = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) as total
       FROM reminders 
       WHERE user_id = $1 
       AND scheduled_date >= CURRENT_DATE - INTERVAL '7 days'
       AND scheduled_date < CURRENT_DATE`,
      [userId]
    );
    
    const { completed, total } = result.rows[0];
    return total > 0 && completed === total;
  } catch (error) {
    logger.error('Ошибка проверки идеальной недели:', error);
    return false;
  }
};

/**
 * Проверка серии лекарств
 * @param {number} userId - ID пользователя
 */
const checkMedicationStreak = async (userId) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as streak
       FROM reminders r
       JOIN routines rt ON r.routine_id = rt.routine_id
       WHERE r.user_id = $1 
       AND rt.type = 'medication'
       AND r.status = 'completed'
       AND r.scheduled_date > CURRENT_DATE - INTERVAL '60 days'`,
      [userId]
    );
    
    return parseInt(result.rows[0]?.streak || 0);
  } catch (error) {
    logger.error('Ошибка проверки серии лекарств:', error);
    return 0;
  }
};

/**
 * Начисление очков пользователю
 * @param {number} userId - ID пользователя
 * @param {number} points - Количество очков
 */
export const addPoints = async (userId, points) => {
  try {
    const result = await query(
      `UPDATE users 
       SET points = points + $1,
           level = CASE 
             WHEN points >= 1000 THEN 'legend'
             WHEN points >= 500 THEN 'pro'
             WHEN points >= 100 THEN 'regular'
             ELSE 'novice'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING points, level`,
      [points, userId]
    );
    
    logger.debug('Очки начислены', { userId, points, total: result.rows[0]?.points });
    
    return result.rows[0];
  } catch (error) {
    logger.error('Ошибка начисления очков:', error);
    return null;
  }
};

/**
 * Обновление статистики при выполнении рутины
 * @param {number} userId - ID пользователя
 * @param {string} reminderId - ID напоминания
 * @param {string} routineType - Тип рутины
 */
export const handleCompletion = async (userId, reminderId, routineType) => {
  try {
    // Увеличиваем счетчик выполнений
    await query(
      `UPDATE users 
       SET total_completed = total_completed + 1,
           last_active = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
    
    // Обновляем streak
    const streak = await updateUserStreak(userId);
    
    // Проверяем достижения
    const now = new Date();
    const achievements = await checkAchievements(userId, 'completed', {
      routineType,
      hour: now.getHours(),
    });
    
    // Начисляем базовые очки за выполнение
    const basePoints = routineType === 'medication' ? 5 : 3;
    await addPoints(userId, basePoints);
    
    return {
      streak,
      achievements,
      points: basePoints,
    };
  } catch (error) {
    logger.error('Ошибка обработки выполнения:', error);
    return { streak: { current: 0, max: 0 }, achievements: [], points: 0 };
  }
};

/**
 * Обработка пропуска рутины
 * @param {number} userId - ID пользователя
 */
export const handleSkip = async (userId) => {
  try {
    // Увеличиваем счетчик пропусков
    await query(
      `UPDATE users 
       SET total_skipped = total_skipped + 1,
           current_streak = 0,  // Сбрасываем streak
           last_active = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
    
    logger.debug('Пропуск обработан', { userId });
    
    return { streakReset: true };
  } catch (error) {
    logger.error('Ошибка обработки пропуска:', error);
    return { streakReset: false };
  }
};

/**
 * Получение прогресса к следующему уровню
 * @param {number} userId - ID пользователя
 */
export const getLevelProgress = async (userId) => {
  try {
    const result = await query(
      'SELECT points, level FROM users WHERE user_id = $1',
      [userId]
    );
    
    const { points, level } = result.rows[0];
    const levelInfo = getLevelInfo(level);
    
    // Определяем очки для следующего уровня
    const nextLevelPoints = {
      novice: LEVELS.regular.minPoints,
      regular: LEVELS.pro.minPoints,
      pro: LEVELS.legend.minPoints,
      legend: null, // Максимальный уровень
    }[level];
    
    if (!nextLevelPoints) {
      return {
        current: points,
        next: null,
        progress: 100,
        isMaxLevel: true,
      };
    }
    
    const prevLevelPoints = levelInfo.minPoints;
    const progress = Math.min(100, Math.round(
      ((points - prevLevelPoints) / (nextLevelPoints - prevLevelPoints)) * 100
    ));
    
    return {
      current: points,
      next: nextLevelPoints,
      progress,
      isMaxLevel: false,
    };
  } catch (error) {
    logger.error('Ошибка получения прогресса уровня:', error);
    return { current: 0, next: 100, progress: 0, isMaxLevel: false };
  }
};

/**
 * Получение лидерборда (топ пользователей)
 * @param {number} limit - Количество пользователей
 */
export const getLeaderboard = async (limit = 10) => {
  try {
    const result = await query(
      `SELECT user_id, username, first_name, level, points, current_streak, total_completed
       FROM users 
       WHERE is_active = true AND onboarding_completed = true
       ORDER BY points DESC, total_completed DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    logger.error('Ошибка получения лидерборда:', error);
    return [];
  }
};

export default {
  LEVELS,
  getLevelByPoints,
  getLevelInfo,
  calculateStreak,
  updateUserStreak,
  checkAchievements,
  addPoints,
  handleCompletion,
  handleSkip,
  getLevelProgress,
  getLeaderboard,
};
