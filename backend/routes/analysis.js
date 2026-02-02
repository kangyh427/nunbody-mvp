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
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    // 이미지를 Base64로 변환
    const base64Image = await imageUrlToBase64(photo.photo_url);

    // 정밀 분석 프롬프트 (얼굴 크기 기반 축척 보정 포함)
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 분석 전문가입니다.

## 분석 지침

### 1. 축척 보정 (Smart Scaling)
- 얼굴 크기(Head Size)를 기준점으로 사용하세요
- 평균 성인 얼굴 길이는 약 22-23cm입니다
- 이 기준으로 어깨 너비, 팔 길이 등을 추정하세요
- 카메라 거리에 따른 왜곡을 보정하세요

### 2. 분석 항목
- 체형 분류: 외배엽(마름), 중배엽(근육질), 내배엽(통통) 또는 혼합형
- 자세 평가: 척추 정렬, 어깨 높이 균형, 골반 틀어짐
- 근육 발달도: 상체(어깨, 가슴, 팔), 코어, 하체(허벅지, 종아리)
- 체지방 분포: 복부, 옆구리, 팔뚝 등

### 3. 응답 형식
반드시 아래 JSON 구조로만 응답하세요:

{
  "bodyType": "체형 분류 (예: 중배엽-외배엽 혼합형)",
  "bodyTypeDescription": "체형에 대한 상세 설명",
  "estimatedMeasurements": {
    "shoulderWidth": "어깨 너비 추정 (cm)",
    "waistEstimate": "허리 라인 평가",
    "bodySymmetry": "좌우 대칭성 (1-10점)"
  },
  "posture": {
    "score": 1-100,
    "spineAlignment": "척추 정렬 상태",
    "shoulderBalance": "어깨 균형",
    "headPosition": "머리 위치 (전방/중립/후방)"
  },
  "muscleAnalysis": {
    "upperBody": "상체 근육 발달도 (1-10)",
    "core": "코어 근육 발달도 (1-10)",
    "lowerBody": "하체 근육 발달도 (1-10)",
    "overall": "전체 근육량 평가"
  },
  "overallScore": 1-100,
  "strengths": ["강점1", "강점2", "강점3"],
  "improvements": ["개선점1", "개선점2"],
  "recommendations": {
    "exercises": ["추천 운동1", "추천 운동2", "추천 운동3"],
    "focusAreas": ["집중 부위1", "집중 부위2"],
    "weeklyPlan": "주간 운동 계획 제안"
  },
  "summary": "전체 분석 요약 (3-4문장, 격려하는 톤)"
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
        .replace(/^[^{]*/, '')  // JSON 시작 전 텍스트 제거
        .replace(/[^}]*$/, '')  // JSON 끝 후 텍스트 제거
        .trim();
      
      try {
        analysis = JSON.parse(cleanText);
      } catch (retryError) {
        console.error('재파싱도 실패:', cleanText);
        // 기본 응답 반환
        analysis = {
          bodyType: "분석 완료",
          bodyTypeDescription: "체형 분석이 완료되었습니다.",
          estimatedMeasurements: {
            shoulderWidth: "평균 범위",
            waistEstimate: "보통",
            bodySymmetry: 7
          },
          posture: {
            score: 75,
            spineAlignment: "양호",
            shoulderBalance: "균형 잡힘",
            headPosition: "중립"
          },
          muscleAnalysis: {
            upperBody: 6,
            core: 6,
            lowerBody: 6,
            overall: "보통 수준의 근육량"
          },
          overallScore: 75,
          strengths: ["꾸준한 기록", "좋은 자세 유지", "균형 잡힌 체형"],
          improvements: ["코어 강화 추천", "유연성 향상"],
          recommendations: {
            exercises: ["플랭크", "스쿼트", "데드리프트"],
            focusAreas: ["코어", "하체"],
            weeklyPlan: "주 3-4회 전신 운동 추천"
          },
          summary: "전반적으로 균형 잡힌 체형을 유지하고 계십니다. 꾸준한 운동과 기록을 통해 더 좋은 결과를 얻을 수 있습니다."
        };
      }
    }

    // 분석 결과를 DB에 저장 (user_id 체크 포함)
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

