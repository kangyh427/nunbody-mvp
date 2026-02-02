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
    timeout: 15000  // 15초 타임아웃
  });
  return Buffer.from(response.data).toString('base64');
}

// ============================================
// 단일 사진 분석 (v4.0 - 일관성 + 정직한 분석)
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

    // Gemini Vision 모델 설정 (일관성을 위한 temperature: 0)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,      // 🔑 핵심: 동일 입력 = 동일 출력
        topP: 1,
        topK: 1
      }
    });

    // 이미지를 Base64로 변환
    const base64Image = await imageUrlToBase64(photo.photo_url);

    // ========================================
    // v4.0 정밀 분석 프롬프트 (정직한 분석)
    // ========================================
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 분석 전문가입니다.

## 🚨 최우선 원칙: 정직하고 일관된 분석

### 원칙 1: 보이지 않으면 평가하지 않는다
- 사진에서 **명확히 보이지 않는 근육**은 반드시 score: null, confidence: "none"으로 표시
- 옷에 가려진 부위, 각도상 보이지 않는 부위는 **절대 추측하지 않음**
- "아마도", "추정컨대" 같은 추측 금지

### 원칙 2: 사진 조건을 먼저 분석한다
분석 전에 반드시 다음을 파악하세요:
1. **근육 수축 상태**: flexed(힘을 준 상태) / relaxed(이완 상태) / unknown(판단 불가)
2. **조명 조건**: strong(강한 조명, 그림자로 근육 선명) / moderate(보통) / weak(약한 조명, 평면적)
3. **촬영 거리**: close(근접) / medium(중거리) / far(원거리)
4. **촬영 각도**: front(정면) / side(측면) / back(후면) / angle(비스듬히)
5. **이미지 품질**: high / medium / low

### 원칙 3: 축척 보정 (Smart Scaling)
- 얼굴 크기(약 22-23cm)를 기준점으로 사용
- 촬영 거리에 따른 왜곡을 보정
- 멀리서 찍은 사진과 가까이서 찍은 사진을 동일한 기준으로 평가

### 원칙 4: 일관된 점수 기준
점수는 **일반 성인 남성/여성 평균을 5점**으로 기준:
- 1-2점: 매우 미발달 (근육이 거의 보이지 않음)
- 3-4점: 평균 이하 (약간의 근육 윤곽)
- 5점: 평균 (일반인 수준)
- 6-7점: 평균 이상 (운동하는 사람 수준)
- 8-9점: 우수 (숙련된 운동인)
- 10점: 최상위 (보디빌더/선수급)

---

## 응답 형식 (JSON)

반드시 아래 구조로만 응답하세요. 보이지 않는 근육은 score: null로 표시합니다.

