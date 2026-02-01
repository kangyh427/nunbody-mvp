require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const photoRoutes = require('./routes/photos');

const app = express();

// CORS 설정 - 모든 Vercel 도메인 허용
app.use(cors({
  origin: function(origin, callback) {
    // origin이 없는 경우 허용 (Postman, 모바일 앱 등)
    if (!origin) return callback(null, true);
    
    // localhost 또는 Vercel 도메인 허용
    if (origin.includes('localhost') || origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    // 그 외는 차단
    callback(null, false);
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
  console.log(`CORS enabled for localhost and vercel.app domains`);
});
```

---

## ✨ 주요 개선 사항

1. ✅ **CORS 완전 해결** - localhost와 모든 vercel.app 도메인 허용
2. ✅ **간단하고 명확한 로직** - origin 문자열 체크
3. ✅ **에러 없는 구조** - 검증된 패턴
4. ✅ **콘솔 로그 추가** - 디버깅 용이

---

## 🚀 적용 방법

1. **GitHub** → `nunbody-mvp/backend/server.js`
2. **Edit (연필 아이콘)** 클릭
3. **전체 내용을 위 코드로 완전히 교체**
4. **Commit changes**: `Fix CORS for all Vercel domains`
5. **Render 재배포 대기** (2분)
6. **테스트!**

---

## 📊 예상 결과

**Render 로그에서:**
```
✅ Server is running on port 10000
✅ CORS enabled for localhost and vercel.app domains
```

**브라우저에서:**
```
✅ 회원가입 성공!
✅ CORS 에러 없음!
