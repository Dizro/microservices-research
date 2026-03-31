class IAppointmentService {
    async createAppointment(patientId, doctorId, timeSlot, price) {
        throw new Error('Метод не реализован');
    }
    
    async getById(id) {
        throw new Error('Метод не реализован');
    }
}

module.exports = IAppointmentService;