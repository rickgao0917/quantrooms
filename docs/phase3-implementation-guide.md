# Phase 3: Game Logic & Competition Implementation Guide

## Overview

Phase 3 transforms QuantRooms from a room management system into a fully functional competitive coding platform with real-time multiplayer gameplay, ELO-based matchmaking, and automated scoring.

## Current Status

### ✅ Completed (Phase 1 & 2)
- WebSocket real-time communication
- PostgreSQL database with user accounts
- Google OAuth and email/password authentication
- JWT token-based security
- Room creation and management
- Chrome extension with authentication UI

### 🚧 Phase 3 Goals
1. **Game Session Management**: Start games, track progress, declare winners
2. **Problem Integration**: Detect and sync QuantGuide problems
3. **Scoring System**: Implement exponential decay scoring
4. **ELO Rating System**: Update ratings after each game
5. **Matchmaking**: Quick match with ELO-based pairing
6. **Problem Voting**: Democratic problem selection

## Implementation Plan

### 1. Database Schema Updates

```sql
-- Add game state tracking to rooms
ALTER TABLE rooms ADD COLUMN game_state JSONB DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN current_problem_id VARCHAR(100);
ALTER TABLE rooms ADD COLUMN game_started_at TIMESTAMP;
ALTER TABLE rooms ADD COLUMN game_ends_at TIMESTAMP;

-- Add problem tracking
CREATE TABLE problems (
  problem_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quantguide_id VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  difficulty VARCHAR(20) NOT NULL,
  category VARCHAR(50),
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add game participants with detailed tracking
CREATE TABLE game_participants (
  participant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES games(game_id),
  user_id UUID REFERENCES users(user_id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  solved BOOLEAN DEFAULT FALSE,
  solve_time INTEGER, -- seconds taken to solve
  points_earned INTEGER DEFAULT 0,
  final_position INTEGER,
  elo_change INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add problem voting
CREATE TABLE problem_votes (
  vote_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(room_id),
  user_id UUID REFERENCES users(user_id),
  problem_id VARCHAR(100) NOT NULL,
  voting_round INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, user_id, voting_round)
);
```

### 2. Game State Management

#### Server-Side Game Controller (`/server/services/gameService.js`)

```javascript
class GameService {
  constructor() {
    this.activeGames = new Map(); // roomId -> GameState
  }

  async startGame(roomId) {
    const room = await this.getRoomWithParticipants(roomId);
    
    if (room.current_players < 2) {
      throw new Error('Need at least 2 players to start');
    }

    const gameState = {
      roomId,
      status: 'voting', // voting -> playing -> finished
      participants: room.participants.map(p => ({
        userId: p.user_id,
        username: p.username,
        elo: p.elo_rating,
        ready: false,
        solved: false,
        solveTime: null,
        points: 0
      })),
      votingRound: 1,
      problemOptions: [],
      votes: {},
      currentProblem: null,
      startTime: null,
      endTime: null,
      maxDuration: 15 * 60 * 1000 // 15 minutes
    };

    this.activeGames.set(roomId, gameState);
    await this.updateRoomGameState(roomId, gameState);
    
    return gameState;
  }

  async submitVote(roomId, userId, problemId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState || gameState.status !== 'voting') {
      throw new Error('Not in voting phase');
    }

    gameState.votes[userId] = problemId;
    
    // Check if all players voted
    if (Object.keys(gameState.votes).length === gameState.participants.length) {
      await this.selectProblemAndStart(roomId);
    }
    
    return gameState;
  }

  async submitSolution(roomId, userId, solved) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState || gameState.status !== 'playing') {
      throw new Error('Game not in progress');
    }

    const participant = gameState.participants.find(p => p.userId === userId);
    if (!participant || participant.solved) {
      return; // Already solved or not in game
    }

    participant.solved = solved;
    participant.solveTime = Date.now() - gameState.startTime;
    
    if (solved) {
      // Calculate points based on position
      const solvedCount = gameState.participants.filter(p => p.solved).length;
      participant.points = Math.floor(1000 * Math.pow(0.8, solvedCount - 1));
      
      // Check if game should end
      if (await this.checkGameEnd(roomId)) {
        await this.endGame(roomId);
      }
    }
    
    return gameState;
  }

  async endGame(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return;

    gameState.status = 'finished';
    gameState.endTime = Date.now();

    // Calculate final positions and ELO changes
    const sortedParticipants = [...gameState.participants]
      .sort((a, b) => b.points - a.points);

    const eloChanges = this.calculateEloChanges(sortedParticipants);
    
    // Update database
    await this.saveGameResults(roomId, gameState, eloChanges);
    
    // Clean up
    this.activeGames.delete(roomId);
    
    return { gameState, eloChanges };
  }

  calculateEloChanges(participants) {
    const K = 32; // K-factor
    const changes = {};

    for (let i = 0; i < participants.length; i++) {
      const player = participants[i];
      let totalChange = 0;

      for (let j = 0; j < participants.length; j++) {
        if (i === j) continue;
        
        const opponent = participants[j];
        const expectedScore = 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
        const actualScore = i < j ? 1 : 0; // 1 if player ranked higher, 0 otherwise
        
        totalChange += K * (actualScore - expectedScore);
      }

      changes[player.userId] = Math.round(totalChange);
    }

    return changes;
  }
}
```

