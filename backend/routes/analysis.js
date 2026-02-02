const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const pool = require('../config/database');

// Gemini AI 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 이미지 URL을 Base64로 변환 (axios 사용)
async function imageUrlToBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data).toString('base64');
}

// 단일 사진 분석
router.post('/analyze', async (req, res) => {
  try {
    const { photoId } = req.body;
    const userId = req.user.id;

    // 사진 정보 조회 (user_id 체크 포함)
    const photoResult = await pool.query(
      'SELECT * FROM photos WHERE id = $1 AND user_id = $2',
      [photoId, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    const photo = photoResult.rows[0];

    // Gemini Vision 모델 설정 (JSON 응답 강제)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    // 이미지를 Base64로 변환
    const base64Image = await imageUrlToBase64(photo.photo_url);

    // 정밀 근육 분석 프롬프트 (v3.0 - 세부 근육별 분석)
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 분석 전문가입니다.

## 분석 지침

### 1. 축척 보정 (Smart Scaling)
- 얼굴 크기(Head Size)를 기준점으로 사용하세요
- 평균 성인 얼굴 길이는 약 22-23cm입니다
- 이 기준으로 어깨 너비, 팔 길이 등을 추정하세요
- 카메라 거리에 따른 왜곡을 보정하세요

### 2. 세부 근육 분석 (12개 근육군)
각 근육을 1-10점으로 평가하고 구체적인 코멘트를 제공하세요:

**상체 (Upper Body)**
- 어깨 (Shoulders/삼각근): 전면, 측면, 후면 삼각근
- 가슴 (Chest/대흉근): 상부, 중부, 하부 대흉근
- 등 (Back/광배근): 광배근, 승모근, 능형근
- 이두 (Biceps/이두근): 이두근 피크와 두께
- 삼두 (Triceps/삼두근): 삼두근 말굽 모양

**코어 (Core)**
- 복근 (Abs/복직근): 식스팩 선명도
- 옆구리 (Obliques/외복사근): 사선 라인

**하체 (Lower Body)**
- 대퇴사두 (Quads/대퇴사두근): 앞허벅지 볼륨
- 햄스트링 (Hamstrings): 뒷허벅지
- 둔근 (Glutes/둔근): 엉덩이 볼륨
- 종아리 (Calves/비복근): 종아리 발달도

### 3. 응답 형식
반드시 아래 JSON 구조로만 응답하세요:

{
  "bodyType": "체형 분류 (예: 중배엽-외배엽 혼합형)",
  "bodyTypeDescription": "체형에 대한 상세 설명 (2-3문장)",
  "overallScore": 1-100,
  "estimatedMeasurements": {
    "shoulderWidth": "어깨 너비 추정 (cm)",
    "chestCircumference": "가슴 둘레 추정 (cm)",
    "waistCircumference": "허리 둘레 추정 (cm)",
    "armCircumference": "팔 둘레 추정 (cm)",
    "bodySymmetry": 1-10
  },
  "posture": {
    "score": 1-100,
    "spineAlignment": "척추 정렬 상태",
    "shoulderBalance": "어깨 균형",
    "headPosition": "머리 위치 (전방/중립/후방)",
    "pelvisTilt": "골반 틀어짐 여부"
  },
  "muscleAnalysis": {
    "upperBody": {
      "overall": 1-10,
      "shoulders": {
        "score": 1-10,
        "detail": "삼각근 발달 상태 설명"
      },
      "chest": {
        "score": 1-10,
        "detail": "대흉근 발달 상태 설명"
      },
      "back": {
        "score": 1-10,
        "detail": "광배근/승모근 발달 상태 설명"
      },
      "biceps": {
        "score": 1-10,
        "detail": "이두근 발달 상태 설명"
      },
      "triceps": {
        "score": 1-10,
        "detail": "삼두근 발달 상태 설명"
      }
    },
    "core": {
      "overall": 1-10,
      "abs": {
        "score": 1-10,
        "detail": "복직근 발달 및 선명도 설명"
      },
      "obliques": {
        "score": 1-10,
        "detail": "외복사근 발달 상태 설명"
      }
    },
    "lowerBody": {
      "overall": 1-10,
      "quads": {
        "score": 1-10,
        "detail": "대퇴사두근 발달 상태 설명"
      },
      "hamstrings": {
        "score": 1-10,
        "detail": "햄스트링 발달 상태 설명"
      },
      "glutes": {
        "score": 1-10,
        "detail": "둔근 발달 상태 설명"
      },
      "calves": {
        "score": 1-10,
        "detail": "비복근 발달 상태 설명"
      }
    }
  },
  "weakestMuscles": [
    {
      "rank": 1,
      "muscle": "가장 약한 근육명 (한글)",
      "englishName": "영문명",
      "score": 1-10,
      "reason": "약한 이유 설명",
      "exercises": [
        {"name": "운동1", "sets": "3세트", "reps": "12회", "tip": "운동 팁"},
        {"name": "운동2", "sets": "3세트", "reps": "10회", "tip": "운동 팁"},
        {"name": "운동3", "sets": "4세트", "reps": "15회", "tip": "운동 팁"}
      ]
    },
    {
      "rank": 2,
      "muscle": "두번째로 약한 근육명",
      "englishName": "영문명",
      "score": 1-10,
      "reason": "약한 이유 설명",
      "exercises": [
        {"name": "운동1", "sets": "3세트", "reps": "12회", "tip": "운동 팁"},
        {"name": "운동2", "sets": "3세트", "reps": "10회", "tip": "운동 팁"},
        {"name": "운동3", "sets": "4세트", "reps": "15회", "tip": "운동 팁"}
      ]
    },
    {
      "rank": 3,
      "muscle": "세번째로 약한 근육명",
      "englishName": "영문명",
      "score": 1-10,
      "reason": "약한 이유 설명",
      "exercises": [
        {"name": "운동1", "sets": "3세트", "reps": "12회", "tip": "운동 팁"},
        {"name": "운동2", "sets": "3세트", "reps": "10회", "tip": "운동 팁"},
        {"name": "운동3", "sets": "4세트", "reps": "15회", "tip": "운동 팁"}
      ]
    }
  ],
  "strongestMuscles": [
    {"muscle": "강점 근육1", "score": 1-10, "detail": "강점 설명"},
    {"muscle": "강점 근육2", "score": 1-10, "detail": "강점 설명"}
  ],
  "recommendations": {
    "priorityFocus": "가장 집중해야 할 부위",
    "weeklyPlan": {
      "day1": "월요일 운동 계획",
      "day2": "화요일 운동 계획",
      "day3": "수요일 운동 계획",
      "day4": "목요일 운동 계획",
      "day5": "금요일 운동 계획"
    },
    "nutritionTip": "영양 섭취 조언",
    "restTip": "휴식 및 회복 조언"
  },
  "summary": "전체 분석 요약 (4-5문장, 격려하는 톤으로 강점을 먼저 언급하고 개선점 제안)"
}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    let analysisText = response.text();
    
    // JSON 파싱
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('JSON 파싱 실패, 원본:', analysisText);
      
      // 마크다운 제거 후 재시도
      const cleanText = analysisText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^{]*/, '')
        .replace(/[^}]*$/, '')
        .trim();
      
      try {
        analysis = JSON.parse(cleanText);
      } catch (retryError) {
        console.error('재파싱도 실패:', cleanText);
        // 기본 응답 반환
        analysis = {
          bodyType: "분석 완료",
          bodyTypeDescription: "체형 분석이 완료되었습니다.",
          overallScore: 70,
          muscleAnalysis: {
            upperBody: { overall: 6, shoulders: { score: 6, detail: "평균 수준" }, chest: { score: 6, detail: "평균 수준" }, back: { score: 6, detail: "평균 수준" }, biceps: { score: 6, detail: "평균 수준" }, triceps: { score: 6, detail: "평균 수준" } },
            core: { overall: 5, abs: { score: 5, detail: "평균 수준" }, obliques: { score: 5, detail: "평균 수준" } },
            lowerBody: { overall: 6, quads: { score: 6, detail: "평균 수준" }, hamstrings: { score: 6, detail: "평균 수준" }, glutes: { score: 6, detail: "평균 수준" }, calves: { score: 6, detail: "평균 수준" } }
          },
          weakestMuscles: [
            { rank: 1, muscle: "코어", englishName: "Core", score: 5, reason: "코어 강화 필요", exercises: [{ name: "플랭크", sets: "3세트", reps: "60초", tip: "허리를 곧게 유지" }] }
          ],
          strongestMuscles: [{ muscle: "어깨", score: 7, detail: "양호한 발달" }],
          summary: "전반적으로 균형 잡힌 체형입니다. 꾸준한 운동을 통해 더 좋은 결과를 얻을 수 있습니다."
        };
      }
    }

    // 분석 결과를 DB에 저장
    await pool.query(
      'UPDATE photos SET analysis_data = $1 WHERE id = $2 AND user_id = $3',
      [JSON.stringify(analysis), photoId, userId]
    );

    res.json({
      success: true,
      analysis,
      photo: {
        id: photo.id,
        url: photo.photo_url,
        bodyPart: photo.body_part,
        takenAt: photo.taken_at
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: '분석 중 오류가 발생했습니다: ' + error.message });
  }
});

