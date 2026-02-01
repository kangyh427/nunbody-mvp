-- 눈바디 데이터베이스 스키마
-- PostgreSQL 14+

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    before_image_key VARCHAR(255) NOT NULL,
    after_image_key VARCHAR(255) NOT NULL,
    muscle_mass_change DECIMAL(5, 2),
    body_fat_change DECIMAL(5, 2),
    overall_score INTEGER,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_created_at ON analyses(created_at);
CREATE INDEX idx_analyses_status ON analyses(status);

-- Body part changes table
CREATE TABLE IF NOT EXISTS body_part_changes (
    id SERIAL PRIMARY KEY,
    analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    body_part VARCHAR(100) NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    description TEXT,
    measurement_detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_body_part_changes_analysis_id ON body_part_changes(analysis_id);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    measurement_unit VARCHAR(10) DEFAULT 'metric',
    language VARCHAR(10) DEFAULT 'ko',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Analysis comments table (for future features)
CREATE TABLE IF NOT EXISTS analysis_comments (
    id SERIAL PRIMARY KEY,
    analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analysis_comments_analysis_id ON analysis_comments(analysis_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analyses_updated_at BEFORE UPDATE ON analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert demo data (optional)
-- INSERT INTO users (email, password, name) 
-- VALUES ('demo@nunbody.com', '$2a$10$HASHED_PASSWORD', '데모 사용자');

-- Create materialized view for analytics (optional, for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS user_analytics AS
SELECT 
    u.id as user_id,
    u.email,
    COUNT(a.id) as total_analyses,
    AVG(a.muscle_mass_change) as avg_muscle_change,
    AVG(a.body_fat_change) as avg_fat_change,
    AVG(a.overall_score) as avg_score,
    MAX(a.created_at) as last_analysis_date
FROM users u
LEFT JOIN analyses a ON u.id = a.user_id
GROUP BY u.id, u.email;

CREATE UNIQUE INDEX idx_user_analytics_user_id ON user_analytics(user_id);

-- Function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_user_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE users IS '사용자 정보를 저장하는 테이블';
COMMENT ON TABLE analyses IS '체형 분석 결과를 저장하는 테이블';
COMMENT ON TABLE body_part_changes IS '신체 부위별 변화 상세 정보를 저장하는 테이블';
COMMENT ON TABLE user_preferences IS '사용자 설정을 저장하는 테이블';

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nunbody_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nunbody_user;