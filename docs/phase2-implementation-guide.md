# Phase 2 Implementation Guide: Database & Authentication

## Overview

Phase 2 transforms QuantRooms from an in-memory prototype to a production-ready system with persistent data storage and secure user authentication. This guide provides step-by-step implementation instructions for migrating to PostgreSQL and implementing Google OAuth 2.0 authentication.

## 🎯 Phase 2 Goals

- **Database Integration**: Migrate from in-memory storage to PostgreSQL
- **Authentication System**: Implement Google OAuth 2.0 and email/password authentication
- **User Profiles**: Create persistent user accounts with ELO ratings
- **Enhanced Security**: Add JWT tokens, rate limiting, and input validation
- **Room Persistence**: Maintain room state across server restarts

## Prerequisites

- Phase 1 completed and functional
- Node.js 16+
- PostgreSQL 12+
- Google Cloud Console account for OAuth setup
- Basic understanding of database design and authentication flows

## Part 1: Database Setup

### 1.1 Install Database Dependencies

```bash
cd server
npm install pg pg-pool jsonwebtoken bcrypt passport passport-google-oauth20 passport-jwt helmet express-rate-limit joi compression express-validator redis connect-redis winston

# Development dependencies
npm install --save-dev jest supertest
```

### 1.2 PostgreSQL Database Creation

```bash
# Connect to PostgreSQL
psql -U postgres -h localhost

# Create database and user
CREATE DATABASE quantrooms;
CREATE USER quantrooms_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE quantrooms TO quantrooms_user;

# Connect to the database
\c quantrooms;

# Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "jsonb_plpgsql";

# Exit PostgreSQL
\q
```

### 1.3 Environment Configuration

Create `/server/.env`:

