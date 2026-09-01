// "upload.middleware.js handles file-upload processing before the dataset controller processes the file."
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

/** Mirrors the X-Session-ID header requirement used by every dataset route. */
function requireSessionId(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(422).json({ detail: 'X-Session-ID header is required' });
  }
  req.sessionId = sessionId;
  next();
}

module.exports = { upload, requireSessionId };
