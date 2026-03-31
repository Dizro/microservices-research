const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'payment-provider' }));

app.post('/api/payments/process', async (req, res) => {
    const { orderId, amount, currency } = req.body;
    console.log(`[ПЛАТЕЖНЫЙ ПРОВАЙДЕР] Получен запрос на обработку платежа`);
    console.log(`[ЗАКАЗ] ID: ${orderId}`);
    console.log(`[СУММА] ${amount} ${currency}`);

    await new Promise(r => setTimeout(r, 1000));

    if (amount < 5000) {
        const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log(`[УСПЕХ] Платеж одобрен. ID транзакции: ${transactionId}`);
        res.json({ status: 'SUCCESS', transactionId, orderId, amount, currency, timestamp: new Date().toISOString() });
    } else {
        console.log(`[ОТКАЗ] Платеж отклонен. Сумма превышает лимит.`);
        res.json({ status: 'FAILED', orderId, amount, currency, errorCode: 'INSUFFICIENT_FUNDS', errorMessage: 'Недостаточно средств или превышен лимит', timestamp: new Date().toISOString() });
    }
});

app.post('/api/payments/refund', async (req, res) => {
    const { transactionId, amount } = req.body;
    console.log(`[ПЛАТЕЖНЫЙ ПРОВАЙДЕР] Получен запрос на возврат средств`);
    console.log(`[ТРАНЗАКЦИЯ] ID: ${transactionId}`);
    console.log(`[СУММА ВОЗВРАТА] ${amount}`);

    await new Promise(r => setTimeout(r, 500));

    const refundId = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log(`[ВОЗВРАТ ВЫПОЛНЕН] ID возврата: ${refundId}`);
    res.json({ status: 'REFUNDED', refundId, transactionId, amount, timestamp: new Date().toISOString() });
});

app.listen(3007, () => {
    console.log('Платежный провайдер запущен на порту 3007');
    console.log('Доступные эндпоинты:');
    console.log('  POST /api/payments/process - обработка платежа');
    console.log('  POST /api/payments/refund - возврат средств');
});