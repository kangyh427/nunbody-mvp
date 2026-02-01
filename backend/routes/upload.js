const express = require('express');
const router = express.Router();

router.post('/image', async (req, res) => {
  res.json({ success: true, message: 'Upload endpoint' });
});

module.exports = router;