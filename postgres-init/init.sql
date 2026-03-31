CREATE DATABASE auth_db;
CREATE DATABASE appointment_db;
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;
CREATE DATABASE analytics_db;

\c auth_db;
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'patient',
    created_at TIMESTAMP DEFAULT NOW()
);

\c appointment_db;
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    doctor_id VARCHAR(50) NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    price INT NOT NULL,
    status VARCHAR(20) DEFAULT 'CREATED',
    version INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_outbox_published ON outbox(published) WHERE published = false;

CREATE TABLE IF NOT EXISTS saga_log (
    saga_id VARCHAR(50) PRIMARY KEY,
    appointment_id VARCHAR(50) NOT NULL,
    current_step VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_store (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    version INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_event_store_aggregate ON event_store(aggregate_id);

\c payment_db;
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    appt_id VARCHAR(50) UNIQUE NOT NULL,
    amount INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    transaction_id VARCHAR(100),
    provider_response JSONB,  -- ✅ ВОТ ЭТА СТРОКА БЫЛА ПРОПУЩЕНА
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT NOW()
);

\c notification_db;
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT NOW()
);

\c analytics_db;
CREATE TABLE IF NOT EXISTS stats (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_stats_event_type ON stats(event_type);
CREATE INDEX idx_stats_created_at ON stats(created_at);