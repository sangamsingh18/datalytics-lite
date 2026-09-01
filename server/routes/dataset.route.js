// Yeh dataset.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Dataset routes — paths kept identical to the FastAPI routers:
 * /upload, /upload-dataset, /upload/init, /upload/chunk/:uploadId,
 * /upload/complete/:uploadId, /upload/connect, /get-data, /dataset/page.
 * All require X-Session-ID like the original Header(..., alias="X-Session-ID").
 */
const express = require('express');
const router = express.Router();

const datasetController = require('../controllers/dataset.controller');
const { upload, requireSessionId } = require('../middlewares/upload.middleware');

router.post('/upload', requireSessionId, upload.single('file'), datasetController.uploadDataset);
router.post('/upload-dataset', requireSessionId, upload.single('file'), datasetController.uploadDataset);
router.post('/upload/init', requireSessionId, datasetController.uploadInit);
router.post('/upload/chunk/:uploadId', requireSessionId, upload.single('chunk'), datasetController.uploadChunk);
router.post('/upload/complete/:uploadId', requireSessionId, datasetController.uploadComplete);
router.post('/upload/connect', requireSessionId, datasetController.uploadConnect);

router.get('/get-data', requireSessionId, datasetController.getData);
router.get('/dataset/page', requireSessionId, datasetController.datasetPage);
router.get('/dataset/json', requireSessionId, datasetController.datasetJson);
router.post('/data/sync', requireSessionId, datasetController.dataSync);

module.exports = router;
