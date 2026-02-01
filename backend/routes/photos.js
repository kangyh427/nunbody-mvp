const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const pool = require('../config/database');

// 메모리에 파일 저장 (Cloudinary로 바로 전송)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
});

// 사진 업로드
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    const { body_part } = req.body; // 'full', 'upper', 'lower'
    const userId = req.user.id; // JWT에서 추출된 사용자 ID

    if (!req.file) {
      return res.status(400).json({ error: '사진을 선택해주세요' });
    }

    // Cloudinary에 업로드 (Buffer를 base64로 변환)
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `nunbody/${userId}`, // 사용자별 폴더
          resource_type: 'image',
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' }, // 최대 크기 제한
            { quality: 'auto' } // 자동 품질 최적화
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // DB에 저장
    const result = await pool.query(
      `INSERT INTO photos (user_id, photo_url, cloudinary_id, body_part, taken_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING *`,
      [userId, uploadResult.secure_url, uploadResult.public_id, body_part || 'full']
    );

    res.json({
      success: true,
      photo: result.rows[0],
      message: '사진이 업로드되었습니다!'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: '사진 업로드에 실패했습니다' });
  }
});

// 내 사진 목록 조회
router.get('/my-photos', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, photo_url, body_part, taken_at, created_at
       FROM photos 
       WHERE user_id = $1 
       ORDER BY taken_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      photos: result.rows
    });

  } catch (error) {
    console.error('Fetch photos error:', error);
    res.status(500).json({ error: '사진 목록을 불러올 수 없습니다' });
  }
});

// 사진 삭제
router.delete('/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;

    // 사진 정보 조회
    const photoResult = await pool.query(
      'SELECT cloudinary_id FROM photos WHERE id = $1 AND user_id = $2',
      [photoId, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: '사진을 찾을 수 없습니다' });
    }

    // Cloudinary에서 삭제
    await cloudinary.uploader.destroy(photoResult.rows[0].cloudinary_id);

    // DB에서 삭제
    await pool.query('DELETE FROM photos WHERE id = $1', [photoId]);

    res.json({ success: true, message: '사진이 삭제되었습니다' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: '사진 삭제에 실패했습니다' });
  }
});

module.exports = router;
