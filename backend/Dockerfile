# HabitMax Backend Dockerfile
FROM node:18-alpine

# Установка зависимостей для сборки
RUN apk add --no-cache curl ca-certificates

# Создание директории приложения
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production && npm cache clean --force

# Копирование исходного кода
COPY src/ ./src/

# Создание директории для логов
RUN mkdir -p logs

# Пользователь без прав root для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Открытие порта
EXPOSE 3000

# Проверка здоровья
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["node", "src/index.js"]