```env
# Database Configuration
DATABASE_URL=postgresql://quantrooms_user:your_secure_password@localhost:5432/quantrooms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantrooms
DB_USER=quantrooms_user
DB_PASSWORD=your_secure_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=https://quantguide.io

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
SESSION_SECRET=another_long_random_secret_for_sessions

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 1.4 Database Schema Implementation

Create `/server/database/schema.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    google_id VARCHAR(255) UNIQUE,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    elo_rating INTEGER DEFAULT 1200,
    games_played INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE rooms (
    room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    creator_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    max_players INTEGER DEFAULT 8 CHECK (max_players >= 2 AND max_players <= 8),
    current_players INTEGER DEFAULT 0,
    elo_min INTEGER DEFAULT 0,
    elo_max INTEGER DEFAULT 3000,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    difficulty VARCHAR(20) DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE games (
    game_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(room_id) ON DELETE CASCADE,
    problem_id VARCHAR(100) NOT NULL,
    participants JSONB NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    winner_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    final_scores JSONB,
    elo_changes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room participants junction table
CREATE TABLE room_participants (
    room_id UUID REFERENCES rooms(room_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_ready BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (room_id, user_id)
);

-- User sessions table (for JWT blacklisting)
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_elo_rating ON users(elo_rating);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_creator_id ON rooms(creator_id);
CREATE INDEX idx_games_room_id ON games(room_id);
CREATE INDEX idx_games_start_time ON games(start_time);
CREATE INDEX idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 1.5 Database Migration Script

Create `/server/migrations/migrate.js`:

```javascript
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('Starting database migration...');
        
        // Read and execute schema
        const schemaSQL = fs.readFileSync(
            path.join(__dirname, '../database/schema.sql'), 
            'utf8'
        );
        
        await client.query(schemaSQL);
        console.log('✅ Database schema created successfully');
        
        // Insert default data if needed
        await seedDefaultData(client);
        console.log('✅ Default data seeded successfully');
        
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

async function seedDefaultData(client) {
    // Create a test user for development
    if (process.env.NODE_ENV === 'development') {
        const testUserQuery = `
            INSERT INTO users (email, username, password_hash, is_verified)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO NOTHING
        `;
        
        const bcrypt = require('bcrypt');
        const testPassword = await bcrypt.hash('testpassword123', 12);
        
        await client.query(testUserQuery, [
            'test@quantrooms.com',
            'TestUser',
            testPassword,
            true
        ]);
        
        console.log('Created test user: test@quantrooms.com / testpassword123');
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration().catch(console.error);
}

module.exports = { runMigration };
```

### 1.6 Database Connection Module

Create `/server/database/connection.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }

    async query(text, params) {
        const start = Date.now();
        const res = await this.pool.query(text, params);
        const duration = Date.now() - start;
        
        if (duration > 100) {
            console.warn(`Slow query detected: ${duration}ms - ${text.substring(0, 100)}...`);
        }
        
        return res;
    }

    async getClient() {
        return await this.pool.connect();
    }

    async close() {
        await this.pool.end();
    }
}

const db = new Database();
module.exports = db;
```

## Part 2: Authentication System

### 2.1 Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API and Google Identity Services
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Client Secret to your `.env` file

### 2.2 Authentication Middleware

Create `/server/middleware/auth.js`:

```javascript
const jwt = require('jsonwebtoken');
const db = require('../database/connection');

class AuthMiddleware {
    static generateTokens(user) {
        const payload = {
            userId: user.user_id,
            email: user.email,
            username: user.username
        };

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
        });

        return { accessToken, refreshToken };
    }

    static async verifyToken(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ error: 'Access token required' });
            }

            // Check if token is blacklisted
            const blacklistCheck = await db.query(
                'SELECT 1 FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
                [token]
            );

            if (blacklistCheck.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get fresh user data
            const userResult = await db.query(
                'SELECT user_id, email, username, elo_rating FROM users WHERE user_id = $1',
                [decoded.userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = userResult.rows[0];
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Invalid token' });
            } else if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            
            console.error('Auth middleware error:', error);
            res.status(500).json({ error: 'Authentication error' });
        }
    }

    static async storeSession(userId, token) {
        const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

        await db.query(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [userId, tokenHash, expiresAt]
        );
    }

    static async removeSession(token) {
        const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
        
        await db.query(
            'DELETE FROM user_sessions WHERE token_hash = $1',
            [tokenHash]
        );
    }

    static async cleanExpiredSessions() {
        await db.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
    }
}

module.exports = AuthMiddleware;
```

### 2.3 Authentication Routes

Create `/server/routes/auth.js`:

```javascript
const express = require('express');
const bcrypt = require('bcrypt');
const joi = require('joi');
const crypto = require('crypto');
const db = require('../database/connection');
const AuthMiddleware = require('../middleware/auth');
const router = express.Router();

// Validation schemas
const registerSchema = joi.object({
    email: joi.string().email().required(),
    username: joi.string().alphanum().min(3).max(30).required(),
    password: joi.string().min(8).required()
});

const loginSchema = joi.object({
    email: joi.string().email().required(),
    password: joi.string().required()
});

// Register with email/password
router.post('/register', async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, username, password } = value;

        // Check if user already exists
        const existingUser = await db.query(
            'SELECT user_id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS));
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user
        const userResult = await db.query(
            `INSERT INTO users (email, username, password_hash, verification_token)
             VALUES ($1, $2, $3, $4)
             RETURNING user_id, email, username, elo_rating`,
            [email, username, passwordHash, verificationToken]
        );

        const user = userResult.rows[0];
        const tokens = AuthMiddleware.generateTokens(user);
        
        // Store session
        await AuthMiddleware.storeSession(user.user_id, tokens.accessToken);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.user_id,
                email: user.email,
                username: user.username,
                eloRating: user.elo_rating
            },
            tokens
        });

        // TODO: Send verification email
        console.log(`Verification token for ${email}: ${verificationToken}`);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login with email/password
router.post('/login', async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, password } = value;

        // Get user
        const userResult = await db.query(
            'SELECT user_id, email, username, password_hash, elo_rating, is_verified FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate tokens
        const tokens = AuthMiddleware.generateTokens(user);
        
        // Store session
        await AuthMiddleware.storeSession(user.user_id, tokens.accessToken);

        // Update last active
        await db.query(
            'UPDATE users SET last_active = NOW() WHERE user_id = $1',
            [user.user_id]
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.user_id,
                email: user.email,
                username: user.username,
                eloRating: user.elo_rating,
                isVerified: user.is_verified
            },
            tokens
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Google OAuth routes
router.get('/google', (req, res) => {
    const googleAuthURL = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
        `response_type=code&` +
        `scope=email profile&` +
        `access_type=offline`;
    
    res.redirect(googleAuthURL);
});

router.get('/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: process.env.GOOGLE_REDIRECT_URI
            })
        });

        const tokens = await tokenResponse.json();
        
        // Get user info
        const userResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`);
        const googleUser = await userResponse.json();

        // Check if user exists
        let userResult = await db.query(
            'SELECT user_id, email, username, elo_rating FROM users WHERE google_id = $1 OR email = $2',
            [googleUser.id, googleUser.email]
        );

        let user;
        if (userResult.rows.length === 0) {
            // Create new user
            const username = googleUser.name.replace(/\s+/g, '').substring(0, 30);
            userResult = await db.query(
                `INSERT INTO users (email, username, google_id, is_verified)
                 VALUES ($1, $2, $3, true)
                 RETURNING user_id, email, username, elo_rating`,
                [googleUser.email, username, googleUser.id]
            );
        } else {
            // Update existing user with Google ID if missing
            await db.query(
                'UPDATE users SET google_id = $1, is_verified = true WHERE user_id = $2',
                [googleUser.id, userResult.rows[0].user_id]
            );
        }

        user = userResult.rows[0];
        const appTokens = AuthMiddleware.generateTokens(user);
        
        // Store session
        await AuthMiddleware.storeSession(user.user_id, appTokens.accessToken);

        // Redirect to frontend with tokens
        res.redirect(`chrome-extension://your-extension-id/popup.html?token=${appTokens.accessToken}`);

    } catch (error) {
        console.error('Google OAuth error:', error);
        res.status(500).json({ error: 'OAuth authentication failed' });
    }
});

