const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'nunbody_user',
  password: 'test1234',
  host: 'localhost',
  database: 'nunbody',
  port: 5432
});

async function resetPassword() {
  try {
    // demo1234를 bcrypt로 해시
    const hashedPassword = await bcrypt.hash('demo1234', 10);
    
    // 데이터베이스 업데이트
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING *',
      [hashedPassword, 'demo@nunbody.com']
    );
    
    console.log('=== 비밀번호 재설정 완료 ===');
    console.log('이메일: demo@nunbody.com');
    console.log('새 비밀번호: demo1234');
    console.log('해시값:', hashedPassword);
    console.log('업데이트된 행:', result.rowCount);
    
  } catch (err) {
    console.error('에러:', err);
  } finally {
    pool.end();
  }
}

resetPassword();