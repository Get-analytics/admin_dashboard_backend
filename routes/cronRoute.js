const express = require('express');
const router = express.Router();
const { expireLinks } = require('../controllers/cronController');

router.get('/cron', expireLinks);

module.exports = router;