### 3. WebSocket Events Update

#### New Socket Events (`/server/socket/socketHandler.js`)

```javascript
// Game Management Events
socket.on('start-game', async (data) => {
  try {
    const { roomId } = data;
    const userId = socket.userId;
    
    // Verify user is room creator
    const room = await roomService.getRoom(roomId);
    if (room.creator_id !== userId) {
      return socket.emit('error', { message: 'Only room creator can start game' });
    }
    
    const gameState = await gameService.startGame(roomId);
    
    // Start problem selection
    const problems = await problemService.getRandomProblems(5, room.difficulty);
    gameState.problemOptions = problems;
    
    io.to(roomId).emit('game-started', { gameState });
    
    // Start voting timer (30 seconds)
    setTimeout(async () => {
      if (gameState.status === 'voting') {
        await gameService.selectProblemAndStart(roomId);
      }
    }, 30000);
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});

socket.on('vote-problem', async (data) => {
  try {
    const { roomId, problemId } = data;
    const userId = socket.userId;
    
    const gameState = await gameService.submitVote(roomId, userId, problemId);
    
    io.to(roomId).emit('vote-update', {
      votes: Object.keys(gameState.votes).length,
      total: gameState.participants.length
    });
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});

socket.on('solution-attempt', async (data) => {
  try {
    const { roomId, solved } = data;
    const userId = socket.userId;
    
    const gameState = await gameService.submitSolution(roomId, userId, solved);
    
    if (solved) {
      io.to(roomId).emit('player-solved', {
        userId,
        username: gameState.participants.find(p => p.userId === userId).username,
        position: gameState.participants.filter(p => p.solved).length,
        timeElapsed: Math.floor((Date.now() - gameState.startTime) / 1000)
      });
    }
    
    if (gameState.status === 'finished') {
      const { eloChanges } = await gameService.endGame(roomId);
      io.to(roomId).emit('game-ended', { gameState, eloChanges });
    }
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});

socket.on('ready-check', async (data) => {
  try {
    const { roomId, ready } = data;
    const userId = socket.userId;
    
    await gameService.updatePlayerReady(roomId, userId, ready);
    
    const readyCount = await gameService.getReadyCount(roomId);
    io.to(roomId).emit('ready-update', readyCount);
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});
```

### 4. Chrome Extension Updates

#### Content Script Enhancement (`/extension/content.js`)

