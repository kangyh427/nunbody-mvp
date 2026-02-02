const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const pool = require('../config/database');

// Gemini AI 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 이미지 URL을 Base64로 변환 (타임아웃 추가)
async function imageUrlToBase64(url) {
  const response = await axios.get(url, { 
    responseType: 'arraybuffer',
    timeout: 15000
  });
  return Buffer.from(response.data).toString('base64');
}

// ============================================
// 사용자 프로필 조회 (키, 몸무게 등)
// ============================================
async function getUserProfile(userId) {
  try {
    const result = await pool.query(
      'SELECT height_cm, weight_kg, age, gender FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  } catch (err) {
    console.error('사용자 프로필 조회 실패:', err);
    return null;
  }
}

// ============================================
// 단일 사진 분석 (v4.1 - 인바디급 정밀 분석)
// ============================================
router.post('/analyze', async (req, res) => {
  try {
    const { photoId } = req.body;
    const userId = req.user.id;

    // 사진 정보 조회
    const photoResult = await pool.query(
      'SELECT * FROM photos WHERE id = $1 AND user_id = $2',
      [photoId, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    const photo = photoResult.rows[0];
    
    // 사용자 프로필 조회 (키, 몸무게 등)
    const userProfile = await getUserProfile(userId);

    // Gemini Vision 모델 설정 (v4.1 - 완전 결정론적)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,      // 🔑 무작위성 완전 제거
        topP: 1,             // 🔑 v4.1: 최상위 토큰만 선택
        topK: 1
      }
    });

    // 이미지를 Base64로 변환
    const base64Image = await imageUrlToBase64(photo.photo_url);

    // 사용자 메타데이터 문자열 생성
    const userMetadata = userProfile ? `
## 사용자 신체 정보 (User Metadata)
- 신장: ${userProfile.height_cm || '미입력'}cm
- 체중: ${userProfile.weight_kg || '미입력'}kg
- 나이: ${userProfile.age || '미입력'}세
- 성별: ${userProfile.gender === 'male' ? '남성' : userProfile.gender === 'female' ? '여성' : '미입력'}

⚠️ 위 데이터가 제공된 경우, 픽셀 분석 시 이를 기준으로 실측치를 더 정확히 계산하십시오.
` : '';

    // ========================================
    // v4.1 인바디급 정밀 분석 프롬프트
    // ========================================
    const prompt = `# Role: Elite Sports Scientist & Clinical Body Composition Specialist
당신은 수만 명의 보디빌딩 데이터와 인바디(BIA) 측정 데이터를 학습한 엘리트 스포츠 과학자입니다.
제공된 이미지와 메타데이터를 바탕으로 **전문가 수준의 체성분 분석**을 수행하십시오.

# Analysis Goal: Vision-based BIA Approximation
시각적 데이터만으로 인바디(BIA) 측정값에 근접한 정밀 수치를 산출하는 것이 목표입니다.
단순히 '좋아 보인다'는 식의 주관적 평가는 배제하고, **철저히 계측학적 데이터에 기반**하십시오.

${userMetadata}

# Phase 1: Spatial Calibration (Smart Scaling)
1. **Head Size Constant:** 성인 평균 얼굴 수직 길이(남: 23.5cm, 여: 22.0cm)를 기본 척도로 설정하십시오.
2. **Background Anchors:** 배경의 표준 사물(문틀 90x210cm, 콘센트 7x12cm, 표준 도서 등)을 식별하여 보조 척도로 활용하십시오.
3. **Distortion Correction:** 카메라 렌즈 왜곡을 고려하여 신체 중앙부와 주변부의 축척 오차를 보정하십시오.
4. **Distance Estimation:** 촬영 거리를 추정하고, 원근법에 의한 크기 왜곡을 계산하십시오.

# Phase 2: Photo Condition Analysis (Critical)
분석 전 반드시 사진 조건을 평가하십시오:
1. **Muscle Contraction State:** flexed(힘을 준 상태) / relaxed(이완 상태) / unknown
2. **Lighting Quality:** 조명이 근육 음영에 미치는 영향 (강한 측광은 근육을 과대평가할 수 있음)
3. **Camera Distance & Angle:** 촬영 거리와 각도가 체형 인식에 미치는 영향
4. **Image Quality:** 해상도와 선명도가 분석 정확도에 미치는 영향

# Phase 3: Quantitative Metric Analysis
다음 부위의 **실측치(cm)**를 추정하십시오:
- 어깨 너비 (삼각근 끝점 기준)
- 가슴 둘레 (가장 넓은 지점)
- 허리 둘레 (가장 얇은 지점)
- 팔 둘레 (이두근 피크)
- 허벅지 둘레 (가장 두꺼운 지점)

# Phase 4: Muscle Definition & Texture Scoring
이미지의 명암 대비(Contrast)와 질감을 분석하여 피하지방 두께를 역산하십시오.
- **Shadow Gradient:** 근육 주변 음영의 깊이가 깊고 경계가 명확할수록 데피니션 점수를 높게 부여
- **Vascularity Detection:** 혈관 비침 검출 시 해당 부위 체지방률 8% 이하로 추정
- **Muscle Striation:** 근육 결 검출 시 극도로 낮은 체지방 상태로 판단
- **12개 근육군 개별 평가:** 발달도 + 선명도를 종합하여 1-10점 정량화

# Phase 5: Honesty Protocol (Critical)
🚨 **정직한 분석 원칙:**
- 사진에서 **명확히 보이지 않는 근육**은 반드시 score: null, confidence: "none"으로 표시
- 옷에 가려진 부위, 각도상 보이지 않는 부위는 **절대 추측하지 않음**
- 조명이나 각도로 인해 판단이 어려운 경우 confidence를 "low"로 설정
- 확증 편향을 경계하고, 변화가 없거나 후퇴한 경우에도 **냉철하고 사실적으로** 분석

# Scoring Standards (Absolute Reference)
점수는 **일반 성인 평균을 5점**으로 기준:
- 1-2점: 매우 미발달 (근육이 거의 보이지 않음)
- 3-4점: 평균 이하 (약간의 근육 윤곽만 존재)
- 5점: 평균 (일반인 수준)
- 6-7점: 평균 이상 (정기적으로 운동하는 사람)
- 8-9점: 우수 (숙련된 보디빌더/운동선수)
- 10점: 최상위 (프로 보디빌더/엘리트 선수급)

# Output Format (Strict JSON Only)
반드시 아래 JSON 구조로만 응답하십시오.

{
  "analysisVersion": "4.1",
  "photoConditions": {
    "muscleState": "flexed | relaxed | unknown",
    "muscleStateDetail": "근육 수축 상태 상세 설명",
    "lighting": "strong | moderate | weak",
    "lightingEffect": "조명이 분석에 미치는 영향 (과대평가/과소평가 가능성)",
    "distance": "close | medium | far",
    "estimatedDistanceCm": 촬영 거리 추정값(cm) 또는 null,
    "angle": "front | side | back | angle",
    "imageQuality": "high | medium | low",
    "analysisReliability": "high | medium | low",
    "analysisLimitations": "이 사진에서 분석이 제한되는 부분과 이유"
  },
  "spatialCalibration": {
    "primaryAnchor": "얼굴 | 배경사물 | 사용자입력신장",
    "pixelsPerCm": 추정된 픽셀/cm 비율 또는 null,
    "calibrationConfidence": "high | medium | low",
    "calibrationNote": "축척 보정에 대한 설명"
  },
  "bodyType": "체형 분류 (중배엽형/외배엽형/내배엽형/혼합형)",
  "bodyTypeDescription": "체형에 대한 객관적 설명 (2-3문장)",
  "estimatedBodyFatPercent": 추정 체지방률(%) 또는 null,
  "bodyFatConfidence": "high | medium | low | none",
  "overallScore": 1-100,
  "overallConfidence": "high | medium | low",
  "estimatedMeasurements": {
    "shoulderWidth": "어깨 너비 cm 또는 null",
    "chestCircumference": "가슴 둘레 cm 또는 null",
    "waistCircumference": "허리 둘레 cm 또는 null",
    "armCircumference": "팔 둘레 cm 또는 null",
    "thighCircumference": "허벅지 둘레 cm 또는 null",
    "bodySymmetry": 1-10 또는 null,
    "measurementConfidence": "high | medium | low | none",
    "measurementNote": "측정치에 대한 부연 설명"
  },
  "posture": {
    "score": 1-100 또는 null,
    "confidence": "high | medium | low | none",
    "spineAlignment": "척추 정렬 상태",
    "shoulderBalance": "어깨 균형",
    "headPosition": "머리 위치",
    "pelvisTilt": "골반 상태"
  },
  "muscleAnalysis": {
    "upperBody": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "shoulders": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "삼각근 발달 상태 및 데피니션 분석"
      },
      "chest": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "대흉근 상/중/하부 발달 및 분리도"
      },
      "back": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "광배근/승모근/능형근 발달 상태"
      },
      "biceps": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "이두근 피크와 두께 분석"
      },
      "triceps": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "삼두근 말굽 모양 발달도"
      }
    },
    "core": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "abs": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "sixPackVisibility": "none | partial | clear | striated",
        "detail": "복직근 발달 및 선명도 분석"
      },
      "obliques": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "외복사근 사선 라인 분석"
      }
    },
    "lowerBody": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "quads": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "대퇴사두근 볼륨 및 분리도"
      },
      "hamstrings": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "햄스트링 발달 상태"
      },
      "glutes": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "둔근 볼륨 및 형태"
      },
      "calves": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "definition": 1-10 또는 null,
        "detail": "비복근 발달 상태"
      }
    }
  },
  "textureAnalysis": {
    "overallDefinition": 1-10 또는 null,
    "vascularity": "none | minimal | moderate | high",
    "muscleStriation": "none | minimal | visible | prominent",
    "skinFoldEstimate": "thick | moderate | thin | very_thin",
    "note": "질감 분석에 대한 종합 소견"
  },
  "visibleMusclesSummary": {
    "fullyVisible": ["명확히 보이는 근육 목록"],
    "partiallyVisible": ["부분적으로 보이는 근육 목록"],
    "notVisible": ["보이지 않는 근육 목록"]
  },
  "weakestMuscles": [
    {
      "rank": 1,
      "muscle": "가장 약한 근육명 (보이는 근육 중)",
      "englishName": "영문명",
      "score": 1-10,
      "definition": 1-10,
      "confidence": "high | medium | low",
      "reason": "약한 이유 (구체적)",
      "exercises": [
        {"name": "운동1", "sets": "3세트", "reps": "12회", "tip": "운동 팁"},
        {"name": "운동2", "sets": "3세트", "reps": "10회", "tip": "운동 팁"}
      ]
    }
  ],
  "strongestMuscles": [
    {
      "muscle": "강점 근육명",
      "score": 1-10,
      "definition": 1-10,
      "confidence": "high | medium | low",
      "detail": "강점 설명"
    }
  ],
  "recommendations": {
    "priorityFocus": "가장 집중해야 할 부위",
    "weeklyPlan": {
      "day1": "월요일 운동",
      "day2": "화요일 운동",
      "day3": "수요일 운동",
      "day4": "목요일 운동",
      "day5": "금요일 운동"
    },
    "nutritionTip": "영양 조언",
    "restTip": "휴식 조언"
  },
  "analysisDisclaimer": "이 분석은 사진 기반 시각적 평가이며, 실제 인바디 측정값과 다를 수 있습니다. 정확한 체성분 측정을 위해서는 전문 장비를 이용하세요.",
  "summary": "전체 분석 요약 (4-5문장, 보이는 근육에 대해서만 평가, 확인 불가한 부분 명시, 냉철하고 사실적으로)"
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
        return res.status(500).json({ 
          error: 'AI 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.',
          detail: 'JSON 파싱 실패'
        });
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
      userProfile: userProfile ? {
        height: userProfile.height_cm,
        weight: userProfile.weight_kg,
        age: userProfile.age,
        gender: userProfile.gender
      } : null,
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

// ============================================
// 두 사진 비교 분석 (v4.1 - 인바디급 정밀 비교)
// ============================================
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
    
    // 사용자 프로필 조회
    const userProfile = await getUserProfile(userId);

    // Gemini Vision 모델 설정 (v4.1)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        topP: 1,
        topK: 1
      }
    });

    // 두 이미지를 Base64로 변환
    const [beforeBase64, afterBase64] = await Promise.all([
      imageUrlToBase64(beforePhoto.photo_url),
      imageUrlToBase64(afterPhoto.photo_url)
    ]);

    // 촬영 날짜 정보 계산
    const beforeDate = new Date(beforePhoto.taken_at || beforePhoto.created_at);
    const afterDate = new Date(afterPhoto.taken_at || afterPhoto.created_at);
    const daysDifference = Math.round((afterDate - beforeDate) / (1000 * 60 * 60 * 24));

    // 사용자 메타데이터 문자열 생성
    const userMetadata = userProfile ? `
## 사용자 신체 정보 (User Metadata)
- 신장: ${userProfile.height_cm || '미입력'}cm
- 체중: ${userProfile.weight_kg || '미입력'}kg
- 나이: ${userProfile.age || '미입력'}세
- 성별: ${userProfile.gender === 'male' ? '남성' : userProfile.gender === 'female' ? '여성' : '미입력'}
` : '';

    // ========================================
    // v4.1 인바디급 비교 분석 프롬프트
    // ========================================
    const prompt = `# Role: Elite Sports Scientist & Clinical Body Composition Specialist
당신은 체형 변화를 정밀 분석하는 엘리트 스포츠 과학자입니다.
두 장의 사진(Before/After)을 비교하여 **계측학적 정밀 분석**을 수행하십시오.

# Analysis Goal: Quantitative Change Detection
단순히 "좋아졌다/나빠졌다"가 아닌, **실제 면적(cm²)과 둘레(cm)의 변화량**을 산출하는 것이 목표입니다.

${userMetadata}

## 사진 메타데이터
- Before 사진 날짜: ${beforeDate.toISOString().split('T')[0]}
- After 사진 날짜: ${afterDate.toISOString().split('T')[0]}
- 두 사진 간격: ${daysDifference}일

# Phase 1: Photo Condition Matching (Critical Quality Check)
🚨 **비교 분석의 핵심: 두 사진의 조건이 얼마나 일치하는가**

다음 항목을 체크하여 비교 신뢰도를 평가하십시오:
1. **근육 수축 상태 일치:** 둘 다 힘을 줬거나, 둘 다 이완 상태인가?
2. **조명 조건 일치:** 조명 방향과 강도가 유사한가?
3. **촬영 거리 일치:** 카메라와의 거리가 비슷한가?
4. **촬영 각도 일치:** 같은 각도에서 촬영되었는가?

⚠️ 조건이 다르면 **겉보기 변화(Apparent Change)**와 **실제 변화(Real Change)**를 반드시 구분하십시오.

# Phase 2: Spatial Alignment (Homography Concept)
1. 두 사진에서 공통된 배경 사물(앵커)을 찾으십시오.
2. 얼굴 크기를 기준으로 두 사진의 축척을 동기화하십시오.
3. 축척이 다른 경우, 환산하여 동일 기준에서 비교하십시오.

# Phase 3: Realistic Change Expectation
기간에 따른 현실적인 변화 범위:
- **0-1일:** 실제 근육/체지방 변화 불가능. 사진 조건 차이만 존재.
- **1-7일:** 수분/글리코겐 변동으로 인한 무게 변화만 가능. 근육량 변화 미미.
- **2-4주:** 초보자 기준 근육량 0.5-1kg 증가 가능. 눈에 띄는 변화 시작.
- **1-3개월:** 유의미한 체형 변화 가능. 근육 데피니션 개선 확인 가능.
- **3-6개월:** 명확한 체형 변화. 부위별 근육량 증가 측정 가능.
- **6개월+:** 극적인 변화 가능. 전후 비교 사진으로 명확히 확인.

# Phase 4: Quantitative Comparison
다음을 계산하십시오:
1. **부위별 투영 면적 변화 (%):** 어깨, 가슴, 팔 등의 2D 투영 면적 변화
2. **추정 둘레 변화 (cm):** 축척 보정 후 실제 cm 단위 변화
3. **근육 데피니션 변화:** 음영 대비 분석을 통한 선명도 변화
4. **체지방 변화 추정:** 복부 라인, 혈관 비침도 등으로 추정

# Phase 5: Honesty Protocol
🚨 **정직한 비교 분석 원칙:**
- 사진 조건 차이로 인한 **겉보기 변화**를 실제 변화로 오인하지 마십시오.
- 한쪽 사진에서만 보이는 근육은 비교 불가로 표시하십시오.
- 기간 대비 비현실적인 변화가 감지되면 사진 조건 차이를 의심하십시오.
- 변화가 없거나 후퇴한 경우에도 **냉철하고 사실적으로** 보고하십시오.

# Output Format (Strict JSON Only)
{
  "analysisVersion": "4.1",
  "photoConditions": {
    "before": {
      "muscleState": "flexed | relaxed | unknown",
      "lighting": "strong | moderate | weak",
      "distance": "close | medium | far",
      "angle": "front | side | back | angle",
      "imageQuality": "high | medium | low"
    },
    "after": {
      "muscleState": "flexed | relaxed | unknown",
      "lighting": "strong | moderate | weak",
      "distance": "close | medium | far",
      "angle": "front | side | back | angle",
      "imageQuality": "high | medium | low"
    },
    "conditionMatch": {
      "muscleStateMatch": true | false,
      "lightingMatch": true | false,
      "distanceMatch": true | false,
      "angleMatch": true | false,
      "overallMatchScore": 0-100,
      "overallComparability": "high | medium | low",
      "comparabilityExplanation": "비교 가능성에 대한 상세 설명"
    }
  },
  "timePeriod": {
    "daysBetween": ${daysDifference},
    "category": "same_day | within_week | within_month | 1-3_months | 3-6_months | over_6_months",
    "realisticChangeExpectation": "이 기간 동안 현실적으로 가능한 변화 범위",
    "suspiciousIfExceeds": "이 이상의 변화는 사진 조건 차이를 의심해야 함"
  },
  "spatialAlignment": {
    "scaleMatchMethod": "얼굴 기준 | 배경 앵커 | 사용자 신장",
    "scaleDifferencePercent": Before 대비 After의 축척 차이(%),
    "alignmentConfidence": "high | medium | low",
    "alignmentNote": "축척 동기화에 대한 설명"
  },
  "apparentVsRealChanges": {
    "apparentChanges": "사진 조건 차이로 인한 겉보기 변화 상세 설명",
    "realChanges": "실제 체형/근육 변화로 판단되는 부분 상세 설명",
    "uncertainChanges": "조건 차이인지 실제 변화인지 불확실한 부분"
  },
  "overallChange": "크게 개선 | 개선 | 약간 개선 | 유지 | 약간 후퇴 | 후퇴 | 비교불가",
  "changeScore": -100에서 100,
  "changeConfidence": "high | medium | low",
  "beforeScore": 1-100,
  "afterScore": 1-100,
  "estimatedBodyFatChange": {
    "before": 추정 체지방률(%) 또는 null,
    "after": 추정 체지방률(%) 또는 null,
    "change": "감소/유지/증가/판단불가",
    "changePercent": "-2%" 형태 또는 null,
    "confidence": "high | medium | low | none"
  },
  "muscleChanges": {
    "shoulders": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "-20% ~ +50% 또는 비교불가",
      "definitionBefore": 1-10 또는 null,
      "definitionAfter": 1-10 또는 null,
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 상세 (조건 차이 영향 포함)"
    },
    "chest": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "back": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "biceps": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "triceps": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "abs": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "obliques": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "quads": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "hamstrings": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "glutes": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "calves": { "before": null, "after": null, "changePercent": "", "confidence": "none", "visibleInBoth": false, "detail": "" }
  },
  "measurementChanges": {
    "shoulderWidth": { "before": "cm", "after": "cm", "change": "+0.0cm", "confidence": "high|medium|low|none" },
    "chestCircumference": { "before": "cm", "after": "cm", "change": "+0.0cm", "confidence": "high|medium|low|none" },
    "waistCircumference": { "before": "cm", "after": "cm", "change": "-0.0cm", "confidence": "high|medium|low|none" },
    "armCircumference": { "before": "cm", "after": "cm", "change": "+0.0cm", "confidence": "high|medium|low|none" }
  },
  "comparisonSummary": {
    "comparableMuscles": ["비교 가능한 근육 목록"],
    "notComparableMuscles": ["비교 불가능한 근육과 이유"]
  },
  "topImproved": [
    {
      "rank": 1,
      "muscle": "가장 성장한 근육 (비교 가능한 것 중)",
      "changePercent": "+30%",
      "confidence": "high | medium | low",
      "isRealChange": true | false,
      "detail": "성장 상세 (사진 조건 영향 고려)",
      "keepDoingExercises": ["계속하면 좋은 운동"]
    }
  ],
  "needsWork": [
    {
      "rank": 1,
      "muscle": "더 노력 필요한 근육",
      "changePercent": "+5% 또는 0%",
      "confidence": "high | medium | low",
      "reason": "부족한 이유",
      "recommendedExercises": [{"name": "운동", "sets": "3세트", "reps": "12회", "tip": "팁"}]
    }
  ],
  "bodyComposition": {
    "fatChange": "감소 | 유지 | 증가 | 판단불가",
    "fatChangeConfidence": "high | medium | low | none",
    "muscleChange": "증가 | 유지 | 감소 | 판단불가",
    "muscleChangeConfidence": "high | medium | low | none",
    "detail": "체성분 변화 상세 (조건 차이 고려)"
  },
  "recommendations": {
    "nextGoal": "다음 목표",
    "focusMuscles": ["집중 근육"],
    "photoTip": "더 정확한 비교를 위한 촬영 팁 (조건 일치 강조)",
    "weeklyPlan": {
      "day1": "월요일",
      "day2": "화요일",
      "day3": "수요일",
      "day4": "목요일",
      "day5": "금요일"
    },
    "nutritionTip": "영양 조언",
    "lifestyleTip": "생활 조언"
  },
  "analysisDisclaimer": "이 비교 분석은 사진 기반 시각적 평가입니다. 사진 조건(조명, 각도, 힘 준 상태)에 따라 결과가 달라질 수 있으며, 실제 체성분 변화와 다를 수 있습니다. 촬영 조건을 최대한 일치시켜 촬영하면 더 정확한 비교가 가능합니다.",
  "encouragement": "격려 메시지 (현실적이면서 동기부여)",
  "summary": "전체 비교 분석 요약 (5-6문장, 사진 조건 차이와 실제 변화 구분, 냉철하고 사실적)"
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
        return res.status(500).json({ 
          error: 'AI 비교 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.',
          detail: 'JSON 파싱 실패'
        });
      }
    }

    res.json({
      success: true,
      comparison,
      userProfile: userProfile ? {
        height: userProfile.height_cm,
        weight: userProfile.weight_kg
      } : null,
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

// ============================================
// 사용자 프로필 업데이트 API (v4.1 신규)
// ============================================
router.post('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { height_cm, weight_kg, age, gender } = req.body;

    await pool.query(
      `UPDATE users SET 
        height_cm = COALESCE($1, height_cm),
        weight_kg = COALESCE($2, weight_kg),
        age = COALESCE($3, age),
        gender = COALESCE($4, gender),
        updated_at = NOW()
      WHERE id = $5`,
      [height_cm, weight_kg, age, gender, userId]
    );

    res.json({
      success: true,
      message: '프로필이 업데이트되었습니다.',
      profile: { height_cm, weight_kg, age, gender }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: '프로필 업데이트 중 오류가 발생했습니다' });
  }
});

// ============================================
// 사용자 프로필 조회 API (v4.1 신규)
// ============================================
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await getUserProfile(userId);

    res.json({
      success: true,
      profile: profile || { height_cm: null, weight_kg: null, age: null, gender: null }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: '프로필 조회 중 오류가 발생했습니다' });
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
