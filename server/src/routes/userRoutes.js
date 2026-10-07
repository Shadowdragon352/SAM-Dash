import protectedRoute from '../middleware/auth.middleware.js';
import express from 'express';
import { getMe, updateMe } from '../controllers/userController.js';
// import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protectedRoute);

// Apply protect middleware to all routes in this router as they pertain to the logged-in user
// router.use(protect);

// @route   GET /api/v1/users/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', getMe);

// @route   PUT /api/v1/users/me
// @desc    Update current user's profile
// @access  Private
router.put('/me', updateMe);

export default router;
