# 눈바디 체형 분석 기능 설치 가이드

## 📁 파일 구조

```
nunbody/
├── backend/
│   ├── routes/
│   │   ├── auth.js           (기존)
│   │   └── analysis.js       (새로 추가) ⭐
│   ├── uploads/
│   │   └── body-images/      (자동 생성)
│   ├── server.js             (수정 필요)
│   ├── migration-analysis.sql (새로 추가) ⭐
│   └── reset-password.js     (기존)
├── frontend/
│   ├── test-login.html       (기존)
│   └── analysis.html         (새로 추가) ⭐
```

## 🚀 설치 단계

### 1단계: 파일 복사
제공된 파일들을 해당 위치에 복사하세요:
- `routes/analysis.js` → `C:\Users\kangh\Desktop\nunbody\backend\routes\`
- `migration-analysis.sql` → `C:\Users\kangh\Desktop\nunbody\backend\`
- `analysis.html` → `C:\Users\kangh\Desktop\nunbody\frontend\` (또는 http-server 실행 폴더)

### 2단계: 필요한 패키지 설치
```bash
cd C:\Users\kangh\Desktop\nunbody\backend
npm install multer jsonwebtoken
```

### 3단계: 데이터베이스 마이그레이션
```bash
# PostgreSQL 접속
psql -U nunbody_user -d nunbody

# 또는 psql 접속 후
\i migration-analysis.sql
```

**또는 직접 SQL 실행:**
```sql
-- body_analyses 테이블 생성
CREATE TABLE IF NOT EXISTS body_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_path VARCHAR(500) NOT NULL,
    height DECIMAL(5,2),
    weight DECIMAL(5,2),
    body_type VARCHAR(50),
    measurements JSONB,
    recommendations JSONB,
    confidence_score DECIMAL(3,2),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_body_analyses_user_id ON body_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_body_analyses_status ON body_analyses(status);
```

### 4단계: server.js 수정
`server.js` 파일을 열고 다음 내용을 추가:

```javascript
// 상단에 추가
const analysisRoutes = require('./routes/analysis');
const path = require('path');

// 라우트 연결 추가
app.use('/api/analysis', analysisRoutes);

// 정적 파일 서빙 추가
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

### 5단계: 서버 재시작
```bash
# 백엔드 서버
cd C:\Users\kangh\Desktop\nunbody\backend
node server.js

# 프론트엔드 서버 (별도 터미널)
cd C:\Users\kangh\Desktop\nunbody\frontend
http-server -p 9001 --cors
```

### 6단계: 테스트
1. 브라우저에서 `http://localhost:9001/test-login.html` 접속
2. 로그인: `demo@nunbody.com` / `demo1234`
3. 로그인 성공 후 `http://localhost:9001/analysis.html` 접속
4. 이미지 업로드 및 체형 분석 테스트

---

## 📡 API 엔드포인트

### 이미지 업로드 & 분석 시작
```
POST /api/analysis/upload
Headers: Authorization: Bearer {token}
Body: FormData (image, height?, weight?)
```

### 분석 결과 조회
```
GET /api/analysis/result/:id
Headers: Authorization: Bearer {token}
```

### 분석 히스토리
```
GET /api/analysis/history?limit=10&offset=0
Headers: Authorization: Bearer {token}
```

### 체형 변화 비교
```
GET /api/analysis/compare?startDate=2024-01-01&endDate=2024-12-31
Headers: Authorization: Bearer {token}
```

### 분석 삭제
```
DELETE /api/analysis/:id
Headers: Authorization: Bearer {token}
```

---

## 🤖 AI 서비스 연동 (선택사항)

현재는 데모용 분석 결과를 생성합니다. 실제 AI 서비스 연동 시:

1. `.env` 파일에 AI 서비스 URL 설정:
```
AI_SERVICE_URL=http://your-ai-service:8000
```

2. AI 서비스는 다음 형식의 응답을 반환해야 합니다:
```json
{
  "bodyType": "표준형",
  "confidenceScore": 0.85,
  "measurements": {
    "estimatedShoulderWidth": 45,
    "estimatedWaist": 80,
    "estimatedHip": 95,
    "bmi": 22.5,
    "bmiCategory": "정상",
    "bodyFatPercentage": 18.5,
    "muscleMassIndex": 25.3
  },
  "recommendations": {
    "exercise": ["운동 추천 1", "운동 추천 2"],
    "diet": ["식단 추천 1", "식단 추천 2"],
    "lifestyle": ["생활습관 추천"]
  }
}
```

---

## ⚠️ 문제 해결

### "Cannot find module 'multer'" 에러
```bash
npm install multer
```

### "relation body_analyses does not exist" 에러
데이터베이스 마이그레이션을 실행하세요.

### CORS 에러
server.js에 CORS 설정이 있는지 확인:
```javascript
app.use(cors());
```

### 로그인 후 분석 페이지 접근 안됨
1. localStorage에 token이 저장되었는지 확인
2. 브라우저 Console에서: `localStorage.getItem('token')`

---

## 📝 다음 개발 단계

1. **실제 AI 모델 연동** - TensorFlow.js, MediaPipe 등
2. **이미지 포즈 감지** - 정확한 체형 분석을 위한 포즈 추정
3. **체형 변화 그래프** - 시간에 따른 변화 시각화
4. **목표 설정 기능** - 목표 체형/체중 설정 및 추적
5. **소셜 기능** - 친구와 진행상황 공유

도움이 필요하시면 언제든 문의하세요! 🚀
