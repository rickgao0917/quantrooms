const { v4: uuidv4 } = require('uuid');

// In-memory storage for rooms
const rooms = new Map();
const userSocketMap = new Map();

class SocketHandler {
  constructor(io) {
    this.io = io;
  }

  initialize() {
    this.io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);
      
      // Send initial room list to new client
      socket.emit('room-list', this.getRoomList());
      
      // Handle room creation
      socket.on('create-room', (data) => this.handleCreateRoom(socket, data));
      
      // Handle room joining
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      
      // Handle room leaving
      socket.on('leave-room', () => this.handleLeaveRoom(socket));
      
      // Handle disconnection
      socket.on('disconnect', () => this.handleDisconnect(socket));
      
      // Handle get room list request
      socket.on('get-rooms', () => {
        socket.emit('room-list', this.getRoomList());
      });
    });
  }

  handleCreateRoom(socket, data) {
    const { roomName, userId, maxPlayers = 8 } = data;
    
    if (!roomName || !userId) {
      socket.emit('error', { message: 'Room name and user ID are required' });
      return;
    }
    
    const roomId = `room_${uuidv4()}`;
    const room = {
      id: roomId,
      name: roomName,
      creator: userId,
      players: [{
        id: userId,
        socketId: socket.id,
        joinedAt: Date.now()
      }],
      maxPlayers: Math.min(Math.max(2, maxPlayers), 8), // Ensure 2-8 players
      status: 'waiting',
      createdAt: Date.now()
    };
    
    rooms.set(roomId, room);
    userSocketMap.set(socket.id, { roomId, userId });
    
    // Join socket room
    socket.join(roomId);
    
    // Send confirmation to creator
    socket.emit('room-created', {
      room: room,
      success: true
    });
    
    // Broadcast updated room list to all clients
    this.io.emit('room-list', this.getRoomList());
    
    console.log(`Room created: ${roomId} by user ${userId}`);
  }

  handleJoinRoom(socket, data) {
    const { roomId, userId } = data;
    
    if (!roomId || !userId) {
      socket.emit('error', { message: 'Room ID and user ID are required' });
      return;
    }
    
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    // Check if user is already in the room
    const existingPlayer = room.players.find(p => p.id === userId);
    if (existingPlayer) {
      socket.emit('error', { message: 'You are already in this room' });
      return;
    }
    
    // Add player to room
    room.players.push({
      id: userId,
      socketId: socket.id,
      joinedAt: Date.now()
    });
    
    userSocketMap.set(socket.id, { roomId, userId });
    
    // Join socket room
    socket.join(roomId);
    
    // Send confirmation to joiner
    socket.emit('room-joined', {
      room: room,
      success: true
    });
    
    // Notify all players in room
    this.io.to(roomId).emit('room-updated', room);
    
    // Broadcast updated room list to all clients
    this.io.emit('room-list', this.getRoomList());
    
    console.log(`User ${userId} joined room ${roomId}`);
  }

  handleLeaveRoom(socket) {
    const userInfo = userSocketMap.get(socket.id);
    
    if (!userInfo) {
      return;
    }
    
    const { roomId, userId } = userInfo;
    const room = rooms.get(roomId);
    
    if (!room) {
      return;
    }
    
    // Remove player from room
    room.players = room.players.filter(p => p.socketId !== socket.id);
    
    // Leave socket room
    socket.leave(roomId);
    
    // Remove from user map
    userSocketMap.delete(socket.id);
    
    // If room is empty, delete it
    if (room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      // If creator left, assign new creator
      if (room.creator === userId && room.players.length > 0) {
        room.creator = room.players[0].id;
      }
      
      // Notify remaining players
      this.io.to(roomId).emit('room-updated', room);
    }
    
    // Send confirmation to leaver
    socket.emit('room-left', { success: true });
    
    // Broadcast updated room list to all clients
    this.io.emit('room-list', this.getRoomList());
    
    console.log(`User ${userId} left room ${roomId}`);
  }

  handleDisconnect(socket) {
    console.log('Client disconnected:', socket.id);
    
    // Handle leave room on disconnect
    this.handleLeaveRoom(socket);
  }

  getRoomList() {
    const roomList = [];
    
    rooms.forEach((room) => {
      roomList.push({
        id: room.id,
        name: room.name,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        status: room.status,
        createdAt: room.createdAt
      });
    });
    
    return roomList;
  }

  // Cleanup old rooms (to be called periodically)
  cleanupOldRooms() {
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    rooms.forEach((room, roomId) => {
      if (room.players.length === 0 && (now - room.createdAt) > thirtyMinutes) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} cleaned up (inactive)`);
      }
    });
  }
}

module.exports = SocketHandler;