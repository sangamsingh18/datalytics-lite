// "auth.middleware.js performs authentication
//  checks before protected requests reach the controller."

const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const authService = require('../services/auth.service');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme !== 'Bearer') {
    return res.status(401).json({ detail: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [env.jwtAlgorithm] });
    const email = payload.sub;
    if (!email) {
      return res.status(401).json({ detail: 'Invalid token payload' });
    }
    req.userEmail = email;
    req.userId = payload.user_id;
    if (!req.userId) {
      const user = await authService.getUserByEmail(email);
      req.userId = user?._id;
    }
    if (!req.userId) {
      return res.status(401).json({ detail: 'User not found' });
    }
    req.tokenPayload = payload;
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ detail: 'Token expired' });
    }
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

module.exports = { requireAuth };
