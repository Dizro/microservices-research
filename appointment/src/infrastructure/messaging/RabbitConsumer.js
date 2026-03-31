const amqp = require('amqplib');

class RabbitConsumer {
    constructor(uri, handler) {
        this.uri = uri;
        this.handler = handler;
    }

    async connect() {
        const conn = await amqp.connect(this.uri);
        const ch = await conn.createChannel();

        await ch.assertQueue('payment.success');
        await ch.assertQueue('payment.failed');

        ch.consume('payment.success', async (msg) => {
            const { orderId, transactionId } = JSON.parse(msg.content.toString());
            await this.handler.handlePaymentSuccess(orderId, transactionId);
            ch.ack(msg);
        });

        ch.consume('payment.failed', async (msg) => {
            const { orderId } = JSON.parse(msg.content.toString());
            await this.handler.handlePaymentFailed(orderId, 'Payment Failed');
            ch.ack(msg);
        });
    }
}

module.exports = RabbitConsumer;