// Get current user profile
router.get('/profile', AuthMiddleware.verifyToken, async (req, res) => {
    try {
        const userResult = await db.query(
            `SELECT user_id, email, username, elo_rating, games_played, 
                    total_wins, total_points, created_at, last_active
             FROM users WHERE user_id = $1`,
            [req.user.user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        res.json({
            id: user.user_id,
            email: user.email,
            username: user.username,
            eloRating: user.elo_rating,
            gamesPlayed: user.games_played,
            totalWins: user.total_wins,
            totalPoints: user.total_points,
            winRate: user.games_played > 0 ? (user.total_wins / user.games_played * 100).toFixed(1) : 0,
            createdAt: user.created_at,
            lastActive: user.last_active
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Logout
router.post('/logout', AuthMiddleware.verifyToken, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        await AuthMiddleware.removeSession(token);
        
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Token refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        // Get user
        const userResult = await db.query(
            'SELECT user_id, email, username, elo_rating FROM users WHERE user_id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const tokens = AuthMiddleware.generateTokens(user);
        
        // Store new session
        await AuthMiddleware.storeSession(user.user_id, tokens.accessToken);

        res.json({ tokens });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

module.exports = router;
```

## Part 3: Room Management Migration

### 3.1 Room Service with Database

Create `/server/services/roomService.js`:

```javascript
const db = require('../database/connection');

class RoomService {
    static async createRoom(creatorId, roomData) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Create room
            const roomResult = await client.query(
                `INSERT INTO rooms (name, creator_id, max_players, elo_min, elo_max, difficulty, settings)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [
                    roomData.name,
                    creatorId,
                    roomData.maxPlayers || 8,
                    roomData.eloMin || 0,
                    roomData.eloMax || 3000,
                    roomData.difficulty || 'Medium',
                    JSON.stringify(roomData.settings || {})
                ]
            );

            const room = roomResult.rows[0];

            // Add creator as participant
            await client.query(
                'INSERT INTO room_participants (room_id, user_id, is_ready) VALUES ($1, $2, true)',
                [room.room_id, creatorId]
            );

            // Update current players count
            await client.query(
                'UPDATE rooms SET current_players = 1 WHERE room_id = $1',
                [room.room_id]
            );

            await client.query('COMMIT');
            
            return await this.getRoomWithParticipants(room.room_id);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getRoomWithParticipants(roomId) {
        const roomResult = await db.query(
            `SELECT r.*, u.username as creator_username
             FROM rooms r
             LEFT JOIN users u ON r.creator_id = u.user_id
             WHERE r.room_id = $1`,
            [roomId]
        );

        if (roomResult.rows.length === 0) {
            return null;
        }

        const room = roomResult.rows[0];

        // Get participants
        const participantsResult = await db.query(
            `SELECT u.user_id, u.username, u.elo_rating, rp.joined_at, rp.is_ready
             FROM room_participants rp
             JOIN users u ON rp.user_id = u.user_id
             WHERE rp.room_id = $1
             ORDER BY rp.joined_at`,
            [roomId]
        );

        return {
            ...room,
            participants: participantsResult.rows,
            settings: typeof room.settings === 'string' ? JSON.parse(room.settings) : room.settings
        };
    }

    static async joinRoom(roomId, userId) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Check if room exists and has space
            const roomResult = await client.query(
                'SELECT current_players, max_players, status FROM rooms WHERE room_id = $1',
                [roomId]
            );

            if (roomResult.rows.length === 0) {
                throw new Error('Room not found');
            }

            const room = roomResult.rows[0];

            if (room.status !== 'waiting') {
                throw new Error('Room is not accepting new players');
            }

            if (room.current_players >= room.max_players) {
                throw new Error('Room is full');
            }

            // Check if user already in room
            const existingResult = await client.query(
                'SELECT 1 FROM room_participants WHERE room_id = $1 AND user_id = $2',
                [roomId, userId]
            );

            if (existingResult.rows.length > 0) {
                throw new Error('User already in room');
            }

            // Add participant
            await client.query(
                'INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)',
                [roomId, userId]
            );

            // Update current players count
            await client.query(
                'UPDATE rooms SET current_players = current_players + 1 WHERE room_id = $1',
                [roomId]
            );

            await client.query('COMMIT');
            
            return await this.getRoomWithParticipants(roomId);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async leaveRoom(roomId, userId) {
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');

            // Remove participant
            const deleteResult = await client.query(
                'DELETE FROM room_participants WHERE room_id = $1 AND user_id = $2',
                [roomId, userId]
            );

            if (deleteResult.rowCount === 0) {
                throw new Error('User not in room');
            }

            // Update current players count
            await client.query(
                'UPDATE rooms SET current_players = current_players - 1 WHERE room_id = $1',
                [roomId]
            );

            // Check if room is empty
            const roomResult = await client.query(
                'SELECT current_players, creator_id FROM rooms WHERE room_id = $1',
                [roomId]
            );

            const room = roomResult.rows[0];

            if (room.current_players === 0) {
                // Delete empty room after 5 minutes
                setTimeout(async () => {
                    await this.cleanupEmptyRoom(roomId);
                }, 5 * 60 * 1000);
            } else if (room.creator_id === userId) {
                // Transfer ownership to oldest participant
                await client.query(
                    `UPDATE rooms SET creator_id = (
                        SELECT user_id FROM room_participants 
                        WHERE room_id = $1 
                        ORDER BY joined_at LIMIT 1
                    ) WHERE room_id = $1`,
                    [roomId]
                );
            }

            await client.query('COMMIT');
            
            return await this.getRoomWithParticipants(roomId);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getActiveRooms(limit = 50) {
        const result = await db.query(
            `SELECT r.*, u.username as creator_username,
                    COUNT(rp.user_id) as participant_count
             FROM rooms r
             LEFT JOIN users u ON r.creator_id = u.user_id
             LEFT JOIN room_participants rp ON r.room_id = rp.room_id
             WHERE r.status = 'waiting'
             GROUP BY r.room_id, u.username
             ORDER BY r.created_at DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows.map(room => ({
            ...room,
            settings: typeof room.settings === 'string' ? JSON.parse(room.settings) : room.settings
        }));
    }

    static async cleanupEmptyRoom(roomId) {
        try {
            const result = await db.query(
                'SELECT current_players FROM rooms WHERE room_id = $1',
                [roomId]
            );

            if (result.rows.length > 0 && result.rows[0].current_players === 0) {
                await db.query('DELETE FROM rooms WHERE room_id = $1', [roomId]);
                console.log(`Cleaned up empty room: ${roomId}`);
            }
        } catch (error) {
            console.error('Room cleanup error:', error);
        }
    }

    static async cleanupInactiveRooms() {
        try {
            const result = await db.query(
                `DELETE FROM rooms 
                 WHERE status = 'waiting' 
                 AND updated_at < NOW() - INTERVAL '30 minutes'
                 RETURNING room_id`
            );

            if (result.rows.length > 0) {
                console.log(`Cleaned up ${result.rows.length} inactive rooms`);
            }
        } catch (error) {
            console.error('Inactive room cleanup error:', error);
        }
    }
}

module.exports = RoomService;
```

## Part 4: Updated Server Configuration

### 4.1 Update Main Server File

Update `/server/server.js`:

```javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cors = require('cors');
require('dotenv').config();

const corsConfig = require('./config/corsConfig');
const db = require('./database/connection');
const AuthMiddleware = require('./middleware/auth');

// Routes
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

// Services
const RoomService = require('./services/roomService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: corsConfig,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow extension communication
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests, please try again later' }
});

app.use(limiter);
app.use(compression());
app.use(cors(corsConfig));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Socket.io authentication middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user data
        const userResult = await db.query(
            'SELECT user_id, email, username, elo_rating FROM users WHERE user_id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return next(new Error('User not found'));
        }

        socket.user = userResult.rows[0];
        next();
    } catch (error) {
        next(new Error('Invalid authentication token'));
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.user.user_id})`);

    socket.on('join-room', async (data) => {
        try {
            const { roomId } = data;
            const room = await RoomService.joinRoom(roomId, socket.user.user_id);
            
            socket.join(roomId);
            socket.roomId = roomId;
            
            io.to(roomId).emit('room-updated', room);
            socket.emit('room-joined', room);
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('leave-room', async (data) => {
        try {
            const { roomId } = data;
            const room = await RoomService.leaveRoom(roomId, socket.user.user_id);
            
            socket.leave(roomId);
            socket.roomId = null;
            
            if (room) {
                io.to(roomId).emit('room-updated', room);
            }
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.user.username}`);
        
        if (socket.roomId) {
            try {
                const room = await RoomService.leaveRoom(socket.roomId, socket.user.user_id);
                if (room) {
                    io.to(socket.roomId).emit('room-updated', room);
                }
            } catch (error) {
                console.error('Disconnect cleanup error:', error);
            }
        }
    });
});

// Cleanup tasks
setInterval(() => {
    AuthMiddleware.cleanExpiredSessions();
    RoomService.cleanupInactiveRooms();
}, 60000); // Run every minute

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log(`🚀 QuantRooms server running on port ${PORT}`);
    
    // Test database connection
    try {
        await db.query('SELECT NOW()');
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    server.close(() => {
        db.close();
        process.exit(0);
    });
});
```

### 4.2 Update Package.json Scripts

Update `/server/package.json` scripts:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "migrate": "node migrations/migrate.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint .",
    "seed": "node seeds/seed.js"
  }
}
```

