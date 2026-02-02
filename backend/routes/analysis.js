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
        temperature: 0,
        topP: 1,
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
    "estimatedDistanceCm": 150,
    "angle": "front | side | back | angle",
    "imageQuality": "high | medium | low",
    "analysisReliability": "high | medium | low",
    "analysisLimitations": "이 사진에서 분석이 제한되는 부분과 이유"
  },
  "spatialCalibration": {
    "primaryAnchor": "얼굴 | 배경사물 | 사용자입력신장",
    "pixelsPerCm": 15.2,
    "calibrationConfidence": "high | medium | low",
    "calibrationNote": "축척 보정에 대한 설명"
  },
  "bodyType": "체형 분류 (중배엽형/외배엽형/내배엽형/혼합형)",
  "bodyTypeDescription": "체형에 대한 객관적 설명 (2-3문장)",
  "estimatedBodyFatPercent": 18,
  "bodyFatConfidence": "high | medium | low | none",
  "overallScore": 65,
  "overallConfidence": "high | medium | low",
  "textureAnalysis": {
    "overallDefinition": 6,
    "vascularity": "none | minimal | moderate | prominent",
    "muscleStriation": "none | partial | visible | pronounced",
    "skinFoldEstimate": "thin | moderate | thick"
  },
  "estimatedMeasurements": {
    "shoulderWidth": "45cm",
    "chestCircumference": "95cm",
    "waistCircumference": "80cm",
    "armCircumference": "35cm",
    "thighCircumference": "55cm",
    "bodySymmetry": 7,
    "measurementConfidence": "high | medium | low | none",
    "measurementNote": "측정치에 대한 부연 설명"
  },
  "posture": {
    "score": 75,
    "confidence": "high | medium | low | none",
    "spineAlignment": "척추 정렬 상태",
    "shoulderBalance": "어깨 균형",
    "headPosition": "머리 위치",
    "pelvisTilt": "골반 상태"
  },
  "muscleAnalysis": {
    "upperBody": {
      "overall": 6,
      "overallConfidence": "high | medium | low | none",
      "shoulders": {
        "score": 6,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 5,
        "detail": "삼각근 발달 상태 및 데피니션 분석"
      },
      "chest": {
        "score": 6,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 5,
        "detail": "대흉근 상/중/하부 발달 및 분리도"
      },
      "back": {
        "score": null,
        "confidence": "none",
        "visibleInPhoto": false,
        "definition": null,
        "detail": "정면 사진에서는 등 근육이 보이지 않습니다"
      },
      "biceps": {
        "score": 5,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 4,
        "detail": "이두근 피크와 두께 분석"
      },
      "triceps": {
        "score": null,
        "confidence": "none",
        "visibleInPhoto": false,
        "definition": null,
        "detail": "현재 각도에서 보이지 않음"
      }
    },
    "core": {
      "overall": 5,
      "overallConfidence": "high | medium | low | none",
      "abs": {
        "score": 5,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 4,
        "sixPackVisibility": "none | partial | clear | striated",
        "detail": "복직근 발달 및 선명도 분석"
      },
      "obliques": {
        "score": 4,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 3,
        "detail": "옆구리 근육 발달도"
      }
    },
    "lowerBody": {
      "overall": 5,
      "overallConfidence": "high | medium | low | none",
      "quads": {
        "score": 5,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 4,
        "detail": "대퇴사두근 발달 상태"
      },
      "hamstrings": {
        "score": null,
        "confidence": "none",
        "visibleInPhoto": false,
        "definition": null,
        "detail": "정면 사진에서 보이지 않음"
      },
      "glutes": {
        "score": null,
        "confidence": "none",
        "visibleInPhoto": false,
        "definition": null,
        "detail": "정면 사진에서 보이지 않음"
      },
      "calves": {
        "score": 5,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true,
        "definition": 4,
        "detail": "종아리 근육 발달 상태"
      }
    }
  },
  "weakPoints": [
    {
      "rank": 1,
      "muscle": "가장 약한 근육",
      "score": 4,
      "confidence": "high | medium | low",
      "reason": "약한 이유 설명",
      "recommendedExercises": [
        {"name": "추천 운동", "sets": "3세트", "reps": "12회", "tip": "운동 팁"}
      ]
    }
  ],
  "strongPoints": [
    {
      "rank": 1,
      "muscle": "가장 강한 근육",
      "score": 7,
      "confidence": "high | medium | low",
      "detail": "강한 이유 설명"
    }
  ],
  "recommendations": {
    "primaryFocus": "주요 집중 부위",
    "secondaryFocus": "보조 집중 부위",
    "weeklyPlan": {
      "day1": "가슴/삼두",
      "day2": "등/이두",
      "day3": "하체",
      "day4": "어깨/복근",
      "day5": "전신 또는 휴식"
    },
    "nutritionTip": "영양 조언",
    "lifestyleTip": "생활 조언"
  },
  "analysisDisclaimer": "이 분석은 사진 기반 시각적 평가입니다. 실제 체성분 측정(인바디 등)과 차이가 있을 수 있으며, 촬영 조건(조명, 각도, 근육 수축 상태)에 따라 결과가 달라질 수 있습니다.",
  "summary": "전체 분석 요약 (5-6문장, 냉철하고 사실적)"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
    ]);

    const response = await result.response;
    let analysisText = response.text();
    
    // JSON 파싱
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('JSON 파싱 실패, 정리 시도:', parseError);
      
      const cleanText = analysisText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^{]*/, '')
        .replace(/[^}]*$/, '')
        .trim();
      
      try {
        analysis = JSON.parse(cleanText);
      } catch (retryError) {
        console.error('최종 파싱 실패');
        return res.status(500).json({ 
          error: 'AI 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.',
          detail: 'JSON 파싱 실패'
        });
      }
    }

    // 분석 결과 저장
    await pool.query(
      'UPDATE photos SET analysis_data = $1 WHERE id = $2',
      [JSON.stringify(analysis), photoId]
    );

    res.json({
      success: true,
      analysis,
      userProfile: userProfile ? {
        height: userProfile.height_cm,
        weight: userProfile.weight_kg
      } : null,
      photo: {
        id: photo.id,
        url: photo.photo_url,
        takenAt: photo.taken_at
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: '분석 중 오류가 발생했습니다: ' + error.message });
  }
});

