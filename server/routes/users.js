const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { schemas, validateRequest } = require('../utils/validation');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');

/**
 * @route   GET /users/profile
 * @desc    Get current user profile (alias for /auth/profile)
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
 * @route   PUT /users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const validation = validateRequest(req.body, schemas.updateProfile);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }
    
    const updates = validation.value;
    
    // Check if username is taken
    if (updates.username) {
      const existingUser = await db('users')
        .where({ username: updates.username })
        .whereNot({ user_id: req.user.userId })
        .first();
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Username already taken'
        });
      }
    }
    
    // Check if email is taken
    if (updates.email) {
      const existingUser = await db('users')
        .where({ email: updates.email })
        .whereNot({ user_id: req.user.userId })
        .first();
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Email already in use'
        });
      }
      
      // Mark email as unverified if changed
      updates.email_verified = false;
    }
    
    // Update user
    const [updatedUser] = await db('users')
      .where({ user_id: req.user.userId })
      .update(updates)
      .returning(['user_id', 'email', 'username', 'elo_rating']);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        userId: updatedUser.user_id,
        email: updatedUser.email,
        username: updatedUser.username,
        elo: updatedUser.elo_rating
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

/**
 * @route   PUT /users/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current and new password are required'
      });
    }
    
    // Check password strength
    const passwordStrength = validatePasswordStrength(newPassword);
    if (!passwordStrength.isValid) {
      return res.status(400).json({
        success: false,
        errors: passwordStrength.errors
      });
    }
    
    // Get user with password
    const user = await db('users')
      .where({ user_id: req.user.userId })
      .first();
    
    // Check if user has password (might be Google OAuth user)
    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        error: 'Password cannot be set for Google OAuth accounts'
      });
    }
    
    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);
    
    // Update password
    await db('users')
      .where({ user_id: req.user.userId })
      .update({ password_hash: newPasswordHash });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

/**
 * @route   GET /users/:id/stats
 * @desc    Get user statistics
 * @access  Public
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await db('users')
      .where({ user_id: id })
      .select([
        'username',
        'elo_rating',
        'games_played',
        'total_wins',
        'total_points'
      ])
      .first();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get recent games
    const recentGames = await db('games')
      .whereRaw('? = ANY(participants::jsonb)', [JSON.stringify({ user_id: id })])
      .orderBy('created_at', 'desc')
      .limit(10)
      .select(['game_id', 'problem_id', 'winner_id', 'final_scores', 'created_at']);
    
    // Calculate statistics
    const winRate = user.games_played > 0 
      ? ((user.total_wins / user.games_played) * 100).toFixed(2)
      : 0;
    
    const avgPointsPerGame = user.games_played > 0
      ? Math.round(user.total_points / user.games_played)
      : 0;
    
    res.json({
      success: true,
      data: {
        username: user.username,
        elo: user.elo_rating,
        statistics: {
          gamesPlayed: user.games_played,
          totalWins: user.total_wins,
          totalPoints: user.total_points,
          winRate: parseFloat(winRate),
          avgPointsPerGame
        },
        recentGames: recentGames.map(game => ({
          gameId: game.game_id,
          problemId: game.problem_id,
          won: game.winner_id === id,
          score: game.final_scores?.find(s => s.user_id === id)?.points || 0,
          playedAt: game.created_at
        }))
      }
    });
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics'
    });
  }
});

/**
 * @route   GET /users/:id/history
 * @desc    Get user game history
 * @access  Public
 */
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Get user to verify they exist
    const user = await db('users')
      .where({ user_id: id })
      .select(['username'])
      .first();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get total count
    const [{ count }] = await db('games')
      .whereRaw('? = ANY(participants::jsonb)', [JSON.stringify({ user_id: id })])
      .count();
    
    // Get games
    const games = await db('games')
      .whereRaw('? = ANY(participants::jsonb)', [JSON.stringify({ user_id: id })])
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select([
        'game_id',
        'room_id',
        'problem_id',
        'participants',
        'start_time',
        'end_time',
        'winner_id',
        'final_scores',
        'elo_changes',
        'created_at'
      ]);
    
    // Process games
    const processedGames = games.map(game => {
      const userScore = game.final_scores?.find(s => s.user_id === id);
      const userEloChange = game.elo_changes?.find(e => e.user_id === id);
      
      return {
        gameId: game.game_id,
        roomId: game.room_id,
        problemId: game.problem_id,
        participants: game.participants.length,
        duration: game.end_time ? 
          Math.round((new Date(game.end_time) - new Date(game.start_time)) / 1000) : null,
        won: game.winner_id === id,
        position: userScore?.position || null,
        points: userScore?.points || 0,
        solveTime: userScore?.solve_time || null,
        eloChange: userEloChange?.change || 0,
        eloBefore: userEloChange?.elo_before || null,
        eloAfter: userEloChange?.elo_after || null,
        playedAt: game.created_at
      };
    });
    
    res.json({
      success: true,
      data: {
        username: user.username,
        games: processedGames,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(count),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('User history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user history'
    });
  }
});

/**
 * @route   GET /users/leaderboard
 * @desc    Get global leaderboard
 * @access  Public
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Get total count of active users
    const [{ count }] = await db('users')
      .where('games_played', '>', 0)
      .count();
    
    // Get leaderboard
    const leaderboard = await db('users')
      .where('games_played', '>', 0)
      .orderBy('elo_rating', 'desc')
      .limit(limit)
      .offset(offset)
      .select([
        'user_id',
        'username',
        'elo_rating',
        'games_played',
        'total_wins',
        'total_points'
      ]);
    
    // Process leaderboard with rankings
    const processedLeaderboard = leaderboard.map((user, index) => ({
      rank: offset + index + 1,
      userId: user.user_id,
      username: user.username,
      elo: user.elo_rating,
      gamesPlayed: user.games_played,
      winRate: user.games_played > 0 
        ? parseFloat(((user.total_wins / user.games_played) * 100).toFixed(2))
        : 0,
      totalPoints: user.total_points
    }));
    
    res.json({
      success: true,
      data: {
        leaderboard: processedLeaderboard,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(count),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

module.exports = router;