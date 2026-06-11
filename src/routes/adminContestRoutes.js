console.log('✅ Admin contest routes file loaded');

const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const adminContest = require('../controllers/adminContestController');

// Test route to verify router is mounted (no auth)
router.get('/ping', (req, res) => res.json({ pong: true }));

// All admin contest routes require authentication and admin role
router.use(authenticate);
router.use(authorizeAdmin);

// Contest CRUD
router.post('/contests', adminContest.createContest);
router.get('/contests', adminContest.getContests);
router.get('/contests/:id', adminContest.getContest);
router.put('/contests/:id', adminContest.updateContest);
router.delete('/contests/:id', adminContest.deleteContest);

// Submissions & ratings
router.get('/contests/:id/submissions', adminContest.getSubmissionsForContest);
router.post('/contests/:contestId/submissions/:submissionId/rate', adminContest.rateSubmission);
router.post('/contests/:id/determine-winner', adminContest.determineWinner);

module.exports = router;
