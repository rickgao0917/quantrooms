// QuantRooms Server
// Phase 1: Express + Socket.io implementation

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const { router: healthRouter } = require('./routes/health');
const { router: roomsRouter, setSocketHandler } = require('./routes/rooms');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = socketIo(server, {
  cors: {
    origin: [
      'chrome-extension://*',
      'http://localhost:*',
      'https://quantguide.io'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow Chrome extensions, localhost, and QuantGuide.io
    if (!origin || 
        origin.startsWith('chrome-extension://') || 
        origin.includes('localhost') ||
        origin.includes('quantguide.io')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Socket handler for room management
class SocketHandler {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> room data
    this.userRooms = new Map(); // userId -> roomId
  }

  handleConnection(socket) {
    console.log(`New client connected: ${socket.id}`);

    // User info stored on socket
    socket.userId = null;
    socket.currentRoom = null;

    // Handle room creation
    socket.on('create_room', (data) => {
      const { roomName, maxPlayers = 8, difficulty = 'Medium', userName } = data;
      
      if (!roomName || !userName) {
        socket.emit('error', { message: 'Room name and user name are required' });
        return;
      }

      // Generate room ID
      const roomId = this.generateRoomId();
      
      // Create room
      const room = {
        id: roomId,
        name: roomName,
        host: socket.id,
        players: [{
          id: socket.id,
          name: userName,
          isHost: true,
          joinedAt: new Date()
        }],
        maxPlayers,
        difficulty,
        createdAt: new Date(),
        status: 'waiting' // waiting, in_progress, completed
      };

      // Store room
      this.rooms.set(roomId, room);
      this.userRooms.set(socket.id, roomId);
      
      // Join socket.io room
      socket.join(roomId);
      socket.userId = socket.id;
      socket.currentRoom = roomId;

      // Emit success
      socket.emit('room_created', {
        room: this.sanitizeRoom(room),
        playerId: socket.id
      });

      // Broadcast room list update
      this.broadcastRoomList();
      
      console.log(`Room created: ${roomId} by ${userName}`);
    });

    // Handle room joining
    socket.on('join_room', (data) => {
      const { roomId, userName } = data;
      
      if (!roomId || !userName) {
        socket.emit('error', { message: 'Room ID and user name are required' });
        return;
      }

      const room = this.rooms.get(roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      if (room.status !== 'waiting') {
        socket.emit('error', { message: 'Room has already started' });
        return;
      }

      // Add player to room
      const player = {
        id: socket.id,
        name: userName,
        isHost: false,
        joinedAt: new Date()
      };

      room.players.push(player);
      this.userRooms.set(socket.id, roomId);
      
      // Join socket.io room
      socket.join(roomId);
      socket.userId = socket.id;
      socket.currentRoom = roomId;

      // Emit success to joining player
      socket.emit('room_joined', {
        room: this.sanitizeRoom(room),
        playerId: socket.id
      });

      // Notify other players
      socket.to(roomId).emit('player_joined', {
        player: player,
        room: this.sanitizeRoom(room)
      });

      // Broadcast room list update
      this.broadcastRoomList();
      
      console.log(`${userName} joined room: ${roomId}`);
    });

    // Handle leaving room
    socket.on('leave_room', () => {
      this.handleLeaveRoom(socket);
    });

    // Handle getting room list
    socket.on('get_rooms', () => {
      const rooms = Array.from(this.rooms.values()).map(room => 
        this.sanitizeRoom(room)
      );
      socket.emit('room_list', { rooms });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      this.handleLeaveRoom(socket);
    });
  }

  handleLeaveRoom(socket) {
    const roomId = this.userRooms.get(socket.id);
    
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    // Remove player from room
    room.players = room.players.filter(p => p.id !== socket.id);
    this.userRooms.delete(socket.id);

    // Leave socket.io room
    socket.leave(roomId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      // If host left, assign new host
      if (room.host === socket.id && room.players.length > 0) {
        room.host = room.players[0].id;
        room.players[0].isHost = true;
        
        // Notify new host
        this.io.to(room.host).emit('host_changed', {
          room: this.sanitizeRoom(room)
        });
      }

      // Notify other players
      socket.to(roomId).emit('player_left', {
        playerId: socket.id,
        room: this.sanitizeRoom(room)
      });
    }

    // Clear socket data
    socket.userId = null;
    socket.currentRoom = null;

    // Broadcast room list update
    this.broadcastRoomList();
  }

  broadcastRoomList() {
    const rooms = Array.from(this.rooms.values()).map(room => 
      this.sanitizeRoom(room)
    );
    this.io.emit('room_list_updated', { rooms });
  }

  sanitizeRoom(room) {
    // Return room data without sensitive information
    return {
      id: room.id,
      name: room.name,
      host: room.host,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost
      })),
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      difficulty: room.difficulty,
      status: room.status,
      createdAt: room.createdAt
    };
  }

  generateRoomId() {
    // Generate a 6-character room ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let i = 0; i < 6; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
  }
}

// Create socket handler instance
const socketHandler = new SocketHandler(io);
setSocketHandler(socketHandler);

// Socket.io connection handling
io.on('connection', (socket) => {
  socketHandler.handleConnection(socket);
});

// Routes
app.use('/api/health', healthRouter);
app.use('/api', roomsRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'QuantRooms Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      rooms: '/api/rooms',
      websocket: 'ws://localhost:3000'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`QuantRooms server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});

module.exports = { app, server, io };