const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const db = require('../database/connection');
const { generateTokens, verifyAccessToken } = require('../utils/jwt');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { schemas, validateRequest } = require('../utils/validation');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

/**
 * @route   POST /auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    // Validate request
    const validation = validateRequest(req.body, schemas.register);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }
    
    const { email, username, password } = validation.value;
    
    // Check password strength
    const passwordStrength = validatePasswordStrength(password);
    if (!passwordStrength.isValid) {
      return res.status(400).json({
        success: false,
        errors: passwordStrength.errors
      });
    }
    
    // Check if user already exists
    const existingUser = await db('users')
      .where('email', email)
      .orWhere('username', username)
      .first();
    
    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(409).json({
        success: false,
        error: `User with this ${field} already exists`
      });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user
    const [user] = await db('users')
      .insert({
        email,
        username,
        password_hash: passwordHash,
        elo_rating: 1200,
        email_verified: false
      })
      .returning(['user_id', 'email', 'username', 'elo_rating']);
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    // Save refresh token to database
    await db('user_sessions').insert({
      user_id: user.user_id,
      refresh_token: tokens.refreshToken,
      device_info: req.headers['user-agent'],
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          userId: user.user_id,
          email: user.email,
          username: user.username,
          elo: user.elo_rating
        },
        tokens
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user'
    });
  }
});

/**
 * @route   POST /auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request
    const validation = validateRequest(req.body, schemas.login);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }
    
    const { email, password } = validation.value;
    
    // Find user
    const user = await db('users')
      .where({ email, is_active: true })
      .first();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Check if user has password (might be Google OAuth user)
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'Please login with Google'
      });
    }
    
    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Generate tokens
    const tokens = generateTokens(user);
    
    // Save refresh token to database
    await db('user_sessions').insert({
      user_id: user.user_id,
      refresh_token: tokens.refreshToken,
      device_info: req.headers['user-agent'],
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    // Update last active
    await db('users')
      .where({ user_id: user.user_id })
      .update({ last_active: db.fn.now() });
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          userId: user.user_id,
          email: user.email,
          username: user.username,
          elo: user.elo_rating
        },
        tokens
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login'
    });
  }
});

/**
 * @route   POST /auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Private
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Invalidate the refresh token
      await db('user_sessions')
        .where({
          user_id: req.user.userId,
          refresh_token: refreshToken
        })
        .update({ is_valid: false });
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout'
    });
  }
});

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }
    
    // Find valid session
    const session = await db('user_sessions')
      .where({
        refresh_token: refreshToken,
        is_valid: true
      })
      .where('expires_at', '>', db.fn.now())
      .first();
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
    
    // Get user
    const user = await db('users')
      .where({
        user_id: session.user_id,
        is_active: true
      })
      .first();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }
    
    // Generate new tokens
    const tokens = generateTokens(user);
    
    // Update session with new refresh token
    await db('user_sessions')
      .where({ session_id: session.session_id })
      .update({
        refresh_token: tokens.refreshToken,
        last_used: db.fn.now()
      });
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: {
          userId: user.user_id,
          email: user.email,
          username: user.username,
          elo: user.elo_rating
        },
        tokens
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

/**
 * @route   GET /auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await db('users')
      .where({ user_id: req.user.userId })
      .select([
        'user_id',
        'email',
        'username',
        'elo_rating',
        'games_played',
        'total_wins',
        'total_points',
        'created_at',
        'last_active'
      ])
      .first();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Calculate win rate
    const winRate = user.games_played > 0 
      ? ((user.total_wins / user.games_played) * 100).toFixed(2)
      : 0;
    
    res.json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        elo: user.elo_rating,
        statistics: {
          gamesPlayed: user.games_played,
          totalWins: user.total_wins,
          totalPoints: user.total_points,
          winRate: parseFloat(winRate)
        },
        createdAt: user.created_at,
        lastActive: user.last_active
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

/**
 * @route   POST /auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const validation = validateRequest(req.body, schemas.forgotPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }
    
    const { email } = validation.value;
    
    // Check if user exists
    const user = await db('users')
      .where({ email })
      .first();
    
    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
    
    if (user) {
      // TODO: Implement email sending with reset token
      console.log('Password reset requested for:', email);
    }
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

/**
 * @route   GET /auth/google
 * @desc    Initiate Google OAuth login
 * @access  Public
 */
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

/**
 * @route   GET /auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 */
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const user = req.user;
      
      // Generate tokens
      const tokens = generateTokens(user);
      
      // Save refresh token to database
      await db('user_sessions').insert({
        user_id: user.userId,
        refresh_token: tokens.refreshToken,
        device_info: req.headers['user-agent'],
        ip_address: req.ip,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      // Update last active
      await db('users')
        .where({ user_id: user.userId })
        .update({ last_active: db.fn.now() });
      
      // Redirect to extension with tokens
      // The extension will handle token extraction from URL
      const redirectUrl = new URL('chrome-extension://YOUR_EXTENSION_ID/popup.html');
      redirectUrl.searchParams.append('accessToken', tokens.accessToken);
      redirectUrl.searchParams.append('refreshToken', tokens.refreshToken);
      redirectUrl.searchParams.append('userId', user.userId);
      redirectUrl.searchParams.append('username', user.username);
      redirectUrl.searchParams.append('elo', user.elo);
      
      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      
      // Redirect to extension with error
      const errorUrl = new URL('chrome-extension://YOUR_EXTENSION_ID/popup.html');
      errorUrl.searchParams.append('error', 'oauth_failed');
      
      res.redirect(errorUrl.toString());
    }
  }
);

module.exports = router;