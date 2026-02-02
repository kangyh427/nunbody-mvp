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
// v4.2: 분석 히스토리 저장 함수
// ============================================
async function saveAnalysisHistory(userId, analysisType, photoIds, resultJson) {
  try {
    const overallScore = resultJson.overallScore || resultJson.afterScore || null;
    const bodyFatPercent = resultJson.estimatedBodyFatPercent || 
                           resultJson.estimatedBodyFatChange?.after || null;
    
    await pool.query(
      `INSERT INTO analysis_history 
        (user_id, analysis_type, photo_ids, result_json, overall_score, body_fat_percent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, analysisType, photoIds, JSON.stringify(resultJson), overallScore, bodyFatPercent]
    );
    console.log(`📊 분석 히스토리 저장 완료 (${analysisType})`);
  } catch (err) {
    console.error('분석 히스토리 저장 실패:', err);
    // 히스토리 저장 실패는 분석 자체를 실패시키지 않음
  }
}

// ============================================
// 단일 사진 분석 (v4.2 - 히스토리 저장 추가)
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

    // v4.1 인바디급 정밀 분석 프롬프트
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

# Phase 2: Photo Condition Analysis (Critical)
분석 전 반드시 사진 조건을 평가하십시오:
1. **Muscle Contraction State:** flexed(힘을 준 상태) / relaxed(이완 상태) / unknown
2. **Lighting Quality:** 조명이 근육 음영에 미치는 영향
3. **Camera Distance & Angle:** 촬영 거리와 각도가 체형 인식에 미치는 영향

# Phase 3: Quantitative Metric Analysis
다음 부위의 **실측치(cm)**를 추정하십시오:
- 어깨 너비, 가슴 둘레, 허리 둘레, 팔 둘레, 허벅지 둘레

# Phase 4: Muscle Definition & Texture Scoring
- **Shadow Gradient:** 근육 주변 음영 깊이
- **Vascularity Detection:** 혈관 비침 검출
- **12개 근육군 개별 평가:** 발달도 + 선명도를 1-10점 정량화

# Phase 5: Honesty Protocol (Critical)
🚨 **정직한 분석 원칙:**
- 사진에서 **명확히 보이지 않는 근육**은 반드시 score: null, confidence: "none"으로 표시
- 옷에 가려진 부위, 각도상 보이지 않는 부위는 **절대 추측하지 않음**

# Scoring Standards (Absolute Reference)
점수는 **일반 성인 평균을 5점**으로 기준:
- 1-2점: 매우 미발달 / 3-4점: 평균 이하 / 5점: 평균
- 6-7점: 평균 이상 / 8-9점: 우수 / 10점: 최상위

# Output Format (Strict JSON Only)
{
  "analysisVersion": "4.2",
  "photoConditions": {
    "muscleState": "flexed | relaxed | unknown",
    "muscleStateDetail": "근육 수축 상태 상세 설명",
    "lighting": "strong | moderate | weak",
    "lightingEffect": "조명이 분석에 미치는 영향",
    "distance": "close | medium | far",
    "angle": "front | side | back | angle",
    "imageQuality": "high | medium | low",
    "analysisReliability": "high | medium | low",
    "analysisLimitations": "분석 제한 사항"
  },
  "spatialCalibration": {
    "primaryAnchor": "얼굴 | 배경사물 | 사용자입력신장",
    "pixelsPerCm": 15.2,
    "calibrationConfidence": "high | medium | low",
    "calibrationNote": "축척 보정 설명"
  },
  "bodyType": "체형 분류",
  "bodyTypeDescription": "체형 설명 (2-3문장)",
  "estimatedBodyFatPercent": 18,
  "bodyFatConfidence": "high | medium | low | none",
  "overallScore": 65,
  "overallConfidence": "high | medium | low",
  "estimatedMeasurements": {
    "shoulderWidth": "45cm",
    "chestCircumference": "95cm",
    "waistCircumference": "80cm",
    "armCircumference": "35cm",
    "thighCircumference": "55cm",
    "measurementConfidence": "high | medium | low | none"
  },
  "textureAnalysis": {
    "overallDefinition": 6,
    "vascularity": "none | minimal | moderate | high",
    "muscleStriation": "none | minimal | visible | prominent",
    "skinFoldEstimate": "thick | moderate | thin | very_thin"
  },
  "muscleAnalysis": {
    "upperBody": {
      "overall": 6,
      "shoulders": { "score": 6, "confidence": "high", "visibleInPhoto": true, "definition": 5, "detail": "설명" },
      "chest": { "score": 6, "confidence": "high", "visibleInPhoto": true, "definition": 5, "detail": "설명" },
      "back": { "score": null, "confidence": "none", "visibleInPhoto": false, "definition": null, "detail": "보이지 않음" },
      "biceps": { "score": 5, "confidence": "medium", "visibleInPhoto": true, "definition": 4, "detail": "설명" },
      "triceps": { "score": null, "confidence": "none", "visibleInPhoto": false, "definition": null, "detail": "보이지 않음" }
    },
    "core": {
      "overall": 5,
      "abs": { "score": 5, "confidence": "medium", "visibleInPhoto": true, "definition": 4, "sixPackVisibility": "none | partial | clear", "detail": "설명" },
      "obliques": { "score": 4, "confidence": "low", "visibleInPhoto": true, "definition": 3, "detail": "설명" }
    },
    "lowerBody": {
      "overall": 5,
      "quads": { "score": 5, "confidence": "medium", "visibleInPhoto": true, "definition": 4, "detail": "설명" },
      "hamstrings": { "score": null, "confidence": "none", "visibleInPhoto": false, "definition": null, "detail": "보이지 않음" },
      "glutes": { "score": null, "confidence": "none", "visibleInPhoto": false, "definition": null, "detail": "보이지 않음" },
      "calves": { "score": 5, "confidence": "medium", "visibleInPhoto": true, "definition": 4, "detail": "설명" }
    }
  },
  "weakestMuscles": [
    { "rank": 1, "muscle": "근육명", "score": 4, "reason": "이유", "exercises": [{"name": "운동", "sets": "3세트", "reps": "12회", "tip": "팁"}] }
  ],
  "strongestMuscles": [
    { "muscle": "근육명", "score": 7, "detail": "강점 설명" }
  ],
  "recommendations": {
    "priorityFocus": "집중 부위",
    "weeklyPlan": { "day1": "월", "day2": "화", "day3": "수", "day4": "목", "day5": "금" },
    "nutritionTip": "영양 조언",
    "restTip": "휴식 조언"
  },
  "analysisDisclaimer": "이 분석은 사진 기반 시각적 평가입니다.",
  "summary": "전체 분석 요약 (4-5문장)"
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
        return res.status(500).json({ 
          error: 'AI 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.'
        });
      }
    }

    // 분석 결과를 photos 테이블에 저장
    await pool.query(
      'UPDATE photos SET analysis_data = $1 WHERE id = $2 AND user_id = $3',
      [JSON.stringify(analysis), photoId, userId]
    );

    // v4.2: 분석 히스토리에도 저장
    await saveAnalysisHistory(userId, 'single', [photoId], analysis);

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
// 두 사진 비교 분석 (v4.2 - 히스토리 저장 추가)
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
    const userProfile = await getUserProfile(userId);

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        topP: 1,
        topK: 1
      }
    });

    const [beforeBase64, afterBase64] = await Promise.all([
      imageUrlToBase64(beforePhoto.photo_url),
      imageUrlToBase64(afterPhoto.photo_url)
    ]);

    const beforeDate = new Date(beforePhoto.taken_at || beforePhoto.created_at);
    const afterDate = new Date(afterPhoto.taken_at || afterPhoto.created_at);
    const daysDifference = Math.round((afterDate - beforeDate) / (1000 * 60 * 60 * 24));

    const userMetadata = userProfile ? `
## 사용자 신체 정보
- 신장: ${userProfile.height_cm || '미입력'}cm
- 체중: ${userProfile.weight_kg || '미입력'}kg
- 나이: ${userProfile.age || '미입력'}세
- 성별: ${userProfile.gender === 'male' ? '남성' : userProfile.gender === 'female' ? '여성' : '미입력'}
` : '';

    const prompt = `# Role: Elite Sports Scientist - Body Change Analyst
두 장의 사진(Before/After)을 비교하여 정밀 분석하십시오.

${userMetadata}

## 사진 메타데이터
- Before: ${beforeDate.toISOString().split('T')[0]}
- After: ${afterDate.toISOString().split('T')[0]}
- 기간: ${daysDifference}일

# 분석 원칙
1. 사진 조건 차이로 인한 **겉보기 변화**와 **실제 변화**를 구분
2. 기간 대비 비현실적인 변화는 사진 조건 차이로 판단
3. 한쪽에서만 보이는 근육은 비교 불가 처리
4. 냉철하고 사실적으로 분석

# Output Format (Strict JSON Only)
{
  "analysisVersion": "4.2",
  "photoConditions": {
    "before": { "muscleState": "flexed|relaxed|unknown", "lighting": "strong|moderate|weak", "distance": "close|medium|far", "angle": "front|side|back|angle" },
    "after": { "muscleState": "flexed|relaxed|unknown", "lighting": "strong|moderate|weak", "distance": "close|medium|far", "angle": "front|side|back|angle" },
    "conditionMatch": {
      "muscleStateMatch": true,
      "lightingMatch": true,
      "distanceMatch": true,
      "angleMatch": true,
      "overallMatchScore": 85,
      "overallComparability": "high|medium|low",
      "comparabilityExplanation": "비교 신뢰도 설명"
    }
  },
  "timePeriod": {
    "daysBetween": ${daysDifference},
    "realisticChangeExpectation": "현실적 변화 기대치"
  },
  "apparentVsRealChanges": {
    "apparentChanges": "사진 조건 차이로 인한 겉보기 변화",
    "realChanges": "실제 체형 변화",
    "uncertainChanges": "불확실한 변화"
  },
  "overallChange": "크게 개선|개선|약간 개선|유지|약간 후퇴|후퇴|비교불가",
  "changeScore": 15,
  "changeConfidence": "high|medium|low",
  "beforeScore": 60,
  "afterScore": 65,
  "estimatedBodyFatChange": {
    "before": 20,
    "after": 18,
    "change": "감소|유지|증가|판단불가",
    "changePercent": "-2%",
    "confidence": "high|medium|low|none"
  },
  "muscleChanges": {
    "shoulders": { "before": 6, "after": 7, "changePercent": "+17%", "confidence": "high", "visibleInBoth": true, "detail": "변화 상세" },
    "chest": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "back": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "biceps": { "before": 5, "after": 5, "changePercent": "0%", "confidence": "medium", "visibleInBoth": true, "detail": "" },
    "triceps": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "abs": { "before": 5, "after": 6, "changePercent": "+20%", "confidence": "medium", "visibleInBoth": true, "detail": "" },
    "obliques": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "quads": { "before": 5, "after": 5, "changePercent": "0%", "confidence": "low", "visibleInBoth": true, "detail": "" },
    "hamstrings": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "glutes": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" },
    "calves": { "before": null, "after": null, "changePercent": "비교불가", "confidence": "none", "visibleInBoth": false, "detail": "" }
  },
  "topImproved": [
    { "rank": 1, "muscle": "가장 성장한 근육", "changePercent": "+20%", "confidence": "high", "isRealChange": true, "detail": "상세" }
  ],
  "needsWork": [
    { "rank": 1, "muscle": "더 노력 필요한 근육", "changePercent": "0%", "reason": "이유", "recommendedExercises": [{"name": "운동", "sets": "3세트", "reps": "10회"}] }
  ],
  "recommendations": {
    "nextGoal": "다음 목표",
    "focusMuscles": ["집중 근육"],
    "photoTip": "더 정확한 비교를 위한 촬영 팁"
  },
  "analysisDisclaimer": "이 비교 분석은 사진 기반 시각적 평가입니다.",
  "encouragement": "격려 메시지",
  "summary": "전체 비교 분석 요약 (4-5문장)"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: beforeBase64 } },
      { inlineData: { mimeType: 'image/jpeg', data: afterBase64 } }
    ]);

    const response = await result.response;
    let comparisonText = response.text();
    
    let comparison;
    try {
      comparison = JSON.parse(comparisonText);
    } catch (parseError) {
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
          error: 'AI 비교 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.'
        });
      }
    }

    // v4.2: 비교 분석 히스토리 저장
    await saveAnalysisHistory(userId, 'compare', [beforePhoto.id, afterPhoto.id], comparison);

    res.json({
      success: true,
      comparison,
      userProfile: userProfile ? {
        height: userProfile.height_cm,
        weight: userProfile.weight_kg
      } : null,
      photos: {
        before: { id: beforePhoto.id, url: beforePhoto.photo_url, takenAt: beforePhoto.taken_at },
        after: { id: afterPhoto.id, url: afterPhoto.photo_url, takenAt: afterPhoto.taken_at }
      }
    });

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: '비교 분석 중 오류가 발생했습니다: ' + error.message });
  }
});

