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
// v4.1 자동 마이그레이션
// 서버 시작 시 필요한 컬럼이 없으면 자동 추가
// ============================================
const runMigration = async () => {
  const migrations = [
    // v4.1: 사용자 신체 정보 컬럼
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,1)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,1)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
  ];

  console.log('🔄 DB 마이그레이션 시작...');
  
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      // 이미 존재하는 경우 등 오류 무시
      if (!err.message.includes('already exists')) {
        console.log('⚠️ 마이그레이션 스킵:', err.message);
      }
    }
  }
  
  console.log('✅ DB 마이그레이션 완료 (v4.1)');
};

// 마이그레이션 실행
runMigration().catch(err => {
  console.error('❌ 마이그레이션 오류:', err.message);
});

module.exports = pool;
