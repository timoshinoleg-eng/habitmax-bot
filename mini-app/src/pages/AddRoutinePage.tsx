import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { MaxUI, Panel, Typography, Button, Input, Select } from '@maxhub/max-ui';
import { routinesApi, templatesApi } from '../api/client';

interface Template {
  id: number;
  type: 'habit' | 'medication' | 'task';
  title: string;
  description: string;
  icon: string;
  dosage?: string;
  defaultTime: string;
  isPopular: boolean;
}

type Step = 'type' | 'template' | 'custom' | 'schedule' | 'time' | 'confirm';

const routineTypes = [
  { value: 'medication', label: '💊 Лекарство', description: 'Отслеживание приёма лекарств' },
  { value: 'habit', label: '🥤 Привычка', description: 'Формирование полезных привычек' },
  { value: 'task', label: '📋 Дело', description: 'Важные дела на каждый день' },
];

const scheduleTypes = [
  { value: 'daily', label: '📆 Каждый день' },
  { value: 'weekdays', label: '📅 Будни / Выходные' },
  { value: 'custom', label: '🗓 Выбрать дни' },
];

const timeOptions = [
  { value: '06:00', label: '🌅 06:00' },
  { value: '07:00', label: '🌅 07:00' },
  { value: '08:00', label: '☀️ 08:00' },
  { value: '09:00', label: '☀️ 09:00' },
  { value: '12:00', label: '🌤 12:00' },
  { value: '18:00', label: '🌆 18:00' },
  { value: '20:00', label: '🌙 20:00' },
  { value: '21:00', label: '🌙 21:00' },
  { value: '22:00', label: '🌃 22:00' },
];

const AddRoutinePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<Step>('type');
  const [routineData, setRoutineData] = useState({
    type: '' as 'habit' | 'medication' | 'task',
    title: '',
    description: '',
    icon: '⭐',
    dosage: '',
    scheduleType: 'daily',
    time: '08:00',
  });

  const { data: templates } = useQuery(
    ['templates', routineData.type],
    () => templatesApi.getAll({ type: routineData.type, popular: true }).then((res) => res.data.data),
    {
      enabled: !!routineData.type && step === 'template',
    }
  );

  const createMutation = useMutation(
    (data: any) => routinesApi.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('todayReminders');
        queryClient.invalidateQueries('routines');
        navigate('/');
      },
    }
  );

  const handleTypeSelect = (type: 'habit' | 'medication' | 'task') => {
    setRoutineData({ ...routineData, type });
    setStep('template');
  };

  const handleTemplateSelect = (template: Template) => {
    setRoutineData({
      ...routineData,
      title: template.title,
      description: template.description,
      icon: template.icon,
      dosage: template.dosage || '',
      time: template.defaultTime || '08:00',
    });
    setStep('schedule');
  };

  const handleCustomSelect = () => {
    setStep('custom');
  };

  const handleScheduleSelect = (scheduleType: string) => {
    setRoutineData({ ...routineData, scheduleType });
    setStep('time');
  };

  const handleTimeSelect = (time: string) => {
    setRoutineData({ ...routineData, time });
    setStep('confirm');
  };

  const handleCreate = () => {
    createMutation.mutate({
      type: routineData.type,
      title: routineData.title,
      description: routineData.description,
      icon: routineData.icon,
      dosage: routineData.dosage,
      schedule: {
        type: routineData.scheduleType,
        time: routineData.time,
      },
    });
  };

  const renderStep = () => {
    switch (step) {
      case 'type':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Что хотите добавить?
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {routineTypes.map((type) => (
                <Button
                  key={type.value}
                  variant="secondary"
                  size="large"
                  block
                  onClick={() => handleTypeSelect(type.value as any)}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  <div>
                    <div>{type.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {type.description}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </>
        );

      case 'template':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Выберите шаблон
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates?.map((template: Template) => (
                <Button
                  key={template.id}
                  variant="secondary"
                  size="medium"
                  block
                  onClick={() => handleTemplateSelect(template)}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  <span style={{ marginRight: 8 }}>{template.icon}</span>
                  {template.title}
                </Button>
              ))}
              <Button
                variant="secondary"
                size="medium"
                block
                onClick={handleCustomSelect}
                style={{ marginTop: 8 }}
              >
                ✏️ Свой вариант
              </Button>
            </div>
          </>
        );

      case 'custom':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Создайте свою рутину
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Typography variant="caption" color="secondary" style={{ marginBottom: 4, display: 'block' }}>
                  Название
                </Typography>
                <Input
                  type="text"
                  placeholder="Например: Магний 500мг"
                  value={routineData.title}
                  onChange={(e) => setRoutineData({ ...routineData, title: e.target.value })}
                  block
                />
              </div>
              {routineData.type === 'medication' && (
                <div>
                  <Typography variant="caption" color="secondary" style={{ marginBottom: 4, display: 'block' }}>
                    Дозировка
                  </Typography>
                  <Input
                    type="text"
                    placeholder="Например: 500 мг"
                    value={routineData.dosage}
                    onChange={(e) => setRoutineData({ ...routineData, dosage: e.target.value })}
                    block
                  />
                </div>
              )}
              <Button
                variant="primary"
                size="large"
                block
                disabled={!routineData.title.trim()}
                onClick={() => setStep('schedule')}
              >
                Продолжить
              </Button>
            </div>
          </>
        );

      case 'schedule':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Как часто?
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scheduleTypes.map((schedule) => (
                <Button
                  key={schedule.value}
                  variant="secondary"
                  size="large"
                  block
                  onClick={() => handleScheduleSelect(schedule.value)}
                >
                  {schedule.label}
                </Button>
              ))}
            </div>
          </>
        );

      case 'time':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Выберите время
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timeOptions.map((time) => (
                <Button
                  key={time.value}
                  variant={routineData.time === time.value ? 'primary' : 'secondary'}
                  size="medium"
                  block
                  onClick={() => handleTimeSelect(time.value)}
                >
                  {time.label}
                </Button>
              ))}
            </div>
          </>
        );

      case 'confirm':
        return (
          <>
            <Typography variant="subtitle" style={{ marginBottom: 16 }}>
              Проверьте данные
            </Typography>
            <Panel style={{ marginBottom: 16, background: 'var(--max-bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 32, marginRight: 12 }}>{routineData.icon}</span>
                <div>
                  <Typography variant="body" style={{ fontWeight: 600 }}>
                    {routineData.title}
                  </Typography>
                  {routineData.dosage && (
                    <Typography variant="caption" color="secondary">
                      {routineData.dosage}
                    </Typography>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <Typography variant="caption" color="secondary">
                    Расписание
                  </Typography>
                  <Typography variant="body">
                    {scheduleTypes.find((s) => s.value === routineData.scheduleType)?.label}
                  </Typography>
                </div>
                <div>
                  <Typography variant="caption" color="secondary">
                    Время
                  </Typography>
                  <Typography variant="body">{routineData.time}</Typography>
                </div>
              </div>
            </Panel>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button
                variant="primary"
                size="large"
                style={{ flex: 1 }}
                onClick={handleCreate}
                disabled={createMutation.isLoading}
              >
                {createMutation.isLoading ? 'Создание...' : '✓ Создать'}
              </Button>
              <Button
                variant="secondary"
                size="large"
                onClick={() => setStep('type')}
              >
                ←
              </Button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <Button
          variant="secondary"
          size="small"
          onClick={() => step === 'type' ? navigate('/') : setStep('type')}
        >
          ← Назад
        </Button>
      </div>

      <Typography variant="header" style={{ marginBottom: 20 }}>
        Новая рутина
      </Typography>

      <Panel>{renderStep()}</Panel>
    </div>
  );
};

export default AddRoutinePage;
