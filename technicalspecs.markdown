# QuantRooms Technical Specifications

## System Overview

QuantRooms is a multiplayer Chrome extension for QuantGuide.io that enables real-time collaborative coding practice with competitive scoring and ELO-based matchmaking.

### Core Architecture
- **Chrome Extension**: Content script injection and UI overlay
- **Backend Server**: Node.js/Express with WebSocket support
- **Database**: PostgreSQL for persistence
- **Real-time Communication**: Socket.io for WebSocket management

## Multiplayer System

### Player Capacity
- **Minimum**: 2 players
- **Maximum**: 8 players per room
- **Scalability**: Horizontal scaling via room sharding

### Real-time Synchronization
- **Problem State**: Synchronized problem selection across all players
- **Timer**: Shared countdown timer for each problem
- **Solution Tracking**: Real-time tracking of solve attempts and completions
- **User Presence**: Live indicators of player activity and status

## Scoring System

### Point Calculation
```
Base Points = 1000
Player Score = Base Points * (0.8 ^ (position - 1))

Position 1: 1000 points
Position 2: 800 points  
Position 3: 640 points
Position 4: 512 points
... (exponential decline continues)
```

### Timing Mechanics
- **Solve Time**: Measured from problem start to first correct submission
- **Timeout**: 15-minute maximum per problem
- **Partial Credit**: No partial credit - binary solve/no-solve system

## Authentication System

### Supported Methods
1. **Google OAuth 2.0**
   - Integration with Google Identity Services
   - Automatic user profile import
   - Seamless QuantGuide.io account linking

2. **Email/Password**
   - BCrypt hashing (cost factor: 12)
   - Email verification required
   - Password reset via secure tokens

### User Profile Integration
- **QuantGuide Sync**: Optional linking with existing QuantGuide accounts
- **Session Management**: JWT tokens with 7-day expiration
- **Multi-device Support**: Cross-browser session synchronization

## Lobby & Matchmaking System

### Lobby Interface
```
Lobby Browser:
┌─────────────────────────────────────────┐
│ Active Rooms                            │
├─────────────────────────────────────────┤
│ [Room Name] [2/8] [ELO: 1200-1400]     │
│ [Room Name] [5/8] [ELO: 800-1000]      │
│ [Room Name] [1/8] [ELO: 1600+]         │
└─────────────────────────────────────────┘
```

### ELO Matchmaking
- **Starting ELO**: 1200 (new users)
- **ELO Range**: 0-3000
- **Room Tolerance**: ±200 ELO points
- **ELO Calculation**: Standard ELO with K-factor of 32

### Room Categories
- **Quick Match**: Auto-matched by ELO
- **Custom Rooms**: User-created with specific settings
- **Practice Mode**: Solo practice (no ELO impact)

## Data Persistence

### User Statistics
```sql
users table:
- user_id (UUID)
- email (VARCHAR)
- google_id (VARCHAR, nullable)
- username (VARCHAR)
- elo_rating (INTEGER, default: 1200)
- games_played (INTEGER, default: 0)
- total_wins (INTEGER, default: 0)
- total_points (INTEGER, default: 0)
- created_at (TIMESTAMP)
- last_active (TIMESTAMP)
```

### Game History
```sql
games table:
- game_id (UUID)
- room_id (UUID)
- problem_id (VARCHAR)
- participants (JSONB)
- start_time (TIMESTAMP)
- end_time (TIMESTAMP)
- winner_id (UUID)
- final_scores (JSONB)
```

### Room Management
```sql
rooms table:
- room_id (UUID)
- name (VARCHAR)
- creator_id (UUID)
- max_players (INTEGER)
- current_players (INTEGER)
- elo_min (INTEGER)
- elo_max (INTEGER)
- status (ENUM: waiting, active, finished)
- created_at (TIMESTAMP)
```

## Real-time Communication

