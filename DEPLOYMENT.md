# 눈바디 MVP 배포 가이드

## 시스템 아키텍처

```
┌─────────────────┐
│   Frontend      │  React + TypeScript
│   (Port 3000)   │  
└────────┬────────┘
         │
         ├─────────────────────┐
         │                     │
┌────────▼─────────┐  ┌───────▼──────────┐
│   Backend        │  │   AI Service     │
│   Node.js/Express│  │   Python/FastAPI │
│   (Port 5000)    │  │   (Port 8000)    │
└────────┬─────────┘  └──────────────────┘
         │
         ├───────────────┬──────────────┐
         │               │              │
┌────────▼────────┐ ┌───▼────┐  ┌──────▼─────┐
│   PostgreSQL    │ │  AWS   │  │  MediaPipe │
│   Database      │ │  S3    │  │  OpenCV    │
│   (Port 5432)   │ │        │  │            │
└─────────────────┘ └────────┘  └────────────┘
```

## 1. 사전 요구사항

### 필수 설치 항목
- Node.js 18+ 
- Python 3.9+
- PostgreSQL 14+
- AWS 계정 (S3 사용)

### 개발 도구
- npm 또는 yarn
- pip
- git

## 2. 데이터베이스 설정

### PostgreSQL 설치 및 설정

```bash
# PostgreSQL 설치 (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# PostgreSQL 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 데이터베이스 생성
sudo -u postgres psql
```

```sql
-- PostgreSQL 콘솔에서
CREATE DATABASE nunbody;
CREATE USER nunbody_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE nunbody TO nunbody_user;
\q
```

### 스키마 적용

```bash
cd nunbody-mvp/database
psql -U nunbody_user -d nunbody -f schema.sql
psql -U nunbody_user -d nunbody -f seed.sql
```

## 3. 백엔드 설정

```bash
cd nunbody-mvp/backend

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
nano .env  # 또는 원하는 에디터로 편집
```

### .env 파일 설정

```env
# Server
PORT=5000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nunbody
DB_USER=nunbody_user
DB_PASSWORD=your_secure_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRES_IN=7d

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET=nunbody-images

# AI Service
AI_SERVICE_URL=http://localhost:8000

# CORS
CORS_ORIGIN=http://localhost:3000
```

### 백엔드 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

## 4. AI 서비스 설정

```bash
cd nunbody-mvp/ai-service

# 가상환경 생성 (권장)
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# AI 서비스 실행
python main.py

# 또는 uvicorn 직접 실행
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### GPU 가속 (선택사항)

GPU를 사용하려면:

```bash
# TensorFlow GPU 버전 설치
pip install tensorflow-gpu==2.15.0

# CUDA 및 cuDNN 설정 필요
# https://www.tensorflow.org/install/gpu
```

## 5. 프론트엔드 설정

```bash
cd nunbody-mvp/frontend

# 의존성 설치
npm install

# 환경 변수 설정
cat > .env << EOF
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=눈바디
EOF

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

## 6. AWS S3 설정

### S3 버킷 생성

```bash
# AWS CLI 설치 및 설정
aws configure

# S3 버킷 생성
aws s3 mb s3://nunbody-images --region ap-northeast-2

# CORS 설정
aws s3api put-bucket-cors --bucket nunbody-images --cors-configuration file://cors.json
```

### cors.json

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

## 7. Docker 배포 (선택사항)

### Docker Compose 설정

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: nunbody
      POSTGRES_USER: nunbody_user
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
    depends_on:
      - postgres

  ai-service:
    build: ./ai-service
    ports:
      - "8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

### 실행

```bash
docker-compose up -d
```

## 8. 프로덕션 배포

### Nginx 설정 (리버스 프록시)

```nginx
# /etc/nginx/sites-available/nunbody
server {
    listen 80;
    server_name nunbody.com www.nunbody.com;

    # Frontend
    location / {
        root /var/www/nunbody/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # AI Service
    location /ai {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### SSL 설정 (Let's Encrypt)

```bash
sudo certbot --nginx -d nunbody.com -d www.nunbody.com
```

### PM2로 백엔드 실행 (Node.js)

```bash
npm install -g pm2

