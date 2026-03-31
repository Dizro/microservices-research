# Medical Appointment System 🏥

> Распределённая система онлайн-записи в медицинскую клинику на микросервисной архитектуре

**Домен:** Здравоохранение · **Поддомен:** Appointment Management · **Тип:** Курсовой проект (Архитектура ИС)

[![Node.js](https://img.shields.io/badge/Node.js-18-green?logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?logo=postgresql)](https://www.postgresql.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6-green?logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://www.docker.com/)
[![Kafka](https://img.shields.io/badge/Apache-Kafka-black?logo=apachekafka)](https://kafka.apache.org/)

---

## Обзор

Проект реализует **8 независимых микросервисов** с разделением ответственности по принципам Domain-Driven Design. Каждый сервис имеет собственную базу данных (Database per Service), независимо деплоится и масштабируется.

Мотивация проекта — практическое исследование производственных паттернов распределённых систем: как обеспечить консистентность данных без распределённых блокировок, защититься от каскадных отказов и гарантировать доставку событий.

---

## Архитектура

### C4 Level 1 — System Context

<img width="1116" height="980" alt="c4-level-2" src="https://github.com/user-attachments/assets/bed1b9cb-7410-4255-850c-6d6c37092c28" />

### C4 Level 2 — Container View

<img width="2187" height="1153" alt="c4-level-1" src="https://github.com/user-attachments/assets/8308edd2-e708-487b-84b9-a2f7d96ab18d" />

### Сервисы

| Сервис | Порт | БД | Описание |
|--------|------|----|----------|
| API Gateway (Nginx) | `3000` | — | Маршрутизация, Rate Limiting, JWT-валидация |
| Auth Service | `3001` | PostgreSQL | JWT-аутентификация, RBAC (patient / doctor / admin) |
| Doctors Service | `3002` | MongoDB | Каталог врачей, расписания, поиск по специализации |
| Appointment Service | `3003` | PostgreSQL | Hexagonal Architecture, Event Sourcing, Saga Orchestrator |
| Payment Service | `3004` | PostgreSQL | gRPC API (порт `50051`), Circuit Breaker, Jaeger tracing |
| Notification Service | `3005` | PostgreSQL | Email через Nodemailer, идемпотентная обработка |
| Analytics Service | `3006` | PostgreSQL | CQRS Read Model, Kafka consumer |
| GraphQL Gateway | `4000` | — | API Composition (Apollo Server) |

### Схема взаимодействия

```
REST    → API Gateway → Auth, Doctors, Appointments
gRPC    → Appointment → Payment (Circuit Breaker)
GraphQL → Gateway    → Doctors + Appointments (API Composition)

RabbitMQ: appointment.created → payment.success/failed → notification.send
Kafka:    appointment-events  → Analytics (CQRS Read Model)
```

---

## Реализованные паттерны

### 1. Saga (Choreography)

Распределённые транзакции через RabbitMQ без центрального оркестратора.

**Успешный сценарий:**
```
Пациент создаёт запись
  → [appointment.created] → Payment Service → внешний провайдер
  → [payment.success]     → статус CONFIRMED
  → [appointment.confirmed] → Notification Service → Email пациенту
```

**Компенсация при отказе:**
```
[payment.failed] → статус CANCELLED → [appointment.cancelled] → Email об отмене
```

Идемпотентность обеспечена через таблицу `processed_messages` (дедупликация по MD5-хешу тела сообщения).

### 2. CQRS + Event Sourcing

| Сторона | Сервис | Роль |
|---------|--------|------|
| Command Side | Appointment Service | Обрабатывает команды, пишет в Event Store |
| Event Store | PostgreSQL `event_store` | Append-only лог событий с версионированием |
| Event Bus | Apache Kafka | Трансляция событий в `appointment-events` |
| Query Side | Analytics Service | Построение агрегированных Read Model |

Реализовано восстановление состояния агрегата из событий (Event Replay).

### 3. Transactional Outbox

Решает проблему dual write — атомарной записи в БД и публикации в брокер.

- Событие пишется в таблицу `outbox` **в одной транзакции** с бизнес-данными
- Фоновый процесс (`OutboxRelay`) читает непубликованные записи через `FOR UPDATE SKIP LOCKED`
- Параллельно публикует в RabbitMQ (для Saga) и Kafka (для Event Sourcing)
- Помечает запись как `published = true`

### 4. Circuit Breaker (Opossum)

Защищает от каскадных отказов при недоступности Payment Service.

| Параметр | Значение |
|----------|----------|
| `timeout` | 3 000 мс |
| `errorThresholdPercentage` | 50% |
| `resetTimeout` | 10 000 мс |
| `fallback` | `FALLBACK_PROCESSING` |

### 5. Hexagonal Architecture (Appointment Service)

```
appointment/src/
├── domain/           # Бизнес-логика без зависимостей (Агрегат Appointment)
├── application/      # Use Cases: координация Saga и CQRS
├── ports/
│   ├── in/           # IAppointmentService, ISagaEventHandler
│   └── out/          # IAppointmentRepo, IPaymentGateway, IEventPublisher
└── infrastructure/   # Адаптеры: Express, PostgreSQL, gRPC, RabbitMQ, Outbox
```

---

## API

### REST (через API Gateway)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `POST` | `/auth/register` | Регистрация пользователя |
| `POST` | `/auth/login` | Вход → JWT token |
| `GET` | `/doctors/` | Список врачей (MongoDB) |
| `POST` | `/appointments/` | Создание записи, запуск Saga |
| `GET` | `/appointments/:id/events` | История событий (Event Sourcing) |
| `GET` | `/analytics/stats` | Статистика (CQRS Read Model) |

### gRPC (Payment Service, порт `50051`)

```protobuf
service PaymentService {
  rpc CheckPaymentStatus (PaymentRequest) returns (PaymentResponse);
}
```

### GraphQL (API Composition)

```graphql
query {
  appointmentsByUser(userId: "patient1") {
    id timeSlot price status
    doctor { name specialization }
  }
}
```

Единый запрос решает проблему N+1, объединяя данные Appointment и Doctors Service.

---

## Запуск

**Требования:** Docker, Docker Compose

```bash
# Клонировать репозиторий
git clone https://github.com/Dizro/microservices-research.git
cd microservices-research

# Запустить все сервисы + мониторинг + тестовый payment-provider
docker-compose --profile external up -d

# E2E тест
node tests/e2e-test.js

# Нагрузочный тест (k6)
docker-compose --profile test run k6
```

---

## Тестирование

### End-to-End

### Нагрузочное тестирование (k6)

Конфигурация: разогрев 10s → пиковая нагрузка 50 VU на 30s → охлаждение 10s.

| Метрика | Значение |
|---------|----------|
| Запросов всего | 2 907 |
| Успешные | 100% |
| Throughput | **54 req/s** |
| Среднее время ответа | **91 мс** |
| 95-й перцентиль | 255 мс |

<img width="2175" height="1011" alt="k6-results" src="https://github.com/user-attachments/assets/d0878365-8c47-4c27-83e4-6753e064dd4e" />

---

## Мониторинг (Observability Stack)

| Инструмент | URL | Назначение |
|------------|-----|------------|
| **Grafana** | `localhost:3010` *(admin/admin)* | Дашборды: RPS, latency, ресурсы |
| **Jaeger** | `localhost:16686` | Distributed Tracing (Appointment → Payment) |
| **Prometheus** | `localhost:9090` | Сбор метрик, scrape каждые 5 сек |
| **Loki + Promtail** | `localhost:3100` | Централизованные логи контейнеров |
| **RabbitMQ UI** | `localhost:15672` | Управление очередями Saga |
| **Consul** | `localhost:8500` | Service Discovery, health checks (10 сек) |
| **MailHog** | `localhost:8025` | Просмотр тестовых email-уведомлений |

<img width="2160" height="1119" alt="grafana" src="https://github.com/user-attachments/assets/d6ffd5eb-e9e6-4eab-8534-98617843a73e" />

<img width="2422" height="497" alt="jaeger" src="https://github.com/user-attachments/assets/6783a4c1-11d4-440f-a0c0-011c02bf99e4" />

---

## Технологический стек

| Категория | Технологии |
|-----------|-----------|
| Runtime | Node.js 18 |
| Фреймворки | Express, Apollo Server, Mongoose, Sequelize |
| Базы данных | PostgreSQL 15, MongoDB 6 |
| Брокеры | RabbitMQ 3.12, Apache Kafka 7.4 |
| RPC | gRPC (`@grpc/grpc-js` + Protocol Buffers) |
| API Gateway | Nginx (routing, rate limiting) |
| Resilience | Opossum (Circuit Breaker) |
| Мониторинг | Prometheus, Grafana, Jaeger, Loki, Promtail |
| Инфраструктура | Docker, Docker Compose |

---

## Литература

1. C. Richardson — *Microservices Patterns* (Manning, 2018)
2. V. Vernon — *Implementing Domain-Driven Design* (Addison-Wesley, 2013)
3. S. Newman — *Building Microservices* (O'Reilly, 2021)
4. M. Kleppmann — *Designing Data-Intensive Applications* (O'Reilly, 2017)
5. M. Fowler — [CQRS](https://martinfowler.com/bliki/CQRS.html), [Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
