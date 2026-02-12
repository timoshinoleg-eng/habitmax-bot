import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeState {
  theme: Theme;
  systemTheme: 'light' | 'dark';
  
  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  getEffectiveTheme: () => 'light' | 'dark';
}

// Определение системной темы
const getSystemTheme = (): 'light' | 'dark' => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'auto',
      systemTheme: getSystemTheme(),

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme === 'auto' ? get().systemTheme : theme);
      },

      toggleTheme: () => {
        const currentTheme = get().theme;
        const effectiveTheme = get().getEffectiveTheme();
        const newTheme = effectiveTheme === 'light' ? 'dark' : 'light';
        
        set({ theme: newTheme });
        applyTheme(newTheme);
      },

      getEffectiveTheme: () => {
        const { theme, systemTheme } = get();
        return theme === 'auto' ? systemTheme : theme;
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

// Применение темы к документу
const applyTheme = (theme: 'light' | 'dark') => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

// Слушаем изменения системной темы
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    useThemeStore.setState({ systemTheme: e.matches ? 'dark' : 'light' });
    const store = useThemeStore.getState();
    if (store.theme === 'auto') {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}
