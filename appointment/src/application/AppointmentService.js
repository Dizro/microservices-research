const Appointment = require('../domain/Appointment');

class AppointmentService {
    constructor(repo, payment, publisher) {
        this.repo = repo;
        this.payment = payment;
        this.publisher = publisher;
    }

    async createAppointment(patientId, doctorId, timeSlot, price) {
        const id = 'appt-' + Date.now();
        const appt = new Appointment(id, patientId, doctorId, timeSlot, price);
        
        await this.repo.save(appt);
        await this.repo.logSaga(id, id, 'INIT', 'STARTED', { price, patientId });
        
        return appt;
    }

    async getById(id) {
        return await this.repo.findById(id);
    }

    async getByPatientId(patientId) {
        return await this.repo.findByPatientId(patientId);
    }

    async checkPaymentStatus(id) {
        try {
            return await this.payment.checkStatus(id);
        } catch (e) {
            return 'UNAVAILABLE';
        }
    }

    async handlePaymentSuccess(id, transactionId) {
        const appt = await this.repo.findById(id);
        if (!appt) return;

        appt.confirm();
        await this.repo.save(appt);
        await this.repo.logSaga(id, id, 'PAYMENT', 'COMPLETED', { transactionId });
        await this.publisher.publish('appointment.confirmed', { id, transactionId });
    }

    async handlePaymentFailed(id, reason) {
        const appt = await this.repo.findById(id);
        if (!appt) return;

        appt.cancel(reason);
        await this.repo.save(appt);
        await this.repo.logSaga(id, id, 'PAYMENT', 'FAILED', { reason });
        await this.publisher.publish('appointment.cancelled', { id, reason });
    }
}

module.exports = AppointmentService;