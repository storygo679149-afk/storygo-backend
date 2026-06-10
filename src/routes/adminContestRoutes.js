const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const adminContest = require('../controllers/adminContestController');

router.use(authenticate);
router.use(authorizeAdmin);

router.post('/contests', adminContest.createContest);
router.get('/contests', adminContest.getContests);
router.get('/contests/:id', adminContest.getContest);
router.put('/contests/:id', adminContest.updateContest);
router.delete('/contests/:id', adminContest.deleteContest);
router.get('/contests/:id/submissions', adminContest.getSubmissionsForContest);
router.post('/contests/:contestId/submissions/:submissionId/rate', adminContest.rateSubmission);
router.post('/contests/:id/determine-winner', adminContest.determineWinner);

module.exports = router;
