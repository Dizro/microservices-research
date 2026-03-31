class IAppointmentRepo {
    async save(appointment) {
        throw new Error('Метод не реализован');
    }

    async findById(id) {
        throw new Error('Метод не реализован');
    }

    async findByPatientId(patientId) {
        throw new Error('Метод не реализован');
    }

    async logSaga(sagaId, appointmentId, step, status, payload) {
        throw new Error('Метод не реализован');
    }

    // Event Sourcing методы
    async rebuildFromEvents(appointmentId) {
        throw new Error('Метод не реализован');
    }

    async getEventHistory(appointmentId) {
        throw new Error('Метод не реализован');
    }
}

module.exports = IAppointmentRepo;