### WebSocket Events
```javascript
// Client to Server
'join-room': { roomId, userId }
'leave-room': { roomId, userId }
'solution-attempt': { code, language, timestamp }
'solution-complete': { success, time, points }

// Server to Client
'room-updated': { players, status }
'game-started': { problemId, startTime }
'player-solved': { playerId, time, points }
'game-ended': { finalScores, nextProblem }
```

### Message Protocol
- **Format**: JSON with event type and payload
- **Compression**: gzip compression for large payloads
- **Rate Limiting**: 10 messages/second per user
- **Reconnection**: Automatic reconnection with exponential backoff

## Chrome Extension Architecture

### Content Script Injection
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

### UI Components
1. **Room Panel**: Overlay on QuantGuide interface
2. **Player List**: Sidebar showing participants and scores
3. **Chat Interface**: Real-time messaging during games
4. **Notification System**: Toast notifications for game events

### Integration Points
- **Problem Detection**: Hook into QuantGuide's problem loading
- **Code Synchronization**: Monitor editor changes and submissions
- **Timer Integration**: Override or supplement existing timers

## API Design

### REST Endpoints
```
POST /auth/login
POST /auth/register
GET /auth/profile

GET /rooms
POST /rooms
PUT /rooms/:id/join
DELETE /rooms/:id/leave

GET /leaderboard
GET /user/:id/stats
GET /user/:id/history
```

### WebSocket Namespaces
```
/rooms/:roomId - Room-specific events
/global - System-wide notifications
```

## Security Requirements

### Data Protection
- **HTTPS Only**: All communication encrypted in transit
- **Input Validation**: Sanitization of all user inputs
- **SQL Injection Prevention**: Parameterized queries only
- **XSS Protection**: Content Security Policy headers

### Authentication Security
- **Token Rotation**: JWT refresh token mechanism
- **Session Timeout**: Automatic logout after inactivity
- **Rate Limiting**: API endpoint protection
- **CORS Configuration**: Strict origin validation

## Performance Requirements

### Latency Targets
- **WebSocket Latency**: <100ms for real-time events
- **API Response Time**: <200ms for REST endpoints
- **Database Queries**: <50ms average response time

### Scalability Metrics
- **Concurrent Users**: Support 1000+ simultaneous users
- **Room Capacity**: 500+ active rooms
- **Message Throughput**: 10,000 messages/second

### Resource Optimization
- **Database Indexing**: Optimized queries for ELO and room lookups
- **Connection Pooling**: Efficient database connection management
- **Caching Strategy**: Redis for session data and leaderboards

## Problem Selection System

### Voting Mechanism
- **Group Size**: Problems presented in groups of 5
- **Voting Process**: Each player votes for 1 problem from the group
- **Selection Logic**: Problem with most votes wins (random tiebreaker)
- **Voting Time**: 30-second voting window before each round
- **Problem Pool**: Filtered by room's difficulty settings

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

## Room Management

### Auto-cleanup Policy
- **Empty Room Timeout**: 5 minutes after last player leaves
- **Inactive Room Cleanup**: 30 minutes with no activity
- **Orphaned Room Cleanup**: Daily cleanup of rooms with invalid creators
- **Room History**: Game data preserved for 90 days after room deletion

### ELO System
- **No ELO Decay**: Ratings remain stable regardless of inactivity
- **Rating Preservation**: Long-term skill representation maintained
- **Comeback Mechanics**: No penalty for returning after extended breaks

## Difficulty Filtering

### Room Configuration
- **Difficulty Levels**: Easy, Medium, Hard (matching QuantGuide categories)
- **Mixed Difficulty**: Option for rooms to include multiple difficulty levels
- **Adaptive Difficulty**: Rooms can adjust based on average player ELO
- **Category Filtering**: Additional filtering by problem categories (Probability, Finance, etc.)

```javascript
// Room difficulty settings
{
  "difficultyFilter": ["Medium", "Hard"],
  "categories": ["Finance", "Probability"],
  "adaptiveDifficulty": true,
  "eloRange": [1200, 1600]
}
```