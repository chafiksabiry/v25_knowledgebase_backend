const { logger } = require('../utils/logger');

const loggerMiddleware = (req, res, next) => {
  // Store original end function
  const originalEnd = res.end;
  const startTime = Date.now();

  // Override end function
  res.end = function (chunk, encoding) {
    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Log the request and response details
    logger.info('API Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('user-agent'),
      requestBody: req.method !== 'GET' ? req.body : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined
    });

    // Call original end function
    originalEnd.apply(res, arguments);
  };

  next();
};

module.exports = loggerMiddleware; 