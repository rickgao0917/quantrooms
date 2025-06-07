# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuantRooms is a multiplayer Chrome extension for QuantGuide.io that enables real-time collaborative coding practice with competitive scoring and ELO-based matchmaking. The system consists of a Chrome extension frontend and a backend server supporting WebSocket-based real-time communication.

## 🚀 Current Status: Phase 2 Complete, OAuth Fixed

✅ **Phase 1: Backend Server Infrastructure**
- Node.js/Express server with Socket.io WebSocket support
- Real-time room management with in-memory storage
- CORS configured for Chrome extension compatibility
- Health monitoring and API endpoints
- Auto-cleanup: 5 minutes after last player leaves, 30 minutes with no activity

✅ **Phase 1: Chrome Extension**
- Self-contained popup UI (no floating elements)
- Background service worker with persistent WebSocket connection
- Content script for QuantGuide.io problem detection
- Real-time room creation, joining, and management
- Cross-account support: Works across different browser tabs and Gmail accounts
- CSP-compliant: Socket.io client bundled locally to avoid CDN issues

✅ **Phase 2: Database & Authentication (COMPLETED)**
- PostgreSQL database with Knex.js migrations and connection pooling
- Google OAuth 2.0 and email/password authentication with Passport.js
- JWT access tokens (7-day) and refresh tokens (30-day) with database storage
- User profiles with ELO ratings, statistics, and game history
- Persistent room management with database storage
- Enhanced security with rate limiting, input sanitization, and Helmet.js
- Complete API endpoints for authentication and user management
- Chrome Extension V2 with authentication UI and token management
- **OAuth Fixed**: Web Application OAuth client configured and working

🚧 **Phase 3: Game Logic & Competition (IN PLANNING)**
- Detailed implementation guide created: `/docs/phase3-implementation-guide.md`
- Game state management system designed
- ELO rating algorithm specified
- Problem voting mechanism planned
- Quick match matchmaking system outlined

## Architecture

