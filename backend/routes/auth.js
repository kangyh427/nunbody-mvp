const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email, password, and name are required' }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters' }
      });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email already registered' }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password, name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, name, created_at`,
      [email, hashedPassword, name]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Registration failed' }
    });
  }
});

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email and password are required' }
      });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, name, phone, password, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' }
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' }
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone || '',
          createdAt: user.created_at
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Login failed' }
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify token
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: { message: 'Token is required' }
      });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not found' }
      });
    }

    res.json({
      success: true,
      data: {
        user: result.rows[0],
        valid: true
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { message: 'Invalid token' }
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (name, phone)
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: '이름을 입력해주세요' }
      });
    }

    await pool.query(
      `UPDATE users SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3`,
      [name.trim(), phone || null, userId]
    );

    res.json({
      success: true,
      message: '프로필이 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: { message: '프로필 업데이트에 실패했습니다' }
    });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { message: '현재 비밀번호와 새 비밀번호를 입력해주세요' }
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: '새 비밀번호는 6자 이상이어야 합니다' }
      });
    }

    // Fetch current password hash
    const userResult = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: '사용자를 찾을 수 없습니다' }
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { message: '현재 비밀번호가 올바르지 않습니다' }
      });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: '비밀번호가 변경되었습니다.'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: { message: '비밀번호 변경에 실패했습니다' }
    });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account
 */
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: { message: '비밀번호를 입력해주세요' }
      });
    }

    // Verify password
    const userResult = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: '사용자를 찾을 수 없습니다' }
      });
    }

    const isValid = await bcrypt.compare(password, userResult.rows[0].password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { message: '비밀번호가 올바르지 않습니다' }
      });
    }

    // Delete user (CASCADE will handle related tables: photos, analysis_history, etc.)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({
      success: true,
      message: '계정이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('Account delete error:', error);
    res.status(500).json({
      success: false,
      error: { message: '계정 삭제에 실패했습니다' }
    });
  }
});

module.exports = router;
