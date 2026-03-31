# Medical Appointment System

Распределённая система онлайн-записи в медицинскую клинику на микросервисной архитектуре.

**Стек:** Node.js 18, PostgreSQL, MongoDB, RabbitMQ, Kafka, gRPC, GraphQL, Docker

---

## Архитектура

8 независимых сервисов с разделением ответственности:

| Сервис | Порт | Описание |
|--------|------|----------|
| API Gateway (Nginx) | 3000 | Маршрутизация, Rate Limiting, JWT auth |
| Auth Service | 3001 | JWT-аутентификация, PostgreSQL |
| Doctors Service | 3002 | Каталог врачей, MongoDB |
| Appointment Service | 3003 | Hexagonal Architecture, Event Sourcing |
| Payment Service | 3004 | gRPC + Circuit Breaker, Jaeger tracing |
| Notification Service | 3005 | Email через SMTP (Nodemailer) |
| Analytics Service | 3006 | CQRS Read Model, Kafka consumer |
| GraphQL Gateway | 4000 | API Composition (Apollo Server) |

## Реализованные паттерны

- **Saga (Choreography)** — распределённые транзакции через RabbitMQ с компенсирующими операциями
- **CQRS + Event Sourcing** — Command Side (Appointment) → Event Store (PostgreSQL) → Read Model (Analytics)
- **Transactional Outbox** — атомарная публикация событий, `FOR UPDATE SKIP LOCKED`
- **Circuit Breaker** — Opossum, защита gRPC-вызовов к Payment Service (fallback при 50% ошибок)
- **Hexagonal Architecture** — Appointment Service: Domain / Ports / Infrastructure
- **Service Discovery** — Consul, health checks каждые 10 сек

## Взаимодействие сервисов

```
REST    → API Gateway → Auth, Doctors, Appointments
gRPC    → Appointment → Payment (Circuit Breaker)
GraphQL → Gateway → Doctors + Appointments (API Composition)

RabbitMQ: appointment.created → payment.success/failed → notification.send
Kafka:    appointment-events → Analytics (CQRS Read Model)
```

## Результаты нагрузочного тестирования (k6)

| Метрика | Значение |
|---------|----------|
| Запросов всего | 2 907 |
| Throughput | 54 req/s |
| Среднее время ответа | 91 мс |
| 95-й перцентиль | 255 мс |

## Запуск

```bash
# Полный запуск (все сервисы + мониторинг + платёжный провайдер)
docker-compose --profile external up -d

# E2E тест
node tests/e2e-test.js

# Нагрузочный тест
docker-compose --profile test run k6
```

## Мониторинг

| Инструмент | URL |
|------------|-----|
| Grafana | http://localhost:3010 (admin/admin) |
| Jaeger (трассировка) | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| RabbitMQ | http://localhost:15672 |
| Consul | http://localhost:8500 |
```