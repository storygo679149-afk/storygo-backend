const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/authenticate');
const contest = require('../controllers/contestController');

router.get('/active', contest.getActiveContests);
router.get('/past', contest.getPastContests);
router.get('/:id', optionalAuth, contest.getContestDetails);
router.post('/:id/submit', authenticate, contest.submitStory);
router.get('/:id/my-submission', authenticate, contest.getMySubmission);
router.get('/:id/results', contest.getResults);

module.exports = router;
