class Appointment {
    constructor(id, patientId, doctorId, timeSlot, price, status = 'CREATED') {
        this.id = id;
        this.patientId = patientId;
        this.doctorId = doctorId;
        this.timeSlot = timeSlot;
        this.price = price;
        this.status = status;
    }

    confirm() {
        if (this.status === 'CANCELLED') {
            throw new Error('Нельзя подтвердить отмененную запись');
        }
        this.status = 'CONFIRMED';
    }

    cancel(reason) {
        this.status = 'CANCELLED';
        this.cancelReason = reason;
    }
}

module.exports = Appointment;