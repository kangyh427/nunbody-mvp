const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// 데이터베이스 연결
const pool = new Pool({
  user: process.env.DB_USER || 'nunbody_user',
  password: process.env.DB_PASSWORD || 'test1234',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'nunbody',
  port: process.env.DB_PORT || 5432
});

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/body-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'body-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('이미지 파일만 업로드 가능합니다 (jpeg, jpg, png, webp)'));
  }
});

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
    if (err) {
      console.log('JWT 검증 에러:', err);
      return res.status(403).json({ error: '유효하지 않은 토큰입니다' });
    }
    
    // 디버깅: 토큰 내용 출력
    console.log('JWT decoded:', decoded);
    
    // user 객체 또는 직접 id를 처리
    req.user = {
      id: decoded.id || decoded.userId || decoded.user?.id,
      email: decoded.email || decoded.user?.email,
      name: decoded.name || decoded.user?.name
    };
    
    console.log('req.user 설정됨:', req.user);
    next();
  });
};

// =====================================================
// 체형 분석 API
// =====================================================

/**
 * POST /api/analysis/upload
 * 체형 분석용 이미지 업로드
 */
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다' });
    }

    const { height, weight } = req.body;
    const userId = req.user.id;
    const imagePath = req.file.filename;

    console.log('업로드 요청 - userId:', userId, 'imagePath:', imagePath);

    if (!userId) {
      return res.status(400).json({ error: '사용자 ID를 확인할 수 없습니다. 다시 로그인해주세요.' });
    }

    // 분석 레코드 생성 (상태: pending)
    const result = await pool.query(
      `INSERT INTO body_analyses (user_id, image_path, height, weight, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING id, image_path, status, created_at`,
      [userId, imagePath, height || null, weight || null]
    );

    const analysis = result.rows[0];

    res.status(201).json({
      message: '이미지 업로드 완료. 분석을 시작합니다.',
      analysis: {
        id: analysis.id,
        imagePath: analysis.image_path,
        status: analysis.status,
        createdAt: analysis.created_at
      }
    });

    // 비동기로 AI 분석 시작
    processBodyAnalysis(analysis.id, imagePath, height, weight);

  } catch (error) {
    console.error('이미지 업로드 에러:', error);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다: ' + error.message });
  }
});

/**
 * GET /api/analysis/result/:id
 * 분석 결과 조회
 */
router.get('/result/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM body_analyses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '분석 결과를 찾을 수 없습니다' });
    }

    const analysis = result.rows[0];

    res.json({
      analysis: formatAnalysisResult(analysis)
    });

  } catch (error) {
    console.error('결과 조회 에러:', error);
    res.status(500).json({ error: '결과 조회 중 오류가 발생했습니다' });
  }
});

/**
 * GET /api/analysis/history
 * 분석 히스토리 조회
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    console.log('히스토리 조회 - userId:', userId);

    if (!userId) {
      return res.status(400).json({ error: '사용자 ID를 확인할 수 없습니다' });
    }

    const result = await pool.query(
      `SELECT id, body_type, confidence_score, status, created_at, analyzed_at
       FROM body_analyses 
       WHERE user_id = $1 
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM body_analyses WHERE user_id = $1',
      [userId]
    );

    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('히스토리 조회 에러:', error);
    res.status(500).json({ error: '히스토리 조회 중 오류가 발생했습니다' });
  }
});

/**
 * DELETE /api/analysis/:id
 * 분석 결과 삭제
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const selectResult = await pool.query(
      'SELECT image_path FROM body_analyses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (selectResult.rows.length === 0) {
      return res.status(404).json({ error: '분석 결과를 찾을 수 없습니다' });
    }

    const imagePath = path.join(__dirname, '../uploads/body-images', selectResult.rows[0].image_path);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    await pool.query(
      'DELETE FROM body_analyses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ message: '분석 결과가 삭제되었습니다' });

  } catch (error) {
    console.error('삭제 에러:', error);
    res.status(500).json({ error: '삭제 중 오류가 발생했습니다' });
  }
});

// =====================================================
// AI 분석 서비스 함수들
// =====================================================

/**
 * 데모용 분석 결과 생성
 */
