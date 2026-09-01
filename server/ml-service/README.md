# Datalytics ML service

The Node backend connects to this FastAPI service at `ML_SERVICE_URL`, which defaults to `http://127.0.0.1:8001`. Training and prediction automatically use this service when its `/health` endpoint is available; otherwise the existing Node fallback remains active.

From the `server` directory, install Python dependencies once with `npm run ml:install`. Start the development service with `npm run ml:dev`, or use `npm run ml:start` for a non-reloading local process.
