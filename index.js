require('dotenv').config();
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const { applySecurityMiddleware } = require('./src/middleware/security');
const { errorHandler } = require('./src/middleware/errorHandler');
const environment = require('./src/config/environment');
const { initializeDatabase, testConnection } = require('./src/config/database');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: environment.CLOUDINARY_CLOUD_NAME,
  api_key: environment.CLOUDINARY_API_KEY,
  api_secret: environment.CLOUDINARY_API_SECRET,
  secure: true
});
console.log(`Cloudinary config: ${cloudinary.config().cloud_name}`);

const app = express();

testConnection().catch(err => console.warn('⚠️ DB not ready, but server will start'));
initializeDatabase().catch(err => console.error('❌ Schema init failed:', err.message));

app.use('/api/webhooks', require('./src/routes/webhookRoutes'));
applySecurityMiddleware(app, environment);
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.set('trust proxy', 1);

app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/novels', require('./src/routes/novelRoutes'));
app.use('/api/users', require('./src/routes/userRoutes'));
app.use('/api/series', require('./src/routes/seriesRoutes'));
app.use('/api/episodes', require('./src/routes/episodeRoutes'));
app.use('/api/categories', require('./src/routes/categoryRoutes'));
app.use('/api/activity', require('./src/routes/activityRoutes'));
app.use('/api/search', require('./src/routes/searchRoutes'));
app.use('/api/trending', require('./src/routes/trendingRoutes'));
app.use('/api/payments', require('./src/routes/paymentRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/admin', require('./src/routes/adminRoutes'));

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const PORT = environment.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Secure Story-Go server running on port ${PORT}`);
});
