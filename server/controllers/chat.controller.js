// Yeh chat.controller.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
const { store } = require('../state/sessionStore');
const { generateRecommendations, processChatMessage } = require('../services/chat.service');
const { resolveProvider } = require('../services/ai.service');
const { saveChatMessage, getChatHistory } = require('../config/database');

const asyncHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ detail: error.detail || (statusCode < 500 ? error.message : 'Internal server error') });
  }
};

const recommendations = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { message, mode } = req.body || {};
  const result = await generateRecommendations(session, message, mode);
  return res.json(result);
});

const chatMessage = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { message, mode, history } = req.body || {};
  const result = await processChatMessage(session, message, mode || 'chat', history);

  if (req.sessionId && message) {
    saveChatMessage(req.sessionId, 'user', message).catch(() => {});
    if (result.reply) {
      saveChatMessage(req.sessionId, 'assistant', result.reply).catch(() => {});
    }
  }

  return res.json(result);
});

const aiInsights = asyncHandler(async (req, res) => {
  const session = store.get(req.sessionId);
  const { message, history } = req.body || {};
  const result = await processChatMessage(session, message, 'ai_insights', history);
  return res.json(result);
});

const chatHistory = asyncHandler(async (req, res) => {
  const history = req.sessionId ? await getChatHistory(req.sessionId, 30) : [];
  return res.json(history || []);
});

const clearChat = asyncHandler(async (req, res) => {
  return res.json({ message: 'Chat history cleared' });
});

const chatModes = asyncHandler(async (req, res) => {
  return res.json([
    { id: 'chat', name: 'Dataset Chat' },
    { id: 'ai_insights', name: 'AI Insights' },
    { id: 'recommendation_insights', name: 'Decision Engine' },
  ]);
});

const chatHealth = asyncHandler(async (req, res) => {
  const provider = resolveProvider();
  return res.json({
    status: 'ok',
    service: 'chat-engine',
    configured: Boolean(provider),
    groq_configured: Boolean(provider),
    provider: provider?.name || null,
    model: provider?.model || null,
  });
});

module.exports = {
  recommendations,
  chatMessage,
  aiInsights,
  chatHistory,
  clearChat,
  chatModes,
  chatHealth,
};
