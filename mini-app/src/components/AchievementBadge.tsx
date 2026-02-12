import React from 'react';
import classNames from 'classnames';

interface AchievementBadgeProps {
  icon: string;
  title: string;
  description: string;
  points: number;
  isNew?: boolean;
  achievedAt?: string;
}

const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  icon,
  title,
  description,
  points,
  isNew = false,
  achievedAt,
}) => {
  return (
    <div className={classNames('badge', { new: isNew })}>
      <div className="badge-icon">{icon}</div>
      <div className="badge-title">{title}</div>
      <div className="badge-description">{description}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--max-primary)',
          fontWeight: 600,
        }}
      >
        +{points} очков
      </div>
      {isNew && (
        <div
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: 'var(--max-danger)',
            color: 'white',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          NEW
        </div>
      )}
    </div>
  );
};

export default AchievementBadge;
