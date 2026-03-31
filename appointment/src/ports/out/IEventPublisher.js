class IEventPublisher {
    async publish(topic, message) {
        throw new Error('Метод не реализован');
    }
}

module.exports = IEventPublisher;