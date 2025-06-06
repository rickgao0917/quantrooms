# Phase 1 Implementation Guide

## Overview

This document provides a complete guide for the Phase 1 implementation of QuantRooms - the multiplayer Chrome extension for QuantGuide.io. Phase 1 establishes the foundational backend server infrastructure and Chrome extension communication.

## What Was Implemented

### Backend Server
- Node.js/Express server with Socket.io WebSocket support
- In-memory room management system
- Real-time multiplayer communication
- CORS configuration for Chrome extension compatibility
- Health monitoring endpoints

### Chrome Extension
- Background service worker with persistent WebSocket connection
- Self-contained popup UI (no floating elements on QuantGuide pages)
- Content script for problem detection only
- Real-time room management through extension popup

## Architecture Overview

```
┌─────────────────┐    WebSocket     ┌─────────────────┐
│ Chrome Extension│◄─────────────────►│ Backend Server  │
│                 │                  │                 │
│ ┌─────────────┐ │                  │ ┌─────────────┐ │
│ │   Popup     │ │                  │ │ Socket.io   │ │
│ │     UI      │ │                  │ │  Handler    │ │
│ └─────────────┘ │                  │ └─────────────┘ │
│ ┌─────────────┐ │                  │ ┌─────────────┐ │
│ │ Background  │ │                  │ │   Express   │ │
│ │   Script    │ │                  │ │   Server    │ │
│ └─────────────┘ │                  │ └─────────────┘ │
│ ┌─────────────┐ │                  │ ┌─────────────┐ │
│ │  Content    │ │                  │ │ In-Memory   │ │
│ │   Script    │ │                  │ │   Rooms     │ │
│ └─────────────┘ │                  │ └─────────────┘ │
└─────────────────┘                  └─────────────────┘
```

## Directory Structure

```
quantrooms/
├── server/                     # Backend server
│   ├── config/
│   │   └── corsConfig.js      # CORS configuration
│   ├── routes/
│   │   ├── health.js          # Health check endpoints
│   │   └── rooms.js           # Room API endpoints
│   ├── socket/
│   │   └── socketHandler.js   # WebSocket event handling
│   ├── .env                   # Environment variables
│   ├── package.json           # Dependencies and scripts
│   └── server.js              # Main server file
├── extension/                  # Chrome extension
│   ├── icons/                 # Extension icons
│   ├── background.js          # Service worker
│   ├── content.js             # Content script
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup functionality
│   ├── styles.css             # Popup styles
│   └── manifest.json          # Extension manifest
└── docs/                      # Documentation
    ├── phase1-backend-server-setup.md
    └── phase1-implementation-guide.md
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Chrome browser
- Git

### 1. Clone and Setup

```bash
git clone <repository-url>
cd quantrooms
```

### 2. Start the Backend Server

```bash
cd server
npm install
npm start
```

The server will start on `http://localhost:3000`. You should see:
```
QuantRooms server running on port 3000
WebSocket server ready for connections
```

### 3. Verify Server is Running

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-04T18:16:43.109Z",
  "service": "QuantRooms Server",
  "version": "1.0.0",
  "uptime": 45582.363605584
}
```

### 4. Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` directory
5. The QuantRooms extension should appear in your extensions list

### 5. Test the Extension

1. Click the QuantRooms extension icon in Chrome toolbar
2. The popup should show "Connected to server"
3. Try creating a room or joining an existing one

## Features Implemented

### Backend Server Features

#### WebSocket Events (Server)
- `connection` - New client connected
- `create_room` - Create a new room
- `join_room` - Join an existing room
- `leave_room` - Leave current room
- `get_rooms` - Get list of active rooms
- `disconnect` - Handle client disconnection

#### WebSocket Events (Client)
- `room_created` - Room creation confirmation
- `room_joined` - Room join confirmation
- `room_list` - List of available rooms
- `room_list_updated` - Real-time room list updates
- `player_joined` - Player joined notification
- `player_left` - Player left notification
- `error` - Error messages

#### HTTP Endpoints
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health information
- `GET /api/rooms` - Get rooms via REST API

### Chrome Extension Features

#### Background Script (background.js)
- Persistent WebSocket connection to server
- User ID generation and management
- Room management functions
- Message routing between popup and content script

#### Content Script (content.js)
- Problem page detection on QuantGuide.io
- Problem data extraction (title, difficulty, category)
- No UI injection (self-contained in extension)
- Navigation monitoring for SPA changes

#### Popup UI (popup.html/js)
- Connection status display
- Room creation with customizable settings
- Room joining by code or browsing
- Real-time player list updates
- User statistics display

