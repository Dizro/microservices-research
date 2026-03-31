const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const client = require('prom-client');
const { initTracer } = require('jaeger-client');
const { FORMAT_TEXT_MAP } = require('opentracing');
const axios = require('axios');
const crypto = require('crypto');
const Consul = require('consul');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(express.json());

const tracer = initTracer({ serviceName: 'payment-service', sampler: { type: 'const', param: 1 }, reporter: { logSpans: true, collectorEndpoint: 'http://jaeger:14268/api/traces' } }, { logger: console });
const pool = new Pool({ connectionString: `postgresql://admin:admin@${process.env.DB_HOST}:5432/payment_db` });
const PROVIDER_URL = process.env.PAYMENT_PROVIDER_URL || 'http://payment-provider:3007';

client.collectDefaultMetrics();
app.get('/metrics', async (req, res) => { res.set('Content-Type', client.register.contentType); res.send(await client.register.metrics()); });

const swaggerOptions = { definition: { openapi: '3.0.0', info: { title: 'Payment API', version: '1.0.0' }, paths: { '/health': { get: { responses: { 200: { description: 'OK' } } } } } }, apis: [] };
app.use(['/api-docs', '/payments/api-docs'], swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

app.get(['/payments/health', '/health'], (req, res) => res.json({ status: 'UP', service: 'payment', provider: { url: PROVIDER_URL } }));

async function processPayment(orderId, amount, span) {
    try {
        const { data } = await axios.post(`${PROVIDER_URL}/api/payments/process`, 
            { orderId, amount, currency: 'RUB', metadata: { timestamp: new Date() } },
            { headers: { 'X-Trace-Id': span.context().toTraceId() } }
        );
        return data;
    } catch (e) { return { status: 'FAILED', errorMessage: e.message, transactionId: null }; }
}

async function startRabbit() {
    try {
        const conn = await amqp.connect(process.env.RABBIT_URI);
        const ch = await conn.createChannel();
        await ch.assertQueue('appointment.created');

        ch.consume('appointment.created', async (msg) => {
            if (!msg) return;
            
            const headers = msg.properties.headers || {};
            const parentCtx = tracer.extract(FORMAT_TEXT_MAP, headers);
            const span = tracer.startSpan('process_payment', parentCtx ? { childOf: parentCtx } : {});
            
            const content = msg.content.toString();
            const msgId = crypto.createHash('md5').update(content).digest('hex');

            try {
                if ((await pool.query('SELECT 1 FROM processed_messages WHERE message_id = $1', [msgId])).rows.length) return ch.ack(msg);

                const data = JSON.parse(content);
                const res = await processPayment(data.id, data.price, span);
                const success = res.status === 'SUCCESS';

                const db = await pool.connect();
                try {
                    await db.query('BEGIN');
                    await db.query('INSERT INTO payments (appt_id, amount, status, transaction_id, provider_response) VALUES ($1, $2, $3, $4, $5)', [data.id, data.price, success ? 'PAID' : 'FAILED', res.transactionId, JSON.stringify(res)]);
                    await db.query('INSERT INTO processed_messages (message_id) VALUES ($1)', [msgId]);
                    await db.query('COMMIT');
                } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }

                const replyQueue = success ? 'payment.success' : 'payment.failed';
                ch.sendToQueue(replyQueue, Buffer.from(JSON.stringify({ orderId: data.id, transactionId: res.transactionId, provider: PROVIDER_URL })));
                
                const notifMsg = success ? `Оплата прошла. Транзакция: ${res.transactionId}` : `Оплата не прошла: ${res.errorMessage}`;
                ch.sendToQueue('notification.send', Buffer.from(JSON.stringify({ userId: data.patientId, msg: notifMsg })));

                ch.ack(msg);
            } catch (e) { ch.nack(msg); } finally { span.finish(); }
        });
    } catch (e) { setTimeout(startRabbit, 5000); }
}

const paymentProto = grpc.loadPackageDefinition(protoLoader.loadSync('payment.proto')).payment;
const server = new grpc.Server();
server.addService(paymentProto.PaymentService.service, {
    CheckPaymentStatus: async (call, cb) => {
        try {
            const { rows } = await pool.query('SELECT status FROM payments WHERE appt_id = $1 ORDER BY created_at DESC LIMIT 1', [call.request.appointmentId]);
            cb(null, { status: rows.length ? rows[0].status : 'NOT_FOUND' });
        } catch (e) { cb(null, { status: 'ERROR' }); }
    }
});

(async () => {
    for (let i = 0; i < 20; i++) {
        try {
            await pool.query('SELECT 1');
            await pool.query('CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY, appt_id VARCHAR(50), amount INT, status VARCHAR(20), transaction_id VARCHAR(100), provider_response JSONB, created_at TIMESTAMP DEFAULT NOW())');
            await pool.query('CREATE TABLE IF NOT EXISTS processed_messages (message_id VARCHAR(255) PRIMARY KEY, processed_at TIMESTAMP DEFAULT NOW())');
            
            server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => { server.start(); console.log('gRPC (50051)'); });
            startRabbit();
            app.listen(3004, () => {
                console.log('Payment Service (3004)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({ name: 'payment', port: 3004, check: { http: 'http://payment:3004/health', interval: '10s' } });
            });
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
})();