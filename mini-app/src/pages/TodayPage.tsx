import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MaxUI, Panel, Button, Typography, Progress } from '@maxhub/max-ui';
import { remindersApi } from '../api/client';
import RoutineCard from '../components/RoutineCard';
import ProgressBar from '../components/ProgressBar';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Reminder {
  id: string;
  routineId: string;
  title: string;
  type: 'habit' | 'medication' | 'task';
  icon: string;
  dosage?: string;
  time: string;
  status: 'pending' | 'sent' | 'completed' | 'skipped' | 'postponed';
  canPostpone: boolean;
}

const TodayPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [completingId, setCompletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery(
    'todayReminders',
    () => remindersApi.getToday().then((res) => res.data.data),
    {
      refetchInterval: 60000, // Обновляем каждую минуту
    }
  );

  const completeMutation = useMutation(
    (id: string) => remindersApi.complete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('todayReminders');
        queryClient.invalidateQueries('stats');
        setCompletingId(null);
      },
    }
  );

  const postponeMutation = useMutation(
    ({ id, minutes }: { id: string; minutes: number }) =>
      remindersApi.postpone(id, minutes),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('todayReminders');
      },
    }
  );

  const handleComplete = (id: string) => {
    setCompletingId(id);
    completeMutation.mutate(id);
  };

  const handlePostpone = (id: string) => {
    postponeMutation.mutate({ id, minutes: 15 });
  };

  const reminders: Reminder[] = data || [];
  const completedCount = reminders.filter((r) => r.status === 'completed').length;
  const totalCount = reminders.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const today = new Date();
  const dateString = format(today, 'd MMMM, EEEE', { locale: ru });

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ height: '50vh' }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <Panel>
          <Typography variant="body" color="danger">
            Ошибка загрузки данных. Попробуйте позже.
          </Typography>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Typography variant="header" style={{ marginBottom: 4 }}>
          Сегодня
        </Typography>
        <Typography variant="caption" color="secondary">
          {dateString}
        </Typography>
      </div>

      {/* Progress */}
      {totalCount > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <ProgressBar
            value={completedCount}
            max={totalCount}
            label="Прогресс дня"
            showPercentage
            size="medium"
            color={progress === 100 ? 'success' : 'primary'}
          />
        </Panel>
      )}

      {/* Add Button */}
      <Button
        variant="primary"
        size="large"
        block
        style={{ marginBottom: 16 }}
        onClick={() => (window.location.href = '/add-routine')}
      >
        ➕ Добавить рутину
      </Button>

      {/* Reminders List */}
      <div>
        {reminders.length === 0 ? (
          <Panel style={{ textAlign: 'center', padding: 40 }}>
            <Typography variant="title" style={{ marginBottom: 8 }}>
              📭
            </Typography>
            <Typography variant="body" color="secondary">
              На сегодня нет напоминаний
            </Typography>
            <Typography variant="caption" color="tertiary" style={{ marginTop: 8 }}>
              Добавьте свою первую рутину!
            </Typography>
          </Panel>
        ) : (
          reminders.map((reminder) => (
            <RoutineCard
              key={reminder.id}
              id={reminder.id}
              icon={reminder.icon}
              title={reminder.title}
              subtitle={reminder.dosage}
              time={reminder.time.substring(0, 5)}
              status={reminder.status}
              canPostpone={reminder.canPostpone}
              onComplete={() => handleComplete(reminder.id)}
              onPostpone={() => handlePostpone(reminder.id)}
            />
          ))
        )}
      </div>

      {/* Completion Message */}
      {progress === 100 && totalCount > 0 && (
        <Panel
          style={{
            marginTop: 16,
            background: 'var(--max-success)20',
            border: '1px solid var(--max-success)',
            textAlign: 'center',
          }}
        >
          <Typography variant="title" style={{ marginBottom: 8 }}>
            🎉 Отлично!
          </Typography>
          <Typography variant="body">
            Вы выполнили все рутины на сегодня!
          </Typography>
        </Panel>
      )}
    </div>
  );
};

export default TodayPage;
