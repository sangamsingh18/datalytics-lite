// Yeh payment.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Payment controller for Razorpay checkout.
 */
const HttpError = require('../utils/httpError');
const paymentService = require('../services/payment.service');
const authService = require('../services/auth.service');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

const createOrder = asyncHandler(async (req, res) => {
  const { plan_name, amount, diamonds } = req.body || {};

  if (!plan_name || !amount) {
    throw new HttpError(400, 'plan_name and amount are required');
  }

  const config = paymentService.getPaymentConfig();
  if (!config.key_id || !config.key_secret) {
    throw new HttpError(400, 'Razorpay test keys are not configured on the server.');
  }

  const order = await paymentService.createPaymentOrder({ plan_name, amount, diamonds, user_id: req.userId });
  return res.json({
    ok: true,
    ...order,
    key_id: order.key_id,
  });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_name, diamonds } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new HttpError(400, 'Missing Razorpay payment data');
  }

  const isValid = paymentService.verifyPaymentSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!isValid) {
    throw new HttpError(400, 'Invalid Razorpay payment signature');
  }

  const paymentMatched = await paymentService.markPaymentVerified({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    userId: req.userId,
  });
  if (!paymentMatched) {
    throw new HttpError(404, 'Payment order not found for this user');
  }

  const existingUser = (await authService.getUserById(req.userId))
    || (req.userEmail ? await authService.getUserByEmail(req.userEmail) : null);
  if (!existingUser) {
    throw new HttpError(404, 'User not found');
  }
  const currentDiamonds = Number(existingUser?.diamonds || 0);
  const addedDiamonds = Number(diamonds || 0);
  const nextBalance = currentDiamonds + addedDiamonds;

  const targetId = existingUser._id || req.userId;
  await authService.updateUserProfileById(targetId, {
    diamonds: nextBalance,
    plan: plan_name || existingUser?.plan || 'None',
    last_payment_at: new Date().toISOString(),
  });

  return res.json({
    ok: true,
    message: 'Payment verified successfully',
    plan_name,
    diamonds: nextBalance,
  });
});

const getUserDiamonds = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  return res.json({
    diamonds: Number(user.diamonds || 0),
    plan: user.plan || 'None',
    email: user.email,
  });
});

const deductDiamonds = asyncHandler(async (req, res) => {
  const amount = Number(req.body?.amount ?? paymentService.DEFAULT_TASK_COST);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Valid deduction amount is required');
  }

  const result = await paymentService.deductUserDiamonds(req.userId, amount);
  if (!result.ok) {
    return res.status(402).json({
      detail: {
        current_balance: result.current_balance,
        required: result.required,
        remaining: result.remaining,
      },
    });
  }

  return res.json({
    ok: true,
    remaining_diamonds: result.remaining,
    deducted: result.required,
  });
});

module.exports = {
  createOrder,
  verifyPayment,
  getUserDiamonds,
  deductDiamonds,
};
