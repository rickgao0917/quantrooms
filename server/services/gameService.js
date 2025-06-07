const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

class GameService {
  constructor() {
    this.activeGames = new Map(); // roomId -> GameState
    this.GAME_DURATION = 15 * 60 * 1000; // 15 minutes max per problem
    this.VOTING_DURATION = 30 * 1000; // 30 seconds for voting
  }

  // Start a new game for a room
  async startGame(roomId, creatorId) {
    try {
      // Get room details with participants
      const room = await db('rooms')
        .where({ room_id: roomId })
        .first();
      
      if (!room) {
        throw new Error('Room not found');
      }
      
      if (room.creator_id !== creatorId) {
        throw new Error('Only room creator can start the game');
      }
      
      // Get all participants
      const participants = await db('room_participants as rp')
        .join('users as u', 'rp.user_id', 'u.user_id')
        .where('rp.room_id', roomId)
        .select([
          'u.user_id',
          'u.username',
          'u.elo_rating'
        ]);
      
      if (participants.length < 2) {
        throw new Error('Need at least 2 players to start');
      }
      
      // Create game record
      const gameId = uuidv4();
      const gameState = {
        gameId,
        roomId,
        status: 'waiting_for_ready', // waiting_for_ready -> voting -> playing -> finished
        participants: participants.map(p => ({
          userId: p.user_id,
          username: p.username,
          elo: p.elo_rating,
          ready: false,
          quantguideLoggedIn: false,
          solved: false,
          solveTime: null,
          points: 0,
          position: null
        })),
        votingRound: 1,
        problemOptions: [],
        votes: {},
        currentProblem: null,
        startTime: null,
        endTime: null,
        votingEndTime: null
      };
      
      // Store in memory
      this.activeGames.set(roomId, gameState);
      
      // Update room status
      await db('rooms')
        .where({ room_id: roomId })
        .update({
          status: 'in_game',
          game_state: JSON.stringify(gameState),
          updated_at: db.fn.now()
        });
      
      // Create game record in database
      await db('games').insert({
        game_id: gameId,
        room_id: roomId,
        participants: JSON.stringify(participants),
        start_time: db.fn.now(),
        status: 'waiting_for_ready'
      });
      
      return gameState;
    } catch (error) {
      console.error('Error starting game:', error);
      throw error;
    }
  }

