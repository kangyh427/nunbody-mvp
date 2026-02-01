require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');

const app = express();

// CORS 설정 - Vercel 프론트엔드 허용
const allowedOrigins = [
  'http://localhost:3000',
  'https://nunbody-frontend-6q24.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // origin이 없는 경우(모바일 앱, Postman 등)도 허용
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Nunbody API is running!' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/photos', photoRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
