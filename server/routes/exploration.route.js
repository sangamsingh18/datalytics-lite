// Yeh exploration.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Exploration routes — EDA endpoints for frontend exploration module
 */
const express = require('express');
const router = express.Router();

const explorationController = require('../controllers/exploration.controller');
const { requireSessionId } = require('../middlewares/upload.middleware');

router.get('/eda/summary', requireSessionId, explorationController.edaSummary);
router.post('/eda/sync', requireSessionId, explorationController.edaSync);
router.post('/eda/action', requireSessionId, explorationController.edaAction);
router.post('/eda/chart', requireSessionId, explorationController.edaChart);
router.get('/eda/report/json', requireSessionId, explorationController.edaReportJson);
router.get('/eda/report/html', requireSessionId, explorationController.edaReportHtml);
router.get('/eda/download-csv', requireSessionId, explorationController.edaDownloadCsv);

router.get('/explore-data', requireSessionId, explorationController.exploreData);

module.exports = router;
