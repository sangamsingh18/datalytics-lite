// Yeh payment.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Razorpay payment service for test-mode checkout.
 * Handles order creation and signature verification for the frontend flow.
 */
const crypto = require('crypto');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const env = require('../config/environment');
const authService = require('./auth.service');
const { Payment } = require('../models/Payment');
const db = require('../config/database');

const DEFAULT_TASK_COST = 50;

function normalizeUserId(userId) {
  return mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;
}

const getKeyId = () => (process.env.RZP_KEY_ID || process.env.RAZORPAY_KEY_ID || env.razorpayKeyId || '').trim();
const getKeySecret = () => (process.env.RZP_SECRET || process.env.RAZORPAY_KEY_SECRET || env.razorpayKeySecret || '').trim();

function getPaymentConfig() {
  return {
    key_id: getKeyId(),
    key_secret: getKeySecret(),
    test_mode: true,
  };
}

function createRazorpayInstance() {
  const keyId = getKeyId();
  const keySecret = getKeySecret();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys are not configured. Add RZP_KEY_ID and RZP_SECRET in the server .env file.');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

async function createPaymentOrder({ plan_name, amount, diamonds, user_id }) {
  const numericAmount = Number(amount || 0);
  if (!plan_name || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Valid plan_name and amount are required.');
  }

  const razorpay = createRazorpayInstance();
  const order = await razorpay.orders.create({
    amount: Math.round(numericAmount * 100),
    currency: 'INR',
    receipt: `${plan_name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    notes: {
      plan_name,
      diamonds: String(diamonds || 0),
      mode: 'test',
    },
  });

  const paymentData = {
    user_id,
    razorpay_order_id: order.id,
    plan_name,
    amount: numericAmount,
    diamonds,
    currency: order.currency,
  };
  if (db.isMongoConnected()) {
    await Payment.create(paymentData);
  } else {
    await db.getDB().collection('payments').insertOne(new Payment(paymentData).toObject());
  }

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: getKeyId(),
    receipt: order.receipt,
  };
}

function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const keySecret = getKeySecret();
  if (!keySecret) {
    throw new Error('Razorpay secret is not configured.');
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  return generatedSignature === razorpay_signature;
}

async function getUserBalance(userId) {
  const user = await authService.getUserById(userId);
  return Number(user?.diamonds ?? 0);
}

async function deductUserDiamonds(userId, amount = DEFAULT_TASK_COST) {
  const user = await authService.getUserById(userId);
  const currentBalance = Number(user?.diamonds ?? 0);
  const required = Number(amount || DEFAULT_TASK_COST);
  const remaining = currentBalance - required;

  if (remaining < 0) {
    return { ok: false, current_balance: currentBalance, remaining: currentBalance, required };
  }

  await authService.updateUserProfileById(userId, { diamonds: remaining });
  return { ok: true, current_balance: currentBalance, remaining, required };
}

async function markPaymentVerified({ orderId, paymentId, signature, userId }) {
  const filter = userId
    ? { razorpay_order_id: orderId, user_id: normalizeUserId(userId) }
    : { razorpay_order_id: orderId };
  if (db.isMongoConnected()) {
    let result = await Payment.updateOne(
      filter,
      {
        $set: {
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          status: 'verified',
          verified_at: new Date(),
        },
      }
    );
    if (result.matchedCount === 0 && userId) {
      result = await Payment.updateOne(
        { razorpay_order_id: orderId },
        {
          $set: {
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
            status: 'verified',
            verified_at: new Date(),
          },
        }
      );
    }
    return (result.matchedCount || 0) > 0;
  }
  const dbInstance = db.getDB();
  let result = await dbInstance.collection('payments').updateOne(
    filter,
    {
      $set: {
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        status: 'verified',
        verified_at: new Date(),
      },
    }
  );
  if ((result.modifiedCount || 0) === 0 && (result.matchedCount || 0) === 0 && userId) {
    result = await dbInstance.collection('payments').updateOne(
      { razorpay_order_id: orderId },
      {
        $set: {
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          status: 'verified',
          verified_at: new Date(),
        },
      }
    );
  }
  return (result.modifiedCount || 0) > 0 || (result.matchedCount || 0) > 0;
}

module.exports = {
  DEFAULT_TASK_COST,
  getPaymentConfig,
  createPaymentOrder,
  verifyPaymentSignature,
  getUserBalance,
  deductUserDiamonds,
  markPaymentVerified,
};
