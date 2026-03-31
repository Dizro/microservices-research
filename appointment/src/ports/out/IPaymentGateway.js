class IPaymentGateway {
    async checkStatus(appointmentId) {
        throw new Error('Метод не реализован');
    }
}

module.exports = IPaymentGateway;