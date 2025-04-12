const express = require('express');
const router = express.Router();
const { CronBasecontroller } = require('../controllers/cronController');
const { cronInternalApi } = require('../controllers/cronInternelapi'); // fixed name

router.get('/cron', CronBasecontroller);
router.get('/cronTrigger', cronInternalApi);

module.exports = router;
