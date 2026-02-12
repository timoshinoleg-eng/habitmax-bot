import React from 'react';
import { useQuery } from 'react-query';
import { MaxUI, Panel, Typography } from '@maxhub/max-ui';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { statsApi } from '../api/client';
import ProgressBar from '../components/ProgressBar';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface LevelInfo {
  code: string;
  name: string;
  icon: string;
  points: number;
  progress: number;
  nextLevelPoints: number | null;
}

interface CompletionStats {
  total: number;
  completed: number;
  skipped: number;
  rate: number;
}

interface StreakStats {
  current: number;
  max: number;
}

interface ChartData {
  date: string;
  completed: number;
  skipped: number;
  total: number;
  rate: number;
}

interface StatsData {
  streak: StreakStats;
  level: LevelInfo;
  completion: CompletionStats;
  achievements: { total: number };
  chart: ChartData[];
}

const StatsPage: React.FC = () => {
  const { data, isLoading, error } = useQuery<StatsData>(
    'stats',
    () => statsApi.getStats().then((res) => res.data.data),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ height: '50vh' }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <Panel>
          <Typography variant="body" color="danger">
            Ошибка загрузки статистики
          </Typography>
        </Panel>
      </div>
    );
  }

  const { streak, level, completion, achievements, chart } = data;

  // Форматируем данные для графика
  const chartData = chart.map((day) => ({
    ...day,
    date: format(parseISO(day.date), 'dd.MM'),
  }));

  return (
    <div className="page">
      <Typography variant="header" style={{ marginBottom: 20 }}>
        Статистика
      </Typography>

      {/* Streak Card */}
      <Panel style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            textAlign: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--max-primary)',
              }}
            >
              🔥 {streak.current}
            </div>
            <Typography variant="caption" color="secondary">
              Текущая серия
            </Typography>
          </div>
          <div
            style={{
              width: 1,
              backgroundColor: 'var(--max-border)',
            }}
          />
          <div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--max-success)',
              }}
            >
              🏆 {streak.max}
            </div>
            <Typography variant="caption" color="secondary">
              Максимальная
            </Typography>
          </div>
        </div>
      </Panel>

      {/* Level Card */}
      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 40, marginRight: 12 }}>{level.icon}</span>
          <div>
            <Typography variant="subtitle">{level.name}</Typography>
            <Typography variant="caption" color="secondary">
              {level.points} очков
            </Typography>
          </div>
        </div>
        {level.nextLevelPoints && (
          <ProgressBar
            value={level.points}
            max={level.nextLevelPoints}
            label="Прогресс к следующему уровню"
            showPercentage
          />
        )}
      </Panel>

      {/* Completion Stats */}
      <Panel style={{ marginBottom: 16 }}>
        <Typography variant="subtitle" style={{ marginBottom: 12 }}>
          Выполнение
        </Typography>
        <div className="grid grid-2">
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--max-success)' }}>
              {completion.completed}
            </div>
            <div className="stat-label">Выполнено</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--max-danger)' }}>
              {completion.skipped}
            </div>
            <div className="stat-label">Пропущено</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar
            value={completion.completed}
            max={completion.total}
            label="Общая успешность"
            showPercentage
            color={completion.rate >= 80 ? 'success' : completion.rate >= 50 ? 'warning' : 'primary'}
          />
        </div>
      </Panel>

      {/* Weekly Chart */}
      {chartData.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <Typography variant="subtitle" style={{ marginBottom: 12 }}>
            Недельная статистика
          </Typography>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--max-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--max-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--max-border)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--max-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--max-border)' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--max-bg-primary)',
                    border: '1px solid var(--max-border)',
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="completed"
                  fill="var(--max-success)"
                  radius={[4, 4, 0, 0]}
                  name="Выполнено"
                />
                <Bar
                  dataKey="skipped"
                  fill="var(--max-danger)"
                  radius={[4, 4, 0, 0]}
                  name="Пропущено"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* Success Rate Chart */}
      {chartData.length > 0 && (
        <Panel>
          <Typography variant="subtitle" style={{ marginBottom: 12 }}>
            Процент успешности
          </Typography>
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--max-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--max-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--max-border)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--max-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--max-border)' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--max-bg-primary)',
                    border: '1px solid var(--max-border)',
                    borderRadius: 8,
                  }}
                  formatter={(value: number) => [`${value}%`, 'Успешность']}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--max-primary)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--max-primary)', strokeWidth: 0, r: 4 }}
                  name="Успешность %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default StatsPage;
