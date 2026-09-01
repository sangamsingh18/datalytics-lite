// Yeh payment.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Razorpay payment routes.
 */
const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/payment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.get('/payment/user-diamonds', requireAuth, paymentController.getUserDiamonds);
router.post('/payment/deduct-diamonds', requireAuth, paymentController.deductDiamonds);
router.post('/payment/create-order', requireAuth, paymentController.createOrder);
router.post('/payment/verify-payment', requireAuth, paymentController.verifyPayment);

module.exports = router;
