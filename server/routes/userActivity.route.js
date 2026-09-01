// Yeh userActivity.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * User activity logging. Previously called by the frontend
 * (ReportDownload.jsx, Chatbot.jsx: `client.post('/user-activities/log', ...)`)
 * with no matching backend route, causing a silent 404 on every call.
 * Failures here are non-fatal to the frontend (calls are wrapped in
 * `.catch(() => {})`), but the activity was never actually persisted.
 */
const express = require('express');
const router = express.Router();
const { requireSessionId } = require('../middlewares/upload.middleware');
const { getDB } = require('../config/database');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

router.post('/user-activities/log', requireSessionId, asyncHandler(async (req, res) => {
  const { action, category, details, metadata } = req.body || {};
  try {
    const db = getDB();
    await db.collection('user_activities').insertOne({
      session_id: req.sessionId,
      action: action || 'unknown',
      category: category || 'general',
      details: details || null,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Logging must never break the caller's flow (report/decision generation).
    console.warn('[user-activities/log] failed to persist activity:', err.message);
  }
  return res.status(201).json({ logged: true });
}));

module.exports = router;
