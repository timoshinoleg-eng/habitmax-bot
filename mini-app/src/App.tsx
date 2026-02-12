import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MaxUI, Tabbar } from '@maxhub/max-ui';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';

// Pages
import TodayPage from './pages/TodayPage';
import CalendarPage from './pages/CalendarPage';
import StatsPage from './pages/StatsPage';
import RewardsPage from './pages/RewardsPage';
import SettingsPage from './pages/SettingsPage';
import AuthPage from './pages/AuthPage';
import AddRoutinePage from './pages/AddRoutinePage';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import LoadingScreen from './components/LoadingScreen';

import './App.css';

const App: React.FC = () => {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Если не авторизован и не на странице авторизации
  if (!isAuthenticated && location.pathname !== '/auth') {
    return <Navigate to="/auth" replace />;
  }

  // Если авторизован и на странице авторизации
  if (isAuthenticated && location.pathname === '/auth') {
    return <Navigate to="/" replace />;
  }

  return (
    <MaxUI className={`app ${theme}`}>
      <div className="app-container">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TodayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <ProtectedRoute>
                <StatsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewards"
            element={
              <ProtectedRoute>
                <RewardsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-routine"
            element={
              <ProtectedRoute>
                <AddRoutinePage />
              </ProtectedRoute>
            }
          />
        </Routes>

        {isAuthenticated && location.pathname !== '/auth' && (
          <Tabbar className="bottom-nav">
            <Tabbar.Item
              icon="📅"
              label="Сегодня"
              active={location.pathname === '/'}
              onClick={() => window.location.href = '/'}
            />
            <Tabbar.Item
              icon="📆"
              label="Календарь"
              active={location.pathname === '/calendar'}
              onClick={() => window.location.href = '/calendar'}
            />
            <Tabbar.Item
              icon="📊"
              label="Статистика"
              active={location.pathname === '/stats'}
              onClick={() => window.location.href = '/stats'}
            />
            <Tabbar.Item
              icon="🏆"
              label="Награды"
              active={location.pathname === '/rewards'}
              onClick={() => window.location.href = '/rewards'}
            />
            <Tabbar.Item
              icon="⚙️"
              label="Настройки"
              active={location.pathname === '/settings'}
              onClick={() => window.location.href = '/settings'}
            />
          </Tabbar>
        )}
      </div>
    </MaxUI>
  );
};

export default App;
