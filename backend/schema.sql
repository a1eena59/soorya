CREATE EXTENSION IF NOT EXISTS timescaledb;

-- All days are Indian days: makes time::date and date filters use IST
ALTER DATABASE soorya SET timezone TO 'Asia/Kolkata';

-- Reference tables ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS locations (
    name        TEXT PRIMARY KEY,
    district    TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS installers (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS systems (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    owner_name      TEXT,
    location        TEXT NOT NULL REFERENCES locations(name),
    capacity_kw     DOUBLE PRECISION NOT NULL,
    install_date    DATE NOT NULL,
    warranty_until  DATE,
    installer_id    INT REFERENCES installers(id),
    source          TEXT NOT NULL DEFAULT 'simulated'   -- simulated | csv
);
-- Commissioning baseline: this roof's median actual/expected in its first 30 days
ALTER TABLE systems ADD COLUMN IF NOT EXISTS baseline DOUBLE PRECISION;

-- Time-series tables (hypertables) -----------------------------------------

CREATE TABLE IF NOT EXISTS readings (
    time        TIMESTAMPTZ NOT NULL,
    system_id   INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    kwh         DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (system_id, time)
);
SELECT create_hypertable('readings', 'time', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS weather (
    time            TIMESTAMPTZ NOT NULL,
    location        TEXT NOT NULL REFERENCES locations(name),
    sunlight_kwh_m2 DOUBLE PRECISION NOT NULL,
    rain_mm         DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (location, time)
);
SELECT create_hypertable('weather', 'time', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS health (
    time            TIMESTAMPTZ NOT NULL,
    system_id       INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    expected_kwh    DOUBLE PRECISION NOT NULL,
    actual_kwh      DOUBLE PRECISION NOT NULL,
    ratio           DOUBLE PRECISION,
    rolling_7       DOUBLE PRECISION,
    label           TEXT,
    confidence      DOUBLE PRECISION,
    PRIMARY KEY (system_id, time)
);
SELECT create_hypertable('health', 'time', if_not_exists => TRUE);

-- Ground-truth fault labels from the simulator (used for training)
CREATE TABLE IF NOT EXISTS fault_labels (
    system_id   INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    fault       TEXT NOT NULL,            -- weather_dip | soiling | string_failure | inverter_off
    severity    DOUBLE PRECISION,
    PRIMARY KEY (system_id, start_date, fault)
);
ALTER TABLE fault_labels ADD COLUMN IF NOT EXISTS end_date DATE;   -- NULL = never fixed

-- Outputs -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    system_id       INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,            -- estimated fault onset
    detected_date   DATE NOT NULL,            -- first day the model was sure
    end_date        DATE,                     -- NULL = still happening
    label           TEXT NOT NULL,            -- soiling | string_failure | inverter_off
    confidence      DOUBLE PRECISION,
    loss_pct        DOUBLE PRECISION,         -- total drop vs expected
    weather_pct     DOUBLE PRECISION,         -- part explained by local weather (peers)
    fault_pct       DOUBLE PRECISION,         -- the rest
    rupees_per_month DOUBLE PRECISION,
    audience        TEXT NOT NULL,            -- technician | homeowner
    action          TEXT,
    message         TEXT,
    reasons         JSONB,
    status          TEXT NOT NULL DEFAULT 'open',   -- open | resolved
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audits (
    id          SERIAL PRIMARY KEY,
    bill_json   JSONB,
    quote_json  JSONB,
    verdict     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily generation per system (for hourly CSV imports) ----------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_generation
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', time, 'Asia/Kolkata') AS day,
       system_id,
       SUM(kwh) AS kwh
FROM readings
GROUP BY day, system_id
WITH NO DATA;

-- Installer console ------------------------------------------------------------

ALTER TABLE systems ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS work_orders (
    id              SERIAL PRIMARY KEY,
    system_id       INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    alert_id        INT REFERENCES alerts(id) ON DELETE SET NULL,
    technician      TEXT NOT NULL,
    scheduled_date  DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled | done | cancelled
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    system_id   INT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    alert_id    INT REFERENCES alerts(id) ON DELETE SET NULL,
    channel     TEXT NOT NULL,                -- sms | email
    recipient   TEXT NOT NULL,
    subject     TEXT,
    message     TEXT NOT NULL,
    kind        TEXT NOT NULL,                -- clean_panels | visit_scheduled | fault_found | check_in
    status      TEXT NOT NULL DEFAULT 'logged_demo',   -- logged_demo | sent | failed
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Autopilot + real delivery ------------------------------------------------------

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'installer';   -- installer | autopilot
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'installer';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_via TEXT;                          -- telegram | email
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS error TEXT;

CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   JSONB NOT NULL
);
