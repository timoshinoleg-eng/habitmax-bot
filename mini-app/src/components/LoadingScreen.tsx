import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p style={{ marginTop: 16, color: 'var(--max-text-secondary)' }}>
        Загрузка HabitMax...
      </p>
    </div>
  );
};

export default LoadingScreen;
