const http = require('http');

async function request(method, path, data, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    console.log(`⚠️ Ответ не JSON (${res.statusCode}):`, body.substring(0, 50));
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`❌ Сетевая ошибка при ${method} ${path}:`, e.message);
            reject(e);
        });

        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

(async () => {
    console.log('=== E2E Debug Start ===');
    const user = { username: `test_${Date.now()}`, password: '123' };

    try {
        console.log('1. Проверка доступности Gateway...');
        try {
            await request('GET', '/auth/health');
            console.log('✅ Gateway доступен');
        } catch (e) {
            throw new Error('Gateway (localhost:3000) недоступен. Проверь docker-compose logs gateway');
        }

        console.log('2. Регистрация...');
        const reg = await request('POST', '/auth/register', user);
        if (reg.status !== 200) throw new Error(`Регистрация: ${reg.status} ${JSON.stringify(reg.data)}`);

        console.log('3. Вход...');
        const login = await request('POST', '/auth/login', user);
        const token = login.data.token;
        if (!token) throw new Error(`Вход: нет токена. ${JSON.stringify(login.data)}`);

        console.log('4. Список врачей...');
        const doctors = await request('GET', '/doctors/', null, token);
        const docId = doctors.data[0]?._id;
        if (!docId) throw new Error('Нет врачей (массив пуст)');

        console.log('5. Создание записи...');
        const appt = await request('POST', '/appointments/', {
            patientId: user.username, doctorId: docId, timeSlot: '10:00', price: 2000
        }, token);
        
        if (appt.status !== 201) throw new Error(`Создание записи: ${appt.status} ${JSON.stringify(appt.data)}`);
        const apptId = appt.data.id;
        console.log(`✅ Запись создана: ${apptId}. Ждем оплаты...`);

        await new Promise(r => setTimeout(r, 4000));

        console.log('6. Проверка статуса...');
        const final = await request('GET', `/appointments/${apptId}`, null, token);
        console.log(`📊 ИТОГОВЫЙ СТАТУС: ${final.data.status}`);

        if (final.data.status === 'CONFIRMED') console.log('🎉 SUCCESS!');
        else console.log('⚠️ FAIL: Статус не обновился.');

    } catch (e) {
        console.error('\n🛑 CRITICAL ERROR:', e.message);
    }
})();