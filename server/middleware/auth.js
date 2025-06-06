const { verifyAccessToken, extractTokenFromHeader } = require('../utils/jwt');
const db = require('../database/connection');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Get user from database
    const user = await db('users')
      .where({ user_id: decoded.userId, is_active: true })
      .first();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }
    
    // Attach user to request
    req.user = {
      userId: user.user_id,
      email: user.email,
      username: user.username,
      elo: user.elo_rating
    };
    
    // Update last active timestamp
    await db('users')
      .where({ user_id: user.user_id })
      .update({ last_active: db.fn.now() });
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.message === 'Token expired') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.message === 'Invalid token') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, continues regardless
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await db('users')
        .where({ user_id: decoded.userId, is_active: true })
        .first();
      
      if (user) {
        req.user = {
          userId: user.user_id,
          email: user.email,
          username: user.username,
          elo: user.elo_rating
        };
      }
    }
  } catch (error) {
    // Ignore errors in optional auth
    console.log('Optional auth failed:', error.message);
  }
  
  next();
};

/**
 * Socket.io authentication middleware
 */
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      return next(new Error('No authorization token provided'));
    }
    
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');
    
    // Verify token
    const decoded = verifyAccessToken(cleanToken);
    
    // Get user from database
    const user = await db('users')
      .where({ user_id: decoded.userId, is_active: true })
      .first();
    
    if (!user) {
      return next(new Error('User not found or inactive'));
    }
    
    // Attach user to socket
    socket.user = {
      userId: user.user_id,
      email: user.email,
      username: user.username,
      elo: user.elo_rating
    };
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  socketAuth
};