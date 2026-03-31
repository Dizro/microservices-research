const express = require('express');
const mongoose = require('mongoose');
const Consul = require('consul');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const Doctor = mongoose.model('Doctor', { name: String, specialization: String, price: Number, schedule: [String] });

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: { title: 'Doctors Service API', version: '1.0.0' },
        paths: { '/doctors': { get: { summary: 'Список врачей', responses: { 200: { description: 'OK' } } } } }
    },
    apis: [],
};

const router = express.Router();
router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

router.get('/health', (req, res) => res.json({ status: 'UP', service: 'doctors' }));

router.get('/', async (req, res) => res.json(await Doctor.find()));

router.get('/:id', async (req, res) => {
    try {
        const doc = await Doctor.findById(req.params.id);
        doc ? res.json(doc) : res.status(404).json({ error: 'Not found' });
    } catch (e) { res.status(400).json({ error: 'Invalid ID' }); }
});

router.post('/', async (req, res) => {
    try { res.status(201).json(await Doctor.create(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

app.use(['/doctors', '/'], router);

(async () => {
    for (let i = 0; i < 20; i++) {
        try {
            await mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/doctors_db');
            if (await Doctor.countDocuments() === 0) {
                await Doctor.create([
                    { name: "Др. Иванов", specialization: "Терапевт", price: 2000, schedule: ["09:00", "10:00"] },
                    { name: "Др. Петрова", specialization: "Хирург", price: 3500, schedule: ["10:00", "11:00"] }
                ]);
            }
            app.listen(3002, () => {
                console.log('Doctors Service (3002)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({ name: 'doctors', port: 3002 });
            });
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
})();