### Chrome Extension Structure
- **manifest.json**: Manifest V3 configuration with permissions for QuantGuide.io and localhost server
- **content.js**: Main content script injected into QuantGuide.io pages, handles UI overlay and problem page detection
- **background.js**: Service worker managing user sessions, authentication, server connections, and cross-tab communication
- **popup.js**: Extension popup interface for authentication, room management, and user profiles
- **popup.html + styles.css**: Complete UI with login/register forms and room management
- **icons/**: Extension icons (16px, 48px, 128px) including Google OAuth integration

### Backend Architecture
- **Server**: Node.js/Express with WebSocket support (localhost:3000)
- **Database**: PostgreSQL with Knex.js migrations, connection pooling, and comprehensive schema
- **Real-time**: Socket.io for WebSocket management with authentication
- **Authentication**: Google OAuth 2.0 and email/password with JWT tokens and refresh mechanism
- **Security**: Helmet.js, rate limiting, input sanitization, and CORS configuration
- **API**: Complete REST endpoints for authentication, users, rooms, and statistics

### Key Components
- **Real-time Multiplayer**: WebSocket-based synchronization using Socket.io
- **Room System**: 2-8 player rooms with customizable settings
- **Problem Detection**: Automatic detection of QuantGuide.io problem pages
- **Multi-tab Support**: Multiple browser instances can join the same room

### Planned Features (Phase 3+)
- **ELO System Implementation**: Starting ELO 1200, range 0-3000, K-factor 32, ±200 ELO matchmaking tolerance
- **Scoring System**: Exponential decay scoring (1000 * 0.8^(position-1)) with real-time calculation
- **Problem Selection**: Group voting system (5 problems per group, 30-second voting window)
- **Game Logic**: Real-time competitive gameplay with timer synchronization
- **Matchmaking**: ELO-based automatic matching and quick match functionality

## Technical Specifications

### Multiplayer System Requirements
- **Player Capacity**: 2-8 players per room with horizontal scaling via room sharding
- **Real-time Synchronization**: Problem state, shared countdown timers, solution tracking, user presence
- **Scalability**: Support 1000+ concurrent users, 500+ active rooms, 10,000 messages/second

### Scoring System Details
```
Base Points = 1000
Player Score = Base Points * (0.8 ^ (position - 1))

Position 1: 1000 points
Position 2: 800 points  
Position 3: 640 points
Position 4: 512 points
... (exponential decline continues)
```

**Timing Mechanics:**
- Solve time measured from problem start to first correct submission
- 15-minute maximum per problem
- Binary solve/no-solve system (no partial credit)

### ELO System Specifications
- **Starting ELO**: 1200 for new users
- **ELO Range**: 0-3000
- **Room Tolerance**: ±200 ELO points for matchmaking
- **K-factor**: 32 for rating calculations
- **No ELO Decay**: Ratings remain stable regardless of inactivity

### Authentication System (IMPLEMENTED)
**Supported Methods:**
1. **Google OAuth 2.0**: Complete integration with Passport.js, automatic profile import, and account linking
2. **Email/Password**: BCrypt hashing (cost factor: 12), password strength validation, and secure login

**Security Features (IMPLEMENTED):**
- JWT access tokens (7-day expiration) and refresh tokens (30-day expiration)
- Database-stored session management with device tracking
- Multi-device support with cross-browser synchronization
- Rate limiting on authentication endpoints
- Input sanitization and XSS protection
- Secure password hashing with BCrypt

### Room Management System
**Room Categories:**
- **Quick Match**: Auto-matched by ELO
- **Custom Rooms**: User-created with specific settings
- **Practice Mode**: Solo practice (no ELO impact)

**Lobby Interface:**
```
┌─────────────────────────────────────────┐
│ Active Rooms                            │
├─────────────────────────────────────────┤
│ [Room Name] [2/8] [ELO: 1200-1400]     │
│ [Room Name] [5/8] [ELO: 800-1000]      │
│ [Room Name] [1/8] [ELO: 1600+]         │
└─────────────────────────────────────────┘
```

**Auto-cleanup Policy:**
- Empty room timeout: 5 minutes after last player leaves
- Inactive room cleanup: 30 minutes with no activity
- Orphaned room cleanup: Daily cleanup of invalid rooms
- Game history preserved for 90 days after room deletion

### Problem Selection System
**Voting Mechanism:**
- Problems presented in groups of 5
- Each player votes for 1 problem from the group
- Most votes wins (random tiebreaker)
- 30-second voting window before each round
- Filtered by room's difficulty settings

```javascript
// Voting flow example
{
  "problemGroup": [
    { "id": "prob1", "title": "Option Pricing", "difficulty": "Medium" },
    { "id": "prob2", "title": "Portfolio Optimization", "difficulty": "Medium" },
    { "id": "prob3", "title": "Risk Calculation", "difficulty": "Medium" },
    { "id": "prob4", "title": "Monte Carlo", "difficulty": "Medium" },
    { "id": "prob5", "title": "Black-Scholes", "difficulty": "Medium" }
  ],
  "votes": { "prob1": 2, "prob3": 4, "prob5": 2 },
  "selected": "prob3"
}
```

**Difficulty Filtering:**
- Difficulty Levels: Easy, Medium, Hard (matching QuantGuide categories)
- Mixed difficulty options for rooms
- Adaptive difficulty based on average player ELO
- Category filtering (Probability, Finance, etc.)

```javascript
// Room difficulty settings
{
  "difficultyFilter": ["Medium", "Hard"],
  "categories": ["Finance", "Probability"],
  "adaptiveDifficulty": true,
  "eloRange": [1200, 1600]
}
```

## Development Commands

### Phase 1 (Legacy)
```bash
# Start Phase 1 server (in-memory storage)
cd server
npm install
node server.js  # Basic server without database

# Use Phase 1 extension
# Load extension/ directory with manifest.json
```

### Phase 2 (Current)
```bash
# Setup database (PostgreSQL required)
cd server
npm install
npm run migrate  # Run database migrations
node server.js  # Start server with database and authentication

# Use extension with authentication
# Load extension/ directory with manifest.json
# Configure .env file with database and OAuth credentials
```

### Phase 3+ (Planned)
```bash
# Game logic implementation
npm run seed     # Seed development data
npm test         # Run test suite

# Extension build optimization
cd extension
npm run build    # Production build
npm run dev      # Development watch mode
```

## Project Structure

```
quantrooms/
├── server/                 # Backend Node.js server
│   ├── config/
│   │   ├── corsConfig.js   # CORS configuration
│   │   └── passport.js     # Authentication strategies
│   ├── database/
│   │   ├── connection.js   # Database connection
│   │   ├── migrations/     # Database migrations
│   │   ├── models/         # Database models
│   │   └── seeds/          # Database seeds
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication
│   │   └── security.js     # Security middleware
│   ├── routes/
│   │   ├── auth.js         # Authentication endpoints
│   │   ├── health.js       # Health check endpoint
│   │   ├── rooms.js        # Room management API
│   │   └── users.js        # User management API
│   ├── services/
│   │   └── roomService.js  # Room business logic
│   ├── socket/
│   │   └── socketHandler.js    # WebSocket event handlers
│   ├── utils/
│   │   ├── jwt.js          # JWT utilities
│   │   ├── password.js     # Password utilities
│   │   └── validation.js   # Input validation
│   ├── knexfile.js         # Database configuration
│   ├── package.json        # Server dependencies
│   └── server.js           # Main server with database and authentication
├── extension/              # Chrome extension
│   ├── background.js       # Service worker with authentication
│   ├── content.js          # Content script
│   ├── popup.html          # Extension UI with authentication
│   ├── popup.js            # Popup logic with authentication
│   ├── styles.css          # Extension styling
│   ├── icons/              # Extension icons
│   └── manifest.json       # Extension manifest
├── docs/                   # Documentation
│   ├── phase1-implementation-guide.md
│   ├── phase1-backend-server-setup.md
│   └── phase2-implementation-guide.md
├── CLAUDE.md              # This file
├── README.md              # Project overview
├── SETUP.md               # Setup instructions
└── TODO.md                # Development roadmap
```

## API Design

### REST Endpoints (IMPLEMENTED)
```
# Authentication
POST /auth/register         # User registration
POST /auth/login           # Email/password login
POST /auth/logout          # Token invalidation
POST /auth/refresh         # Token refresh
GET /auth/profile          # User profile
GET /auth/google           # OAuth initiation
GET /auth/google/callback  # OAuth callback

# Users
GET /api/users/:id/stats   # User statistics
GET /api/users/:id/history # Game history
GET /api/users/leaderboard # Global leaderboard
PUT /api/users/profile     # Profile updates
PUT /api/users/password    # Password changes

# Rooms (Enhanced)
GET /rooms                 # List rooms
POST /rooms               # Create room
PUT /rooms/:id/join       # Join room
DELETE /rooms/:id/leave   # Leave room
```

### WebSocket Namespaces
```
/rooms/:roomId - Room-specific events
/global - System-wide notifications
```

### Message Protocol
- **Format**: JSON with event type and payload
- **Compression**: gzip compression for large payloads
- **Rate Limiting**: 10 messages/second per user
- **Reconnection**: Automatic reconnection with exponential backoff

## Chrome Extension Architecture Details

### Content Script Integration
```javascript
// Manifest V3 configuration
{
  "content_scripts": [{
    "matches": ["https://quantguide.io/*"],
    "js": ["content.js"],
    "css": ["overlay.css"]
  }]
}
```

### UI Components (Planned)
1. **Room Panel**: Overlay on QuantGuide interface
2. **Player List**: Sidebar showing participants and scores
3. **Chat Interface**: Real-time messaging during games
4. **Notification System**: Toast notifications for game events

### Integration Points
- **Problem Detection**: Hook into QuantGuide's problem loading
- **Code Synchronization**: Monitor editor changes and submissions
- **Timer Integration**: Override or supplement existing timers

## Security Requirements

### Phase 1 (Legacy)
- CORS configuration for QuantGuide.io integration
- Local Socket.io client bundle to avoid CSP issues
- Secure WebSocket connections

### Phase 2 (IMPLEMENTED)
**Data Protection:**
- HTTPS-only communication with encrypted transit
- Input validation and sanitization for all user inputs
- SQL injection prevention with parameterized queries
- XSS protection with Content Security Policy headers
- Helmet.js security middleware

**Authentication Security:**
- JWT access tokens (7-day) and refresh tokens (30-day)
- Session timeout with automatic logout after inactivity
- Rate limiting for API endpoints (multiple tiers)
- CORS configuration with strict origin validation
- BCrypt password hashing (12 rounds)
- Database-stored session management

## Performance Requirements

### Latency Targets
- **WebSocket latency**: <100ms for real-time events
- **API response time**: <200ms for REST endpoints
- **Database queries**: <50ms average response time

### Scalability Metrics
- **Concurrent users**: Support 1000+ simultaneous users
- **Room capacity**: 500+ active rooms
- **Message throughput**: 10,000 messages/second

### Resource Optimization
- **Database indexing**: Optimized queries for ELO and room lookups
- **Connection pooling**: Efficient database connection management
- **Caching strategy**: Redis for session data and leaderboards
- **Bundle size optimization**: Minimized extension package size
- **Memory leak prevention**: Proper cleanup of WebSocket connections

## Development Notes

### Chrome Extension Integration
- Content script monitors QuantGuide.io problem pages
- Self-contained popup UI for room management
- Background script handles server communication and user sessions
- Multi-tab and cross-account support

### WebSocket Events (Current)
```javascript
// Client to Server
'create-room': { name, maxPlayers, difficulty }
'join-room': { roomId, userId }
'leave-room': { roomId, userId }

// Server to Client  
'room-created': { roomId, room }
'room-joined': { room }
'room-updated': { room }
'player-left': { playerId }
'error': { message }
```

### WebSocket Events (Planned)
```javascript
// Additional events for Phase 2+
'solution-attempt': { code, language, timestamp }
'solution-complete': { success, time, points }
'game-started': { problemId, startTime }
'player-solved': { playerId, time, points }
'vote-problem': { problemId }
'voting-results': { selectedProblemId }
```

### Database Schema (IMPLEMENTED)
```sql
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE rooms (
  room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  creator_id UUID REFERENCES users(user_id),
  max_players INTEGER DEFAULT 8,
  current_players INTEGER DEFAULT 0,
  elo_min INTEGER DEFAULT 0,
  elo_max INTEGER DEFAULT 3000,
  status VARCHAR(20) DEFAULT 'waiting',
  difficulty VARCHAR(20) DEFAULT 'Medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE games (
  game_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(room_id),
  problem_id VARCHAR(100) NOT NULL,
  participants JSONB NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  winner_id UUID REFERENCES users(user_id),
  final_scores JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Setup Instructions

### Quick Start (Phase 1)
1. **Start Server**: `cd server && npm install && npm start`
2. **Load Extension**: Open `chrome://extensions/`, enable Developer mode, load `extension/` directory
3. **Test**: Click extension icon, create room, join from another tab

### Environment Variables (Phase 2+)
```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/quantrooms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantrooms
DB_USER=your_username
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=https://quantguide.io

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Testing

### Current Testing Methods
- Multi-tab testing: Open multiple Chrome tabs/windows
- Cross-account testing: Use different Gmail accounts
- WebSocket testing: Direct server testing capabilities
- Problem detection: Visit any website to test content script

### Verification Steps
1. **Backend**: `curl http://localhost:3000/health` should return health status
2. **Extension**: Click icon should show "Connected to server"
3. **Real-time**: Create room in one tab, join from another tab should sync

## Development Roadmap

### ✅ Phase 1: Foundation (COMPLETED)
- Core infrastructure with real-time multiplayer
- Chrome extension with self-contained popup UI
- WebSocket-based room management
- Problem detection on QuantGuide.io
- Multi-tab and cross-account support

### ✅ Phase 2: Database & Authentication (COMPLETED)
- PostgreSQL database integration with Knex.js migrations
- Google OAuth 2.0 and email/password authentication
- JWT access and refresh token system
- User profiles with ELO ratings and statistics
- Persistent room and game history
- Enhanced security with rate limiting and input sanitization
- Chrome Extension V2 with authentication UI

### 🚧 Phase 3: Game Logic & Competition (NEXT)
- ELO rating system implementation with matchmaking
- Real-time competitive scoring system
- Game session management with timers
- Problem selection and voting system
- Quick match functionality

### 📋 Phase 3: Game Logic & Competition
- Problem selection and voting system
- Competitive scoring with exponential decay
- ELO rating system with matchmaking
- Game session management and timers
- Real-time leaderboards and analytics

### 🎨 Phase 4: User Interface
- Enhanced popup interface design
- QuantGuide.io integration overlays
- User lists, chat interface, settings panel
- Mobile responsiveness and accessibility
- Non-intrusive notifications

### ⚡ Phase 5: Advanced Features
- Voice chat and screen sharing
- Whiteboard and drawing tools
- Code review and commenting
- Achievement system and gamification
- Social features (friends, leaderboards)

### 🔒 Phase 6: Quality & Security
- Comprehensive testing suite
- Performance optimization
- Security hardening and penetration testing
- Bundle size optimization
- Memory leak prevention

### 📦 Phase 7: Deployment & Distribution
- Production server configuration
- Monitoring and logging setup
- Chrome Web Store submission
- Privacy policy and terms creation
- Backup strategies and CDN setup

## Troubleshooting

### Common Issues

**Phase 1 (Legacy):**
- **Extension not connecting**: Check server status at `http://localhost:3000/health`
- **CSP errors**: Extension uses local Socket.io bundle to avoid CDN issues
- **WebSocket connection failed**: Verify port 3000 is accessible and not blocked by firewall
- **Room sync issues**: Ensure both instances are connected to same server

**Phase 2 (Current):**
- **Database connection**: Ensure PostgreSQL is running and credentials are correct
- **Authentication failures**: Check Google OAuth configuration and JWT secrets
- **Migration errors**: Run `npm run migrate` to ensure database schema is up to date
- **Token issues**: Clear browser storage if experiencing authentication problems

**OAuth Configuration (FIXED):**
- **OAuth Type**: Use Web Application OAuth client, NOT Chrome Extension client
- **"OAuth client was not found"**: Verify correct Google Cloud project and client ID
- **"Missing required parameter: scope"**: Normal error when accessing callback URL directly
- **Server not using new credentials**: Kill and restart server after updating `.env`
- **Testing mode**: Add test users in Google Cloud Console OAuth consent screen
- **Redirect URI**: Must be exactly `http://localhost:3000/auth/google/callback`

### Performance Considerations
- WebSocket connections require authentication tokens
- PostgreSQL database with connection pooling
- Room auto-cleanup with database persistence
- JWT token refresh mechanism for session management
- Rate limiting prevents API abuse

The codebase has completed Phase 2 with full database integration and authentication. The system now supports persistent user accounts, room history, and secure authentication via Google OAuth 2.0 and email/password. Ready for Phase 3 game logic implementation.

## Repository Locations
- **README Location**: `/Users/rickgao/PycharmProjects/quantrooms/README.md`