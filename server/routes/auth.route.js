// Yeh auth.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Auth routes — mounted at /api (paths kept identical to the FastAPI
 * router: /auth/google, /auth/logout, /auth/me, /auth/profile).
 */
const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/auth/google', authController.googleLogin);
router.post('/auth/logout', requireAuth, authController.logout);
router.get('/auth/me', requireAuth, authController.getMe);
router.patch('/auth/profile', requireAuth, authController.updateProfile);

module.exports = router;