## Configuration

### Server Configuration (.env)
```
PORT=3000
NODE_ENV=development
```

### Extension Permissions (manifest.json)
- `storage` - User data persistence
- `activeTab` - Current tab access
- `https://quantguide.io/*` - QuantGuide.io access
- `http://localhost:3000/*` - Local server access

## Development Commands

### Server
```bash
npm start          # Start production server
npm run dev        # Start development server with auto-reload
```

### Extension Development
1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on QuantRooms extension
4. Test changes

## Testing

### Manual Testing with Test Page

A test page is provided at `test-page.html` to verify WebSocket functionality:

1. Open `test-page.html` in a browser
2. Click "Connect" to establish WebSocket connection
3. Test room creation, joining, and real-time updates

### Testing Chrome Extension

1. Navigate to any website (extension works on all sites for testing)
2. Click QuantRooms extension icon
3. Verify connection status shows "Connected to server"
4. Test room creation and joining functionality

## Room Management Flow

### Creating a Room
1. User clicks "Create Room" in extension popup
2. User fills in room details (name, max players, difficulty)
3. Background script sends `create_room` event to server
4. Server creates room and responds with `room_created`
5. Popup UI updates to show room details

### Joining a Room
1. User clicks "Join Room" in extension popup
2. User enters room code or browses available rooms
3. Background script sends `join_room` event to server
4. Server adds user to room and responds with `room_joined`
5. All players in room receive `player_joined` notification

### Real-time Updates
- Room list updates automatically when rooms are created/destroyed
- Player join/leave events update all participants
- Connection status monitored and displayed in popup

## Security Considerations

### CORS Configuration
- Specific origins allowed: QuantGuide.io, localhost
- Chrome extension origin patterns supported
- Credentials enabled for authenticated requests

### Input Validation
- Room names and user inputs sanitized
- Maximum room size limits enforced (2-8 players)
- Room ID validation to prevent injection attacks

## Troubleshooting

### Common Issues

#### Extension Not Connecting
1. Verify server is running: `curl http://localhost:3000/health`
2. Check browser console for connection errors
3. Ensure CORS is properly configured
4. Try reloading the extension

#### WebSocket Connection Failed
1. Check if port 3000 is available
2. Verify firewall settings allow localhost connections
3. Test with the provided test page first

#### Extension Not Loading
1. Ensure manifest.json is valid
2. Check for syntax errors in extension files
3. Verify all required files are present
4. Check Chrome extension developer console

#### Content Security Policy (CSP) Errors
If you see CSP errors about loading external scripts:
- The Socket.io client library must be bundled locally (included as `socket.io.min.js`)
- Chrome extensions cannot load scripts from CDNs due to security restrictions
- All scripts must be local files in the extension directory
- The extension includes a local copy of Socket.io to avoid CSP violations

### Debug Information

#### Server Logs
The server logs all WebSocket events and HTTP requests:
```
New client connected: <socket-id>
Room created: <room-id> by user <user-id>
User <user-id> joined room <room-id>
```

#### Extension Debug
1. Open extension popup
2. Right-click and select "Inspect"
3. Check console for error messages and connection status

## Next Steps (Future Phases)

### Phase 2: Database Integration
- PostgreSQL setup and migrations
- User authentication system
- Persistent room and game data

### Phase 3: Game Logic
- Problem selection and voting
- Competitive scoring system
- ELO rating calculations

### Phase 4: Advanced Features
- Matchmaking system
- Real-time code synchronization
- Advanced analytics and statistics

## File Changes Summary

### New Files Created
- `server/config/corsConfig.js` - CORS configuration
- `server/socket/socketHandler.js` - WebSocket event handling
- `server/.env` - Environment variables
- `extension/socket.io.min.js` - Local Socket.io client library
- `test-page.html` - WebSocket testing page

### Modified Files
- `server/server.js` - Enhanced with Socket.io integration
- `extension/background.js` - Added real WebSocket connection
- `extension/content.js` - Simplified to problem detection only
- `extension/popup.js` - Complete room management UI
- `extension/popup.html` - Updated styles and structure

### Dependencies Added
- `express` - Web server framework
- `socket.io` - Real-time WebSocket communication
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management
- `uuid` - Unique ID generation
- `nodemon` - Development auto-reload

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server and extension console logs
3. Test with the provided test page to isolate issues
4. Verify all prerequisites are met

---

**Implementation Date:** June 4, 2025  
**Version:** Phase 1 - Foundation  
**Status:** Complete and Ready for Testing