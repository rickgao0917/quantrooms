const roomService = require('../services/roomService');
const { socketAuth } = require('../middleware/auth');
const { createSocketLimiter } = require('../middleware/security');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.userSocketMap = new Map(); // Map socket.id to user info
    this.userRoomMap = new Map(); // Map userId to roomId
    
    // Apply authentication middleware
    this.io.use(socketAuth);
    
    // Create rate limiters for different events
    this.rateLimiters = {
      createRoom: createSocketLimiter('create-room', 3, 60000), // 3 per minute
      joinRoom: createSocketLimiter('join-room', 10, 60000), // 10 per minute
      message: createSocketLimiter('message', 30, 10000), // 30 per 10 seconds
    };
  }

  initialize() {
    this.io.on('connection', async (socket) => {
      console.log('New authenticated client connected:', socket.id, 'User:', socket.user.username);
      
      // Store user info
      this.userSocketMap.set(socket.id, {
        userId: socket.user.userId,
        username: socket.user.username,
        elo: socket.user.elo
      });
      
      // Check if user is already in a room
      const currentRoomId = await roomService.getUserCurrentRoom(socket.user.userId);
      if (currentRoomId) {
        socket.join(currentRoomId);
        this.userRoomMap.set(socket.user.userId, currentRoomId);
        
        // Send current room info
        const room = await roomService.getRoom(currentRoomId);
        socket.emit('current-room', room);
      }
      
      // Send initial room list
      const rooms = await roomService.getAllRooms();
      socket.emit('room-list', rooms);
      
      // Set up event handlers
      socket.on('create-room', (data) => this.handleCreateRoom(socket, data));
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave-room', () => this.handleLeaveRoom(socket));
      socket.on('get-rooms', () => this.handleGetRooms(socket));
      socket.on('disconnect', () => this.handleDisconnect(socket));
      
      // Game-related events (for future implementation)
      socket.on('ready', () => this.handlePlayerReady(socket));
      socket.on('submit-solution', (data) => this.handleSubmitSolution(socket, data));
      socket.on('vote-problem', (data) => this.handleVoteProblem(socket, data));
      
      // Chat events
      socket.on('send-message', (data) => this.handleSendMessage(socket, data));
    });
    
    // Start periodic cleanup
    this.startCleanupInterval();
  }

  async handleCreateRoom(socket, data) {
    try {
      // Rate limiting
      await new Promise((resolve, reject) => {
        this.rateLimiters.createRoom(socket, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Check if user is already in a room
      const currentRoomId = this.userRoomMap.get(socket.user.userId);
      if (currentRoomId) {
        socket.emit('error', { 
          message: 'You must leave your current room before creating a new one',
          code: 'ALREADY_IN_ROOM'
        });
        return;
      }
      
      // Create room
      const room = await roomService.createRoom(socket.user.userId, data);
      
      // Join socket room
      socket.join(room.room_id);
      this.userRoomMap.set(socket.user.userId, room.room_id);
      
      // Send confirmation
      socket.emit('room-created', {
        success: true,
        room
      });
      
      // Broadcast updated room list
      const rooms = await roomService.getAllRooms();
      this.io.emit('room-list', rooms);
      
      console.log(`Room created: ${room.room_id} by ${socket.user.username}`);
    } catch (error) {
      console.error('Create room error:', error);
      socket.emit('error', { 
        message: error.message || 'Failed to create room',
        code: 'CREATE_ROOM_ERROR'
      });
    }
  }

  async handleJoinRoom(socket, data) {
    try {
      // Rate limiting
      await new Promise((resolve, reject) => {
        this.rateLimiters.joinRoom(socket, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const { roomId } = data;
      
      if (!roomId) {
        socket.emit('error', { 
          message: 'Room ID is required',
          code: 'INVALID_REQUEST'
        });
        return;
      }
      
      // Check if user is already in a room
      const currentRoomId = this.userRoomMap.get(socket.user.userId);
      if (currentRoomId) {
        socket.emit('error', { 
          message: 'You must leave your current room before joining another',
          code: 'ALREADY_IN_ROOM'
        });
        return;
      }
      
      // Join room
      const room = await roomService.joinRoom(roomId, socket.user.userId);
      
      // Join socket room
      socket.join(roomId);
      this.userRoomMap.set(socket.user.userId, roomId);
      
      // Send confirmation
      socket.emit('room-joined', {
        success: true,
        room
      });
      
      // Notify other players
      socket.to(roomId).emit('player-joined', {
        player: {
          id: socket.user.userId,
          name: socket.user.username,
          elo: socket.user.elo,
          joinedAt: new Date()
        }
      });
      
      // Broadcast updated room list
      const rooms = await roomService.getAllRooms();
      this.io.emit('room-list', rooms);
      
      console.log(`${socket.user.username} joined room ${roomId}`);
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { 
        message: error.message || 'Failed to join room',
        code: 'JOIN_ROOM_ERROR'
      });
    }
  }

  async handleLeaveRoom(socket) {
    try {
      const roomId = this.userRoomMap.get(socket.user.userId);
      
      if (!roomId) {
        socket.emit('error', { 
          message: 'You are not in any room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }
      
      // Leave room
      const updatedRoom = await roomService.leaveRoom(roomId, socket.user.userId);
      
      // Leave socket room
      socket.leave(roomId);
      this.userRoomMap.delete(socket.user.userId);
      
      // Send confirmation
      socket.emit('room-left', {
        success: true
      });
      
      // Notify other players if room still exists
      if (updatedRoom) {
        socket.to(roomId).emit('player-left', {
          playerId: socket.user.userId,
          room: updatedRoom
        });
      }
      
      // Broadcast updated room list
      const rooms = await roomService.getAllRooms();
      this.io.emit('room-list', rooms);
      
      console.log(`${socket.user.username} left room ${roomId}`);
    } catch (error) {
      console.error('Leave room error:', error);
      socket.emit('error', { 
        message: error.message || 'Failed to leave room',
        code: 'LEAVE_ROOM_ERROR'
      });
    }
  }

  async handleGetRooms(socket) {
    try {
      const rooms = await roomService.getAllRooms();
      socket.emit('room-list', rooms);
    } catch (error) {
      console.error('Get rooms error:', error);
      socket.emit('error', { 
        message: 'Failed to fetch rooms',
        code: 'GET_ROOMS_ERROR'
      });
    }
  }

  async handleDisconnect(socket) {
    console.log('Client disconnected:', socket.id, 'User:', socket.user?.username);
    
    // Clean up user from maps
    this.userSocketMap.delete(socket.id);
    
    // Handle leave room on disconnect
    if (socket.user) {
      await this.handleLeaveRoom(socket);
    }
  }

  async handleSendMessage(socket, data) {
    try {
      // Rate limiting
      await new Promise((resolve, reject) => {
        this.rateLimiters.message(socket, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const roomId = this.userRoomMap.get(socket.user.userId);
      
      if (!roomId) {
        socket.emit('error', { 
          message: 'You are not in any room',
          code: 'NOT_IN_ROOM'
        });
        return;
      }
      
      const { message } = data;
      
      if (!message || message.trim().length === 0) {
        return;
      }
      
      // Sanitize message
      const sanitizedMessage = message.trim().substring(0, 500);
      
      // Broadcast message to room
      this.io.to(roomId).emit('new-message', {
        userId: socket.user.userId,
        username: socket.user.username,
        message: sanitizedMessage,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { 
        message: 'Failed to send message',
        code: 'MESSAGE_ERROR'
      });
    }
  }

  // Placeholder methods for future game logic
  async handlePlayerReady(socket) {
    // TODO: Implement when game logic is added
    console.log(`Player ${socket.user.username} is ready`);
  }

  async handleSubmitSolution(socket, data) {
    // TODO: Implement when game logic is added
    console.log(`Player ${socket.user.username} submitted solution`);
  }

  async handleVoteProblem(socket, data) {
    // TODO: Implement when voting system is added
    console.log(`Player ${socket.user.username} voted for problem`);
  }

  // Start periodic cleanup interval
  startCleanupInterval() {
    // Run cleanup every 5 minutes
    setInterval(async () => {
      try {
        await roomService.cleanupRooms();
      } catch (error) {
        console.error('Room cleanup error:', error);
      }
    }, 5 * 60 * 1000);
  }
}

module.exports = SocketHandler;