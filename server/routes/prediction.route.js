// Yeh prediction.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/prediction.controller');
const { requireSessionId } = require('../middlewares/upload.middleware');

router.post('/preprocess', requireSessionId, predictionController.preprocess);
router.post('/train', requireSessionId, predictionController.train);
router.post('/train-model', requireSessionId, predictionController.train);
router.get('/train-results', requireSessionId, predictionController.trainResults);
router.get('/best-model-summary', requireSessionId, predictionController.bestModelSummary);
router.get('/feature-info', requireSessionId, predictionController.featureInfo);
router.post('/predict', requireSessionId, predictionController.predict);
router.post('/cluster', requireSessionId, predictionController.cluster);
router.get('/cluster-results', requireSessionId, predictionController.clusterResults);
router.get('/download-results', requireSessionId, predictionController.downloadResults);
router.get('/download/predictions', requireSessionId, predictionController.downloadResults);

module.exports = router;