```javascript
// Problem Detection and Submission Tracking
class QuantGuideIntegration {
  constructor() {
    this.currentProblem = null;
    this.isMonitoring = false;
    this.submissionObserver = null;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.detectCurrentProblem();
    this.watchForSubmissions();
  }

  detectCurrentProblem() {
    // Extract problem info from QuantGuide page
    const problemTitle = document.querySelector('.problem-title')?.textContent;
    const problemId = window.location.pathname.match(/\/problems\/([^\/]+)/)?.[1];
    const difficulty = document.querySelector('.difficulty-badge')?.textContent;
    
    if (problemId && problemTitle) {
      this.currentProblem = {
        id: problemId,
        title: problemTitle,
        difficulty: difficulty || 'Medium',
        url: window.location.href
      };
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: 'problem-detected',
        problem: this.currentProblem
      });
    }
  }

  watchForSubmissions() {
    // Monitor for submission results
    const resultsContainer = document.querySelector('.submission-results');
    if (!resultsContainer) return;

    this.submissionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          this.checkSubmissionResult();
        }
      }
    });

    this.submissionObserver.observe(resultsContainer, {
      childList: true,
      subtree: true
    });
  }

  checkSubmissionResult() {
    const resultElement = document.querySelector('.submission-status');
    if (!resultElement) return;

    const status = resultElement.textContent.toLowerCase();
    const isAccepted = status.includes('accepted') || status.includes('correct');
    
    chrome.runtime.sendMessage({
      type: 'submission-result',
      result: {
        problemId: this.currentProblem?.id,
        solved: isAccepted,
        timestamp: Date.now()
      }
    });
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.submissionObserver) {
      this.submissionObserver.disconnect();
      this.submissionObserver = null;
    }
  }
}

// Initialize on QuantGuide problem pages
if (window.location.hostname === 'quantguide.io' && window.location.pathname.includes('/problems/')) {
  const integration = new QuantGuideIntegration();
  integration.startMonitoring();
}
```

#### Background Script Game Management (`/extension/background.js`)

```javascript
// Add game state management
let activeGame = null;
let gameSocket = null;

// Handle game-related messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'problem-detected':
      if (activeGame && activeGame.status === 'playing') {
        // Verify it's the correct problem
        if (request.problem.id === activeGame.currentProblem.id) {
          console.log('Player on correct problem page');
        }
      }
      break;
      
    case 'submission-result':
      if (activeGame && request.result.solved) {
        // Notify server of successful solution
        gameSocket.emit('solution-attempt', {
          roomId: activeGame.roomId,
          solved: true
        });
      }
      break;
  }
});

// WebSocket game events
function setupGameEvents(socket) {
  gameSocket = socket;
  
  socket.on('game-started', (data) => {
    activeGame = data.gameState;
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'game-started',
          game: activeGame
        });
      });
    });
  });
  
  socket.on('voting-phase', (data) => {
    // Show problem options in extension popup
    chrome.runtime.sendMessage({
      type: 'show-voting',
      problems: data.problems
    });
  });
  
  socket.on('game-problem-selected', (data) => {
    activeGame.currentProblem = data.problem;
    activeGame.status = 'playing';
    
    // Open problem in new tab
    chrome.tabs.create({
      url: data.problem.url,
      active: true
    });
  });
  
  socket.on('game-ended', (data) => {
    activeGame = null;
    // Show results
    chrome.runtime.sendMessage({
      type: 'show-results',
      results: data
    });
  });
}
```

### 5. Quick Match Implementation

#### Matchmaking Service (`/server/services/matchmakingService.js`)

