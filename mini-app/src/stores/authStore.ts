import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { api } from '../api/client';

interface User {
  id: number;
  username: string | null;
  firstName: string | null;
  timezone: string;
  level: string;
  points: number;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setAuth: (token: string, refreshToken: string, user: User) => void;
  clearAuth: () => void;
  checkAuth: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (token, refreshToken, user) => {
        Cookies.set('token', token, { expires: 7 });
        Cookies.set('refreshToken', refreshToken, { expires: 30 });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        set({ token, refreshToken, user, isAuthenticated: true, isLoading: false });
      },

      clearAuth: () => {
        Cookies.remove('token');
        Cookies.remove('refreshToken');
        delete api.defaults.headers.common['Authorization'];
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false, isLoading: false });
      },

      checkAuth: async () => {
        const token = Cookies.get('token');
        const refreshToken = Cookies.get('refreshToken');

        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Проверяем валидность токена через запрос к API
          const response = await api.get('/settings');
          
          if (response.data.success) {
            set({ token, refreshToken, isAuthenticated: true, isLoading: false });
          } else {
            // Пробуем обновить токен
            const refreshed = await get().refreshAccessToken();
            if (!refreshed) {
              get().clearAuth();
            }
          }
        } catch (error) {
          // Пробуем обновить токен
          const refreshed = await get().refreshAccessToken();
          if (!refreshed) {
            get().clearAuth();
          }
        }
      },

      refreshAccessToken: async () => {
        const refreshToken = Cookies.get('refreshToken');
        
        if (!refreshToken) {
          return false;
        }

        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          
          if (response.data.success) {
            const { token } = response.data.data;
            Cookies.set('token', token, { expires: 7 });
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            set({ token, isAuthenticated: true });
            return true;
          }
        } catch (error) {
          console.error('Failed to refresh token:', error);
        }
        
        return false;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
