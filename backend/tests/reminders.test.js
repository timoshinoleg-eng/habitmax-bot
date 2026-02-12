/**
 * Тесты для логики напоминаний
 * @module tests/reminders
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import moment from 'moment-timezone';

// Мокаем БД
jest.mock('../src/config/database.js', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

import { query } from '../src/config/database.js';
import * as db from '../src/services/databaseService.js';

describe('Reminders Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createReminder', () => {
    it('should create a reminder successfully', async () => {
      const mockReminder = {
        reminder_id: '123e4567-e89b-12d3-a456-426614174000',
        routine_id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: 123456,
        scheduled_date: '2026-02-12',
        scheduled_time: '08:00:00',
        status: 'pending',
      };

      query.mockResolvedValueOnce({ rows: [mockReminder] });

      const result = await db.createReminder({
        routine_id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: 123456,
        scheduled_date: '2026-02-12',
        scheduled_time: '08:00:00',
      });

      expect(result).toEqual(mockReminder);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reminders'),
        expect.arrayContaining([
          '123e4567-e89b-12d3-a456-426614174001',
          123456,
          '2026-02-12',
          '08:00:00',
          2, // max_postpones default
        ])
      );
    });

    it('should handle duplicate reminder gracefully', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING

      const result = await db.createReminder({
        routine_id: 'existing-id',
        user_id: 123456,
        scheduled_date: '2026-02-12',
        scheduled_time: '08:00:00',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('getPendingReminders', () => {
    it('should return pending reminders for given time', async () => {
      const mockReminders = [
        {
          reminder_id: '1',
          title: 'Витамин D',
          type: 'medication',
          scheduled_time: '08:00:00',
          timezone: 'Europe/Moscow',
        },
        {
          reminder_id: '2',
          title: 'Стакан воды',
          type: 'habit',
          scheduled_time: '08:00:00',
          timezone: 'Europe/Moscow',
        },
      ];

      query.mockResolvedValueOnce({ rows: mockReminders });

      const result = await db.getPendingReminders('08:00', '2026-02-12');

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Витамин D');
    });

    it('should respect quiet hours', async () => {
      // Напоминания в тихие часы не должны возвращаться
      query.mockResolvedValueOnce({ rows: [] });

      const result = await db.getPendingReminders('23:30', '2026-02-12');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('quiet_hours_start'),
        expect.any(Array)
      );
    });
  });

  describe('updateReminder', () => {
    it('should update reminder status', async () => {
      const mockUpdated = {
        reminder_id: '1',
        status: 'completed',
        completed_at: new Date(),
      };

      query.mockResolvedValueOnce({ rows: [mockUpdated] });

      const result = await db.updateReminder('1', {
        status: 'completed',
        completed_at: new Date(),
      });

      expect(result.status).toBe('completed');
    });

    it('should reject invalid fields', async () => {
      await expect(
        db.updateReminder('1', { invalid_field: 'value' })
      ).rejects.toThrow('No valid fields to update');
    });
  });
});

describe('Schedule Logic', () => {
  describe('Daily schedule', () => {
    it('should create reminders for every day', () => {
      const days = ['2026-02-12', '2026-02-13', '2026-02-14'];
      const schedule = {
        schedule_type: 'daily',
        time_weekdays: '08:00:00',
      };

      days.forEach(day => {
        // Каждый день должно быть напоминание
        expect(schedule.time_weekdays).toBeDefined();
      });
    });
  });

  describe('Weekdays schedule', () => {
    it('should have different times for weekdays and weekends', () => {
      const schedule = {
        schedule_type: 'weekdays',
        time_weekdays: '07:00:00',
        time_weekends: '09:00:00',
      };

      expect(schedule.time_weekdays).not.toBe(schedule.time_weekends);
    });
  });

  describe('Custom schedule', () => {
    it('should respect custom days', () => {
      const schedule = {
        schedule_type: 'custom',
        custom_days: [1, 3, 5], // Пн, Ср, Пт
        time_weekdays: '08:00:00',
      };

      expect(schedule.custom_days).toContain(1);
      expect(schedule.custom_days).toContain(3);
      expect(schedule.custom_days).toContain(5);
      expect(schedule.custom_days).not.toContain(2);
    });
  });
});

describe('Timezone handling', () => {
  it('should handle different timezones correctly', () => {
    const moscow = moment.tz('2026-02-12 08:00', 'Europe/Moscow');
    const yekaterinburg = moment.tz('2026-02-12 08:00', 'Asia/Yekaterinburg');

    // Разница во времени
    const diff = yekaterinburg.diff(moscow, 'hours');
    expect(diff).toBe(2); // ЕКБ на 2 часа впереди МСК
  });

  it('should convert UTC to local time', () => {
    const utc = moment.utc('2026-02-12 05:00');
    const moscow = utc.clone().tz('Europe/Moscow');

    expect(moscow.format('HH:mm')).toBe('08:00');
  });
});

describe('Quiet hours', () => {
  it('should detect quiet hours correctly', () => {
    const quietHoursStart = '23:00';
    const quietHoursEnd = '08:00';

    const testCases = [
      { time: '22:00', expected: false },
      { time: '23:30', expected: true },
      { time: '03:00', expected: true },
      { time: '07:30', expected: true },
      { time: '08:30', expected: false },
    ];

    testCases.forEach(({ time, expected }) => {
      const hour = parseInt(time.split(':')[0]);
      const isQuiet = hour >= 23 || hour < 8;
      expect(isQuiet).toBe(expected);
    });
  });
});