// ============================================
// v4.2: 분석 히스토리 목록 조회
// ============================================
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT 
        h.id,
        h.analysis_type,
        h.photo_ids,
        h.overall_score,
        h.body_fat_percent,
        h.created_at,
        (
          SELECT json_agg(json_build_object('id', p.id, 'url', p.photo_url, 'taken_at', p.taken_at))
          FROM photos p
          WHERE p.id = ANY(h.photo_ids)
        ) as photos
      FROM analysis_history h
      WHERE h.user_id = $1
      ORDER BY h.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    // 전체 개수 조회
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM analysis_history WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      history: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: '히스토리를 불러올 수 없습니다' });
  }
});

// ============================================
// v4.2: 특정 분석 히스토리 상세 조회
// ============================================
router.get('/history/:historyId', async (req, res) => {
  try {
    const { historyId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        h.*,
        (
          SELECT json_agg(json_build_object('id', p.id, 'url', p.photo_url, 'taken_at', p.taken_at))
          FROM photos p
          WHERE p.id = ANY(h.photo_ids)
        ) as photos
      FROM analysis_history h
      WHERE h.id = $1 AND h.user_id = $2`,
      [historyId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '분석 기록을 찾을 수 없습니다' });
    }

    const history = result.rows[0];

    res.json({
      success: true,
      history: {
        id: history.id,
        analysisType: history.analysis_type,
        photoIds: history.photo_ids,
        photos: history.photos,
        result: history.result_json,
        overallScore: history.overall_score,
        bodyFatPercent: history.body_fat_percent,
        createdAt: history.created_at
      }
    });

  } catch (error) {
    console.error('History detail fetch error:', error);
    res.status(500).json({ error: '분석 기록을 불러올 수 없습니다' });
  }
});

// ============================================
// v4.2: 점수 추이 데이터 조회 (그래프용)
// ============================================
router.get('/history/stats/trend', async (req, res) => {
  try {
    const userId = req.user.id;
    const { months = 6 } = req.query;

    const result = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        ROUND(AVG(overall_score)) as overall_score,
        ROUND(AVG(body_fat_percent)::numeric, 1) as body_fat_percent,
        COUNT(*) as analysis_count
      FROM analysis_history
      WHERE user_id = $1 
        AND created_at > NOW() - INTERVAL '${parseInt(months)} months'
        AND overall_score IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    res.json({
      success: true,
      trend: result.rows
    });

  } catch (error) {
    console.error('Trend fetch error:', error);
    res.status(500).json({ error: '추이 데이터를 불러올 수 없습니다' });
  }
});

// ============================================
// 사용자 프로필 업데이트 API
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
// 사용자 프로필 조회 API
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
