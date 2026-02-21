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

/**
 * POST /api/support/inquiry
 * Submit a support inquiry with optional photo attachments
 */
router.post('/inquiry', upload.array('photos', 5), async (req, res) => {
  try {
    const { name, email, category, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: { message: '필수 항목을 모두 입력해주세요' }
      });
    }

    // Upload photos to Cloudinary if provided
    const photoUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'nunbody/support',
              resource_type: 'image',
              transformation: [
                { width: 1200, height: 1200, crop: 'limit' },
                { quality: 'auto' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(file.buffer);
        });
        photoUrls.push(uploadResult.secure_url);
      }
    }

    // Get user_id from token if available (req.user may be set by auth middleware)
    const userId = req.user ? req.user.id : null;

    // Save inquiry to database
    await pool.query(
      `INSERT INTO support_inquiries (user_id, name, email, category, subject, message, photo_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, name, email, category || 'general', subject, message, photoUrls.length > 0 ? photoUrls : null]
    );

    res.json({
      success: true,
      message: '문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.'
    });
  } catch (error) {
    console.error('Support inquiry error:', error);
    res.status(500).json({
      success: false,
      error: { message: '문의 접수에 실패했습니다. 다시 시도해주세요.' }
    });
  }
});

module.exports = router;