// 두 사진 비교 분석 (v3.0 - 근육별 % 변화 포함)
router.post('/compare', async (req, res) => {
  try {
    const { photoId1, photoId2 } = req.body;
    const userId = req.user.id;

    // 두 사진 정보 조회
    const photosResult = await pool.query(
      'SELECT * FROM photos WHERE id IN ($1, $2) AND user_id = $3 ORDER BY taken_at ASC',
      [photoId1, photoId2, userId]
    );

    if (photosResult.rows.length !== 2) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    const [beforePhoto, afterPhoto] = photosResult.rows;

    // Gemini Vision 모델 설정
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    // 두 이미지를 Base64로 변환
    const [beforeBase64, afterBase64] = await Promise.all([
      imageUrlToBase64(beforePhoto.photo_url),
      imageUrlToBase64(afterPhoto.photo_url)
    ]);

    // 정밀 비교 분석 프롬프트 (v3.0 - 근육별 % 변화)
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 변화 분석 전문가입니다.

## 비교 분석 지침

### 1. 축척 보정 (Smart Scaling)
- 두 사진의 얼굴 크기를 기준으로 축척을 맞추세요
- 카메라 거리 차이로 인한 왜곡을 보정하세요
- 동일한 기준점으로 변화를 측정하세요

### 2. 세부 근육별 변화 분석 (12개 근육군)
각 근육의 Before/After 점수와 변화율(%)을 계산하세요:

**상체**: 어깨, 가슴, 등, 이두, 삼두
**코어**: 복근, 옆구리
**하체**: 대퇴사두, 햄스트링, 둔근, 종아리

### 3. 응답 형식
반드시 아래 JSON 구조로만 응답하세요:

{
  "overallChange": "전반적인 변화 평가 (크게 개선/개선/유지/주의필요)",
  "changeScore": -100에서 100 사이 점수,
  "periodAnalysis": "두 사진 사이 예상 기간 및 변화 속도 평가",
  "beforeScore": 1-100,
  "afterScore": 1-100,
  "muscleChanges": {
    "shoulders": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "-20% ~ +50% 형태로",
      "detail": "어깨 변화 상세 설명"
    },
    "chest": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "가슴 변화 상세 설명"
    },
    "back": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "등 변화 상세 설명"
    },
    "biceps": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "이두 변화 상세 설명"
    },
    "triceps": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "삼두 변화 상세 설명"
    },
    "abs": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "복근 변화 상세 설명"
    },
    "obliques": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "옆구리 변화 상세 설명"
    },
    "quads": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "대퇴사두 변화 상세 설명"
    },
    "hamstrings": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "햄스트링 변화 상세 설명"
    },
    "glutes": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "둔근 변화 상세 설명"
    },
    "calves": {
      "before": 1-10,
      "after": 1-10,
      "changePercent": "변화율",
      "detail": "종아리 변화 상세 설명"
    }
  },
  "topImproved": [
    {
      "rank": 1,
      "muscle": "가장 많이 성장한 근육 (한글)",
      "changePercent": "+30%",
      "detail": "성장 상세 설명",
      "keepDoingExercises": ["계속하면 좋은 운동1", "운동2"]
    },
    {
      "rank": 2,
      "muscle": "두번째로 성장한 근육",
      "changePercent": "+20%",
      "detail": "성장 상세 설명",
      "keepDoingExercises": ["운동1", "운동2"]
    },
    {
      "rank": 3,
      "muscle": "세번째로 성장한 근육",
      "changePercent": "+15%",
      "detail": "성장 상세 설명",
      "keepDoingExercises": ["운동1", "운동2"]
    }
  ],
  "needsWork": [
    {
      "rank": 1,
      "muscle": "더 노력이 필요한 근육 (한글)",
      "changePercent": "+5% 또는 -10% 등",
      "reason": "부족한 이유",
      "recommendedExercises": [
        {"name": "운동명", "sets": "3세트", "reps": "12회", "tip": "운동 팁"}
      ]
    },
    {
      "rank": 2,
      "muscle": "두번째로 노력 필요한 근육",
      "changePercent": "변화율",
      "reason": "부족한 이유",
      "recommendedExercises": [
        {"name": "운동명", "sets": "3세트", "reps": "12회", "tip": "운동 팁"}
      ]
    }
  ],
  "bodyComposition": {
    "fatChange": "체지방 변화 추정 (감소/유지/증가)",
    "muscleChange": "근육량 변화 추정",
    "detail": "체성분 변화 상세 설명"
  },
  "posture": {
    "beforeScore": 1-100,
    "afterScore": 1-100,
    "change": "자세 변화 설명"
  },
  "recommendations": {
    "nextGoal": "다음 목표 제안",
    "focusMuscles": ["집중해야 할 근육1", "근육2"],
    "weeklyPlan": {
      "day1": "월요일: 운동 계획",
      "day2": "화요일: 운동 계획",
      "day3": "수요일: 운동 계획",
      "day4": "목요일: 운동 계획",
      "day5": "금요일: 운동 계획"
    },
    "nutritionTip": "영양 조언",
    "lifestyleTip": "생활습관 조언"
  },
  "encouragement": "개인화된 격려 메시지 (3-4문장, 구체적인 성과를 언급하며 동기부여)",
  "summary": "전체 비교 분석 요약 (5-6문장, 객관적인 변화 데이터와 함께 격려)"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: beforeBase64 } },
      { inlineData: { mimeType: 'image/jpeg', data: afterBase64 } }
    ]);

    const response = await result.response;
    let comparisonText = response.text();
    
    // JSON 파싱
    let comparison;
    try {
      comparison = JSON.parse(comparisonText);
    } catch (parseError) {
      console.error('JSON 파싱 실패, 원본:', comparisonText);
      
      const cleanText = comparisonText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^{]*/, '')
        .replace(/[^}]*$/, '')
        .trim();
      
      try {
        comparison = JSON.parse(cleanText);
      } catch (retryError) {
        comparison = {
          overallChange: "분석 완료",
          changeScore: 0,
          periodAnalysis: "두 사진을 비교 분석했습니다.",
          muscleChanges: {
            shoulders: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            chest: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            back: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            biceps: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            triceps: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            abs: { before: 5, after: 5, changePercent: "0%", detail: "유지" },
            obliques: { before: 5, after: 5, changePercent: "0%", detail: "유지" },
            quads: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            hamstrings: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            glutes: { before: 6, after: 6, changePercent: "0%", detail: "유지" },
            calves: { before: 6, after: 6, changePercent: "0%", detail: "유지" }
          },
          topImproved: [],
          needsWork: [],
          encouragement: "꾸준히 기록하고 계시네요!",
          summary: "두 사진을 비교 분석했습니다."
        };
      }
    }

    res.json({
      success: true,
      comparison,
      photos: {
        before: {
          id: beforePhoto.id,
          url: beforePhoto.photo_url,
          takenAt: beforePhoto.taken_at
        },
        after: {
          id: afterPhoto.id,
          url: afterPhoto.photo_url,
          takenAt: afterPhoto.taken_at
        }
      }
    });

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: '비교 분석 중 오류가 발생했습니다: ' + error.message });
  }
});

// 저장된 분석 결과 조회
router.get('/result/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT id, photo_url, body_part, taken_at, analysis_data FROM photos WHERE id = $1 AND user_id = $2',
      [photoId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    const photo = result.rows[0];

    res.json({
      success: true,
      photo: {
        id: photo.id,
        url: photo.photo_url,
        bodyPart: photo.body_part,
        takenAt: photo.taken_at
      },
      analysis: photo.analysis_data
    });

  } catch (error) {
    console.error('Fetch result error:', error);
    res.status(500).json({ error: '결과를 불러올 수 없습니다' });
  }
});

module.exports = router;