## Part 5: Extension Updates

### 5.1 Update Background Script Authentication

Update `/extension/background.js` to handle authentication:

```javascript
// Add authentication handling
class AuthManager {
    static async getToken() {
        const result = await chrome.storage.local.get(['authToken']);
        return result.authToken;
    }

    static async setToken(token) {
        await chrome.storage.local.set({ authToken: token });
    }

    static async removeToken() {
        await chrome.storage.local.remove(['authToken']);
    }

    static async getCurrentUser() {
        const token = await this.getToken();
        if (!token) return null;

        try {
            const response = await fetch('http://localhost:3000/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                return await response.json();
            } else {
                await this.removeToken();
                return null;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            return null;
        }
    }
}

// Update WebSocket connection to include authentication
function connectToServer() {
    AuthManager.getToken().then(token => {
        if (!token) {
            console.log('No auth token, user needs to login');
            return;
        }

        socket = io('http://localhost:3000', {
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('Connected to server with authentication');
            broadcastToTabs({ type: 'CONNECTION_STATUS', connected: true });
        });

        socket.on('connect_error', (error) => {
            console.error('Connection failed:', error.message);
            if (error.message.includes('Authentication')) {
                AuthManager.removeToken();
            }
            broadcastToTabs({ type: 'CONNECTION_STATUS', connected: false });
        });

        // ... rest of socket handlers
    });
}
```