# 백엔드 실행
cd nunbody-mvp/backend
pm2 start server.js --name nunbody-backend

# 자동 시작 설정
pm2 startup
pm2 save
```

### Systemd로 AI 서비스 실행

```ini
# /etc/systemd/system/nunbody-ai.service
[Unit]
Description=Nunbody AI Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/nunbody/ai-service
Environment="PATH=/var/www/nunbody/ai-service/venv/bin"
ExecStart=/var/www/nunbody/ai-service/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable nunbody-ai
sudo systemctl start nunbody-ai
```

## 9. 모니터링 및 로깅

### 로그 설정

```bash
# PM2 로그 확인
pm2 logs nunbody-backend

# AI 서비스 로그
sudo journalctl -u nunbody-ai -f

# Nginx 로그
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 모니터링 도구 (선택사항)

- **PM2 모니터링**: `pm2 monit`
- **Datadog**, **New Relic**, **Sentry** 등 통합 가능

## 10. 성능 최적화

### 데이터베이스 인덱싱

```sql
-- 필요한 추가 인덱스
CREATE INDEX idx_analyses_user_created ON analyses(user_id, created_at DESC);
CREATE INDEX idx_body_part_changes_analysis ON body_part_changes(analysis_id);
```

### Redis 캐싱 (선택사항)

```bash
# Redis 설치
sudo apt install redis-server

# 백엔드에서 Redis 사용
npm install redis
```

### CDN 설정

- CloudFront (AWS)
- Cloudflare
- 정적 파일 및 이미지 캐싱

## 11. 백업 전략

### 데이터베이스 백업

```bash
# 자동 백업 스크립트
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U nunbody_user nunbody > /backups/nunbody_$DATE.sql
find /backups -name "nunbody_*.sql" -mtime +7 -delete
```

```bash
# Cron 설정 (매일 새벽 2시)
0 2 * * * /path/to/backup.sh
```

### S3 백업

- S3 Versioning 활성화
- S3 Lifecycle 정책 설정

## 12. 보안 체크리스트

- [ ] 환경 변수로 민감 정보 관리
- [ ] HTTPS/SSL 인증서 설정
- [ ] JWT 시크릿 키 강력하게 설정
- [ ] 데이터베이스 비밀번호 복잡하게 설정
- [ ] AWS IAM 최소 권한 원칙 적용
- [ ] Rate limiting 활성화
- [ ] CORS 정책 제한
- [ ] SQL Injection 방지 (Prepared Statements)
- [ ] XSS 방지 (입력 검증 및 sanitization)
- [ ] 정기적인 의존성 업데이트

## 13. 테스트

### 백엔드 테스트

```bash
cd backend
npm test
```

### AI 서비스 테스트

```bash
cd ai-service
pytest tests/
```

### 통합 테스트

```bash
# API 엔드포인트 테스트
curl http://localhost:5000/health
curl http://localhost:8000/health
```

## 14. 문제 해결

### 일반적인 문제

**PostgreSQL 연결 오류**
```bash
# PostgreSQL 상태 확인
sudo systemctl status postgresql

# 연결 테스트
psql -U nunbody_user -d nunbody -h localhost
```

**AI 서비스 메모리 부족**
```bash
# 메모리 사용량 확인
free -h

# Swap 메모리 추가
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**S3 업로드 실패**
```bash
# AWS 자격 증명 확인
aws sts get-caller-identity

# S3 버킷 정책 확인
aws s3api get-bucket-policy --bucket nunbody-images
```

## 15. 추가 리소스

- [Node.js 공식 문서](https://nodejs.org/docs)
- [FastAPI 공식 문서](https://fastapi.tiangolo.com)
- [MediaPipe 가이드](https://google.github.io/mediapipe/)
- [PostgreSQL 매뉴얼](https://www.postgresql.org/docs/)
- [AWS S3 문서](https://docs.aws.amazon.com/s3/)

## 지원

문제가 발생하면 다음을 확인하세요:
1. 각 서비스의 로그 파일
2. 환경 변수 설정
3. 포트 충돌 여부
4. 방화벽 설정

---

**축하합니다! 🎉 눈바디 MVP가 성공적으로 배포되었습니다.**
