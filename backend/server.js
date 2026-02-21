require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const analysisRoutes = require('./routes/analysis');
const supportRoutes = require('./routes/support');
const { authenticateToken } = require('./middleware/auth');
const pool = require('./config/database');

const app = express();

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

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Nunbody API is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/photos', authenticateToken, photoRoutes);
app.use('/api/analysis', authenticateToken, analysisRoutes);
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
