-- Master fixture and pitch telemetry table.
CREATE TABLE fixtures (
    fixture_id SERIAL PRIMARY KEY,
    match_name VARCHAR(100) NOT NULL,
    kickoff_time_aest TIMESTAMP NOT NULL,
    pitch_type VARCHAR(50),
    pitch_constraints TEXT,
    referee_name VARCHAR(100),
    referee_tendencies TEXT,
    tactical_summary TEXT
);

-- Live odds matrix table.
CREATE TABLE model_odds (
    prediction_id SERIAL PRIMARY KEY,
    fixture_id INT REFERENCES fixtures(fixture_id),
    market_matrix VARCHAR(50) NOT NULL,
    target_selection VARCHAR(150) NOT NULL,
    true_price NUMERIC(5,2) NOT NULL,
    current_odds NUMERIC(5,2) NOT NULL,
    au_bookie VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
