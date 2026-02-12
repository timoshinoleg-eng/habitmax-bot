import axios, { AxiosError, AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

// Создание экземпляра axios
export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор запросов
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор ответов для обработки ошибок и обновления токена
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Обработка 401 ошибки
    if (error.response?.status === 401) {
      const refreshToken = Cookies.get('refreshToken');
      
      if (refreshToken) {
        try {
          // Пробуем обновить токен
          const response = await axios.post('/api/auth/refresh', { refreshToken });
          
          if (response.data.success) {
            const { token: newToken } = response.data.data;
            Cookies.set('token', newToken, { expires: 7 });
            
            // Повторяем оригинальный запрос
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          // Не удалось обновить токен
          Cookies.remove('token');
          Cookies.remove('refreshToken');
          window.location.href = '/auth';
        }
      } else {
        // Нет refresh токена
        window.location.href = '/auth';
      }
    }

    return Promise.reject(error);
  }
);

// API методы
export const authApi = {
  exchange: (code: string) => api.post('/auth/exchange', { code }),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
};

export const routinesApi = {
  getAll: () => api.get('/routines'),
  create: (data: any) => api.post('/routines', data),
  update: (id: string, data: any) => api.patch(`/routines/${id}`, data),
  delete: (id: string) => api.delete(`/routines/${id}`),
};

export const remindersApi = {
  getToday: () => api.get('/reminders/today'),
  complete: (id: string) => api.post(`/reminders/${id}/complete`),
  postpone: (id: string, minutes: number) => api.post(`/reminders/${id}/postpone`, { minutes }),
};

export const statsApi = {
  getStats: () => api.get('/stats'),
};

export const achievementsApi = {
  getAll: () => api.get('/achievements'),
  markSeen: () => api.post('/achievements/mark-seen'),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.patch('/settings', data),
};

export const templatesApi = {
  getAll: (params?: { type?: string; popular?: boolean }) => 
    api.get('/templates', { params }),
};

export default api;
