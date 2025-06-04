const express = require('express');
const router = express.Router();

// This will be populated by the main server when it creates the SocketHandler
let socketHandler = null;

// Set the socket handler reference
function setSocketHandler(handler) {
  socketHandler = handler;
}

// Get all rooms
router.get('/rooms', (req, res) => {
  try {
    if (!socketHandler) {
      return res.status(500).json({ error: 'Socket handler not initialized' });
    }

    const rooms = Array.from(socketHandler.rooms.values()).map(room => 
      socketHandler.sanitizeRoom(room)
    );

    res.json({ rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Create a new room (for REST API clients)
router.post('/rooms', (req, res) => {
  try {
    const { roomName, maxPlayers = 8, difficulty = 'Medium' } = req.body;
    
    if (!roomName || roomName.trim().length === 0) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    if (!socketHandler) {
      return res.status(500).json({ error: 'Socket handler not initialized' });
    }

    // For now, create a temporary user ID for REST API calls
    // In a real implementation, this would use proper authentication
    const tempUserId = 'rest_user_' + Date.now();
    
    // Note: This is a simplified implementation
    // Real implementation would integrate with WebSocket properly
    res.status(501).json({ 
      error: 'Room creation via REST API not implemented yet',
      message: 'Please use WebSocket connection for room operations'
    });

  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join a room (for REST API clients)
router.post('/rooms/:roomId/join', (req, res) => {
  try {
    const { roomId } = req.params;
    
    if (!socketHandler) {
      return res.status(500).json({ error: 'Socket handler not initialized' });
    }

    // Similar to room creation, this would need proper WebSocket integration
    res.status(501).json({ 
      error: 'Room joining via REST API not implemented yet',
      message: 'Please use WebSocket connection for room operations'
    });

  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

module.exports = { router, setSocketHandler };