## Part 6: Testing and Validation

### 6.1 Run Migration

```bash
cd server
npm run migrate
```

### 6.2 Test Authentication Endpoints

```bash
# Test registration
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"password123"}'

# Test login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test profile (use token from login response)
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 6.3 Test Database Integration

```bash
# Connect to database and verify tables
psql -U quantrooms_user -d quantrooms -h localhost

# List tables
\dt

# Check users table
SELECT * FROM users LIMIT 5;

# Check rooms table
SELECT * FROM rooms LIMIT 5;
```

## Part 7: Next Steps

With Phase 2 complete, you now have:

✅ **Database Integration**: PostgreSQL with proper schema and migrations  
✅ **Authentication System**: Google OAuth 2.0 and email/password with JWT  
✅ **User Profiles**: Persistent accounts with ELO ratings  
✅ **Enhanced Security**: Token management, rate limiting, input validation  
✅ **Room Persistence**: Rooms survive server restarts  

**Ready for Phase 3**: Game logic, ELO calculations, and competitive features.

**Important Notes**:
- Update your Chrome extension manifest to include authentication flows
- Test all authentication flows thoroughly before moving to Phase 3
- Monitor database performance and add indexes as needed
- Implement proper logging for production debugging

The foundation is now solid for building the competitive multiplayer features in Phase 3!