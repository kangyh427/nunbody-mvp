require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const analysisRoutes = require('./routes/analysis');
const supportRoutes = require('./routes/support');
const { authenticateToken } = require('./middleware/auth');
const pool = require('./config/database');

const app = express();

// 보안 헤더
app.use(helmet());

// 전체 API Rate Limit (IP당 15분에 100회)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

// 인증 관련 Rate Limit (IP당 15분에 10회 - 브루트포스 방지)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' }
});

// AI 분석 Rate Limit (IP당 1시간에 20회 - 비용 관리)
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: '분석 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

app.use(generalLimiter);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('vercel.app') || origin.includes('netlify.app')) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Nunbody API is running!' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/photos', authenticateToken, photoRoutes);
app.use('/api/analysis', authenticateToken, analysisLimiter, analysisRoutes);
app.use('/api/support', authenticateToken, supportRoutes);

// 서버 시작 시 photos 테이블 자동 생성
const initDatabase = async () => {
  try {
    console.log('📊 Checking/Creating photos table...');
    
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
    
    await pool.query(sql);
    console.log('✅ Photos table ready!');
  } catch (error) {
    console.error('❌ Database init error:', error.message);
  }
};

const PORT = process.env.PORT || 3001;

// 데이터베이스 초기화 후 서버 시작
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('CORS enabled for localhost, vercel.app, and netlify.app domains');
    console.log('🤖 Gemini AI analysis enabled');
  });
});
