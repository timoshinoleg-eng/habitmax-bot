/**
 * Тесты для геймификации
 * @module tests/gamification
 */

import { describe, it, expect } from '@jest/globals';
import * as gamification from '../src/services/gamificationService.js';

describe('Gamification', () => {
  describe('Level system', () => {
    it('should return novice for 0-99 points', () => {
      expect(gamification.getLevelByPoints(0)).toBe('novice');
      expect(gamification.getLevelByPoints(50)).toBe('novice');
      expect(gamification.getLevelByPoints(99)).toBe('novice');
    });

    it('should return regular for 100-499 points', () => {
      expect(gamification.getLevelByPoints(100)).toBe('regular');
      expect(gamification.getLevelByPoints(250)).toBe('regular');
      expect(gamification.getLevelByPoints(499)).toBe('regular');
    });

    it('should return pro for 500-999 points', () => {
      expect(gamification.getLevelByPoints(500)).toBe('pro');
      expect(gamification.getLevelByPoints(750)).toBe('pro');
      expect(gamification.getLevelByPoints(999)).toBe('pro');
    });

    it('should return legend for 1000+ points', () => {
      expect(gamification.getLevelByPoints(1000)).toBe('legend');
      expect(gamification.getLevelByPoints(5000)).toBe('legend');
    });

    it('should return level info with correct properties', () => {
      const novice = gamification.getLevelInfo('novice');
      expect(novice).toHaveProperty('name');
      expect(novice).toHaveProperty('minPoints');
      expect(novice).toHaveProperty('icon');
    });
  });

  describe('Streak calculation', () => {
    it('should calculate streak correctly', async () => {
      // Мокаем query
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ current_streak: 5, max_streak: 10 }]
        });

      const streak = await gamification.calculateStreak(123);
      
      expect(streak.current).toBe(5);
      expect(streak.max).toBe(10);
    });

    it('should handle empty streak', async () => {
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ current_streak: 0, max_streak: 0 }]
        });

      const streak = await gamification.calculateStreak(123);
      
      expect(streak.current).toBe(0);
      expect(streak.max).toBe(0);
    });
  });

  describe('Achievement checking', () => {
    it('should award streak_3 for 3 day streak', async () => {
      // Мокаем данные пользователя
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ current_streak: 3, total_completed: 10, total_skipped: 0 }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Нет существующего достижения

      const achievements = await gamification.checkAchievements(123, 'completed');
      
      // Должно быть создано достижение streak_3
      expect(achievements.length).toBeGreaterThan(0);
    });

    it('should award century for 100 completions', async () => {
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ current_streak: 1, total_completed: 100, total_skipped: 0 }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const achievements = await gamification.checkAchievements(123, 'completed');
      
      expect(achievements.some(a => a?.badge_code === 'century')).toBeTruthy();
    });
  });

  describe('Points calculation', () => {
    it('should add points correctly', async () => {
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ points: 50, level: 'novice' }]
        });

      const result = await gamification.addPoints(123, 25);
      
      expect(result).toBeDefined();
    });
  });

  describe('Level progress', () => {
    it('should calculate progress to next level', async () => {
      // Novice с 50 очками (нужно 100 до Regular)
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ points: 50, level: 'novice' }]
        });

      const progress = await gamification.getLevelProgress(123);
      
      expect(progress.current).toBe(50);
      expect(progress.next).toBe(100);
      expect(progress.progress).toBe(50); // 50%
      expect(progress.isMaxLevel).toBe(false);
    });

    it('should return 100% for legend level', async () => {
      jest.spyOn(await import('../src/config/database.js'), 'query')
        .mockResolvedValueOnce({
          rows: [{ points: 1500, level: 'legend' }]
        });

      const progress = await gamification.getLevelProgress(123);
      
      expect(progress.progress).toBe(100);
      expect(progress.isMaxLevel).toBe(true);
    });
  });
});

describe('Completion handling', () => {
  it('should handle medication completion', async () => {
    const mockQuery = jest.spyOn(await import('../src/config/database.js'), 'query')
      .mockResolvedValue({ rows: [] });

    const result = await gamification.handleCompletion(123, 'reminder-1', 'medication');
    
    expect(result).toHaveProperty('streak');
    expect(result).toHaveProperty('achievements');
    expect(result).toHaveProperty('points');
    
    // Медикаменты дают больше очков
    expect(result.points).toBeGreaterThanOrEqual(5);
  });

  it('should handle habit completion', async () => {
    const result = await gamification.handleCompletion(123, 'reminder-1', 'habit');
    
    // Привычки дают меньше очков
    expect(result.points).toBeGreaterThanOrEqual(3);
  });

  it('should reset streak on skip', async () => {
    const result = await gamification.handleSkip(123);
    
    expect(result.streakReset).toBe(true);
  });
});

describe('Early bird achievement', () => {
  it('should award early bird for completion before 8am', async () => {
    jest.spyOn(await import('../src/config/database.js'), 'query')
      .mockResolvedValueOnce({
        rows: [{ current_streak: 1, total_completed: 1, total_skipped: 0 }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const achievements = await gamification.checkAchievements(123, 'completed', { hour: 7 });
    
    expect(achievements.some(a => a?.badge_code === 'early_bird')).toBeTruthy();
  });

  it('should not award early bird after 8am', async () => {
    jest.spyOn(await import('../src/config/database.js'), 'query')
      .mockResolvedValueOnce({
        rows: [{ current_streak: 1, total_completed: 1, total_skipped: 0 }]
      });

    const achievements = await gamification.checkAchievements(123, 'completed', { hour: 9 });
    
    expect(achievements.some(a => a?.badge_code === 'early_bird')).toBeFalsy();
  });
});
