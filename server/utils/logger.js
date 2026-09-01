// Yeh logger.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Minimal structured console logger. The Python side used bare print()
 * statements (e.g. "[GOOGLE AUTH] Error: ..."); this keeps the same
 * tag-prefix style so log greps stay familiar.
 */
function ts() {
  return new Date().toISOString();
}

function info(tag, message, extra) {
  console.log(`[${ts()}] [${tag}] ${message}`, extra !== undefined ? extra : '');
}

function error(tag, message, err) {
  console.error(`[${ts()}] [${tag}] ERROR: ${message}`, err ? (err.stack || err) : '');
}

function warn(tag, message, extra) {
  console.warn(`[${ts()}] [${tag}] WARN: ${message}`, extra !== undefined ? extra : '');
}

module.exports = { info, error, warn };
