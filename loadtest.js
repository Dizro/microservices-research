import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
};

const BASE_URL = 'http://gateway:3000';

export default function () {
  const user = { username: `u_${__VU}_${__ITER}`, password: '123' };
  const params = { headers: { 'Content-Type': 'application/json' } };

  http.post(`${BASE_URL}/auth/register`, JSON.stringify(user), params);
  
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(user), params);
  
  if (check(res, { 'Login 200': r => r.status === 200 })) {
    const token = res.json('token');
    
    const appt = http.post(`${BASE_URL}/appointments/`, JSON.stringify({
      patientId: user.username, doctorId: '676dfa6e2e0a9c8d4c5b1234', timeSlot: '10:00', price: 2500
    }), { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });

    check(appt, { 'Created 201': r => r.status === 201 });
  }
  sleep(1);
}