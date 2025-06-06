// QuantRooms Server - Phase 2
// Express + Socket.io + PostgreSQL + JWT Authentication

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');
require('dotenv').config();

// Import middleware
const { 
  securityHeaders, 
  generalLimiter, 
  compressionMiddleware, 
  sanitizeRequest,
  corsOptions 
} = require('./middleware/security');

// Import routes
const healthRouter = require('./routes/health').router;
const authRouter = require('./routes/auth');
const roomsRouter = require('./routes/rooms');
const usersRouter = require('./routes/users');

// Import socket handler
const SocketHandler = require('./socket/socketHandler');

// Import database
const db = require('./database/connection');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io configuration with authentication
const io = socketIo(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Apply security middleware
app.use(securityHeaders);
app.use(compressionMiddleware);
app.use(generalLimiter);
app.use(sanitizeRequest);

// CORS middleware
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Passport
app.use(passport.initialize());

// Serve static files
app.use(express.static('public'));

// API Routes
app.use('/api/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/users', usersRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'QuantRooms Server',
    version: '2.0.0',
    phase: 'Phase 2 - Database & Authentication',
    status: 'operational',
    features: [
      'JWT Authentication',
      'Google OAuth 2.0',
      'PostgreSQL Database',
      'Persistent Room Management',
      'User Profiles & Statistics',
      'WebSocket Authentication',
      'Rate Limiting & Security'
    ],
    endpoints: {
      health: '/api/health',
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        logout: 'POST /auth/logout',
        refresh: 'POST /auth/refresh',
        profile: 'GET /auth/profile',
        google: 'GET /auth/google',
        googleCallback: 'GET /auth/google/callback'
      },
      rooms: {
        list: 'GET /api/rooms',
        create: 'POST /api/rooms',
        details: 'GET /api/rooms/:id',
        join: 'POST /api/rooms/:id/join',
        leave: 'DELETE /api/rooms/:id/leave'
      },
      users: {
        profile: 'GET /api/users/profile',
        updateProfile: 'PUT /api/users/profile',
        changePassword: 'PUT /api/users/password',
        stats: 'GET /api/users/:id/stats',
        history: 'GET /api/users/:id/history',
        leaderboard: 'GET /api/users/leaderboard'
      }
    },
    socketEvents: {
      client: [
        'create-room',
        'join-room',
        'leave-room',
        'get-rooms',
        'send-message',
        'ready',
        'submit-solution',
        'vote-problem'
      ],
      server: [
        'room-created',
        'room-joined',
        'room-left',
        'room-list',
        'room-updated',
        'player-joined',
        'player-left',
        'new-message',
        'error',
        'current-room'
      ]
    },
    documentation: 'https://github.com/yourusername/quantrooms'
  });
});

// Initialize Socket.io handler
const socketHandler = new SocketHandler(io);
socketHandler.initialize();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation'
    });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.details
    });
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Close server
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close database connections
  await db.destroy();
  console.log('Database connections closed');
  
  // Close socket.io
  io.close(() => {
    console.log('Socket.io server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              QuantRooms Server v2.0.0                     ║
║              Phase 2: Database & Authentication           ║
║                                                           ║
║  Server running on port ${PORT}                              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                          ║
║                                                           ║
║  Features:                                                ║
║  ✓ JWT Authentication                                     ║
║  ✓ Google OAuth 2.0                                       ║
║  ✓ PostgreSQL Database                                    ║
║  ✓ WebSocket Authentication                               ║
║  ✓ Rate Limiting & Security                               ║
║                                                           ║
║  API Docs: http://localhost:${PORT}/                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Log database connection status
  db.raw('SELECT 1')
    .then(() => {
      console.log('✅ Database connection verified');
    })
    .catch((err) => {
      console.error('❌ Database connection failed:', err.message);
      console.error('Please ensure PostgreSQL is running and configured correctly');
    });
});