# HabitMax Bot - Railway Deployment Guide

## Быстрый старт

### 1. Регистрация на Railway
- Перейди на https://railway.app
- Зарегистрируйся через GitHub

### 2. Создание проекта
- Нажми "New Project"
- Выбери "Deploy from GitHub repo"
- Выбери репозиторий `habitmax-bot`

### 3. Добавление баз данных

#### PostgreSQL:
- New → Database → Add PostgreSQL
- Railway автоматически создаст переменную `DATABASE_URL`

#### Redis:
- New → Database → Add Redis
- Railway автоматически создаст переменную `REDIS_URL`

### 4. Настройка переменных окружения

В настройках проекта (Variables) добавь:

```
# Обязательные
MAX_API_TOKEN=your_max_api_token_here
WEBHOOK_URL=https://your-app-name.up.railway.app/webhook

# База данных (автоматически от Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Опционально
NODE_ENV=production
PORT=3000
JWT_SECRET=your_random_secret_key_here
```

### 5. Настройка домена
- В настройках сервиса → Domains
- Нажми "Generate Domain" или добавь свой
- Скопируй URL и обнови `WEBHOOK_URL`

### 6. Деплой
- Railway автоматически задеплоит при пуше в main
- Или нажми "Deploy" вручную

### 7. Настройка webhook в Max Platform

```bash
curl -X POST https://platform-api.max.ru/subscriptions \
  -H "Authorization: YOUR_MAX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.up.railway.app/webhook"}'
```

## Проверка работы

### Health check:
```
https://your-app.up.railway.app/health
```

### Логи:
- В Railway Dashboard → Logs

## Бесплатные лимиты Railway

- $5 кредитов/месяц
- 512 MB RAM
- 1 GB диск
- Спит после неактивности (~10 сек на запуск)

## Устранение неполадок

### Бот не отвечает:
1. Проверь логи в Railway
2. Проверь health endpoint
3. Убедись что webhook установлен правильно

### Ошибка подключения к БД:
1. Проверь что PostgreSQL запущен
2. Проверь переменную DATABASE_URL

### Redis не работает:
1. Проверь что Redis запущен
2. Проверь переменную REDIS_URL
