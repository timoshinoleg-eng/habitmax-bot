import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MaxUI, Panel, Typography, Button, Input } from '@maxhub/max-ui';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/client';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Если уже авторизован - редирект
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Получаем код из URL (deeplink)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('code') || params.get('start');
    if (authCode && authCode.startsWith('app_auth_')) {
      const userId = authCode.replace('app_auth_', '');
      setCode(userId);
      handleAuth(userId);
    }
  }, []);

  const handleAuth = async (authCode: string) => {
    if (!authCode.trim()) {
      setError('Введите код авторизации');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.exchange(authCode);
      
      if (response.data.success) {
        const { token, refreshToken, user } = response.data.data;
        setAuth(token, refreshToken, user);
        navigate('/');
      } else {
        setError('Ошибка авторизации');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка соединения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAuth(code);
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Panel style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📱</div>
        <Typography variant="header" style={{ marginBottom: 8 }}>
          HabitMax
        </Typography>
        <Typography variant="body" color="secondary">
          Войдите через чат-бот
        </Typography>
      </Panel>

      <Panel>
        <form onSubmit={handleSubmit}>
          <Typography variant="subtitle" style={{ marginBottom: 12 }}>
            Код авторизации
          </Typography>
          
          <Input
            type="text"
            placeholder="Введите код"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            block
            style={{ marginBottom: 16 }}
            disabled={isLoading}
          />

          {error && (
            <Typography
              variant="caption"
              color="danger"
              style={{ marginBottom: 12, display: 'block' }}
            >
              {error}
            </Typography>
          )}

          <Button
            type="submit"
            variant="primary"
            size="large"
            block
            disabled={isLoading}
          >
            {isLoading ? 'Загрузка...' : 'Войти'}
          </Button>
        </form>
      </Panel>

      <Panel style={{ marginTop: 16, textAlign: 'center' }}>
        <Typography variant="caption" color="secondary">
          Чтобы получить код:
        </Typography>
        <ol
          style={{
            textAlign: 'left',
            marginTop: 8,
            paddingLeft: 20,
            color: 'var(--max-text-secondary)',
            fontSize: 13,
          }}
        >
          <li>Откройте чат с ботом @HabitMaxBot</li>
          <li>Отправьте команду /start</li>
          <li>Нажмите "Открыть приложение"</li>
        </ol>
      </Panel>
    </div>
  );
};

export default AuthPage;
