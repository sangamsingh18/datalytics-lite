// Yeh visualization.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const express = require('express');
const router = express.Router();
const visualizationController = require('../controllers/visualization.controller');
const { requireSessionId } = require('../middlewares/upload.middleware');

router.post('/visualization/sync', requireSessionId, visualizationController.syncVisualization);
router.get('/visualization/metadata', requireSessionId, visualizationController.getMetadata);
router.post('/visualization/chart', requireSessionId, visualizationController.createChart);
router.post('/visualization/batch', requireSessionId, visualizationController.batchCharts);
router.post('/visualization/geo', requireSessionId, visualizationController.geoChart);

module.exports = router;
