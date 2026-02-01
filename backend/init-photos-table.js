// init-photos-table.js
// 백엔드 루트에 이 파일을 넣고 node init-photos-table.js 실행

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const createPhotosTable = async () => {
  console.log('📊 photos 테이블 생성 중...');
  
  const sql = `
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_url TEXT NOT NULL,
      cloudinary_id TEXT NOT NULL,
      body_part VARCHAR(20) DEFAULT 'full',
      taken_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      analysis_data JSONB
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_taken ON photos(user_id, taken_at DESC);
  `;
  
  try {
    await pool.query(sql);
    console.log('✅ photos 테이블 생성 완료!');
    console.log('✅ 인덱스 생성 완료!');
    
    // 테이블 확인
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'photos'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 생성된 컬럼 목록:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 에러 발생:', error.message);
    process.exit(1);
  }
};

createPhotosTable();
