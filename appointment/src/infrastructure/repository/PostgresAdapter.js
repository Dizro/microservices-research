const { Pool } = require('pg');
const { FORMAT_TEXT_MAP } = require('opentracing');
const IAppointmentRepo = require('../../ports/out/IAppointmentRepo');
const Appointment = require('../../domain/Appointment');

class PostgresAdapter extends IAppointmentRepo {
    constructor(conn) { super(); this.pool = new Pool({ connectionString: conn }); }

    async save(appt) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(`
                INSERT INTO appointments (id, patient_id, doctor_id, time_slot, price, status, version) 
                VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT (id) DO UPDATE SET status = $6, version = appointments.version + 1 RETURNING version`, 
                [appt.id, appt.patientId, appt.doctorId, appt.timeSlot, appt.price, appt.status]);
            
            const eventType = { 'CREATED': 'appointment.created', 'CONFIRMED': 'appointment.confirmed', 'CANCELLED': 'appointment.cancelled' }[appt.status] || 'appointment.updated';
            const eventData = { ...appt, timestamp: new Date().toISOString() };
            
            const headers = {};
            if (global.tracer && global.currentSpan) {
                global.tracer.inject(global.currentSpan.context(), FORMAT_TEXT_MAP, headers);
            }

            await client.query(`INSERT INTO event_store (aggregate_id, event_type, event_data, version) VALUES ($1, $2, $3, $4)`, 
                [appt.id, eventType, JSON.stringify(eventData), rows[0].version]);
            
            await client.query(`INSERT INTO outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)`, 
                [appt.id, eventType, JSON.stringify({ type: eventType, data: eventData, tracing: headers })]);
            
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }

    async findById(id) {
        const { rows } = await this.pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
        return rows.length ? new Appointment(rows[0].id, rows[0].patient_id, rows[0].doctor_id, rows[0].time_slot, rows[0].price, rows[0].status) : null;
    }

    async findByPatientId(pid) {
        const { rows } = await this.pool.query('SELECT * FROM appointments WHERE patient_id = $1 ORDER BY created_at DESC', [pid]);
        return rows.map(r => new Appointment(r.id, r.patient_id, r.doctor_id, r.time_slot, r.price, r.status));
    }

    async rebuildFromEvents(id) {
        const { rows } = await this.pool.query('SELECT event_type, event_data FROM event_store WHERE aggregate_id = $1 ORDER BY version ASC', [id]);
        if (!rows.length) return null;
        
        let appt = null;
        for (const { event_type, event_data } of rows) {
            const data = JSON.parse(event_data);
            if (event_type === 'appointment.created') appt = new Appointment(data.id, data.patientId, data.doctorId, data.timeSlot, data.price, 'CREATED');
            else if (appt) event_type === 'appointment.confirmed' ? appt.confirm() : appt.cancel('Payment Failed');
        }
        return appt;
    }

    async getEventHistory(id) {
        const { rows } = await this.pool.query('SELECT event_type, event_data, version, created_at FROM event_store WHERE aggregate_id = $1 ORDER BY version ASC', [id]);
        return rows.map(r => ({ type: r.event_type, data: JSON.parse(r.event_data), version: r.version, timestamp: r.created_at }));
    }

    async logSaga(sid, aid, step, status, payload) {
        await this.pool.query(`INSERT INTO saga_log (saga_id, appointment_id, current_step, status, payload) VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (saga_id) DO UPDATE SET current_step = $3, status = $4, updated_at = NOW()`, [sid, aid, step, status, JSON.stringify(payload)]);
    }
}

module.exports = PostgresAdapter;