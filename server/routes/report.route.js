// Yeh report.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const express = require('express');
const router = express.Router();
const { store } = require('../state/sessionStore');
const { requireSessionId } = require('../middlewares/upload.middleware');
const { buildEdaSummary } = require('../services/exploration.service');

router.get('/report/data', requireSessionId, (req, res) => {
  try {
    const session = store.get(req.sessionId);
    if (!session.rows || !session.rows.length) {
      return res.json({ dataset: null, summary: null });
    }
    const summary = buildEdaSummary(session.rows, session.dataset_columns);
    return res.json({
      dataset: session.dataset_snapshot,
      summary,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
});

module.exports = router;
