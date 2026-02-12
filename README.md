# HabitMax Bot

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)

> Production-ready чат-бот для мессенджера Max (платформа МТС/Макс) с мини-приложением. Помощник для формирования привычек и напоминаний о приёме лекарств.

## 🚀 Быстрый старт

```bash
# Клонирование репозитория
git clone https://github.com/habitmax/bot.git
cd habitmax-bot

# Настройка переменных окружения
cp .env.example .env
# Отредактируйте .env файл

# Запуск через Docker Compose
docker-compose up -d

# Или локальный запуск
cd backend && npm install && npm run dev
```

## 📋 Содержание

- [Архитектура](#архитектура)
- [Технологии](#технологии)
- [Установка](#установка)
- [Конфигурация](#конфигурация)
- [API](#api)
- [Модерация](#модерация)
- [Лицензия](#лицензия)

## 🏗 Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Max Platform  │────▶│   Node.js API    │────▶│   PostgreSQL    │
│   (platform-api │     │   (Express.js)   │     │   (Data)        │
│    .max.ru)     │◀────│                  │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Redis (BullMQ) │
                        │   (Queue/Cache)  │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   MinIO (S3)     │
                        │   (File Storage) │
                        └──────────────────┘
```

## 🛠 Технологии

### Backend
- **Node.js 18+** — Runtime
- **Express.js** — Web framework
- **PostgreSQL 14+** — Database
- **Redis** — Queue (BullMQ) & Cache
- **MinIO** — S3-compatible storage

### Frontend (Mini App)
- **React 18+** — UI library
- **TypeScript** — Type safety
- **@maxhub/max-ui** — Max UI components
- **Zustand** — State management
- **React Query** — Data fetching
- **Recharts** — Charts

### DevOps
- **Docker** — Containerization
- **Docker Compose** — Orchestration

## 📦 Установка

### Требования
- Node.js 18+
- Docker & Docker Compose
- Git

### Шаги установки

1. **Клонирование**
```bash
git clone https://github.com/habitmax/bot.git
cd habitmax-bot
```

2. **Настройка окружения**
```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
# Max API
MAX_API_TOKEN=your_token_here
MAX_API_URL=https://platform-api.max.ru
WEBHOOK_URL=https://your-domain.com/webhook

# Database
DB_PASSWORD=secure_password

# Redis
REDIS_PASSWORD=optional_password

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# JWT
JWT_SECRET=your_jwt_secret_key
```

3. **Запуск**
```bash
docker-compose up -d
```

4. **Проверка**
```bash
curl http://localhost:3000/health
```

## ⚙️ Конфигурация

### Переменные окружения

| Переменная | Описание | Обязательная |
|------------|----------|--------------|
| `MAX_API_TOKEN` | Токен от Max Platform API | ✅ |
| `WEBHOOK_URL` | HTTPS URL для вебхука | ✅ |
| `DB_PASSWORD` | Пароль PostgreSQL | ✅ |
| `JWT_SECRET` | Секрет для JWT | ✅ |
| `REDIS_PASSWORD` | Пароль Redis (опционально) | ❌ |
| `MINIO_*` | Настройки MinIO | ❌ |

### Настройка вебхука

```bash
# Установка вебхука
curl -X POST https://platform-api.max.ru/subscriptions \
  -H "Authorization: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

## 📡 API

### REST API Endpoints

#### Аутентификация
```http
POST /api/auth/exchange    # Обмен кода на JWT
POST /api/auth/refresh     # Обновление токена
```

#### Рутины
```http
GET    /api/routines       # Список рутин
POST   /api/routines       # Создание рутины
PATCH  /api/routines/:id   # Обновление
DELETE /api/routines/:id   # Удаление
```

#### Напоминания
```http
GET   /api/reminders/today        # На сегодня
POST  /api/reminders/:id/complete # Отметить выполненным
POST  /api/reminders/:id/postpone # Отложить
```

#### Статистика
```http
GET /api/stats           # Статистика пользователя
GET /api/achievements    # Достижения
```

### Webhook

```http
POST /webhook
Content-Type: application/json

{
  "message": {
    "from": { "id": 123, "username": "user" },
    "text": "/start"
  }
}
```

## 📋 Модерация

Для прохождения модерации на платформе Max необходимо:

1. **Подготовить документы:**
   - [Описание бота](docs/moderation-checklist.md)
   - [Политика конфиденциальности](docs/privacy-policy.md)
   - Скриншоты всех экранов

2. **Проверить требования:**
   - ✅ Нет ИИ в рантайме
   - ✅ Соответствие 152-ФЗ/GDPR
   - ✅ Rate limiting (30 RPS)
   - ✅ Payload ≤128 символов

3. **Заполнить заявку:**
   - Название: HabitMax
   - Категория: Здоровье
   - Описание: см. [moderation-checklist.md](docs/moderation-checklist.md)

## 🧪 Тестирование

```bash
# Backend tests
cd backend && npm test

# E2E tests (в разработке)
npm run test:e2e
```

## 📈 Мониторинг

### Health Check
```bash
curl http://localhost:3000/health
```

### Метрики очередей
```bash
# Redis CLI
redis-cli
> LLEN bull:reminders:wait
> LLEN bull:escalation:wait
```

## 🛡️ Безопасность

- ✅ HTTPS-only
- ✅ JWT аутентификация
- ✅ Rate limiting
- ✅ SQL-инъекции защита
- ✅ XSS защита
- ✅ CSRF защита

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing`)
5. Откройте Pull Request

## 📝 Лицензия

[MIT](LICENSE) © 2026 HabitMax

## 📞 Контакты

- **Email:** support@habitmax.ru
- **Telegram:** @habitmax_support
- **Сайт:** https://habitmax.ru

---

<p align="center">
  Сделано с ❤️ в России
</p>
