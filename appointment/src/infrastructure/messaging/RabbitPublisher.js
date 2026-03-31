const amqp = require('amqplib');
const { FORMAT_TEXT_MAP } = require('opentracing'); // ВАЖНО
const IEventPublisher = require('../../ports/out/IEventPublisher');

class RabbitPublisher extends IEventPublisher {
    constructor(uri) { super(); this.uri = uri; }

    async connect() {
        this.channel = await (await amqp.connect(this.uri)).createChannel();
    }

    async publish(topic, msg) {
        if (!this.channel) await this.connect();
        await this.channel.assertQueue(topic);

        // Внедряем Trace ID в заголовки сообщения
        const headers = {};
        if (global.tracer && global.currentSpan) {
            global.tracer.inject(global.currentSpan.context(), FORMAT_TEXT_MAP, headers);
        }

        // Отправляем сообщение с заголовками
        this.channel.sendToQueue(topic, Buffer.from(JSON.stringify(msg)), { headers });
    }
}

module.exports = RabbitPublisher;