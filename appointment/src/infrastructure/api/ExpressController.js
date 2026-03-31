const express = require('express');

class ExpressController {
    constructor(service) {
        this.service = service;
        this.router = express.Router();

        this.router.post('/', async (req, res) => {
            try {
                await new Promise(r => setTimeout(r, 250)); 

                const { patientId, doctorId, timeSlot, price } = req.body;
                res.status(201).json(await this.service.createAppointment(patientId, doctorId, timeSlot, price));
            } catch (e) { res.status(500).json({ error: e.message }); }
        });

        this.router.get('/:id', async (req, res) => {
            const result = await this.service.getById(req.params.id);
            result ? res.json(result) : res.status(404).json({ error: 'Not found' });
        });

        this.router.get('/user/:userId', async (req, res) => {
            try { res.json(await this.service.getByPatientId(req.params.userId)); }
            catch (e) { res.status(500).json({ error: e.message }); }
        });

        this.router.get('/:id/payment-status', async (req, res) => {
            try {
                const appt = await this.service.getById(req.params.id);
                if (!appt) return res.status(404).json({ error: 'Not found' });
                const status = await this.service.checkPaymentStatus(req.params.id);
                res.json({ appointmentId: req.params.id, appointmentStatus: appt.status, paymentStatus: status, message: 'Checked' });
            } catch (e) { res.status(500).json({ error: e.message }); }
        });

        this.router.get('/:id/events', async (req, res) => {
            try {
                const events = await this.service.repo.getEventHistory(req.params.id);
                res.json({ appointmentId: req.params.id, events, totalEvents: events.length });
            } catch (e) { res.status(500).json({ error: e.message }); }
        });

        this.router.get('/:id/rebuild', async (req, res) => {
            try {
                const result = await this.service.repo.rebuildFromEvents(req.params.id);
                result ? res.json({ message: 'Rebuilt', appointment: result }) : res.status(404).json({ error: 'Not found' });
            } catch (e) { res.status(500).json({ error: e.message }); }
        });
    }
}

module.exports = ExpressController;