// ============================================
// 두 사진 비교 분석 (v4.1)
// ============================================
router.post('/compare', async (req, res) => {
  try {
    const { photoId1, photoId2 } = req.body;
    const userId = req.user.id;

    // 두 사진 조회
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

    // 이미지를 Base64로 변환
    const beforeBase64 = await imageUrlToBase64(beforePhoto.photo_url);
    const afterBase64 = await imageUrlToBase64(afterPhoto.photo_url);

    // 날짜 차이 계산
    const beforeDate = new Date(beforePhoto.taken_at);
    const afterDate = new Date(afterPhoto.taken_at);
    const daysDifference = Math.round((afterDate - beforeDate) / (1000 * 60 * 60 * 24));

    // 사용자 메타데이터
    const userMetadata = userProfile ? `
## 사용자 신체 정보
- 신장: ${userProfile.height_cm || '미입력'}cm
- 체중: ${userProfile.weight_kg || '미입력'}kg
- 나이: ${userProfile.age || '미입력'}세
- 성별: ${userProfile.gender === 'male' ? '남성' : userProfile.gender === 'female' ? '여성' : '미입력'}
` : '';

    // 비교 분석 프롬프트
    const prompt = `# Role: Elite Sports Scientist - Before/After Comparison Expert
당신은 수만 건의 신체 변화 데이터를 분석한 전문가입니다.
두 사진(Before/After)을 비교하여 **실제 변화와 사진 조건 차이를 명확히 구분**하십시오.

${userMetadata}

# 기간 정보
- Before 촬영일: ${beforeDate.toLocaleDateString('ko-KR')}
- After 촬영일: ${afterDate.toLocaleDateString('ko-KR')}  
- 경과 기간: ${daysDifference}일

# 기간별 현실적 변화 기대치
- 0-1일: 실제 근육/체지방 변화 불가능. 모든 차이는 사진 조건(조명, 힘 준 상태, 각도) 차이
- 1-7일: 수분 변동, 글리코겐 저장량 변화만 가능. 실제 근육 성장은 불가능
- 2-4주: 초보자의 경우 0.5-1kg 근육 증가 가능. 체지방 1-2% 감소 가능
- 1-3개월: 유의미한 체형 변화 가능. 근육 1-3kg 증가 가능
- 3-6개월: 명확한 변화 가능
- 6개월+: 극적인 변화 가능

# Critical: 겉보기 변화 vs 실제 변화 구분
🚨 반드시 구분하십시오:
1. **겉보기 변화 (Apparent Changes):** 사진 조건 차이로 인한 변화
   - 조명 차이 → 음영 깊이 차이 → 근육이 더 커보이거나 작아보임
   - 힘 준 상태 차이 → 근육 크기/선명도 차이
   - 카메라 각도/거리 차이 → 체형 왜곡
   
2. **실제 변화 (Real Changes):** 기간 내 실현 가능한 실제 변화
   - 근육 크기 증가/감소
   - 체지방 증가/감소
   - 자세 개선

# Photo Condition Analysis
각 사진의 조건을 분석하고 비교 신뢰도를 평가하십시오:
- muscleState: flexed/relaxed/unknown
- lighting: strong/moderate/weak
- distance: close/medium/far
- angle: front/side/back/angle

# Honesty Protocol
🚨 **정직한 비교 원칙:**
- 기간 대비 비현실적인 변화는 **사진 조건 차이**로 판단
- 두 사진 모두에서 **명확히 보이는 근육만** 비교
- 한쪽에서만 보이는 근육은 비교 불가 처리
- 변화가 없거나 후퇴해도 **냉철하게 사실대로** 보고

# Output Format (Strict JSON Only)
{
  "analysisVersion": "4.1",
  "photoConditions": {
    "before": {
      "muscleState": "flexed | relaxed | unknown",
      "lighting": "strong | moderate | weak",
      "distance": "close | medium | far",
      "angle": "front | side | back | angle",
      "analysisReliability": "high | medium | low"
    },
    "after": {
      "muscleState": "flexed | relaxed | unknown",
      "lighting": "strong | moderate | weak",
      "distance": "close | medium | far",
      "angle": "front | side | back | angle",
      "analysisReliability": "high | medium | low"
    },
    "conditionMatch": {
      "muscleStateMatch": true,
      "lightingMatch": true,
      "distanceMatch": true,
      "angleMatch": true,
      "overallMatchScore": 85,
      "overallComparability": "high | medium | low",
      "comparabilityExplanation": "비교 신뢰도 설명"
    }
  },
  "timePeriod": {
    "daysBetween": ${daysDifference},
    "realisticChangeExpectation": "이 기간 동안 현실적으로 가능한 변화 설명"
  },
  "apparentVsRealChanges": {
    "apparentChanges": "사진 조건 차이로 인한 겉보기 변화 상세 설명",
    "realChanges": "실제 체형/근육 변화로 판단되는 부분 상세 설명",
    "uncertainChanges": "조건 차이인지 실제 변화인지 불확실한 부분"
  },
  "overallChange": "크게 개선 | 개선 | 약간 개선 | 유지 | 약간 후퇴 | 후퇴 | 비교불가",
  "changeScore": 15,
  "changeConfidence": "high | medium | low",
  "beforeScore": 60,
  "afterScore": 65,
  "estimatedBodyFatChange": {
    "before": 20,
    "after": 18,
    "change": "감소 | 유지 | 증가 | 판단불가",
    "changePercent": "-2%",
    "confidence": "high | medium | low | none"
  },
  "muscleChanges": {
    "shoulders": {
      "before": 6,
      "after": 7,
      "changePercent": "+17%",
      "definitionBefore": 5,
      "definitionAfter": 6,
      "confidence": "high | medium | low | none",
      "visibleInBoth": true,
      "detail": "변화 상세 (조건 차이 영향 포함)"
    },
    "chest": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "back": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "biceps": { "before": 5, "after": 5, "changePercent": "0%", "confidence": "medium", "visibleInBoth": true, "detail": "변화 없음" },
    "triceps": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "abs": { "before": 5, "after": 6, "changePercent": "+20%", "confidence": "medium", "visibleInBoth": true, "detail": "약간 개선" },
    "obliques": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "quads": { "before": 5, "after": 5, "changePercent": "0%", "confidence": "low", "visibleInBoth": true, "detail": "변화 미미" },
    "hamstrings": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "glutes": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" },
    "calves": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "보이지 않음" }
  },
  "measurementChanges": {
    "shoulderWidth": { "before": "45cm", "after": "46cm", "change": "+1.0cm", "confidence": "medium" },
    "chestCircumference": { "before": "95cm", "after": "96cm", "change": "+1.0cm", "confidence": "low" },
    "waistCircumference": { "before": "82cm", "after": "80cm", "change": "-2.0cm", "confidence": "medium" },
    "armCircumference": { "before": "34cm", "after": "35cm", "change": "+1.0cm", "confidence": "low" }
  },
  "comparisonSummary": {
    "comparableMuscles": ["어깨", "복근", "이두"],
    "notComparableMuscles": ["등 - 보이지 않음", "삼두 - 각도 차이"]
  },
  "topImproved": [
    {
      "rank": 1,
      "muscle": "복근",
      "changePercent": "+20%",
      "confidence": "medium",
      "isRealChange": true,
      "detail": "복근 선명도 개선",
      "keepDoingExercises": ["플랭크", "크런치"]
    }
  ],
  "needsWork": [
    {
      "rank": 1,
      "muscle": "이두",
      "changePercent": "0%",
      "confidence": "medium",
      "reason": "변화 없음",
      "recommendedExercises": [{"name": "바벨 컬", "sets": "4세트", "reps": "10회", "tip": "천천히"}]
    }
  ],
  "bodyComposition": {
    "fatChange": "감소 | 유지 | 증가 | 판단불가",
    "fatChangeConfidence": "medium",
    "muscleChange": "증가 | 유지 | 감소 | 판단불가",
    "muscleChangeConfidence": "medium",
    "detail": "체성분 변화 상세 (조건 차이 고려)"
  },
  "recommendations": {
    "nextGoal": "다음 목표",
    "focusMuscles": ["집중 근육"],
    "photoTip": "더 정확한 비교를 위한 촬영 팁",
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
  "analysisDisclaimer": "이 비교 분석은 사진 기반 시각적 평가입니다. 사진 조건에 따라 결과가 달라질 수 있습니다.",
  "encouragement": "격려 메시지",
  "summary": "전체 비교 분석 요약 (5-6문장)"
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
