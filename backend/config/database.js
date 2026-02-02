const { Pool } = require('pg');

// PostgreSQL 연결 풀 생성
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 연결 테스트
pool.on('connect', () => {
  console.log('✅ PostgreSQL 연결됨');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL 연결 오류:', err);
});

// ============================================
// v4.2 자동 마이그레이션
// 서버 시작 시 필요한 테이블/컬럼이 없으면 자동 추가
// ============================================
const runMigration = async () => {
  const migrations = [
    // v4.1: 사용자 신체 정보 컬럼
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,1)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,1)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    
    // v4.2: 분석 히스토리 테이블
    `CREATE TABLE IF NOT EXISTS analysis_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      analysis_type VARCHAR(20) NOT NULL,
      photo_ids INTEGER[] NOT NULL,
      result_json JSONB NOT NULL,
      overall_score INTEGER,
      body_fat_percent DECIMAL(4,1),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    // v4.2: 히스토리 조회 성능을 위한 인덱스
    `CREATE INDEX IF NOT EXISTS idx_analysis_user_date ON analysis_history(user_id, created_at DESC)`,
  ];

  console.log('🔄 DB 마이그레이션 시작...');
  
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      // 이미 존재하는 경우 등 오류 무시
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        console.error('❌ 치명적 마이그레이션 오류:', err.message);
        console.error('⛔ 서버 시작을 중단합니다.');
        process.exit(1);
      }
    }
  }
  
  console.log('✅ DB 마이그레이션 완료 (v4.2)');
};

// 마이그레이션 실행
runMigration().catch(err => {
  console.error('❌ 마이그레이션 오류:', err.message);
});

module.exports = pool;
