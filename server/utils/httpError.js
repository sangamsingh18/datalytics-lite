// Yeh httpError.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Mirrors FastAPI's HTTPException(status_code, detail) so route code
 * ported from Python can `throw new HttpError(404, "User not found")`
 * exactly where the original raised HTTPException(404, "User not found").
 */
class HttpError extends Error {
  constructor(statusCode, detail) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

module.exports = HttpError;
