const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const Consul = require('consul');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const SECRET = 'medical-clinic-secret-key-2025';
const pool = new Pool({ connectionString: `postgresql://admin:admin@${process.env.DB_HOST}:5432/auth_db` });

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: { title: 'Auth Service API', version: '1.0.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
        paths: {
            '/auth/register': {
                post: {
                    summary: 'Регистрация',
                    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' }, role: { type: 'string' } } } } } },
                    responses: { 200: { description: 'OK' } }
                }
            },
            '/auth/login': {
                post: {
                    summary: 'Вход',
                    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' } } } } } },
                    responses: { 200: { description: 'JWT' } }
                }
            },
            '/auth/verify': { get: { summary: 'Проверка', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } } }
        }
    },
    apis: []
};

const router = express.Router();
router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

router.get('/health', (req, res) => res.json({ status: 'UP', service: 'auth' }));

router.post('/register', async (req, res) => {
    const { username, password, role = 'patient' } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing data' });
    try {
        const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (rows.length) return res.status(409).json({ error: 'User exists' });
        await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, password, role]);
        res.json({ message: 'Success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing data' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
        const user = rows[0];
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '24h' });
        res.json({ token, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/verify', (req, res) => {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) throw new Error();
        const decoded = jwt.verify(token, SECRET);
        res.json({ valid: true, ...decoded });
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
});

app.use(['/auth', '/'], router);

(async function start() {
    for (let i = 0; i < 20; i++) {
        try {
            await pool.query('SELECT 1');
            app.listen(3001, () => {
                console.log('Auth Service (3001)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({
                    name: 'auth', port: 3001, check: { http: 'http://auth:3001/health', interval: '10s' }
                });
            });
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
})();