{
  "photoConditions": {
    "muscleState": "flexed | relaxed | unknown",
    "muscleStateDetail": "근육 수축 상태에 대한 설명",
    "lighting": "strong | moderate | weak",
    "lightingDetail": "조명이 분석에 미치는 영향",
    "distance": "close | medium | far",
    "angle": "front | side | back | angle",
    "imageQuality": "high | medium | low",
    "analysisLimitations": "이 사진에서 분석이 제한되는 부분 설명"
  },
  "bodyType": "체형 분류 (예: 중배엽형, 외배엽형, 내배엽형, 혼합형)",
  "bodyTypeDescription": "체형에 대한 객관적 설명 (2-3문장)",
  "overallScore": 1-100,
  "overallConfidence": "high | medium | low",
  "estimatedMeasurements": {
    "shoulderWidth": "어깨 너비 추정 (cm) 또는 null",
    "chestCircumference": "가슴 둘레 추정 (cm) 또는 null",
    "waistCircumference": "허리 둘레 추정 (cm) 또는 null",
    "armCircumference": "팔 둘레 추정 (cm) 또는 null",
    "bodySymmetry": 1-10,
    "measurementConfidence": "high | medium | low"
  },
  "posture": {
    "score": 1-100 또는 null,
    "confidence": "high | medium | low | none",
    "spineAlignment": "척추 정렬 상태 또는 '사진에서 확인 불가'",
    "shoulderBalance": "어깨 균형 또는 '사진에서 확인 불가'",
    "headPosition": "머리 위치 또는 '사진에서 확인 불가'",
    "pelvisTilt": "골반 상태 또는 '사진에서 확인 불가'"
  },
  "muscleAnalysis": {
    "upperBody": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "shoulders": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "보이면 상세 설명, 안 보이면 '사진에서 확인 불가'"
      },
      "chest": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "back": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "biceps": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "triceps": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      }
    },
    "core": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "abs": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "obliques": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      }
    },
    "lowerBody": {
      "overall": 1-10 또는 null,
      "overallConfidence": "high | medium | low | none",
      "quads": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "hamstrings": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "glutes": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      },
      "calves": {
        "score": 1-10 또는 null,
        "confidence": "high | medium | low | none",
        "visibleInPhoto": true | false,
        "detail": "상세 설명 또는 '사진에서 확인 불가'"
      }
    }
  },
  "visibleMusclesSummary": {
    "fullyVisible": ["사진에서 명확히 보이는 근육 목록"],
    "partiallyVisible": ["부분적으로 보이는 근육 목록"],
    "notVisible": ["보이지 않는 근육 목록"]
  },
  "weakestMuscles": [
    {
      "rank": 1,
      "muscle": "가장 약한 근육명 (보이는 근육 중에서만)",
      "englishName": "영문명",
      "score": 1-10,
      "confidence": "high | medium | low",
      "reason": "약한 이유 (구체적으로)",
      "exercises": [
        {"name": "운동1", "sets": "3세트", "reps": "12회", "tip": "운동 팁"},
        {"name": "운동2", "sets": "3세트", "reps": "10회", "tip": "운동 팁"},
        {"name": "운동3", "sets": "4세트", "reps": "15회", "tip": "운동 팁"}
      ]
    }
  ],
  "strongestMuscles": [
    {
      "muscle": "강점 근육 (보이는 근육 중에서만)",
      "score": 1-10,
      "confidence": "high | medium | low",
      "detail": "강점 설명"
    }
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
  "analysisDisclaimer": "이 분석은 사진 기반 시각적 평가이며, 실제 근육량이나 체성분과 다를 수 있습니다. 정확한 측정을 위해서는 전문 장비를 이용하세요.",
  "summary": "전체 분석 요약 (4-5문장, 보이는 근육에 대해서만 평가, 확인 불가한 부분은 언급)"
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
        // ❌ 가짜 데이터 반환하지 않고 에러 반환
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
// 두 사진 비교 분석 (v4.0 - 일관성 + 정직한 비교)
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

    // Gemini Vision 모델 설정 (일관성을 위한 temperature: 0)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,      // 🔑 핵심: 동일 입력 = 동일 출력
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

    // ========================================
    // v4.0 비교 분석 프롬프트 (정직한 비교)
    // ========================================
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 변화 분석 전문가입니다.

## 📅 사진 정보
- Before 사진 날짜: ${beforeDate.toISOString().split('T')[0]}
- After 사진 날짜: ${afterDate.toISOString().split('T')[0]}
- 두 사진 간격: ${daysDifference}일

## 🚨 최우선 원칙: 정직하고 일관된 비교 분석

### 원칙 1: 사진 조건 차이를 먼저 파악한다
두 사진의 조건이 다르면 변화로 오인할 수 있습니다:
- 힘을 준 상태 vs 이완 상태 → 실제 근육 변화 아님
- 조명 차이 → 근육 선명도 차이로 오인 가능
- 촬영 거리 차이 → 크기 변화로 오인 가능
- 각도 차이 → 형태 변화로 오인 가능

### 원칙 2: 조건 차이와 실제 변화를 구분한다
- 사진 조건(힘/조명/거리/각도)의 차이로 인한 "겉보기 차이"
- 실제 근육량/체형의 "진짜 변화"
이 둘을 명확히 구분하여 설명하세요.

### 원칙 3: 기간에 따른 현실적 변화 범위
- 1일 이내: 실제 근육/체형 변화 불가능. 사진 조건 차이만 분석
- 1주일 이내: 체중 변동(수분/음식) 가능, 근육량 변화는 미미
- 1개월: 초보자 기준 근육량 0.5-1kg 증가 가능
- 3개월: 눈에 띄는 변화 시작 가능
- 6개월 이상: 유의미한 체형 변화 가능

### 원칙 4: 보이지 않으면 비교하지 않는다
- 두 사진 모두에서 보이는 근육만 비교
- 한쪽에서만 보이는 근육은 비교 불가로 표시
- 추측 금지

### 원칙 5: 축척 보정 후 비교
- 두 사진의 얼굴/머리 크기를 기준으로 축척 맞추기
- 촬영 거리 차이로 인한 왜곡 보정

---

## 응답 형식 (JSON)

{
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
    "conditionDifferences": {
      "hasMuscleStateDifference": true | false,
      "hasLightingDifference": true | false,
      "hasDistanceDifference": true | false,
      "hasAngleDifference": true | false,
      "overallComparability": "high | medium | low",
      "comparabilityExplanation": "두 사진의 비교 가능성에 대한 설명"
    }
  },
  "timePeriod": {
    "daysBetween": ${daysDifference},
    "category": "same_day | within_week | within_month | 1-3_months | 3-6_months | over_6_months",
    "realisticChangeExpectation": "이 기간 동안 현실적으로 가능한 변화 범위 설명"
  },
  "overallChange": "크게 개선 | 개선 | 약간 개선 | 유지 | 주의필요 | 비교불가",
  "changeScore": -100에서 100 사이 숫자,
  "changeConfidence": "high | medium | low",
  "beforeScore": 1-100,
  "afterScore": 1-100,
  "apparentVsRealChanges": {
    "apparentChanges": "사진 조건 차이로 인한 겉보기 변화 설명",
    "realChanges": "실제 체형/근육 변화로 판단되는 부분 설명",
    "uncertainChanges": "조건 차이인지 실제 변화인지 불확실한 부분"
  },
  "muscleChanges": {
    "shoulders": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "-20% ~ +50% 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명 또는 '한쪽 사진에서 확인 불가'"
    },
    "chest": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "back": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "biceps": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "triceps": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "abs": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "obliques": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "quads": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "hamstrings": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "glutes": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    },
    "calves": {
      "before": 1-10 또는 null,
      "after": 1-10 또는 null,
      "changePercent": "변화율 또는 '비교불가'",
      "confidence": "high | medium | low | none",
      "visibleInBoth": true | false,
      "detail": "변화 설명"
    }
  },
  "comparisonSummary": {
    "comparableMuscles": ["두 사진 모두에서 비교 가능한 근육 목록"],
    "notComparableMuscles": ["비교 불가능한 근육 목록과 이유"]
  },
  "topImproved": [
    {
      "rank": 1,
      "muscle": "가장 많이 성장한 근육 (비교 가능한 근육 중에서만)",
      "changePercent": "+30%",
      "confidence": "high | medium | low",
      "detail": "성장 상세 설명 (사진 조건 차이 고려)",
      "keepDoingExercises": ["계속하면 좋은 운동1", "운동2"]
    }
  ],
  "needsWork": [
    {
      "rank": 1,
      "muscle": "더 노력이 필요한 근육",
      "changePercent": "+5% 또는 0%",
      "confidence": "high | medium | low",
      "reason": "부족한 이유",
      "recommendedExercises": [
        {"name": "운동명", "sets": "3세트", "reps": "12회", "tip": "운동 팁"}
      ]
    }
  ],
  "bodyComposition": {
    "fatChange": "감소 | 유지 | 증가 | 판단불가",
    "fatChangeConfidence": "high | medium | low | none",
    "muscleChange": "증가 | 유지 | 감소 | 판단불가",
    "muscleChangeConfidence": "high | medium | low | none",
    "detail": "체성분 변화 설명 (사진 조건 차이 고려)"
  },
  "posture": {
    "beforeScore": 1-100 또는 null,
    "afterScore": 1-100 또는 null,
    "change": "자세 변화 설명 또는 '비교 불가'",
    "confidence": "high | medium | low | none"
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
    "photoTip": "더 정확한 비교를 위한 사진 촬영 팁",
    "nutritionTip": "영양 조언",
    "lifestyleTip": "생활습관 조언"
  },
  "analysisDisclaimer": "이 비교 분석은 사진 기반 시각적 평가입니다. 사진 조건(조명, 각도, 힘 준 상태 등)에 따라 결과가 달라질 수 있으며, 실제 체성분 변화와 다를 수 있습니다.",
  "encouragement": "개인화된 격려 메시지 (3-4문장, 현실적이면서도 동기부여)",
  "summary": "전체 비교 분석 요약 (5-6문장, 사진 조건 차이와 실제 변화를 구분하여 설명)"
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
        // ❌ 가짜 데이터 반환하지 않고 에러 반환
        return res.status(500).json({ 
          error: 'AI 비교 분석 결과를 처리할 수 없습니다. 다시 시도해주세요.',
          detail: 'JSON 파싱 실패'
        });
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
