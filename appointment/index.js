const express = require('express');
const Consul = require('consul');
const client = require('prom-client');
const { initTracer } = require('jaeger-client');
const { FORMAT_HTTP_HEADERS } = require('opentracing');
const AppointmentService = require('./src/application/AppointmentService');
const PostgresAdapter = require('./src/infrastructure/repository/PostgresAdapter');
const RabbitPublisher = require('./src/infrastructure/messaging/RabbitPublisher');
const GrpcClient = require('./src/infrastructure/rpc/GrpcClient');
const RabbitConsumer = require('./src/infrastructure/messaging/RabbitConsumer');
const ExpressController = require('./src/infrastructure/api/ExpressController');
const OutboxRelay = require('./src/infrastructure/messaging/OutboxRelay');

(async () => {
    const app = express();
    app.use(express.json());

    // 1. Настройка Jaeger
    const config = {
        serviceName: 'appointment-service',
        sampler: { type: 'const', param: 1 },
        reporter: { logSpans: true, collectorEndpoint: 'http://jaeger:14268/api/traces' }
    };
    const tracer = initTracer(config, { logger: console });
    global.tracer = tracer;

    // 2. Настройка Prometheus (Счетчик запросов)
    const httpRequestCounter = new client.Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'status']
    });

    // 3. Middleware (Ловит каждый запрос)
    app.use((req, res, next) => {
        // Jaeger Trace
        const parentCtx = tracer.extract(FORMAT_HTTP_HEADERS, req.headers);
        const span = tracer.startSpan(req.path, parentCtx ? { childOf: parentCtx } : {});
        global.currentSpan = span;

        res.on('finish', () => {
            // Запись метрик для Grafana
            httpRequestCounter.inc({ method: req.method, status: res.statusCode });

            // Завершение спана Jaeger
            span.setTag('http.status_code', res.statusCode);
            span.finish();
        });
        next();
    });

    client.collectDefaultMetrics(); // Сбор стандартных метрик (CPU, Память)

    const repo = new PostgresAdapter(`postgresql://admin:admin@${process.env.DB_HOST}:5432/appointment_db`);
    const publisher = new RabbitPublisher(process.env.RABBIT_URI);
    const service = new AppointmentService(repo, new GrpcClient(), publisher);

    app.use('/appointments', new ExpressController(service).router);
    app.get('/health', (req, res) => res.json({ status: 'UP' }));

    // Эндпоинт для Prometheus
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', client.register.contentType);
        res.send(await client.register.metrics());
    });

    for (let i = 0; i < 20; i++) {
        try {
            await repo.pool.query('SELECT 1');
            await publisher.connect();
            await new RabbitConsumer(process.env.RABBIT_URI, service).connect();
            await new OutboxRelay(process.env.DB_HOST, process.env.RABBIT_URI, process.env.KAFKA_BROKER).start();

            app.listen(3003, () => {
                console.log('Appointment Service (3003)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({
                    name: 'appointment', port: 3003, check: { http: 'http://appointment:3003/health', interval: '10s' }
                });
            });
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
})();