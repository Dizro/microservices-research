const amqp = require('amqplib');
const Consul = require('consul');
const express = require('express');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const pool = new Pool({ connectionString: `postgresql://admin:admin@${process.env.DB_HOST}:5432/notification_db` });

const smtp = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER || 'test@example.com', pass: process.env.SMTP_PASS || 'testpass' }
};

const transporter = nodemailer.createTransport(smtp);
transporter.verify((err) => console.log(err ? '[SMTP] Error' : '[SMTP] Ready'));

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'notification', smtp: { host: smtp.host, port: smtp.port } }));

async function sendEmail(to, text) {
    try {
        await transporter.sendMail({
            from: smtp.auth.user, to: `${to}@clinic.ru`, subject: 'Medical Clinic',
            html: `<div style="padding: 20px;"><h2>Medical Clinic</h2><hr><p>${text}</p><hr><small>Auto-notification</small></div>`
        });
        console.log(`[EMAIL] Sent to ${to}`);
        return true;
    } catch (e) { console.log(`[EMAIL ERROR] ${e.message}`); return false; }
}

(async () => {
    for (let i = 0; i < 20; i++) {
        try {
            await pool.query('SELECT 1');
            await pool.query('CREATE TABLE IF NOT EXISTS processed_messages (message_id VARCHAR(255) PRIMARY KEY)');
            
            const conn = await amqp.connect(process.env.RABBIT_URI);
            const ch = await conn.createChannel();
            await ch.assertQueue('notification.send');

            ch.consume('notification.send', async (msg) => {
                if (!msg) return;
                const id = msg.properties.messageId || crypto.createHash('md5').update(msg.content.toString()).digest('hex');
                try {
                    const { rows } = await pool.query('SELECT 1 FROM processed_messages WHERE message_id = $1', [id]);
                    if (rows.length) return ch.ack(msg);

                    const { userId, msg: text } = JSON.parse(msg.content.toString());
                    await sendEmail(userId, text);
                    
                    await pool.query('INSERT INTO processed_messages (message_id) VALUES ($1)', [id]);
                    ch.ack(msg);
                } catch (e) { ch.nack(msg); }
            });

            app.listen(3005, () => {
                console.log('Notification Service (3005)');
                new Consul({ host: 'consul', port: 8500 }).agent.service.register({
                    name: 'notification', port: 3005, check: { http: 'http://notification:3005/health', interval: '10s' }
                });
            });
            break;
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
})();