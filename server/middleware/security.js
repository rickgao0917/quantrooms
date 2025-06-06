const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * General rate limiter
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'API rate limit exceeded, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * WebSocket rate limiter factory
 */
const createSocketLimiter = (eventName, maxRequests = 10, windowMs = 1000) => {
  const attemptCounts = new Map();
  
  return (socket, next) => {
    const key = `${socket.user?.userId || socket.id}:${eventName}`;
    const now = Date.now();
    
    if (!attemptCounts.has(key)) {
      attemptCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const attempt = attemptCounts.get(key);
    
    if (now > attempt.resetTime) {
      attempt.count = 1;
      attempt.resetTime = now + windowMs;
      return next();
    }
    
    if (attempt.count >= maxRequests) {
      return next(new Error(`Rate limit exceeded for ${eventName}`));
    }
    
    attempt.count++;
    next();
  };
};

/**
 * Compression middleware
 */
const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
});

/**
 * Request sanitizer middleware
 */
const sanitizeRequest = (req, res, next) => {
  // Remove any potential XSS attempts from common fields
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Basic XSS prevention - remove script tags
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
  }
  
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
  }
  
  next();
};

/**
 * CORS options for Chrome extension
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests from Chrome extensions and QuantGuide
    const allowedOrigins = [
      /^chrome-extension:\/\//,
      /^https:\/\/quantguide\.io$/,
      /^http:\/\/localhost:\d+$/
    ];
    
    if (!origin || allowedOrigins.some(pattern => pattern.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400 // 24 hours
};

module.exports = {
  securityHeaders,
  generalLimiter,
  authLimiter,
  apiLimiter,
  createSocketLimiter,
  compressionMiddleware,
  sanitizeRequest,
  corsOptions
};