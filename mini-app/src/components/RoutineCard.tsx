import React from 'react';
import { MaxUI } from '@maxhub/max-ui';
import classNames from 'classnames';

interface RoutineCardProps {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  time: string;
  status: 'pending' | 'sent' | 'completed' | 'skipped' | 'postponed';
  canPostpone?: boolean;
  onComplete: () => void;
  onPostpone?: () => void;
  onSkip?: () => void;
}

const RoutineCard: React.FC<RoutineCardProps> = ({
  icon,
  title,
  subtitle,
  time,
  status,
  canPostpone = true,
  onComplete,
  onPostpone,
  onSkip,
}) => {
  const isCompleted = status === 'completed';
  const isSkipped = status === 'skipped';
  const isPending = status === 'pending' || status === 'sent';

  return (
    <div
      className={classNames('routine-item', {
        completed: isCompleted,
        skipped: isSkipped,
      })}
    >
      <div className="routine-icon">{icon}</div>
      
      <div className="routine-content">
        <div className="routine-title">{title}</div>
        <div className="routine-subtitle">
          {subtitle ? `${subtitle} • ` : ''}{time}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {isPending && (
          <>
            {canPostpone && onPostpone && (
              <MaxUI.Button
                size="small"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onPostpone();
                }}
              >
                +15 мин
              </MaxUI.Button>
            )}
            
            <div
              className={classNames('routine-checkbox', { checked: false })}
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              style={{ cursor: 'pointer' }}
            >
              {isCompleted && '✓'}
            </div>
          </>
        )}

        {isCompleted && (
          <div className="routine-checkbox checked">✓</div>
        )}

        {isSkipped && (
          <span style={{ color: 'var(--max-danger)', fontSize: 20 }}>✕</span>
        )}
      </div>
    </div>
  );
};

export default RoutineCard;
