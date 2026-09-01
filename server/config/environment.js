// centralizes the database connection logic."
//  * chatbot.py) so nothing is silently missing when those modules are
//  * ported.
//  */
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  mongodbDb: process.env.MONGODB_DB || 'datalytics',

  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-datalytics',
  jwtAlgorithm: 'HS256',
  accessTokenExpireMinutes: 7 * 24 * 60,

  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),

  razorpayKeyId: process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || process.env.RZP_SECRET || '',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  // .env in this project uses OPEN_AI_KEY (not OPENAI_API_KEY) — support both
  // so the key that's actually set is picked up instead of silently reading ''.
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001',
};