```javascript
class MatchmakingService {
  constructor() {
    this.queue = new Map(); // elo range -> waiting users
    this.userToRoom = new Map(); // userId -> matchmaking data
  }

  async joinQueue(userId, userElo) {
    // Remove from any existing queue
    this.leaveQueue(userId);
    
    // Find appropriate ELO bracket (±200)
    const bracket = Math.floor(userElo / 200) * 200;
    
    if (!this.queue.has(bracket)) {
      this.queue.set(bracket, []);
    }
    
    const matchData = {
      userId,
      elo: userElo,
      joinedAt: Date.now(),
      bracket
    };
    
    this.queue.get(bracket).push(matchData);
    this.userToRoom.set(userId, matchData);
    
    // Try to create match
    await this.tryCreateMatch(bracket);
    
    return { status: 'queued', bracket };
  }

  async tryCreateMatch(bracket) {
    const waitingUsers = this.queue.get(bracket) || [];
    
    // Also check adjacent brackets (±200 ELO)
    const adjacentBrackets = [bracket - 200, bracket + 200];
    for (const adjBracket of adjacentBrackets) {
      const adjUsers = this.queue.get(adjBracket) || [];
      waitingUsers.push(...adjUsers);
    }
    
    // Need at least 2 players
    if (waitingUsers.length < 2) return null;
    
    // Sort by wait time (FIFO within ELO range)
    waitingUsers.sort((a, b) => a.joinedAt - b.joinedAt);
    
    // Take up to 8 players
    const matchedUsers = waitingUsers.slice(0, Math.min(8, waitingUsers.length));
    
    // Create room
    const room = await this.createQuickMatchRoom(matchedUsers);
    
    // Remove from queue
    matchedUsers.forEach(user => {
      this.leaveQueue(user.userId);
    });
    
    return room;
  }

  async createQuickMatchRoom(users) {
    const avgElo = Math.round(users.reduce((sum, u) => sum + u.elo, 0) / users.length);
    
    const room = await db('rooms').insert({
      name: `Quick Match (${avgElo} ELO)`,
      creator_id: users[0].userId,
      max_players: 8,
      current_players: users.length,
      elo_min: avgElo - 200,
      elo_max: avgElo + 200,
      status: 'waiting',
      difficulty: this.getDifficultyForElo(avgElo),
      is_quick_match: true
    }).returning('*');
    
    // Add all players
    for (const user of users) {
      await db('room_participants').insert({
        room_id: room[0].room_id,
        user_id: user.userId,
        joined_at: db.fn.now()
      });
    }
    
    return room[0];
  }

  getDifficultyForElo(elo) {
    if (elo < 1000) return 'Easy';
    if (elo < 1500) return 'Medium';
    return 'Hard';
  }

  leaveQueue(userId) {
    const matchData = this.userToRoom.get(userId);
    if (!matchData) return;
    
    const bracketQueue = this.queue.get(matchData.bracket);
    if (bracketQueue) {
      const index = bracketQueue.findIndex(u => u.userId === userId);
      if (index !== -1) {
        bracketQueue.splice(index, 1);
      }
    }
    
    this.userToRoom.delete(userId);
  }
}
```

### 6. API Endpoints Update

#### Game Endpoints (`/server/routes/games.js`)

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const gameService = require('../services/gameService');
const matchmakingService = require('../services/matchmakingService');

