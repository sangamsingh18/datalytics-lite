// Yeh chat.route.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { requireSessionId } = require('../middlewares/upload.middleware');

router.post('/chat/recommendations', requireSessionId, chatController.recommendations);
router.post('/chat/ai-insights', requireSessionId, chatController.aiInsights);
router.post('/chat', requireSessionId, chatController.chatMessage);
router.get('/chat/history', requireSessionId, chatController.chatHistory);
router.delete('/chat/clear', requireSessionId, chatController.clearChat);
router.get('/chat/modes', chatController.chatModes);
router.get('/chat/health', chatController.chatHealth);

module.exports = router;
