# HabitMax Bot - Render Deployment Guide

## Быстрый старт (Blueprint)

### 1. Форк/клон репозитория

```bash
git clone https://github.com/timoshinoleg-eng/habitmax-bot.git
cd habitmax-bot
```

### 2. Deploy через Blueprint

1. Перейди на [Render Dashboard](https://dashboard.render.com)
2. Нажми **New** → **Blueprint**
3. Подключи GitHub репозиторий
4. Render автоматически создаст:
   - **Web Service** (`habitmax-bot`) — Node.js backend
   - **PostgreSQL** (`habitmax-db`) — managed database
   - **Redis** (`habitmax-redis`) — Upstash Redis
   - **Disk** — 1GB для файлов

### 3. Добавь секреты

В Dashboard → habitmax-bot → **Environment** добавь:

```env
MAX_API_TOKEN=your_max_api_token_here
JWT_SECRET=your_random_jwt_secret_min_32_chars
WEBHOOK_URL=https://habitmax-bot-xxx.onrender.com/webhook
```

### 4. Deploy

Нажми **Manual Deploy** → **Deploy latest commit**

### 5. Настройка вебхука Max

```bash
curl -X POST https://platform-api.max.ru/subscriptions \
  -H "Authorization: YOUR_MAX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://habitmax-bot-xxx.onrender.com/webhook"}'
```

## Ручная настройка (без Blueprint)

### 1. PostgreSQL (Managed Database)

1. Dashboard → **New** → **PostgreSQL**
2. Настройки:
   - Name: `habitmax-db`
   - Region: `Frankfurt (EU Central)` (ближе к РФ)
   - Plan: Free / Starter
3. После создания скопируй **Internal Database URL** → он автоматически подставится в `DATABASE_URL`

### 2. Redis (Upstash)

1. Dashboard → **New** → **Redis**
2. Выбери **Upstash**
3. Настройки:
   - Name: `habitmax-redis`
   - Region: `EU Central`
   - Plan: Free
4. Скопируй **REDIS_URL** → он автоматически подставится

### 3. Web Service (Backend)

1. Dashboard → **New** → **Web Service**
2. Подключи GitHub репозиторий
3. Настройки:
   - Name: `habitmax-bot`
   - Region: `Frankfurt (EU Central)`
   - Branch: `main`
   - Runtime: `Docker`
   - Docker Build Context: `./`
   - Dockerfile Path: `./Dockerfile.render`
   - Plan: Free / Starter

### 4. Environment Variables

Render автоматически подставит:
- `DATABASE_URL` — из managed PostgreSQL
- `REDIS_URL` — из Upstash Redis

Добавь вручную:

```env
# Max Platform API
MAX_API_TOKEN=your_max_api_token_here
WEBHOOK_URL=https://habitmax-bot-xxx.onrender.com/webhook

# JWT Secret (сгенерируй случайную строку 32+ символов)
JWT_SECRET=your_random_jwt_secret_min_32_chars
```

## Поддерживаемые форматы переменных

### Database

```env
# Render format (приоритет)
DATABASE_URL=postgres://user:password@host:5432/dbname

# Или отдельные переменные (fallback)
DB_HOST=host
DB_PORT=5432
DB_NAME=habitmax
DB_USER=habitmax
DB_PASSWORD=password
```

### Redis

```env
# Upstash/Render format (приоритет)
REDIS_URL=redis://default:password@host:port
REDIS_URL=rediss://default:password@host:port  # TLS

# Или отдельные переменные (fallback)
REDIS_HOST=host
REDIS_PORT=6379
REDIS_PASSWORD=password
```

## Особенности Render Free Tier

| Лимит | Значение |
|-------|----------|
| CPU/RAM | Shared |
| Uptime | Спит после 15 мин неактивности |
| Disk | 1 GB (ephemeral) |
| DB | 90 days inactive = deleted |

**Для бота важно:** Free tier "засыпает" — первый запрос после паузы будет медленным (~30 сек). Для продакшена бери Starter ($7/мес).

## Миграции

Миграции выполняются автоматически при старте (если настроено в коде) или вручную:

```bash
# Через Render Shell
node src/migrations/run.js
```

## Мониторинг

- Health check: `https://habitmax-bot-xxx.onrender.com/health`
- Logs: Render Dashboard → Logs
- Metrics: Render Dashboard → Metrics

## Troubleshooting

### "Cannot connect to database"
- Проверь `DATABASE_URL` в Environment
- Убедись что PostgreSQL в том же регионе
- SSL включён автоматически для Render

### "Redis connection error"
- Upstash использует TLS — код уже адаптирован
- Проверь `REDIS_URL` начинается с `rediss://`

### "Webhook not working"
- Проверь `WEBHOOK_URL` (должен быть HTTPS)
- Убедись что бот отвечает на `/health`

## Сравнение с Railway

| Фича | Railway | Render |
|------|---------|--------|
| Free tier uptime | 24/7 | Спит после 15 мин |
| PostgreSQL | Managed | Managed |
| Redis | Managed | Upstash (внешний) |
| Disk | Persistent | Ephemeral |
| Deploy | Авто | Авто (Blueprint) |
| Цена старта | $5 | $7 |

Render проще для старта через Blueprint, но Railway даёт больше ресурсов на Free tier.
