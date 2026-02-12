import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { MaxUI, Panel, Typography, Button } from '@maxhub/max-ui';
import { achievementsApi } from '../api/client';
import AchievementBadge from '../components/AchievementBadge';

interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  achievedAt: string;
  isNew: boolean;
}

const RewardsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    'achievements',
    () => achievementsApi.getAll().then((res) => res.data.data),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const markSeenMutation = useMutation(
    () => achievementsApi.markSeen(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('achievements');
      },
    }
  );

  useEffect(() => {
    // Отмечаем новые достижения как просмотренные при уходе со страницы
    return () => {
      const hasNew = achievements.some((a) => a.isNew);
      if (hasNew) {
        markSeenMutation.mutate();
      }
    };
  }, []);

  const achievements: Achievement[] = data || [];
  const newAchievements = achievements.filter((a) => a.isNew);
  const oldAchievements = achievements.filter((a) => !a.isNew);

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
        Достижения
      </Typography>

      {/* Stats */}
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
              {achievements.length}
            </div>
            <Typography variant="caption" color="secondary">
              Всего достижений
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
              {achievements.reduce((sum, a) => sum + a.points, 0)}
            </div>
            <Typography variant="caption" color="secondary">
              Всего очков
            </Typography>
          </div>
        </div>
      </Panel>

      {/* New Achievements */}
      {newAchievements.length > 0 && (
        <>
          <Typography
            variant="subtitle"
            style={{ marginBottom: 12, color: 'var(--max-success)' }}
          >
            🎉 Новые достижения!
          </Typography>
          <div
            className="grid grid-2"
            style={{ marginBottom: 24 }}
          >
            {newAchievements.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                icon={achievement.icon}
                title={achievement.title}
                description={achievement.description}
                points={achievement.points}
                isNew={achievement.isNew}
                achievedAt={achievement.achievedAt}
              />
            ))}
          </div>
        </>
      )}

      {/* All Achievements */}
      <Typography variant="subtitle" style={{ marginBottom: 12 }}>
        Все достижения
      </Typography>

      {achievements.length === 0 ? (
        <Panel style={{ textAlign: 'center', padding: 40 }}>
          <Typography variant="title" style={{ marginBottom: 8 }}>
            🏆
          </Typography>
          <Typography variant="body" color="secondary">
            У вас пока нет достижений
          </Typography>
          <Typography variant="caption" color="tertiary" style={{ marginTop: 8 }}>
            Выполняйте рутины каждый день, чтобы получать награды!
          </Typography>
        </Panel>
      ) : (
        <div className="grid grid-2">
          {oldAchievements.map((achievement) => (
            <AchievementBadge
              key={achievement.id}
              icon={achievement.icon}
              title={achievement.title}
              description={achievement.description}
              points={achievement.points}
              isNew={achievement.isNew}
              achievedAt={achievement.achievedAt}
            />
          ))}
        </div>
      )}

      {/* Coming Soon */}
      <Panel style={{ marginTop: 24, textAlign: 'center' }}>
        <Typography variant="caption" color="tertiary">
          💡 Совет: Выполняйте рутины до 08:00, чтобы получить бейдж "Ранняя пташка"
        </Typography>
      </Panel>
    </div>
  );
};

export default RewardsPage;
