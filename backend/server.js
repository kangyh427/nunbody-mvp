require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');
const { authenticateToken } = require('./middleware/auth');

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
app.use('/api/photos', authenticateToken, photoRoutes);  // 인증 미들웨어 추가!

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('CORS enabled for localhost, vercel.app, and netlify.app domains');
});
