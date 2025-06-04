# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuantRooms is a multiplayer Chrome extension for QuantGuide.io that enables real-time collaborative coding practice with competitive scoring and ELO-based matchmaking. The system consists of a Chrome extension frontend and a backend server supporting WebSocket-based real-time communication.

## Architecture

### Chrome Extension Structure
- **manifest.json**: Manifest V3 configuration with permissions for QuantGuide.io and localhost server
- **content.js**: Main content script injected into QuantGuide.io pages, handles UI overlay and problem page detection
- **background.js**: Service worker managing user sessions, server connections, and cross-tab communication
- **popup.js**: Extension popup interface for quick match, room creation/joining
- **popup.html + styles.css**: Popup UI and styling

### Key Components
- **Real-time Multiplayer**: WebSocket-based synchronization using Socket.io
- **Room System**: 2-8 player rooms with ELO-based matchmaking (±200 ELO tolerance)
- **Scoring System**: Exponential decay scoring (1000 * 0.8^(position-1))
- **Problem Selection**: Group voting system (5 problems per group, 30-second voting window)
- **Authentication**: Google OAuth 2.0 and email/password with JWT tokens

### Backend Architecture (Planned)
- **Server**: Node.js/Express with WebSocket support
- **Database**: PostgreSQL with tables for users, rooms, games
- **Real-time**: Socket.io for WebSocket management
- **Authentication**: JWT with 7-day expiration, BCrypt password hashing

## Development Commands

Since this is an early-stage project, standard development commands are not yet established. The repository currently contains:
- Chrome extension files ready for development/testing
- Technical specifications and TODO list for implementation planning

## Key Technical Details

### ELO System
- Starting ELO: 1200 for new users
- ELO range: 0-3000
- K-factor: 32 for rating calculations
- No ELO decay policy

### Room Management
- Auto-cleanup: 5 minutes after last player leaves
- Inactive cleanup: 30 minutes with no activity
- Game history preserved for 90 days

### Security Requirements
- HTTPS-only communication
- Input validation and sanitization
- Rate limiting (10 messages/second per user)
- CORS configuration for QuantGuide.io integration

### Performance Targets
- WebSocket latency: <100ms
- API response time: <200ms
- Support for 1000+ concurrent users, 500+ active rooms

## Development Notes

### Chrome Extension Integration
- Content script monitors QuantGuide.io problem pages
- Floating UI button with overlay panel for room management
- Background script handles server communication and user sessions
- Popup provides quick access to multiplayer features

### WebSocket Events (Planned)
```javascript
// Client to Server
'join-room': { roomId, userId }
'solution-attempt': { code, language, timestamp }
'solution-complete': { success, time, points }

// Server to Client  
'room-updated': { players, status }
'game-started': { problemId, startTime }
'player-solved': { playerId, time, points }
```

### Database Schema (Planned)
Key tables: users (UUID, email, elo_rating), rooms (UUID, name, max_players), games (UUID, participants, final_scores)

The codebase is currently in initial development phase with Chrome extension foundation established and backend implementation pending.