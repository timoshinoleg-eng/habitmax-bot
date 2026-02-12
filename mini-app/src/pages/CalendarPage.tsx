import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { MaxUI, Panel, Typography, Button } from '@maxhub/max-ui';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isFuture, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { statsApi } from '../api/client';

interface DayData {
  date: string;
  completed: number;
  skipped: number;
  total: number;
  rate: number;
}

const CalendarPage: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: statsData } = useQuery(
    'stats',
    () => statsApi.getStats().then((res) => res.data.data),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const chartData: DayData[] = statsData?.chart || [];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getDayStatus = (date: Date): 'completed' | 'skipped' | 'partial' | 'future' | 'empty' => {
    if (isFuture(date)) return 'future';
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayData = chartData.find((d) => d.date === dateStr);
    
    if (!dayData || dayData.total === 0) return 'empty';
    if (dayData.rate === 100) return 'completed';
    if (dayData.rate === 0) return 'skipped';
    return 'partial';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'var(--max-success)';
      case 'skipped':
        return 'var(--max-danger)';
      case 'partial':
        return 'var(--max-warning)';
      case 'future':
        return 'var(--max-bg-tertiary)';
      default:
        return 'transparent';
    }
  };

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="page">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Button
          variant="secondary"
          size="small"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          ←
        </Button>
        <Typography variant="header">
          {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </Typography>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          →
        </Button>
      </div>

      {/* Calendar Grid */}
      <Panel>
        {/* Week days header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
            marginBottom: 8,
          }}
        >
          {weekDays.map((day) => (
            <div
              key={day}
              style={{
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--max-text-secondary)',
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
          }}
        >
          {days.map((day) => {
            const status = getDayStatus(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            
            return (
              <div
                key={day.toISOString()}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: getStatusColor(status),
                  opacity: isCurrentMonth ? 1 : 0.3,
                  border: isToday(day) ? '2px solid var(--max-primary)' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: isToday(day) ? 700 : 400,
                    color:
                      status === 'completed' || status === 'skipped'
                        ? 'white'
                        : 'var(--max-text-primary)',
                  }}
                >
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Legend */}
      <Panel style={{ marginTop: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Легенда
        </Typography>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: 'var(--max-success)',
              }}
            />
            <Typography variant="caption">Выполнено 100%</Typography>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: 'var(--max-warning)',
              }}
            />
            <Typography variant="caption">Частично</Typography>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: 'var(--max-danger)',
              }}
            />
            <Typography variant="caption">Пропущено</Typography>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                backgroundColor: 'var(--max-bg-tertiary)',
              }}
            />
            <Typography variant="caption">Будущее</Typography>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default CalendarPage;
