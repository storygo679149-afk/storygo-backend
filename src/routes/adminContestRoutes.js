console.log('✅ Admin contest routes file loaded');

const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authenticate');
const adminContest = require('../controllers/adminContestController');

// Public test route (no auth)
router.get('/ping', (req, res) => res.json({ pong: true }));

// All routes below require authentication and admin role
router.use(authenticate);
router.use(authorizeAdmin);

// Contest CRUD – root path is /api/admin/contests
router.get('/', adminContest.getContests);          // GET list
router.post('/', adminContest.createContest);       // POST create
router.get('/:id', adminContest.getContest);        // GET single
router.put('/:id', adminContest.updateContest);     // PUT update
router.delete('/:id', adminContest.deleteContest);  // DELETE delete

// Submissions & ratings
router.get('/:id/submissions', adminContest.getSubmissionsForContest);
router.post('/:contestId/submissions/:submissionId/rate', adminContest.rateSubmission);
router.post('/:id/determine-winner', adminContest.determineWinner);

module.exports = router;
