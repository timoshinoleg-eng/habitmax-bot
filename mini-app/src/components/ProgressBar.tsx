import React from 'react';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'success' | 'warning';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  label,
  showPercentage = true,
  size = 'medium',
  color = 'primary',
}) => {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  
  const heightMap = {
    small: 4,
    medium: 8,
    large: 12,
  };

  const colorMap = {
    primary: 'var(--max-primary)',
    success: 'var(--max-success)',
    warning: 'var(--max-warning)',
  };

  return (
    <div style={{ width: '100%' }}>
      {(label || showPercentage) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
            fontSize: 13,
            color: 'var(--max-text-secondary)',
          }}
        >
          {label && <span>{label}</span>}
          {showPercentage && (
            <span>
              {value}/{max} ({percentage}%)
            </span>
          )}
        </div>
      )}
      
      <div
        style={{
          width: '100%',
          height: heightMap[size],
          backgroundColor: 'var(--max-bg-tertiary)',
          borderRadius: heightMap[size] / 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: colorMap[color],
            borderRadius: heightMap[size] / 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
