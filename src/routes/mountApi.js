const { requireAuth, adminOnly } = require('../middleware/routeGuards');

/**
 * Mounts every /api route of the knowledge base. A JWT is required on all of them (user token, or HARX service
 * token with a known scope); each route then checks the company it touches (middleware/routeGuards.js).
 * Public routes (/health) are declared by the entry point, outside /api.
 */
function mountApi(app) {
  app.use('/api', requireAuth);
  app.use('/api/documents', require('./documentRoutes'));
  // Fine-tuning is being retired (PR #14): administrators only until then.
  app.use('/api/fine-tuning', adminOnly, require('./fineTuningRoutes'));
  app.use('/api/analysis', require('./analysisRoutes'));
  app.use('/api/companies', require('./companyRoutes'));
  app.use('/api/call-recordings', require('./callRecordingRoutes'));
  app.use('/api/rag', require('./ragRoutes'));
  app.use('/api/scripts', require('./scriptRoutes'));
}

module.exports = { mountApi };
