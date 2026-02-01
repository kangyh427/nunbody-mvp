-- 눈바디 시드 데이터
-- 테스트 및 데모용 데이터

-- Test user (password: test1234)
INSERT INTO users (email, password, name) 
VALUES (
    'test@nunbody.com', 
    '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE8qhSeY6sLqKX8PZRJJdU.6s3bHHe',
    '테스트 사용자'
) ON CONFLICT (email) DO NOTHING;

-- Demo user (password: demo1234)
INSERT INTO users (email, password, name) 
VALUES (
    'demo@nunbody.com', 
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    '데모 사용자'
) ON CONFLICT (email) DO NOTHING;

-- Sample analysis data
WITH demo_user AS (
    SELECT id FROM users WHERE email = 'demo@nunbody.com'
)
INSERT INTO analyses (
    user_id, 
    before_image_key, 
    after_image_key, 
    muscle_mass_change, 
    body_fat_change, 
    overall_score,
    status,
    created_at
)
SELECT 
    id,
    'demo/before_' || generate_series || '.jpg',
    'demo/after_' || generate_series || '.jpg',
    (random() * 4 - 1)::DECIMAL(5, 2),
    (random() * -5)::DECIMAL(5, 2),
    (random() * 20 + 70)::INTEGER,
    'completed',
    CURRENT_TIMESTAMP - (generate_series || ' days')::INTERVAL
FROM demo_user, generate_series(1, 5);

-- Sample body part changes
WITH recent_analyses AS (
    SELECT id FROM analyses ORDER BY created_at DESC LIMIT 5
)
INSERT INTO body_part_changes (analysis_id, body_part, change_type, description, measurement_detail)
SELECT 
    id,
    (ARRAY['어깨 (삼각근)', '복부 (복사근)', '가슴 (대흉근)', '팔 (이두근/삼두근)', '다리 (대퇴사두근)'])[floor(random() * 5 + 1)],
    (ARRAY['increase', 'decrease'])[floor(random() * 2 + 1)],
    '근육량 및 체형 변화가 관찰되었습니다.',
    '측정 변화: ' || (random() * 5)::DECIMAL(3, 1) || 'cm'
FROM recent_analyses, generate_series(1, 4);

-- User preferences
INSERT INTO user_preferences (user_id, notification_enabled, measurement_unit, language)
SELECT id, TRUE, 'metric', 'ko'
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Refresh analytics
SELECT refresh_user_analytics();

-- Verification queries
SELECT 'Users created:' as info, COUNT(*) as count FROM users;
SELECT 'Analyses created:' as info, COUNT(*) as count FROM analyses;
SELECT 'Body part changes created:' as info, COUNT(*) as count FROM body_part_changes;