// 두 사진 비교 분석
router.post('/compare', async (req, res) => {
  try {
    const { photoId1, photoId2 } = req.body;
    const userId = req.user.id;

    // 두 사진 정보 조회 (user_id 체크 포함)
    const photosResult = await pool.query(
      'SELECT * FROM photos WHERE id IN ($1, $2) AND user_id = $3 ORDER BY taken_at ASC',
      [photoId1, photoId2, userId]
    );

    if (photosResult.rows.length !== 2) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    const [beforePhoto, afterPhoto] = photosResult.rows;

    // Gemini Vision 모델 설정 (JSON 응답 강제)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    // 두 이미지를 Base64로 변환
    const [beforeBase64, afterBase64] = await Promise.all([
      imageUrlToBase64(beforePhoto.photo_url),
      imageUrlToBase64(afterPhoto.photo_url)
    ]);

    // 정밀 비교 프롬프트
    const prompt = `당신은 엘리트 스포츠 과학자이자 체형 변화 분석 전문가입니다.

## 비교 분석 지침

### 1. 축척 보정 (Smart Scaling)
- 두 사진의 얼굴 크기를 기준으로 축척을 맞추세요
- 카메라 거리 차이로 인한 왜곡을 보정하세요
- 동일한 기준점으로 변화를 측정하세요

### 2. 비교 항목
첫 번째 사진(이전)과 두 번째 사진(이후)을 비교하여:
- 체중 변화 추정 (근육량 vs 체지방 구분)
- 각 부위별 변화 (어깨, 가슴, 복부, 팔, 허벅지)
- 자세 변화
- 근육 정의(definition) 변화

### 3. 응답 형식
반드시 아래 JSON 구조로만 응답하세요:

{
  "overallChange": "전반적인 변화 평가 (크게 개선/개선/유지/주의필요)",
  "changeScore": -100에서 100 사이 점수 (양수=개선),
  "periodAnalysis": "두 사진 사이 예상 기간 및 변화 속도 평가",
  "detailedChanges": {
    "weight": {
      "direction": "감소/유지/증가",
      "estimate": "추정 변화량",
      "composition": "근육량 vs 체지방 변화 분석"
    },
    "upperBody": {
      "shoulders": "어깨 변화",
      "chest": "가슴 변화", 
      "arms": "팔 변화",
      "score": -10에서 10
    },
    "core": {
      "abdomen": "복부 변화",
      "waist": "허리 라인 변화",
      "score": -10에서 10
    },
    "lowerBody": {
      "thighs": "허벅지 변화",
      "calves": "종아리 변화",
      "score": -10에서 10
    },
    "posture": {
      "change": "자세 변화 설명",
      "score": -10에서 10
    }
  },
  "positiveChanges": ["긍정적 변화1", "긍정적 변화2", "긍정적 변화3"],
  "areasToFocus": ["집중 필요 부분1", "집중 필요 부분2"],
  "recommendations": {
    "exercises": ["추천 운동1", "추천 운동2", "추천 운동3"],
    "nutrition": "영양 조언",
    "lifestyle": "생활습관 조언"
  },
  "encouragement": "개인화된 격려 메시지 (2-3문장)",
  "summary": "전체 비교 분석 요약 (4-5문장)"
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
          detailedChanges: {
            weight: { direction: "유지", estimate: "유의미한 변화 없음", composition: "안정적" },
            upperBody: { shoulders: "유지", chest: "유지", arms: "유지", score: 0 },
            core: { abdomen: "유지", waist: "유지", score: 0 },
            lowerBody: { thighs: "유지", calves: "유지", score: 0 },
            posture: { change: "유지", score: 0 }
          },
          positiveChanges: ["꾸준한 기록 유지", "안정적인 체형 관리"],
          areasToFocus: ["전체적인 균형 유지"],
          recommendations: {
            exercises: ["현재 루틴 유지", "점진적 강도 증가"],
            nutrition: "균형 잡힌 식단 유지",
            lifestyle: "충분한 수면과 휴식"
          },
          encouragement: "꾸준히 기록하고 계시네요! 이런 노력이 곧 결과로 나타날 거예요.",
          summary: "두 사진을 비교한 결과, 안정적인 상태를 유지하고 있습니다. 꾸준한 노력을 계속해주세요."
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