  // Update player ready status and QuantGuide login status
  async updatePlayerReady(roomId, userId, ready, quantguideLoggedIn) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState || gameState.status !== 'waiting_for_ready') {
      throw new Error('Game not in ready check phase');
    }
    
    const participant = gameState.participants.find(p => p.userId === userId);
    if (!participant) {
      throw new Error('Player not in game');
    }
    
    participant.ready = ready;
    participant.quantguideLoggedIn = quantguideLoggedIn;
    
    // Check if all players are ready and logged in
    const allReady = gameState.participants.every(p => p.ready && p.quantguideLoggedIn);
    
    if (allReady && gameState.participants.length >= 2) {
      // Move to voting phase
      gameState.status = 'voting';
      gameState.votingEndTime = Date.now() + this.VOTING_DURATION;
      
      // Get random problems for voting
      gameState.problemOptions = await this.getRandomProblems(5, 'Medium'); // TODO: Use room difficulty
    }
    
    return {
      gameState,
      allReady,
      readyCount: gameState.participants.filter(p => p.ready && p.quantguideLoggedIn).length
    };
  }

  // Get random problems for voting
  async getRandomProblems(count, difficulty) {
    // For now, return mock problems
    // TODO: Integrate with actual problem database or QuantGuide API
    const mockProblems = [
      { id: 'option-pricing', title: 'Option Pricing Model', difficulty: 'Medium', url: 'https://quantguide.io/problems/option-pricing' },
      { id: 'portfolio-optimization', title: 'Portfolio Optimization', difficulty: 'Medium', url: 'https://quantguide.io/problems/portfolio-optimization' },
      { id: 'risk-calculation', title: 'Risk Calculation', difficulty: 'Medium', url: 'https://quantguide.io/problems/risk-calculation' },
      { id: 'monte-carlo', title: 'Monte Carlo Simulation', difficulty: 'Medium', url: 'https://quantguide.io/problems/monte-carlo' },
      { id: 'black-scholes', title: 'Black-Scholes Formula', difficulty: 'Medium', url: 'https://quantguide.io/problems/black-scholes' }
    ];
    
    return mockProblems.slice(0, count);
  }

  // Submit vote for problem
  async submitVote(roomId, userId, problemId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState || gameState.status !== 'voting') {
      throw new Error('Not in voting phase');
    }
    
    // Verify problem is in options
    const validProblem = gameState.problemOptions.some(p => p.id === problemId);
    if (!validProblem) {
      throw new Error('Invalid problem selection');
    }
    
    gameState.votes[userId] = problemId;
    
    // Check if all players voted
    const allVoted = gameState.participants.every(p => gameState.votes[p.userId]);
    
    if (allVoted) {
      await this.selectProblemAndStart(roomId);
    }
    
    return {
      votesCount: Object.keys(gameState.votes).length,
      totalPlayers: gameState.participants.length,
      allVoted
    };
  }

  // Select problem based on votes and start game
  async selectProblemAndStart(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return;
    
    // Count votes
    const voteCounts = {};
    for (const problemId of Object.values(gameState.votes)) {
      voteCounts[problemId] = (voteCounts[problemId] || 0) + 1;
    }
    
    // Find problem with most votes (random tiebreaker)
    let maxVotes = 0;
    let winners = [];
    
    for (const [problemId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        winners = [problemId];
      } else if (count === maxVotes) {
        winners.push(problemId);
      }
    }
    
    // Random selection from winners
    const selectedProblemId = winners[Math.floor(Math.random() * winners.length)];
    const selectedProblem = gameState.problemOptions.find(p => p.id === selectedProblemId);
    
    // Start game
    gameState.status = 'playing';
    gameState.currentProblem = selectedProblem;
    gameState.startTime = Date.now();
    gameState.endTime = Date.now() + this.GAME_DURATION;
    
    // Update database
    await db('games')
      .where({ game_id: gameState.gameId })
      .update({
        problem_id: selectedProblem.id,
        status: 'playing',
        game_started_at: db.fn.now()
      });
    
    return gameState;
  }

  // Submit solution attempt
  async submitSolution(roomId, userId, solved) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState || gameState.status !== 'playing') {
      throw new Error('Game not in progress');
    }
    
    const participant = gameState.participants.find(p => p.userId === userId);
    if (!participant || participant.solved) {
      return { alreadySolved: true };
    }
    
    participant.solved = solved;
    
    if (solved) {
      participant.solveTime = Date.now() - gameState.startTime;
      
      // Calculate position
      const solvedCount = gameState.participants.filter(p => p.solved).length;
      participant.position = solvedCount;
      
      // Calculate points using exponential decay
      participant.points = Math.floor(1000 * Math.pow(0.8, solvedCount - 1));
      
      // Check if game should end (all players solved or time up)
      const allSolved = gameState.participants.every(p => p.solved);
      const timeUp = Date.now() >= gameState.endTime;
      
      if (allSolved || timeUp) {
        return await this.endGame(roomId);
      }
    }
    
    return {
      gameState,
      participant: {
        username: participant.username,
        solved: participant.solved,
        position: participant.position,
        points: participant.points,
        solveTime: participant.solveTime
      }
    };
  }

  // End the game and calculate results
  async endGame(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return;
    
    gameState.status = 'finished';
    gameState.endTime = Date.now();
    
    // Assign positions to unsolved players
    let nextPosition = gameState.participants.filter(p => p.solved).length + 1;
    for (const participant of gameState.participants) {
      if (!participant.solved) {
        participant.position = nextPosition++;
        participant.points = 0;
      }
    }
    
    // Sort participants by position
    const sortedParticipants = [...gameState.participants]
      .sort((a, b) => a.position - b.position);
    
    // Calculate ELO changes
    const eloChanges = this.calculateEloChanges(sortedParticipants);
    
    // Update database
    await this.saveGameResults(gameState, eloChanges);
    
    // Clean up
    this.activeGames.delete(roomId);
    
    // Update room status
    await db('rooms')
      .where({ room_id: roomId })
      .update({
        status: 'waiting',
        game_state: null,
        updated_at: db.fn.now()
      });
    
    return {
      gameState,
      eloChanges,
      winner: sortedParticipants[0]
    };
  }

  // Calculate ELO changes using the Elo rating system
  calculateEloChanges(participants) {
    const K = 32; // K-factor
    const changes = {};
    
    for (let i = 0; i < participants.length; i++) {
      const player = participants[i];
      let totalChange = 0;
      
      // Calculate change against each opponent
      for (let j = 0; j < participants.length; j++) {
        if (i === j) continue;
        
        const opponent = participants[j];
        
        // Expected score calculation
        const expectedScore = 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
        
        // Actual score: 1 if player ranked higher, 0 otherwise
        const actualScore = player.position < opponent.position ? 1 : 0;
        
        // ELO change for this matchup
        totalChange += K * (actualScore - expectedScore);
      }
      
      // Average the change over number of opponents
      changes[player.userId] = Math.round(totalChange / (participants.length - 1));
    }
    
    return changes;
  }

  // Save game results to database
  async saveGameResults(gameState, eloChanges) {
    const trx = await db.transaction();
    
    try {
      // Update game record
      await trx('games')
        .where({ game_id: gameState.gameId })
        .update({
          end_time: db.fn.now(),
          status: 'finished',
          winner_id: gameState.participants.find(p => p.position === 1)?.userId,
          final_scores: JSON.stringify(gameState.participants.map(p => ({
            userId: p.userId,
            username: p.username,
            position: p.position,
            points: p.points,
            solveTime: p.solveTime,
            eloChange: eloChanges[p.userId]
          })))
        });
      
      // Insert game participant records
      for (const participant of gameState.participants) {
        await trx('game_participants').insert({
          game_id: gameState.gameId,
          user_id: participant.userId,
          start_time: new Date(gameState.startTime),
          end_time: participant.solved ? new Date(gameState.startTime + participant.solveTime) : null,
          solved: participant.solved,
          solve_time: participant.solved ? Math.floor(participant.solveTime / 1000) : null,
          points_earned: participant.points,
          final_position: participant.position,
          elo_change: eloChanges[participant.userId]
        });
      }
      
      // Update user statistics
      for (const participant of gameState.participants) {
        const eloChange = eloChanges[participant.userId];
        const isWinner = participant.position === 1;
        
        await trx('users')
          .where({ user_id: participant.userId })
          .increment({
            elo_rating: eloChange,
            games_played: 1,
            total_wins: isWinner ? 1 : 0,
            total_points: participant.points
          })
          .update({
            last_active: db.fn.now()
          });
      }
      
      await trx.commit();
    } catch (error) {
      await trx.rollback();
      console.error('Error saving game results:', error);
      throw error;
    }
  }

  // Get active game state
  getGameState(roomId) {
    return this.activeGames.get(roomId);
  }

  // Check if game should timeout
  async checkGameTimeout(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return;
    
    const now = Date.now();
    
    // Check voting timeout
    if (gameState.status === 'voting' && now >= gameState.votingEndTime) {
      // Force select problem with current votes
      await this.selectProblemAndStart(roomId);
      return true;
    }
    
    // Check game timeout
    if (gameState.status === 'playing' && now >= gameState.endTime) {
      await this.endGame(roomId);
      return true;
    }
    
    return false;
  }
}

module.exports = new GameService();