// Start quick match
router.post('/quick-match', authenticate, async (req, res) => {
  try {
    const user = await db('users')
      .where({ user_id: req.user.userId })
      .first();
    
    const result = await matchmakingService.joinQueue(user.user_id, user.elo_rating);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Leave matchmaking queue
router.delete('/quick-match', authenticate, async (req, res) => {
  try {
    matchmakingService.leaveQueue(req.user.userId);
    
    res.json({
      success: true,
      message: 'Left matchmaking queue'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get game history
router.get('/history', authenticate, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const games = await db('games as g')
      .join('game_participants as gp', 'g.game_id', 'gp.game_id')
      .where('gp.user_id', req.user.userId)
      .orderBy('g.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select([
        'g.*',
        'gp.points_earned',
        'gp.final_position',
        'gp.elo_change',
        'gp.solved',
        'gp.solve_time'
      ]);
    
    res.json({
      success: true,
      data: games
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 100, timeframe = 'all' } = req.query;
    
    let query = db('users')
      .where('games_played', '>', 0)
      .orderBy('elo_rating', 'desc')
      .limit(limit)
      .select([
        'username',
        'elo_rating',
        'games_played',
        'total_wins',
        db.raw('ROUND(CAST(total_wins AS DECIMAL) / NULLIF(games_played, 0) * 100, 2) as win_rate')
      ]);
    
    if (timeframe === 'weekly') {
      query = query.where('last_active', '>', db.raw("NOW() - INTERVAL '7 days'"));
    } else if (timeframe === 'monthly') {
      query = query.where('last_active', '>', db.raw("NOW() - INTERVAL '30 days'"));
    }
    
    const leaderboard = await query;
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### 7. UI Updates for Game Features

#### Popup Game UI (`/extension/popup.html` additions)

```html
<!-- Game Control Panel -->
<div id="gameControlView" class="view" style="display: none;">
  <div class="game-header">
    <h3>Game in Progress</h3>
    <div class="timer" id="gameTimer">00:00</div>
  </div>
  
  <!-- Voting Phase -->
  <div id="votingPhase" class="game-phase">
    <h4>Vote for Problem</h4>
    <div class="voting-timer">Time left: <span id="votingTimer">30</span>s</div>
    <div id="problemOptions" class="problem-list">
      <!-- Problem options will be inserted here -->
    </div>
  </div>
  
  <!-- Playing Phase -->
  <div id="playingPhase" class="game-phase" style="display: none;">
    <div class="current-problem">
      <h4 id="problemTitle"></h4>
      <span class="difficulty-badge" id="problemDifficulty"></span>
    </div>
    
    <div class="players-progress">
      <h5>Players</h5>
      <div id="gamePlayersList" class="players-list">
        <!-- Player progress will be shown here -->
      </div>
    </div>
    
    <button id="openProblemBtn" class="btn btn-primary">
      Open Problem
    </button>
  </div>
  
  <!-- Results Phase -->
  <div id="resultsPhase" class="game-phase" style="display: none;">
    <h4>Game Results</h4>
    <div id="gameResults" class="results-list">
      <!-- Results will be shown here -->
    </div>
    <button id="backToRoomBtn" class="btn btn-secondary">
      Back to Room
    </button>
  </div>
</div>

<!-- Quick Match Button -->
<button id="quickMatchBtn" class="btn btn-primary btn-large">
  <span class="icon">⚡</span>
  Quick Match
</button>

<!-- Leaderboard View -->
<div id="leaderboardView" class="view" style="display: none;">
  <div class="leaderboard-header">
    <h3>Global Leaderboard</h3>
    <div class="timeframe-selector">
      <button class="timeframe-btn active" data-timeframe="all">All Time</button>
      <button class="timeframe-btn" data-timeframe="monthly">Monthly</button>
      <button class="timeframe-btn" data-timeframe="weekly">Weekly</button>
    </div>
  </div>
  
  <div id="leaderboardList" class="leaderboard-list">
    <!-- Leaderboard entries will be inserted here -->
  </div>
</div>
```

### 8. Testing Strategy

#### Unit Tests
- Game state transitions
- ELO calculation accuracy
- Scoring system validation
- Matchmaking logic

#### Integration Tests
- Full game flow (start → vote → play → end)
- Multi-player synchronization
- Problem detection on QuantGuide
- Quick match queue behavior

#### Load Tests
- 100+ concurrent games
- 1000+ users in matchmaking
- WebSocket message throughput

### 9. Deployment Considerations

#### Performance Optimizations
- Redis for game state caching
- Database query optimization
- WebSocket connection pooling
- CDN for static assets

#### Monitoring
- Game completion rates
- Average game duration
- Matchmaking wait times
- ELO distribution analytics

### 10. Future Enhancements (Phase 4+)

- **Tournaments**: Scheduled competitions with brackets
- **Team Mode**: 2v2 or 4v4 team competitions  
- **Practice Mode**: Solo practice with no ELO impact
- **Spectator Mode**: Watch ongoing games
- **Replay System**: Review past games
- **Achievement System**: Badges and milestones
- **Chat System**: In-game and room chat
- **Voice Chat**: WebRTC integration

## Implementation Timeline

### Week 1: Core Game Logic
- Database migrations
- Game state management
- Basic game flow

### Week 2: Problem Integration
- QuantGuide problem detection
- Submission tracking
- Problem voting system

### Week 3: Scoring & ELO
- Implement scoring algorithm
- ELO calculation system
- Leaderboard API

### Week 4: Matchmaking
- Quick match queue
- Matchmaking algorithm
- Queue UI

### Week 5: Polish & Testing
- UI improvements
- Bug fixes
- Load testing
- Documentation

## Success Metrics

- **Game Completion Rate**: >80% of started games finish
- **Average Game Duration**: 10-15 minutes
- **Matchmaking Time**: <30 seconds average
- **User Retention**: 40% weekly active users
- **Fair Matches**: 90% of games within ±200 ELO range