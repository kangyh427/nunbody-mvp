const express = require('express');
const router = express.Router();

router.get('/profile', async (req, res) => {
  res.json({ success: true, message: 'Profile endpoint' });
});

module.exports = router;