function generateDemoAnalysis(analysis) {
  const bodyTypes = ['마름형', '표준형', '근육형', '과체중형', '역삼각형', '직사각형'];
  const randomBodyType = bodyTypes[Math.floor(Math.random() * bodyTypes.length)];

  let bmi = null;
  let bmiCategory = null;
  if (analysis.height && analysis.weight) {
    const heightM = analysis.height / 100;
    bmi = (analysis.weight / (heightM * heightM)).toFixed(1);
    
    if (bmi < 18.5) bmiCategory = '저체중';
    else if (bmi < 23) bmiCategory = '정상';
    else if (bmi < 25) bmiCategory = '과체중';
    else bmiCategory = '비만';
  }

  return {
    bodyType: randomBodyType,
    confidenceScore: (0.7 + Math.random() * 0.25).toFixed(2),
    measurements: {
      estimatedShoulderWidth: Math.floor(40 + Math.random() * 15),
      estimatedWaist: Math.floor(70 + Math.random() * 20),
      estimatedHip: Math.floor(85 + Math.random() * 20),
      bmi: bmi,
      bmiCategory: bmiCategory,
      bodyFatPercentage: (15 + Math.random() * 15).toFixed(1),
      muscleMassIndex: (20 + Math.random() * 10).toFixed(1)
    },
    recommendations: {
      exercise: getExerciseRecommendations(randomBodyType),
      diet: getDietRecommendations(randomBodyType),
      lifestyle: getLifestyleRecommendations(randomBodyType)
    },
    analyzedAt: new Date().toISOString()
  };
}

function getExerciseRecommendations(bodyType) {
  const recommendations = {
    '마름형': ['근력 운동 위주로 진행하세요', '복합 운동(스쿼트, 데드리프트, 벤치프레스) 추천', '유산소 운동은 주 2-3회로 제한'],
    '표준형': ['균형 잡힌 운동 프로그램 유지', '근력 운동과 유산소 운동 병행', '주 3-4회 운동 권장'],
    '근육형': ['현재 운동량 유지', '유연성 운동 추가 권장', '과훈련 주의'],
    '과체중형': ['유산소 운동 위주로 시작', '걷기, 수영, 자전거 등 관절 부담 적은 운동', '주 4-5회 30분 이상 운동'],
    '역삼각형': ['하체 운동 강화 필요', '스쿼트, 런지, 레그프레스 추천', '전신 균형 발달에 집중'],
    '직사각형': ['어깨와 엉덩이 운동으로 라인 만들기', '사이드 레터럴 레이즈, 힙 쓰러스트 추천', '전체적인 근육량 증가 필요']
  };
  return recommendations[bodyType] || recommendations['표준형'];
}

function getDietRecommendations(bodyType) {
  const recommendations = {
    '마름형': ['칼로리 섭취량 증가 필요', '단백질 충분히 섭취 (체중 kg당 1.6-2g)', '하루 5-6끼 소량씩 자주 섭취'],
    '표준형': ['현재 식단 패턴 유지', '균형 잡힌 영양소 섭취', '충분한 수분 섭취'],
    '근육형': ['단백질 섭취 유지', '운동 전후 영양 섭취 중요', '미량 영양소 챙기기'],
    '과체중형': ['칼로리 적자 유지 (하루 300-500kcal)', '단백질 위주의 식단', '식이섬유 풍부한 채소 충분히'],
    '역삼각형': ['균형 잡힌 영양 섭취', '하체 운동 시 충분한 단백질', '전체적인 영양 균형 유지'],
    '직사각형': ['적절한 칼로리 섭취', '근육 발달을 위한 단백질', '규칙적인 식사 시간']
  };
  return recommendations[bodyType] || recommendations['표준형'];
}

function getLifestyleRecommendations(bodyType) {
  return ['충분한 수면 (7-8시간) 확보', '스트레스 관리하기', '규칙적인 생활 패턴 유지', '정기적인 건강 검진'];
}

function formatAnalysisResult(analysis) {
  return {
    id: analysis.id,
    status: analysis.status,
    bodyType: analysis.body_type,
    measurements: analysis.measurements,
    recommendations: analysis.recommendations,
    confidenceScore: analysis.confidence_score,
    createdAt: analysis.created_at,
    analyzedAt: analysis.analyzed_at
  };
}

/**
 * 비동기 체형 분석 처리
 */
async function processBodyAnalysis(analysisId, imagePath, height, weight) {
  try {
    await pool.query(
      "UPDATE body_analyses SET status = 'processing' WHERE id = $1",
      [analysisId]
    );

    // 2초 대기 (AI 분석 시뮬레이션)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = generateDemoAnalysis({ 
      id: analysisId, 
      image_path: imagePath, 
      height, 
      weight 
    });

    await pool.query(
      `UPDATE body_analyses 
       SET status = 'completed',
           body_type = $1,
           measurements = $2,
           recommendations = $3,
           confidence_score = $4,
           analyzed_at = NOW()
       WHERE id = $5`,
      [
        result.bodyType,
        JSON.stringify(result.measurements),
        JSON.stringify(result.recommendations),
        result.confidenceScore,
        analysisId
      ]
    );

    console.log(`분석 완료: ID ${analysisId}`);

  } catch (error) {
    console.error(`분석 실패: ID ${analysisId}`, error);
    await pool.query(
      "UPDATE body_analyses SET status = 'failed' WHERE id = $1",
      [analysisId]
    );
  }
}

module.exports = router;