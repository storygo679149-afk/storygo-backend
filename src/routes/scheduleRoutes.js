const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const scheduleController = require('../controllers/scheduleController');

router.use(requireAdmin);

router.get('/', scheduleController.getAllSchedules);
router.post('/', scheduleController.createSchedule);
router.delete('/:id', scheduleController.deleteSchedule);

module.exports = router;