-- HabitMax Database Schema
-- PostgreSQL 14+ с поддержкой UUID и JSONB
-- Соответствие 152-ФЗ и GDPR

-- Расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,                    -- ID из Max API
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
    quiet_hours_start TIME DEFAULT '23:00',
    quiet_hours_end TIME DEFAULT '08:00',
    
    -- GDPR / 152-ФЗ
    gdpr_consent BOOLEAN NOT NULL DEFAULT false,
    consent_date TIMESTAMP,
    privacy_version VARCHAR(10) DEFAULT '1.0',
    
    -- Статистика
    current_streak INT DEFAULT 0,
    max_streak INT DEFAULT 0,
    total_completed INT DEFAULT 0,
    total_skipped INT DEFAULT 0,
    level VARCHAR(20) DEFAULT 'novice',            -- novice, regular, pro, legend
    points INT DEFAULT 0,
    
    -- Состояние онбординга
    onboarding_state VARCHAR(50) DEFAULT 'START',
    onboarding_completed BOOLEAN DEFAULT false,
    
    -- Служебные поля
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP                           -- Soft delete
);

-- Индексы для users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);

-- ============================================
-- ТАБЛИЦА РУТИН (привычки/лекарства/дела)
-- ============================================
CREATE TABLE IF NOT EXISTS routines (
    routine_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    type VARCHAR(20) NOT NULL CHECK (type IN ('habit', 'medication', 'task')),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '⭐',
    
    -- Для лекарств
    dosage VARCHAR(50),
    medication_form VARCHAR(20),                   -- tablet, capsule, liquid, etc.
    
    -- Настройки
    is_active BOOLEAN DEFAULT true,
    grace_period_minutes INT DEFAULT 120,          -- окно выполнения
    priority INT DEFAULT 1,                        -- 1=низкий, 2=средний, 3=высокий (для лекарств)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Индексы для routines
CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_active ON routines(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_routines_type ON routines(user_id, type);

-- ============================================
-- ТАБЛИЦА РАСПИСАНИЙ
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
    schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    routine_id UUID NOT NULL REFERENCES routines(routine_id) ON DELETE CASCADE,
    
    schedule_type VARCHAR(20) NOT NULL CHECK (schedule_type IN ('daily', 'weekdays', 'weekends', 'custom')),
    
    -- Время для разных дней
    time_weekdays TIME,
    time_weekends TIME,
    
    -- Гибкие настройки
    custom_days JSONB,                             -- [1,3,5] для пн/ср/пт
    specific_times JSONB,                          -- ["08:00", "20:00"] для множественных приемов
    
    -- Дата окончания (опционально)
    end_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schedules_routine ON schedules(routine_id);

-- ============================================
-- ТАБЛИЦА НАПОМИНАНИЙ (генерируются на 30 дней вперед)
-- ============================================
CREATE TABLE IF NOT EXISTS reminders (
    reminder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    routine_id UUID NOT NULL REFERENCES routines(routine_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    
    -- Статус напоминания
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'skipped', 'postponed')),
    
    -- Отсрочки
    postpone_count INT DEFAULT 0,
    max_postpones INT DEFAULT 2,
    
    -- Временные метки
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    confirmation_method VARCHAR(20),               -- push, command, manual, auto
    
    -- Эскалация
    escalation_level INT DEFAULT 0,                -- 0: initial, 1: +15min, 2: +45min, 3: missed
    
    -- Метаданные
    metadata JSONB,                                -- дополнительная информация
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для reminders (критично для производительности)
CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON reminders(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(scheduled_date, scheduled_time, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(user_id, sent_at) WHERE status = 'sent';

-- ============================================
-- ТАБЛИЦА СОБЫТИЙ (аудит)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reminder_id UUID REFERENCES reminders(reminder_id),
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    routine_id UUID REFERENCES routines(routine_id),
    
    event_type VARCHAR(20) NOT NULL,               -- completed, skipped, snoozed, rescheduled, created, etc.
    event_source VARCHAR(20) DEFAULT 'bot',        -- bot, miniapp, api, system
    
    metadata JSONB,                                -- контекст события
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(created_at);

-- ============================================
-- ТАБЛИЦА ДОСТИЖЕНИЙ (геймификация)
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
    achievement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    badge_code VARCHAR(50) NOT NULL,               -- streak_7, perfect_week, medication_master
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '🏆',
    
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_new BOOLEAN DEFAULT true,
    points INT DEFAULT 0,
    
    -- Уникальность достижения на пользователя
    UNIQUE(user_id, badge_code)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_new ON achievements(user_id, is_new) WHERE is_new = true;

-- ============================================
-- ТАБЛИЦА СЕССИЙ (для мини-приложения)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255),
    
    expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP,
    
    ip_address INET,
    user_agent TEXT,
    
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_revoked) WHERE is_revoked = false;

-- ============================================
-- ТАБЛИЦА ЭКСПОРТОВ ДАННЫХ (GDPR)
-- ============================================
CREATE TABLE IF NOT EXISTS data_exports (
    export_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    format VARCHAR(10) NOT NULL,                   -- json, csv
    status VARCHAR(20) DEFAULT 'pending',          -- pending, processing, ready, expired
    
    file_path VARCHAR(500),
    file_size BIGINT,
    expires_at TIMESTAMP,
    
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exports_user ON data_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON data_exports(status);

-- ============================================
-- ТАБЛИЦА УВЕДОМЛЕНИЙ
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    type VARCHAR(50) NOT NULL,                     -- achievement, reminder, system
    title VARCHAR(200) NOT NULL,
    message TEXT,
    
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    action_url VARCHAR(500),
    action_text VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read) WHERE is_read = false;

-- ============================================
-- ФУНКЦИИ И ТРИГГЕРЫ
-- ============================================

-- Обновление поля updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routines_updated_at BEFORE UPDATE ON routines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ФУНКЦИЯ РАСЧЕТА STREAK
-- ============================================
CREATE OR REPLACE FUNCTION calculate_streak(p_user_id BIGINT)
RETURNS TABLE(current_streak INT, max_streak INT) AS $$
DECLARE
    v_current_streak INT := 0;
    v_max_streak INT := 0;
    v_last_date DATE := CURRENT_DATE;
    rec RECORD;
BEGIN
    -- Подсчет текущей серии (последовательных дней с выполнением)
    FOR rec IN 
        SELECT DISTINCT scheduled_date
        FROM reminders
        WHERE user_id = p_user_id 
          AND status = 'completed'
          AND scheduled_date <= CURRENT_DATE
        ORDER BY scheduled_date DESC
    LOOP
        IF rec.scheduled_date = v_last_date OR 
           rec.scheduled_date = v_last_date - INTERVAL '1 day' THEN
            v_current_streak := v_current_streak + 1;
            v_last_date := rec.scheduled_date;
        ELSE
            EXIT;
        END IF;
    END LOOP;
    
    -- Подсчет максимальной серии
    SELECT COALESCE(MAX(streak), 0) INTO v_max_streak
    FROM (
        SELECT COUNT(*) as streak
        FROM (
            SELECT scheduled_date,
                   scheduled_date - (ROW_NUMBER() OVER (ORDER BY scheduled_date))::int AS grp
            FROM (
                SELECT DISTINCT scheduled_date
                FROM reminders
                WHERE user_id = p_user_id AND status = 'completed'
            ) s
        ) grouped
        GROUP BY grp
    ) streaks;
    
    RETURN QUERY SELECT v_current_streak, v_max_streak;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ФУНКЦИЯ ПРОВЕРКИ ДОСТИЖЕНИЙ
-- ============================================
CREATE OR REPLACE FUNCTION check_achievements(p_user_id BIGINT)
RETURNS TABLE(achievement_code VARCHAR, title VARCHAR, points INT) AS $$
DECLARE
    v_streak INT;
    v_max_streak INT;
    v_total_completed INT;
    v_medication_streak INT;
BEGIN
    -- Получение текущей серии
    SELECT (calculate_streak(p_user_id)).* INTO v_streak, v_max_streak;
    
    -- Получение общего количества выполнений
    SELECT total_completed INTO v_total_completed
    FROM users WHERE user_id = p_user_id;
    
    -- Достижение: 3 дня подряд
    IF v_streak >= 3 AND NOT EXISTS (
        SELECT 1 FROM achievements 
        WHERE user_id = p_user_id AND badge_code = 'streak_3'
    ) THEN
        RETURN QUERY SELECT 'streak_3'::VARCHAR, 'Новичок'::VARCHAR, 10::INT;
    END IF;
    
    -- Достижение: 7 дней подряд
    IF v_streak >= 7 AND NOT EXISTS (
        SELECT 1 FROM achievements 
        WHERE user_id = p_user_id AND badge_code = 'streak_7'
    ) THEN
        RETURN QUERY SELECT 'streak_7'::VARCHAR, 'Недельный чемпион'::VARCHAR, 25::INT;
    END IF;
    
    -- Достижение: 30 дней подряд
    IF v_streak >= 30 AND NOT EXISTS (
        SELECT 1 FROM achievements 
        WHERE user_id = p_user_id AND badge_code = 'streak_30'
    ) THEN
        RETURN QUERY SELECT 'streak_30'::VARCHAR, 'Месяц дисциплины'::VARCHAR, 100::INT;
    END IF;
    
    -- Достижение: 100 выполнений
    IF v_total_completed >= 100 AND NOT EXISTS (
        SELECT 1 FROM achievements 
        WHERE user_id = p_user_id AND badge_code = 'century'
    ) THEN
        RETURN QUERY SELECT 'century'::VARCHAR, 'Сотня'::VARCHAR, 50::INT;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================

-- Шаблоны рутин для быстрого создания
CREATE TABLE IF NOT EXISTS routine_templates (
    template_id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '⭐',
    dosage VARCHAR(50),
    default_time TIME,
    is_popular BOOLEAN DEFAULT false
);

-- Наполнение шаблонов
INSERT INTO routine_templates (type, title, description, icon, dosage, default_time, is_popular) VALUES
-- Лекарства
('medication', 'Витамин D', 'Ежедневный прием витамина D', '💊', '2000 МЕ', '08:00', true),
('medication', 'Магний', 'Магний B6 для нервной системы', '💊', '500 мг', '20:00', true),
('medication', 'Омега-3', 'Рыбий жир для сердца и мозга', '🐟', '1000 мг', '08:00', true),
('medication', 'Витамин C', 'Аскорбиновая кислота', '🍊', '1000 мг', '08:00', false),
-- Привычки
('habit', 'Стакан воды', 'Начни день со стакана воды', '💧', NULL, '07:00', true),
('habit', 'Утренняя зарядка', '10 минут упражнений', '🏃', NULL, '07:30', true),
('habit', 'Медитация', '10 минут осознанности', '🧘', NULL, '08:00', true),
('habit', 'Чтение', '30 минут чтения', '📚', NULL, '21:00', true),
('habit', 'Планирование дня', 'Запиши 3 главных дела', '📝', NULL, '08:30', false),
-- Дела
('task', 'Принять душ', 'Утренний душ для бодрости', '🚿', NULL, '07:00', false),
('task', 'Сделать зарядку', 'Физические упражнения', '💪', NULL, '07:30', false),
('task', 'Позавтракать', 'Полноценный завтрак', '🍳', NULL, '08:00', false)
ON CONFLICT DO NOTHING;

-- ============================================
-- КОММЕНТАРИИ К ТАБЛИЦАМ (документация)
-- ============================================

COMMENT ON TABLE users IS 'Пользователи бота (GDPR-compliant)';
COMMENT ON TABLE routines IS 'Рутины пользователей (привычки, лекарства, дела)';
COMMENT ON TABLE schedules IS 'Расписания выполнения рутин';
COMMENT ON TABLE reminders IS 'Экземпляры напоминаний';
COMMENT ON TABLE events IS 'Аудит событий для аналитики';
COMMENT ON TABLE achievements IS 'Достижения пользователей (геймификация)';
COMMENT ON TABLE sessions IS 'JWT сессии для мини-приложения';
COMMENT ON TABLE data_exports IS 'Запросы на экспорт данных (GDPR)';
