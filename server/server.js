/**
 * Datalytics Backend
 * ------------------
 *  Express application + server entry point.
 *
 * This file now contains:
 * 1. Environment configuration
 * 2. Express application setup
 * 3. Middleware
 * 4. API routes
 * 5. Health/root endpoints
 * 6. MongoDB connection
 * 7. HTTP server startup
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Configuration
const env = require('./config/environment');
const { connectDB } = require('./config/database');

// Logger
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth.route');
const datasetRoutes = require('./routes/dataset.route');
const explorationRoutes = require('./routes/exploration.route');
const visualizationRoutes = require('./routes/visualization.route');
const reportRoutes = require('./routes/report.route');
const predictionRoutes = require('./routes/prediction.route');
const chatRoutes = require('./routes/chat.route');
const userActivityRoutes = require('./routes/userActivity.route');
const paymentRoutes = require('./routes/payment.route');


// ======================================================
// 1. CREATE EXPRESS APPLICATION
// ======================================================

const app = express();


// ======================================================
// 2. GLOBAL MIDDLEWARE
// ======================================================

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json({ limit: '50mb' }));


// ======================================================
// 3. ROOT ENDPOINT
// ======================================================

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Datalytics API Server',
    version: '1.0.0',
    frontend: 'http://localhost:5173',
    health: '/health',

    endpoints: {
      auth: '/api/auth',
      datasets: '/api/datasets',
      exploration: '/api/eda/summary',
      visualization: '/api/visualization/metadata',
      reports: '/api/report/data',
      prediction: '/api/preprocess',
      chat: '/api/chat',
    },
  });
});


// ======================================================
// 4. HEALTH CHECK
// ======================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'datalytics-server',
  });
});


// ======================================================
// 5. API ROUTES
// ======================================================

app.use('/api', authRoutes);

app.use('/api', datasetRoutes);

app.use('/api', explorationRoutes);

app.use('/api', visualizationRoutes);

app.use('/api', reportRoutes);

app.use('/api', predictionRoutes);

app.use('/api', chatRoutes);

app.use('/api', userActivityRoutes);

app.use('/api', paymentRoutes);


// ======================================================
// 6. START SERVER
// ======================================================

async function start() {
  try {

    // Connect to MongoDB
    try {
      await connectDB();

      logger.info('DB', 'MongoDB connected');

    } catch (e) {

      logger.error(
        'DB',
        'MongoDB connection failed — starting anyway (routes needing DB will fail until it is reachable)',
        e
      );

    }


    // Start Express HTTP server
    app.listen(env.port, () => {

      logger.info(
        'SERVER',
        `Datalytics server listening on port ${env.port}`
      );

    });

  } catch (e) {

    logger.error(
      'SERVER',
      'Server startup failed',
      e
    );

    process.exit(1);
    //process.exit(1) means immediately stop/terminate the Node.js application with an error status. 🛑
    //process.exit(0)  → Success ✅
    //process.exit(1)  → Error / failure ❌
  }
}


// ======================================================
// 7. BOOTSTRAP APPLICATION
// ======================================================

start();