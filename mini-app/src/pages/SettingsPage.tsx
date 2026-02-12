import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MaxUI, Panel, Typography, Button, Switch, Select } from '@maxhub/max-ui';
import { settingsApi } from '../api/client';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';

interface Settings {
  timezone: string;
  quietHours: {
    start: string;
    end: string;
  };
  notifications: boolean;
}

const timezones = [
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
];

const timeOptions = [
  '20:00', '21:00', '22:00', '23:00', '00:00',
  '05:00', '06:00', '07:00', '08:00', '09:00', '10:00',
];

const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { theme, setTheme, toggleTheme } = useThemeStore();
  const { clearAuth } = useAuthStore();
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data, isLoading } = useQuery<Settings>(
    'settings',
    () => settingsApi.get().then((res) => res.data.data),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const updateMutation = useMutation(
    (newSettings: Partial<Settings>) => settingsApi.update(newSettings),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('settings');
      },
    }
  );

  const handleTimezoneChange = (timezone: string) => {
    updateMutation.mutate({ timezone });
  };

  const handleQuietHoursChange = (type: 'start' | 'end', value: string) => {
    const currentQuietHours = data?.quietHours || { start: '23:00', end: '08:00' };
    updateMutation.mutate({
      quietHours: {
        ...currentQuietHours,
        [type]: value,
      },
    });
  };

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/auth';
  };

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ height: '50vh' }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Typography variant="header" style={{ marginBottom: 20 }}>
        Настройки
      </Typography>

      {/* Appearance */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Внешний вид
        </Typography>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Typography variant="body">Тёмная тема</Typography>
            <Typography variant="caption" color="secondary">
              {theme === 'auto' ? 'Автоматически' : theme === 'dark' ? 'Включена' : 'Выключена'}
            </Typography>
          </div>
          <Switch
            checked={theme === 'dark'}
            onChange={toggleTheme}
          />
        </div>
      </Panel>

      {/* Timezone */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Часовой пояс
        </Typography>
        <Select
          value={data?.timezone || 'Europe/Moscow'}
          onChange={(value) => handleTimezoneChange(value)}
          options={timezones}
          block
        />
      </Panel>

      {/* Quiet Hours */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Тихие часы
        </Typography>
        <Typography variant="caption" color="secondary" style={{ marginBottom: 12, display: 'block' }}>
          В это время напоминания не будут приходить
        </Typography>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Typography variant="caption" color="secondary">
              Начало
            </Typography>
            <Select
              value={data?.quietHours?.start || '23:00'}
              onChange={(value) => handleQuietHoursChange('start', value)}
              options={timeOptions.map((t) => ({ value: t, label: t }))}
              block
            />
          </div>
          <Typography variant="body">—</Typography>
          <div style={{ flex: 1 }}>
            <Typography variant="caption" color="secondary">
              Конец
            </Typography>
            <Select
              value={data?.quietHours?.end || '08:00'}
              onChange={(value) => handleQuietHoursChange('end', value)}
              options={timeOptions.map((t) => ({ value: t, label: t }))}
              block
            />
          </div>
        </div>
      </Panel>

      {/* Data Export */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Данные
        </Typography>
        <Button
          variant="secondary"
          size="medium"
          block
          style={{ marginBottom: 8 }}
          onClick={() => {
            // TODO: Реализовать экспорт
            alert('Функция в разработке');
          }}
        >
          📤 Экспорт данных (GDPR)
        </Button>
        <Typography variant="caption" color="secondary">
          Скачать все ваши данные в формате JSON
        </Typography>
      </Panel>

      {/* About */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          О приложении
        </Typography>
        <div style={{ marginBottom: 8 }}>
          <Typography variant="body">HabitMax</Typography>
          <Typography variant="caption" color="secondary">
            Версия 1.0.0
          </Typography>
        </div>
        <Typography variant="caption" color="secondary">
          Помощник для формирования привычек и напоминаний о приёме лекарств.
        </Typography>
        <div style={{ marginTop: 12 }}>
          <a
            href="https://habitmax.ru/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--max-primary)', fontSize: 13 }}
          >
            Политика конфиденциальности
          </a>
        </div>
      </Panel>

      {/* Logout */}
      <Button
        variant="secondary"
        size="large"
        block
        style={{ marginBottom: 16 }}
        onClick={handleLogout}
      >
        🚪 Выйти
      </Button>

      {/* Delete Account */}
      {!showDeleteConfirm ? (
        <Button
          variant="danger"
          size="large"
          block
          onClick={() => setShowDeleteConfirm(true)}
        >
          🗑 Удалить аккаунт
        </Button>
      ) : (
        <Panel style={{ border: '2px solid var(--max-danger)' }}>
          <Typography variant="body" color="danger" style={{ marginBottom: 12 }}>
            ⚠️ Вы уверены? Это действие необратимо!
          </Typography>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button
              variant="danger"
              size="medium"
              style={{ flex: 1 }}
              onClick={() => {
                // TODO: Реализовать удаление
                alert('Функция в разработке');
                setShowDeleteConfirm(false);
              }}
            >
              Да, удалить
            </Button>
            <Button
              variant="secondary"
              size="medium"
              style={{ flex: 1 }}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Отмена
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default SettingsPage;
