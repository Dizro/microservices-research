const { Kafka } = require('kafkajs');
const amqp = require('amqplib');
const { Pool } = require('pg');

class OutboxRelay {
    constructor(host, rabbitUri, kafkaBroker) {
        this.pool = new Pool({ connectionString: `postgresql://admin:admin@${host}:5432/appointment_db` });
        this.rabbitUri = rabbitUri;
        this.kafkaBroker = kafkaBroker;
    }

    async start() {
        for (let i = 0; i < 15; i++) {
            try {
                const conn = await amqp.connect(this.rabbitUri);
                this.channel = await conn.createChannel();
                console.log('[OUTBOX] RabbitMQ connected');
                break;
            } catch (e) {
                console.log('[OUTBOX] Waiting for RabbitMQ...');
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        this.producer = new Kafka({ clientId: 'appointment', brokers: [this.kafkaBroker], retry: { retries: 10 } }).producer();
        try {
            await this.producer.connect();
            console.log('[OUTBOX] Kafka connected');
        } catch (e) { console.log('[OUTBOX] Kafka failed'); }

        setInterval(() => this.process(), 1000);
    }

    async process() {
        if (!this.channel) return; 
        const client = await this.pool.connect();
        try {
            const { rows } = await client.query('SELECT * FROM outbox WHERE published = false LIMIT 10 FOR UPDATE SKIP LOCKED');
            for (const { id, payload } of rows) {
                const event = payload; 
                
                if (event.type === 'appointment.created') {
                    await this.channel.assertQueue(event.type);
                    this.channel.sendToQueue(event.type, Buffer.from(JSON.stringify(event.data)), { headers: event.tracing || {} });
                }
                
                try {
                    await this.producer.send({ topic: 'appointment-events', messages: [{ value: JSON.stringify(event) }] });
                } catch (err) { console.log('Kafka send error, skipping'); }
                
                await client.query('UPDATE outbox SET published = true WHERE id = $1', [id]);
            }
        } catch (e) { console.error('[OUTBOX ERROR]', e.message); } 
        finally { client.release(); }
    }
}

module.exports = OutboxRelay;