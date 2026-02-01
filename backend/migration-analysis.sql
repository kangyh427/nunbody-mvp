-- =====================================================
-- 눈바디 체형 분석 테이블 생성 스크립트
-- 실행: psql -U nunbody_user -d nunbody -f migration-analysis.sql
-- =====================================================

-- body_analyses 테이블 생성
CREATE TABLE IF NOT EXISTS body_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 입력 데이터
    image_path VARCHAR(500) NOT NULL,
    height DECIMAL(5,2),           -- cm
    weight DECIMAL(5,2),           -- kg
    
    -- 분석 결과
    body_type VARCHAR(50),         -- 체형 분류 (마름형, 표준형, 근육형 등)
    measurements JSONB,            -- 상세 측정값 (어깨너비, 허리, 엉덩이 등)
    recommendations JSONB,         -- 추천사항 (운동, 식단, 생활습관)
    confidence_score DECIMAL(3,2), -- AI 신뢰도 (0.00 ~ 1.00)
    
    -- 상태 관리
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    
    -- 타임스탬프
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_body_analyses_user_id ON body_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_body_analyses_status ON body_analyses(status);
CREATE INDEX IF NOT EXISTS idx_body_analyses_created_at ON body_analyses(created_at DESC);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_body_analyses_updated_at ON body_analyses;
CREATE TRIGGER update_body_analyses_updated_at
    BEFORE UPDATE ON body_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 사용자 목표 테이블 (선택사항)
CREATE TABLE IF NOT EXISTS user_goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_body_type VARCHAR(50),
    target_weight DECIMAL(5,2),
    target_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '체형 분석 테이블이 성공적으로 생성되었습니다!';
END $$;
