const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const Consul = require('consul');
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const pool = new Pool({ connectionString: `postgresql://admin:admin@${process.env.DB_HOST}:5432/analytics_db` });

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: { title: 'Analytics Service API', version: '1.0.0' },
        paths: { '/analytics/stats': { get: { summary: 'Статистика', responses: { 200: { description: 'OK' } } } } }
    },
    apis: [],
};

app.use(['/api-docs', '/analytics/api-docs'], swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

app.get(['/analytics/health', '/health'], (req, res) => res.json({ status: 'UP', service: 'analytics' }));

app.get('/analytics/stats', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT event_type, COUNT(*) as count FROM stats GROUP BY event_type');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/analytics/revenue', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT SUM((data::json->>'price')::int) as total_revenue FROM stats WHERE event_type = 'CREATED'`);
        res.json({ total_revenue: rows[0].total_revenue || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/analytics/appointments-count', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT COUNT(*) as total FROM stats WHERE event_type = 'CREATED'`);
        res.json({ total_appointments: parseInt(rows[0].total) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

async function runKafka() {
    try {
        const consumer = new Kafka({ clientId: 'analytics', brokers: ['kafka:29092'] }).consumer({ groupId: 'analytics-group' });
        await consumer.connect();
        await consumer.subscribe({ topic: 'appointment-events', fromBeginning: true });
        await consumer.run({
            eachMessage: async ({ message }) => {
                const event = JSON.parse(message.value.toString());
                await pool.query('INSERT INTO stats (event_type, data) VALUES ($1, $2)', [event.type, JSON.stringify(event.data)]);
            },
        });
    } catch (e) { setTimeout(runKafka, 5000); }
}

(async function startApp() {
    for (let i = 0; i < 20; i++) {
        try {
            await pool.query('SELECT 1');
            await pool.query(`CREATE TABLE IF NOT EXISTS stats (id SERIAL PRIMARY KEY, event_type VARCHAR(50), data TEXT, created_at TIMESTAMP DEFAULT NOW())`);
            runKafka();
            app.listen(3006, () => {
                console.log('Analytics Service (3006)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({ name: 'analytics', port: 3006 });
            });
            break;
        } catch (err) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }
})();