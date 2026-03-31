class ISagaEventHandler {
    async handlePaymentSuccess(appointmentId, transactionId) {
        throw new Error('Метод не реализован');
    }

    async handlePaymentFailed(appointmentId, reason) {
        throw new Error('Метод не реализован');
    }
}

module.exports = ISagaEventHandler;