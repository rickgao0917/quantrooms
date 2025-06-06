# Phase 1: Backend Server Setup Implementation Plan

**Status**: Ready for implementation
**Goal**: Create foundational backend server infrastructure for QuantRooms

## Overview
This document details the implementation plan for the basic backend server infrastructure for QuantRooms. This is the foundational step that enables communication between the Chrome extension and the server.

## Goals
- Create a minimal Node.js/Express server with Socket.io support
- Establish WebSocket communication channel for real-time features
- Provide basic room management (in-memory)
- Enable Chrome extension to connect and communicate with server
- Set up health check and basic error handling

## Implementation Steps

### Step 1: Server Directory Structure
```
server/
├── package.json
├── server.js (main server file)
├── routes/
│   └── health.js
├── socket/
│   └── socketHandler.js
├── config/
│   └── corsConfig.js
└── .env
```

### Step 2: Dependencies Setup
**Production Dependencies:**
- `express`: Web server framework
- `socket.io`: Real-time WebSocket communication
- `cors`: Cross-origin resource sharing for Chrome extension
- `dotenv`: Environment variable management
- `uuid`: Generate unique IDs for rooms and users

**Development Dependencies:**
- `nodemon`: Auto-restart server during development

### Step 3: Core Server Features

#### 3.1 Express Server
- Basic Express app with JSON middleware
- CORS configuration to allow Chrome extension communication
- Health check endpoint at `/health`
- Static file serving for potential future web interface

#### 3.2 Socket.io Integration
- WebSocket server integrated with Express
- Connection/disconnection event handling
- Basic room management with in-memory storage
- Message broadcasting within rooms

#### 3.3 Basic Room System
**Room Structure:**
```javascript
{
  id: 'room_uuid',
  name: 'Room Name',
  creator: 'user_id',
  players: ['user1', 'user2'],
  maxPlayers: 8,
  status: 'waiting', // waiting, active, finished
  createdAt: timestamp
}
```

### Step 4: WebSocket Events

#### Client to Server Events:
- `connection`: Initial connection establishment
- `create-room`: Create a new room
- `join-room`: Join an existing room
- `leave-room`: Leave current room
- `disconnect`: Handle disconnection cleanup

#### Server to Client Events:
- `room-created`: Room creation confirmation
- `room-joined`: Room join confirmation
- `room-updated`: Room state changes (players joined/left)
- `room-list`: Available rooms list
- `error`: Error messages

### Step 5: Chrome Extension Updates

#### 5.1 Background Script Updates
- Update `connectToServer()` to use real WebSocket connection
- Implement actual room creation/joining logic
- Add WebSocket message handling

#### 5.2 Content Script Updates
- Connect WebSocket functionality to UI elements
- Update room creation and joining flows
- Add real-time room status updates

### Step 6: Testing Strategy

#### 6.1 Server Testing
- Health check endpoint verification
- WebSocket connection testing
- Room creation/joining flow testing
- Multiple client connection testing

#### 6.2 Extension Testing
- Extension-to-server connection verification
- Room creation from extension popup
- Room joining functionality
- Real-time updates between multiple extension instances

## Technical Decisions

### 1. In-Memory Storage
**Decision:** Use in-memory storage for rooms during this phase
**Rationale:** 
- Faster development without database setup complexity
- Sufficient for initial testing and MVP
- Easy to migrate to database later

### 2. Simple Authentication
**Decision:** Use simple user ID generation without full authentication
**Rationale:**
- Focus on core communication infrastructure first
- Authentication will be added in later phase
- Allows testing of multiplayer features immediately

### 3. CORS Configuration
**Decision:** Allow specific origins (QuantGuide.io, localhost) with credentials
**Rationale:**
- Security best practice - don't allow all origins
- Support both production (QuantGuide.io) and development (localhost)
- Enable credential sharing for future authentication

## Expected Outcomes

After this implementation:
1. Chrome extension can connect to backend server
2. Users can create and join rooms through extension popup
3. Real-time room updates work between multiple users
4. Basic error handling and logging in place
5. Foundation ready for next phases (authentication, database, game logic)

## Success Criteria

The implementation is successful when:
- [ ] Server starts without errors and health check returns 200
- [ ] Chrome extension connects to server successfully
- [ ] Room creation works from extension UI
- [ ] Room joining works with room IDs
- [ ] Real-time room updates work between multiple browser instances
- [ ] Proper error messages displayed in extension for failures
- [ ] Server logs show connection and room events properly
- [ ] Extension loads in Chrome without permission errors
- [ ] WebSocket communication verified through testing

## Next Steps

After completing this phase:
1. **Phase 2**: Database integration (PostgreSQL setup, migrations)
2. **Phase 3**: Authentication system (Google OAuth, JWT)
3. **Phase 4**: Game logic (problem selection, voting, scoring)
4. **Phase 5**: Advanced features (ELO rating, matchmaking)